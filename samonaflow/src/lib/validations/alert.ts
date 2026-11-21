// Zod schemas for the Smart Alerts REST API. Query strings only; the businessId
// comes from the route segment and is validated by the controller.
import { z } from "zod";
import { ALERT_SEVERITIES, ALERT_TYPES } from "@/types/alert";

export { businessIdSchema } from "./customer";

export const alertIdSchema = z.uuid("Invalid alert id");
export const alertTypeSchema = z.enum(ALERT_TYPES);
export const alertSeveritySchema = z.enum(ALERT_SEVERITIES);

/** `all` includes resolved history; the default list is current warnings only. */
export const alertStatusFilterSchema = z.enum([
  "all",
  "active",
  "resolved",
  "dismissed",
]);

export const alertReadFilterSchema = z.enum(["all", "read", "unread"]);

export const alertSortSchema = z.enum(["createdAt", "severity", "type"]);

export const listAlertsQuerySchema = z.object({
  type: alertTypeSchema.optional(),
  severity: alertSeveritySchema.optional(),
  read: alertReadFilterSchema.default("all"),
  status: alertStatusFilterSchema.default("active"),
  page: z.coerce.number().int().min(1, "Page must be at least 1").default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(100, "Page size must be at most 100")
    .default(20),
  sort: alertSortSchema.default("createdAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});

export type ListAlertsQuery = z.infer<typeof listAlertsQuerySchema>;
