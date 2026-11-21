// Shared, serializable shapes for Expense Management. Money is a canonical 2dp
// decimal string so JSON never loses precision. Dates are YYYY-MM-DD and
// timestamps are ISO strings. `status` is the stored value; `displayStatus`
// may additionally be the date-derived OVERDUE.
import type { ExpenseCategoryValue } from "@/lib/expense-status";

/**
 * Source of truth for stored expense statuses. `OVERDUE` is never stored — it
 * is derived for display from the business-local date by `deriveDisplayStatus`,
 * but it is part of the status vocabulary used by filters and badges.
 */
export type ExpenseStatusValue = "UPCOMING" | "OVERDUE" | "PAID" | "CANCELLED";

export type ExpenseRecord = {
  id: string;
  businessId: string;
  title: string;
  category: ExpenseCategoryValue;
  amount: string;
  dueDate: string;
  paymentDate: string | null;
  status: ExpenseStatusValue;
  displayStatus: ExpenseStatusValue;
  /** Business config snapshots for display; Expense has no currency column. */
  currency: string;
  timezone: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseDetail = ExpenseRecord;

export type ExpenseListResult = {
  items: ExpenseRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
