import type { ForecastAdjustmentType } from "@/types/forecast-simulation";

export const ADJUSTMENT_TYPE_LABELS: Record<ForecastAdjustmentType, string> = {
  delay_payment: "Delay customer payment",
  receive_earlier: "Receive payment earlier",
  change_amount: "Change expected amount",
  add_expense: "Add hypothetical expense",
  increase_expense: "Increase expense",
  reduce_expense: "Reduce expense",
  delay_expense: "Delay expense",
};

export const INCOMING_ADJUSTMENT_TYPES = [
  "delay_payment",
  "receive_earlier",
  "change_amount",
] as const;

export const OUTGOING_ADJUSTMENT_TYPES = [
  "add_expense",
  "increase_expense",
  "reduce_expense",
  "delay_expense",
] as const;
