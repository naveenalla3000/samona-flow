import assert from "node:assert/strict";
import test from "node:test";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  canCancelExpense,
  canEditExpense,
  canPayExpense,
  deriveDisplayStatus,
} from "@/lib/expense-status";

test("OVERDUE is derived only for past-due UPCOMING expenses", () => {
  assert.equal(deriveDisplayStatus("UPCOMING", "2026-06-14", "2026-06-15"), "OVERDUE");
  assert.equal(deriveDisplayStatus("UPCOMING", "2026-06-15", "2026-06-15"), "UPCOMING");
  assert.equal(deriveDisplayStatus("UPCOMING", "2026-06-16", "2026-06-15"), "UPCOMING");
  assert.equal(deriveDisplayStatus("PAID", "2026-01-01", "2026-06-15"), "PAID");
  assert.equal(deriveDisplayStatus("CANCELLED", "2026-01-01", "2026-06-15"), "CANCELLED");
});

test("only UPCOMING expenses are editable, payable and cancellable", () => {
  for (const status of ["UPCOMING"] as const) {
    assert.equal(canEditExpense(status), true);
    assert.equal(canPayExpense(status), true);
    assert.equal(canCancelExpense(status), true);
  }
  for (const status of ["OVERDUE", "PAID", "CANCELLED"] as const) {
    assert.equal(canEditExpense(status), false);
    assert.equal(canPayExpense(status), false);
    assert.equal(canCancelExpense(status), false);
  }
});

test("category list matches the PRD and has a label for every value", () => {
  assert.deepEqual([...EXPENSE_CATEGORIES], [
    "RENT", "INTERNET", "SOFTWARE_SUBSCRIPTIONS", "SALARIES", "EQUIPMENT",
    "MARKETING", "TRAVEL", "UTILITIES", "OTHER",
  ]);
  for (const category of EXPENSE_CATEGORIES) {
    assert.ok(EXPENSE_CATEGORY_LABELS[category], `missing label for ${category}`);
  }
  assert.equal(Object.keys(EXPENSE_CATEGORY_LABELS).length, EXPENSE_CATEGORIES.length);
});
