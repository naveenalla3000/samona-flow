import assert from "node:assert/strict";
import test from "node:test";
import { addDays } from "@/lib/dashboard-metrics";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import {
  createForecastSimulationService,
  ForecastSimulationServiceError,
} from "@/server/services/forecast-simulation-service";
import type { ForecastHorizon } from "@/types/forecast";
import type { ForecastAdjustment, ForecastSimulationRequest } from "@/types/forecast-simulation";
import { BUSINESS_A, BUSINESS_B, USER_A, USER_B, createFakeMemberships } from "./helpers/fakes";
import {
  createFakeForecastRepository,
  makeExpense,
  makeInvoice,
  type ForecastRepositorySeed,
} from "./helpers/forecast-fakes";

const NOW = new Date("2026-01-15T10:00:00.000Z");

function request(
  adjustments: ForecastAdjustment[] = [],
  horizon: ForecastHorizon = 30,
): ForecastSimulationRequest {
  return { horizon, adjustments };
}

function setup(seed: ForecastRepositorySeed = {}, now: Date = NOW) {
  const fake = createFakeForecastRepository(seed);
  const service = createForecastSimulationService({
    repository: fake.repository,
    memberships: createFakeMemberships(),
    now: () => now,
  });
  return { service, ...fake };
}

async function expectForbidden(promise: Promise<unknown>): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ForecastSimulationServiceError);
    assert.equal(error.code, "BUSINESS_FORBIDDEN");
    return true;
  });
}

async function expectInvalid(
  promise: Promise<unknown>,
  message: RegExp,
): Promise<ForecastSimulationServiceError> {
  let captured: ForecastSimulationServiceError | null = null;
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ForecastSimulationServiceError);
    assert.equal(error.code, "INVALID_REQUEST");
    assert.match(error.message, message);
    captured = error;
    return true;
  });
  assert.ok(captured);
  return captured;
}

test("an authorized member receives a business-scoped simulation", async () => {
  const invoice = makeInvoice({ dueDate: "2026-01-20", totalAmount: "100.00" });
  const { service, calls } = setup({
    invoices: { [BUSINESS_A]: [invoice] },
  });

  const result = await service.simulate(USER_A, BUSINESS_A, request());

  assert.equal(result.currency, "USD");
  assert.equal(result.baseline.expectedIncoming, "100.00");
  assert.equal(result.simulated.expectedIncoming, "100.00");
  assert.equal(result.daily.length, 30);
  assert.ok(calls.length >= 4);
  assert.ok(calls.every((call) => call.businessId === BUSINESS_A));
});

test("a user cannot simulate another business's forecast", async () => {
  const { service, calls } = setup();

  await expectForbidden(service.simulate(USER_B, BUSINESS_A, request()));
  await expectForbidden(service.simulate(USER_A, BUSINESS_B, request()));
  assert.equal(calls.length, 0, "no repository query may run before authorization");
});

test("a membership without a business row is rejected", async () => {
  const fake = createFakeForecastRepository({ contexts: {} });
  const service = createForecastSimulationService({
    repository: fake.repository,
    memberships: createFakeMemberships(),
    now: () => NOW,
  });

  await expectForbidden(service.simulate(USER_A, BUSINESS_A, request()));
});

test("the repository is read only up to the requested horizon end", async () => {
  for (const horizon of [30, 60, 90] as ForecastHorizon[]) {
    const { service, calls } = setup();
    const result = await service.simulate(USER_A, BUSINESS_A, request([], horizon));

    const invoiceCall = calls.find((call) => call.method === "getEligibleInvoices");
    const expenseCall = calls.find((call) => call.method === "getEligibleExpenses");
    const expectedEnd = addDays("2026-01-15", horizon - 1);

    assert.deepEqual(invoiceCall?.args, [expectedEnd]);
    assert.deepEqual(expenseCall?.args, [expectedEnd]);
    assert.equal(result.daily.length, horizon);
    assert.equal(result.endDate, expectedEnd);

    for (const call of calls) {
      assert.ok(
        [
          "getBusinessContext",
          "getCashSums",
          "getEligibleInvoices",
          "getEligibleExpenses",
        ].includes(call.method),
        `unexpected write-like repository method ${call.method}`,
      );
    }
  }
});

test("an invalid adjustment becomes an INVALID_REQUEST with field errors", async () => {
  const invoice = makeInvoice({ dueDate: "2026-01-20" });
  const { service } = setup({ invoices: { [BUSINESS_A]: [invoice] } });

  const error = await expectInvalid(
    service.simulate(
      USER_A,
      BUSINESS_A,
      request([
        {
          id: "a1",
          type: "delay_payment",
          invoiceId: invoice.id,
          date: "2026-01-19",
        },
      ]),
    ),
    /must be after the current scheduled date/,
  );

  assert.equal(
    error.fieldErrors?.["adjustments.0.date"],
    "The delayed date must be after the current scheduled date 2026-01-20.",
  );
});

test("a reference from another business cannot be simulated through an authorized one", async () => {
  const foreignInvoice = makeInvoice({
    id: "70000000-0000-4000-8000-000000000099",
    invoiceNumber: "INV-FOREIGN",
    dueDate: "2026-01-20",
  });
  const { service } = setup({
    invoices: { [BUSINESS_B]: [foreignInvoice] },
  });

  await expectInvalid(
    service.simulate(
      USER_A,
      BUSINESS_A,
      request([
        {
          id: "a1",
          type: "delay_payment",
          invoiceId: foreignInvoice.id,
          date: "2026-01-25",
        },
      ]),
    ),
    /not part of this business's forecast window/,
  );
});

test("the service never mutates the records it read", async () => {
  const invoice = makeInvoice({ dueDate: "2026-01-20", totalAmount: "100.00" });
  const expense = makeExpense({ dueDate: "2026-01-18", amount: "50.00" });
  const invoices = [invoice];
  const expenses = [expense];
  const invoiceSnapshot = JSON.parse(JSON.stringify(invoices));
  const expenseSnapshot = JSON.parse(JSON.stringify(expenses));

  const { service } = setup({
    invoices: { [BUSINESS_A]: invoices },
    expenses: { [BUSINESS_A]: expenses },
  });

  const result = await service.simulate(
    USER_A,
    BUSINESS_A,
    request([
      { id: "a1", type: "delay_payment", invoiceId: invoice.id, date: "2026-01-27" },
      { id: "a2", type: "increase_expense", expenseId: expense.id, amount: "25.00" },
    ]),
  );

  assert.deepEqual(invoices, invoiceSnapshot);
  assert.deepEqual(expenses, expenseSnapshot);
  assert.equal(result.baseline.expectedIncoming, "100.00");
  assert.equal(result.simulated.expectedIncoming, "100.00");
  assert.equal(result.baseline.expectedOutgoing, "50.00");
  assert.equal(result.simulated.expectedOutgoing, "75.00");
  assert.equal(result.adjustments.length, 2);
});

test("an empty simulation returns the unchanged baseline", async () => {
  const { service } = setup({
    invoices: { [BUSINESS_A]: [makeInvoice({ dueDate: "2026-01-20" })] },
    expenses: { [BUSINESS_A]: [makeExpense({ dueDate: "2026-01-18" })] },
  });

  const result = await service.simulate(USER_A, BUSINESS_A, request());

  assert.deepEqual(result.simulated, result.baseline);
  assert.deepEqual(result.adjustments, []);
  assert.equal(result.comparison.expectedIncoming.delta, "0.00");
  assert.equal(result.comparison.expectedOutgoing.delta, "0.00");
});

test("business-local today is used for the simulation window", async () => {
  const kolkata = {
    currency: "INR",
    timezone: "Asia/Kolkata",
    openingBalance: "0.00",
    openingBalanceDate: "2026-01-01",
  };
  const invoice = makeInvoice({
    id: "70000000-0000-4000-8000-000000000030",
    currency: "INR",
    dueDate: "2026-01-20",
    totalAmount: "100.00",
  });
  const seed: ForecastRepositorySeed = {
    contexts: { [BUSINESS_A]: kolkata },
    invoices: { [BUSINESS_A]: [invoice] },
  };

  // 20:00 UTC is 01:30 the next day in Asia/Kolkata (UTC+05:30).
  const { service } = setup(seed, new Date("2026-01-15T20:00:00.000Z"));
  const result = await service.simulate(
    USER_A,
    BUSINESS_A,
    request([
      { id: "a1", type: "delay_payment", invoiceId: invoice.id, date: "2026-01-25" },
    ]),
  );

  assert.equal(result.today, "2026-01-16");
  assert.equal(result.startDate, "2026-01-16");
  assert.equal(result.calculatedAt, "2026-01-15T20:00:00.000Z");
  assert.equal(result.simulated.incoming[0]?.scheduledDate, "2026-01-25");
});

test("simulation results are deterministic for a fixed clock and snapshot", async () => {
  const invoice = makeInvoice({ dueDate: "2026-01-20" });
  const { service } = setup({ invoices: { [BUSINESS_A]: [invoice] } });
  const adjustments: ForecastAdjustment[] = [
    { id: "a1", type: "delay_payment", invoiceId: invoice.id, date: "2026-01-27" },
  ];

  const first = await service.simulate(USER_A, BUSINESS_A, request(adjustments));
  const second = await service.simulate(USER_A, BUSINESS_A, request(adjustments));

  assert.deepEqual(first, second);
});

test("unauthenticated ownership is never inferred from the request", async () => {
  // The service signature requires a verified user. A caller cannot supply a
  // businessId owned by someone else without a membership row for that pair.
  const { service } = setup();
  const impostor: AuthenticatedUser = {
    id: "10000000-0000-4000-8000-000000000099",
    email: "impostor@example.com",
  };

  await expectForbidden(service.simulate(impostor, BUSINESS_A, request()));
});
