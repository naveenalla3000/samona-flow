import assert from "node:assert/strict";
import test from "node:test";
import { listExpensesQuerySchema, type PayExpenseInput } from "@/lib/validations/expense";
import { createExpenseService, ExpenseServiceError } from "@/server/services/expense-service";
import type { ExpenseRecord } from "@/types/expense";
import {
  BUSINESS_A,
  BUSINESS_B,
  USER_A,
  USER_B,
  createFakeMemberships,
} from "./helpers/fakes";
import {
  EXPENSE_A,
  createFakeExpenseRepository,
  makeExpenseRecord,
} from "./helpers/expense-fakes";

const QUERY = listExpensesQuerySchema.parse({});
const FOREIGN_EXPENSE = "60000000-0000-4000-8000-000000000099";
const NO_PAYMENT_DATE: PayExpenseInput = { paymentDate: null };

function setup(seed: ExpenseRecord[] = []) {
  const expenses = createFakeExpenseRepository(seed);
  const service = createExpenseService({
    memberships: createFakeMemberships(),
    expenses: expenses.repository,
  });
  return { service, expenses };
}

function expenseInput(overrides: Record<string, unknown> = {}) {
  return {
    title: "Office rent",
    category: "RENT" as const,
    amount: "25.00",
    dueDate: "2026-06-30",
    paymentDate: null,
    status: "UPCOMING" as const,
    notes: null,
    ...overrides,
  };
}

async function errorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    assert.ok(error instanceof ExpenseServiceError);
    return error.code;
  }
}

test("creates an upcoming expense with business-owned identity and currency", async () => {
  const { service, expenses } = setup();
  expenses.setBusinessSettings(BUSINESS_A, { currency: "USD", timezone: "America/New_York" });
  const expense = await service.create(
    USER_A,
    BUSINESS_A,
    expenseInput({ status: "PAID", paymentDate: "2026-06-10" }),
  );
  assert.equal(expense.businessId, BUSINESS_A);
  assert.equal(expense.status, "PAID");
  assert.equal(expense.paymentDate, "2026-06-10");
  assert.equal(expense.currency, "USD");
  assert.equal(expense.timezone, "America/New_York");
  assert.equal(expenses.count(), 1);
});

test("an overdue display status does not block editing, paying or cancelling", async () => {
  const { service } = setup();
  const created = await service.create(USER_A, BUSINESS_A, expenseInput({ dueDate: "2026-06-01" }));
  assert.equal(created.status, "UPCOMING");
  assert.equal(created.displayStatus, "OVERDUE");

  const updated = await service.update(USER_A, BUSINESS_A, created.id, { amount: "30.00" });
  assert.equal(updated.amount, "30.00");

  const paid = await service.markPaid(USER_A, BUSINESS_A, created.id, {
    paymentDate: "2026-06-12",
  });
  assert.equal(paid.status, "PAID");
  assert.equal(paid.paymentDate, "2026-06-12");
  assert.equal(paid.displayStatus, "PAID");
});

test("paying without an explicit date defaults to the business-local date", async () => {
  const { service } = setup();
  const created = await service.create(USER_A, BUSINESS_A, expenseInput());
  const paid = await service.markPaid(USER_A, BUSINESS_A, created.id, NO_PAYMENT_DATE);
  assert.equal(paid.status, "PAID");
  assert.equal(paid.paymentDate, "2026-06-15");
});

test("cancelling preserves the record as history and blocks further changes", async () => {
  const { service, expenses } = setup();
  const created = await service.create(USER_A, BUSINESS_A, expenseInput());
  const cancelled = await service.cancel(USER_A, BUSINESS_A, created.id);
  assert.equal(cancelled.status, "CANCELLED");

  const historical = await service.get(USER_A, BUSINESS_A, created.id);
  assert.equal(historical.status, "CANCELLED");
  assert.equal(expenses.count(), 1);
  assert.equal(await errorCode(service.update(USER_A, BUSINESS_A, created.id, { title: "x" })), "INVALID_TRANSITION");
  assert.equal(await errorCode(service.markPaid(USER_A, BUSINESS_A, created.id, NO_PAYMENT_DATE)), "INVALID_TRANSITION");
  assert.equal(await errorCode(service.cancel(USER_A, BUSINESS_A, created.id)), "INVALID_TRANSITION");
});

test("paid expenses are terminal and preserved", async () => {
  const { service } = setup();
  const paid = await service.create(
    USER_A,
    BUSINESS_A,
    expenseInput({ status: "PAID", paymentDate: "2026-06-10" }),
  );
  assert.equal(await errorCode(service.update(USER_A, BUSINESS_A, paid.id, { amount: "1.00" })), "INVALID_TRANSITION");
  assert.equal(await errorCode(service.markPaid(USER_A, BUSINESS_A, paid.id, NO_PAYMENT_DATE)), "INVALID_TRANSITION");
  assert.equal(await errorCode(service.cancel(USER_A, BUSINESS_A, paid.id)), "INVALID_TRANSITION");
});

test("membership, expense and cross-business access are enforced in the service", async () => {
  const { service } = setup();
  assert.equal(
    await errorCode(service.create(USER_B, BUSINESS_A, expenseInput())),
    "BUSINESS_FORBIDDEN",
  );
  assert.equal(
    await errorCode(service.list(USER_B, BUSINESS_A, QUERY)),
    "BUSINESS_FORBIDDEN",
  );
  assert.equal(
    await errorCode(service.get(USER_A, BUSINESS_A, FOREIGN_EXPENSE)),
    "EXPENSE_NOT_FOUND",
  );

  const foreign = await service.create(USER_B, BUSINESS_B, expenseInput({ title: "Foreign" }));
  assert.equal(
    await errorCode(service.get(USER_A, BUSINESS_A, foreign.id)),
    "EXPENSE_NOT_FOUND",
  );
  assert.equal(
    await errorCode(service.update(USER_A, BUSINESS_A, foreign.id, { title: "x" })),
    "EXPENSE_NOT_FOUND",
  );
});

test("list is tenant-scoped, searchable, filterable, sortable and paginated", async () => {
  const { service } = setup([
    makeExpenseRecord({ id: EXPENSE_A, title: "Office rent", category: "RENT", amount: "10.00", dueDate: "2026-06-01" }),
    makeExpenseRecord({
      id: "60000000-0000-4000-8000-000000000003",
      title: "Internet bill",
      category: "INTERNET",
      amount: "20.00",
      dueDate: "2026-06-20",
      notes: "fiber",
    }),
    makeExpenseRecord({
      id: "60000000-0000-4000-8000-000000000004",
      title: "Foreign expense",
      businessId: BUSINESS_B,
      amount: "500.00",
    }),
  ]);

  const all = await service.list(USER_A, BUSINESS_A, QUERY);
  assert.equal(all.total, 2);
  assert.equal(all.items.every((item) => item.businessId === BUSINESS_A), true);

  const searched = await service.list(USER_A, BUSINESS_A, { ...QUERY, search: "fiber" });
  assert.equal(searched.total, 1);
  assert.equal(searched.items[0]?.title, "Internet bill");

  const byCategory = await service.list(USER_A, BUSINESS_A, { ...QUERY, category: "RENT" });
  assert.equal(byCategory.total, 1);

  const overdue = await service.list(USER_A, BUSINESS_A, { ...QUERY, status: "OVERDUE" });
  assert.equal(overdue.total, 1);
  assert.equal(overdue.items[0]?.displayStatus, "OVERDUE");
  const upcoming = await service.list(USER_A, BUSINESS_A, { ...QUERY, status: "UPCOMING" });
  assert.equal(upcoming.total, 1);

  const byDate = await service.list(USER_A, BUSINESS_A, {
    ...QUERY,
    fromDate: "2026-06-15",
    toDate: "2026-06-30",
  });
  assert.equal(byDate.total, 1);
  assert.equal(byDate.items[0]?.title, "Internet bill");

  const sorted = await service.list(USER_A, BUSINESS_A, {
    ...QUERY,
    sort: "amount",
    direction: "asc",
  });
  assert.deepEqual(sorted.items.map((item) => item.amount), ["10.00", "20.00"]);

  const paged = await service.list(USER_A, BUSINESS_A, { ...QUERY, pageSize: 1, page: 2 });
  assert.equal(paged.items.length, 1);
  assert.equal(paged.totalPages, 2);
});

test("money stays exact through repeated updates", async () => {
  const { service } = setup();
  const created = await service.create(USER_A, BUSINESS_A, expenseInput({ amount: "0.01" }));
  const updated = await service.update(USER_A, BUSINESS_A, created.id, { amount: "123456789.99" });
  assert.equal(updated.amount, "123456789.99");
});
