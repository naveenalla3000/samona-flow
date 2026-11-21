import assert from "node:assert/strict";
import test from "node:test";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import { createPaymentController, type Authenticate } from "@/server/controllers/payment-controller";
import { createPaymentService } from "@/server/services/payment-service";
import {
  BUSINESS_A,
  BUSINESS_B,
  CUSTOMER_A,
  CUSTOMER_B,
  USER_A,
  createFakeMemberships,
} from "./helpers/fakes";
import {
  INVOICE_FOR_PAYMENT,
  createFakePaymentRepository,
  makePaymentInvoiceContext,
} from "./helpers/payment-fakes";

const INVOICE_B = "50000000-0000-4000-8000-000000000002";

const UNAUTHORIZED = () =>
  Response.json(
    { error: "unauthenticated", message: "Authentication is required." },
    { status: 401 },
  );

const validBody = {
  invoiceId: INVOICE_FOR_PAYMENT,
  amount: "10.5",
  paymentDate: "2026-06-10",
  method: "UPI",
  transactionReference: "TXN-1",
  notes: "Paid",
};

function setup(options: { authenticateAs?: AuthenticatedUser | null } = {}) {
  const payments = createFakePaymentRepository([
    makePaymentInvoiceContext({ id: INVOICE_FOR_PAYMENT, businessId: BUSINESS_A, customerId: CUSTOMER_A }),
    makePaymentInvoiceContext({
      id: INVOICE_B,
      businessId: BUSINESS_B,
      customerId: CUSTOMER_B,
      invoiceNumber: "INV-B-0001",
      totalAmount: "200.00",
      outstandingAmount: "200.00",
      currency: "USD",
    }),
  ]);
  const authenticate: Authenticate = async () => {
    const user = options.authenticateAs === undefined ? USER_A : options.authenticateAs;
    return user ? { ok: true, user } : { ok: false, response: UNAUTHORIZED() };
  };
  const service = createPaymentService({
    memberships: createFakeMemberships(),
    payments: payments.repository,
  });
  const controller = createPaymentController({ authenticate, service });
  return { controller, service, payments };
}

function request(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const base = `http://localhost/api/v1/businesses/${BUSINESS_A}`;

test("POST records a payment and ignores client-submitted derived fields", async () => {
  const { controller, payments } = setup();
  const response = await controller.create(
    request("POST", `${base}/payments`, {
      ...validBody,
      amountPaid: "999.99",
      outstandingAmount: "0.00",
      status: "PAID",
      currency: "USD",
    }),
    BUSINESS_A,
  );
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.equal(payload.data.payment.amount, "10.50");
  assert.equal(payload.data.payment.currency, "INR");
  assert.equal(payload.data.payment.status, "RECORDED");
  assert.equal(payments.getInvoice(BUSINESS_A, INVOICE_FOR_PAYMENT)?.status, "PARTIALLY_PAID");
});

test("POST returns 400 for invalid payment data and invalid JSON", async () => {
  const { controller } = setup();
  const invalid = await controller.create(
    request("POST", `${base}/payments`, { ...validBody, amount: "-1.00" }),
    BUSINESS_A,
  );
  assert.equal(invalid.status, 400);
  const payload = await invalid.json();
  assert.equal(payload.error.code, "invalid_request");
  assert.ok(payload.error.fieldErrors.amount);

  const malformed = await controller.create(
    new Request(`${base}/payments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }),
    BUSINESS_A,
  );
  assert.equal(malformed.status, 400);
});

test("GET list, detail and invoice history return consistent envelopes", async () => {
  const { controller } = setup();
  const created = await controller.create(
    request("POST", `${base}/payments`, validBody),
    BUSINESS_A,
  );
  const { payment } = (await created.json()).data;

  const list = await controller.list(request("GET", `${base}/payments?pageSize=5`), BUSINESS_A);
  assert.equal(list.status, 200);
  assert.equal((await list.json()).data.total, 1);

  const detail = await controller.get(
    request("GET", `${base}/payments/${payment.id}`),
    BUSINESS_A,
    payment.id,
  );
  assert.equal(detail.status, 200);
  const detailPayload = await detail.json();
  assert.equal(detailPayload.data.payment.invoice.id, INVOICE_FOR_PAYMENT);
  assert.equal(detailPayload.data.payment.currency, "INR");

  const history = await controller.listForInvoice(
    request("GET", `${base}/invoices/${INVOICE_FOR_PAYMENT}/payments`),
    BUSINESS_A,
    INVOICE_FOR_PAYMENT,
  );
  assert.equal(history.status, 200);
  assert.equal((await history.json()).data.total, 1);
});

test("POST reverse requires a reason and prevents duplicate reversals", async () => {
  const { controller } = setup();
  const created = await controller.create(
    request("POST", `${base}/payments`, validBody),
    BUSINESS_A,
  );
  const { payment } = (await created.json()).data;

  const noReason = await controller.reverse(
    request("POST", `${base}/payments/${payment.id}/reverse`, {}),
    BUSINESS_A,
    payment.id,
  );
  assert.equal(noReason.status, 400);

  const reversed = await controller.reverse(
    request("POST", `${base}/payments/${payment.id}/reverse`, { reason: "duplicate entry" }),
    BUSINESS_A,
    payment.id,
  );
  assert.equal(reversed.status, 200);
  assert.equal((await reversed.json()).data.payment.status, "REVERSED");

  const duplicate = await controller.reverse(
    request("POST", `${base}/payments/${payment.id}/reverse`, { reason: "again" }),
    BUSINESS_A,
    payment.id,
  );
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error.code, "payment_already_reversed");
});

test("payment exceeding outstanding returns 422", async () => {
  const { controller } = setup();
  const response = await controller.create(
    request("POST", `${base}/payments`, { ...validBody, amount: "100.01" }),
    BUSINESS_A,
  );
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, "payment_exceeds_outstanding");
});

test("unauthenticated requests are rejected on every endpoint", async () => {
  const { controller } = setup({ authenticateAs: null });
  const paymentId = "70000000-0000-4000-8000-000000000001";
  const responses = await Promise.all([
    controller.create(request("POST", `${base}/payments`, validBody), BUSINESS_A),
    controller.list(request("GET", `${base}/payments`), BUSINESS_A),
    controller.get(request("GET", `${base}/payments/${paymentId}`), BUSINESS_A, paymentId),
    controller.listForInvoice(
      request("GET", `${base}/invoices/${INVOICE_FOR_PAYMENT}/payments`),
      BUSINESS_A,
      INVOICE_FOR_PAYMENT,
    ),
    controller.reverse(
      request("POST", `${base}/payments/${paymentId}/reverse`, { reason: "test" }),
      BUSINESS_A,
      paymentId,
    ),
  ]);
  for (const response of responses) assert.equal(response.status, 401);
});

test("cross-business access is forbidden or not found, never a foreign record", async () => {
  const { controller } = setup();
  const forbidden = await controller.list(
    request("GET", `http://localhost/api/v1/businesses/${BUSINESS_B}/payments`),
    BUSINESS_B,
  );
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json()).error.code, "business_forbidden");

  const foreignInvoice = await controller.create(
    request("POST", `${base}/payments`, { ...validBody, invoiceId: INVOICE_B }),
    BUSINESS_A,
  );
  assert.equal(foreignInvoice.status, 404);
  assert.equal((await foreignInvoice.json()).error.code, "invoice_not_found");
});

test("invalid identifiers return 400 without calling the service", async () => {
  const { controller } = setup();
  const invalidBusiness = await controller.list(request("GET", `${base}/payments`), "not-a-uuid");
  assert.equal(invalidBusiness.status, 400);

  const invalidPayment = await controller.get(
    request("GET", `${base}/payments/not-a-uuid`),
    BUSINESS_A,
    "not-a-uuid",
  );
  assert.equal(invalidPayment.status, 400);

  const invalidInvoice = await controller.listForInvoice(
    request("GET", `${base}/invoices/not-a-uuid/payments`),
    BUSINESS_A,
    "not-a-uuid",
  );
  assert.equal(invalidInvoice.status, 400);
});

test("unexpected errors never expose internal database details", async () => {
  const { service } = setup();
  const failing = createPaymentController({
    authenticate: async () => ({ ok: true, user: USER_A }),
    service: {
      ...service,
      list: async () => {
        throw new Error("postgres://user:secret@host/database");
      },
    },
  });
  const response = await failing.list(request("GET", `${base}/payments`), BUSINESS_A);
  assert.equal(response.status, 500);
  const payload = await response.json();
  assert.equal(payload.error.code, "internal_error");
  assert.equal(payload.error.message, "An unexpected error occurred.");
  assert.equal(JSON.stringify(payload).includes("secret"), false);
});
