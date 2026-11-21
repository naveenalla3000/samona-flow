// Zod query schemas for the Cash Flow Forecasting REST API.
// The PRD names the parameter `days`; this module accepts `days` as an alias for
// `horizon` so both the PRD contract and the module contract work. Supplying
// both at once is rejected.
import { z } from "zod";
import { FORECAST_HORIZONS, type ForecastHorizon } from "@/types/forecast";

export const horizonValueSchema = z.coerce
  .number()
  .int("Horizon must be 30, 60 or 90 days")
  .refine((value) => (FORECAST_HORIZONS as readonly number[]).includes(value), {
    message: "Horizon must be 30, 60 or 90 days",
  })
  .transform((value) => value as ForecastHorizon);

export const forecastQuerySchema = z
  .object({
    horizon: horizonValueSchema.optional(),
    days: horizonValueSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.horizon !== undefined && value.days !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["horizon"],
        message: "Use either horizon or days, not both.",
      });
    }
  })
  .transform((value) => ({ horizon: value.horizon ?? value.days ?? 30 }));

export type ForecastQuery = z.output<typeof forecastQuerySchema>;

export { FORECAST_HORIZONS };
