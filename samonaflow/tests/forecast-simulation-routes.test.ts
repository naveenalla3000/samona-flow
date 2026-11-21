import assert from "node:assert/strict";
import test from "node:test";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import {
  createForecastSimulationController,
  type Authenticate,
  type ForecastSimulationController,
} from "@/server/controllers/forecast-simulation-controller";
import { createForecastSimulationService } from "@/server/services/forecast-simulation-service";
import { BUSINESS_A, BUSINESS_B, USER_A, USER_B, createFakeMemberships } from "./helpers/fakes";
import {
  createFakeForecastRepository,
  makeExpense,
  makeInvoice,
  type ForecastRepositorySeed,
} from "./helpers/forecast-fakes";

// The route.ts file binds the controller to the real Supabase guard. These
// cases exercise the same controller with injected authentication and an
// in-memory repository, matching the other route tests in this project.

const NOW = new Date("2026-01-15T10:00:00.000Z");
const BASE = "http://localhost/api/v1/businesses";

function unauthenticated(): Response {
  return Response.json(
    { success: false, error: { code: "unauthenticated", message: "Authentication is required." } },
    { status: 401 },
  );
}

function authenticateAs(user: AuthenticatedUser | null): Authenticate {
  return async () => (user ? { ok: true, user } : { ok: false, response: unauthenticated() });
}

function setup(user: AuthenticatedUser | null = USER_A, seed: ForecastRepositorySeed = {}) {
  const fake = createFakeForecastRepository(seed);
  const service = createForecastSimulationService({
    repository: fake.repository,
    memberships: createFakeMemberships(),
    now: () => NOW,
  });
  const controller = createForecastSimulationController({
    authenticate: authenticateAs(user),
    service,
  });
  return { controller, ...fake };
}

function post(
  controller: ForecastSimulationController,
  businessId: string,
  body: unknown,
): Promise<Response> {
  return controller.create(
    new Request(`${BASE}/${businessId}/forecast/simulations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    businessId,
  );
}

function postRaw(
  controller: ForecastSimulationController,
  businessId: string,
  body: string,
): Promise<Response> {
  return controller.create(
    new Request(`${BASE}/${businessId}/forecast/simulations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }),
    businessId,
  );
}

test("POST returns the simulation in the success envelope with no-store caching", async () => {
  const invoice = makeInvoice({ dueDate: "2026-01-20" });
  const { controller } = setup(USER_A, { invoices: { [BUSINESS_A]: [invoice] } });

  const response = await post(controller, BUSINESS_A, {
    horizon: 30,
    adjustments: [
      { id: "a1", type: "delay_payment", invoiceId: invoice.id, date: "2026-01-25" },
    ],
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.currency, "USD");
  assert.equal(body.data.baseline.expectedIncoming, "100.00");
  assert.equal(body.data.simulated.expectedIncoming, "100.00");
  assert.equal(body.data.simulated.incoming[0].scheduledDate, "2026-01-25");
  assert.equal(body.data.adjustments.length, 1);
  assert.equal(body.data.daily.length, 30);
  assert.equal(body.data.comparison.projectedEndingBalance.delta, "0.00");
});

test("the default horizon is 30 and 60/90 are accepted", async () => {
  const { controller } = setup();

  const defaults = await (await post(controller, BUSINESS_A, {})).json();
  assert.equal(defaults.data.horizonDays, 30);
  assert.equal(defaults.data.daily.length, 30);

  for (const horizon of [60, 90]) {
    const response = await post(controller, BUSINESS_A, { horizon, adjustments: [] });
    const body = await response.json();
    assert.equal(response.status, 200, `horizon ${horizon}`);
    assert.equal(body.data.horizonDays, horizon);
    assert.equal(body.data.daily.length, horizon);
  }
});

test("an empty simulation reproduces the baseline through the API", async () => {
  const { controller } = setup(USER_A, {
    invoices: { [BUSINESS_A]: [makeInvoice({ dueDate: "2026-01-20" })] },
    expenses: { [BUSINESS_A]: [makeExpense({ dueDate: "2026-01-18" })] },
  });

  const body = await (await post(controller, BUSINESS_A, { adjustments: [] })).json();

  assert.deepEqual(body.data.simulated, body.data.baseline);
  assert.deepEqual(body.data.adjustments, []);
  assert.equal(body.data.comparison.expectedIncoming.delta, "0.00");
});

test("all supported adjustment types are accepted by the route", async () => {
  const invoice = makeInvoice({ dueDate: "2026-01-20", totalAmount: "100.00" });
  const expense = makeExpense({ dueDate: "2026-01-18", amount: "50.00" });
  const { controller } = setup(USER_A, {
    invoices: { [BUSINESS_A]: [invoice] },
    expenses: { [BUSINESS_A]: [expense] },
  });

  const response = await post(controller, BUSINESS_A, {
    horizon: 30,
    adjustments: [
      { id: "a1", type: "delay_payment", invoiceId: invoice.id, date: "2026-01-25" },
      { id: "a2", type: "change_amount", invoiceId: invoice.id, amount: "80.00" },
      { id: "a3", type: "increase_expense", expenseId: expense.id, amount: "10.00" },
      { id: "a4", type: "delay_expense", expenseId: expense.id, date: "2026-01-27" },
      {
        id: "a5",
        type: "add_expense",
        title: "New equipment",
        category: "EQUIPMENT",
        amount: "25.00",
        date: "2026-01-22",
      },
    ],
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.adjustments.length, 5);
  assert.equal(body.data.simulated.expectedIncoming, "80.00");
  assert.equal(body.data.simulated.expectedOutgoing, "85.00");
});

test("receive_earlier and reduce_expense are accepted", async () => {
  const invoice = makeInvoice({ dueDate: "2026-01-25", totalAmount: "100.00" });
  const expense = makeExpense({ dueDate: "2026-01-18", amount: "50.00" });
  const { controller } = setup(USER_A, {
    invoices: { [BUSINESS_A]: [invoice] },
    expenses: { [BUSINESS_A]: [expense] },
  });

  const body = await (
    await post(controller, BUSINESS_A, {
      adjustments: [
        { id: "a1", type: "receive_earlier", invoiceId: invoice.id, date: "2026-01-18" },
        { id: "a2", type: "reduce_expense", expenseId: expense.id, amount: "20.00" },
      ],
    })
  ).json();

  assert.equal(body.success, true);
  assert.equal(body.data.simulated.incoming[0].scheduledDate, "2026-01-18");
  assert.equal(body.data.simulated.expectedOutgoing, "30.00");
});

test("unauthenticated requests receive 401 and no repository access", async () => {
  const { controller, calls } = setup(null);
  const response = await post(controller, BUSINESS_A, { adjustments: [] });
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test("a non-member receives 403 and no data", async () => {
  const { controller, calls } = setup(USER_B);

  const response = await post(controller, BUSINESS_A, { adjustments: [] });

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error.code, "business_forbidden");
  assert.equal(calls.length, 0);
});

test("an invalid business id is rejected before the service runs", async () => {
  const { controller, calls } = setup();
  const response = await post(controller, "not-a-uuid", { adjustments: [] });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, "invalid_request");
  assert.equal(calls.length, 0);
});

test("invalid JSON is rejected with the standard envelope", async () => {
  const { controller } = setup();
  const response = await postRaw(controller, BUSINESS_A, "{not json");
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error.code, "invalid_request");
  assert.match(body.error.message, /valid JSON/);
});

test("invalid request shapes are rejected by Zod", async () => {
  const { controller } = setup();

  const cases: unknown[] = [
    null,
    { adjustments: "nope" },
    { horizon: 45, adjustments: [] },
    { adjustments: [{ id: "a1", type: "unknown_type" }] },
    {
      adjustments: [
        {
          id: "a1",
          type: "delay_payment",
          invoiceId: "not-a-uuid",
          date: "2026-01-25",
        },
      ],
    },
    {
      adjustments: [
        {
          id: "a1",
          type: "add_expense",
          title: "Test",
          category: "OTHER",
          amount: "-1.00",
          date: "2026-01-25",
        },
      ],
    },
    {
      adjustments: [
        {
          id: "a1",
          type: "delay_expense",
          expenseId: "80000000-0000-4000-8000-000000000001",
          date: "2026-02-30",
        },
      ],
    },
  ];

  for (const body of cases) {
    const response = await post(controller, BUSINESS_A, body);
    assert.equal(response.status, 400, JSON.stringify(body));
    const payload = await response.json();
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, "invalid_request");
  }
});

test("duplicate ids and conflicting adjustments are rejected by Zod", async () => {
  const invoice = makeInvoice({ dueDate: "2026-01-20" });
  const expense = makeExpense({ dueDate: "2026-01-20" });
  const { controller } = setup(USER_A, {
    invoices: { [BUSINESS_A]: [invoice] },
    expenses: { [BUSINESS_A]: [expense] },
  });

  const duplicateIds = await post(controller, BUSINESS_A, {
    adjustments: [
      { id: "same", type: "delay_payment", invoiceId: invoice.id, date: "2026-01-25" },
      { id: "same", type: "delay_expense", expenseId: expense.id, date: "2026-01-25" },
    ],
  });
  assert.equal(duplicateIds.status, 400);

  const conflictingDates = await post(controller, BUSINESS_A, {
    adjustments: [
      { id: "a1", type: "delay_payment", invoiceId: invoice.id, date: "2026-01-25" },
      { id: "a2", type: "receive_earlier", invoiceId: invoice.id, date: "2026-01-18" },
    ],
  });
  assert.equal(conflictingDates.status, 400);

  const conflictingAmounts = await post(controller, BUSINESS_A, {
    adjustments: [
      { id: "a1", type: "increase_expense", expenseId: expense.id, amount: "10.00" },
      { id: "a2", type: "reduce_expense", expenseId: expense.id, amount: "5.00" },
    ],
  });
  assert.equal(conflictingAmounts.status, 400);
});

test("semantic validation returns field errors for out-of-window dates", async () => {
  const invoice = makeInvoice({ dueDate: "2026-01-20" });
  const { controller } = setup(USER_A, { invoices: { [BUSINESS_A]: [invoice] } });

  const response = await post(controller, BUSINESS_A, {
    adjustments: [
      { id: "a1", type: "delay_payment", invoiceId: invoice.id, date: "2026-02-20" },
    ],
  });

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, "invalid_request");
  assert.equal(
    body.error.fieldErrors["adjustments.0.date"],
    "The date must be on or before the horizon end 2026-02-13.",
  );
});

test("foreign-currency invoices cannot be adjusted through the API", async () => {
  const eur = makeInvoice({
    id: "70000000-0000-4000-8000-000000000099",
    invoiceNumber: "INV-EUR",
    currency: "EUR",
    dueDate: "2026-01-20",
    totalAmount: "100.00",
  });
  const { controller } = setup(USER_A, { invoices: { [BUSINESS_A]: [eur] } });

  const response = await post(controller, BUSINESS_A, {
    adjustments: [
      { id: "a1", type: "delay_payment", invoiceId: eur.id, date: "2026-01-25" },
    ],
  });

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error.message, /Only USD invoices can be simulated/);
});

test("the route performs only business-scoped reads and leaves records unchanged", async () => {
  const invoice = makeInvoice({ dueDate: "2026-01-20", totalAmount: "100.00" });
  const expense = makeExpense({ dueDate: "2026-01-18", amount: "50.00" });
  const invoices = [invoice];
  const expenses = [expense];
  const invoiceSnapshot = JSON.parse(JSON.stringify(invoices));
  const expenseSnapshot = JSON.parse(JSON.stringify(expenses));

  const { controller, calls } = setup(USER_A, {
    invoices: { [BUSINESS_A]: invoices },
    expenses: { [BUSINESS_A]: expenses },
  });

  const response = await post(controller, BUSINESS_A, {
    adjustments: [
      { id: "a1", type: "delay_payment", invoiceId: invoice.id, date: "2026-01-27" },
      { id: "a2", type: "increase_expense", expenseId: expense.id, amount: "25.00" },
    ],
  });

  assert.equal(response.status, 200);
  assert.ok(calls.every((call) => call.businessId === BUSINESS_A));
  assert.ok(
    calls.every((call) =>
      [
        "getBusinessContext",
        "getCashSums",
        "getEligibleInvoices",
        "getEligibleExpenses",
      ].includes(call.method),
    ),
  );
  assert.deepEqual(invoices, invoiceSnapshot);
  assert.deepEqual(expenses, expenseSnapshot);
});

test("simulation responses are deterministic through the HTTP surface", async () => {
  const invoice = makeInvoice({ dueDate: "2026-01-20" });
  const { controller } = setup(USER_A, { invoices: { [BUSINESS_A]: [invoice] } });
  const body = {
    horizon: 60,
    adjustments: [
      { id: "a1", type: "delay_payment", invoiceId: invoice.id, date: "2026-02-01" },
    ],
  };

  const first = await (await post(controller, BUSINESS_A, body)).json();
  const second = await (await post(controller, BUSINESS_A, body)).json();

  assert.deepEqual(first, second);
});

test("a foreign business id cannot be simulated even with a valid body", async () => {
  const { controller, calls } = setup(USER_A);

  const response = await post(controller, BUSINESS_B, { adjustments: [] });

  assert.equal(response.status, 403);
  assert.equal(calls.length, 0);
});
