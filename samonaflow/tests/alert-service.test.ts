import assert from "node:assert/strict";
import test from "node:test";
import {
  AlertServiceError,
  createAlertService,
} from "@/server/services/alert-service";
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
  listQuery,
  makeAlert,
  makeAlertExpense,
  makeAlertInvoice,
  type AlertRepositorySeed,
} from "./helpers/alert-fakes";

const NOW = new Date("2026-01-15T10:00:00.000Z");
const TODAY = "2026-01-15";

const BUSINESS_CONTEXT = {
  currency: "USD",
  timezone: "UTC",
  openingBalance: "1000.00",
  openingBalanceDate: "2026-01-01",
};

function setup(
  alertSeed: AlertRepositorySeed = {},
  forecastSeed: ForecastRepositorySeed = {},
  now: Date = NOW,
) {
  const alerts = createFakeAlertRepository(alertSeed);
  const forecast = createFakeForecastRepository({
    contexts: {
      [BUSINESS_A]: BUSINESS_CONTEXT,
      [BUSINESS_B]: BUSINESS_CONTEXT,
    },
    cash: {},
    ...forecastSeed,
  });
  const service = createAlertService({
    alerts: alerts.repository,
    memberships: createFakeMemberships(),
    forecast: forecast.repository,
    now: () => now,
  });
  return { service, alerts, forecast };
}

async function expectError(
  promise: Promise<unknown>,
  code: AlertServiceError["code"],
): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof AlertServiceError);
    assert.equal(error.code, code);
    return true;
  });
}

function typesOf(items: { type: string }[]): string[] {
  return items.map((item) => item.type).sort();
}

test("authorization is enforced before any repository read", async () => {
  const { service, alerts, forecast } = setup();

  await expectError(service.list(USER_B, BUSINESS_A, listQuery()), "BUSINESS_FORBIDDEN");
  await expectError(service.get(USER_B, BUSINESS_A, INVOICE_A), "BUSINESS_FORBIDDEN");
  await expectError(service.getCounts(USER_B, BUSINESS_A), "BUSINESS_FORBIDDEN");
  await expectError(service.getUnreadCount(USER_B, BUSINESS_A), "BUSINESS_FORBIDDEN");
  await expectError(service.evaluate(USER_B, BUSINESS_A), "BUSINESS_FORBIDDEN");
  await expectError(
    service.markRead(USER_B, BUSINESS_A, INVOICE_A),
    "BUSINESS_FORBIDDEN",
  );
  await expectError(
    service.markUnread(USER_B, BUSINESS_A, INVOICE_A),
    "BUSINESS_FORBIDDEN",
  );
  await expectError(
    service.dismiss(USER_B, BUSINESS_A, INVOICE_A),
    "BUSINESS_FORBIDDEN",
  );

  assert.equal(alerts.calls.length, 0, "no alert query may run before authorization");
  assert.equal(forecast.calls.length, 0, "no forecast query may run before authorization");
});

test("evaluation creates all six alert types from one authorized snapshot", async () => {
  const { service } = setup(
    {
      invoices: {
        [BUSINESS_A]: [
          makeAlertInvoice({
            id: INVOICE_A,
            customerId: CUSTOMER_A,
            customerName: "Acme Studio",
            totalAmount: "100.00",
            dueDate: "2026-01-10",
            status: "SENT",
          }),
          makeAlertInvoice({
            id: INVOICE_B,
            customerId: CUSTOMER_B,
            customerName: "Beta Traders",
            totalAmount: "60.00",
            dueDate: "2026-01-17",
            status: "SENT",
          }),
          makeAlertInvoice({
            id: "70000000-0000-4000-8000-000000000003",
            customerId: CUSTOMER_A,
            customerName: "Acme Studio",
            totalAmount: "100.00",
            amountPaid: "40.00",
            dueDate: "2026-01-30",
            status: "PARTIALLY_PAID",
          }),
        ],
      },
      expenses: {
        // Large and due tomorrow so the forecast turns negative inside the
        // critical window while still producing an upcoming-expense alert.
        [BUSINESS_A]: [makeAlertExpense({ dueDate: "2026-01-16", amount: "250.00" })],
      },
    },
    {
      contexts: {
        [BUSINESS_A]: { ...BUSINESS_CONTEXT, openingBalance: "0.00" },
        [BUSINESS_B]: BUSINESS_CONTEXT,
      },
    },
  );

  const result = await service.evaluate(USER_A, BUSINESS_A);
  assert.equal(result.created, 6);
  assert.equal(result.updated, 0);
  assert.equal(result.resolved, 0);
  assert.equal(result.unchanged, 0);
  assert.equal(result.active, 6);
  assert.equal(result.today, TODAY);

  const list = await service.list(USER_A, BUSINESS_A, listQuery());
  assert.deepEqual(typesOf(list.items), [
    "CUSTOMER_CONCENTRATION",
    "OVERDUE_PAYMENT",
    "PARTIAL_PAYMENT_DUE",
    "PAYMENT_APPROACHING",
    "POTENTIAL_SHORTAGE",
    "UPCOMING_EXPENSE",
  ]);
  assert.ok(list.items.every((item) => item.businessId === BUSINESS_A));
  assert.equal(list.counts.active, 6);
  assert.equal(list.counts.unread, 6);
  assert.equal(list.counts.critical, 1, "the next-day shortage is critical");
  assert.equal(list.counts.info, 1, "the partial payment is info");
});

test("a second evaluation is idempotent and does not rewrite unchanged alerts", async () => {
  const { service, alerts } = setup({
    invoices: {
      [BUSINESS_A]: [
        makeAlertInvoice({ dueDate: "2026-01-10", totalAmount: "100.00" }),
      ],
    },
  });

  const first = await service.evaluate(USER_A, BUSINESS_A);
  const before = alerts.getStored(BUSINESS_A);
  const second = await service.evaluate(USER_A, BUSINESS_A);
  const after = alerts.getStored(BUSINESS_A);

  assert.equal(first.created, 1);
  assert.equal(second.created, 0);
  assert.equal(second.updated, 0);
  assert.equal(second.resolved, 0);
  assert.equal(second.unchanged, 1);
  assert.equal(after.length, 1);
  assert.equal(after[0].id, before[0].id);
  assert.equal(after[0].updatedAt, before[0].updatedAt);
});

test("a disappearing condition resolves the alert and preserves history", async () => {
  const { service, alerts } = setup({
    invoices: {
      [BUSINESS_A]: [makeAlertInvoice({ dueDate: "2026-01-10" })],
    },
  });

  await service.evaluate(USER_A, BUSINESS_A);
  const active = await service.list(USER_A, BUSINESS_A, listQuery());
  const alertId = active.items[0].id;

  alerts.setInvoices(BUSINESS_A, []);
  const resolved = await service.evaluate(USER_A, BUSINESS_A);
  assert.equal(resolved.resolved, 1);
  assert.equal(resolved.active, 0);

  const activeAfter = await service.list(USER_A, BUSINESS_A, listQuery());
  assert.equal(activeAfter.items.length, 0);

  const history = await service.list(
    USER_A,
    BUSINESS_A,
    listQuery({ status: "resolved" }),
  );
  assert.equal(history.items.length, 1);
  assert.equal(history.items[0].id, alertId);
  assert.ok(history.items[0].resolvedAt);
});

test("a resolved condition that returns creates a new alert with a new id", async () => {
  const { service, alerts } = setup({
    invoices: {
      [BUSINESS_A]: [makeAlertInvoice({ dueDate: "2026-01-10" })],
    },
  });

  await service.evaluate(USER_A, BUSINESS_A);
  const firstId = (await service.list(USER_A, BUSINESS_A, listQuery())).items[0].id;

  alerts.setInvoices(BUSINESS_A, []);
  await service.evaluate(USER_A, BUSINESS_A);

  alerts.setInvoices(BUSINESS_A, [makeAlertInvoice({ dueDate: "2026-01-10" })]);
  const recurrence = await service.evaluate(USER_A, BUSINESS_A);
  assert.equal(recurrence.created, 1);

  const active = await service.list(USER_A, BUSINESS_A, listQuery());
  assert.equal(active.items.length, 1);
  assert.notEqual(active.items[0].id, firstId);

  const history = await service.list(
    USER_A,
    BUSINESS_A,
    listQuery({ status: "resolved" }),
  );
  assert.equal(history.items.length, 1);
  assert.equal(history.items[0].id, firstId);
});

test("a dismissed alert stays hidden while the condition persists, then resolves when it clears", async () => {
  const { service, alerts } = setup({
    invoices: {
      [BUSINESS_A]: [makeAlertInvoice({ dueDate: "2026-01-10" })],
    },
  });

  await service.evaluate(USER_A, BUSINESS_A);
  const active = await service.list(USER_A, BUSINESS_A, listQuery());
  const alertId = active.items[0].id;

  const dismissed = await service.dismiss(USER_A, BUSINESS_A, alertId);
  assert.equal(dismissed.status, "DISMISSED");

  const repeat = await service.evaluate(USER_A, BUSINESS_A);
  assert.equal(repeat.created, 0);
  assert.equal(repeat.dismissed, 1);
  assert.equal(repeat.active, 0);

  const activeAfter = await service.list(USER_A, BUSINESS_A, listQuery());
  assert.equal(activeAfter.items.length, 0);

  const all = await service.list(USER_A, BUSINESS_A, listQuery({ status: "all" }));
  assert.equal(all.items.length, 1);
  assert.equal(all.items[0].status, "DISMISSED");

  alerts.setInvoices(BUSINESS_A, []);
  const cleared = await service.evaluate(USER_A, BUSINESS_A);
  assert.equal(cleared.resolved, 1);

  const history = await service.list(
    USER_A,
    BUSINESS_A,
    listQuery({ status: "resolved" }),
  );
  assert.equal(history.items[0].id, alertId);
  assert.equal(history.items[0].status, "RESOLVED");
});

test("read and unread transitions are idempotent and update the unread count", async () => {
  const { service } = setup({
    invoices: {
      [BUSINESS_A]: [makeAlertInvoice({ dueDate: "2026-01-10" })],
    },
  });

  await service.evaluate(USER_A, BUSINESS_A);
  const alertId = (await service.list(USER_A, BUSINESS_A, listQuery())).items[0].id;

  assert.equal((await service.getUnreadCount(USER_A, BUSINESS_A)).count, 1);

  const read = await service.markRead(USER_A, BUSINESS_A, alertId);
  assert.equal(read.isRead, true);
  assert.equal(read.readAt, NOW.toISOString());
  assert.equal((await service.getUnreadCount(USER_A, BUSINESS_A)).count, 0);

  const readAgain = await service.markRead(USER_A, BUSINESS_A, alertId);
  assert.equal(readAgain.readAt, read.readAt);

  const unread = await service.markUnread(USER_A, BUSINESS_A, alertId);
  assert.equal(unread.isRead, false);
  assert.equal(unread.readAt, null);
  assert.equal((await service.getUnreadCount(USER_A, BUSINESS_A)).count, 1);

  const unreadAgain = await service.markUnread(USER_A, BUSINESS_A, alertId);
  assert.equal(unreadAgain.isRead, false);
});

test("list filters by type, severity, read state and lifecycle status", async () => {
  const { service } = setup({
    alerts: {
      [BUSINESS_A]: [
        makeAlert({
          id: "91000000-0000-4000-8000-000000000001",
          type: "OVERDUE_PAYMENT",
          severity: "CRITICAL",
          isRead: false,
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
        makeAlert({
          id: "91000000-0000-4000-8000-000000000002",
          type: "PAYMENT_APPROACHING",
          severity: "WARNING",
          isRead: true,
          readAt: "2026-01-02T00:00:00.000Z",
          createdAt: "2026-01-02T00:00:00.000Z",
        }),
        makeAlert({
          id: "91000000-0000-4000-8000-000000000003",
          type: "PARTIAL_PAYMENT_DUE",
          severity: "INFO",
          status: "RESOLVED",
          resolvedAt: "2026-01-03T00:00:00.000Z",
          createdAt: "2026-01-03T00:00:00.000Z",
        }),
        makeAlert({
          id: "91000000-0000-4000-8000-000000000004",
          type: "UPCOMING_EXPENSE",
          severity: "WARNING",
          status: "DISMISSED",
          createdAt: "2026-01-04T00:00:00.000Z",
        }),
      ],
    },
  });

  const active = await service.list(USER_A, BUSINESS_A, listQuery());
  assert.deepEqual(
    active.items.map((item) => item.id),
    // Default order is newest first.
    ["91000000-0000-4000-8000-000000000002", "91000000-0000-4000-8000-000000000001"],
  );

  const all = await service.list(USER_A, BUSINESS_A, listQuery({ status: "all" }));
  assert.equal(all.items.length, 4);

  const type = await service.list(
    USER_A,
    BUSINESS_A,
    listQuery({ type: "OVERDUE_PAYMENT", status: "all" }),
  );
  assert.equal(type.items.length, 1);

  const severity = await service.list(
    USER_A,
    BUSINESS_A,
    listQuery({ severity: "WARNING", status: "all" }),
  );
  assert.equal(severity.items.length, 2);

  const unread = await service.list(
    USER_A,
    BUSINESS_A,
    listQuery({ read: "unread", status: "all" }),
  );
  assert.equal(unread.items.length, 3);

  const read = await service.list(
    USER_A,
    BUSINESS_A,
    listQuery({ read: "read", status: "all" }),
  );
  assert.equal(read.items.length, 1);

  const resolved = await service.list(
    USER_A,
    BUSINESS_A,
    listQuery({ status: "resolved" }),
  );
  assert.equal(resolved.items.length, 1);

  const dismissed = await service.list(
    USER_A,
    BUSINESS_A,
    listQuery({ status: "dismissed" }),
  );
  assert.equal(dismissed.items.length, 1);

  const page = await service.list(
    USER_A,
    BUSINESS_A,
    listQuery({
      status: "all",
      page: 2,
      pageSize: 2,
      sort: "createdAt",
      direction: "asc",
    }),
  );
  assert.equal(page.items.length, 2);
  assert.equal(page.totalPages, 2);
  assert.equal(page.items[0].id, "91000000-0000-4000-8000-000000000003");
});

test("alerts are tenant-isolated for list, get, read and dismiss", async () => {
  const foreignId = "93000000-0000-4000-8000-000000000001";
  const { service } = setup({
    alerts: {
      [BUSINESS_B]: [
        makeAlert({
          id: foreignId,
          businessId: BUSINESS_B,
          title: "Foreign alert",
        }),
      ],
    },
  });

  const list = await service.list(USER_A, BUSINESS_A, listQuery({ status: "all" }));
  assert.equal(list.items.length, 0);

  await expectError(service.get(USER_A, BUSINESS_A, foreignId), "ALERT_NOT_FOUND");
  await expectError(
    service.markRead(USER_A, BUSINESS_A, foreignId),
    "ALERT_NOT_FOUND",
  );
  await expectError(
    service.dismiss(USER_A, BUSINESS_A, foreignId),
    "ALERT_NOT_FOUND",
  );

  const foreign = await service.get(USER_B, BUSINESS_B, foreignId);
  assert.equal(foreign.title, "Foreign alert");
});

test("today is resolved in the business timezone before rules run", async () => {
  const kolkata = {
    currency: "USD",
    timezone: "Asia/Kolkata",
    openingBalance: "1000.00",
    openingBalanceDate: "2026-01-01",
  };
  const { service } = setup(
    {
      invoices: {
        [BUSINESS_A]: [
          makeAlertInvoice({
            id: INVOICE_A,
            dueDate: "2026-01-19",
            totalAmount: "100.00",
          }),
          makeAlertInvoice({
            id: INVOICE_B,
            dueDate: "2026-01-20",
            totalAmount: "50.00",
          }),
        ],
      },
    },
    {
      contexts: {
        [BUSINESS_A]: kolkata,
        [BUSINESS_B]: kolkata,
      },
    },
    // 20:00 UTC is 01:30 the next day in Asia/Kolkata.
    new Date("2026-01-15T20:00:00.000Z"),
  );

  const result = await service.evaluate(USER_A, BUSINESS_A);
  assert.equal(result.today, "2026-01-16");

  const active = await service.list(USER_A, BUSINESS_A, listQuery());
  assert.equal(active.items.length, 1);
  assert.equal(active.items[0].type, "PAYMENT_APPROACHING");
  assert.match(active.items[0].description, /2026-01-19/);
});

test("outstanding balances use active payments and never alert fully paid invoices", async () => {
  const { service } = setup({
    invoices: {
      [BUSINESS_A]: [
        makeAlertInvoice({
          id: INVOICE_A,
          customerId: CUSTOMER_A,
          totalAmount: "100.00",
          amountPaid: "100.00",
          dueDate: "2026-01-10",
        }),
        makeAlertInvoice({
          id: INVOICE_B,
          customerId: CUSTOMER_B,
          totalAmount: "100.00",
          amountPaid: "40.00",
          dueDate: "2026-01-25",
          status: "PARTIALLY_PAID",
        }),
      ],
    },
  });

  await service.evaluate(USER_A, BUSINESS_A);
  const active = await service.list(USER_A, BUSINESS_A, listQuery({ status: "all" }));
  assert.equal(active.items.length, 1);
  assert.equal(active.items[0].type, "PARTIAL_PAYMENT_DUE");
  assert.match(active.items[0].description, /USD 60\.00/);
});

test("paid and cancelled expenses never produce upcoming-expense alerts", async () => {
  const { service } = setup({
    expenses: {
      [BUSINESS_A]: [
        makeAlertExpense({ dueDate: "2026-01-18", status: "PAID" }),
        makeAlertExpense({
          id: "80000000-0000-4000-8000-000000000002",
          dueDate: "2026-01-18",
          status: "CANCELLED",
        }),
      ],
    },
  });

  await service.evaluate(USER_A, BUSINESS_A);
  const active = await service.list(USER_A, BUSINESS_A, listQuery({ status: "all" }));
  assert.equal(active.items.length, 0);
});

test("the shortage alert is derived from the forecast engine and becomes critical near the date", async () => {
  const { service } = setup(
    {
      expenses: {
        [BUSINESS_A]: [
          makeAlertExpense({ dueDate: "2026-01-16", amount: "200.00" }),
        ],
      },
    },
    {
      contexts: {
        [BUSINESS_A]: { ...BUSINESS_CONTEXT, openingBalance: "100.00" },
        [BUSINESS_B]: BUSINESS_CONTEXT,
      },
    },
  );

  await service.evaluate(USER_A, BUSINESS_A);
  const active = await service.list(USER_A, BUSINESS_A, listQuery());
  const shortage = active.items.find((item) => item.type === "POTENTIAL_SHORTAGE");
  assert.ok(shortage);
  assert.equal(shortage.severity, "CRITICAL");
  assert.match(shortage.description, /USD -100\.00/);
  assert.match(shortage.description, /2026-01-16/);
});

test("a shortage beyond the critical window is a warning and a healthy forecast creates no shortage alert", async () => {
  const warning = setup(
    {
      expenses: {
        [BUSINESS_A]: [
          makeAlertExpense({ dueDate: "2026-01-25", amount: "1200.00" }),
        ],
      },
    },
    {
      contexts: {
        [BUSINESS_A]: { ...BUSINESS_CONTEXT, openingBalance: "1000.00" },
        [BUSINESS_B]: BUSINESS_CONTEXT,
      },
    },
  );

  await warning.service.evaluate(USER_A, BUSINESS_A);
  const warningList = await warning.service.list(USER_A, BUSINESS_A, listQuery());
  const warningAlert = warningList.items.find(
    (item) => item.type === "POTENTIAL_SHORTAGE",
  );
  assert.ok(warningAlert);
  assert.equal(warningAlert.severity, "WARNING");

  const healthy = setup();
  await healthy.service.evaluate(USER_A, BUSINESS_A);
  const healthyList = await healthy.service.list(USER_A, BUSINESS_A, listQuery());
  assert.equal(
    healthyList.items.filter((item) => item.type === "POTENTIAL_SHORTAGE").length,
    0,
  );
});

test("detail enrichment only exposes related records that belong to the business", async () => {
  const alertId = "91000000-0000-4000-8000-000000000010";
  const { service } = setup({
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
      [BUSINESS_A]: { [INVOICE_A]: INVOICE_REFERENCE },
    },
  });

  const detail = await service.get(USER_A, BUSINESS_A, alertId);
  assert.deepEqual(detail.relatedEntity, INVOICE_REFERENCE);

  const missing = setup({
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
  });

  const missingDetail = await missing.service.get(USER_A, BUSINESS_A, alertId);
  assert.equal(missingDetail.relatedEntity, null);
});

test("forecast alerts expose the forecast action without a foreign entity", async () => {
  const alertId = "91000000-0000-4000-8000-000000000011";
  const { service } = setup({
    alerts: {
      [BUSINESS_A]: [
        makeAlert({
          id: alertId,
          type: "POTENTIAL_SHORTAGE",
          relatedEntityType: "FORECAST",
          relatedEntityId: null,
          dedupeKey: "POTENTIAL_SHORTAGE",
        }),
      ],
    },
  });

  const detail = await service.get(USER_A, BUSINESS_A, alertId);
  assert.equal(detail.relatedEntity?.type, "FORECAST");
  assert.equal(detail.relatedEntity?.href, "/dashboard/forecast");
});

test("resolved alerts cannot be dismissed, while dismissing twice is idempotent", async () => {
  const resolvedId = "91000000-0000-4000-8000-000000000020";
  const dismissedId = "91000000-0000-4000-8000-000000000021";
  const { service } = setup({
    alerts: {
      [BUSINESS_A]: [
        makeAlert({
          id: resolvedId,
          status: "RESOLVED",
          resolvedAt: "2026-01-02T00:00:00.000Z",
        }),
        makeAlert({
          id: dismissedId,
          status: "DISMISSED",
          dedupeKey: `DISMISSED:${INVOICE_A}`,
        }),
      ],
    },
  });

  await expectError(
    service.dismiss(USER_A, BUSINESS_A, resolvedId),
    "INVALID_TRANSITION",
  );

  const first = await service.dismiss(USER_A, BUSINESS_A, dismissedId);
  const second = await service.dismiss(USER_A, BUSINESS_A, dismissedId);
  assert.equal(first.status, "DISMISSED");
  assert.equal(second.status, "DISMISSED");
});

test("missing alerts produce a not-found error", async () => {
  const { service } = setup();
  await expectError(
    service.get(USER_A, BUSINESS_A, "91000000-0000-4000-8000-000000000099"),
    "ALERT_NOT_FOUND",
  );
});

test("evaluation with no open financial records creates nothing", async () => {
  const { service } = setup();
  const result = await service.evaluate(USER_A, BUSINESS_A);
  assert.equal(result.created, 0);
  assert.equal(result.updated, 0);
  assert.equal(result.resolved, 0);
  assert.equal(result.active, 0);
});
