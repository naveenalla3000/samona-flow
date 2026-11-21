import assert from "node:assert/strict";
import test from "node:test";
import { addDays } from "@/lib/dashboard-metrics";
import type { ForecastQuery } from "@/lib/validations/forecast";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import type { ForecastBusinessContext } from "@/server/repositories/forecast-repository";
import {
  createForecastService,
  ForecastServiceError,
} from "@/server/services/forecast-service";
import type { ForecastHorizon } from "@/types/forecast";
import { BUSINESS_A, BUSINESS_B, USER_A, USER_B, createFakeMemberships } from "./helpers/fakes";
import {
  createFakeForecastRepository,
  makeExpense,
  makeInvoice,
  type ForecastRepositorySeed,
} from "./helpers/forecast-fakes";

const NOW = new Date("2026-01-15T10:00:00.000Z");

function query(horizon: ForecastHorizon = 30): ForecastQuery {
  return { horizon };
}

function setup(seed: ForecastRepositorySeed = {}, now: Date = NOW) {
  const fake = createFakeForecastRepository(seed);
  const service = createForecastService({
    repository: fake.repository,
    memberships: createFakeMemberships(),
    now: () => now,
  });
  return { service, ...fake };
}

async function expectForbidden(promise: Promise<unknown>): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ForecastServiceError);
    assert.equal(error.code, "BUSINESS_FORBIDDEN");
    return true;
  });
}

test("an authorized member receives a forecast scoped to their business", async () => {
  const { service, calls } = setup({
    invoices: { [BUSINESS_A]: [makeInvoice({ dueDate: "2026-01-20" })] },
  });

  const result = await service.getForecast(USER_A, BUSINESS_A, query());

  assert.equal(result.currency, "USD");
  assert.equal(result.startDate, "2026-01-15");
  assert.equal(result.endDate, "2026-02-13");
  assert.equal(result.expectedIncoming, "100.00");
  assert.ok(calls.length >= 4);
  assert.ok(calls.every((call) => call.businessId === BUSINESS_A));
});

test("a user cannot read another business's forecast", async () => {
  const { service, calls } = setup();

  await expectForbidden(service.getForecast(USER_B, BUSINESS_A, query()));
  await expectForbidden(service.getForecast(USER_A, BUSINESS_B, query()));
  assert.equal(calls.length, 0, "no repository query may run before authorization");
});

test("a membership without a business row is rejected", async () => {
  const fake = createFakeForecastRepository({ contexts: {} });
  const service = createForecastService({
    repository: fake.repository,
    memberships: createFakeMemberships(),
    now: () => NOW,
  });

  await expectForbidden(service.getForecast(USER_A, BUSINESS_A, query()));
});

test("cash sums are read from the opening balance date through business-local today", async () => {
  const { service, calls } = setup({
    cash: { [BUSINESS_A]: { cashIn: "250.00", cashOut: "100.00" } },
  });

  const result = await service.getForecast(USER_A, BUSINESS_A, query());

  const cashCall = calls.find((call) => call.method === "getCashSums");
  assert.deepEqual(cashCall?.args, ["USD", "2026-01-01", "2026-01-15"]);
  assert.equal(result.openingBalance, "1150.00");
});

test("today is resolved in the business timezone, not the server timezone", async () => {
  const kolkata: ForecastBusinessContext = {
    currency: "INR",
    timezone: "Asia/Kolkata",
    openingBalance: "0.00",
    openingBalanceDate: "2026-01-01",
  };
  const seed: ForecastRepositorySeed = { contexts: { [BUSINESS_A]: kolkata } };

  // 20:00 UTC is 01:30 the next day in Asia/Kolkata (UTC+05:30).
  const lateUtc = setup(seed, new Date("2026-01-15T20:00:00.000Z"));
  const lateResult = await lateUtc.service.getForecast(USER_A, BUSINESS_A, query());
  assert.equal(lateResult.today, "2026-01-16");
  assert.equal(lateResult.startDate, "2026-01-16");

  // 18:29:59 UTC is still 23:59:59 on the same local day.
  const earlyUtc = setup(seed, new Date("2026-01-15T18:29:59.000Z"));
  const earlyResult = await earlyUtc.service.getForecast(USER_A, BUSINESS_A, query());
  assert.equal(earlyResult.today, "2026-01-15");

  const cashCall = lateUtc.calls.find((call) => call.method === "getCashSums");
  assert.deepEqual(cashCall?.args, ["INR", "2026-01-01", "2026-01-16"]);
});

test("the repository is queried only up to the requested horizon end", async () => {
  for (const horizon of [30, 60, 90] as ForecastHorizon[]) {
    const { service, calls } = setup();
    const result = await service.getForecast(USER_A, BUSINESS_A, query(horizon));
    const expectedEnd = addDays("2026-01-15", horizon - 1);

    assert.equal(result.daily.length, horizon);
    assert.equal(result.endDate, expectedEnd);
    assert.deepEqual(
      calls.find((call) => call.method === "getEligibleInvoices")?.args,
      [expectedEnd],
    );
    assert.deepEqual(
      calls.find((call) => call.method === "getEligibleExpenses")?.args,
      [expectedEnd],
    );
  }
});

test("invoices and expenses from another business never enter the result", async () => {
  const { service } = setup({
    invoices: {
      [BUSINESS_A]: [makeInvoice({ invoiceNumber: "INV-A", dueDate: "2026-01-20" })],
      [BUSINESS_B]: [
        makeInvoice({
          id: "70000000-0000-4000-8000-000000000099",
          invoiceNumber: "INV-B",
          dueDate: "2026-01-20",
          totalAmount: "999.00",
        }),
      ],
    },
    expenses: {
      [BUSINESS_A]: [makeExpense({ title: "Rent A", dueDate: "2026-01-21", amount: "50.00" })],
      [BUSINESS_B]: [
        makeExpense({
          id: "80000000-0000-4000-8000-000000000099",
          title: "Rent B",
          dueDate: "2026-01-21",
          amount: "999.00",
        }),
      ],
    },
  });

  const result = await service.getForecast(USER_A, BUSINESS_A, query());
  assert.equal(result.expectedIncoming, "100.00");
  assert.equal(result.expectedOutgoing, "50.00");
  assert.deepEqual(
    result.incoming.map((item) => item.invoiceNumber),
    ["INV-A"],
  );
  assert.deepEqual(
    result.outgoing.map((item) => item.title),
    ["Rent A"],
  );
});

test("getDaily returns only the daily series plus horizon metadata", async () => {
  const { service } = setup({
    invoices: { [BUSINESS_A]: [makeInvoice({ dueDate: "2026-01-20" })] },
  });

  const daily = await service.getDaily(USER_A, BUSINESS_A, query(60));
  assert.equal(daily.days.length, 60);
  assert.equal(daily.currency, "USD");
  assert.equal(daily.horizonDays, 60);
  assert.equal(daily.startDate, "2026-01-15");
  assert.equal(daily.endDate, "2026-03-15");
  assert.equal(daily.days[5]?.incoming, "100.00");
});

test("getMonthly returns calendar-month summaries", async () => {
  const { service } = setup({
    invoices: { [BUSINESS_A]: [makeInvoice({ dueDate: "2026-02-01" })] },
  });

  const monthly = await service.getMonthly(USER_A, BUSINESS_A, query(90));
  assert.equal(monthly.months[0]?.month, "2026-01");
  assert.equal(monthly.months[1]?.month, "2026-02");
  assert.equal(monthly.months[1]?.incoming, "100.00");
  assert.equal(monthly.months.at(-1)?.closingBalance, "1100.00");
});

test("identical inputs and clock produce identical results", async () => {
  const seed: ForecastRepositorySeed = {
    invoices: { [BUSINESS_A]: [makeInvoice({ dueDate: "2026-01-20", totalAmount: "123.45" })] },
    expenses: { [BUSINESS_A]: [makeExpense({ dueDate: "2026-01-22", amount: "23.45" })] },
  };
  const first = setup(seed);
  const second = setup(seed);

  const [left, right] = await Promise.all([
    first.service.getForecast(USER_A, BUSINESS_A, query(90)),
    second.service.getForecast(USER_A, BUSINESS_A, query(90)),
  ]);
  assert.deepEqual(left, right);
});

test("the service never mutates the authenticated user or its inputs", async () => {
  const user: AuthenticatedUser = { ...USER_A };
  const seed: ForecastRepositorySeed = {
    invoices: { [BUSINESS_A]: [makeInvoice({ dueDate: "2026-01-20" })] },
  };
  const { service } = setup(seed);

  await service.getForecast(user, BUSINESS_A, query());
  assert.deepEqual(user, USER_A);
  assert.equal(seed.invoices?.[BUSINESS_A]?.length, 1);
});
