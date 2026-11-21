import assert from "node:assert/strict";
import test from "node:test";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import { createInvoiceController, type Authenticate } from "@/server/controllers/invoice-controller";
import { createInvoiceService } from "@/server/services/invoice-service";
import {
  BUSINESS_A,
  BUSINESS_B,
  CUSTOMER_A,
  CUSTOMER_B,
  USER_A,
  USER_B,
  createFakeCustomers,
  createFakeMemberships,
  makeCustomerRecord,
} from "./helpers/fakes";
import {
  INVOICE_A,
  INVOICE_B,
  createFakeInvoiceRepository,
  makeInvoiceRecord,
} from "./helpers/invoice-fakes";

const UNAUTHORIZED = () =>
  Response.json(
    { error: "unauthenticated", message: "Authentication is required." },
    { status: 401 },
  );

const validBody = {
  customerId: CUSTOMER_A,
  issueDate: "2026-06-01",
  dueDate: "2026-06-15",
  currency: "inr",
  discount: "0.00",
  tax: "0.00",
  items: [{ description: "Design", quantity: "2", unitPrice: "10.25" }],
};

function setup(options: { authenticateAs?: AuthenticatedUser | null } = {}) {
  const customers = createFakeCustomers([
    makeCustomerRecord({ id: CUSTOMER_A, businessId: BUSINESS_A, name: "Acme Studio" }),
    makeCustomerRecord({ id: CUSTOMER_B, businessId: BUSINESS_B, name: "Zulu Co" }),
  ]);
  const invoices = createFakeInvoiceRepository();
  const authenticate: Authenticate = async () => {
    const user = options.authenticateAs === undefined ? USER_A : options.authenticateAs;
    return user ? { ok: true, user } : { ok: false, response: UNAUTHORIZED() };
  };
  const controller = createInvoiceController({
    authenticate,
    service: createInvoiceService({
      memberships: createFakeMemberships(),
      customers: customers.repository,
      invoices: invoices.repository,
    }),
  });
  return { controller, invoices, customers };
}

function request(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const base = `http://localhost/api/v1/businesses/${BUSINESS_A}/invoices`;

test("POST creates a draft and ignores client-submitted totals", async () => {
  const { controller } = setup();
  const response = await controller.create(
    request("POST", base, {
      ...validBody,
      subtotal: "0.01",
      totalAmount: "0.01",
      items: [{ ...validBody.items[0], lineTotal: "0.01" }],
    }),
    BUSINESS_A,
  );
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.equal(payload.data.invoice.status, "DRAFT");
  assert.equal(payload.data.invoice.invoiceNumber, "INV-2026-0001");
  assert.equal(payload.data.invoice.subtotal, "20.50");
  assert.equal(payload.data.invoice.totalAmount, "20.50");
});

test("POST rejects invalid input with field-level errors", async () => {
  const { controller } = setup();
  const response = await controller.create(
    request("POST", base, { ...validBody, items: [] }),
    BUSINESS_A,
  );
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error.code, "invalid_request");
  assert.ok(payload.error.fieldErrors.items);
});

test("POST rejects malformed JSON", async () => {
  const { controller } = setup();
  const response = await controller.create(
    new Request(base, { method: "POST", body: "{not json" }),
    BUSINESS_A,
  );
  assert.equal(response.status, 400);
});

test("POST rejects a customer from another business with 404", async () => {
  const { controller } = setup();
  const response = await controller.create(
    request("POST", base, { ...validBody, customerId: CUSTOMER_B }),
    BUSINESS_A,
  );
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "customer_not_found");
});

test("GET lists invoices with query defaults and filters", async () => {
  const { controller, invoices } = setup();
  invoices.seedInvoice(makeInvoiceRecord({ id: INVOICE_A, status: "DRAFT" }));
  const response = await controller.list(request("GET", `${base}?status=DRAFT&pageSize=1`), BUSINESS_A);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.data.total, 1);
  assert.equal(payload.data.pageSize, 1);
  assert.equal(payload.data.items[0].invoiceNumber, "INV-2026-0001");
});

test("GET rejects invalid query parameters", async () => {
  const { controller } = setup();
  const response = await controller.list(request("GET", `${base}?sort=unknown`), BUSINESS_A);
  assert.equal(response.status, 400);
});

test("GET one returns items and payment-derived amounts", async () => {
  const { controller, invoices } = setup();
  invoices.seedInvoice(
    makeInvoiceRecord({
      id: INVOICE_A,
      status: "SENT",
      isEditable: false,
      amountPaid: "5.00",
      outstandingAmount: "15.00",
    }),
  );
  const response = await controller.get(request("GET", `${base}/${INVOICE_A}`), BUSINESS_A, INVOICE_A);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.data.invoice.amountPaid, "5.00");
  assert.equal(payload.data.invoice.outstandingAmount, "15.00");
  assert.equal(payload.data.invoice.customer.name, "Acme Studio");
});

test("GET one returns 404 for a guessed id from another business", async () => {
  const { controller, invoices } = setup();
  invoices.seedInvoice(
    makeInvoiceRecord({
      id: INVOICE_B,
      businessId: BUSINESS_B,
      customerId: CUSTOMER_B,
      status: "SENT",
    }),
  );
  const response = await controller.get(request("GET", `${base}/${INVOICE_B}`), BUSINESS_A, INVOICE_B);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "invoice_not_found");
});

test("PATCH updates a draft and recomputes totals", async () => {
  const { controller } = setup();
  const created = await controller.create(request("POST", base, validBody), BUSINESS_A);
  const invoiceId = (await created.json()).data.invoice.id as string;
  const response = await controller.update(
    request("PATCH", `${base}/${invoiceId}`, {
      tax: "2.00",
      items: [{ description: "Revised", quantity: "1", unitPrice: "5.00" }],
    }),
    BUSINESS_A,
    invoiceId,
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.data.invoice.subtotal, "5.00");
  assert.equal(payload.data.invoice.totalAmount, "7.00");
});

test("PATCH rejects an update to an issued invoice with 422", async () => {
  const { controller, invoices } = setup();
  invoices.seedInvoice(makeInvoiceRecord({ id: INVOICE_A, status: "SENT", isEditable: false }));
  const response = await controller.update(
    request("PATCH", `${base}/${INVOICE_A}`, { items: validBody.items }),
    BUSINESS_A,
    INVOICE_A,
  );
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, "invoice_locked");
});

test("PATCH rejects a body without items", async () => {
  const { controller, invoices } = setup();
  invoices.seedInvoice(makeInvoiceRecord({ status: "DRAFT" }));
  const response = await controller.update(
    request("PATCH", `${base}/${INVOICE_A}`, { tax: "1.00" }),
    BUSINESS_A,
    INVOICE_A,
  );
  assert.equal(response.status, 400);
});

test("send and void actions follow the lifecycle matrix", async () => {
  const { controller, invoices } = setup();
  invoices.seedInvoice(makeInvoiceRecord({ status: "DRAFT" }));

  const sent = await controller.send(request("POST", `${base}/${INVOICE_A}/send`), BUSINESS_A, INVOICE_A);
  assert.equal(sent.status, 200);
  assert.equal((await sent.json()).data.invoice.status, "SENT");

  const badSend = await controller.send(request("POST", `${base}/${INVOICE_A}/send`), BUSINESS_A, INVOICE_A);
  assert.equal(badSend.status, 422);
  assert.equal((await badSend.json()).error.code, "invalid_transition");

  const voided = await controller.void(request("POST", `${base}/${INVOICE_A}/void`), BUSINESS_A, INVOICE_A);
  assert.equal(voided.status, 200);
  assert.equal((await voided.json()).data.invoice.status, "VOID");

  const badVoid = await controller.void(request("POST", `${base}/${INVOICE_A}/void`), BUSINESS_A, INVOICE_A);
  assert.equal(badVoid.status, 422);
  assert.equal((await badVoid.json()).error.code, "invalid_transition");
});

test("every endpoint requires authentication", async () => {
  const { controller } = setup({ authenticateAs: null });
  const responses = await Promise.all([
    controller.create(request("POST", base, validBody), BUSINESS_A),
    controller.list(request("GET", base), BUSINESS_A),
    controller.get(request("GET", `${base}/${INVOICE_A}`), BUSINESS_A, INVOICE_A),
    controller.update(request("PATCH", `${base}/${INVOICE_A}`, { items: validBody.items }), BUSINESS_A, INVOICE_A),
    controller.send(request("POST", `${base}/${INVOICE_A}/send`), BUSINESS_A, INVOICE_A),
    controller.void(request("POST", `${base}/${INVOICE_A}/void`), BUSINESS_A, INVOICE_A),
  ]);
  for (const response of responses) {
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, "unauthenticated");
  }
});

test("user without membership gets 403 on every endpoint", async () => {
  const { controller } = setup({ authenticateAs: USER_B });
  const responses = await Promise.all([
    controller.create(request("POST", base, validBody), BUSINESS_A),
    controller.list(request("GET", base), BUSINESS_A),
    controller.get(request("GET", `${base}/${INVOICE_A}`), BUSINESS_A, INVOICE_A),
    controller.update(request("PATCH", `${base}/${INVOICE_A}`, { items: validBody.items }), BUSINESS_A, INVOICE_A),
    controller.send(request("POST", `${base}/${INVOICE_A}/send`), BUSINESS_A, INVOICE_A),
    controller.void(request("POST", `${base}/${INVOICE_A}/void`), BUSINESS_A, INVOICE_A),
  ]);
  for (const response of responses) {
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, "business_forbidden");
  }
});

test("malformed path identifiers return 400 before any service call", async () => {
  const { controller } = setup();
  const businessResponse = await controller.list(request("GET", base), "not-a-uuid");
  assert.equal(businessResponse.status, 400);
  assert.equal((await businessResponse.json()).error.code, "invalid_request");

  const invoiceResponse = await controller.get(request("GET", `${base}/nope`), BUSINESS_A, "nope");
  assert.equal(invoiceResponse.status, 400);
  assert.equal((await invoiceResponse.json()).error.code, "invalid_request");
});
