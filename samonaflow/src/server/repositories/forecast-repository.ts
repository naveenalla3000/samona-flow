// Server-only data access for Cash Flow Forecasting.
//
// Every query requires an explicit businessId; there is intentionally no way to
// address an invoice, payment, reversal or expense by id alone. Only records
// that can affect the forecast are loaded:
//   - invoices in SENT / PARTIALLY_PAID / OVERDUE whose effective expected date
//     is inside the horizon (overdue rows are included because their date is in
//     the past, which is <= horizonEnd);
//   - their active payments, aggregated in SQL with a NOT EXISTS reversal check;
//   - unpaid expenses whose due date is inside the horizon, including overdue;
//   - cash movements since the opening balance date, aggregated in SQL.
//
// Money columns are Decimal(12,2); they are returned as canonical 2dp strings.
// Dates are returned with to_char so the driver's timezone never shifts a
// business date.
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { ExpenseCategoryValue } from "@/lib/expense-status";
import { prisma } from "@/server/database/connection";
import type { ExpenseStatusValue } from "@/types/expense";
import type { InvoiceStatusValue } from "@/types/invoice";
import type { ForecastExpenseInput, ForecastInvoiceInput } from "@/types/forecast";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ForecastBusinessContext {
  currency: string;
  timezone: string;
  openingBalance: string;
  openingBalanceDate: string;
}

export interface ForecastCashSums {
  /** Active payments in the business currency, paymentDate in [from, to]. */
  cashIn: string;
  /** PAID expenses, paymentDate in [from, to]. */
  cashOut: string;
}

export interface ForecastRepository {
  getBusinessContext(businessId: string): Promise<ForecastBusinessContext | null>;
  getCashSums(
    businessId: string,
    currency: string,
    from: string,
    to: string,
  ): Promise<ForecastCashSums>;
  getEligibleInvoices(
    businessId: string,
    horizonEnd: string,
  ): Promise<ForecastInvoiceInput[]>;
  getEligibleExpenses(
    businessId: string,
    horizonEnd: string,
  ): Promise<ForecastExpenseInput[]>;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  customer_name: string;
  currency: string;
  status: string;
  due_date: string;
  expected_payment_date: string | null;
  total_amount: Prisma.Decimal;
  amount_paid: Prisma.Decimal;
}

interface ExpenseRow {
  id: string;
  title: string;
  category: string;
  amount: Prisma.Decimal;
  due_date: string;
  status: string;
}

interface AmountRow {
  amount: Prisma.Decimal;
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

function money(value: Prisma.Decimal | string | number | null | undefined): string {
  return new Prisma.Decimal(value ?? 0).toFixed(2);
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export class ForecastRepositoryImpl implements ForecastRepository {
  private readonly db: PrismaClient;

  constructor(db: PrismaClient = prisma) {
    this.db = db;
  }

  async getBusinessContext(
    businessId: string,
  ): Promise<ForecastBusinessContext | null> {
    assertUuid(businessId, "businessId");
    const business = await this.db.business.findUnique({
      where: { id: businessId },
      select: {
        currency: true,
        timezone: true,
        openingBalance: true,
        openingBalanceDate: true,
      },
    });
    if (!business) return null;

    return {
      currency: business.currency,
      timezone: business.timezone,
      openingBalance: money(business.openingBalance),
      openingBalanceDate: dateOnly(business.openingBalanceDate),
    };
  }

  async getCashSums(
    businessId: string,
    currency: string,
    from: string,
    to: string,
  ): Promise<ForecastCashSums> {
    assertUuid(businessId, "businessId");
    assertDate(from, "from");
    assertDate(to, "to");

    // An opening balance date in the future means no movement has happened yet.
    if (from > to) {
      return { cashIn: "0.00", cashOut: "0.00" };
    }

    const [payments, expenses] = await Promise.all([
      this.db.$queryRaw<AmountRow[]>(Prisma.sql`
        SELECT COALESCE(SUM(p.amount), 0) AS amount
        FROM payments p
        JOIN invoices i ON i.id = p.invoice_id AND i.business_id = p.business_id
        WHERE p.business_id = ${businessId}::uuid
          AND i.currency::text = ${currency}
          AND p.payment_date >= ${from}::date
          AND p.payment_date <= ${to}::date
          AND NOT EXISTS (
            SELECT 1 FROM payment_reversals r
            WHERE r.payment_id = p.id AND r.business_id = p.business_id
          )
      `),
      this.db.$queryRaw<AmountRow[]>(Prisma.sql`
        SELECT COALESCE(SUM(e.amount), 0) AS amount
        FROM expenses e
        WHERE e.business_id = ${businessId}::uuid
          AND e.status::text = 'PAID'
          AND e.payment_date IS NOT NULL
          AND e.payment_date >= ${from}::date
          AND e.payment_date <= ${to}::date
      `),
    ]);

    return {
      cashIn: money(payments[0]?.amount),
      cashOut: money(expenses[0]?.amount),
    };
  }

  /**
   * Eligible outstanding invoices whose effective expected date is inside the
   * horizon. Currency is deliberately not filtered here: the engine filters and
   * reports excluded currencies without mixing them into the forecast.
   */
  async getEligibleInvoices(
    businessId: string,
    horizonEnd: string,
  ): Promise<ForecastInvoiceInput[]> {
    assertUuid(businessId, "businessId");
    assertDate(horizonEnd, "horizonEnd");

    const rows = await this.db.$queryRaw<InvoiceRow[]>(Prisma.sql`
      SELECT
        i.id,
        i.invoice_number,
        c.name AS customer_name,
        i.currency::text AS currency,
        i.status::text AS status,
        to_char(i.due_date, 'YYYY-MM-DD') AS due_date,
        to_char(i.expected_payment_date, 'YYYY-MM-DD') AS expected_payment_date,
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
      JOIN customers c ON c.id = i.customer_id AND c.business_id = i.business_id
      WHERE i.business_id = ${businessId}::uuid
        AND i.status::text IN ('SENT', 'PARTIALLY_PAID', 'OVERDUE')
        AND COALESCE(i.expected_payment_date, i.due_date) <= ${horizonEnd}::date
      ORDER BY COALESCE(i.expected_payment_date, i.due_date), i.invoice_number, i.id
    `);

    return rows.map((row) => ({
      id: row.id,
      invoiceNumber: row.invoice_number,
      customerName: row.customer_name,
      currency: row.currency,
      status: row.status as InvoiceStatusValue,
      dueDate: row.due_date,
      expectedPaymentDate: row.expected_payment_date,
      totalAmount: money(row.total_amount),
      amountPaid: money(row.amount_paid),
    }));
  }

  /**
   * Unpaid expenses due inside the horizon. PAID and CANCELLED are excluded;
   * overdue UPCOMING rows are included because dueDate < today <= horizonEnd.
   */
  async getEligibleExpenses(
    businessId: string,
    horizonEnd: string,
  ): Promise<ForecastExpenseInput[]> {
    assertUuid(businessId, "businessId");
    assertDate(horizonEnd, "horizonEnd");

    const rows = await this.db.$queryRaw<ExpenseRow[]>(Prisma.sql`
      SELECT
        e.id,
        e.title,
        e.category::text AS category,
        e.amount,
        to_char(e.due_date, 'YYYY-MM-DD') AS due_date,
        e.status::text AS status
      FROM expenses e
      WHERE e.business_id = ${businessId}::uuid
        AND e.status::text IN ('UPCOMING', 'OVERDUE')
        AND e.due_date <= ${horizonEnd}::date
      ORDER BY e.due_date, e.title, e.id
    `);

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      category: row.category as ExpenseCategoryValue,
      amount: money(row.amount),
      dueDate: row.due_date,
      status: row.status as ExpenseStatusValue,
    }));
  }
}

export const prismaForecastRepository: ForecastRepository =
  new ForecastRepositoryImpl();
