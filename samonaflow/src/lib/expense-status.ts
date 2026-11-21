// Expense domain rules, in one place. The PRD (FR-06) defines the categories and
// statuses but no explicit transition matrix, so these conservative rules are
// documented in README and reused by services, repositories, validation and UI:
//   - Stored statuses are UPCOMING, PAID and CANCELLED.
//   - OVERDUE is a display derivation from the business-local date for unpaid
//     expenses whose due date has passed; it is never stored or set directly.
//   - Only UPCOMING expenses can be edited, paid or cancelled.
//   - PAID and CANCELLED are terminal and preserved as history; there is no
//     delete, un-pay or un-cancel path.
import type { ExpenseStatusValue } from "@/types/expense";

export const EXPENSE_CATEGORIES = [
  "RENT",
  "INTERNET",
  "SOFTWARE_SUBSCRIPTIONS",
  "SALARIES",
  "EQUIPMENT",
  "MARKETING",
  "TRAVEL",
  "UTILITIES",
  "OTHER",
] as const;

export type ExpenseCategoryValue = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_STATUSES = ["UPCOMING", "OVERDUE", "PAID", "CANCELLED"] as const;

/** Statuses a client may set when creating an expense; OVERDUE is derived. */
export const CREATABLE_EXPENSE_STATUSES = ["UPCOMING", "PAID"] as const;

export const EDITABLE_STATUSES: readonly ExpenseStatusValue[] = ["UPCOMING"];
export const PAYABLE_STATUSES: readonly ExpenseStatusValue[] = ["UPCOMING"];
export const CANCELLABLE_STATUSES: readonly ExpenseStatusValue[] = ["UPCOMING"];

export function canEditExpense(status: ExpenseStatusValue): boolean {
  return EDITABLE_STATUSES.includes(status);
}

export function canPayExpense(status: ExpenseStatusValue): boolean {
  return PAYABLE_STATUSES.includes(status);
}

export function canCancelExpense(status: ExpenseStatusValue): boolean {
  return CANCELLABLE_STATUSES.includes(status);
}

/**
 * PRD §FR-06: an unpaid expense whose due date has passed is highlighted as
 * OVERDUE. Calculated from the business-local date, never from a UTC timestamp
 * comparison or a stored/manually updated status.
 */
export function deriveDisplayStatus(
  status: ExpenseStatusValue,
  dueDate: string,
  businessLocalDate: string,
): ExpenseStatusValue {
  if (status === "UPCOMING" && dueDate < businessLocalDate) return "OVERDUE";
  return status;
}

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategoryValue, string> = {
  RENT: "Rent",
  INTERNET: "Internet",
  SOFTWARE_SUBSCRIPTIONS: "Software subscriptions",
  SALARIES: "Salaries",
  EQUIPMENT: "Equipment",
  MARKETING: "Marketing",
  TRAVEL: "Travel",
  UTILITIES: "Utilities",
  OTHER: "Other",
};
