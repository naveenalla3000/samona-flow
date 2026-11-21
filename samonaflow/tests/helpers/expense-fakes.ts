import { deriveDisplayStatus } from "@/lib/expense-status";
import type { ListExpensesQuery, UpdateExpenseInput } from "@/lib/validations/expense";
import type {
  CreateExpenseRecord,
  ExpenseRepository,
} from "@/server/repositories/expense-repository";
import type {
  ExpenseListResult,
  ExpenseRecord,
  ExpenseStatusValue,
} from "@/types/expense";
import { BUSINESS_A } from "./fakes";

export const EXPENSE_A = "60000000-0000-4000-8000-000000000001";
export const EXPENSE_B = "60000000-0000-4000-8000-000000000002";
/** Fixed "business-local" date used by the fake to derive OVERDUE. */
export const EXPENSE_TODAY = "2026-06-15";

export type BusinessSettings = { currency: string; timezone: string };

type StoredExpense = Omit<ExpenseRecord, "displayStatus" | "currency" | "timezone">;

const key = (businessId: string, id: string) => `${businessId}:${id}`;

function settingsFor(settings: Map<string, BusinessSettings>, businessId: string): BusinessSettings {
  return settings.get(businessId) ?? { currency: "INR", timezone: "Asia/Kolkata" };
}

/**
 * In-memory repository with composite (businessId, id) keys. It mirrors the
 * Prisma repository's tenant scoping, UPCOMING-only mutation guard and derived
 * OVERDUE display status. PAID/CANCELLED rows are never deleted.
 */
export function createFakeExpenseRepository(seed: ExpenseRecord[] = []) {
  const expenses = new Map<string, StoredExpense>();
  const settings = new Map<string, BusinessSettings>();
  let nextId = 1;

  for (const expense of seed) {
    expenses.set(key(expense.businessId, expense.id), { ...expense });
  }

  function toRecord(stored: StoredExpense): ExpenseRecord {
    const config = settingsFor(settings, stored.businessId);
    return {
      ...stored,
      displayStatus: deriveDisplayStatus(stored.status, stored.dueDate, EXPENSE_TODAY),
      currency: config.currency,
      timezone: config.timezone,
    };
  }

  function list(businessId: string, query: ListExpensesQuery): ExpenseListResult {
    let matches = [...expenses.values()]
      .filter((expense) => expense.businessId === businessId)
      .map(toRecord);

    if (query.category) matches = matches.filter((e) => e.category === query.category);
    if (query.status === "PAID" || query.status === "CANCELLED") {
      matches = matches.filter((e) => e.status === query.status);
    } else if (query.status === "UPCOMING" || query.status === "OVERDUE") {
      matches = matches.filter((e) => e.status === "UPCOMING" && e.displayStatus === query.status);
    }
    if (query.fromDate) matches = matches.filter((e) => e.dueDate >= query.fromDate!);
    if (query.toDate) matches = matches.filter((e) => e.dueDate <= query.toDate!);
    if (query.search) {
      const needle = query.search.toLowerCase();
      matches = matches.filter(
        (e) =>
          e.title.toLowerCase().includes(needle) || (e.notes ?? "").toLowerCase().includes(needle),
      );
    }

    matches.sort((a, b) => {
      const field = query.sort;
      const left = field === "amount" ? a.amount : field === "status" ? a.displayStatus : a[field];
      const right = field === "amount" ? b.amount : field === "status" ? b.displayStatus : b[field];
      const result = String(left).localeCompare(String(right));
      return query.direction === "asc" ? result : -result;
    });

    const total = matches.length;
    const start = (query.page - 1) * query.pageSize;
    return {
      items: matches.slice(start, start + query.pageSize),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  const repository: ExpenseRepository = {
    async create(input: CreateExpenseRecord) {
      const id = `60000000-0000-4000-8000-${String(nextId).padStart(12, "0")}`;
      nextId += 1;
      const now = "2026-06-10T00:00:00.000Z";
      const stored: StoredExpense = {
        id,
        businessId: input.businessId,
        title: input.title,
        category: input.category,
        amount: input.amount,
        dueDate: input.dueDate,
        paymentDate: input.status === "PAID" ? input.paymentDate : null,
        status: input.status,
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
      };
      expenses.set(key(stored.businessId, stored.id), stored);
      return toRecord(stored);
    },

    async findMany(businessId, query) {
      return list(businessId, query);
    },

    async findById(businessId, expenseId) {
      const stored = expenses.get(key(businessId, expenseId));
      return stored ? toRecord(stored) : null;
    },

    async update(businessId, expenseId, input: UpdateExpenseInput) {
      const k = key(businessId, expenseId);
      const stored = expenses.get(k);
      if (!stored || stored.status !== "UPCOMING") return null;
      const updated: StoredExpense = {
        ...stored,
        ...input,
        updatedAt: "2026-06-12T00:00:00.000Z",
      };
      expenses.set(k, updated);
      return toRecord(updated);
    },

    async markPaid(businessId, expenseId, paymentDate) {
      const k = key(businessId, expenseId);
      const stored = expenses.get(k);
      if (!stored || stored.status !== "UPCOMING") return null;
      const updated: StoredExpense = {
        ...stored,
        status: "PAID",
        paymentDate: paymentDate ?? EXPENSE_TODAY,
        updatedAt: "2026-06-12T00:00:00.000Z",
      };
      expenses.set(k, updated);
      return toRecord(updated);
    },

    async cancel(businessId, expenseId) {
      const k = key(businessId, expenseId);
      const stored = expenses.get(k);
      if (!stored || stored.status !== "UPCOMING") return null;
      const updated: StoredExpense = {
        ...stored,
        status: "CANCELLED",
        updatedAt: "2026-06-12T00:00:00.000Z",
      };
      expenses.set(k, updated);
      return toRecord(updated);
    },
  };

  return {
    repository,
    setBusinessSettings(businessId: string, value: BusinessSettings) {
      settings.set(businessId, value);
    },
    getExpense(businessId: string, expenseId: string) {
      const stored = expenses.get(key(businessId, expenseId));
      return stored ? toRecord(stored) : null;
    },
    setExpenseStatus(businessId: string, expenseId: string, status: ExpenseStatusValue) {
      const k = key(businessId, expenseId);
      const stored = expenses.get(k);
      if (stored) expenses.set(k, { ...stored, status });
    },
    count() {
      return expenses.size;
    },
    defaultBusinessId: BUSINESS_A,
  };
}

export function makeExpenseRecord(overrides: Partial<ExpenseRecord> = {}): ExpenseRecord {
  const base: ExpenseRecord = {
    id: EXPENSE_A,
    businessId: BUSINESS_A,
    title: "Office rent",
    category: "RENT",
    amount: "1200.00",
    dueDate: "2026-06-01",
    paymentDate: null,
    status: "UPCOMING",
    displayStatus: "UPCOMING",
    currency: "INR",
    timezone: "Asia/Kolkata",
    notes: null,
    createdAt: "2026-06-10T00:00:00.000Z",
    updatedAt: "2026-06-10T00:00:00.000Z",
  };
  return { ...base, ...overrides };
}
