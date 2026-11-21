import { z } from "zod";
import { REMINDER_TYPES } from "@/lib/reminder-status";
import { isoDateSchema } from "./invoice";

export { businessIdSchema } from "./customer";
export { isoDateSchema };

export const reminderIdSchema = z.uuid("Invalid reminder id");
export const reminderTypeSchema = z.enum(REMINDER_TYPES);

// Forms send an empty string for an empty date input; normalize that to null.
const optionalDateSchema = z
  .union([isoDateSchema, z.literal(""), z.null()])
  .optional()
  .transform((value) => value || null);

/**
 * Create body. customerId and invoiceId are verified against the authenticated
 * business in the service; the message, status, WhatsApp URL, identifiers and
 * timestamps are all server-owned and stripped if a client supplies them.
 */
export const createReminderSchema = z.object({
  customerId: z.uuid("Invalid customer id"),
  invoiceId: z.uuid("Invalid invoice id"),
  reminderType: reminderTypeSchema,
  followUpDate: optionalDateSchema,
});

/**
 * Edit/reschedule body. Message and category are draft-only; the follow-up
 * date may also be rescheduled after the WhatsApp link has been opened.
 */
export const updateReminderSchema = z
  .object({
    message: z
      .string()
      .trim()
      .min(1, "Message is required")
      .max(5000, "Message must be at most 5000 characters")
      .optional(),
    reminderType: reminderTypeSchema.optional(),
    followUpDate: optionalDateSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

export const reminderStatusFilterSchema = z.enum([
  "all",
  "DRAFTED",
  "WHATSAPP_OPENED",
  "MARKED_SENT",
  "OVERDUE",
  "UPCOMING",
]);

export const reminderSortSchema = z.enum([
  "followUpDate",
  "createdAt",
  "reminderType",
  "status",
  "customerName",
]);

export const listRemindersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1, "Page must be at least 1").default(1),
    pageSize: z.coerce.number().int().min(1).max(100, "Page size must be at most 100").default(20),
    search: z.string().trim().max(200, "Search is too long").optional(),
    status: reminderStatusFilterSchema.default("all"),
    type: reminderTypeSchema.optional(),
    customerId: z.uuid("Invalid customer id").optional(),
    invoiceId: z.uuid("Invalid invoice id").optional(),
    fromDate: isoDateSchema.optional(),
    toDate: isoDateSchema.optional(),
    sort: reminderSortSchema.default("followUpDate"),
    direction: z.enum(["asc", "desc"]).default("desc"),
  })
  .refine((value) => !value.fromDate || !value.toDate || value.toDate >= value.fromDate, {
    path: ["toDate"],
    message: "End date must be on or after the start date",
  });

export type CreateReminderInput = z.infer<typeof createReminderSchema>;
export type UpdateReminderInput = z.infer<typeof updateReminderSchema>;
export type ListRemindersQuery = z.infer<typeof listRemindersQuerySchema>;
