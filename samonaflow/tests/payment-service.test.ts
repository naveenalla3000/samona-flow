import assert from "node:assert/strict";
import test from "node:test";
import { listPaymentsQuerySchema } from "@/lib/validations/payment";
import { createPaymentService, PaymentServiceError } from "@/server/services/payment-service";
import {
  BUSINESS_A,
  BUSINESS_B,
  CUSTOMER_A,
  CUSTOMER_B,
  USER_A,
  USER_B,
  createFakeMemberships,
} from "./helpers/fakes";
import {
  INVOICE_FOR_PAYMENT,
  createFakePaymentRepository,
  makePaymentInvoiceContext,
} from "./helpers/payment-fakes";

const INVOICE_B = "50000000-0000-4000-8000-000000000002";
const QUERY = listPaymentsQuerySchema.parse({});

function setup() {
  const payments = createFakePaymentRepository([
    makePaymentInvoiceContext({ id: INVOICE_FOR_PAYMENT, businessId: BUSINESS_A, customerId: CUSTOMER_A }),
    makePaymentInvoiceContext({
      id: INVOICE_B,
      businessId: BUSINESS_B,
      customerId: CUSTOMER_B,
      invoiceNumber: "INV-B-0001",
      currency: "USD",
      totalAmount: "200.00",
      outstandingAmount: "200.00",
    }),
  ]);
  const service = createPaymentService({
    memberships: createFakeMemberships(),
    payments: payments.repository,
  });
  return { service, payments };
}

function paymentInput(overrides: Record<string, unknown> = {}) {
  return {
    invoiceId: INVOICE_FOR_PAYMENT,
    amount: "25.00",
    paymentDate: "2026-06-10",
    method: "UPI" as const,
    transactionReference: "TXN-1",
    notes: null,
    ...overrides,
  };
}

async function errorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    assert.ok(error instanceof PaymentServiceError);
    return error.code;
  }
}

test("records a partial payment and recomputes the outstanding balance", async () => {
  const { service, payments } = setup();
  const payment = await service.create(USER_A, BUSINESS_A, paymentInput({ amount: "25.50" }));

  assert.equal(payment.amount, "25.50");
  assert.equal(payment.currency, "INR");
  assert.equal(payment.status, "RECORDED");
  const invoice = payments.getInvoice(BUSINESS_A, INVOICE_FOR_PAYMENT)!;
  assert.equal(invoice.amountPaid, "25.50");
  assert.equal(invoice.outstandingAmount, "74.50");
  assert.equal(invoice.status, "PARTIALLY_PAID");
});

test("multiple payments can fully pay an invoice", async () => {
  const { service, payments } = setup();
  await service.create(USER_A, BUSINESS_A, paymentInput({ amount: "30.00", transactionReference: "A" }));
  await service.create(USER_A, BUSINESS_A, paymentInput({ amount: "70.00", transactionReference: "B" }));

  const invoice = payments.getInvoice(BUSINESS_A, INVOICE_FOR_PAYMENT)!;
  assert.equal(invoice.amountPaid, "100.00");
  assert.equal(invoice.outstandingAmount, "0.00");
  assert.equal(invoice.status, "PAID");
  assert.equal(payments.count(), 2);
});

test("payment amounts are summed exactly at two decimal places", async () => {
  const { service, payments } = setup();
  await service.create(USER_A, BUSINESS_A, paymentInput({ amount: "0.01" }));
  await service.create(USER_A, BUSINESS_A, paymentInput({ amount: "0.02" }));
  const invoice = payments.getInvoice(BUSINESS_A, INVOICE_FOR_PAYMENT)!;
  assert.equal(invoice.amountPaid, "0.03");
  assert.equal(invoice.outstandingAmount, "99.97");
});

test("a payment cannot exceed the outstanding balance", async () => {
  const { service, payments } = setup();
  await service.create(USER_A, BUSINESS_A, paymentInput({ amount: "60.00" }));
  assert.equal(
    await errorCode(service.create(USER_A, BUSINESS_A, paymentInput({ amount: "40.01" }))),
    "PAYMENT_EXCEEDS_OUTSTANDING",
  );
  assert.equal(payments.count(), 1);
  assert.equal(payments.getInvoice(BUSINESS_A, INVOICE_FOR_PAYMENT)!.amountPaid, "60.00");
});

test("concurrent payments cannot both spend the same balance", async () => {
  const { service, payments } = setup();
  payments.enableConcurrencyBarrier();
  const results = await Promise.allSettled([
    service.create(USER_A, BUSINESS_A, paymentInput({ amount: "60.00" })),
    service.create(USER_A, BUSINESS_A, paymentInput({ amount: "60.00" })),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(payments.count(), 1);
  assert.equal(payments.getInvoice(BUSINESS_A, INVOICE_FOR_PAYMENT)!.amountPaid, "60.00");
});

test("a failed create rolls back the payment and invoice status", async () => {
  const { service, payments } = setup();
  payments.failNextCreate();
  await assert.rejects(service.create(USER_A, BUSINESS_A, paymentInput()), /simulated/);
  assert.equal(payments.count(), 0);
  const invoice = payments.getInvoice(BUSINESS_A, INVOICE_FOR_PAYMENT)!;
  assert.equal(invoice.amountPaid, "0.00");
  assert.equal(invoice.status, "SENT");
});

test("reversal records reason and actor, then restores the balance", async () => {
  const { service, payments } = setup();
  const payment = await service.create(USER_A, BUSINESS_A, paymentInput({ amount: "60.00" }));
  const reversed = await service.reverse(USER_A, BUSINESS_A, payment.id, {
    reason: "duplicate bank entry",
  });

  assert.equal(reversed.status, "REVERSED");
  assert.equal(reversed.reversal?.reason, "duplicate bank entry");
  assert.equal(reversed.reversal?.reversedById, USER_A.id);
  assert.equal(reversed.reversal?.reversedByEmail, "owner-a@example.com");
  const invoice = payments.getInvoice(BUSINESS_A, INVOICE_FOR_PAYMENT)!;
  assert.equal(invoice.amountPaid, "0.00");
  assert.equal(invoice.outstandingAmount, "100.00");
  assert.equal(invoice.status, "SENT");
});

test("reversing one of several payments excludes only that payment", async () => {
  const { service, payments } = setup();
  const first = await service.create(USER_A, BUSINESS_A, paymentInput({ amount: "25.00" }));
  await service.create(USER_A, BUSINESS_A, paymentInput({ amount: "25.00" }));
  await service.reverse(USER_A, BUSINESS_A, first.id, { reason: "customer refund" });

  const invoice = payments.getInvoice(BUSINESS_A, INVOICE_FOR_PAYMENT)!;
  assert.equal(invoice.amountPaid, "25.00");
  assert.equal(invoice.outstandingAmount, "75.00");
  assert.equal(invoice.status, "PARTIALLY_PAID");
  assert.equal(payments.count(), 2);
});

test("a payment can be reversed only once", async () => {
  const { service } = setup();
  const payment = await service.create(USER_A, BUSINESS_A, paymentInput());
  await service.reverse(USER_A, BUSINESS_A, payment.id, { reason: "first reversal" });
  assert.equal(
    await errorCode(service.reverse(USER_A, BUSINESS_A, payment.id, { reason: "second reversal" })),
    "PAYMENT_ALREADY_REVERSED",
  );
});

test("reversals are blocked for void invoices", async () => {
  const { service, payments } = setup();
  const payment = await service.create(USER_A, BUSINESS_A, paymentInput());
  payments.setInvoiceStatus(BUSINESS_A, INVOICE_FOR_PAYMENT, "VOID");
  assert.equal(
    await errorCode(service.reverse(USER_A, BUSINESS_A, payment.id, { reason: "voided invoice" })),
    "INVOICE_LOCKED",
  );
});

test("draft, void and fully paid invoices reject new payments", async () => {
  const { service, payments } = setup();
  payments.setInvoiceStatus(BUSINESS_A, INVOICE_FOR_PAYMENT, "DRAFT");
  assert.equal(
    await errorCode(service.create(USER_A, BUSINESS_A, paymentInput())),
    "INVOICE_LOCKED",
  );
  payments.setInvoiceStatus(BUSINESS_A, INVOICE_FOR_PAYMENT, "PAID");
  assert.equal(
    await errorCode(service.create(USER_A, BUSINESS_A, paymentInput())),
    "INVOICE_LOCKED",
  );
});

test("membership, invoice and payment ownership are enforced in the service", async () => {
  const { service } = setup();
  assert.equal(
    await errorCode(service.create(USER_B, BUSINESS_A, paymentInput())),
    "BUSINESS_FORBIDDEN",
  );
  assert.equal(
    await errorCode(service.create(USER_A, BUSINESS_A, paymentInput({ invoiceId: INVOICE_B }))),
    "INVOICE_NOT_FOUND",
  );
  assert.equal(
    await errorCode(service.get(USER_A, BUSINESS_A, "70000000-0000-4000-8000-000000000099")),
    "PAYMENT_NOT_FOUND",
  );

  const foreign = await service.create(
    USER_B,
    BUSINESS_B,
    paymentInput({ invoiceId: INVOICE_B, amount: "10.00" }),
  );
  assert.equal(
    await errorCode(service.get(USER_A, BUSINESS_A, foreign.id)),
    "PAYMENT_NOT_FOUND",
  );
  assert.equal(
    await errorCode(service.reverse(USER_A, BUSINESS_A, foreign.id, { reason: "cross business" })),
    "PAYMENT_NOT_FOUND",
  );
});

test("list is tenant-scoped, searchable, filterable, sortable and paginated", async () => {
  const { service } = setup();
  await service.create(USER_A, BUSINESS_A, paymentInput({ amount: "10.00", transactionReference: "ALPHA-1" }));
  await service.create(USER_A, BUSINESS_A, paymentInput({ amount: "20.00", method: "CASH", paymentDate: "2026-06-11" }));
  const foreign = await service.create(
    USER_B,
    BUSINESS_B,
    paymentInput({ invoiceId: INVOICE_B, amount: "15.00" }),
  );

  const all = await service.list(USER_A, BUSINESS_A, QUERY);
  assert.equal(all.total, 2);
  assert.equal(all.items.every((item) => item.businessId === BUSINESS_A), true);

  const searched = await service.list(USER_A, BUSINESS_A, { ...QUERY, search: "alpha" });
  assert.equal(searched.total, 1);
  assert.equal(searched.items[0]?.transactionReference, "ALPHA-1");

  const filtered = await service.list(USER_A, BUSINESS_A, { ...QUERY, method: "CASH" });
  assert.equal(filtered.total, 1);
  assert.equal(filtered.items[0]?.method, "CASH");

  const sorted = await service.list(USER_A, BUSINESS_A, {
    ...QUERY,
    sort: "amount",
    direction: "asc",
  });
  assert.deepEqual(sorted.items.map((item) => item.amount), ["10.00", "20.00"]);

  const paged = await service.list(USER_A, BUSINESS_A, { ...QUERY, pageSize: 1, page: 2 });
  assert.equal(paged.items.length, 1);
  assert.equal(paged.totalPages, 2);

  const foreignList = await service.list(USER_A, BUSINESS_A, {
    ...QUERY,
    search: foreign.id,
  });
  assert.equal(foreignList.total, 0);
});

test("invoice history is tenant-scoped to the requested invoice", async () => {
  const { service, payments } = setup();
  await service.create(USER_A, BUSINESS_A, paymentInput({ amount: "5.00" }));
  payments.seedInvoice(
    makePaymentInvoiceContext({
      id: "50000000-0000-4000-8000-000000000003",
      businessId: BUSINESS_A,
      customerId: CUSTOMER_A,
      invoiceNumber: "INV-2026-0002",
    }),
  );
  await service.create(
    USER_A,
    BUSINESS_A,
    paymentInput({
      invoiceId: "50000000-0000-4000-8000-000000000003",
      amount: "7.00",
    }),
  );

  const history = await service.listForInvoice(USER_A, BUSINESS_A, INVOICE_FOR_PAYMENT, QUERY);
  assert.equal(history.total, 1);
  assert.equal(history.items[0]?.amount, "5.00");
  assert.equal(
    await errorCode(service.listForInvoice(USER_A, BUSINESS_A, INVOICE_B, QUERY)),
    "INVOICE_NOT_FOUND",
  );
});

test("reversal actor always comes from the verified session", async () => {
  const { service } = setup();
  const payment = await service.create(USER_A, BUSINESS_A, paymentInput());
  const reversed = await service.reverse(USER_A, BUSINESS_A, payment.id, {
    reason: "session identity check",
    reversedById: USER_B.id,
  } as never);
  assert.equal(reversed.reversal?.reversedById, USER_A.id);
});
