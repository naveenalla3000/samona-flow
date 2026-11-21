import assert from "node:assert/strict";
import test from "node:test";
import { businessLocalDate } from "@/lib/business-date";
import { addDays, headlineTotals, daysBetween, resolvePreset } from "@/lib/dashboard-metrics";
import { calculateForecast } from "@/lib/forecast-math";
import { parseMoney } from "@/lib/invoice-math";
import type { ListAlertsQuery } from "@/lib/validations/alert";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import type {
  DashboardRepository,
  OpeningBalance,
  ReminderRow,
} from "@/server/repositories/dashboard-repository";
import { createDashboardService, DashboardServiceError } from "@/server/services/dashboard-service";
import type { AlertCounts, AlertRecord } from "@/types/alert";
import type { ForecastHorizon, ForecastResult } from "@/types/forecast";
import { makeAlert, INVOICE_A } from "./helpers/alert-fakes";
import { BUSINESS_A, BUSINESS_B, USER_A, USER_B, createFakeMemberships } from "./helpers/fakes";
import { makeExpense, makeForecastInput, makeInvoice } from "./helpers/forecast-fakes";

// In-memory fake repository. Amounts are 2dp major-unit strings in the store;
// the fake derives every aggregate from the store, so mutations are reflected
// on the next call. Reversal exclusion is modelled by the `reversals` list,
// mirroring the real query's NOT EXISTS on payment_reversals.

type Payment = { id: string; currency: string; amount: string; paymentDate: string };
type Invoice = { currency: string; status: string; issueDate: string; totalAmount: string; outstanding: string };
type Expense = { currency: string; status: string; amount: string; paymentDate: string };
type UpcomingExpense = {
  id: string;
  title: string;
  category: string;
  amount: string;
  dueDate: string;
  status: string;
  isOverdue: boolean;
};
type TransactionPayment = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  currency: string;
  amount: string;
  paymentDate: string;
};
type TransactionExpense = {
  id: string;
  title: string;
  category: string;
  amount: string;
  paymentDate: string;
};

interface Store {
  profile: OpeningBalance;
  payments: Payment[];
  reversals: string[];
  invoices: Invoice[];
  expenses: Expense[];
  customers: number;
  reminders: { overdue: ReminderRow[]; upcoming: ReminderRow[] };
  upcomingExpenses: UpcomingExpense[];
  transactionPayments: TransactionPayment[];
  transactionExpenses: TransactionExpense[];
}

const ISSUED = ["SENT", "PARTIALLY_PAID", "OVERDUE"];


function makeStore(overrides: Partial<Store> = {}): Store {
  return {
    profile: {
      currency: "USD",
      openingBalance: "1000.00",
      openingBalanceDate: "2020-01-01",
      timezone: "Asia/Kolkata",
    },
    payments: [],
    reversals: [],
    invoices: [],
    expenses: [],
    customers: 0,
    reminders: { overdue: [], upcoming: [] },
    upcomingExpenses: [],
    transactionPayments: [],
    transactionExpenses: [],
    ...overrides,
  };
}

function fmt(minor: bigint): string {
  const digits = minor.toString().padStart(3, "0");
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

function sumByCurrency(rows: { currency: string; amount: string }[]) {
  const totals = new Map<string, bigint>();
  for (const row of rows) {
    totals.set(row.currency, (totals.get(row.currency) ?? BigInt(0)) + parseMoney(row.amount));
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, minor]) => ({ currency, amount: fmt(minor) }));
}

function activePayments(store: Store, from: string, to: string) {
  return store.payments.filter(
    (p) => !store.reversals.includes(p.id) && p.paymentDate >= from && p.paymentDate <= to,
  );
}

function paidExpenses(store: Store, from: string, to: string) {
  const rows = store.expenses.filter(
    (e) => e.status === "PAID" && e.paymentDate >= from && e.paymentDate <= to,
  );
  const total = rows.reduce((sum, e) => sum + parseMoney(e.amount), BigInt(0));
  return { count: rows.length, amount: fmt(total) };
}

function makeRepo(store: Store, overrides: Record<string, unknown> = {}) {
  const calls: { name: string; args: unknown[] }[] = [];
  const record =
    <A extends unknown[], R>(name: string, fn: (...args: A) => R) =>
    (...args: A): R => {
      calls.push({ name, args });
      return fn(...args);
    };

  const methods = {
    getOpeningBalance: record("getOpeningBalance", async () => store.profile),
    getIssuedInvoiceTotals: record("getIssuedInvoiceTotals", async () => {
      const issued = store.invoices.filter((i) => ISSUED.includes(i.status));
      const currencies = [...new Set(issued.map((i) => i.currency))].sort();
      return currencies.map((currency) => {
        const rows = issued.filter((i) => i.currency === currency);
        const sum = (pick: (i: Invoice) => string) =>
          fmt(rows.reduce((total, i) => total + parseMoney(pick(i)), BigInt(0)));
        return {
          currency,
          invoiceCount: rows.length,
          totalAmount: sum((i) => i.totalAmount),
          outstanding: sum((i) => i.outstanding),
          overdueOutstanding: sum((i) => (i.status === "OVERDUE" ? i.outstanding : "0.00")),
        };
      });
    }),
    getActivePaymentSums: record("getActivePaymentSums", async (_b: string, from: string, to: string) =>
      sumByCurrency(
        activePayments(store, from, to).map((p) => ({ currency: p.currency, amount: p.amount })),
      ),
    ),
    getIssuedInvoicesInRange: record("getIssuedInvoicesInRange", async (_b: string, from: string, to: string) => {
      const inRange = store.invoices.filter(
        (i) => ISSUED.includes(i.status) && i.issueDate >= from && i.issueDate <= to,
      );
      return sumByCurrency(inRange.map((i) => ({ currency: i.currency, amount: i.totalAmount }))).map(
        ({ currency, amount }) => ({
          currency,
          invoiceCount: inRange.filter((i) => i.currency === currency).length,
          totalAmount: amount,
        }),
      );
    }),
    getPaidExpenseSums: record("getPaidExpenseSums", async (_b: string, from: string, to: string) =>
      paidExpenses(store, from, to),
    ),
    getUpcomingAndOverdueExpenses: record("getUpcomingAndOverdueExpenses", async (_b: string, today: string) => ({
      horizonEnd: today,
      upcoming: { count: 0, amount: "0.00" },
      overdue: { count: 0, amount: "0.00" },
    })),
    getCashWindowSums: record("getCashWindowSums", async (_b: string, from: string, to: string) => ({
      payments: sumByCurrency(
        activePayments(store, from, to).map((p) => ({ currency: p.currency, amount: p.amount })),
      ),
      expenses: paidExpenses(store, from, to),
    })),
    getCustomerCount: record("getCustomerCount", async () => store.customers),
    getReminderRows: record("getReminderRows", async () => ({
      overdue: store.reminders.overdue,
      upcoming: store.reminders.upcoming,
      overdueCount: store.reminders.overdue.length,
      upcomingCount: store.reminders.upcoming.length,
    })),
    getBucketedSeries: record("getBucketedSeries", async () => []),
    getReceivableRows: record("getReceivableRows", async () => ({ rows: [], nextCursor: null })),
    getUpcomingExpenseRows: record(
      "getUpcomingExpenseRows",
      async (_b: string, _today: string, limit: number) =>
        store.upcomingExpenses
          .filter((e) => e.status === "UPCOMING" || e.status === "OVERDUE")
          .sort(
            (a, b) =>
              Number(b.isOverdue) - Number(a.isOverdue) ||
              a.dueDate.localeCompare(b.dueDate) ||
              a.id.localeCompare(b.id),
          )
          .slice(0, limit),
    ),
    getPaymentTransactionRows: record(
      "getPaymentTransactionRows",
      async (_b: string, limit: number) =>
        store.transactionPayments
          .filter((p) => !store.reversals.includes(p.id))
          .sort(
            (a, b) =>
              b.paymentDate.localeCompare(a.paymentDate) || a.id.localeCompare(b.id),
          )
          .slice(0, limit),
    ),
    getPaidExpenseTransactionRows: record(
      "getPaidExpenseTransactionRows",
      async (_b: string, limit: number) =>
        store.transactionExpenses
          .sort(
            (a, b) =>
              b.paymentDate.localeCompare(a.paymentDate) || a.id.localeCompare(b.id),
          )
          .slice(0, limit),
    ),
    getRecentInvoices: record("getRecentInvoices", async () => []),
    getRecentActivePayments: record("getRecentActivePayments", async () => []),
  };

  const repo = { ...methods, ...overrides } as unknown as DashboardRepository;
  return { repo, calls };
}

function forecastResult(horizon: ForecastHorizon = 30): ForecastResult {
  return calculateForecast(
    makeForecastInput({
      horizonDays: horizon,
      invoices: [
        makeInvoice({
          id: "70000000-0000-4000-8000-000000000010",
          dueDate: "2026-01-20",
          totalAmount: "100.00",
        }),
      ],
      expenses: [
        makeExpense({
          id: "80000000-0000-4000-8000-000000000010",
          dueDate: "2026-01-18",
          amount: "50.00",
        }),
      ],
    }),
  );
}

function makeForecastService() {
  const calls: { user: AuthenticatedUser; businessId: string; horizon: ForecastHorizon }[] = [];
  return {
    calls,
    service: {
      async getForecast(
        user: AuthenticatedUser,
        businessId: string,
        query: { horizon: ForecastHorizon },
      ): Promise<ForecastResult> {
        calls.push({ user, businessId, horizon: query.horizon });
        return forecastResult(query.horizon);
      },
    },
  };
}

function makeAlertService(items: AlertRecord[] = []) {
  const calls: { user: AuthenticatedUser; businessId: string; query: ListAlertsQuery }[] = [];
  const counts: AlertCounts = {
    active: items.length,
    unread: items.filter((item) => !item.isRead).length,
    critical: items.filter((item) => item.severity === "CRITICAL").length,
    warning: items.filter((item) => item.severity === "WARNING").length,
    info: items.filter((item) => item.severity === "INFO").length,
  };
  return {
    calls,
    service: {
      async list(user: AuthenticatedUser, businessId: string, query: ListAlertsQuery) {
        calls.push({ user, businessId, query });
        return {
          items,
          total: items.length,
          page: query.page,
          pageSize: query.pageSize,
          totalPages: items.length === 0 ? 0 : 1,
          counts,
        };
      },
    },
  };
}

function setup(
  store: Store = makeStore(),
  overrides: Record<string, unknown> = {},
  options: { alerts?: AlertRecord[] } = {},
) {
  const { repo, calls } = makeRepo(store, overrides);
  const forecast = makeForecastService();
  const alerts = makeAlertService(options.alerts);
  const service = createDashboardService({
    repository: repo,
    memberships: createFakeMemberships(),
    forecast: forecast.service,
    alerts: alerts.service,
  });
  return { service, calls, store, forecast, alerts };
}

const RANGE = { from: "2024-03-01", to: "2024-03-31" };
const TREND = { from: "2024-03-01", to: "2024-03-31", granularity: "month" as const };

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    assert.ok(error instanceof DashboardServiceError, `unexpected error: ${String(error)}`);
    return error.code;
  }
}

test("a non-member of business A is rejected on every operation and no repository method runs", async () => {
  const { service, calls } = setup(makeStore());
  const attempts: [string, () => Promise<unknown>][] = [
    ["getSummary", () => service.getSummary(USER_B, BUSINESS_A, {})],
    ["getTrends", () => service.getTrends(USER_B, BUSINESS_A, TREND)],
    ["getReceivables", () => service.getReceivables(USER_B, BUSINESS_A, { limit: 25 })],
    ["getUpcomingExpenses", () => service.getUpcomingExpenses(USER_B, BUSINESS_A, { limit: 10 })],
    ["getCashFlow", () => service.getCashFlow(USER_B, BUSINESS_A, { horizon: 30 })],
    ["getActions", () => service.getActions(USER_B, BUSINESS_A, { limit: 5 })],
    ["getTransactions", () => service.getTransactions(USER_B, BUSINESS_A, { limit: 10 })],
    ["getRecentActivity", () => service.getRecentActivity(USER_B, BUSINESS_A, { limit: 10 })],
    ["getReminders", () => service.getReminders(USER_B, BUSINESS_A)],
  ];
  for (const [name, attempt] of attempts) {
    assert.equal(await codeOf(attempt()), "BUSINESS_FORBIDDEN", name);
  }
  assert.deepEqual(calls, []);
});

test("an empty user id is rejected as forbidden before any repository call", async () => {
  const { service, calls } = setup();
  const anonymous: AuthenticatedUser = { id: "", email: "" };
  assert.equal(await codeOf(service.getSummary(anonymous, BUSINESS_A, {})), "BUSINESS_FORBIDDEN");
  assert.deepEqual(calls, []);
});

test("a missing (null) user is rejected and no repository call is made", async () => {
  const { service, calls } = setup();
  await assert.rejects(service.getSummary(null as unknown as AuthenticatedUser, BUSINESS_A, {}));
  assert.deepEqual(calls, []);
});

test("a member of A passing businessId B is rejected and the repository never sees B", async () => {
  const { service, calls } = setup();
  assert.equal(await codeOf(service.getSummary(USER_A, BUSINESS_B, {})), "BUSINESS_FORBIDDEN");
  assert.equal(await codeOf(service.getTrends(USER_A, BUSINESS_B, TREND)), "BUSINESS_FORBIDDEN");
  assert.equal(
    await codeOf(service.getUpcomingExpenses(USER_A, BUSINESS_B, { limit: 10 })),
    "BUSINESS_FORBIDDEN",
  );
  assert.equal(
    await codeOf(service.getCashFlow(USER_A, BUSINESS_B, { horizon: 30 })),
    "BUSINESS_FORBIDDEN",
  );
  assert.equal(
    await codeOf(service.getActions(USER_A, BUSINESS_B, { limit: 5 })),
    "BUSINESS_FORBIDDEN",
  );
  assert.equal(
    await codeOf(service.getTransactions(USER_A, BUSINESS_B, { limit: 10 })),
    "BUSINESS_FORBIDDEN",
  );
  assert.ok(!JSON.stringify(calls).includes(BUSINESS_B));
  assert.deepEqual(calls, []);
});

test("repository calls always receive the verified businessId, never a query value", async () => {
  const { service, calls, forecast, alerts } = setup();
  const hostileSummary = { preset: "this_month" as const, businessId: BUSINESS_B };
  const hostileReceivables = { limit: 25, businessId: BUSINESS_B };
  const hostileActivity = { limit: 10, businessId: BUSINESS_B };
  await service.getSummary(USER_A, BUSINESS_A, hostileSummary);
  await service.getTrends(USER_A, BUSINESS_A, { ...TREND, businessId: BUSINESS_B } as typeof TREND);
  await service.getReceivables(USER_A, BUSINESS_A, hostileReceivables);
  await service.getUpcomingExpenses(USER_A, BUSINESS_A, { limit: 10, businessId: BUSINESS_B } as never);
  await service.getCashFlow(USER_A, BUSINESS_A, { horizon: 30, businessId: BUSINESS_B } as never);
  await service.getActions(USER_A, BUSINESS_A, { limit: 5, businessId: BUSINESS_B } as never);
  await service.getTransactions(USER_A, BUSINESS_A, { limit: 10, businessId: BUSINESS_B } as never);
  await service.getRecentActivity(USER_A, BUSINESS_A, hostileActivity);
  await service.getReminders(USER_A, BUSINESS_A);
  assert.ok(calls.length > 0);
  assert.ok(calls.every((call) => call.args[0] === BUSINESS_A), "every call uses BUSINESS_A");
  assert.ok(!JSON.stringify(calls).includes(BUSINESS_B));
  assert.ok(forecast.calls.every((call) => call.businessId === BUSINESS_A));
  assert.ok(alerts.calls.every((call) => call.businessId === BUSINESS_A));
});

test("summary income ignores a reversed payment and uses the repository's active total", async () => {
  const store = makeStore({
    payments: [
      { id: "p1", currency: "USD", amount: "100.00", paymentDate: "2024-03-10" },
      { id: "p2", currency: "USD", amount: "500.00", paymentDate: "2024-03-11" },
    ],
    reversals: ["p2"],
  });
  const { service } = setup(store, {
    getActivePaymentSums: async () => [{ currency: "USD", amount: "100.00" }],
  });
  const result = await service.getSummary(USER_A, BUSINESS_A, RANGE);
  assert.equal(result.totals.incomeInPeriod.amount, "10000");
  assert.equal(result.totals.netCashMovementInPeriod.amount, "10000");
});

test("summary headline sums only the business currency; other currencies appear in byCurrency", async () => {
  const store = makeStore({
    payments: [
      { id: "p1", currency: "USD", amount: "100.00", paymentDate: "2024-03-10" },
      { id: "p2", currency: "EUR", amount: "40.00", paymentDate: "2024-03-10" },
    ],
  });
  const { service } = setup(store);
  const result = await service.getSummary(USER_A, BUSINESS_A, RANGE);
  assert.equal(result.totals.incomeInPeriod.amount, "10000");
  assert.deepEqual(result.totals.incomeInPeriod.byCurrency, { EUR: "4000", USD: "10000" });
  // excludedCount is computed by headlineTotals but is not serialized by the service.
  const pure = headlineTotals(
    [
      { currency: "USD", amount: BigInt(10000) },
      { currency: "EUR", amount: BigInt(4000) },
    ],
    "USD",
  );
  assert.equal(pure.excludedCount, 1);
});

test("an empty business yields zero amounts, empty byCurrency and zero customers", async () => {
  const { service } = setup(makeStore());
  const result = await service.getSummary(USER_A, BUSINESS_A, RANGE);
  const { totals, counts } = result;
  assert.deepEqual(totals.incomeInPeriod, { amount: "0", byCurrency: {} });
  assert.deepEqual(totals.expensesInPeriod, { amount: "0", byCurrency: {} });
  assert.deepEqual(totals.totalReceivables, { amount: "0", byCurrency: {} });
  assert.equal(totals.netCashMovementInPeriod.amount, "0");
  assert.equal(totals.availableCash.amount, "100000");
  assert.deepEqual(totals.upcomingExpenses, { count: 0, amount: "0" });
  assert.equal(counts.customers, 0);
  assert.equal(counts.issuedInvoices, 0);
});

test("net cash movement equals income minus expenses; available cash is opening plus cash net", async () => {
  const store = makeStore({
    payments: [{ id: "p1", currency: "USD", amount: "100.00", paymentDate: "2024-03-10" }],
    expenses: [{ currency: "USD", status: "PAID", amount: "30.00", paymentDate: "2024-03-12" }],
  });
  const { service } = setup(store);
  const { totals } = await service.getSummary(USER_A, BUSINESS_A, RANGE);
  const income = BigInt(totals.incomeInPeriod.amount);
  const expenses = BigInt(totals.expensesInPeriod.amount);
  assert.equal(totals.netCashMovementInPeriod.amount, (income - expenses).toString());
  // opening 1000.00 + cash income 100.00 - cash expenses 30.00
  assert.equal(totals.availableCash.amount, "107000");
});

test("a preset resolves against the business timezone (Asia/Kolkata)", async () => {
  const { service } = setup(makeStore());
  const result = await service.getSummary(USER_A, BUSINESS_A, { preset: "last_30_days" });
  // The service reads the real clock internally and does not accept an injected "today",
  // so the expected range is derived from the same timezone at test time.
  const expected = resolvePreset("last_30_days", businessLocalDate("Asia/Kolkata"));
  assert.deepEqual(result.range, expected);
});

test("a range longer than 366 days is rejected with INVALID_REQUEST", async () => {
  const { service, calls } = setup(makeStore());
  const tooLong = { from: "2024-01-01", to: "2025-01-01" }; // 367 inclusive days
  assert.equal(await codeOf(service.getSummary(USER_A, BUSINESS_A, tooLong)), "INVALID_REQUEST");
  assert.equal(
    await codeOf(service.getTrends(USER_A, BUSINESS_A, { ...tooLong, granularity: "day" })),
    "INVALID_REQUEST",
  );
  assert.ok(!calls.some((call) => call.name === "getIssuedInvoiceTotals"));
});

test("summary totals reflect each mutation: payment, reversal, invoice, expense", async () => {
  const store = makeStore();
  const { service } = setup(store);
  const read = () => service.getSummary(USER_A, BUSINESS_A, RANGE);

  assert.equal((await read()).totals.incomeInPeriod.amount, "0");

  store.payments.push({ id: "p1", currency: "USD", amount: "100.00", paymentDate: "2024-03-10" });
  let result = await read();
  assert.equal(result.totals.incomeInPeriod.amount, "10000");
  assert.equal(result.totals.netCashMovementInPeriod.amount, "10000");

  store.reversals.push("p1");
  result = await read();
  assert.equal(result.totals.incomeInPeriod.amount, "0", "reversal reduces income back to zero");
  assert.equal(result.totals.netCashMovementInPeriod.amount, "0");

  store.invoices.push({
    currency: "USD",
    status: "SENT",
    issueDate: "2024-03-05",
    totalAmount: "200.00",
    outstanding: "200.00",
  });
  result = await read();
  assert.equal(result.totals.invoicedInPeriod.amount, "20000");
  assert.equal(result.totals.totalReceivables.amount, "20000");
  assert.equal(result.counts.issuedInvoices, 1);

  store.expenses.push({ currency: "USD", status: "PAID", amount: "30.00", paymentDate: "2024-03-12" });
  result = await read();
  assert.equal(result.totals.expensesInPeriod.amount, "3000");
  assert.equal(result.totals.netCashMovementInPeriod.amount, "-3000");
});

test("last_90_days resolves to 90 inclusive business-local days", async () => {
  const { service } = setup(makeStore());
  const result = await service.getSummary(USER_A, BUSINESS_A, { preset: "last_90_days" });
  const expected = resolvePreset("last_90_days", businessLocalDate("Asia/Kolkata"));
  assert.deepEqual(result.range, expected);
  assert.equal(daysBetween(result.range.from, result.range.to) + 1, 90);
});

test("all four page presets resolve against the same business-local today", async () => {
  const { service } = setup(makeStore());
  const today = businessLocalDate("Asia/Kolkata");
  const presets = ["this_month", "last_month", "last_30_days", "last_90_days"] as const;

  for (const preset of presets) {
    const result = await service.getSummary(USER_A, BUSINESS_A, { preset });
    assert.deepEqual(result.range, resolvePreset(preset, today), preset);
    assert.ok(result.range.from <= result.range.to, `${preset} has an ordered range`);
    assert.ok(result.range.to <= today, `${preset} never ends in the future`);
  }
});

test("upcoming expenses exclude paid/cancelled rows, order overdue first and derive display status", async () => {
  const today = businessLocalDate("Asia/Kolkata");
  const store = makeStore({
    upcomingExpenses: [
      {
        id: "e-upcoming",
        title: "Internet",
        category: "INTERNET",
        amount: "40.00",
        dueDate: addDays(today, 10),
        status: "UPCOMING",
        isOverdue: false,
      },
      {
        id: "e-overdue",
        title: "Office rent",
        category: "RENT",
        amount: "500.00",
        dueDate: addDays(today, -5),
        status: "UPCOMING",
        isOverdue: true,
      },
      {
        id: "e-paid",
        title: "Already paid",
        category: "OTHER",
        amount: "10.00",
        dueDate: addDays(today, -20),
        status: "PAID",
        isOverdue: false,
      },
      {
        id: "e-cancelled",
        title: "Cancelled",
        category: "OTHER",
        amount: "20.00",
        dueDate: addDays(today, -10),
        status: "CANCELLED",
        isOverdue: false,
      },
    ],
  });
  const { service, calls } = setup(store);

  const result = await service.getUpcomingExpenses(USER_A, BUSINESS_A, { limit: 10 });

  assert.deepEqual(result.rows.map((row) => row.id), ["e-overdue", "e-upcoming"]);
  assert.equal(result.rows[0].displayStatus, "OVERDUE");
  assert.equal(result.rows[0].isOverdue, true);
  assert.equal(result.rows[1].displayStatus, "UPCOMING");
  assert.equal(result.rows[0].currency, "USD");
  const call = calls.find((entry) => entry.name === "getUpcomingExpenseRows");
  assert.equal(call?.args[0], BUSINESS_A);
  assert.equal(call?.args[1], today);
});

test("cash-flow overview delegates to the forecast engine and maps its result", async () => {
  const { service, forecast } = setup(makeStore());
  const result = await service.getCashFlow(USER_A, BUSINESS_A, { horizon: 60 });
  const expected = forecastResult(60);

  assert.equal(result.horizonDays, 60);
  assert.equal(result.currentCash, expected.openingBalance);
  assert.equal(result.expectedIncoming, expected.expectedIncoming);
  assert.equal(result.expectedOutgoing, expected.expectedOutgoing);
  assert.equal(result.netCashFlow, expected.netCashFlow);
  assert.equal(result.projectedClosing, expected.projectedEndingBalance);
  assert.equal(result.lowestProjectedBalance, expected.lowestProjectedBalance);
  assert.equal(result.lowestProjectedDate, expected.lowestProjectedDate);
  assert.equal(result.shortageDate, expected.shortageDate);
  assert.equal(result.becomesNegative, expected.becomesNegative);
  assert.equal(result.series.length, 60);
  assert.deepEqual(result.series[0], {
    date: expected.daily[0].date,
    incoming: expected.daily[0].incoming,
    outgoing: expected.daily[0].outgoing,
    balance: expected.daily[0].projectedBalance,
  });
  assert.deepEqual(forecast.calls.map((call) => call.horizon), [60]);
  assert.equal(forecast.calls[0].businessId, BUSINESS_A);
});

test("cash-flow overview preserves a negative projection and its shortage date", async () => {
  const negative = calculateForecast(
    makeForecastInput({
      horizonDays: 30,
      openingBalance: "-50.00",
      invoices: [],
      expenses: [],
    }),
  );
  assert.equal(negative.becomesNegative, true);
  const { repo } = makeRepo(makeStore());
  const service = createDashboardService({
    repository: repo,
    memberships: createFakeMemberships(),
    forecast: { async getForecast() { return negative; } },
    alerts: makeAlertService().service,
  });

  const result = await service.getCashFlow(USER_A, BUSINESS_A, { horizon: 30 });
  assert.equal(result.becomesNegative, true);
  assert.equal(result.shortageDate, negative.shortageDate);
  assert.equal(result.lowestProjectedBalance, negative.lowestProjectedBalance);
  assert.equal(result.series[0].balance, negative.daily[0].projectedBalance);
});

test("action center delegates to the alert service, keeps critical-first order and links records", async () => {
  const critical = makeAlert({
    id: "91000000-0000-4000-8000-000000000001",
    severity: "CRITICAL",
    relatedEntityType: "INVOICE",
    relatedEntityId: INVOICE_A,
    isRead: false,
  });
  const forecastAlert = makeAlert({
    id: "91000000-0000-4000-8000-000000000002",
    type: "POTENTIAL_SHORTAGE",
    severity: "WARNING",
    relatedEntityType: "FORECAST",
    relatedEntityId: null,
    isRead: true,
  });
  const unlinked = makeAlert({
    id: "91000000-0000-4000-8000-000000000003",
    type: "CUSTOMER_CONCENTRATION",
    severity: "INFO",
    relatedEntityType: null,
    relatedEntityId: null,
    isRead: true,
  });
  const { service, alerts } = setup(makeStore(), {}, {
    alerts: [critical, forecastAlert, unlinked],
  });

  const result = await service.getActions(USER_A, BUSINESS_A, { limit: 5 });

  assert.deepEqual(result.items.map((item) => item.id), [
    critical.id,
    forecastAlert.id,
    unlinked.id,
  ]);
  assert.equal(result.items[0].alertHref, `/dashboard/alerts/${critical.id}`);
  assert.equal(result.items[0].record?.href, `/dashboard/invoices/${INVOICE_A}`);
  assert.equal(result.items[1].record?.href, "/dashboard/forecast");
  assert.equal(result.items[1].record?.id, null);
  assert.equal(result.items[2].record, null);
  assert.equal(result.items[0].isRead, false);
  assert.equal(result.counts.critical, 1);
  assert.equal(result.counts.warning, 1);
  assert.equal(result.counts.unread, 1);
  assert.equal(alerts.calls.length, 1);
  assert.equal(alerts.calls[0].query.sort, "severity");
  assert.equal(alerts.calls[0].query.direction, "desc");
  assert.equal(alerts.calls[0].query.status, "active");
  assert.equal(alerts.calls[0].query.pageSize, 5);
  assert.equal(alerts.calls[0].businessId, BUSINESS_A);
});

test("recent transactions merge active payments and paid expenses, newest first", async () => {
  const store = makeStore({
    reversals: ["p-reversed"],
    transactionPayments: [
      {
        id: "p-old",
        invoiceId: "70000000-0000-4000-8000-000000000001",
        invoiceNumber: "INV-0001",
        customerName: "Acme Studio",
        currency: "USD",
        amount: "100.00",
        paymentDate: "2026-01-10",
      },
      {
        id: "p-new",
        invoiceId: "70000000-0000-4000-8000-000000000002",
        invoiceNumber: "INV-0002",
        customerName: "Beta Labs",
        currency: "USD",
        amount: "25.00",
        paymentDate: "2026-01-20",
      },
      {
        id: "p-reversed",
        invoiceId: "70000000-0000-4000-8000-000000000003",
        invoiceNumber: "INV-0003",
        customerName: "Gamma Co",
        currency: "USD",
        amount: "999.00",
        paymentDate: "2026-01-25",
      },
    ],
    transactionExpenses: [
      {
        id: "e-paid",
        title: "Office rent",
        category: "RENT",
        amount: "50.00",
        paymentDate: "2026-01-15",
      },
    ],
  });
  const { service } = setup(store);

  const result = await service.getTransactions(USER_A, BUSINESS_A, { limit: 10 });

  assert.deepEqual(result.items.map((item) => `${item.kind}:${item.id}`), [
    "PAYMENT:p-new",
    "EXPENSE:e-paid",
    "PAYMENT:p-old",
  ]);
  assert.equal(result.items[0].direction, "in");
  assert.equal(result.items[0].reference, "INV-0002");
  assert.equal(result.items[0].href, "/dashboard/payments/p-new");
  assert.equal(result.items[1].direction, "out");
  assert.equal(result.items[1].href, "/dashboard/expenses/e-paid");
  assert.equal(result.items[1].currency, "USD");
  assert.ok(!result.items.some((item) => item.id === "p-reversed"));
});

test("recent transactions honor the requested limit after merging both sources", async () => {
  const store = makeStore({
    transactionPayments: [
      {
        id: "p-1",
        invoiceId: "70000000-0000-4000-8000-000000000001",
        invoiceNumber: "INV-0001",
        customerName: "Acme Studio",
        currency: "USD",
        amount: "10.00",
        paymentDate: "2026-01-20",
      },
      {
        id: "p-2",
        invoiceId: "70000000-0000-4000-8000-000000000002",
        invoiceNumber: "INV-0002",
        customerName: "Beta Labs",
        currency: "USD",
        amount: "20.00",
        paymentDate: "2026-01-18",
      },
    ],
    transactionExpenses: [
      {
        id: "e-1",
        title: "Internet",
        category: "INTERNET",
        amount: "30.00",
        paymentDate: "2026-01-19",
      },
    ],
  });
  const { service } = setup(store);

  const result = await service.getTransactions(USER_A, BUSINESS_A, { limit: 2 });
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items.map((item) => item.id), ["p-1", "e-1"]);
});

test("new dashboard sections return useful empty shapes for an empty business", async () => {
  const { service } = setup(makeStore());

  const [upcoming, actions, transactions] = await Promise.all([
    service.getUpcomingExpenses(USER_A, BUSINESS_A, { limit: 10 }),
    service.getActions(USER_A, BUSINESS_A, { limit: 5 }),
    service.getTransactions(USER_A, BUSINESS_A, { limit: 10 }),
  ]);

  assert.deepEqual(upcoming.rows, []);
  assert.equal(upcoming.currency, "USD");
  assert.deepEqual(actions.items, []);
  assert.equal(actions.total, 0);
  assert.equal(actions.counts.active, 0);
  assert.deepEqual(transactions.items, []);
  assert.equal(transactions.currency, "USD");
});
