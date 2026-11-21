import assert from "node:assert/strict";
import test from "node:test";
import {
  createReminderSchema,
  listRemindersQuerySchema,
  updateReminderSchema,
} from "@/lib/validations/reminder";

const CUSTOMER_ID = "30000000-0000-4000-8000-000000000001";
const INVOICE_ID = "50000000-0000-4000-8000-000000000001";
const valid = { customerId: CUSTOMER_ID, invoiceId: INVOICE_ID, reminderType: "OVERDUE_PAYMENT" };

test("create schema requires business-owned references and a valid category", () => {
  const parsed = createReminderSchema.parse(valid);
  assert.equal(parsed.reminderType, "OVERDUE_PAYMENT");
  assert.equal(parsed.followUpDate, null);

  for (const bad of [
    { ...valid, customerId: "not-a-uuid" },
    { ...valid, invoiceId: "not-a-uuid" },
    { ...valid, reminderType: "SMS" },
    { ...valid, reminderType: "MARKED_SENT" },
    { ...valid, reminderType: "DELIVERED" },
    { ...valid, followUpDate: "31-12-2026" },
  ]) {
    assert.equal(createReminderSchema.safeParse(bad).success, false);
  }
});

test("create schema strips client-owned derived fields", () => {
  const parsed = createReminderSchema.parse({
    ...valid,
    id: "fake-id",
    businessId: "20000000-0000-4000-8000-000000000002",
    status: "MARKED_SENT",
    message: "client supplied",
    whatsappUrl: "https://evil.test",
    currency: "USD",
    createdAt: "2020-01-01T00:00:00.000Z",
  });
  assert.deepEqual(Object.keys(parsed).sort(), ["customerId", "followUpDate", "invoiceId", "reminderType"]);
});

test("form empty date is normalized to null", () => {
  assert.equal(createReminderSchema.parse({ ...valid, followUpDate: "" }).followUpDate, null);
  assert.equal(createReminderSchema.parse({ ...valid, followUpDate: null }).followUpDate, null);
  assert.equal(createReminderSchema.parse({ ...valid, followUpDate: "2026-07-01" }).followUpDate, "2026-07-01");
});

test("update schema accepts message, category and reschedule only", () => {
  assert.deepEqual(updateReminderSchema.parse({ message: "Updated" }), { message: "Updated" });
  assert.deepEqual(updateReminderSchema.parse({ followUpDate: "" }), { followUpDate: null });
  assert.equal(updateReminderSchema.safeParse({ status: "MARKED_SENT" }).success, false);
  assert.equal(updateReminderSchema.safeParse({ customerId: CUSTOMER_ID }).success, false);
  assert.equal(updateReminderSchema.safeParse({}).success, false);
  assert.equal(updateReminderSchema.safeParse({ message: "   " }).success, false);
});

test("list query validates filters, paging, sorting and date order", () => {
  assert.deepEqual(listRemindersQuerySchema.parse({}), {
    page: 1,
    pageSize: 20,
    status: "all",
    sort: "followUpDate",
    direction: "desc",
  });
  assert.equal(listRemindersQuerySchema.safeParse({ pageSize: 101 }).success, false);
  assert.equal(listRemindersQuerySchema.safeParse({ status: "DELIVERED" }).success, false);
  assert.equal(listRemindersQuerySchema.safeParse({ type: "EMAIL" }).success, false);
  assert.equal(listRemindersQuerySchema.safeParse({ sort: "amount" }).success, false);
  assert.equal(
    listRemindersQuerySchema.safeParse({ fromDate: "2026-07-01", toDate: "2026-06-01" }).success,
    false,
  );
  const parsed = listRemindersQuerySchema.parse({
    page: "2",
    pageSize: "10",
    status: "OVERDUE",
    type: "FINAL_FOLLOW_UP",
    customerId: CUSTOMER_ID,
  });
  assert.equal(parsed.page, 2);
  assert.equal(parsed.status, "OVERDUE");
  assert.equal(parsed.type, "FINAL_FOLLOW_UP");
});
