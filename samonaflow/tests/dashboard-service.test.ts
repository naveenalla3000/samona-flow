import assert from "node:assert/strict";
import test from "node:test";
import { businessLocalDate } from "@/lib/business-date";
import { headlineTotals, resolvePreset } from "@/lib/dashboard-metrics";
import { parseMoney } from "@/lib/invoice-math";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import type {
  DashboardRepository,
  OpeningBalance,
  ReminderRow,
} from "@/server/repositories/dashboard-repository";
import { createDashboardService, DashboardServiceError } from "@/server/services/dashboard-service";
import { BUSINESS_A, BUSINESS_B, USER_A, USER_B, createFakeMemberships } from "./helpers/fakes";

// In-memory fake repository. Amounts are 2dp major-unit strings in the store;
// the fake derives every aggregate from the store, so mutations are reflected
// on the next call. Reversal exclusion is modelled by the `reversals` list,
// mirroring the real query's NOT EXISTS on payment_reversals.

type Payment = { id: string; currency: string; amount: string; paymentDate: string };
type Invoice = { currency: string; status: string; issueDate: string; totalAmount: string; outstanding: string };
type Expense = { currency: string; status: string; amount: string; paymentDate: string };

interface Store {
  profile: OpeningBalance;
  payments: Payment[];
  reversals: string[];
  invoices: Invoice[];
  expenses: Expense[];
  customers: number;
  reminders: { overdue: ReminderRow[]; upcoming: ReminderRow[] };
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
    getRecentInvoices: record("getRecentInvoices", async () => []),
    getRecentActivePayments: record("getRecentActivePayments", async () => []),
  };

  const repo = { ...methods, ...overrides } as unknown as DashboardRepository;
  return { repo, calls };
}

function setup(store: Store = makeStore(), overrides: Record<string, unknown> = {}) {
  const { repo, calls } = makeRepo(store, overrides);
  const service = createDashboardService({ repository: repo, memberships: createFakeMemberships() });
  return { service, calls, store };
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
  assert.ok(!JSON.stringify(calls).includes(BUSINESS_B));
  assert.deepEqual(calls, []);
});

test("repository calls always receive the verified businessId, never a query value", async () => {
  const { service, calls } = setup();
  const hostileSummary = { preset: "this_month" as const, businessId: BUSINESS_B };
  const hostileReceivables = { limit: 25, businessId: BUSINESS_B };
  const hostileActivity = { limit: 10, businessId: BUSINESS_B };
  await service.getSummary(USER_A, BUSINESS_A, hostileSummary);
  await service.getTrends(USER_A, BUSINESS_A, { ...TREND, businessId: BUSINESS_B } as typeof TREND);
  await service.getReceivables(USER_A, BUSINESS_A, hostileReceivables);
  await service.getRecentActivity(USER_A, BUSINESS_A, hostileActivity);
  await service.getReminders(USER_A, BUSINESS_A);
  assert.ok(calls.length > 0);
  assert.ok(calls.every((call) => call.args[0] === BUSINESS_A), "every call uses BUSINESS_A");
  assert.ok(!JSON.stringify(calls).includes(BUSINESS_B));
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
