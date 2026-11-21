import assert from "node:assert/strict";
import test from "node:test";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import {
  createReminderController,
  type Authenticate,
} from "@/server/controllers/reminder-controller";
import { createReminderService } from "@/server/services/reminder-service";
import {
  BUSINESS_A,
  BUSINESS_B,
  USER_A,
  USER_B,
  createFakeMemberships,
} from "./helpers/fakes";
import {
  createFakeReminderRepository,
  makeReminderContext,
  makeReminderRecord,
  REMINDER_A,
} from "./helpers/reminder-fakes";

const FOREIGN_REMINDER = "70000000-0000-4000-8000-000000000099";
const CUSTOMER_A = "30000000-0000-4000-8000-000000000001";
const INVOICE_A = "50000000-0000-4000-8000-000000000001";

const UNAUTHORIZED = () =>
  Response.json(
    { error: "unauthenticated", message: "Authentication is required." },
    { status: 401 },
  );

const validBody = {
  customerId: CUSTOMER_A,
  invoiceId: INVOICE_A,
  reminderType: "OVERDUE_PAYMENT",
  followUpDate: "2026-06-20",
};

function setup(options: { authenticateAs?: AuthenticatedUser | null } = {}) {
  const reminders = createFakeReminderRepository([
    makeReminderRecord({ id: FOREIGN_REMINDER, businessId: BUSINESS_B, invoiceNumber: "INV-FOREIGN" }),
  ]);
  reminders.seedContext(BUSINESS_A, makeReminderContext());
  reminders.seedContext(BUSINESS_B, makeReminderContext({
    customer: { id: CUSTOMER_A, name: "Foreign customer", phone: null },
  }));
  const authenticate: Authenticate = async () => {
    const user = options.authenticateAs === undefined ? USER_A : options.authenticateAs;
    return user ? { ok: true, user } : { ok: false, response: UNAUTHORIZED() };
  };
  const service = createReminderService({
    memberships: createFakeMemberships(),
    reminders: reminders.repository,
  });
  const controller = createReminderController({ authenticate, service });
  return { controller, service, reminders };
}

function request(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const base = `http://localhost/api/v1/businesses/${BUSINESS_A}`;

async function createReminder(controller: ReturnType<typeof createReminderController>) {
  const response = await controller.create(request("POST", `${base}/reminders`, validBody), BUSINESS_A);
  assert.equal(response.status, 201);
  return (await response.json()).data.reminder;
}

test("POST generates a reminder and strips client-owned server fields", async () => {
  const { controller } = setup();
  const response = await controller.create(
    request("POST", `${base}/reminders`, {
      ...validBody,
      id: "fake-id",
      businessId: BUSINESS_B,
      status: "MARKED_SENT",
      message: "client supplied",
      whatsappUrl: "https://evil.test",
    }),
    BUSINESS_A,
  );
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.equal(payload.data.reminder.businessId, BUSINESS_A);
  assert.equal(payload.data.reminder.status, "DRAFTED");
  assert.match(payload.data.reminder.message, /INR 20000\.00/);
  assert.notEqual(payload.data.reminder.message, "client supplied");
  assert.notEqual(payload.data.reminder.whatsappUrl, "https://evil.test");
});

test("POST returns 400 for invalid data and invalid JSON", async () => {
  const { controller } = setup();
  const invalid = await controller.create(
    request("POST", `${base}/reminders`, { ...validBody, reminderType: "EMAIL" }),
    BUSINESS_A,
  );
  assert.equal(invalid.status, 400);
  assert.ok((await invalid.json()).error.fieldErrors.reminderType);

  const malformed = await controller.create(
    new Request(`${base}/reminders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }),
    BUSINESS_A,
  );
  assert.equal(malformed.status, 400);
});

test("GET list and detail return consistent envelopes", async () => {
  const { controller } = setup();
  const reminder = await createReminder(controller);

  const list = await controller.list(request("GET", `${base}/reminders?pageSize=5`), BUSINESS_A);
  assert.equal(list.status, 200);
  assert.equal((await list.json()).data.total, 1);

  const detail = await controller.get(
    request("GET", `${base}/reminders/${reminder.id}`),
    BUSINESS_A,
    reminder.id,
  );
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).data.reminder.customerName, "Rahul");
});

test("PATCH edits a draft and rejects edits after sending with 422", async () => {
  const { controller } = setup();
  const reminder = await createReminder(controller);

  const patched = await controller.update(
    request("PATCH", `${base}/reminders/${reminder.id}`, {
      message: "Edited",
      followUpDate: "2026-06-25",
    }),
    BUSINESS_A,
    reminder.id,
  );
  assert.equal(patched.status, 200);
  const updated = (await patched.json()).data.reminder;
  assert.equal(updated.message, "Edited");
  assert.equal(updated.followUpDate, "2026-06-25");

  const invalid = await controller.update(
    request("PATCH", `${base}/reminders/${reminder.id}`, { status: "MARKED_SENT" }),
    BUSINESS_A,
    reminder.id,
  );
  assert.equal(invalid.status, 400);

  const sent = await controller.markSent(
    request("POST", `${base}/reminders/${reminder.id}/mark-sent`),
    BUSINESS_A,
    reminder.id,
  );
  assert.equal(sent.status, 200);
  assert.equal((await sent.json()).data.reminder.status, "MARKED_SENT");

  const terminal = await controller.update(
    request("PATCH", `${base}/reminders/${reminder.id}`, { followUpDate: "2026-07-01" }),
    BUSINESS_A,
    reminder.id,
  );
  assert.equal(terminal.status, 422);
  assert.equal((await terminal.json()).error.code, "invalid_transition");
});

test("whatsapp-opened and mark-sent actions are idempotent", async () => {
  const { controller } = setup();
  const first = await createReminder(controller);
  const opened = await controller.markWhatsappOpened(
    request("POST", `${base}/reminders/${first.id}/whatsapp-opened`),
    BUSINESS_A,
    first.id,
  );
  assert.equal(opened.status, 200);
  assert.equal((await opened.json()).data.reminder.status, "WHATSAPP_OPENED");
  const openedAgain = await controller.markWhatsappOpened(
    request("POST", `${base}/reminders/${first.id}/whatsapp-opened`),
    BUSINESS_A,
    first.id,
  );
  assert.equal((await openedAgain.json()).data.reminder.status, "WHATSAPP_OPENED");

  const sent = await controller.markSent(
    request("POST", `${base}/reminders/${first.id}/mark-sent`),
    BUSINESS_A,
    first.id,
  );
  assert.equal((await sent.json()).data.reminder.status, "MARKED_SENT");
  const sentAgain = await controller.markSent(
    request("POST", `${base}/reminders/${first.id}/mark-sent`),
    BUSINESS_A,
    first.id,
  );
  assert.equal((await sentAgain.json()).data.reminder.status, "MARKED_SENT");
});

test("unauthenticated requests are rejected on every endpoint", async () => {
  const { controller } = setup({ authenticateAs: null });
  const id = REMINDER_A;
  const responses = await Promise.all([
    controller.create(request("POST", `${base}/reminders`, validBody), BUSINESS_A),
    controller.list(request("GET", `${base}/reminders`), BUSINESS_A),
    controller.get(request("GET", `${base}/reminders/${id}`), BUSINESS_A, id),
    controller.update(request("PATCH", `${base}/reminders/${id}`, { message: "x" }), BUSINESS_A, id),
    controller.markWhatsappOpened(request("POST", `${base}/reminders/${id}/whatsapp-opened`), BUSINESS_A, id),
    controller.markSent(request("POST", `${base}/reminders/${id}/mark-sent`), BUSINESS_A, id),
  ]);
  for (const response of responses) assert.equal(response.status, 401);
});

test("missing membership and cross-business attempts never expose a foreign record", async () => {
  const { controller } = setup();
  const forbidden = await controller.list(
    request("GET", `http://localhost/api/v1/businesses/${BUSINESS_B}/reminders`),
    BUSINESS_B,
  );
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json()).error.code, "business_forbidden");

  const notFound = await controller.get(
    request("GET", `${base}/reminders/${FOREIGN_REMINDER}`),
    BUSINESS_A,
    FOREIGN_REMINDER,
  );
  assert.equal(notFound.status, 404);
  assert.equal((await notFound.json()).error.code, "reminder_not_found");

  const otherUser = setup({ authenticateAs: USER_B });
  const missingMembership = await otherUser.controller.list(
    request("GET", `${base}/reminders`),
    BUSINESS_A,
  );
  assert.equal(missingMembership.status, 403);
});

test("a mismatched customer/invoice returns 404 without exposing the record", async () => {
  const { controller } = setup();
  const response = await controller.create(
    request("POST", `${base}/reminders`, { ...validBody, invoiceId: FOREIGN_REMINDER }),
    BUSINESS_A,
  );
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "invalid_reminder_context");
});

test("invalid identifiers return 400 without calling the service", async () => {
  const { controller } = setup();
  const invalidBusiness = await controller.list(request("GET", `${base}/reminders`), "not-a-uuid");
  assert.equal(invalidBusiness.status, 400);

  const invalidReminder = await controller.get(
    request("GET", `${base}/reminders/not-a-uuid`),
    BUSINESS_A,
    "not-a-uuid",
  );
  assert.equal(invalidReminder.status, 400);
});

test("unexpected errors never expose internal database details", async () => {
  const { service } = setup();
  const failing = createReminderController({
    authenticate: async () => ({ ok: true, user: USER_A }),
    service: {
      ...service,
      list: async () => {
        throw new Error("postgres://user:secret@host/database");
      },
    },
  });
  const response = await failing.list(request("GET", `${base}/reminders`), BUSINESS_A);
  assert.equal(response.status, 500);
  const payload = await response.json();
  assert.equal(payload.error.code, "internal_error");
  assert.equal(JSON.stringify(payload).includes("secret"), false);
});
