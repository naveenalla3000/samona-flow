// Zod schemas for the What-If Cash Flow Simulator.
//
// The schema validates the request shape: identifiers, supported adjustment
// types, positive money strings, calendar dates, categories and duplicate
// targets. Semantic checks that need the authorized forecast window (whether a
// date is inside the selected horizon, whether a reference belongs to the
// business, whether a reduction is larger than the expense) are enforced by the
// pure engine in src/lib/forecast-simulation.ts, which receives only data that
// has already been loaded for the verified business.
import { z } from "zod";
import { EXPENSE_CATEGORIES } from "@/lib/expense-status";
import { parseMoney } from "@/lib/invoice-math";
import { horizonValueSchema } from "./forecast";
import { isoDateSchema, moneySchema } from "./invoice";

const adjustmentIdSchema = z
  .string()
  .trim()
  .min(1, "Adjustment id is required")
  .max(64, "Adjustment id must be at most 64 characters");

const positiveAmountSchema = moneySchema(10, "Amount").refine(
  (value) => parseMoney(value) > BigInt(0),
  "Amount must be greater than zero",
);

const invoiceIdSchema = z.uuid("Invalid invoice id");
const expenseIdSchema = z.uuid("Invalid expense id");

const expenseTitleSchema = z
  .string()
  .trim()
  .min(1, "Title is required")
  .max(200, "Title must be at most 200 characters");

const adjustmentBase = { id: adjustmentIdSchema };

export const forecastAdjustmentSchema = z.discriminatedUnion("type", [
  z.object({
    ...adjustmentBase,
    type: z.literal("delay_payment"),
    invoiceId: invoiceIdSchema,
    date: isoDateSchema,
  }),
  z.object({
    ...adjustmentBase,
    type: z.literal("receive_earlier"),
    invoiceId: invoiceIdSchema,
    date: isoDateSchema,
  }),
  z.object({
    ...adjustmentBase,
    type: z.literal("change_amount"),
    invoiceId: invoiceIdSchema,
    amount: positiveAmountSchema,
  }),
  z.object({
    ...adjustmentBase,
    type: z.literal("add_expense"),
    title: expenseTitleSchema,
    category: z.enum(EXPENSE_CATEGORIES),
    amount: positiveAmountSchema,
    date: isoDateSchema,
  }),
  z.object({
    ...adjustmentBase,
    type: z.literal("increase_expense"),
    expenseId: expenseIdSchema,
    amount: positiveAmountSchema,
  }),
  z.object({
    ...adjustmentBase,
    type: z.literal("reduce_expense"),
    expenseId: expenseIdSchema,
    amount: positiveAmountSchema,
  }),
  z.object({
    ...adjustmentBase,
    type: z.literal("delay_expense"),
    expenseId: expenseIdSchema,
    date: isoDateSchema,
  }),
]);

export type ForecastAdjustmentInput = z.input<typeof forecastAdjustmentSchema>;

/**
 * POST body. `horizon` defaults to 30 days, matching the forecast API.
 * Duplicate ids and multiple adjustments against the same invoice or expense
 * are rejected here so an ambiguous scenario can never reach the engine.
 */
export const forecastSimulationRequestSchema = z
  .object({
    horizon: horizonValueSchema.optional(),
    adjustments: z
      .array(forecastAdjustmentSchema)
      .max(50, "At most 50 adjustments are allowed")
      .default([]),
  })
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    const kinds = new Set<string>();
    const dateTypes = new Set(["delay_payment", "receive_earlier", "delay_expense"]);
    const amountTypes = new Set(["change_amount", "increase_expense", "reduce_expense"]);

    value.adjustments.forEach((adjustment, index) => {
      if (ids.has(adjustment.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["adjustments", index, "id"],
          message: "Duplicate adjustment id.",
        });
      }
      ids.add(adjustment.id);

      // A target may have one date change and one amount change; two changes of
      // the same kind against the same record are ambiguous.
      const kind = dateTypes.has(adjustment.type)
        ? "date"
        : amountTypes.has(adjustment.type)
          ? "amount"
          : null;
      if (!kind) return;

      const target =
        "invoiceId" in adjustment
          ? `invoice:${adjustment.invoiceId}:${kind}`
          : "expenseId" in adjustment
            ? `expense:${adjustment.expenseId}:${kind}`
            : null;
      if (target && kinds.has(target)) {
        ctx.addIssue({
          code: "custom",
          path: ["adjustments", index],
          message: "Only one date or amount adjustment per record is allowed.",
        });
      }
      if (target) kinds.add(target);
    });
  })
  .transform((value) => ({
    horizon: value.horizon ?? 30,
    adjustments: value.adjustments,
  }));

export type ForecastSimulationRequestBody = z.input<typeof forecastSimulationRequestSchema>;
