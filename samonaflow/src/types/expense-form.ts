// Shared between expense server actions and client forms. The form works with
// the pre-transform (input) shape; the Zod resolver normalizes on submit.
import type { z } from "zod";
import type { createExpenseSchema } from "@/lib/validations/expense";

export type ExpenseFormValues = z.input<typeof createExpenseSchema>;

export type ExpenseFormState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
};

export const initialExpenseFormState: ExpenseFormState = { status: "idle" };
