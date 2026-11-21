import { z } from "zod";
import { parseMoney } from "@/lib/invoice-math";
import { CREATABLE_EXPENSE_STATUSES, EXPENSE_CATEGORIES } from "@/lib/expense-status";
import { isoDateSchema, moneySchema } from "./invoice";

// Reuse the project's generic identifier and date validators.
export { businessIdSchema } from "./customer";
export { isoDateSchema };

export const expenseIdSchema = z.uuid("Invalid expense id");
export const expenseCategorySchema = z.enum(EXPENSE_CATEGORIES);
export const expenseCreatableStatusSchema = z.enum(CREATABLE_EXPENSE_STATUSES);

/**
 * Money is accepted only as a decimal string, normalized to exactly two
 * decimal places. A JS number is never accepted as the authoritative amount,
 * and zero/negative values are rejected (mirroring chk_expenses_amount_pos).
 */
const amountSchema = moneySchema(10, "Amount").refine(
  (value) => parseMoney(value) > BigInt(0),
  "Amount must be greater than zero",
);

const titleSchema = z
  .string()
  .trim()
  .min(1, "Title is required")
  .max(200, "Title must be at most 200 characters");

const notesSchema = z
  .string()
  .trim()
  .max(5000, "Notes must be at most 5000 characters")
  .nullable()
  .optional()
  .transform((value) => value || null);

// Forms send an empty string for an empty date input; normalize that to null.
// `null` is part of the input union so the resolver's output type stays
// assignable to the form's input type (matching the customer form pattern).
const optionalDateSchema = z
  .union([isoDateSchema, z.literal(""), z.null()])
  .optional()
  .transform((value) => value || null);

const expenseFields = z.object({
  title: titleSchema,
  category: expenseCategorySchema,
  amount: amountSchema,
  dueDate: isoDateSchema,
  paymentDate: optionalDateSchema,
  status: expenseCreatableStatusSchema.default("UPCOMING"),
  notes: notesSchema,
});

/**
 * Create body. Server-owned fields (id, businessId, timestamps and the derived
 * display status) are absent, so Zod strips them if a client supplies them.
 * The applied DB CHECK `chk_expenses_paid_requires_payment_date` is mirrored
 * here so a PAID expense can never be created without a payment date.
 */
export const createExpenseSchema = expenseFields.refine(
  (value) => value.status !== "PAID" || value.paymentDate !== null,
  { path: ["paymentDate"], message: "A paid expense requires a payment date" },
);

/** Editable header fields only; status changes go through pay/cancel actions. */
export const updateExpenseSchema = expenseFields
  .pick({ title: true, category: true, amount: true, dueDate: true, notes: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

/** paymentDate is optional; the server defaults it to the business-local date. */
export const payExpenseSchema = z.object({
  paymentDate: optionalDateSchema,
});

export const expenseStatusFilterSchema = z.enum(["all", "UPCOMING", "OVERDUE", "PAID", "CANCELLED"]);
export const expenseSortSchema = z.enum(["dueDate", "amount", "title", "createdAt", "status"]);

export const listExpensesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1, "Page must be at least 1").default(1),
    pageSize: z.coerce.number().int().min(1).max(100, "Page size must be at most 100").default(20),
    search: z.string().trim().max(200, "Search is too long").optional(),
    status: expenseStatusFilterSchema.default("all"),
    category: expenseCategorySchema.optional(),
    fromDate: isoDateSchema.optional(),
    toDate: isoDateSchema.optional(),
    sort: expenseSortSchema.default("dueDate"),
    direction: z.enum(["asc", "desc"]).default("desc"),
  })
  .refine((value) => !value.fromDate || !value.toDate || value.toDate >= value.fromDate, {
    path: ["toDate"],
    message: "End date must be on or after the start date",
  });

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type PayExpenseInput = z.infer<typeof payExpenseSchema>;
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
