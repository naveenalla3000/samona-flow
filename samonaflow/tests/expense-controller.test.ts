import assert from "node:assert/strict";
import test from "node:test";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import { createExpenseController, type Authenticate } from "@/server/controllers/expense-controller";
import { createExpenseService } from "@/server/services/expense-service";
import {
  BUSINESS_A,
  BUSINESS_B,
  USER_A,
  USER_B,
  createFakeMemberships,
} from "./helpers/fakes";
import { createFakeExpenseRepository, makeExpenseRecord } from "./helpers/expense-fakes";

const FOREIGN_EXPENSE = "60000000-0000-4000-8000-000000000099";

const UNAUTHORIZED = () =>
  Response.json(
    { error: "unauthenticated", message: "Authentication is required." },
    { status: 401 },
  );

const validBody = {
  title: "Office rent",
  category: "RENT",
  amount: "10.5",
  dueDate: "2026-06-30",
  notes: "Monthly",
};

function setup(options: { authenticateAs?: AuthenticatedUser | null } = {}) {
  const expenses = createFakeExpenseRepository([
    makeExpenseRecord({
      id: "60000000-0000-4000-8000-000000000003",
      title: "Foreign expense",
      businessId: BUSINESS_B,
      amount: "500.00",
    }),
  ]);
  const authenticate: Authenticate = async () => {
    const user = options.authenticateAs === undefined ? USER_A : options.authenticateAs;
    return user ? { ok: true, user } : { ok: false, response: UNAUTHORIZED() };
  };
  const service = createExpenseService({
    memberships: createFakeMemberships(),
    expenses: expenses.repository,
  });
  const controller = createExpenseController({ authenticate, service });
  return { controller, service, expenses };
}

function request(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const base = `http://localhost/api/v1/businesses/${BUSINESS_A}`;

async function createExpense(controller: ReturnType<typeof createExpenseController>) {
  const response = await controller.create(request("POST", `${base}/expenses`, validBody), BUSINESS_A);
  assert.equal(response.status, 201);
  return (await response.json()).data.expense;
}

test("POST creates an expense and strips client-submitted server fields", async () => {
  const { controller } = setup();
  const response = await controller.create(
    request("POST", `${base}/expenses`, {
      ...validBody,
      id: "fake-id",
      businessId: BUSINESS_B,
      displayStatus: "OVERDUE",
      currency: "USD",
    }),
    BUSINESS_A,
  );
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.equal(payload.data.expense.amount, "10.50");
  assert.equal(payload.data.expense.status, "UPCOMING");
  assert.equal(payload.data.expense.currency, "INR");
  assert.equal(payload.data.expense.businessId, BUSINESS_A);
  assert.notEqual(payload.data.expense.displayStatus, "OVERDUE");
});

test("POST returns 400 for invalid data, invalid JSON and PAID without a date", async () => {
  const { controller } = setup();
  const invalid = await controller.create(
    request("POST", `${base}/expenses`, { ...validBody, amount: "-1.00" }),
    BUSINESS_A,
  );
  assert.equal(invalid.status, 400);
  assert.ok((await invalid.json()).error.fieldErrors.amount);

  const paid = await controller.create(
    request("POST", `${base}/expenses`, { ...validBody, status: "PAID" }),
    BUSINESS_A,
  );
  assert.equal(paid.status, 400);
  assert.ok((await paid.json()).error.fieldErrors.paymentDate);

  const malformed = await controller.create(
    new Request(`${base}/expenses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }),
    BUSINESS_A,
  );
  assert.equal(malformed.status, 400);
});

test("GET list and detail return consistent envelopes", async () => {
  const { controller } = setup();
  const expense = await createExpense(controller);

  const list = await controller.list(request("GET", `${base}/expenses?pageSize=5`), BUSINESS_A);
  assert.equal(list.status, 200);
  assert.equal((await list.json()).data.total, 1);

  const detail = await controller.get(
    request("GET", `${base}/expenses/${expense.id}`),
    BUSINESS_A,
    expense.id,
  );
  assert.equal(detail.status, 200);
  const payload = await detail.json();
  assert.equal(payload.data.expense.title, "Office rent");
  assert.equal(payload.data.expense.currency, "INR");
});

test("PATCH edits an upcoming expense and rejects terminal expenses with 422", async () => {
  const { controller } = setup();
  const expense = await createExpense(controller);

  const patched = await controller.update(
    request("PATCH", `${base}/expenses/${expense.id}`, { amount: "20.5" }),
    BUSINESS_A,
    expense.id,
  );
  assert.equal(patched.status, 200);
  assert.equal((await patched.json()).data.expense.amount, "20.50");

  const rejected = await controller.update(
    request("PATCH", `${base}/expenses/${expense.id}`, { status: "PAID", paymentDate: "2026-06-01" }),
    BUSINESS_A,
    expense.id,
  );
  assert.equal(rejected.status, 400);

  const paidResponse = await controller.markPaid(
    request("POST", `${base}/expenses/${expense.id}/pay`, { paymentDate: "2026-06-01" }),
    BUSINESS_A,
    expense.id,
  );
  assert.equal(paidResponse.status, 200);
  assert.equal((await paidResponse.json()).data.expense.status, "PAID");

  const terminal = await controller.update(
    request("PATCH", `${base}/expenses/${expense.id}`, { amount: "30.00" }),
    BUSINESS_A,
    expense.id,
  );
  assert.equal(terminal.status, 422);
  assert.equal((await terminal.json()).error.code, "invalid_transition");
});

test("pay and cancel actions apply the correct status transition", async () => {
  const { controller } = setup();
  const first = await createExpense(controller);
  const paid = await controller.markPaid(
    request("POST", `${base}/expenses/${first.id}/pay`, {}),
    BUSINESS_A,
    first.id,
  );
  assert.equal(paid.status, 200);
  const paidExpense = (await paid.json()).data.expense;
  assert.equal(paidExpense.status, "PAID");
  assert.ok(paidExpense.paymentDate);

  const second = await createExpense(controller);
  const cancelled = await controller.cancel(
    request("POST", `${base}/expenses/${second.id}/cancel`),
    BUSINESS_A,
    second.id,
  );
  assert.equal(cancelled.status, 200);
  assert.equal((await cancelled.json()).data.expense.status, "CANCELLED");

  const repeat = await controller.cancel(
    request("POST", `${base}/expenses/${first.id}/cancel`),
    BUSINESS_A,
    first.id,
  );
  assert.equal(repeat.status, 422);
});

test("unauthenticated requests are rejected on every endpoint", async () => {
  const { controller } = setup({ authenticateAs: null });
  const id = "60000000-0000-4000-8000-000000000001";
  const responses = await Promise.all([
    controller.create(request("POST", `${base}/expenses`, validBody), BUSINESS_A),
    controller.list(request("GET", `${base}/expenses`), BUSINESS_A),
    controller.get(request("GET", `${base}/expenses/${id}`), BUSINESS_A, id),
    controller.update(request("PATCH", `${base}/expenses/${id}`, { title: "x" }), BUSINESS_A, id),
    controller.markPaid(request("POST", `${base}/expenses/${id}/pay`, {}), BUSINESS_A, id),
    controller.cancel(request("POST", `${base}/expenses/${id}/cancel`), BUSINESS_A, id),
  ]);
  for (const response of responses) assert.equal(response.status, 401);
});

test("missing membership and cross-business attempts never expose a foreign record", async () => {
  const { controller } = setup();
  const forbidden = await controller.list(
    request("GET", `http://localhost/api/v1/businesses/${BUSINESS_B}/expenses`),
    BUSINESS_B,
  );
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json()).error.code, "business_forbidden");

  const notFound = await controller.get(
    request("GET", `${base}/expenses/${FOREIGN_EXPENSE}`),
    BUSINESS_A,
    FOREIGN_EXPENSE,
  );
  assert.equal(notFound.status, 404);
  assert.equal((await notFound.json()).error.code, "expense_not_found");

  const otherUser = setup({ authenticateAs: USER_B });
  const missingMembership = await otherUser.controller.list(
    request("GET", `${base}/expenses`),
    BUSINESS_A,
  );
  assert.equal(missingMembership.status, 403);
  assert.equal((await missingMembership.json()).error.code, "business_forbidden");
});

test("invalid identifiers return 400 without calling the service", async () => {
  const { controller } = setup();
  const invalidBusiness = await controller.list(request("GET", `${base}/expenses`), "not-a-uuid");
  assert.equal(invalidBusiness.status, 400);

  const invalidExpense = await controller.get(
    request("GET", `${base}/expenses/not-a-uuid`),
    BUSINESS_A,
    "not-a-uuid",
  );
  assert.equal(invalidExpense.status, 400);
});

test("unexpected errors never expose internal database details", async () => {
  const { service } = setup();
  const failing = createExpenseController({
    authenticate: async () => ({ ok: true, user: USER_A }),
    service: {
      ...service,
      list: async () => {
        throw new Error("postgres://user:secret@host/database");
      },
    },
  });
  const response = await failing.list(request("GET", `${base}/expenses`), BUSINESS_A);
  assert.equal(response.status, 500);
  const payload = await response.json();
  assert.equal(payload.error.code, "internal_error");
  assert.equal(JSON.stringify(payload).includes("secret"), false);
});
