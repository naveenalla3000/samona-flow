import assert from "node:assert/strict";
import test from "node:test";
import {
  createInvoiceSchema,
  listInvoicesQuerySchema,
  updateInvoiceSchema,
} from "@/lib/validations/invoice";

const validBody = {
  customerId: "30000000-0000-4000-8000-000000000001",
  issueDate: "2026-06-01",
  dueDate: "2026-06-15",
  currency: "inr",
  notes: "  Thank you.  ",
  discount: "2",
  tax: "1.5",
  items: [{ description: " Design work ", quantity: "2", unitPrice: "10.25" }],
};

test("create schema normalizes money, currency, notes and item text", () => {
  const parsed = createInvoiceSchema.parse(validBody);
  assert.equal(parsed.currency, "INR");
  assert.equal(parsed.notes, "Thank you.");
  assert.equal(parsed.discount, "2.00");
  assert.equal(parsed.tax, "1.50");
  assert.equal(parsed.items[0]?.description, "Design work");
  assert.equal(parsed.items[0]?.quantity, "2.00");
  assert.equal(parsed.items[0]?.unitPrice, "10.25");
});

test("client-submitted authoritative totals are stripped and never reach the service", () => {
  const parsed = createInvoiceSchema.parse({
    ...validBody,
    subtotal: "0.01",
    totalAmount: "0.01",
    items: [{ ...validBody.items[0], lineTotal: "0.01" }],
  });
  assert.equal("subtotal" in parsed, false);
  assert.equal("totalAmount" in parsed, false);
  assert.equal("lineTotal" in parsed.items[0], false);
});

test("schema rejects zero/negative quantity, invalid dates and bad amounts", () => {
  const zeroQuantity = createInvoiceSchema.safeParse({
    ...validBody,
    items: [{ ...validBody.items[0], quantity: "0" }],
  });
  assert.equal(zeroQuantity.success, false);

  const badDueDate = createInvoiceSchema.safeParse({ ...validBody, dueDate: "2026-05-31" });
  assert.equal(badDueDate.success, false);

  const badMoney = createInvoiceSchema.safeParse({ ...validBody, tax: "1.005" });
  assert.equal(badMoney.success, false);

  const impossibleDate = createInvoiceSchema.safeParse({ ...validBody, issueDate: "2026-02-30" });
  assert.equal(impossibleDate.success, false);
});

test("currency must be a three-letter code", () => {
  assert.equal(createInvoiceSchema.safeParse({ ...validBody, currency: "rupee" }).success, false);
  assert.equal(createInvoiceSchema.safeParse({ ...validBody, currency: "usd" }).success, true);
});

test("update schema always requires the complete items array", () => {
  assert.equal(updateInvoiceSchema.safeParse({ tax: "2.00" }).success, false);
  assert.equal(updateInvoiceSchema.safeParse({ items: validBody.items }).success, true);
});

test("list query validates and applies documented defaults", () => {
  const parsed = listInvoicesQuerySchema.parse({});
  assert.equal(parsed.page, 1);
  assert.equal(parsed.pageSize, 20);
  assert.equal(parsed.status, "all");
  assert.equal(parsed.sort, "issueDate");
  assert.equal(parsed.direction, "desc");
  assert.equal(listInvoicesQuerySchema.safeParse({ page: 0 }).success, false);
  assert.equal(listInvoicesQuerySchema.safeParse({ pageSize: 101 }).success, false);
  assert.equal(
    listInvoicesQuerySchema.safeParse({ fromDate: "2026-06-02", toDate: "2026-06-01" }).success,
    false,
  );
});
