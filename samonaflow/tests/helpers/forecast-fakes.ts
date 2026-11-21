import type {
  ForecastBusinessContext,
  ForecastCashSums,
  ForecastRepository,
} from "@/server/repositories/forecast-repository";
import type {
  ForecastExpenseInput,
  ForecastInput,
  ForecastInvoiceInput,
} from "@/types/forecast";
import { BUSINESS_A } from "./fakes";

export const FORECAST_TODAY = "2026-01-15";
export const FORECAST_NOW = "2026-01-15T10:00:00.000Z";

export function makeInvoice(
  overrides: Partial<ForecastInvoiceInput> = {},
): ForecastInvoiceInput {
  return {
    id: "70000000-0000-4000-8000-000000000001",
    invoiceNumber: "INV-0001",
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

export function makeExpense(
  overrides: Partial<ForecastExpenseInput> = {},
): ForecastExpenseInput {
  return {
    id: "80000000-0000-4000-8000-000000000001",
    title: "Office rent",
    category: "RENT",
    amount: "50.00",
    dueDate: "2026-01-20",
    status: "UPCOMING",
    ...overrides,
  };
}

export function makeForecastInput(
  overrides: Partial<ForecastInput> = {},
): ForecastInput {
  return {
    currency: "USD",
    timezone: "UTC",
    today: FORECAST_TODAY,
    horizonDays: 30,
    openingBalance: "1000.00",
    openingBalanceDate: "2026-01-01",
    cashInSinceOpening: "0.00",
    cashOutSinceOpening: "0.00",
    calculatedAt: FORECAST_NOW,
    invoices: [],
    expenses: [],
    ...overrides,
  };
}

export type ForecastRepositoryCall = {
  method: keyof ForecastRepository;
  businessId: string;
  args: unknown[];
};

export type ForecastRepositorySeed = {
  contexts?: Record<string, ForecastBusinessContext>;
  cash?: Record<string, ForecastCashSums>;
  invoices?: Record<string, ForecastInvoiceInput[]>;
  expenses?: Record<string, ForecastExpenseInput[]>;
};

/**
 * In-memory forecast repository keyed by businessId. Rows seeded for another
 * business can never be returned for the requested one, which mirrors the real
 * repository's `WHERE business_id = $1` scoping. Every call is recorded so tests
 * can assert that no query ran without a verified business id.
 */
export function createFakeForecastRepository(seed: ForecastRepositorySeed = {}) {
  const contexts = seed.contexts ?? {
    [BUSINESS_A]: {
      currency: "USD",
      timezone: "UTC",
      openingBalance: "1000.00",
      openingBalanceDate: "2026-01-01",
    },
  };
  const cash = seed.cash ?? {};
  const invoices = seed.invoices ?? {};
  const expenses = seed.expenses ?? {};
  const calls: ForecastRepositoryCall[] = [];

  const repository: ForecastRepository = {
    async getBusinessContext(businessId) {
      calls.push({ method: "getBusinessContext", businessId, args: [] });
      return contexts[businessId] ?? null;
    },
    async getCashSums(businessId, currency, from, to) {
      calls.push({ method: "getCashSums", businessId, args: [currency, from, to] });
      return cash[businessId] ?? { cashIn: "0.00", cashOut: "0.00" };
    },
    async getEligibleInvoices(businessId, horizonEnd) {
      calls.push({ method: "getEligibleInvoices", businessId, args: [horizonEnd] });
      return invoices[businessId] ?? [];
    },
    async getEligibleExpenses(businessId, horizonEnd) {
      calls.push({ method: "getEligibleExpenses", businessId, args: [horizonEnd] });
      return expenses[businessId] ?? [];
    },
  };

  return { repository, calls };
}
