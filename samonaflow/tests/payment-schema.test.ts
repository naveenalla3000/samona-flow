import assert from "node:assert/strict";
import test from "node:test";
import {
  createPaymentSchema,
  listPaymentsQuerySchema,
  reversePaymentSchema,
} from "@/lib/validations/payment";
import { CUSTOMER_A } from "./helpers/fakes";
import { INVOICE_A } from "./helpers/invoice-fakes";

const INVOICE_A_ID_FOR_TEST = INVOICE_A;

const valid = {
  invoiceId: INVOICE_A_ID_FOR_TEST,
  amount: "10.5",
  paymentDate: "2026-06-10",
  method: "UPI",
  transactionReference: "  TXN-1  ",
  notes: "  Paid by bank app  ",
};

test("create schema normalizes money, text and method", () => {
  const parsed = createPaymentSchema.parse(valid);
  assert.deepEqual(parsed, {
    invoiceId: INVOICE_A_ID_FOR_TEST,
    amount: "10.50",
    paymentDate: "2026-06-10",
    method: "UPI",
    transactionReference: "TXN-1",
    notes: "Paid by bank app",
  });
});

test("client-submitted balances, status and currency are stripped", () => {
  const parsed = createPaymentSchema.parse({
    ...valid,
    amountPaid: "999.99",
    outstandingAmount: "0.00",
    status: "PAID",
    currency: "USD",
    reversal: { reason: "fake" },
  });
  assert.equal(parsed.amount, "10.50");
  assert.equal("amountPaid" in parsed, false);
  assert.equal("status" in parsed, false);
  assert.equal("currency" in parsed, false);
  assert.equal("reversal" in parsed, false);
});

test("create schema rejects zero, negative, floating-point and oversized amounts", () => {
  for (const amount of ["0", "0.00", "-1.00", "10000000000.00", "1.234", 10]) {
    assert.equal(createPaymentSchema.safeParse({ ...valid, amount }).success, false, String(amount));
  }
});

test("create schema rejects invalid dates, methods and invoice ids", () => {
  assert.equal(createPaymentSchema.safeParse({ ...valid, paymentDate: "2026-02-30" }).success, false);
  assert.equal(createPaymentSchema.safeParse({ ...valid, method: "CHEQUE" }).success, false);
  assert.equal(createPaymentSchema.safeParse({ ...valid, invoiceId: "not-a-uuid" }).success, false);
});

test("reversal requires a non-empty reason", () => {
  assert.equal(reversePaymentSchema.safeParse({ reason: "duplicate payment" }).success, true);
  assert.equal(reversePaymentSchema.safeParse({ reason: "  " }).success, false);
  assert.equal(reversePaymentSchema.safeParse({}).success, false);
});

test("list query validates and applies documented defaults", () => {
  assert.deepEqual(listPaymentsQuerySchema.parse({}), {
    page: 1,
    pageSize: 20,
    status: "all",
    sort: "paymentDate",
    direction: "desc",
  });
  const parsed = listPaymentsQuerySchema.parse({
    page: "2",
    pageSize: "50",
    status: "REVERSED",
    method: "CASH",
    invoiceId: INVOICE_A_ID_FOR_TEST,
    customerId: CUSTOMER_A,
    sort: "amount",
    direction: "asc",
  });
  assert.equal(parsed.page, 2);
  assert.equal(parsed.pageSize, 50);
  assert.equal(parsed.status, "REVERSED");
  assert.equal(parsed.method, "CASH");
  assert.equal(parsed.sort, "amount");
  assert.equal(
    listPaymentsQuerySchema.safeParse({ pageSize: "101" }).success,
    false,
  );
  assert.equal(
    listPaymentsQuerySchema.safeParse({ status: "ACTIVE" }).success,
    false,
  );
});
