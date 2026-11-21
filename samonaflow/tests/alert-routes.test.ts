import assert from "node:assert/strict";
import test from "node:test";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import {
  createAlertController,
  type Authenticate,
} from "@/server/controllers/alert-controller";
import { createAlertService } from "@/server/services/alert-service";
import {
  BUSINESS_A,
  BUSINESS_B,
  CUSTOMER_A,
  CUSTOMER_B,
  USER_A,
  USER_B,
  createFakeMemberships,
} from "./helpers/fakes";
import {
  createFakeForecastRepository,
  type ForecastRepositorySeed,
} from "./helpers/forecast-fakes";
import {
  createFakeAlertRepository,
  INVOICE_A,
  INVOICE_B,
  INVOICE_REFERENCE,
  makeAlert,
  makeAlertExpense,
  makeAlertInvoice,
  type AlertRepositorySeed,
} from "./helpers/alert-fakes";

// The route.ts files bind alertApi to the real Supabase guard, so these cases
// exercise the same controller with injected authentication and in-memory
// repositories. Money and timestamps stay canonical in every response.

const NOW = new Date("2026-01-15T10:00:00.000Z");
const base = `http://localhost/api/v1/businesses/${BUSINESS_A}`;
const UNAUTHORIZED = () =>
  Response.json(
    { success: false, error: { code: "unauthenticated", message: "Authentication is required." } },
    { status: 401 },
  );

const CONTEXT = {
  currency: "USD",
  timezone: "UTC",
  openingBalance: "1000.00",
  openingBalanceDate: "2026-01-01",
};

function setup(
  options: {
    authenticateAs?: AuthenticatedUser | null;
    alerts?: AlertRepositorySeed;
    forecast?: ForecastRepositorySeed;
  } = {},
) {
  const alerts = createFakeAlertRepository(options.alerts);
  const forecast = createFakeForecastRepository({
    contexts: {
      [BUSINESS_A]: CONTEXT,
      [BUSINESS_B]: CONTEXT,
    },
    cash: {},
    ...options.forecast,
  });
  const service = createAlertService({
    alerts: alerts.repository,
    memberships: createFakeMemberships(),
    forecast: forecast.repository,
    now: () => NOW,
  });
  const authenticate: Authenticate = async () => {
    const user = options.authenticateAs === undefined ? USER_A : options.authenticateAs;
    return user ? { ok: true, user } : { ok: false, response: UNAUTHORIZED() };
  };
  const controller = createAlertController({ authenticate, service });
  return { controller, service, alerts, forecast };
}

function request(method: string, url: string): Request {
  return new Request(url, { method });
}

async function seedOverdue(
  controller: ReturnType<typeof createAlertController>,
): Promise<{ id: string }> {
  const response = await controller.evaluate(request("POST", `${base}/alerts/evaluate`), BUSINESS_A);
  assert.equal(response.status, 200);
  const list = await controller.list(request("GET", `${base}/alerts`), BUSINESS_A);
  const payload = await list.json();
  assert.equal(payload.data.items.length, 1);
  return payload.data.items[0];
}

test("every endpoint rejects an unauthenticated request before any query", async () => {
  const { controller, alerts, forecast } = setup({ authenticateAs: null });

  const responses = await Promise.all([
    controller.list(request("GET", `${base}/alerts`), BUSINESS_A),
    controller.get(request("GET", `${base}/alerts/${INVOICE_A}`), BUSINESS_A, INVOICE_A),
    controller.unreadCount(request("GET", `${base}/alerts/unread-count`), BUSINESS_A),
    controller.evaluate(request("POST", `${base}/alerts/evaluate`), BUSINESS_A),
    controller.markRead(
      request("PATCH", `${base}/alerts/${INVOICE_A}/read`),
      BUSINESS_A,
      INVOICE_A,
    ),
    controller.markUnread(
      request("PATCH", `${base}/alerts/${INVOICE_A}/unread`),
      BUSINESS_A,
      INVOICE_A,
    ),
    controller.dismiss(
      request("PATCH", `${base}/alerts/${INVOICE_A}/dismiss`),
      BUSINESS_A,
      INVOICE_A,
    ),
  ]);

  for (const response of responses) {
    assert.equal(response.status, 401);
    const payload = await response.json();
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, "unauthenticated");
  }

  assert.equal(alerts.calls.length, 0);
  assert.equal(forecast.calls.length, 0);
});

test("invalid business and alert identifiers are rejected with 400", async () => {
  const { controller } = setup();

  const badBusiness = await controller.list(
    request("GET", "http://localhost/api/v1/businesses/not-a-uuid/alerts"),
    "not-a-uuid",
  );
  assert.equal(badBusiness.status, 400);
  const businessPayload = await badBusiness.json();
  assert.equal(businessPayload.error.code, "invalid_request");
  assert.ok(businessPayload.error.fieldErrors.businessId);

  const badAlert = await controller.get(
    request("GET", `${base}/alerts/not-a-uuid`),
    BUSINESS_A,
    "not-a-uuid",
  );
  assert.equal(badAlert.status, 400);
  const alertPayload = await badAlert.json();
  assert.ok(alertPayload.error.fieldErrors.alertId);

  for (const method of ["markRead", "markUnread", "dismiss"] as const) {
    const response = await controller[method](
      request("PATCH", `${base}/alerts/not-a-uuid/${method}`),
      BUSINESS_A,
      "not-a-uuid",
    );
    assert.equal(response.status, 400, method);
  }
});

test("invalid list query filters return field errors", async () => {
  const { controller } = setup();

  const cases = [
    "type=NOT_A_TYPE",
    "severity=SEVERE",
    "read=maybe",
    "status=archived",
    "page=0",
    "pageSize=1000",
    "sort=amount",
    "direction=sideways",
  ];

  for (const query of cases) {
    const response = await controller.list(
      request("GET", `${base}/alerts?${query}`),
      BUSINESS_A,
    );
    assert.equal(response.status, 400, query);
    const payload = await response.json();
    assert.equal(payload.error.code, "invalid_request", query);
    assert.ok(Object.keys(payload.error.fieldErrors).length > 0, query);
  }
});

test("POST evaluate creates alerts and returns lifecycle counts", async () => {
  const { controller, alerts } = setup({
    alerts: {
      invoices: {
        [BUSINESS_A]: [makeAlertInvoice({ dueDate: "2026-01-10" })],
      },
    },
  });

  const response = await controller.evaluate(
    request("POST", `${base}/alerts/evaluate`),
    BUSINESS_A,
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.equal(payload.data.created, 1);
  assert.equal(payload.data.updated, 0);
  assert.equal(payload.data.resolved, 0);
  assert.equal(payload.data.active, 1);
  assert.equal(payload.data.today, "2026-01-15");
  assert.equal(payload.data.evaluatedAt, NOW.toISOString());
  assert.equal(alerts.getStored(BUSINESS_A).length, 1);
});

test("GET list returns the envelope, filters and summary counts", async () => {
  const { controller } = setup({
    alerts: {
      alerts: {
        [BUSINESS_A]: [
          makeAlert({
            id: "91000000-0000-4000-8000-000000000001",
            severity: "CRITICAL",
            type: "OVERDUE_PAYMENT",
            isRead: false,
            createdAt: "2026-01-01T00:00:00.000Z",
          }),
          makeAlert({
            id: "91000000-0000-4000-8000-000000000002",
            severity: "WARNING",
            type: "PAYMENT_APPROACHING",
            isRead: true,
            readAt: "2026-01-02T00:00:00.000Z",
            createdAt: "2026-01-02T00:00:00.000Z",
          }),
        ],
      },
    },
  });

  const response = await controller.list(
    request(
      "GET",
      `${base}/alerts?severity=CRITICAL&read=unread&status=active&page=1&pageSize=1`,
    ),
    BUSINESS_A,
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.equal(payload.data.total, 1);
  assert.equal(payload.data.totalPages, 1);
  assert.equal(payload.data.pageSize, 1);
  assert.equal(payload.data.items[0].severity, "CRITICAL");
  assert.equal(payload.data.counts.active, 2);
  assert.equal(payload.data.counts.unread, 1);
  assert.equal(payload.data.counts.critical, 1);
  assert.equal(payload.data.counts.warning, 1);
});

test("GET unread-count returns only active unread alerts", async () => {
  const { controller } = setup({
    alerts: {
      alerts: {
        [BUSINESS_A]: [
          makeAlert({ id: "91000000-0000-4000-8000-000000000001" }),
          makeAlert({
            id: "91000000-0000-4000-8000-000000000002",
            isRead: true,
            readAt: "2026-01-02T00:00:00.000Z",
          }),
          makeAlert({
            id: "91000000-0000-4000-8000-000000000003",
            status: "DISMISSED",
            isRead: false,
          }),
          makeAlert({
            id: "91000000-0000-4000-8000-000000000004",
            status: "RESOLVED",
            resolvedAt: "2026-01-02T00:00:00.000Z",
            isRead: false,
          }),
        ],
      },
    },
  });

  const response = await controller.unreadCount(
    request("GET", `${base}/alerts/unread-count`),
    BUSINESS_A,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    data: { count: 1 },
  });
});

test("GET detail returns a validated related entity and never leaks another business", async () => {
  const alertId = "91000000-0000-4000-8000-000000000010";
  const { controller } = setup({
    alerts: {
      alerts: {
        [BUSINESS_A]: [
          makeAlert({
            id: alertId,
            relatedEntityType: "INVOICE",
            relatedEntityId: INVOICE_A,
          }),
        ],
        [BUSINESS_B]: [
          makeAlert({
            id: "91000000-0000-4000-8000-000000000011",
            businessId: BUSINESS_B,
            relatedEntityType: "INVOICE",
            relatedEntityId: INVOICE_A,
          }),
        ],
      },
      relatedInvoices: {
        [BUSINESS_A]: { [INVOICE_A]: INVOICE_REFERENCE },
        [BUSINESS_B]: { [INVOICE_A]: INVOICE_REFERENCE },
      },
    },
  });

  const response = await controller.get(
    request("GET", `${base}/alerts/${alertId}`),
    BUSINESS_A,
    alertId,
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.data.alert.id, alertId);
  assert.equal(payload.data.alert.businessId, BUSINESS_A);
  assert.deepEqual(payload.data.alert.relatedEntity, INVOICE_REFERENCE);

  const foreign = await controller.get(
    request("GET", `${base}/alerts/91000000-0000-4000-8000-000000000011`),
    BUSINESS_A,
    "91000000-0000-4000-8000-000000000011",
  );
  assert.equal(foreign.status, 404);
  assert.equal((await foreign.json()).error.code, "alert_not_found");
});

test("a related record from another business is not exposed in detail", async () => {
  const alertId = "91000000-0000-4000-8000-000000000012";
  const { controller } = setup({
    alerts: {
      alerts: {
        [BUSINESS_A]: [
          makeAlert({
            id: alertId,
            relatedEntityType: "INVOICE",
            relatedEntityId: INVOICE_A,
          }),
        ],
      },
      relatedInvoices: {
        [BUSINESS_B]: { [INVOICE_A]: INVOICE_REFERENCE },
      },
    },
  });

  const response = await controller.get(
    request("GET", `${base}/alerts/${alertId}`),
    BUSINESS_A,
    alertId,
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.alert.relatedEntity, null);
});

test("PATCH read and unread are idempotent and update the unread count", async () => {
  const { controller } = setup({
    alerts: {
      invoices: {
        [BUSINESS_A]: [makeAlertInvoice({ dueDate: "2026-01-10" })],
      },
    },
  });
  const alert = await seedOverdue(controller);

  const read = await controller.markRead(
    request("PATCH", `${base}/alerts/${alert.id}/read`),
    BUSINESS_A,
    alert.id,
  );
  assert.equal(read.status, 200);
  const readPayload = await read.json();
  assert.equal(readPayload.data.alert.isRead, true);
  assert.equal(readPayload.data.alert.readAt, NOW.toISOString());

  const readAgain = await controller.markRead(
    request("PATCH", `${base}/alerts/${alert.id}/read`),
    BUSINESS_A,
    alert.id,
  );
  assert.equal(readAgain.status, 200);
  assert.equal((await readAgain.json()).data.alert.readAt, NOW.toISOString());

  const count = await controller.unreadCount(
    request("GET", `${base}/alerts/unread-count`),
    BUSINESS_A,
  );
  assert.equal((await count.json()).data.count, 0);

  const unread = await controller.markUnread(
    request("PATCH", `${base}/alerts/${alert.id}/unread`),
    BUSINESS_A,
    alert.id,
  );
  assert.equal(unread.status, 200);
  assert.equal((await unread.json()).data.alert.isRead, false);

  const unreadAgain = await controller.markUnread(
    request("PATCH", `${base}/alerts/${alert.id}/unread`),
    BUSINESS_A,
    alert.id,
  );
  assert.equal(unreadAgain.status, 200);
  assert.equal((await unreadAgain.json()).data.alert.isRead, false);
});

test("PATCH dismiss hides the alert and is idempotent, while resolved alerts conflict", async () => {
  const { controller } = setup({
    alerts: {
      invoices: {
        [BUSINESS_A]: [makeAlertInvoice({ dueDate: "2026-01-10" })],
      },
      alerts: {
        [BUSINESS_A]: [
          makeAlert({
            id: "91000000-0000-4000-8000-000000000030",
            status: "RESOLVED",
            resolvedAt: "2026-01-02T00:00:00.000Z",
            dedupeKey: `OVERDUE_PAYMENT:${INVOICE_B}`,
          }),
        ],
      },
    },
  });
  const alert = await seedOverdue(controller);

  const dismissed = await controller.dismiss(
    request("PATCH", `${base}/alerts/${alert.id}/dismiss`),
    BUSINESS_A,
    alert.id,
  );
  assert.equal(dismissed.status, 200);
  assert.equal((await dismissed.json()).data.alert.status, "DISMISSED");

  const again = await controller.dismiss(
    request("PATCH", `${base}/alerts/${alert.id}/dismiss`),
    BUSINESS_A,
    alert.id,
  );
  assert.equal(again.status, 200);
  assert.equal((await again.json()).data.alert.status, "DISMISSED");

  const active = await controller.list(request("GET", `${base}/alerts`), BUSINESS_A);
  assert.equal((await active.json()).data.items.length, 0);

  const resolved = await controller.dismiss(
    request("PATCH", `${base}/alerts/91000000-0000-4000-8000-000000000030/dismiss`),
    BUSINESS_A,
    "91000000-0000-4000-8000-000000000030",
  );
  assert.equal(resolved.status, 409);
  assert.equal((await resolved.json()).error.code, "invalid_transition");
});

test("a member of another business receives 403 and foreign alerts are never queried", async () => {
  const { controller, alerts } = setup({ authenticateAs: USER_B });

  const response = await controller.list(
    request("GET", `${base}/alerts`),
    BUSINESS_A,
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "business_forbidden");
  assert.equal(alerts.calls.length, 0);
});

test("evaluation is business-scoped: another business's rows never appear", async () => {
  const { controller } = setup({
    alerts: {
      invoices: {
        [BUSINESS_B]: [
          makeAlertInvoice({
            id: INVOICE_B,
            customerId: CUSTOMER_B,
            dueDate: "2026-01-10",
          }),
        ],
      },
      expenses: {
        [BUSINESS_B]: [makeAlertExpense({ dueDate: "2026-01-16" })],
      },
    },
  });

  const response = await controller.evaluate(
    request("POST", `${base}/alerts/evaluate`),
    BUSINESS_A,
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.data.created, 0);
  assert.equal(payload.data.active, 0);
});

test("concentration alerts point at a business-scoped customer", async () => {
  const { controller } = setup({
    alerts: {
      invoices: {
        [BUSINESS_A]: [
          makeAlertInvoice({
            id: INVOICE_A,
            customerId: CUSTOMER_A,
            customerName: "Acme Studio",
            totalAmount: "80.00",
            dueDate: "2026-02-15",
          }),
          makeAlertInvoice({
            id: INVOICE_B,
            customerId: CUSTOMER_B,
            customerName: "Beta Traders",
            totalAmount: "20.00",
            dueDate: "2026-02-15",
          }),
        ],
      },
    },
  });

  await controller.evaluate(request("POST", `${base}/alerts/evaluate`), BUSINESS_A);
  const list = await controller.list(
    request("GET", `${base}/alerts?type=CUSTOMER_CONCENTRATION`),
    BUSINESS_A,
  );
  const payload = await list.json();
  assert.equal(payload.data.items.length, 1);
  assert.equal(payload.data.items[0].relatedEntityType, "CUSTOMER");
  assert.equal(payload.data.items[0].relatedEntityId, CUSTOMER_A);
});

test("a service failure maps to a 500 without leaking internals", async () => {
  const failing = createAlertController({
    authenticate: async () => ({ ok: true, user: USER_A }),
    service: {
      ...createAlertService({
        alerts: {
          ...createFakeAlertRepository().repository,
          async list() {
            throw new Error("database unavailable");
          },
        },
        memberships: createFakeMemberships(),
        forecast: createFakeForecastRepository().repository,
      }),
    },
  });

  const response = await failing.list(request("GET", `${base}/alerts`), BUSINESS_A);
  assert.equal(response.status, 500);
  const payload = await response.json();
  assert.equal(payload.error.code, "internal_error");
  assert.doesNotMatch(payload.error.message, /database unavailable/);
});
