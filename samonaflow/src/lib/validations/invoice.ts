import { z } from "zod";
import { formatMoney, parseMoney } from "@/lib/invoice-math";

// Reuse the project's generic identifier validator rather than redefining it.
export { businessIdSchema } from "./customer";

export const invoiceIdSchema = z.uuid("Invalid invoice id");

export const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Enter a valid calendar date");

/**
 * Money is accepted as a decimal string (never a JS number) and normalized to
 * exactly 2 decimal places. Server-owned totals are deliberately not fields.
 */
export function moneySchema(maxIntegerDigits: number, label: string) {
  return z
    .string()
    .trim()
    .regex(
      new RegExp(`^\\d{1,${maxIntegerDigits}}(\\.\\d{1,2})?$`),
      `${label} must be a non-negative amount with at most 2 decimals`,
    )
    .transform((value) => formatMoney(parseMoney(value)));
}

const quantitySchema = moneySchema(8, "Quantity").refine(
  (value) => parseMoney(value) > BigInt(0),
  "Quantity must be greater than zero",
);

const money12Schema = moneySchema(10, "Amount");
const currencySchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z]{3}$/.test(value), "Currency must be a 3-letter ISO 4217 code");

const optionalNotesSchema = z
  .string()
  .trim()
  .max(5000, "Notes must be at most 5000 characters")
  .optional()
  .transform((value) => value || null);

export const invoiceItemSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, "Description is required")
    .max(1000, "Description must be at most 1000 characters"),
  quantity: quantitySchema,
  unitPrice: money12Schema,
});

const invoiceFields = z.object({
  customerId: z.uuid("Select a customer"),
  issueDate: isoDateSchema,
  dueDate: isoDateSchema,
  // Optional: the server snapshots the business currency when omitted.
  currency: currencySchema.optional(),
  notes: optionalNotesSchema,
  discount: money12Schema.default("0.00"),
  tax: money12Schema.default("0.00"),
  items: z.array(invoiceItemSchema).min(1, "Add at least one line item"),
});

function dueDateIsValid(value: { issueDate?: string; dueDate?: string }): boolean {
  return !value.issueDate || !value.dueDate || value.dueDate >= value.issueDate;
}

const DUE_DATE_MESSAGE = "Due date must be on or after the issue date";

/** POST body. Only customer/date/currency/notes/discount/tax/items are client-owned. */
export const createInvoiceSchema = invoiceFields.refine(dueDateIsValid, {
  path: ["dueDate"],
  message: DUE_DATE_MESSAGE,
});

/**
 * PATCH body for a DRAFT invoice. Header fields are optional, but `items` is
 * always required: the caller sends the complete desired line-item list, which
 * is how items are added, edited and removed atomically on the server.
 */
export const updateInvoiceSchema = z
  .object({
    customerId: invoiceFields.shape.customerId.optional(),
    issueDate: invoiceFields.shape.issueDate.optional(),
    dueDate: invoiceFields.shape.dueDate.optional(),
    currency: invoiceFields.shape.currency.optional(),
    notes: invoiceFields.shape.notes.optional(),
    discount: invoiceFields.shape.discount.optional(),
    tax: invoiceFields.shape.tax.optional(),
    items: invoiceFields.shape.items,
  })
  .refine(dueDateIsValid, { path: ["dueDate"], message: DUE_DATE_MESSAGE });

export const invoiceStatusFilterSchema = z.enum([
  "DRAFT",
  "SENT",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "VOID",
  "all",
]);

export const invoiceSortSchema = z.enum([
  "issueDate",
  "dueDate",
  "invoiceNumber",
  "totalAmount",
  "createdAt",
  "status",
]);

export const listInvoicesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1, "Page must be at least 1").default(1),
    pageSize: z.coerce.number().int().min(1).max(100, "Page size must be at most 100").default(20),
    search: z.string().trim().max(200, "Search is too long").optional(),
    status: invoiceStatusFilterSchema.default("all"),
    // Empty string means "all customers" from the UI select.
    customerId: z
      .union([z.uuid(), z.literal("")])
      .optional()
      .transform((value) => value || undefined),
    fromDate: isoDateSchema.optional(),
    toDate: isoDateSchema.optional(),
    sort: invoiceSortSchema.default("issueDate"),
    direction: z.enum(["asc", "desc"]).default("desc"),
  })
  .refine((value) => !value.fromDate || !value.toDate || value.toDate >= value.fromDate, {
    path: ["toDate"],
    message: "End date must be on or after the start date",
  });

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;
