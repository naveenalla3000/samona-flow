import assert from "node:assert/strict";
import test from "node:test";
import { businessLocalDate, dateAfter } from "@/lib/business-date";
import { canEditInvoice, canSendInvoice, canVoidInvoice, deriveDisplayStatus } from "@/lib/invoice-status";

test("lifecycle matrix allows only the documented transitions", () => {
  assert.equal(canEditInvoice("DRAFT"), true);
  assert.equal(canEditInvoice("SENT"), false);
  assert.equal(canSendInvoice("DRAFT"), true);
  assert.equal(canSendInvoice("SENT"), false);
  assert.equal(canVoidInvoice("SENT"), true);
  assert.equal(canVoidInvoice("PARTIALLY_PAID"), true);
  assert.equal(canVoidInvoice("OVERDUE"), true);
  assert.equal(canVoidInvoice("DRAFT"), false);
  assert.equal(canVoidInvoice("PAID"), false);
  assert.equal(canVoidInvoice("VOID"), false);
});

test("overdue is derived from business-local date only when a balance remains", () => {
  assert.equal(deriveDisplayStatus("SENT", "2026-06-01", "10.00", "2026-06-15"), "OVERDUE");
  assert.equal(deriveDisplayStatus("PARTIALLY_PAID", "2026-06-01", "0.01", "2026-06-15"), "OVERDUE");
  assert.equal(deriveDisplayStatus("SENT", "2026-06-01", "0.00", "2026-06-15"), "SENT");
  assert.equal(deriveDisplayStatus("SENT", "2026-06-15", "10.00", "2026-06-15"), "SENT");
  assert.equal(deriveDisplayStatus("PAID", "2026-06-01", "10.00", "2026-06-15"), "PAID");
  assert.equal(deriveDisplayStatus("VOID", "2026-06-01", "10.00", "2026-06-15"), "VOID");
});

test("business-local dates respect the business timezone", () => {
  const now = new Date("2026-01-01T18:30:00.000Z");
  assert.equal(businessLocalDate("Asia/Kolkata", now), "2026-01-02");
  assert.equal(businessLocalDate("UTC", now), "2026-01-01");
  assert.equal(dateAfter("2026-12-30", 3), "2027-01-02");
});
