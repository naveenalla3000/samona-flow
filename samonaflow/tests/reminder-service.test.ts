import assert from "node:assert/strict";
import test from "node:test";
import { listRemindersQuerySchema, type CreateReminderInput } from "@/lib/validations/reminder";
import { createReminderService, ReminderServiceError } from "@/server/services/reminder-service";
import {
  BUSINESS_A,
  BUSINESS_B,
  USER_A,
  USER_B,
  createFakeMemberships,
} from "./helpers/fakes";
import {
  makeReminderContext,
  makeReminderRecord,
  createFakeReminderRepository,
  REMINDER_A,
} from "./helpers/reminder-fakes";
import type { ReminderRecord } from "@/types/reminder";

const QUERY = listRemindersQuerySchema.parse({});
const CUSTOMER_A = "30000000-0000-4000-8000-000000000001";
const INVOICE_A = "50000000-0000-4000-8000-000000000001";
const FOREIGN_REMINDER = "70000000-0000-4000-8000-000000000099";

function setup(seed: ReminderRecord[] = []) {
  const reminders = createFakeReminderRepository(seed);
  const service = createReminderService({
    memberships: createFakeMemberships(),
    reminders: reminders.repository,
  });
  reminders.seedContext(BUSINESS_A, makeReminderContext());
  reminders.seedContext(
    BUSINESS_B,
    makeReminderContext({
      customer: { id: CUSTOMER_A, name: "Foreign customer", phone: null },
      invoice: {
        id: INVOICE_A,
        invoiceNumber: "INV-999",
        dueDate: "2026-07-01",
        outstandingAmount: "500.00",
        currency: "USD",
        status: "SENT",
        displayStatus: "SENT",
      },
    }),
  );
  return { service, reminders };
}

const input: CreateReminderInput = {
  customerId: CUSTOMER_A,
  invoiceId: INVOICE_A,
  reminderType: "OVERDUE_PAYMENT",
  followUpDate: "2026-06-20",
};

async function errorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    assert.ok(error instanceof ReminderServiceError);
    return error.code;
  }
}

test("creates a draft with a server-generated message and no delivery assertion", async () => {
  const { service } = setup();
  const reminder = await service.create(USER_A, BUSINESS_A, input);
  assert.equal(reminder.businessId, BUSINESS_A);
  assert.equal(reminder.status, "DRAFTED");
  assert.equal(reminder.customerName, "Rahul");
  assert.equal(reminder.invoiceNumber, "INV-102");
  assert.match(reminder.message, /INR 20000\.00/);
  assert.match(reminder.whatsappUrl!, /^https:\/\/wa\.me\//);
  assert.equal(reminder.followUpDate, "2026-06-20");
  assert.equal(reminder.followUpState, "UPCOMING");
});

test("customer/invoice must both belong to the verified business and match", async () => {
  const { service, reminders } = setup();
  assert.equal(
    await errorCode(service.create(USER_A, BUSINESS_A, { ...input, invoiceId: FOREIGN_REMINDER })),
    "REMINDER_CONTEXT_NOT_FOUND",
  );
  assert.equal(
    await errorCode(service.create(USER_B, BUSINESS_A, input)),
    "BUSINESS_FORBIDDEN",
  );

  // A context seeded for another business is never visible to BUSINESS_A.
  reminders.seedContext(BUSINESS_B, makeReminderContext({
    customer: { id: CUSTOMER_A, name: "Other", phone: null },
  }));
  const foreign = await service.create(USER_B, BUSINESS_B, input);
  assert.equal(foreign.businessId, BUSINESS_B);
  assert.equal(foreign.customerName, "Other");
});

test("draft, paid and non-remindable invoices are rejected", async () => {
  const { service, reminders } = setup();
  reminders.seedContext(BUSINESS_A, makeReminderContext({
    invoice: {
      id: INVOICE_A,
      invoiceNumber: "INV-DRAFT",
      dueDate: "2026-06-10",
      outstandingAmount: "100.00",
      currency: "INR",
      status: "DRAFT",
      displayStatus: "DRAFT",
    },
  }));
  assert.equal(
    await errorCode(service.create(USER_A, BUSINESS_A, input)),
    "REMINDER_CONTEXT_NOT_FOUND",
  );

  // A fully paid issued invoice has no balance to follow up on.
  reminders.seedContext(BUSINESS_A, makeReminderContext({
    invoice: {
      id: INVOICE_A,
      invoiceNumber: "INV-PAID",
      dueDate: "2026-06-10",
      outstandingAmount: "0.00",
      currency: "INR",
      status: "SENT",
      displayStatus: "SENT",
    },
  }));
  assert.equal(
    await errorCode(service.create(USER_A, BUSINESS_A, input)),
    "REMINDER_CONTEXT_NOT_FOUND",
  );
});

test("draft edits, reschedules and terminal history are enforced", async () => {
  const { service, reminders } = setup();
  const reminder = await service.create(USER_A, BUSINESS_A, input);

  const edited = await service.update(USER_A, BUSINESS_A, reminder.id, {
    message: "Edited message",
    reminderType: "FINAL_FOLLOW_UP",
    followUpDate: "2026-06-25",
  });
  assert.equal(edited.message, "Edited message");
  assert.equal(edited.reminderType, "FINAL_FOLLOW_UP");

  await service.markWhatsappOpened(USER_A, BUSINESS_A, reminder.id);
  const rescheduled = await service.update(USER_A, BUSINESS_A, reminder.id, { followUpDate: "2026-06-30" });
  assert.equal(rescheduled.followUpDate, "2026-06-30");
  assert.equal(
    await errorCode(service.update(USER_A, BUSINESS_A, reminder.id, { message: "Too late" })),
    "INVALID_TRANSITION",
  );

  await service.markSent(USER_A, BUSINESS_A, reminder.id);
  assert.equal(
    await errorCode(service.update(USER_A, BUSINESS_A, reminder.id, { followUpDate: "2026-07-01" })),
    "INVALID_TRANSITION",
  );
  const historical = await reminders.getReminder(BUSINESS_A, reminder.id);
  assert.equal(historical?.status, "MARKED_SENT");
});

test("marking WhatsApp opened and marking sent are idempotent, never regressed", async () => {
  const { service } = setup();
  const reminder = await service.create(USER_A, BUSINESS_A, input);

  const opened = await service.markWhatsappOpened(USER_A, BUSINESS_A, reminder.id);
  assert.equal(opened.status, "WHATSAPP_OPENED");
  const openedAgain = await service.markWhatsappOpened(USER_A, BUSINESS_A, reminder.id);
  assert.equal(openedAgain.status, "WHATSAPP_OPENED");

  const sent = await service.markSent(USER_A, BUSINESS_A, reminder.id);
  assert.equal(sent.status, "MARKED_SENT");
  const sentAgain = await service.markSent(USER_A, BUSINESS_A, reminder.id);
  assert.equal(sentAgain.status, "MARKED_SENT");
  assert.equal(
    await errorCode(service.markWhatsappOpened(USER_A, BUSINESS_A, reminder.id)),
    "INVALID_TRANSITION",
  );
});

test("membership and reminder ids are tenant scoped on every operation", async () => {
  const { service } = setup([makeReminderRecord({ id: REMINDER_A })]);
  assert.equal(await errorCode(service.list(USER_B, BUSINESS_A, QUERY)), "BUSINESS_FORBIDDEN");
  assert.equal(await errorCode(service.get(USER_A, BUSINESS_A, FOREIGN_REMINDER)), "REMINDER_NOT_FOUND");
  assert.equal(
    await errorCode(service.markSent(USER_A, BUSINESS_A, FOREIGN_REMINDER)),
    "REMINDER_NOT_FOUND",
  );
  const foreign = await service.create(USER_B, BUSINESS_B, input);
  assert.equal(
    await errorCode(service.get(USER_A, BUSINESS_A, foreign.id)),
    "REMINDER_NOT_FOUND",
  );
  assert.equal(
    await errorCode(service.update(USER_A, BUSINESS_A, foreign.id, { followUpDate: "2026-07-01" })),
    "REMINDER_NOT_FOUND",
  );
});

test("list is tenant scoped and supports status/type/date filters, sort and paging", async () => {
  const { service } = setup();
  await service.create(USER_A, BUSINESS_A, input);
  await service.create(USER_A, BUSINESS_A, {
    ...input,
    reminderType: "UPCOMING_PAYMENT",
    followUpDate: "2026-06-14",
  });
  const foreign = await service.create(USER_B, BUSINESS_B, input);

  const all = await service.list(USER_A, BUSINESS_A, QUERY);
  assert.equal(all.total, 2);
  assert.equal(all.items.every((item) => item.businessId === BUSINESS_A), true);
  assert.equal(all.items.map((item) => item.id).includes(foreign.id), false);

  const overdue = await service.list(USER_A, BUSINESS_A, { ...QUERY, status: "OVERDUE" });
  assert.equal(overdue.total, 1);
  assert.equal(overdue.items[0]?.followUpState, "OVERDUE");

  const byType = await service.list(USER_A, BUSINESS_A, { ...QUERY, type: "UPCOMING_PAYMENT" });
  assert.equal(byType.total, 1);

  const byDate = await service.list(USER_A, BUSINESS_A, {
    ...QUERY,
    fromDate: "2026-06-20",
    toDate: "2026-06-30",
  });
  assert.equal(byDate.total, 1);

  const searched = await service.list(USER_A, BUSINESS_A, { ...QUERY, search: "INV-102" });
  assert.equal(searched.total, 2);

  const paged = await service.list(USER_A, BUSINESS_A, { ...QUERY, pageSize: 1, page: 2 });
  assert.equal(paged.items.length, 1);
  assert.equal(paged.totalPages, 2);

  const sorted = await service.list(USER_A, BUSINESS_A, {
    ...QUERY,
    sort: "followUpDate",
    direction: "asc",
  });
  assert.equal(sorted.items[0]?.followUpDate, "2026-06-14");
});
