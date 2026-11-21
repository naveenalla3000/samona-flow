import assert from "node:assert/strict";
import test from "node:test";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import {
  createDashboardController,
  type Authenticate,
  type DashboardController,
} from "@/server/controllers/dashboard-controller";
import type { DashboardRepository } from "@/server/repositories/dashboard-repository";
import { createDashboardService } from "@/server/services/dashboard-service";
import { BUSINESS_A, USER_A, USER_B, createFakeMemberships } from "./helpers/fakes";

// The route.ts files bind dashboardApi to the real Supabase guard, so these cases
// wire the same controller with an injected authenticate and an in-memory repository.

type Endpoint = "summary" | "trends" | "receivables" | "recent-activity" | "reminders";

const METHODS: Record<Endpoint, keyof DashboardController> = {
  summary: "summary",
  trends: "trends",
  receivables: "receivables",
  "recent-activity": "recentActivity",
  reminders: "reminders",
};

const ENDPOINTS = Object.keys(METHODS) as Endpoint[];

const FINANCIAL_KEYS = [
  "totals",
  "amount",
  "byCurrency",
  "series",
  "totalAmount",
  "outstanding",
  "collected",
  "invoiced",
  "expenses",
  "rows",
];

const UNAUTHORIZED = () =>
  Response.json(
    { error: "unauthenticated", message: "Authentication is required." },
    { status: 401 },
  );

/** In-memory repository: fixed rows, no database. Cast because only the service's calls are stubbed. */
function createFakeDashboardRepository(): DashboardRepository {
  const repository = {
    async getOpeningBalance() {
      return { currency: "USD", openingBalance: "0.00", openingBalanceDate: "2026-01-01", timezone: "UTC" };
    },
    async getIssuedInvoiceTotals() {
      return [
        { currency: "USD", invoiceCount: 1, totalAmount: "100.00", outstanding: "60.00", overdueOutstanding: "0.00" },
      ];
    },
    async getActivePaymentSums() {
      return [{ currency: "USD", amount: "40.00" }];
    },
    async getIssuedInvoicesInRange() {
      return [{ currency: "USD", invoiceCount: 1, totalAmount: "100.00" }];
    },
    async getPaidExpenseSums() {
      return { count: 1, amount: "12.50" };
    },
    async getUpcomingAndOverdueExpenses() {
      return {
        horizonEnd: "2026-02-01",
        upcoming: { count: 0, amount: "0.00" },
        overdue: { count: 0, amount: "0.00" },
      };
    },
    async getCashWindowSums() {
      return { payments: [{ currency: "USD", amount: "40.00" }], expenses: { count: 1, amount: "12.50" } };
    },
    async getCustomerCount() {
      return 1;
    },
    async getReminderRows() {
      return { overdue: [], upcoming: [], overdueCount: 0, upcomingCount: 0 };
    },
    async getBucketedSeries() {
      return [];
    },
    async getReceivableRows() {
      return {
        rows: [
          {
            id: "60000000-0000-4000-8000-000000000001",
            invoiceNumber: "INV-0001",
            customerName: "Acme Studio",
            currency: "USD",
            totalAmount: "100.00",
            amountPaid: "40.00",
            outstanding: "60.00",
            dueDate: "2026-01-15",
            status: "ISSUED",
            isOverdue: false,
          },
        ],
        nextCursor: null,
      };
    },
    async getRecentInvoices() {
      return [];
    },
    async getRecentActivePayments() {
      return [];
    },
  };
  return repository as unknown as DashboardRepository;
}

function setup(options: { user?: AuthenticatedUser | null } = {}): DashboardController {
  const authenticate: Authenticate = async () => {
    const user = options.user === undefined ? USER_A : options.user;
    return user ? { ok: true, user } : { ok: false, response: UNAUTHORIZED() };
  };
  const service = createDashboardService({
    repository: createFakeDashboardRepository(),
    memberships: createFakeMemberships(),
  });
  return createDashboardController({ authenticate, service });
}

function call(
  controller: DashboardController,
  endpoint: Endpoint,
  query = "",
  businessId = BUSINESS_A,
): Promise<Response> {
  const url = `http://localhost/api/v1/businesses/${businessId}/dashboard/${endpoint}${query}`;
  return controller[METHODS[endpoint]](new Request(url), businessId);
}

function assertNoFinancialFields(payload: unknown) {
  const text = JSON.stringify(payload);
  for (const key of FINANCIAL_KEYS) {
    assert.equal(text.includes(`"${key}"`), false, `response leaked financial field "${key}"`);
  }
}

const VALID_QUERIES: Record<Endpoint, string> = {
  summary: "?from=2026-01-01&to=2026-01-31",
  trends: "?from=2026-01-01&to=2026-03-31&granularity=month",
  receivables: "",
  "recent-activity": "",
  reminders: "",
};

test("no session returns 401 and no financial fields on every endpoint", async () => {
  const controller = setup({ user: null });
  for (const endpoint of ENDPOINTS) {
    const response = await call(controller, endpoint, VALID_QUERIES[endpoint]);
    assert.equal(response.status, 401, endpoint);
    assertNoFinancialFields(await response.json());
  }
});

test("a non-member gets the membership error and no financial fields on every endpoint", async () => {
  // USER_B is a member of a different business only, so BUSINESS_A must be refused.
  const controller = setup({ user: USER_B });
  for (const endpoint of ENDPOINTS) {
    const response = await call(controller, endpoint, VALID_QUERIES[endpoint]);
    assert.equal(response.status, 403, endpoint);
    const payload = await response.json();
    assert.equal(payload.success, false, endpoint);
    assert.equal(payload.error.code, "business_forbidden", endpoint);
    assertNoFinancialFields(payload);
  }
});

test("a member gets 200 with a success envelope from each of the five endpoints", async () => {
  const controller = setup();
  for (const endpoint of ENDPOINTS) {
    const response = await call(controller, endpoint, VALID_QUERIES[endpoint]);
    assert.equal(response.status, 200, endpoint);
    const payload = await response.json();
    assert.equal(payload.success, true, endpoint);
    assert.notEqual(payload.data, undefined, endpoint);
  }
});

test("invalid query parameters return the invalid_request envelope", async () => {
  const controller = setup();
  const badQueries: [Endpoint, string][] = [
    ["summary", "?from=2026-01-01"],
    ["trends", "?from=2026-01-01&to=2026-03-31&granularity=year"],
    ["receivables", "?limit=500"],
    ["recent-activity", "?limit=21"],
  ];
  for (const [endpoint, query] of badQueries) {
    const response = await call(controller, endpoint, query);
    assert.equal(response.status, 400, `${endpoint}${query}`);
    const payload = await response.json();
    assert.equal(payload.success, false, `${endpoint}${query}`);
    assert.equal(payload.error.code, "invalid_request", `${endpoint}${query}`);
  }
});

test("summary range over 366 days returns invalid_request", async () => {
  const controller = setup();
  const response = await call(controller, "summary", "?from=2025-01-01&to=2026-06-30");
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.success, false);
  assert.equal(payload.error.code, "invalid_request");
});

test("money fields are serialized as JSON strings, never numbers", async () => {
  const controller = setup();

  const summary = await (await call(controller, "summary", VALID_QUERIES.summary)).json();
  const totals = summary.data.totals;
  for (const [name, total] of Object.entries<{ amount: unknown; byCurrency?: Record<string, unknown> }>(totals)) {
    assert.equal(typeof total.amount, "string", name);
    for (const [code, value] of Object.entries(total.byCurrency ?? {})) {
      assert.equal(typeof value, "string", `${name}.byCurrency.${code}`);
    }
  }

  const trends = await (await call(controller, "trends", VALID_QUERIES.trends)).json();
  assert.ok(trends.data.series.length > 0);
  for (const bucket of trends.data.series) {
    for (const field of ["collected", "invoiced", "expenses"]) {
      assert.equal(typeof bucket[field].amount, "string", field);
    }
  }

  const receivables = await (await call(controller, "receivables")).json();
  assert.equal(typeof receivables.data.rows[0].totalAmount, "string");
  assert.equal(typeof receivables.data.rows[0].outstanding, "string");
});
