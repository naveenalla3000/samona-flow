import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import {
  addDays,
  buildBuckets,
  type BucketGranularity,
} from "@/lib/dashboard-metrics";
import { prisma } from "@/server/database/connection";

/*
 * Business-scoped aggregation queries for the financial dashboard.
 *
 * Money columns are Decimal(12,2) in schema.prisma (major units), so every
 * amount is returned as a fixed 2-dp decimal string. Dates are DATE columns
 * and are passed/returned as YYYY-MM-DD strings; no timezone conversion.
 *
 * Every query filters by businessId. Business lookups use the business id
 * itself (Business is the tenant root).
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RECEIVABLE_LIMIT = 100;
const MAX_RECENT_LIMIT = 20;
const MAX_REMINDER_ROWS = 50;
const REMINDER_UPCOMING_DAYS = 6;
const DEFAULT_HORIZON_DAYS = 30;

const ISSUED_STATUSES = ["SENT", "PARTIALLY_PAID", "OVERDUE"] as const;

export interface MoneyTotal {
  count: number;
  amount: string;
}

export interface CurrencyAmount {
  currency: string;
  amount: string;
}

export interface CurrencyIssuedTotals {
  currency: string;
  invoiceCount: number;
  totalAmount: string;
  outstanding: string;
  overdueOutstanding: string;
}

export interface CurrencyInvoiceCount {
  currency: string;
  invoiceCount: number;
  totalAmount: string;
}

export interface CashWindowSums {
  payments: CurrencyAmount[];
  expenses: MoneyTotal;
}

export interface UpcomingAndOverdueExpenses {
  horizonEnd: string;
  upcoming: MoneyTotal;
  overdue: MoneyTotal;
}

export interface BucketRow {
  bucketStart: string;
  currency: string;
  collected: string;
  invoiced: string;
  expenses: string;
}

export interface ReceivableRow {
  id: string;
  invoiceNumber: string;
  customerName: string;
  currency: string;
  totalAmount: string;
  amountPaid: string;
  outstanding: string;
  dueDate: string;
  status: string;
  isOverdue: boolean;
}

export interface ReceivablePage {
  rows: ReceivableRow[];
  nextCursor: string | null;
}

export interface RecentInvoiceRow {
  id: string;
  invoiceNumber: string;
  customerName: string;
  status: string;
  currency: string;
  totalAmount: string;
  issueDate: string;
  dueDate: string;
}

export interface RecentPaymentRow {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  currency: string;
  amount: string;
  paymentDate: string;
}

export interface ReminderRow {
  id: string;
  reminderType: string;
  status: string;
  followUpDate: string;
  invoiceId: string | null;
  customerId: string | null;
}

export interface ReminderRows {
  overdue: ReminderRow[];
  upcoming: ReminderRow[];
  overdueCount: number;
  upcomingCount: number;
}

export interface OpeningBalance {
  currency: string;
  openingBalance: string;
  openingBalanceDate: string;
  timezone: string;
}

interface IssuedTotalsRaw {
  currency: string;
  invoice_count: number;
  total_amount: Prisma.Decimal;
  outstanding: Prisma.Decimal;
  overdue_outstanding: Prisma.Decimal;
}

interface CurrencyAmountRaw {
  currency: string;
  amount: Prisma.Decimal;
}

interface BucketRaw {
  bucket_start: string;
  currency: string;
  collected: Prisma.Decimal;
  invoiced: Prisma.Decimal;
  expenses: Prisma.Decimal;
}

interface ReceivableRaw {
  id: string;
  invoice_number: string;
  customer_name: string;
  currency: string;
  total_amount: Prisma.Decimal;
  amount_paid: Prisma.Decimal;
  outstanding: Prisma.Decimal;
  due_date: string;
  status: string;
  is_overdue: boolean;
  sort_rank: number;
}

function assertDate(value: string, label: string): string {
  if (!DATE_RE.test(value)) {
    throw new Error(`${label} must be a YYYY-MM-DD date`);
  }
  return value;
}

function assertUuid(value: string, label: string): string {
  if (!UUID_RE.test(value)) {
    throw new Error(`${label} must be a UUID`);
  }
  return value;
}

/** DATE column bound: midnight UTC of the given calendar date. */
function toDate(value: string): Date {
  return new Date(`${assertDate(value, "date")}T00:00:00.000Z`);
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function clampLimit(limit: number, max: number): number {
  if (!Number.isFinite(limit)) return 1;
  return Math.min(Math.max(Math.trunc(limit), 1), max);
}

function money(value: Prisma.Decimal | number | string | null | undefined): string {
  return new Prisma.Decimal(value ?? 0).toFixed(2);
}

/**
 * Per-invoice receivable CTE. Shared by totals and receivable rows.
 *
 * Outstanding = total_amount - SUM(active payments), where an active payment
 * has no payment_reversals row (one per payment at most).
 *
 * is_overdue mirrors the display rule in src/lib/invoice-status.ts
 * (deriveDisplayStatus): an OVERDUE status, or a SENT / PARTIALLY_PAID invoice
 * whose due date is before the business-local "today" and that still has a
 * positive outstanding balance. Keep this in sync with that file.
 */
function receivableCte(businessId: string, today: string): Prisma.Sql {
  return Prisma.sql`
    inv AS (
      SELECT
        i.id,
        i.business_id,
        i.customer_id,
        i.invoice_number,
        i.currency::text AS currency,
        i.status::text AS status,
        i.due_date,
        i.total_amount,
        COALESCE((
          SELECT SUM(p.amount)
          FROM payments p
          WHERE p.invoice_id = i.id
            AND p.business_id = i.business_id
            AND NOT EXISTS (
              SELECT 1 FROM payment_reversals r
              WHERE r.payment_id = p.id AND r.business_id = p.business_id
            )
        ), 0) AS amount_paid
      FROM invoices i
      WHERE i.business_id = ${businessId}::uuid
        AND i.status::text IN ('SENT', 'PARTIALLY_PAID', 'OVERDUE')
    ),
    calc AS (
      SELECT
        inv.*,
        inv.total_amount - inv.amount_paid AS outstanding,
        (
          inv.status = 'OVERDUE'
          OR (
            inv.status IN ('SENT', 'PARTIALLY_PAID')
            AND inv.due_date < ${today}::date
            AND inv.total_amount - inv.amount_paid > 0
          )
        ) AS is_overdue
      FROM inv
    )
  `;
}

export class DashboardRepository {
  private readonly db: PrismaClient;

  constructor(db: PrismaClient = prisma) {
    this.db = db;
  }

  /** Issued invoices (SENT, PARTIALLY_PAID, OVERDUE) grouped by currency. */
  async getIssuedInvoiceTotals(
    businessId: string,
    today: string,
  ): Promise<CurrencyIssuedTotals[]> {
    assertUuid(businessId, "businessId");
    assertDate(today, "today");

    const rows = await this.db.$queryRaw<IssuedTotalsRaw[]>(Prisma.sql`
      WITH ${receivableCte(businessId, today)}
      SELECT
        currency,
        COUNT(*)::int AS invoice_count,
        COALESCE(SUM(total_amount), 0) AS total_amount,
        COALESCE(SUM(outstanding), 0) AS outstanding,
        COALESCE(SUM(CASE WHEN is_overdue THEN outstanding ELSE 0 END), 0) AS overdue_outstanding
      FROM calc
      GROUP BY currency
      ORDER BY currency
    `);

    return rows.map((r) => ({
      currency: r.currency,
      invoiceCount: Number(r.invoice_count),
      totalAmount: money(r.total_amount),
      outstanding: money(r.outstanding),
      overdueOutstanding: money(r.overdue_outstanding),
    }));
  }

  /** Active (non-reversed) payment sums by invoice currency, paymentDate in [from, to]. */
  async getActivePaymentSums(
    businessId: string,
    from: string,
    to: string,
  ): Promise<CurrencyAmount[]> {
    assertUuid(businessId, "businessId");
    assertDate(from, "from");
    assertDate(to, "to");

    const rows = await this.db.$queryRaw<CurrencyAmountRaw[]>(Prisma.sql`
      SELECT
        i.currency::text AS currency,
        COALESCE(SUM(p.amount), 0) AS amount
      FROM payments p
      JOIN invoices i ON i.id = p.invoice_id AND i.business_id = p.business_id
      WHERE p.business_id = ${businessId}::uuid
        AND p.payment_date >= ${from}::date
        AND p.payment_date <= ${to}::date
        AND NOT EXISTS (
          SELECT 1 FROM payment_reversals r
          WHERE r.payment_id = p.id AND r.business_id = p.business_id
        )
      GROUP BY i.currency
      ORDER BY i.currency
    `);

    return rows.map((r) => ({ currency: r.currency, amount: money(r.amount) }));
  }

  /** Issued invoices with issueDate in [from, to], grouped by currency. */
  async getIssuedInvoicesInRange(
    businessId: string,
    from: string,
    to: string,
  ): Promise<CurrencyInvoiceCount[]> {
    assertUuid(businessId, "businessId");

    const groups = await this.db.invoice.groupBy({
      by: ["currency"],
      where: {
        businessId,
        status: { in: [...ISSUED_STATUSES] },
        issueDate: { gte: toDate(from), lte: toDate(to) },
      },
      _count: { _all: true },
      _sum: { totalAmount: true },
    });

    return groups.map((g) => ({
      currency: g.currency,
      invoiceCount: g._count._all,
      totalAmount: money(g._sum.totalAmount),
    }));
  }

  /** PAID expenses with paymentDate in [from, to] (business currency). */
  async getPaidExpenseSums(
    businessId: string,
    from: string,
    to: string,
  ): Promise<MoneyTotal> {
    assertUuid(businessId, "businessId");

    const agg = await this.db.expense.aggregate({
      where: {
        businessId,
        status: "PAID",
        paymentDate: { gte: toDate(from), lte: toDate(to) },
      },
      _count: { _all: true },
      _sum: { amount: true },
    });

    return { count: agg._count._all, amount: money(agg._sum.amount) };
  }

  /**
   * Upcoming: UPCOMING with dueDate in [today, today + horizonDays].
   * Overdue: UPCOMING with dueDate < today (derived), plus status OVERDUE.
   * The three predicates are disjoint (status and date differ), so each
   * expense is counted once.
   */
  async getUpcomingAndOverdueExpenses(
    businessId: string,
    today: string,
    horizonDays: number = DEFAULT_HORIZON_DAYS,
  ): Promise<UpcomingAndOverdueExpenses> {
    assertUuid(businessId, "businessId");
    assertDate(today, "today");
    if (!Number.isInteger(horizonDays) || horizonDays < 0) {
      throw new Error("horizonDays must be a non-negative integer");
    }
    const horizonEnd = addDays(today, horizonDays);

    const [upcoming, overdueDerived, overdueStatus] = await Promise.all([
      this.db.expense.aggregate({
        where: {
          businessId,
          status: "UPCOMING",
          dueDate: { gte: toDate(today), lte: toDate(horizonEnd) },
        },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.db.expense.aggregate({
        where: {
          businessId,
          status: "UPCOMING",
          dueDate: { lt: toDate(today) },
        },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.db.expense.aggregate({
        where: { businessId, status: "OVERDUE" },
        _count: { _all: true },
        _sum: { amount: true },
      }),
    ]);

    return {
      horizonEnd,
      upcoming: {
        count: upcoming._count._all,
        amount: money(upcoming._sum.amount),
      },
      overdue: {
        count: overdueDerived._count._all + overdueStatus._count._all,
        amount: money(
          new Prisma.Decimal(overdueDerived._sum.amount ?? 0).plus(
            overdueStatus._sum.amount ?? 0,
          ),
        ),
      },
    };
  }

  /** Inputs for availableCash: active payments and PAID expenses in [from, to]. */
  async getCashWindowSums(
    businessId: string,
    from: string,
    to: string,
  ): Promise<CashWindowSums> {
    const [payments, expenses] = await Promise.all([
      this.getActivePaymentSums(businessId, from, to),
      this.getPaidExpenseSums(businessId, from, to),
    ]);
    return { payments, expenses };
  }

  /**
   * Time-bucketed collected / invoiced / expenses per currency, zero-filled
   * across every bucket from buildBuckets(). Uses date_trunc on DATE columns
   * cast to timestamp (no timezone conversion). Week buckets start Monday.
   */
  async getBucketedSeries(
    businessId: string,
    from: string,
    to: string,
    granularity: BucketGranularity,
  ): Promise<BucketRow[]> {
    assertUuid(businessId, "businessId");
    assertDate(from, "from");
    assertDate(to, "to");
    if (granularity !== "day" && granularity !== "week" && granularity !== "month") {
      throw new Error("granularity must be day, week or month");
    }

    const [rows, business] = await Promise.all([
      this.db.$queryRaw<BucketRaw[]>(Prisma.sql`
        WITH events AS (
          SELECT
            date_trunc(${granularity}::text, p.payment_date::timestamp)::date AS bucket,
            i.currency::text AS currency,
            p.amount AS collected,
            0::numeric AS invoiced,
            0::numeric AS expenses
          FROM payments p
          JOIN invoices i ON i.id = p.invoice_id AND i.business_id = p.business_id
          WHERE p.business_id = ${businessId}::uuid
            AND p.payment_date >= ${from}::date
            AND p.payment_date <= ${to}::date
            AND NOT EXISTS (
              SELECT 1 FROM payment_reversals r
              WHERE r.payment_id = p.id AND r.business_id = p.business_id
            )
          UNION ALL
          SELECT
            date_trunc(${granularity}::text, i.issue_date::timestamp)::date,
            i.currency::text,
            0::numeric,
            i.total_amount,
            0::numeric
          FROM invoices i
          WHERE i.business_id = ${businessId}::uuid
            AND i.status::text IN ('SENT', 'PARTIALLY_PAID', 'OVERDUE')
            AND i.issue_date >= ${from}::date
            AND i.issue_date <= ${to}::date
          UNION ALL
          SELECT
            date_trunc(${granularity}::text, e.payment_date::timestamp)::date,
            b.currency::text,
            0::numeric,
            0::numeric,
            e.amount
          FROM expenses e
          JOIN businesses b ON b.id = e.business_id
          WHERE e.business_id = ${businessId}::uuid
            AND e.status::text = 'PAID'
            AND e.payment_date >= ${from}::date
            AND e.payment_date <= ${to}::date
        )
        SELECT
          to_char(bucket, 'YYYY-MM-DD') AS bucket_start,
          currency,
          COALESCE(SUM(collected), 0) AS collected,
          COALESCE(SUM(invoiced), 0) AS invoiced,
          COALESCE(SUM(expenses), 0) AS expenses
        FROM events
        GROUP BY bucket, currency
        ORDER BY bucket, currency
      `),
      this.db.business.findUnique({
        where: { id: businessId },
        select: { currency: true },
      }),
    ]);

    const currencies = new Set<string>();
    if (business) currencies.add(business.currency);
    for (const r of rows) currencies.add(r.currency);

    const observed = new Map<string, BucketRaw>();
    for (const r of rows) observed.set(`${r.bucket_start}|${r.currency}`, r);

    const result: BucketRow[] = [];
    for (const bucket of buildBuckets(from, to, granularity)) {
      for (const currency of [...currencies].sort()) {
        const r = observed.get(`${bucket}|${currency}`);
        result.push({
          bucketStart: bucket,
          currency,
          collected: money(r?.collected),
          invoiced: money(r?.invoiced),
          expenses: money(r?.expenses),
        });
      }
    }
    return result;
  }

  /**
   * Issued invoices with outstanding > 0. Overdue first, then dueDate asc,
   * then id asc. Keyset pagination on the cursor invoice id (its sort keys are
   * looked up in the same query). Fetches limit + 1 to produce nextCursor.
   */
  async getReceivableRows(
    businessId: string,
    today: string,
    limit: number,
    cursor: string | null = null,
  ): Promise<ReceivablePage> {
    assertUuid(businessId, "businessId");
    assertDate(today, "today");
    const take = clampLimit(limit, MAX_RECEIVABLE_LIMIT);
    const cursorFilter = cursor
      ? Prisma.sql`WHERE (r.sort_rank, r.due_date, r.id) > (
          SELECT sort_rank, due_date, id FROM ranked WHERE id = ${assertUuid(cursor, "cursor")}::uuid
        )`
      : Prisma.empty;

    const rows = await this.db.$queryRaw<ReceivableRaw[]>(Prisma.sql`
      WITH ${receivableCte(businessId, today)},
      ranked AS (
        SELECT
          c.id,
          c.business_id,
          c.customer_id,
          c.invoice_number,
          c.currency,
          c.status,
          c.due_date,
          c.total_amount,
          c.amount_paid,
          c.outstanding,
          c.is_overdue,
          CASE WHEN c.is_overdue THEN 0 ELSE 1 END AS sort_rank
        FROM calc c
        WHERE c.outstanding > 0
      )
      SELECT
        r.id,
        r.invoice_number,
        cu.name AS customer_name,
        r.currency,
        r.total_amount,
        r.amount_paid,
        r.outstanding,
        to_char(r.due_date, 'YYYY-MM-DD') AS due_date,
        r.status,
        r.is_overdue,
        r.sort_rank
      FROM ranked r
      JOIN customers cu ON cu.id = r.customer_id AND cu.business_id = r.business_id
      ${cursorFilter}
      ORDER BY r.sort_rank, r.due_date, r.id
      LIMIT ${take + 1}
    `);

    const pageRows = rows.slice(0, take);
    const hasMore = rows.length > take;

    return {
      rows: pageRows.map((r) => ({
        id: r.id,
        invoiceNumber: r.invoice_number,
        customerName: r.customer_name,
        currency: r.currency,
        totalAmount: money(r.total_amount),
        amountPaid: money(r.amount_paid),
        outstanding: money(r.outstanding),
        dueDate: r.due_date,
        status: r.status,
        isOverdue: r.is_overdue,
      })),
      nextCursor: hasMore ? pageRows[pageRows.length - 1].id : null,
    };
  }

  /** Most recent invoices (createdAt desc), max 20. */
  async getRecentInvoices(
    businessId: string,
    limit: number,
  ): Promise<RecentInvoiceRow[]> {
    assertUuid(businessId, "businessId");
    const invoices = await this.db.invoice.findMany({
      where: { businessId },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: clampLimit(limit, MAX_RECENT_LIMIT),
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        currency: true,
        totalAmount: true,
        issueDate: true,
        dueDate: true,
        customer: { select: { name: true } },
      },
    });

    return invoices.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      customerName: i.customer.name,
      status: i.status,
      currency: i.currency,
      totalAmount: money(i.totalAmount),
      issueDate: dateOnly(i.issueDate),
      dueDate: dateOnly(i.dueDate),
    }));
  }

  /** Most recent active (non-reversed) payments (createdAt desc), max 20. */
  async getRecentActivePayments(
    businessId: string,
    limit: number,
  ): Promise<RecentPaymentRow[]> {
    assertUuid(businessId, "businessId");
    const payments = await this.db.payment.findMany({
      where: { businessId, paymentReversals: { none: {} } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: clampLimit(limit, MAX_RECENT_LIMIT),
      select: {
        id: true,
        invoiceId: true,
        amount: true,
        paymentDate: true,
        invoice: {
          select: {
            invoiceNumber: true,
            currency: true,
            customer: { select: { name: true } },
          },
        },
      },
    });

    return payments.map((p) => ({
      id: p.id,
      invoiceId: p.invoiceId,
      invoiceNumber: p.invoice.invoiceNumber,
      customerName: p.invoice.customer.name,
      currency: p.invoice.currency,
      amount: money(p.amount),
      paymentDate: dateOnly(p.paymentDate),
    }));
  }

  /** Non-archived customer count. */
  async getCustomerCount(businessId: string): Promise<number> {
    assertUuid(businessId, "businessId");
    return this.db.customer.count({
      where: { businessId, archivedAt: null },
    });
  }

  /**
   * Reminders: overdue = followUpDate < today; upcoming = followUpDate in
   * [today, today + 6]. Each list is capped at 50 rows; counts are uncapped.
   */
  async getReminderRows(businessId: string, today: string): Promise<ReminderRows> {
    assertUuid(businessId, "businessId");
    assertDate(today, "today");
    const upcomingEnd = addDays(today, REMINDER_UPCOMING_DAYS);
    const select = {
      id: true,
      reminderType: true,
      status: true,
      followUpDate: true,
      invoiceId: true,
      customerId: true,
    } satisfies Prisma.ReminderSelect;

    const overdueWhere = {
      businessId,
      followUpDate: { lt: toDate(today) },
    } satisfies Prisma.ReminderWhereInput;
    const upcomingWhere = {
      businessId,
      followUpDate: { gte: toDate(today), lte: toDate(upcomingEnd) },
    } satisfies Prisma.ReminderWhereInput;

    const [overdue, upcoming, overdueCount, upcomingCount] = await Promise.all([
      this.db.reminder.findMany({
        where: overdueWhere,
        orderBy: [{ followUpDate: "asc" }, { id: "asc" }],
        take: MAX_REMINDER_ROWS,
        select,
      }),
      this.db.reminder.findMany({
        where: upcomingWhere,
        orderBy: [{ followUpDate: "asc" }, { id: "asc" }],
        take: MAX_REMINDER_ROWS,
        select,
      }),
      this.db.reminder.count({ where: overdueWhere }),
      this.db.reminder.count({ where: upcomingWhere }),
    ]);

    const toRow = (r: (typeof overdue)[number]): ReminderRow => ({
      id: r.id,
      reminderType: r.reminderType,
      status: r.status,
      followUpDate: r.followUpDate ? dateOnly(r.followUpDate) : "",
      invoiceId: r.invoiceId,
      customerId: r.customerId,
    });

    return {
      overdue: overdue.map(toRow),
      upcoming: upcoming.map(toRow),
      overdueCount,
      upcomingCount,
    };
  }

  /**
   * Business currency, opening balance, opening balance date and timezone.
   * Business is the tenant root, so its id is the scope.
   */
  async getOpeningBalance(businessId: string): Promise<OpeningBalance | null> {
    assertUuid(businessId, "businessId");
    const business = await this.db.business.findUnique({
      where: { id: businessId },
      select: {
        currency: true,
        openingBalance: true,
        openingBalanceDate: true,
        timezone: true,
      },
    });
    if (!business) return null;

    return {
      currency: business.currency,
      openingBalance: money(business.openingBalance),
      openingBalanceDate: dateOnly(business.openingBalanceDate),
      timezone: business.timezone,
    };
  }
}

export const dashboardRepository = new DashboardRepository();
