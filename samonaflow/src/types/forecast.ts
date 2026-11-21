// Serializable shapes for the Cash Flow Forecasting module.
// Money is always a canonical 2dp decimal string so JSON never loses precision.
// Business dates are YYYY-MM-DD calendar strings in the business timezone.
import type { ExpenseCategoryValue } from "@/lib/expense-status";
import type { ExpenseStatusValue } from "@/types/expense";
import type { InvoiceStatusValue } from "@/types/invoice";

export const FORECAST_HORIZONS = [30, 60, 90] as const;

export type ForecastHorizon = (typeof FORECAST_HORIZONS)[number];

/** One eligible outstanding invoice as returned by the repository. */
export interface ForecastInvoiceInput {
  id: string;
  invoiceNumber: string;
  customerName: string;
  /** Invoice currency snapshot. Only rows matching the business currency are forecast. */
  currency: string;
  status: InvoiceStatusValue;
  dueDate: string;
  expectedPaymentDate: string | null;
  totalAmount: string;
  /** Sum of active (non-reversed) payments already received, canonical 2dp. */
  amountPaid: string;
}

/** One eligible unpaid expense as returned by the repository. */
export interface ForecastExpenseInput {
  id: string;
  title: string;
  category: ExpenseCategoryValue;
  amount: string;
  dueDate: string;
  /** Stored status. OVERDUE is derived from the business-local date. */
  status: ExpenseStatusValue;
}

/** Complete, explicit input for the pure forecasting engine. */
export interface ForecastInput {
  currency: string;
  /** IANA timezone used to resolve the business-local today. */
  timezone: string;
  /** Business-local date the forecast starts on. */
  today: string;
  horizonDays: ForecastHorizon;
  /** Business opening balance (may be negative). */
  openingBalance: string;
  /** Business-local date the opening balance refers to. */
  openingBalanceDate: string;
  /** Active payments in the business currency with paymentDate in [openingBalanceDate, today]. */
  cashInSinceOpening: string;
  /** PAID expenses with paymentDate in [openingBalanceDate, today]. */
  cashOutSinceOpening: string;
  /** ISO timestamp of this calculation, displayed as the forecast's last calculation time. */
  calculatedAt: string;
  invoices: readonly ForecastInvoiceInput[];
  expenses: readonly ForecastExpenseInput[];
}

export interface ForecastIncomingItem {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  status: InvoiceStatusValue;
  dueDate: string;
  expectedPaymentDate: string | null;
  /** Business-local date the receipt is projected on. Overdue items are projected on the start date. */
  scheduledDate: string;
  /** Outstanding balance only, never the full invoice amount when partially paid. */
  amount: string;
  isOverdue: boolean;
}

export interface ForecastOutgoingItem {
  expenseId: string;
  title: string;
  category: ExpenseCategoryValue;
  /** Stored status (UPCOMING or OVERDUE). */
  status: ExpenseStatusValue;
  dueDate: string;
  /** Business-local date the payment is projected on. Overdue items are projected on the start date. */
  scheduledDate: string;
  amount: string;
  isOverdue: boolean;
}

export interface ForecastDay {
  date: string;
  /** Balance at the start of the day, before that day's movements. */
  openingBalance: string;
  incoming: string;
  outgoing: string;
  net: string;
  /** Balance at the end of the day. */
  projectedBalance: string;
  cumulativeIncoming: string;
  cumulativeOutgoing: string;
}

export interface ForecastWeek {
  weekStart: string;
  weekEnd: string;
  incoming: string;
  outgoing: string;
  net: string;
  closingBalance: string;
}

export interface ForecastMonth {
  /** YYYY-MM */
  month: string;
  incoming: string;
  outgoing: string;
  net: string;
  closingBalance: string;
  cumulativeIncoming: string;
  cumulativeOutgoing: string;
}

export interface ForecastExcludedInvoices {
  /** Count of outstanding invoices in a currency other than the business currency. */
  count: number;
  /** Outstanding totals per excluded currency. Never mixed into the forecast. */
  byCurrency: Record<string, string>;
  currencies: string[];
}

export interface ForecastResult {
  currency: string;
  timezone: string;
  horizonDays: ForecastHorizon;
  startDate: string;
  endDate: string;
  today: string;
  /** ISO timestamp of the calculation; the UI labels the forecast as an estimate as of this time. */
  calculatedAt: string;
  /** Current available cash at the start of the forecast. */
  openingBalance: string;
  expectedIncoming: string;
  expectedOutgoing: string;
  netCashFlow: string;
  projectedEndingBalance: string;
  lowestProjectedBalance: string;
  lowestProjectedDate: string;
  /** First date the projected balance is negative, or null. */
  shortageDate: string | null;
  becomesNegative: boolean;
  counts: {
    incoming: number;
    outgoing: number;
    excludedInvoices: number;
  };
  overdue: {
    incoming: string;
    outgoing: string;
    incomingCount: number;
    outgoingCount: number;
  };
  excludedInvoices: ForecastExcludedInvoices;
  incoming: ForecastIncomingItem[];
  outgoing: ForecastOutgoingItem[];
  daily: ForecastDay[];
  weekly: ForecastWeek[];
  monthly: ForecastMonth[];
}
