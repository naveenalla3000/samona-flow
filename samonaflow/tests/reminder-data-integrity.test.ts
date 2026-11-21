import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync("prisma/migrations/20260101000000_init/migration.sql", "utf8");
const repository = readFileSync("src/server/repositories/reminder-repository.ts", "utf8");
const service = readFileSync("src/server/services/reminder-service.ts", "utf8");
const validation = readFileSync("src/lib/validations/reminder.ts", "utf8");
const controller = readFileSync("src/server/controllers/reminder-controller.ts", "utf8");
const routes = [
  "src/app/api/v1/businesses/[businessId]/reminders/route.ts",
  "src/app/api/v1/businesses/[businessId]/reminders/[reminderId]/route.ts",
  "src/app/api/v1/businesses/[businessId]/reminders/[reminderId]/whatsapp-opened/route.ts",
  "src/app/api/v1/businesses/[businessId]/reminders/[reminderId]/mark-sent/route.ts",
].map((path) => readFileSync(path, "utf8"));

function model(name: string): string {
  const start = schema.indexOf(`model ${name} {`);
  assert.ok(start >= 0, `${name} model missing`);
  return schema.slice(start, schema.indexOf("\n}", start));
}

test("Reminder is tenant-pinned through composite foreign keys", () => {
  const reminder = model("Reminder");
  assert.match(reminder, /businessId\s+String\s+@map\("business_id"\)/);
  assert.match(reminder, /customer Customer @relation\(fields: \[customerId, businessId\]/);
  assert.match(reminder, /invoice\s+Invoice\s+@relation\(fields: \[invoiceId, customerId, businessId\]/);
  assert.match(reminder, /followUpDate DateTime\?\s+@map\("follow_up_date"\) @db\.Date/);
  assert.doesNotMatch(reminder, /scheduledAt|attempt|delivery|provider/i);
});

test("applied migration contains the composite constraints and the three-state enum", () => {
  assert.match(migration, /CREATE TYPE "reminder_status" AS ENUM \('DRAFTED', 'WHATSAPP_OPENED', 'MARKED_SENT'\)/);
  assert.match(migration, /CREATE TYPE "reminder_type" AS ENUM \('UPCOMING_PAYMENT', 'DUE_TODAY', 'OVERDUE_PAYMENT', 'FINAL_FOLLOW_UP'\)/);
  assert.match(migration, /reminders_business_id_fkey/);
  assert.match(migration, /reminders_customer_id_business_id_fkey/);
  assert.match(migration, /reminders_invoice_id_customer_id_business_id_fkey/);
  assert.match(migration, /reminders_business_id_follow_up_date_idx/);
});

test("repository never addresses a reminder, customer or invoice by id alone", () => {
  assert.doesNotMatch(repository, /reminder\.findUnique\(/);
  assert.doesNotMatch(repository, /reminder\.delete\(/);
  assert.doesNotMatch(repository, /customer\.findUnique\(/);
  assert.doesNotMatch(repository, /invoice\.findUnique\(/);
  assert.match(repository, /where: \{ id: reminderId, businessId \}/);
  assert.match(repository, /where: \{ id: customerId, businessId \}/);
  assert.match(repository, /where: \{ id: invoiceId, customerId, businessId \}/);
  assert.match(repository, /ReminderWhereInput = \{ businessId \}/);
  assert.match(repository, /status: \{ in: \["DRAFTED", "WHATSAPP_OPENED"\] \}/);
});

test("message and link are server-owned; no delivery claims or secrets exist", () => {
  assert.match(service, /generateReminderMessage\(input\.reminderType, context\)/);
  assert.match(repository, /whatsappClickToChatUrl\(/);
  assert.match(validation, /customerId: z\.uuid/);
  // status is only a list filter; create/update bodies never accept it.
  const createBlock = validation.slice(
    validation.indexOf("createReminderSchema"),
    validation.indexOf("updateReminderSchema"),
  );
  const updateBlock = validation.slice(
    validation.indexOf("updateReminderSchema"),
    validation.indexOf("reminderStatusFilterSchema"),
  );
  assert.doesNotMatch(createBlock, /status:/);
  assert.doesNotMatch(updateBlock, /status:/);
  for (const source of [repository, service, controller, ...routes]) {
    assert.doesNotMatch(source, /process\.env/);
    // Comments explicitly say there is no delivery; assert no delivery code.
    assert.doesNotMatch(
      source,
      /\bcron\b|\bschedule\(|\bfetch\(|\bsendMessage\(|\bdeliverMessage\(|\bprovider\b/i,
    );
  }
});

test("service enforces membership and guards every transition", () => {
  assert.match(service, /requireMembership\(user, businessId\)/);
  assert.match(service, /memberships\.findMembership\(user\.id, businessId\)/);
  assert.match(service, /findCreateContext\(businessId, input\.customerId, input\.invoiceId\)/);
  assert.match(service, /canEditMessage\(existing\.status\)/);
  assert.match(service, /canReschedule\(existing\.status\)/);
  assert.match(service, /canMarkSent\(existing\.status\)/);
  assert.doesNotMatch(service, /\.delete\(/);
});
