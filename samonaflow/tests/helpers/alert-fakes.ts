import type {
  AlertExpenseSnapshot,
  AlertInvoiceSnapshot,
  AlertShortageSnapshot,
  GeneratedAlert,
} from "@/lib/alert-rules";
import { ALERT_SEVERITY_RANK } from "@/lib/alert-rules";
import type { ListAlertsQuery } from "@/lib/validations/alert";
import type {
  AlertCounts,
  AlertRecord,
  AlertRelatedEntity,
} from "@/types/alert";
import type {
  AlertEvaluationCounts,
  AlertListPage,
  AlertRepository,
} from "@/server/repositories/alert-repository";
import { BUSINESS_A, CUSTOMER_A, CUSTOMER_B } from "./fakes";

export const INVOICE_A = "70000000-0000-4000-8000-000000000001";
export const INVOICE_B = "70000000-0000-4000-8000-000000000002";
export const EXPENSE_A = "80000000-0000-4000-8000-000000000001";

/** The fake stores the dedupe key that the public record intentionally omits. */
export type FakeStoredAlert = AlertRecord & { dedupeKey: string | null };

export function makeAlert(overrides: Partial<FakeStoredAlert> = {}): FakeStoredAlert {
  return {
    id: "91000000-0000-4000-8000-000000000001",
    businessId: BUSINESS_A,
    type: "OVERDUE_PAYMENT",
    severity: "WARNING",
    title: "Overdue invoice INV-0001",
    description: "Acme Studio owes USD 100.00.",
    recommendedAction: "Send a payment reminder.",
    relatedEntityType: "INVOICE",
    relatedEntityId: INVOICE_A,
    status: "ACTIVE",
    isRead: false,
    readAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    resolvedAt: null,
    dedupeKey: `OVERDUE_PAYMENT:${INVOICE_A}`,
    ...overrides,
  };
}

export function makeAlertInvoice(
  overrides: Partial<AlertInvoiceSnapshot> = {},
): AlertInvoiceSnapshot {
  return {
    id: INVOICE_A,
    invoiceNumber: "INV-0001",
    customerId: CUSTOMER_A,
    customerName: "Acme Studio",
    currency: "USD",
    status: "SENT",
    dueDate: "2026-01-20",
    expectedPaymentDate: null,
    totalAmount: "100.00",
    amountPaid: "0.00",
    ...overrides,
  };
}

export function makeAlertExpense(
  overrides: Partial<AlertExpenseSnapshot> = {},
): AlertExpenseSnapshot {
  return {
    id: EXPENSE_A,
    title: "Office rent",
    category: "RENT",
    amount: "50.00",
    dueDate: "2026-01-18",
    status: "UPCOMING",
    ...overrides,
  };
}

export function makeShortage(
  overrides: Partial<AlertShortageSnapshot> = {},
): AlertShortageSnapshot {
  return {
    horizonDays: 30,
    becomesNegative: false,
    shortageDate: null,
    lowestProjectedBalance: "1000.00",
    lowestProjectedDate: "2026-01-15",
    projectedEndingBalance: "1000.00",
    ...overrides,
  };
}

export type AlertRepositoryCall = {
  method: keyof AlertRepository;
  businessId: string;
  args: unknown[];
};

export interface AlertRepositorySeed {
  invoices?: Record<string, AlertInvoiceSnapshot[]>;
  expenses?: Record<string, AlertExpenseSnapshot[]>;
  alerts?: Record<string, FakeStoredAlert[]>;
  relatedInvoices?: Record<string, Record<string, AlertRelatedEntity>>;
  relatedExpenses?: Record<string, Record<string, AlertRelatedEntity>>;
  relatedCustomers?: Record<string, Record<string, AlertRelatedEntity>>;
}

function withoutKey(alert: FakeStoredAlert): AlertRecord {
  const { dedupeKey, ...record } = alert;
  void dedupeKey;
  return record;
}

function statusMatches(alert: AlertRecord, status: ListAlertsQuery["status"]): boolean {
  switch (status) {
    case "active":
      return alert.status === "ACTIVE";
    case "resolved":
      return alert.status === "RESOLVED";
    case "dismissed":
      return alert.status === "DISMISSED";
    default:
      return true;
  }
}

/**
 * In-memory alert repository. Every row is keyed by businessId, so a row seeded
 * for another business can never be returned for the requested one. The
 * evaluation logic mirrors the real transaction, including the rule that a
 * dismissed alert keeps its dedupe key until the condition clears.
 */
export function createFakeAlertRepository(seed: AlertRepositorySeed = {}) {
  const invoices = new Map<string, AlertInvoiceSnapshot[]>();
  const expenses = new Map<string, AlertExpenseSnapshot[]>();
  for (const [businessId, rows] of Object.entries(seed.invoices ?? {})) {
    invoices.set(businessId, structuredClone(rows));
  }
  for (const [businessId, rows] of Object.entries(seed.expenses ?? {})) {
    expenses.set(businessId, structuredClone(rows));
  }

  const alerts = new Map<string, FakeStoredAlert>();
  for (const [businessId, rows] of Object.entries(seed.alerts ?? {})) {
    for (const row of rows) {
      alerts.set(`${businessId}:${row.id}`, {
        ...structuredClone(row),
        businessId,
        dedupeKey: row.dedupeKey ?? null,
      });
    }
  }

  const calls: AlertRepositoryCall[] = [];
  let sequence = 0;

  function nextId(): string {
    sequence += 1;
    return `92000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
  }

  function forBusiness(businessId: string): FakeStoredAlert[] {
    return [...alerts.values()].filter((alert) => alert.businessId === businessId);
  }

  function related(
    map: Record<string, Record<string, AlertRelatedEntity>> | undefined,
    businessId: string,
    id: string,
  ): AlertRelatedEntity | null {
    return map?.[businessId]?.[id] ?? null;
  }

  const repository: AlertRepository = {
    async getOpenInvoices(businessId) {
      calls.push({ method: "getOpenInvoices", businessId, args: [] });
      return structuredClone(invoices.get(businessId) ?? []);
    },

    async getOpenExpenses(businessId) {
      calls.push({ method: "getOpenExpenses", businessId, args: [] });
      return structuredClone(expenses.get(businessId) ?? []);
    },

    async list(businessId, query): Promise<AlertListPage> {
      calls.push({ method: "list", businessId, args: [query] });
      let rows = forBusiness(businessId).filter(
        (alert) =>
          (!query.type || alert.type === query.type) &&
          (!query.severity || alert.severity === query.severity) &&
          (query.read === "all" ||
            (query.read === "read" ? alert.isRead : !alert.isRead)) &&
          statusMatches(alert, query.status),
      );

      rows = rows.sort((left, right) => {
        let result = 0;
        if (query.sort === "severity") {
          result =
            ALERT_SEVERITY_RANK[left.severity] - ALERT_SEVERITY_RANK[right.severity];
        } else if (query.sort === "type") {
          result = left.type.localeCompare(right.type);
        } else {
          result = left.createdAt.localeCompare(right.createdAt);
        }
        if (query.direction === "desc") result *= -1;
        return result || left.id.localeCompare(right.id);
      });

      const start = (query.page - 1) * query.pageSize;
      return {
        items: rows.slice(start, start + query.pageSize).map(withoutKey),
        total: rows.length,
      };
    },

    async findById(businessId, alertId) {
      calls.push({ method: "findById", businessId, args: [alertId] });
      const row = alerts.get(`${businessId}:${alertId}`);
      return row ? withoutKey(row) : null;
    },

    async getCounts(businessId): Promise<AlertCounts> {
      calls.push({ method: "getCounts", businessId, args: [] });
      const active = forBusiness(businessId).filter((alert) => alert.status === "ACTIVE");
      return {
        active: active.length,
        unread: active.filter((alert) => !alert.isRead).length,
        critical: active.filter((alert) => alert.severity === "CRITICAL").length,
        warning: active.filter((alert) => alert.severity === "WARNING").length,
        info: active.filter((alert) => alert.severity === "INFO").length,
      };
    },

    async getUnreadCount(businessId) {
      calls.push({ method: "getUnreadCount", businessId, args: [] });
      return forBusiness(businessId).filter(
        (alert) => alert.status === "ACTIVE" && !alert.isRead,
      ).length;
    },

    async applyEvaluation(
      businessId,
      candidates: readonly GeneratedAlert[],
      evaluatedAt,
    ): Promise<AlertEvaluationCounts> {
      calls.push({ method: "applyEvaluation", businessId, args: [candidates, evaluatedAt] });
      const existing = forBusiness(businessId).filter((alert) => alert.resolvedAt === null);
      const byKey = new Map<string, FakeStoredAlert>();
      for (const row of existing) {
        if (row.dedupeKey) byKey.set(row.dedupeKey, row);
      }

      let created = 0;
      let updated = 0;
      let resolved = 0;
      let unchanged = 0;
      let dismissed = 0;
      const timestamp = evaluatedAt.toISOString();

      for (const candidate of candidates) {
        const current = byKey.get(candidate.dedupeKey);
        if (!current) {
          const row: FakeStoredAlert = {
            id: nextId(),
            businessId,
            type: candidate.type,
            severity: candidate.severity,
            title: candidate.title,
            description: candidate.description,
            recommendedAction: candidate.recommendedAction,
            relatedEntityType: candidate.relatedEntityType,
            relatedEntityId: candidate.relatedEntityId,
            status: "ACTIVE",
            isRead: false,
            readAt: null,
            createdAt: timestamp,
            updatedAt: timestamp,
            resolvedAt: null,
            dedupeKey: candidate.dedupeKey,
          };
          alerts.set(`${businessId}:${row.id}`, row);
          created += 1;
          continue;
        }

        if (current.status === "DISMISSED") {
          dismissed += 1;
          continue;
        }

        const changed =
          current.severity !== candidate.severity ||
          current.title !== candidate.title ||
          current.description !== candidate.description ||
          current.recommendedAction !== candidate.recommendedAction ||
          current.relatedEntityType !== candidate.relatedEntityType ||
          current.relatedEntityId !== candidate.relatedEntityId;

        if (!changed) {
          unchanged += 1;
          continue;
        }

        current.severity = candidate.severity;
        current.title = candidate.title;
        current.description = candidate.description;
        current.recommendedAction = candidate.recommendedAction;
        current.relatedEntityType = candidate.relatedEntityType;
        current.relatedEntityId = candidate.relatedEntityId;
        current.updatedAt = timestamp;
        updated += 1;
      }

      const candidateKeys = new Set(candidates.map((candidate) => candidate.dedupeKey));
      for (const row of existing) {
        if (row.dedupeKey !== null && candidateKeys.has(row.dedupeKey)) continue;
        row.status = "RESOLVED";
        row.resolvedAt = timestamp;
        row.updatedAt = timestamp;
        resolved += 1;
      }

      return { created, updated, resolved, unchanged, dismissed };
    },

    async markRead(businessId, alertId, readAt) {
      calls.push({ method: "markRead", businessId, args: [alertId, readAt] });
      const row = alerts.get(`${businessId}:${alertId}`);
      if (!row) return null;
      if (!row.isRead) {
        row.isRead = true;
        row.readAt = readAt.toISOString();
        row.updatedAt = readAt.toISOString();
      }
      return withoutKey(row);
    },

    async markUnread(businessId, alertId) {
      calls.push({ method: "markUnread", businessId, args: [alertId] });
      const row = alerts.get(`${businessId}:${alertId}`);
      if (!row) return null;
      if (row.isRead) {
        row.isRead = false;
        row.readAt = null;
        row.updatedAt = new Date().toISOString();
      }
      return withoutKey(row);
    },

    async dismiss(businessId, alertId) {
      calls.push({ method: "dismiss", businessId, args: [alertId] });
      const row = alerts.get(`${businessId}:${alertId}`);
      if (!row) return null;
      if (row.status === "ACTIVE") {
        row.status = "DISMISSED";
        row.updatedAt = new Date().toISOString();
      }
      return withoutKey(row);
    },

    async findRelatedInvoice(businessId, invoiceId) {
      calls.push({ method: "findRelatedInvoice", businessId, args: [invoiceId] });
      return related(seed.relatedInvoices, businessId, invoiceId);
    },

    async findRelatedExpense(businessId, expenseId) {
      calls.push({ method: "findRelatedExpense", businessId, args: [expenseId] });
      return related(seed.relatedExpenses, businessId, expenseId);
    },

    async findRelatedCustomer(businessId, customerId) {
      calls.push({ method: "findRelatedCustomer", businessId, args: [customerId] });
      return related(seed.relatedCustomers, businessId, customerId);
    },
  };

  return {
    repository,
    calls,
    setInvoices(businessId: string, rows: AlertInvoiceSnapshot[]): void {
      invoices.set(businessId, structuredClone(rows));
    },
    setExpenses(businessId: string, rows: AlertExpenseSnapshot[]): void {
      expenses.set(businessId, structuredClone(rows));
    },
    getStored(businessId: string): FakeStoredAlert[] {
      return forBusiness(businessId).map((row) => structuredClone(row));
    },
    getRecord(businessId: string, alertId: string): AlertRecord | null {
      const row = alerts.get(`${businessId}:${alertId}`);
      return row ? withoutKey(structuredClone(row)) : null;
    },
  };
}

/** A complete list query with the schema defaults, for service tests. */
export function listQuery(
  overrides: Partial<ListAlertsQuery> = {},
): ListAlertsQuery {
  return {
    read: "all",
    status: "active",
    page: 1,
    pageSize: 20,
    sort: "createdAt",
    direction: "desc",
    ...overrides,
  };
}

/** A representative related entity used by detail tests. */
export const INVOICE_REFERENCE: AlertRelatedEntity = {
  type: "INVOICE",
  id: INVOICE_A,
  label: "INV-0001",
  href: `/dashboard/invoices/${INVOICE_A}`,
  summary: "Acme Studio · due 2026-01-10 · USD 100.00 outstanding",
};

export const CUSTOMER_REFERENCE: AlertRelatedEntity = {
  type: "CUSTOMER",
  id: CUSTOMER_B,
  label: "Beta Traders",
  href: `/dashboard/customers/${CUSTOMER_B}`,
  summary: "Beta Traders Pvt Ltd",
};
