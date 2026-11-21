import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync("prisma/migrations/20260101000000_init/migration.sql", "utf8");
const repository = readFileSync("src/server/repositories/expense-repository.ts", "utf8");
const service = readFileSync("src/server/services/expense-service.ts", "utf8");
const validation = readFileSync("src/lib/validations/expense.ts", "utf8");

function model(name: string): string {
  const start = schema.indexOf(`model ${name} {`);
  assert.ok(start >= 0, `${name} model missing`);
  return schema.slice(start, schema.indexOf("\n}", start));
}

test("Expense is tenant-pinned and has no currency column", () => {
  const expense = model("Expense");
  assert.match(expense, /businessId\s+String\s+@map\("business_id"\)/);
  assert.match(expense, /amount\s+Decimal/);
  assert.match(expense, /dueDate\s+DateTime/);
  assert.match(expense, /paymentDate\s+DateTime\?/);
  assert.match(expense, /status\s+ExpenseStatus\s+@default\(UPCOMING\)/);
  assert.match(expense, /category\s+ExpenseCategory/);
  assert.doesNotMatch(expense, /currency/i);
});

test("applied database constraints reject non-positive amounts and PAID without a date", () => {
  assert.match(migration, /chk_expenses_amount_pos/);
  assert.match(migration, /CHECK \(amount > 0\)/);
  assert.match(migration, /chk_expenses_paid_requires_payment_date/);
  assert.match(migration, /CHECK \(status <> 'PAID' OR payment_date IS NOT NULL\)/);
  assert.match(migration, /expenses_business_id_fkey/);
  assert.match(migration, /expenses_business_id_status_due_date_idx/);
});

test("repository never addresses an expense by id alone", () => {
  assert.doesNotMatch(repository, /expense\.findUnique\(/);
  assert.doesNotMatch(repository, /expense\.delete\(/);
  assert.match(repository, /where: \{ id: expenseId, businessId \}/);
  assert.match(repository, /status: "UPCOMING"/);
  assert.match(repository, /ExpenseWhereInput = \{ businessId \}/);
});

test("money uses exact decimal handling, never JS floats", () => {
  assert.match(repository, /moneyDecimal\(input\.amount\)/);
  assert.match(repository, /toFixed\(2\)/);
  assert.doesNotMatch(repository, /Number\(input\.amount\)/);
  assert.match(validation, /parseMoney\(value\) > BigInt\(0\)/);
});

test("service enforces membership and terminal-status transitions", () => {
  assert.match(service, /requireMembership\(user, businessId\)/);
  assert.match(service, /memberships\.findMembership\(user\.id, businessId\)/);
  assert.match(service, /canEditExpense\(existing\.status\)/);
  assert.match(service, /canPayExpense\(existing\.status\)/);
  assert.match(service, /canCancelExpense\(existing\.status\)/);
  assert.doesNotMatch(service, /\.delete\(/);
});

test("OVERDUE is derived from business-local date, never persisted by a client", () => {
  assert.match(repository, /businessLocalDate\(timezone\)/);
  assert.match(repository, /deriveDisplayStatus\(/);
  assert.doesNotMatch(validation, /status.*OVERDUE.*PAID/);
});
