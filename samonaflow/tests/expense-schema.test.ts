import assert from "node:assert/strict";
import test from "node:test";
import {
  createExpenseSchema,
  listExpensesQuerySchema,
  payExpenseSchema,
  updateExpenseSchema,
} from "@/lib/validations/expense";

const valid = {
  title: "  Office rent  ",
  category: "RENT",
  amount: "10.5",
  dueDate: "2026-06-30",
  paymentDate: "",
  notes: "  Monthly  ",
};

test("create schema normalizes money, text and defaults", () => {
  assert.deepEqual(createExpenseSchema.parse(valid), {
    title: "Office rent",
    category: "RENT",
    amount: "10.50",
    dueDate: "2026-06-30",
    paymentDate: null,
    status: "UPCOMING",
    notes: "Monthly",
  });
});

test("client-submitted server fields are stripped", () => {
  const parsed = createExpenseSchema.parse({
    ...valid,
    id: "fake-id",
    businessId: "fake-business",
    displayStatus: "OVERDUE",
    currency: "USD",
    createdAt: "fake",
  });
  assert.equal("id" in parsed, false);
  assert.equal("businessId" in parsed, false);
  assert.equal("displayStatus" in parsed, false);
  assert.equal("currency" in parsed, false);
  assert.equal(parsed.amount, "10.50");
});

test("create schema rejects zero, negative, float, oversized and imprecise amounts", () => {
  for (const amount of ["0", "0.00", "-1.00", "10000000000.00", "1.234", 10]) {
    assert.equal(createExpenseSchema.safeParse({ ...valid, amount }).success, false, String(amount));
  }
  assert.equal(createExpenseSchema.safeParse({ ...valid, amount: "0.01" }).success, true);
  assert.equal(createExpenseSchema.safeParse({ ...valid, amount: "9999999999.99" }).success, true);
});

test("create schema rejects invalid categories, dates and titles", () => {
  assert.equal(createExpenseSchema.safeParse({ ...valid, category: "GROCERIES" }).success, false);
  assert.equal(createExpenseSchema.safeParse({ ...valid, dueDate: "2026-02-30" }).success, false);
  assert.equal(createExpenseSchema.safeParse({ ...valid, title: "  " }).success, false);
  assert.equal(createExpenseSchema.safeParse({ ...valid, paymentDate: "nope" }).success, false);
  for (const category of [
    "RENT", "INTERNET", "SOFTWARE_SUBSCRIPTIONS", "SALARIES", "EQUIPMENT",
    "MARKETING", "TRAVEL", "UTILITIES", "OTHER",
  ]) {
    assert.equal(createExpenseSchema.safeParse({ ...valid, category }).success, true, category);
  }
});

test("PAID requires a payment date (mirrors the applied DB CHECK)", () => {
  assert.equal(createExpenseSchema.safeParse({ ...valid, status: "PAID" }).success, false);
  assert.equal(
    createExpenseSchema.safeParse({ ...valid, status: "PAID", paymentDate: "" }).success,
    false,
  );
  const paid = createExpenseSchema.parse({
    ...valid,
    status: "PAID",
    paymentDate: "2026-06-10",
  });
  assert.equal(paid.status, "PAID");
  assert.equal(paid.paymentDate, "2026-06-10");
  // OVERDUE is derived and can never be set by a client.
  assert.equal(createExpenseSchema.safeParse({ ...valid, status: "OVERDUE" }).success, false);
});

test("update schema accepts only editable fields and requires at least one", () => {
  assert.equal(updateExpenseSchema.safeParse({}).success, false);
  assert.deepEqual(updateExpenseSchema.parse({ amount: "20.5" }), { amount: "20.50" });
  const parsed = updateExpenseSchema.parse({ title: "New", status: "PAID", paymentDate: "2026-01-01", id: "x" });
  assert.equal(parsed.title, "New");
  assert.equal("status" in parsed, false);
  assert.equal("paymentDate" in parsed, false);
  assert.equal("id" in parsed, false);
});

test("pay schema permits an empty date (server defaults to business-local date)", () => {
  assert.deepEqual(payExpenseSchema.parse({}), { paymentDate: null });
  assert.deepEqual(payExpenseSchema.parse({ paymentDate: "" }), { paymentDate: null });
  assert.deepEqual(payExpenseSchema.parse({ paymentDate: "2026-06-12" }), { paymentDate: "2026-06-12" });
  assert.equal(payExpenseSchema.safeParse({ paymentDate: "2026-02-30" }).success, false);
});

test("list query validates defaults, filters and sort", () => {
  assert.deepEqual(listExpensesQuerySchema.parse({}), {
    page: 1,
    pageSize: 20,
    status: "all",
    sort: "dueDate",
    direction: "desc",
  });
  const parsed = listExpensesQuerySchema.parse({
    page: "2",
    pageSize: "50",
    status: "OVERDUE",
    category: "RENT",
    fromDate: "2026-06-01",
    toDate: "2026-06-30",
    search: "rent",
    sort: "amount",
    direction: "asc",
  });
  assert.equal(parsed.page, 2);
  assert.equal(parsed.pageSize, 50);
  assert.equal(parsed.status, "OVERDUE");
  assert.equal(parsed.category, "RENT");
  assert.equal(
    listExpensesQuerySchema.safeParse({ fromDate: "2026-06-30", toDate: "2026-06-01" }).success,
    false,
  );
  assert.equal(listExpensesQuerySchema.safeParse({ pageSize: "101" }).success, false);
  assert.equal(listExpensesQuerySchema.safeParse({ status: "ACTIVE" }).success, false);
  assert.equal(listExpensesQuerySchema.safeParse({ sort: "amount; DROP" }).success, false);
});
