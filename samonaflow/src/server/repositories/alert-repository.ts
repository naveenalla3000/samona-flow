// Server-only data access for Smart Alerts and the Action Center.
//
// Every query requires an explicit businessId; there is intentionally no way to
// address an alert, invoice, expense or customer by id alone. Evaluation writes
// run in one transaction so the active/dismissed set and the resolved history
// cannot diverge. The partial unique index from the initial migration
// (business_id, dedupe_key) WHERE resolved_at IS NULL is the last line of
// defence against duplicate active alerts; a concurrent insert is retried once
// and then converges on the existing row.
//
// Money columns are Decimal(12,2); they are returned as canonical 2dp strings.
// Dates use to_char so the driver timezone never shifts a business date.
import {
  Prisma,
  type Alert as AlertRow,
  type PrismaClient,
} from "@/generated/prisma/client";
import type {
  AlertExpenseSnapshot,
  AlertInvoiceSnapshot,
  GeneratedAlert,
} from "@/lib/alert-rules";
import { formatMoney } from "@/lib/invoice-math";
import { outstandingCents } from "@/lib/payment-math";
import type { ListAlertsQuery } from "@/lib/validations/alert";
import { prisma } from "@/server/database/connection";
import type {
  AlertCounts,
  AlertRecord,
  AlertRelatedEntity,
  AlertRelatedEntityType,
  AlertStatusValue,
} from "@/types/alert";
import type { ExpenseStatusValue } from "@/types/expense";
import type { InvoiceStatusValue } from "@/types/invoice";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RELATED_TYPES = new Set<AlertRelatedEntityType>([
  "INVOICE",
  "EXPENSE",
  "CUSTOMER",
  "FORECAST",
]);

export interface AlertEvaluationCounts {
  created: number;
  updated: number;
  resolved: number;
  unchanged: number;
  dismissed: number;
}

export interface AlertListPage {
  items: AlertRecord[];
  total: number;
}

export interface AlertRepository {
  getOpenInvoices(businessId: string): Promise<AlertInvoiceSnapshot[]>;
  getOpenExpenses(businessId: string): Promise<AlertExpenseSnapshot[]>;
  list(businessId: string, query: ListAlertsQuery): Promise<AlertListPage>;
  findById(businessId: string, alertId: string): Promise<AlertRecord | null>;
  getCounts(businessId: string): Promise<AlertCounts>;
  getUnreadCount(businessId: string): Promise<number>;
  applyEvaluation(
    businessId: string,
    candidates: readonly GeneratedAlert[],
    evaluatedAt: Date,
  ): Promise<AlertEvaluationCounts>;
  markRead(businessId: string, alertId: string, readAt: Date): Promise<AlertRecord | null>;
  markUnread(businessId: string, alertId: string): Promise<AlertRecord | null>;
  dismiss(businessId: string, alertId: string): Promise<AlertRecord | null>;
  findRelatedInvoice(
    businessId: string,
    invoiceId: string,
  ): Promise<AlertRelatedEntity | null>;
  findRelatedExpense(
    businessId: string,
    expenseId: string,
  ): Promise<AlertRelatedEntity | null>;
  findRelatedCustomer(
    businessId: string,
    customerId: string,
  ): Promise<AlertRelatedEntity | null>;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  customer_id: string;
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

interface AlertCountRow {
  active: number;
  unread: number;
  critical: number;
  warning: number;
  info: number;
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

function relatedType(value: string | null): AlertRelatedEntityType | null {
  return value !== null && RELATED_TYPES.has(value as AlertRelatedEntityType)
    ? (value as AlertRelatedEntityType)
    : null;
}

function toRecord(row: AlertRow): AlertRecord {
  return {
    id: row.id,
    businessId: row.businessId,
    type: row.alertType,
    severity: row.severity,
    title: row.title,
    description: row.description,
    recommendedAction: row.recommendedAction,
    relatedEntityType: relatedType(row.relatedEntityType),
    relatedEntityId: row.relatedEntityId,
    status: row.status as AlertStatusValue,
    isRead: row.isRead,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

function statusFilter(value: ListAlertsQuery["status"]): AlertStatusValue | undefined {
  switch (value) {
    case "active":
      return "ACTIVE";
    case "resolved":
      return "RESOLVED";
    case "dismissed":
      return "DISMISSED";
    default:
      return undefined;
  }
}

function orderBy(query: ListAlertsQuery): Prisma.AlertOrderByWithRelationInput[] {
  const direction = query.direction;
  switch (query.sort) {
    case "severity":
      return [{ severity: direction }, { createdAt: "desc" }, { id: "asc" }];
    case "type":
      return [{ alertType: direction }, { createdAt: "desc" }, { id: "asc" }];
    default:
      return [{ createdAt: direction }, { id: "asc" }];
  }
}

function contentChanged(row: AlertRow, candidate: GeneratedAlert): boolean {
  return (
    row.severity !== candidate.severity ||
    row.title !== candidate.title ||
    row.description !== candidate.description ||
    row.recommendedAction !== candidate.recommendedAction ||
    row.relatedEntityType !== candidate.relatedEntityType ||
    row.relatedEntityId !== candidate.relatedEntityId
  );
}

function candidateData(
  businessId: string,
  candidate: GeneratedAlert,
): Prisma.AlertUncheckedCreateInput {
  return {
    businessId,
    alertType: candidate.type,
    severity: candidate.severity,
    title: candidate.title,
    description: candidate.description,
    recommendedAction: candidate.recommendedAction,
    relatedEntityType: candidate.relatedEntityType,
    relatedEntityId: candidate.relatedEntityId,
    dedupeKey: candidate.dedupeKey,
    status: "ACTIVE",
    isRead: false,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

export class AlertRepositoryImpl implements AlertRepository {
  private readonly db: PrismaClient;

  constructor(db: PrismaClient = prisma) {
    this.db = db;
  }

  async getOpenInvoices(businessId: string): Promise<AlertInvoiceSnapshot[]> {
    assertUuid(businessId, "businessId");

    const rows = await this.db.$queryRaw<InvoiceRow[]>(Prisma.sql`
      SELECT
        i.id,
        i.invoice_number,
        c.id AS customer_id,
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
      ORDER BY i.due_date, i.invoice_number, i.id
    `);

    return rows.map((row) => ({
      id: row.id,
      invoiceNumber: row.invoice_number,
      customerId: row.customer_id,
      customerName: row.customer_name,
      currency: row.currency,
      status: row.status as InvoiceStatusValue,
      dueDate: row.due_date,
      expectedPaymentDate: row.expected_payment_date,
      totalAmount: money(row.total_amount),
      amountPaid: money(row.amount_paid),
    }));
  }

  async getOpenExpenses(businessId: string): Promise<AlertExpenseSnapshot[]> {
    assertUuid(businessId, "businessId");

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
      ORDER BY e.due_date, e.title, e.id
    `);

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      category: row.category as AlertExpenseSnapshot["category"],
      amount: money(row.amount),
      dueDate: row.due_date,
      status: row.status as ExpenseStatusValue,
    }));
  }

  async list(businessId: string, query: ListAlertsQuery): Promise<AlertListPage> {
    assertUuid(businessId, "businessId");

    const where: Prisma.AlertWhereInput = { businessId };
    if (query.type) where.alertType = query.type;
    if (query.severity) where.severity = query.severity;
    if (query.read !== "all") where.isRead = query.read === "read";
    const status = statusFilter(query.status);
    if (status) where.status = status;

    const [rows, total] = await Promise.all([
      this.db.alert.findMany({
        where,
        orderBy: orderBy(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.alert.count({ where }),
    ]);

    return { items: rows.map(toRecord), total };
  }

  async findById(businessId: string, alertId: string): Promise<AlertRecord | null> {
    assertUuid(businessId, "businessId");
    assertUuid(alertId, "alertId");

    const row = await this.db.alert.findFirst({ where: { id: alertId, businessId } });
    return row ? toRecord(row) : null;
  }

  async getCounts(businessId: string): Promise<AlertCounts> {
    assertUuid(businessId, "businessId");

    const rows = await this.db.$queryRaw<AlertCountRow[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active,
        COUNT(*) FILTER (WHERE status = 'ACTIVE' AND is_read = false)::int AS unread,
        COUNT(*) FILTER (WHERE status = 'ACTIVE' AND severity = 'CRITICAL')::int AS critical,
        COUNT(*) FILTER (WHERE status = 'ACTIVE' AND severity = 'WARNING')::int AS warning,
        COUNT(*) FILTER (WHERE status = 'ACTIVE' AND severity = 'INFO')::int AS info
      FROM alerts
      WHERE business_id = ${businessId}::uuid
    `);

    const row = rows[0];
    return {
      active: row?.active ?? 0,
      unread: row?.unread ?? 0,
      critical: row?.critical ?? 0,
      warning: row?.warning ?? 0,
      info: row?.info ?? 0,
    };
  }

  async getUnreadCount(businessId: string): Promise<number> {
    assertUuid(businessId, "businessId");
    return this.db.alert.count({
      where: { businessId, status: "ACTIVE", isRead: false },
    });
  }

  async applyEvaluation(
    businessId: string,
    candidates: readonly GeneratedAlert[],
    evaluatedAt: Date,
  ): Promise<AlertEvaluationCounts> {
    assertUuid(businessId, "businessId");

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.runEvaluation(businessId, candidates, evaluatedAt);
      } catch (error) {
        // The partial unique index rejects a concurrent duplicate insert. The
        // retry re-reads the winner and converges instead of creating a second
        // active alert for the same condition.
        if (attempt === 1 || !isUniqueViolation(error)) throw error;
      }
    }
    throw new Error("Alert evaluation failed after retry.");
  }

  private async runEvaluation(
    businessId: string,
    candidates: readonly GeneratedAlert[],
    evaluatedAt: Date,
  ): Promise<AlertEvaluationCounts> {
    return this.db.$transaction(async (tx) => {
      const existing = await tx.alert.findMany({
        where: { businessId, resolvedAt: null },
      });
      const byKey = new Map<string, AlertRow>();
      for (const row of existing) {
        if (row.dedupeKey) byKey.set(row.dedupeKey, row);
      }

      let created = 0;
      let updated = 0;
      let resolved = 0;
      let unchanged = 0;
      let dismissed = 0;

      for (const candidate of candidates) {
        const current = byKey.get(candidate.dedupeKey);
        if (!current) {
          await tx.alert.create({
            data: candidateData(businessId, candidate),
          });
          created += 1;
          continue;
        }

        // A dismissed alert stays hidden while its condition persists. It is
        // resolved below once the condition disappears, which frees the dedupe
        // key for a future recurrence.
        if (current.status === "DISMISSED") {
          dismissed += 1;
          continue;
        }

        if (current.status === "RESOLVED") {
          // Defensive repair for a row that violates the resolved_at invariant.
          await tx.alert.update({
            where: { id: current.id },
            data: {
              status: "ACTIVE",
              resolvedAt: null,
              severity: candidate.severity,
              title: candidate.title,
              description: candidate.description,
              recommendedAction: candidate.recommendedAction,
              relatedEntityType: candidate.relatedEntityType,
              relatedEntityId: candidate.relatedEntityId,
            },
          });
          updated += 1;
          continue;
        }

        if (!contentChanged(current, candidate)) {
          unchanged += 1;
          continue;
        }

        await tx.alert.update({
          where: { id: current.id },
          data: {
            severity: candidate.severity,
            title: candidate.title,
            description: candidate.description,
            recommendedAction: candidate.recommendedAction,
            relatedEntityType: candidate.relatedEntityType,
            relatedEntityId: candidate.relatedEntityId,
          },
        });
        updated += 1;
      }

      const candidateKeys = new Set(candidates.map((candidate) => candidate.dedupeKey));
      const staleIds = existing
        .filter((row) => row.dedupeKey === null || !candidateKeys.has(row.dedupeKey))
        .map((row) => row.id);

      if (staleIds.length > 0) {
        const result = await tx.alert.updateMany({
          where: {
            businessId,
            id: { in: staleIds },
            resolvedAt: null,
          },
          data: { status: "RESOLVED", resolvedAt: evaluatedAt },
        });
        resolved += result.count;
      }

      return { created, updated, resolved, unchanged, dismissed };
    });
  }

  async markRead(
    businessId: string,
    alertId: string,
    readAt: Date,
  ): Promise<AlertRecord | null> {
    assertUuid(businessId, "businessId");
    assertUuid(alertId, "alertId");

    // Only write when the flag actually changes; a repeated read is a no-op.
    await this.db.alert.updateMany({
      where: { id: alertId, businessId, isRead: false },
      data: { isRead: true, readAt },
    });
    return this.findById(businessId, alertId);
  }

  async markUnread(businessId: string, alertId: string): Promise<AlertRecord | null> {
    assertUuid(businessId, "businessId");
    assertUuid(alertId, "alertId");

    await this.db.alert.updateMany({
      where: { id: alertId, businessId, isRead: true },
      data: { isRead: false, readAt: null },
    });
    return this.findById(businessId, alertId);
  }

  async dismiss(businessId: string, alertId: string): Promise<AlertRecord | null> {
    assertUuid(businessId, "businessId");
    assertUuid(alertId, "alertId");

    await this.db.alert.updateMany({
      where: { id: alertId, businessId, status: "ACTIVE" },
      data: { status: "DISMISSED" },
    });
    return this.findById(businessId, alertId);
  }

  async findRelatedInvoice(
    businessId: string,
    invoiceId: string,
  ): Promise<AlertRelatedEntity | null> {
    assertUuid(businessId, "businessId");
    assertUuid(invoiceId, "invoiceId");

    const row = await this.db.invoice.findFirst({
      where: { id: invoiceId, businessId },
      select: {
        id: true,
        invoiceNumber: true,
        dueDate: true,
        currency: true,
        totalAmount: true,
        customer: { select: { name: true } },
        payments: {
          select: {
            amount: true,
            paymentReversals: { select: { id: true } },
          },
        },
      },
    });
    if (!row) return null;

    const outstanding = outstandingCents(
      row.totalAmount.toFixed(2),
      row.payments.map((payment) => ({
        amount: payment.amount.toFixed(2),
        reversed: payment.paymentReversals.length > 0,
      })),
    );

    return {
      type: "INVOICE",
      id: row.id,
      label: row.invoiceNumber,
      href: `/dashboard/invoices/${row.id}`,
      summary: `${row.customer.name} · due ${dateOnly(row.dueDate)} · ${row.currency} ${formatMoney(
        outstanding,
      )} outstanding`,
    };
  }

  async findRelatedExpense(
    businessId: string,
    expenseId: string,
  ): Promise<AlertRelatedEntity | null> {
    assertUuid(businessId, "businessId");
    assertUuid(expenseId, "expenseId");

    const row = await this.db.expense.findFirst({
      where: { id: expenseId, businessId },
      select: { id: true, title: true, dueDate: true, status: true },
    });
    if (!row) return null;

    return {
      type: "EXPENSE",
      id: row.id,
      label: row.title,
      href: `/dashboard/expenses/${row.id}`,
      summary: `Due ${dateOnly(row.dueDate)} · ${row.status.toLowerCase()}`,
    };
  }

  async findRelatedCustomer(
    businessId: string,
    customerId: string,
  ): Promise<AlertRelatedEntity | null> {
    assertUuid(businessId, "businessId");
    assertUuid(customerId, "customerId");

    const row = await this.db.customer.findFirst({
      where: { id: customerId, businessId },
      select: { id: true, name: true, companyName: true, archivedAt: true },
    });
    if (!row) return null;

    return {
      type: "CUSTOMER",
      id: row.id,
      label: row.name,
      href: `/dashboard/customers/${row.id}`,
      summary: row.archivedAt ? "Archived customer" : row.companyName,
    };
  }
}

export const prismaAlertRepository: AlertRepository = new AlertRepositoryImpl();
