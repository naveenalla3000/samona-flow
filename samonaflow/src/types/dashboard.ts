// Serializable shapes for the completed Financial Dashboard.
//
// The summary endpoint keeps its existing contract: money there is a canonical
// integer minor-unit string (for example "12345" = 123.45). Forecast-derived
// amounts (cash-flow overview) are canonical 2dp major-unit strings, matching
// the forecasting module. Dates are YYYY-MM-DD business-calendar dates;
// timestamps are ISO strings. The UI must never recalculate outstanding,
// overdue days or forecast balances.
import type { ExpenseCategoryValue } from "@/lib/expense-status";
import type { AlertRelatedEntityType, AlertSeverityValue, AlertTypeValue } from "@/types/alert";
import type { ExpenseStatusValue } from "@/types/expense";
import type { ForecastHorizon } from "@/types/forecast";
import type { InvoiceStatusValue } from "@/types/invoice";

export type DashboardPeriod =
  | "this_month"
  | "last_month"
  | "last_30_days"
  | "last_90_days";

export type DashboardPresetValue = DashboardPeriod | "year_to_date";

export interface DashboardReceivable {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  currency: string;
  totalAmount: string;
  amountPaid: string;
  /** Total minus active (non-reversed) payments. Computed on the server only. */
  outstanding: string;
  dueDate: string;
  /** Whole days past the business-local today; 0 when not overdue. */
  daysOverdue: number;
  /** Stored invoice status. */
  status: InvoiceStatusValue;
  /** Stored status with the date-derived OVERDUE applied. */
  displayStatus: InvoiceStatusValue;
  isOverdue: boolean;
  isPartiallyPaid: boolean;
}

export interface DashboardUpcomingExpense {
  id: string;
  title: string;
  category: ExpenseCategoryValue;
  amount: string;
  dueDate: string;
  /** Stored status. OVERDUE is never stored by the expense module. */
  status: ExpenseStatusValue;
  /** Stored status with the date-derived OVERDUE applied. */
  displayStatus: ExpenseStatusValue;
  isOverdue: boolean;
  currency: string;
}

export interface DashboardCashFlowPoint {
  date: string;
  incoming: string;
  outgoing: string;
  /** Projected closing balance for the day. */
  balance: string;
}

export interface DashboardCashFlow {
  currency: string;
  horizonDays: ForecastHorizon;
  today: string;
  startDate: string;
  endDate: string;
  calculatedAt: string;
  /** Current available cash at the start of the projection. */
  currentCash: string;
  expectedIncoming: string;
  expectedOutgoing: string;
  netCashFlow: string;
  projectedClosing: string;
  lowestProjectedBalance: string;
  lowestProjectedDate: string;
  shortageDate: string | null;
  becomesNegative: boolean;
  series: DashboardCashFlowPoint[];
}

export interface DashboardActionRecord {
  type: AlertRelatedEntityType;
  id: string | null;
  href: string;
}

export interface DashboardAction {
  id: string;
  type: AlertTypeValue;
  severity: AlertSeverityValue;
  title: string;
  description: string;
  recommendedAction: string;
  isRead: boolean;
  createdAt: string;
  /** Link to the alert detail, which owns the existing lifecycle controls. */
  alertHref: string;
  /** Business-verified record the alert refers to, or null when none applies. */
  record: DashboardActionRecord | null;
}

export interface DashboardTransaction {
  id: string;
  kind: "PAYMENT" | "EXPENSE";
  /** Business-local date of the cash movement. */
  date: string;
  description: string;
  reference: string | null;
  amount: string;
  direction: "in" | "out";
  currency: string;
  href: string;
}
