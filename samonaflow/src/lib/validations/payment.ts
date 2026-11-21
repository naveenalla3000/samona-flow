import { z } from "zod";
import { formatMoney, parseMoney } from "@/lib/invoice-math";
import { PAYMENT_METHODS } from "@/lib/payment-status";
import { isoDateSchema, moneySchema } from "./invoice";

// Reuse the project's generic identifier validator rather than redefining it.
export { businessIdSchema } from "./customer";
export { invoiceIdSchema } from "./invoice";

export const paymentIdSchema = z.uuid("Invalid payment id");

export const paymentMethodSchema = z.enum(PAYMENT_METHODS);

/**
 * Money is accepted only as a decimal string and normalized to exactly two
 * decimal places. A JS number is never accepted as the authoritative amount.
 * Server-derived fields (status, balance, currency) are not fields, so Zod
 * strips them if a client sends them.
 */
const amountSchema = moneySchema(10, "Amount").refine(
  (value) => parseMoney(value) > BigInt(0),
  "Amount must be greater than zero",
);

const optionalTextSchema = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
    .optional()
    .transform((value) => value || null);

export const createPaymentSchema = z.object({
  invoiceId: z.uuid("Select an invoice"),
  amount: amountSchema,
  paymentDate: isoDateSchema,
  method: paymentMethodSchema,
  transactionReference: optionalTextSchema(200, "Transaction reference"),
  notes: optionalTextSchema(5000, "Notes"),
});

export const reversePaymentSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "Enter a reason of at least 3 characters")
    .max(1000, "Reason must be at most 1000 characters"),
});

export const paymentStatusFilterSchema = z.enum(["all", "RECORDED", "REVERSED"]);

export const paymentSortSchema = z.enum(["paymentDate", "amount", "createdAt"]);

export const listPaymentsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1, "Page must be at least 1").default(1),
    pageSize: z.coerce.number().int().min(1).max(100, "Page size must be at most 100").default(20),
    search: z.string().trim().max(200, "Search is too long").optional(),
    status: paymentStatusFilterSchema.default("all"),
    method: paymentMethodSchema.optional(),
    invoiceId: z
      .union([z.uuid(), z.literal("")])
      .optional()
      .transform((value) => value || undefined),
    customerId: z
      .union([z.uuid(), z.literal("")])
      .optional()
      .transform((value) => value || undefined),
    fromDate: isoDateSchema.optional(),
    toDate: isoDateSchema.optional(),
    sort: paymentSortSchema.default("paymentDate"),
    direction: z.enum(["asc", "desc"]).default("desc"),
  })
  .refine((value) => !value.fromDate || !value.toDate || value.toDate >= value.fromDate, {
    path: ["toDate"],
    message: "End date must be on or after the start date",
  });

// Exported for tests that assert canonical normalization independently.
export { formatMoney };

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type ReversePaymentInput = z.infer<typeof reversePaymentSchema>;
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;
