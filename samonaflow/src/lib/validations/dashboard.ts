// Zod v4 query schemas for the Dashboard REST API. Query strings only; the
// businessId comes from the route segment and is validated by the controller.
import { z } from "zod";
import { forecastQuerySchema } from "./forecast";
import { isoDateSchema } from "./invoice";

export { businessIdSchema } from "./customer";
export { isoDateSchema };

export const dashboardPresetSchema = z.enum([
  "last_30_days",
  "last_90_days",
  "this_month",
  "last_month",
  "year_to_date",
]);

export const dashboardGranularitySchema = z.enum(["day", "week", "month"]);

/** Either a preset, or an explicit from/to pair (both required together). */
export const summaryQuerySchema = z
  .object({
    preset: dashboardPresetSchema.optional(),
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const hasRange = value.from !== undefined || value.to !== undefined;
    if (value.preset !== undefined && hasRange) {
      ctx.addIssue({
        code: "custom",
        path: ["preset"],
        message: "Use either preset or from/to, not both.",
      });
    }
    if (hasRange && (value.from === undefined || value.to === undefined)) {
      ctx.addIssue({
        code: "custom",
        path: value.from === undefined ? ["from"] : ["to"],
        message: "from and to must be provided together.",
      });
    }
  });

export const trendsQuerySchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
  granularity: dashboardGranularitySchema.default("month"),
});

export const receivablesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1, "Limit must be at least 1").max(100, "Limit must be at most 100").default(25),
  cursor: z.uuid("Invalid cursor").optional(),
});

export const recentActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1, "Limit must be at least 1").max(20, "Limit must be at most 20").default(10),
});

export const upcomingExpensesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1, "Limit must be at least 1").max(50, "Limit must be at most 50").default(10),
});

/**
 * The cash-flow overview reuses the forecasting contract, including the
 * `days` alias, so the dashboard and the forecast page cannot drift apart.
 */
export const cashFlowQuerySchema = forecastQuerySchema;

export const actionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1, "Limit must be at least 1").max(20, "Limit must be at most 20").default(5),
});

export const transactionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1, "Limit must be at least 1").max(20, "Limit must be at most 20").default(10),
});

/** Reminders take no query parameters. */
export const remindersQuerySchema = z.object({});

export type DashboardPresetInput = z.infer<typeof dashboardPresetSchema>;
export type SummaryQuery = z.infer<typeof summaryQuerySchema>;
export type TrendsQuery = z.infer<typeof trendsQuerySchema>;
export type ReceivablesQuery = z.infer<typeof receivablesQuerySchema>;
export type RecentActivityQuery = z.infer<typeof recentActivityQuerySchema>;
export type UpcomingExpensesQuery = z.infer<typeof upcomingExpensesQuerySchema>;
export type CashFlowQuery = z.infer<typeof cashFlowQuerySchema>;
export type ActionsQuery = z.infer<typeof actionsQuerySchema>;
export type TransactionsQuery = z.infer<typeof transactionsQuerySchema>;
export type RemindersQuery = z.infer<typeof remindersQuerySchema>;
