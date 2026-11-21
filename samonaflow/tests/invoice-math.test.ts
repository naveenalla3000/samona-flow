import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateInvoiceTotals,
  formatMoney,
  lineTotalCents,
  MAX_MONEY_CENTS,
  parseMoney,
} from "@/lib/invoice-math";

test("money parsing and formatting are exact strings, never floats", () => {
  assert.equal(parseMoney("0").toString(), "0");
  assert.equal(parseMoney("10.5").toString(), "1050");
  assert.equal(formatMoney(BigInt(1050)), "10.50");
  assert.equal(formatMoney(BigInt(-1234)), "-12.34");
  assert.throws(() => parseMoney("10.005"));
  assert.throws(() => parseMoney("1e3"));
});

test("line totals round HALF_UP to two decimals", () => {
  // 1.15 * 10.05 = 11.5575 -> 11.56.
  assert.equal(formatMoney(lineTotalCents("1.15", "10.05")), "11.56");
  // 1.05 * 10.05 = 10.5525 -> 10.55.
  assert.equal(formatMoney(lineTotalCents("1.05", "10.05")), "10.55");
  assert.equal(formatMoney(lineTotalCents("2", "10.25")), "20.50");
});

test("subtotal sums rounded line totals before discount and tax", () => {
  const totals = calculateInvoiceTotals(
    [
      { quantity: "2", unitPrice: "10.25" },
      { quantity: "1.15", unitPrice: "10.05" },
    ],
    "2.06",
    "1.00",
  );
  assert.deepEqual(totals, {
    subtotal: "32.06",
    discount: "2.06",
    tax: "1.00",
    totalAmount: "31.00",
  });
});

test("maximum supported amount matches Decimal(12, 2)", () => {
  assert.equal(MAX_MONEY_CENTS.toString(), "999999999999");
  assert.equal(formatMoney(MAX_MONEY_CENTS), "9999999999.99");
});
