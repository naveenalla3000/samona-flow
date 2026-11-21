import assert from "node:assert/strict";
import test from "node:test";
import {
  activePaidCents,
  calculatePaymentSummary,
  derivePaymentStatus,
  outstandingCents,
  paymentFitsOutstanding,
} from "@/lib/payment-math";

test("payment sums use exact integer minor units", () => {
  const payments = [
    { amount: "0.01", reversed: false },
    { amount: "0.02", reversed: false },
    { amount: "10.25", reversed: false },
  ];
  assert.equal(activePaidCents(payments), BigInt(1028));
  assert.deepEqual(calculatePaymentSummary("100.00", payments), {
    amountPaid: "10.28",
    outstandingAmount: "89.72",
  });
});

test("reversed payments are excluded from effective paid totals", () => {
  const payments = [
    { amount: "40.00", reversed: false },
    { amount: "25.50", reversed: true },
    { amount: "10.00", reversed: false },
  ];
  assert.equal(activePaidCents(payments), BigInt(5000));
  assert.equal(outstandingCents("100.00", payments), BigInt(5000));
  assert.deepEqual(calculatePaymentSummary("100.00", payments), {
    amountPaid: "50.00",
    outstandingAmount: "50.00",
  });
});

test("status is derived only from effective receipts", () => {
  const one = [{ amount: "25.00", reversed: false }];
  const full = [{ amount: "100.00", reversed: false }];
  const reversed = [{ amount: "100.00", reversed: true }];
  assert.equal(derivePaymentStatus("100.00", one), "PARTIALLY_PAID");
  assert.equal(derivePaymentStatus("100.00", full), "PAID");
  assert.equal(derivePaymentStatus("100.00", reversed), "SENT");
  assert.equal(derivePaymentStatus("100.00", reversed, "OVERDUE"), "OVERDUE");
});

test("fit check uses the remaining balance, not the invoice total", () => {
  const payments = [{ amount: "60.00", reversed: false }];
  assert.equal(paymentFitsOutstanding("40.00", "100.00", payments), true);
  assert.equal(paymentFitsOutstanding("40.01", "100.00", payments), false);
  assert.equal(paymentFitsOutstanding("0.01", "0.00", []), false);
});

test("large Decimal(12,2) values remain exact", () => {
  const payments = [
    { amount: "9999999999.98", reversed: false },
    { amount: "0.01", reversed: false },
  ];
  assert.deepEqual(calculatePaymentSummary("9999999999.99", payments), {
    amountPaid: "9999999999.99",
    outstandingAmount: "0.00",
  });
});
