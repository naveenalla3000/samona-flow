import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync("prisma/migrations/20260101000000_init/migration.sql", "utf8");
const repository = readFileSync("src/server/repositories/payment-repository.ts", "utf8");
const service = readFileSync("src/server/services/payment-service.ts", "utf8");

function model(name: string): string {
  const start = schema.indexOf(`model ${name} {`);
  assert.ok(start >= 0, `${name} model missing`);
  return schema.slice(start, schema.indexOf("\n}", start));
}

test("Payment is append-only and tenant-pinned to its invoice", () => {
  const payment = model("Payment");
  assert.match(payment, /@@unique\(\[id, businessId\]\)/);
  assert.match(
    payment,
    /invoice\s+Invoice\s+@relation\(fields: \[invoiceId, businessId\], references: \[id, businessId\]/,
  );
  assert.doesNotMatch(payment, /updatedAt/);
});

test("PaymentReversal is auditable and allows only one reversal per payment", () => {
  const reversal = model("PaymentReversal");
  assert.match(reversal, /@@unique\(\[paymentId\]\)/);
  assert.match(
    reversal,
    /payment\s+Payment\s+@relation\(fields: \[paymentId, businessId\], references: \[id, businessId\]/,
  );
  assert.match(reversal, /reversedBy\s+UserProfile/);
  assert.match(reversal, /reason\s+String/);
  assert.doesNotMatch(reversal, /updatedAt/);
});

test("applied database constraints reject invalid amounts and duplicate reversals", () => {
  assert.match(migration, /CHECK \(amount > 0\)/);
  assert.match(migration, /CREATE UNIQUE INDEX "payment_reversals_payment_id_key"/);
  assert.match(migration, /payments_business_id_fkey/);
  assert.match(migration, /payments_invoice_id_business_id_fkey/);
  assert.match(migration, /payment_reversals_payment_id_business_id_fkey/);
});

test("repository never addresses a payment or invoice by id alone", () => {
  assert.doesNotMatch(repository, /payment\.findUnique\(/);
  assert.doesNotMatch(repository, /invoice\.findUnique\(/);
  assert.match(repository, /where: \{ id: paymentId, businessId \}/);
  assert.match(repository, /where: \{ id: invoiceId, businessId \}/);
  assert.match(repository, /where: \{ id: input\.invoiceId, businessId: input\.businessId \}/);
});

test("recording and reversal are transactional and row-locked", () => {
  assert.match(repository, /prisma\.\$transaction/);
  assert.match(repository, /FOR UPDATE/);
  assert.ok(repository.split("FOR UPDATE").length - 1 >= 2, "invoice and payment rows are both locked");
  assert.match(repository, /paymentFitsOutstanding\(/);
  assert.match(repository, /PAYMENT_EXCEEDS_OUTSTANDING/);
  assert.match(repository, /PAYMENT_ALREADY_REVERSED/);
});

test("no delete or undo path exists for payments or reversals", () => {
  assert.doesNotMatch(repository, /payment\.delete/);
  assert.doesNotMatch(repository, /paymentReversal\.delete/);
  assert.doesNotMatch(repository, /payment\.update\(/);
  assert.doesNotMatch(service, /\.delete\(/);
});

test("money is persisted through Prisma.Decimal", () => {
  assert.match(repository, /moneyDecimal\(input\.amount\)/);
  assert.match(repository, /toFixed\(2\)/);
  assert.doesNotMatch(repository, /Number\(input\.amount\)/);
});

test("service enforces membership and derives the reversal actor from the session", () => {
  assert.match(service, /requireMembership\(user, businessId\)/);
  assert.match(service, /memberships\.findMembership\(user\.id, businessId\)/);
  assert.match(service, /reversedById: user\.id/);
  assert.match(service, /canRecordPayment\(invoice\.status\)/);
  assert.match(service, /canReversePayment\(existing\.invoice\.status\)/);
});
