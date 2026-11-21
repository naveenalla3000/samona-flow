import assert from "node:assert/strict";
import test from "node:test";
import { invoiceNumberPrefix, nextInvoiceNumber } from "@/lib/invoice-numbering";

test("invoice numbers use the issue year prefix", () => {
  assert.equal(invoiceNumberPrefix("2026-01-31"), "INV-2026-");
  assert.throws(() => invoiceNumberPrefix("bad-date"));
});

test("next number uses the highest existing suffix and ignores gaps", () => {
  const prefix = invoiceNumberPrefix("2026-06-01");
  assert.equal(
    nextInvoiceNumber(prefix, ["INV-2026-0001", "INV-2026-0007", "INV-2026-0003"]),
    "INV-2026-0008",
  );
  assert.equal(nextInvoiceNumber(prefix, []), "INV-2026-0001");
});

test("numbers from another year are ignored", () => {
  const prefix = invoiceNumberPrefix("2027-01-01");
  assert.equal(nextInvoiceNumber(prefix, ["INV-2026-0099"]), "INV-2027-0001");
});
