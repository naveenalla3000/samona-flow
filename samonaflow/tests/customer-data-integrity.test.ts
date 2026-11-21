import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const repository = readFileSync("src/server/repositories/customer-repository.ts", "utf8");
const service = readFileSync("src/server/services/customer-service.ts", "utf8");

test("schema models customers as archive-only with business scoping", () => {
  const customerModel = schema.slice(
    schema.indexOf("model Customer {"),
    schema.indexOf("model Invoice {"),
  );
  assert.match(customerModel, /archivedAt DateTime\?/);
  assert.match(customerModel, /@@unique\(\[id, businessId\]\)/);
  assert.match(customerModel, /@@index\(\[businessId, archivedAt\]\)/);
});

test("financial children restrict deletion so invoice history cannot be broken", () => {
  const invoiceModel = schema.slice(
    schema.indexOf("model Invoice {"),
    schema.indexOf("model InvoiceItem {"),
  );
  assert.match(
    invoiceModel,
    /customer\s+Customer\s+@relation\([^)]*onDelete: Restrict\)/,
  );

  const reminderModel = schema.slice(schema.indexOf("model Reminder {"));
  assert.match(
    reminderModel,
    /customer\s+Customer\s+@relation\([^)]*onDelete: Restrict\)/,
  );
});

test("no customer delete path exists in the customer module", () => {
  assert.doesNotMatch(repository, /customer\.delete/);
  assert.doesNotMatch(service, /\.delete\(/);
  assert.match(repository, /data: \{ archivedAt: new Date\(\) \}/);
});
