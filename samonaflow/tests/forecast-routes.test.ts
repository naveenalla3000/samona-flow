import assert from "node:assert/strict";
import test from "node:test";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import {
  createForecastController,
  type Authenticate,
  type ForecastController,
} from "@/server/controllers/forecast-controller";
import { createForecastService } from "@/server/services/forecast-service";
import { BUSINESS_A, USER_A, USER_B, createFakeMemberships } from "./helpers/fakes";
import {
  createFakeForecastRepository,
  makeExpense,
  makeInvoice,
  type ForecastRepositorySeed,
} from "./helpers/forecast-fakes";

// The route.ts files bind forecastApi to the real Supabase guard, so these cases
// exercise the same controller with injected authentication and an in-memory
// repository. Money stays a canonical 2dp string in every response.

const NOW = new Date("2026-01-15T10:00:00.000Z");
const BASE = "http://localhost/api/v1/businesses";

type Endpoint = "summary" | "daily" | "monthly";

const METHODS: Record<Endpoint, keyof ForecastController> = {
  summary: "summary",
  daily: "daily",
  monthly: "monthly",
};

const ENDPOINTS = Object.keys(METHODS) as Endpoint[];

const DATA_KEY: Record<Endpoint, string> = {
  summary: "currency",
  daily: "days",
  monthly: "months",
};

function unauthenticated(): Response {
  return Response.json(
    { success: false, error: { code: "unauthenticated", message: "Authentication is required." } },
    { status: 401 },
  );
}

function authenticateAs(user: AuthenticatedUser | null): Authenticate {
  return async () => (user ? { ok: true, user } : { ok: false, response: unauthenticated() });
}

function makeRequest(businessId: string, path = "", query = ""): Request {
  return new Request(`${BASE}/${businessId}/forecast${path}${query}`);
}

function setup(user: AuthenticatedUser | null = USER_A, seed: ForecastRepositorySeed = {}) {
  const fake = createFakeForecastRepository(seed);
  const service = createForecastService({
    repository: fake.repository,
    memberships: createFakeMemberships(),
    now: () => NOW,
  });
  const controller = createForecastController({ authenticate: authenticateAs(user), service });
  return { controller, ...fake };
}

function call(
  controller: ForecastController,
  endpoint: Endpoint,
  businessId: string,
  query = "",
): Promise<Response> {
  const path = endpoint === "summary" ? "" : `/${endpoint}`;
  return controller[METHODS[endpoint]](makeRequest(businessId, path, query), businessId);
}

test("all three forecast endpoints return the success envelope", async () => {
  const { controller } = setup();

  for (const endpoint of ENDPOINTS) {
    const response = await call(controller, endpoint, BUSINESS_A);
    assert.equal(response.status, 200, endpoint);
    assert.equal(response.headers.get("cache-control"), "no-store", endpoint);
    const body = await response.json();
    assert.equal(body.success, true, endpoint);
    assert.ok(body.data[DATA_KEY[endpoint]], endpoint);
  }
});

test("the default horizon is 30 days", async () => {
  const { controller } = setup();
  const body = await (await call(controller, "summary", BUSINESS_A)).json();
  assert.equal(body.data.horizonDays, 30);
  assert.equal(body.data.daily.length, 30);
});

test("the PRD's days parameter and the horizon parameter both select the horizon", async () => {
  const { controller } = setup();

  const days = await (await call(controller, "summary", BUSINESS_A, "?days=60")).json();
  assert.equal(days.data.horizonDays, 60);
  assert.equal(days.data.daily.length, 60);

  const horizon = await (await call(controller, "summary", BUSINESS_A, "?horizon=90")).json();
  assert.equal(horizon.data.horizonDays, 90);
  assert.equal(horizon.data.daily.length, 90);
});

test("the daily endpoint returns only the daily series", async () => {
  const { controller } = setup(USER_A, {
    invoices: { [BUSINESS_A]: [makeInvoice({ dueDate: "2026-01-20" })] },
  });

  const response = await call(controller, "daily", BUSINESS_A, "?horizon=60");
  const body = await response.json();
  assert.equal(body.data.days.length, 60);
  assert.equal(body.data.days[5].incoming, "100.00");
  assert.equal(body.data.incoming, undefined);
});

test("the monthly endpoint returns calendar-month summaries", async () => {
  const { controller } = setup(USER_A, {
    expenses: { [BUSINESS_A]: [makeExpense({ dueDate: "2026-02-02", amount: "40.00" })] },
  });

  const response = await call(controller, "monthly", BUSINESS_A, "?horizon=90");
  const body = await response.json();
  assert.equal(body.data.months[0].month, "2026-01");
  assert.equal(body.data.months[1].month, "2026-02");
  assert.equal(body.data.months[1].outgoing, "40.00");
});

test("unsupported horizons are rejected with field errors", async () => {
  const { controller } = setup();

  for (const value of ["45", "0", "-30", "abc", "30.5"]) {
    const response = await call(controller, "summary", BUSINESS_A, `?horizon=${value}`);
    assert.equal(response.status, 400, value);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, "invalid_request");
    assert.ok(body.error.fieldErrors.horizon, value);
  }
});

test("supplying both horizon and days is rejected", async () => {
  const { controller } = setup();
  const response = await call(controller, "summary", BUSINESS_A, "?horizon=30&days=60");
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error.fieldErrors.horizon, /either horizon or days/i);
});

test("unauthenticated requests receive 401", async () => {
  const { controller, calls } = setup(null);

  for (const endpoint of ENDPOINTS) {
    const response = await call(controller, endpoint, BUSINESS_A);
    assert.equal(response.status, 401, endpoint);
  }
  assert.equal(calls.length, 0, "no query may run for an unauthenticated request");
});

test("a malformed business id is rejected before any query", async () => {
  const { controller, calls } = setup();
  const response = await call(controller, "summary", "not-a-uuid");
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, "invalid_request");
  assert.match(body.error.fieldErrors.form, /Invalid business id/);
  assert.equal(calls.length, 0);
});

test("a member of another business receives 403 and no data", async () => {
  const { controller, calls } = setup(USER_B);

  for (const endpoint of ENDPOINTS) {
    const response = await call(controller, endpoint, BUSINESS_A);
    assert.equal(response.status, 403, endpoint);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, "business_forbidden");
    assert.equal(body.data, undefined);
  }
  assert.equal(calls.length, 0);
});

test("response amounts are canonical 2dp strings and balances reconcile", async () => {
  const { controller } = setup(USER_A, {
    cash: { [BUSINESS_A]: { cashIn: "0.10", cashOut: "0.20" } },
    invoices: {
      [BUSINESS_A]: [makeInvoice({ dueDate: "2026-01-20", totalAmount: "0.30", amountPaid: "0.10" })],
    },
    expenses: { [BUSINESS_A]: [makeExpense({ dueDate: "2026-01-21", amount: "0.05" })] },
  });

  const body = await (await call(controller, "summary", BUSINESS_A)).json();
  const data = body.data;

  assert.match(data.openingBalance, /^-?\d+\.\d{2}$/);
  assert.match(data.expectedIncoming, /^-?\d+\.\d{2}$/);
  assert.match(data.expectedOutgoing, /^-?\d+\.\d{2}$/);
  assert.match(data.projectedEndingBalance, /^-?\d+\.\d{2}$/);

  // 1000.00 + 0.10 - 0.20 = 999.90 current cash.
  assert.equal(data.openingBalance, "999.90");
  assert.equal(data.expectedIncoming, "0.20");
  assert.equal(data.expectedOutgoing, "0.05");
  assert.equal(data.projectedEndingBalance, "1000.05");
  assert.equal(data.daily.at(-1).projectedBalance, "1000.05");
});
