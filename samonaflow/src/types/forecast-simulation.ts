// Serializable shapes for the What-If Cash Flow Simulator.
//
// A simulation is derived and temporary: it is never persisted, and it never
// changes an invoice, payment, reversal or expense. Money is a canonical 2dp
// decimal string so JSON never loses precision, and dates are business-local
// YYYY-MM-DD calendar strings.
import type { ExpenseCategoryValue } from "@/lib/expense-status";
import type { ForecastHorizon, ForecastResult } from "@/types/forecast";

export const FORECAST_ADJUSTMENT_TYPES = [
  "delay_payment",
  "receive_earlier",
  "change_amount",
  "add_expense",
  "increase_expense",
  "reduce_expense",
  "delay_expense",
] as const;

export type ForecastAdjustmentType = (typeof FORECAST_ADJUSTMENT_TYPES)[number];

interface ForecastAdjustmentBase {
  /** Client-generated id used to identify the row in the scenario builder. */
  id: string;
}

/** Move an expected customer receipt later. */
export interface DelayPaymentAdjustment extends ForecastAdjustmentBase {
  type: "delay_payment";
  invoiceId: string;
  /** New expected payment date, inside the selected horizon. */
  date: string;
}

/** Move an expected customer receipt earlier. */
export interface ReceiveEarlierAdjustment extends ForecastAdjustmentBase {
  type: "receive_earlier";
  invoiceId: string;
  /** New expected payment date, inside the selected horizon. */
  date: string;
}

/** Change the amount still expected from a customer. */
export interface ChangeAmountAdjustment extends ForecastAdjustmentBase {
  type: "change_amount";
  invoiceId: string;
  /** New outstanding amount, positive, in the business currency. */
  amount: string;
}

/** Add an expense that exists only in the simulation. */
export interface AddExpenseAdjustment extends ForecastAdjustmentBase {
  type: "add_expense";
  title: string;
  category: ExpenseCategoryValue;
  /** Positive amount in the business currency. */
  amount: string;
  /** Hypothetical due date, inside the selected horizon. */
  date: string;
}

/** Increase an existing unpaid expense. */
export interface IncreaseExpenseAdjustment extends ForecastAdjustmentBase {
  type: "increase_expense";
  expenseId: string;
  /** Positive increase in the business currency. */
  amount: string;
}

/** Reduce an existing unpaid expense. */
export interface ReduceExpenseAdjustment extends ForecastAdjustmentBase {
  type: "reduce_expense";
  expenseId: string;
  /** Positive reduction in the business currency; must stay below the expense. */
  amount: string;
}

/** Move an expense payment later. */
export interface DelayExpenseAdjustment extends ForecastAdjustmentBase {
  type: "delay_expense";
  expenseId: string;
  /** New due date, inside the selected horizon. */
  date: string;
}

export type ForecastAdjustment =
  | DelayPaymentAdjustment
  | ReceiveEarlierAdjustment
  | ChangeAmountAdjustment
  | AddExpenseAdjustment
  | IncreaseExpenseAdjustment
  | ReduceExpenseAdjustment
  | DelayExpenseAdjustment;

/** Validated request body for POST /forecast/simulations. */
export interface ForecastSimulationRequest {
  horizon: ForecastHorizon;
  adjustments: ForecastAdjustment[];
}

export interface ForecastSimulationAmountComparison {
  baseline: string;
  simulated: string;
  /** Simulated minus baseline, canonical 2dp and possibly negative. */
  delta: string;
}

export interface ForecastSimulationDateComparison {
  baseline: string | null;
  simulated: string | null;
}

export interface ForecastSimulationBooleanComparison {
  baseline: boolean;
  simulated: boolean;
}

export interface ForecastSimulationComparison {
  expectedIncoming: ForecastSimulationAmountComparison;
  expectedOutgoing: ForecastSimulationAmountComparison;
  netCashFlow: ForecastSimulationAmountComparison;
  projectedEndingBalance: ForecastSimulationAmountComparison;
  lowestProjectedBalance: ForecastSimulationAmountComparison;
  lowestProjectedDate: { baseline: string; simulated: string };
  shortageDate: ForecastSimulationDateComparison;
  becomesNegative: ForecastSimulationBooleanComparison;
}

export interface ForecastSimulationDayComparison {
  date: string;
  baselineIncoming: string;
  simulatedIncoming: string;
  baselineOutgoing: string;
  simulatedOutgoing: string;
  baselineBalance: string;
  simulatedBalance: string;
  /** Simulated minus baseline closing balance, canonical 2dp. */
  balanceDelta: string;
}

/** A hypothetical adjustment after it has been applied and described. */
export interface AppliedForecastAdjustment {
  id: string;
  type: ForecastAdjustmentType;
  /** Invoice id, existing expense id, or the generated simulated expense id. */
  targetId: string;
  targetLabel: string;
  description: string;
  /** Signed change to the projected amount, canonical 2dp. */
  amountDelta: string;
  /** Previous scheduled date for date changes, otherwise null. */
  dateFrom: string | null;
  /** New scheduled date for date changes, otherwise null. */
  dateTo: string | null;
}

export interface ForecastSimulationResult {
  currency: string;
  timezone: string;
  horizonDays: ForecastHorizon;
  startDate: string;
  endDate: string;
  today: string;
  calculatedAt: string;
  /** Adjustments in request order, with deterministic descriptions. */
  adjustments: AppliedForecastAdjustment[];
  /** The unchanged forecast calculated from the authorized baseline input. */
  baseline: ForecastResult;
  /** The forecast recalculated after applying the hypothetical adjustments. */
  simulated: ForecastResult;
  comparison: ForecastSimulationComparison;
  /** One row per day, aligned with baseline.daily and simulated.daily. */
  daily: ForecastSimulationDayComparison[];
}
