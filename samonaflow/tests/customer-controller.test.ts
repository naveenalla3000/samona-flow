import assert from "node:assert/strict";
import test from "node:test";
import { createCustomerController, type Authenticate } from "@/server/controllers/customer-controller";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import { createCustomerService } from "@/server/services/customer-service";
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

const UNAUTHORIZED = () =>
  Response.json(
    { error: "unauthenticated", message: "Authentication is required." },
    { status: 401 },
  );

function setup(options: { authenticateAs?: AuthenticatedUser | null } = {}) {
  const data = createFakeCustomers([
    makeCustomerRecord({ id: CUSTOMER_A, businessId: BUSINESS_A, name: "Bravo" }),
    makeCustomerRecord({ id: CUSTOMER_B, businessId: BUSINESS_B, name: "Zulu" }),
  ]);
  const authenticate: Authenticate = async () => {
    const user = options.authenticateAs === undefined ? USER_A : options.authenticateAs;
    return user ? { ok: true, user } : { ok: false, response: UNAUTHORIZED() };
  };
  const controller = createCustomerController({
    authenticate,
    service: createCustomerService({
      memberships: createFakeMemberships(),
      customers: data.repository,
    }),
  });
  return { controller, data };
}

function jsonRequest(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const base = `http://localhost/api/v1/businesses/${BUSINESS_A}/customers`;

test("POST creates a customer and returns 201 with a success envelope", async () => {
  const { controller } = setup();
  const response = await controller.create(
    jsonRequest("POST", base, { name: "Acme Studio", email: "hi@acme.test" }),
    BUSINESS_A,
  );
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.equal(payload.data.customer.name, "Acme Studio");
  assert.equal(payload.data.customer.businessId, BUSINESS_A);
  assert.equal(payload.data.customer.email, "hi@acme.test");
});

test("POST rejects invalid input with field-level error details", async () => {
  const { controller } = setup();
  const response = await controller.create(
    jsonRequest("POST", base, { name: "", email: "bad" }),
    BUSINESS_A,
  );
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.success, false);
  assert.equal(payload.error.code, "invalid_request");
  assert.ok(payload.error.fieldErrors.name);
  assert.ok(payload.error.fieldErrors.email);
});

test("POST rejects a malformed JSON body", async () => {
  const { controller } = setup();
  const request = new Request(base, { method: "POST", body: "{not json" });
  const response = await controller.create(request, BUSINESS_A);
  assert.equal(response.status, 400);
});

test("GET lists with pagination and search scoped to the business", async () => {
  const { controller } = setup();
  await controller.create(jsonRequest("POST", base, { name: "Alpha Ltd" }), BUSINESS_A);

  const response = await controller.list(
    jsonRequest("GET", `${base}?page=1&pageSize=1&search=alpha`),
    BUSINESS_A,
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.data.total, 1);
  assert.equal(payload.data.pageSize, 1);
  assert.equal(payload.data.items[0].name, "Alpha Ltd");
});

test("GET rejects invalid query parameters", async () => {
  const { controller } = setup();
  const response = await controller.list(jsonRequest("GET", `${base}?page=0`), BUSINESS_A);
  assert.equal(response.status, 400);
});

test("GET one customer returns the profile with financial history", async () => {
  const { controller, data } = setup();
  data.seedInvoice(BUSINESS_A, CUSTOMER_A, {
    id: "50000000-0000-4000-8000-000000000001",
    invoiceNumber: "INV-001",
    issueDate: "2026-01-01",
    dueDate: "2026-01-31",
    status: "SENT",
    totalAmount: "250.00",
    amountPaid: "50.00",
  });

  const response = await controller.get(jsonRequest("GET", `${base}/${CUSTOMER_A}`), BUSINESS_A, CUSTOMER_A);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.data.customer.name, "Bravo");
  assert.equal(payload.data.customer.financials.outstandingAmount, "200.00");
  assert.equal(payload.data.customer.invoices[0].invoiceNumber, "INV-001");
});

test("PATCH updates only the provided fields", async () => {
  const { controller } = setup();
  const response = await controller.update(
    jsonRequest("PATCH", `${base}/${CUSTOMER_A}`, { companyName: "Bravo Inc" }),
    BUSINESS_A,
    CUSTOMER_A,
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.data.customer.companyName, "Bravo Inc");
  assert.equal(payload.data.customer.name, "Bravo");
});

test("PATCH rejects an empty update body", async () => {
  const { controller } = setup();
  const response = await controller.update(
    jsonRequest("PATCH", `${base}/${CUSTOMER_A}`, {}),
    BUSINESS_A,
    CUSTOMER_A,
  );
  assert.equal(response.status, 400);
});

test("PATCH archive sets archivedAt and keeps the customer", async () => {
  const { controller } = setup();
  const response = await controller.archive(
    jsonRequest("PATCH", `${base}/${CUSTOMER_A}/archive`),
    BUSINESS_A,
    CUSTOMER_A,
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(payload.data.customer.archivedAt);
  assert.equal(payload.data.customer.id, CUSTOMER_A);
});

test("every endpoint requires authentication", async () => {
  const { controller } = setup({ authenticateAs: null });
  const responses = await Promise.all([
    controller.create(jsonRequest("POST", base, { name: "X" }), BUSINESS_A),
    controller.list(jsonRequest("GET", base), BUSINESS_A),
    controller.get(jsonRequest("GET", `${base}/${CUSTOMER_A}`), BUSINESS_A, CUSTOMER_A),
    controller.update(jsonRequest("PATCH", `${base}/${CUSTOMER_A}`, { name: "X" }), BUSINESS_A, CUSTOMER_A),
    controller.archive(jsonRequest("PATCH", `${base}/${CUSTOMER_A}/archive`), BUSINESS_A, CUSTOMER_A),
  ]);
  for (const response of responses) {
    assert.equal(response.status, 401);
    const payload = await response.json();
    assert.equal(payload.error, "unauthenticated");
  }
});

test("authenticated user without membership gets 403 on every endpoint", async () => {
  const { controller } = setup({ authenticateAs: USER_B });
  const responses = await Promise.all([
    controller.create(jsonRequest("POST", base, { name: "X" }), BUSINESS_A),
    controller.list(jsonRequest("GET", base), BUSINESS_A),
    controller.get(jsonRequest("GET", `${base}/${CUSTOMER_A}`), BUSINESS_A, CUSTOMER_A),
    controller.update(jsonRequest("PATCH", `${base}/${CUSTOMER_A}`, { name: "X" }), BUSINESS_A, CUSTOMER_A),
    controller.archive(jsonRequest("PATCH", `${base}/${CUSTOMER_A}/archive`), BUSINESS_A, CUSTOMER_A),
  ]);
  for (const response of responses) {
    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.error.code, "business_forbidden");
  }
});

test("cross-business path access is rejected with 403", async () => {
  const { controller } = setup({ authenticateAs: USER_B });
  const otherBase = `http://localhost/api/v1/businesses/${BUSINESS_A}/customers`;
  const response = await controller.list(jsonRequest("GET", otherBase), BUSINESS_A);
  assert.equal(response.status, 403);
});

test("guessing another business's customer id returns 404, never the record", async () => {
  const { controller } = setup({ authenticateAs: USER_A });
  const responses = await Promise.all([
    controller.get(jsonRequest("GET", `${base}/${CUSTOMER_B}`), BUSINESS_A, CUSTOMER_B),
    controller.update(jsonRequest("PATCH", `${base}/${CUSTOMER_B}`, { name: "Hacked" }), BUSINESS_A, CUSTOMER_B),
    controller.archive(jsonRequest("PATCH", `${base}/${CUSTOMER_B}/archive`), BUSINESS_A, CUSTOMER_B),
  ]);
  for (const response of responses) {
    assert.equal(response.status, 404);
    const payload = await response.json();
    assert.equal(payload.error.code, "customer_not_found");
    assert.equal(payload.data, undefined);
  }
});

test("malformed business or customer ids are rejected before the service", async () => {
  const { controller } = setup();
  const badBusiness = await controller.list(jsonRequest("GET", base), "not-a-uuid");
  assert.equal(badBusiness.status, 400);

  const badCustomer = await controller.get(jsonRequest("GET", base), BUSINESS_A, "not-a-uuid");
  assert.equal(badCustomer.status, 400);
});
