import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync("prisma/migrations/20260101000000_init/migration.sql", "utf8");
const repository = readFileSync("src/server/repositories/invoice-repository.ts", "utf8");
const service = readFileSync("src/server/services/invoice-service.ts", "utf8");
const decimalBridge = readFileSync("src/server/utils/invoice-decimal.ts", "utf8");

function model(name: string): string {
  const start = schema.indexOf(`model ${name} {`);
  assert.ok(start >= 0, `${name} model missing`);
  return schema.slice(start, schema.indexOf("\n}", start));
}

test("schema enforces per-business invoice numbers and tenant-pinned relations", () => {
  const invoice = model("Invoice");
  assert.match(invoice, /@@unique\(\[businessId, invoiceNumber\]\)/);
  assert.match(invoice, /@@unique\(\[id, businessId\]\)/);
  assert.match(
    invoice,
    /customer\s+Customer\s+@relation\(fields: \[customerId, businessId\], references: \[id, businessId\]/,
  );

  const item = model("InvoiceItem");
  assert.match(
    item,
    /invoice\s+Invoice\s+@relation\(fields: \[invoiceId, businessId\], references: \[id, businessId\]/,
  );
  assert.match(item, /@@unique\(\[invoiceId, position\]\)/);
});

test("applied CHECK constraints back the server-side calculations", () => {
  assert.match(migration, /CHECK \(line_total = ROUND\(quantity \* unit_price, 2\)\)/);
  assert.match(migration, /CHECK \(total_amount = subtotal - discount \+ tax\)/);
  assert.match(migration, /CHECK \(discount <= subtotal\)/);
  assert.match(migration, /CHECK \(total_amount >= 0\)/);
  assert.match(migration, /CHECK \(quantity > 0\)/);
  assert.match(migration, /CHECK \(unit_price >= 0\)/);
  assert.match(migration, /CHECK \(currency ~ '\^\[A-Z\]\{3\}\$'\)/);
});

test("repository never addresses an invoice without its business id", () => {
  assert.doesNotMatch(repository, /invoice\.findUnique\(/);
  assert.match(repository, /where: \{ id: invoiceId, businessId \}/);
  assert.match(repository, /where: \{ id: invoiceId, businessId, status: "DRAFT" \}/);
  assert.match(repository, /deleteMany\(\{ where: \{ invoiceId, businessId \} \}\)/);
  assert.match(repository, /createMany\(\{\s*data: toItemData\(input\.items\)\.map/);
});

test("invoice deletion is not exposed", () => {
  assert.doesNotMatch(repository, /invoice\.delete/);
  assert.doesNotMatch(service, /\.delete\(/);
});

test("creation, numbering and item replacement are transactional", () => {
  assert.match(repository, /prisma\.\$transaction/);
  assert.ok(
    repository.split("prisma.$transaction").length - 1 >= 2,
    "create and update must both be transactional",
  );
  assert.match(repository, /P2002/);
  assert.match(repository, /MAX_NUMBER_ATTEMPTS/);
});

test("Prisma Decimal is used at the persistence boundary with HALF_UP rounding", () => {
  assert.match(decimalBridge, /new Prisma\.Decimal\(value\)/);
  assert.match(decimalBridge, /toDecimalPlaces\(2, Prisma\.Decimal\.ROUND_HALF_UP\)/);
  assert.match(repository, /moneyDecimal\(input\.totalAmount\)/);
  assert.match(repository, /moneyDecimal\(item\.lineTotal\)/);
});

test("service owns every money calculation and lifecycle decision", () => {
  assert.match(service, /calculateInvoiceTotals\(/);
  assert.match(service, /assertValidAmounts\(totals\)/);
  assert.match(service, /canEditInvoice\(existing\.status\)/);
  assert.match(service, /canSendInvoice\(existing\.status\)/);
  assert.match(service, /canVoidInvoice\(existing\.status\)/);
  assert.match(service, /requireCustomer\(businessId/);
});
