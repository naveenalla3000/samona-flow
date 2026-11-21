// Pure Smart Alert generation rules. No database, Next.js or browser
// dependency: callers pass an explicit, already-authorized snapshot and the
// business-local "today", and receive deterministic alert candidates.
//
// The six conditions (also documented in README):
//   OVERDUE_PAYMENT          issued invoice past due with an outstanding balance
//   PAYMENT_APPROACHING      issued invoice due within the next 3 days
//   PARTIAL_PAYMENT_DUE      partially paid invoice with an outstanding balance,
//                            not overdue and not due within the next 3 days
//   UPCOMING_EXPENSE         unpaid expense due within the next 3 days
//   POTENTIAL_SHORTAGE       the authoritative forecast engine projects a
//                            negative balance inside its 30-day horizon
//   CUSTOMER_CONCENTRATION   the largest customer holds at least 50% of
//                            outstanding receivables when at least two customers
//                            have an outstanding balance
//
// Alert precedence keeps one invoice alert per lifecycle stage: an overdue
// invoice is OVERDUE_PAYMENT only; a partially paid invoice due within 3 days is
// PAYMENT_APPROACHING only; a partially paid invoice further out is
// PARTIAL_PAYMENT_DUE. Expenses are only alerted while their stored status is
// UPCOMING; PAID, CANCELLED and already-overdue expenses do not generate this
// alert type.
import { daysBetween } from "@/lib/dashboard-metrics";
import type { ExpenseCategoryValue } from "@/lib/expense-status";
import { formatMoney, parseMoney, parseSignedMoney } from "@/lib/invoice-math";
import { outstandingCents } from "@/lib/payment-math";
import type {
  AlertRelatedEntityType,
  AlertSeverityValue,
  AlertTypeValue,
} from "@/types/alert";
import type { ExpenseStatusValue } from "@/types/expense";
import type { InvoiceStatusValue } from "@/types/invoice";

/** An invoice due within this many days is approaching. */
export const PAYMENT_APPROACHING_DAYS = 3;
/** An expense due within this many days is upcoming. */
export const UPCOMING_EXPENSE_DAYS = 3;
/** The forecast horizon used for the shortage alert. */
export const SHORTAGE_HORIZON_DAYS = 30;
/** An invoice this many days past due becomes CRITICAL. */
export const OVERDUE_CRITICAL_DAYS = 30;
/** A projected shortage this many days out or sooner is CRITICAL. */
export const SHORTAGE_CRITICAL_DAYS = 7;
/** A customer at or above this share of receivables is concentrated. */
export const CONCENTRATION_THRESHOLD_BPS = BigInt(5000); // 50.00%
/** A customer at or above this share is CRITICAL. */
export const CONCENTRATION_CRITICAL_BPS = BigInt(7500); // 75.00%

export const ALERT_TYPE_LABELS: Record<AlertTypeValue, string> = {
  OVERDUE_PAYMENT: "Overdue invoice",
  PAYMENT_APPROACHING: "Payment approaching",
  POTENTIAL_SHORTAGE: "Potential cash shortage",
  UPCOMING_EXPENSE: "Upcoming expense",
  PARTIAL_PAYMENT_DUE: "Partial payment due",
  CUSTOMER_CONCENTRATION: "Customer concentration",
};

export const ALERT_SEVERITY_LABELS: Record<AlertSeverityValue, string> = {
  INFO: "Info",
  WARNING: "Warning",
  CRITICAL: "Critical",
};

export const ALERT_SEVERITY_RANK: Record<AlertSeverityValue, number> = {
  INFO: 0,
  WARNING: 1,
  CRITICAL: 2,
};

/** One open invoice, with amountPaid already net of reversed payments. */
export interface AlertInvoiceSnapshot {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  currency: string;
  status: InvoiceStatusValue;
  dueDate: string;
  expectedPaymentDate: string | null;
  totalAmount: string;
  /** Sum of active (non-reversed) payments, canonical 2dp. */
  amountPaid: string;
}

/** One unpaid expense. Overdue rows are included for the forecast snapshot. */
export interface AlertExpenseSnapshot {
  id: string;
  title: string;
  category: ExpenseCategoryValue;
  amount: string;
  dueDate: string;
  status: ExpenseStatusValue;
}

/** The subset of the forecast result that the shortage rule consumes. */
export interface AlertShortageSnapshot {
  horizonDays: number;
  becomesNegative: boolean;
  shortageDate: string | null;
  lowestProjectedBalance: string;
  lowestProjectedDate: string;
  projectedEndingBalance: string;
}

export interface AlertEvaluationInput {
  currency: string;
  timezone: string;
  today: string;
  invoices: readonly AlertInvoiceSnapshot[];
  expenses: readonly AlertExpenseSnapshot[];
  shortage: AlertShortageSnapshot;
}

export interface GeneratedAlert {
  type: AlertTypeValue;
  severity: AlertSeverityValue;
  title: string;
  description: string;
  recommendedAction: string;
  relatedEntityType: AlertRelatedEntityType | null;
  relatedEntityId: string | null;
  /** Stable key that prevents duplicate active alerts for the same condition. */
  dedupeKey: string;
}

const OVERDUE_INVOICE_STATUSES = new Set<InvoiceStatusValue>([
  "SENT",
  "PARTIALLY_PAID",
  "OVERDUE",
]);

function currencyAmount(currency: string, value: bigint): string {
  return `${currency} ${formatMoney(value)}`;
}

function dayLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

function overdueLabel(days: number): string {
  if (days <= 0) return "due today";
  if (days === 1) return "1 day overdue";
  return `${days} days overdue`;
}

function formatPercent(basisPoints: bigint): string {
  // Basis points are small (0..10000), so Number is safe for display only.
  const value = Number(basisPoints) / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function severityForOverdue(daysOverdue: number): AlertSeverityValue {
  return daysOverdue >= OVERDUE_CRITICAL_DAYS ? "CRITICAL" : "WARNING";
}

/**
 * Builds every alert candidate for one business snapshot. The result is sorted
 * most severe first, then by dedupe key, so persistence and UI order are stable.
 */
export function generateAlerts(input: AlertEvaluationInput): GeneratedAlert[] {
  const alerts: GeneratedAlert[] = [];
  const today = input.today;

  for (const invoice of input.invoices) {
    if (!OVERDUE_INVOICE_STATUSES.has(invoice.status)) continue;
    // Multi-currency conversion is a non-goal. Never mix another currency into
    // a business-currency alert or into the concentration denominator.
    if (invoice.currency !== input.currency) continue;

    const outstanding = outstandingCents(invoice.totalAmount, [
      { amount: invoice.amountPaid, reversed: false },
    ]);
    if (outstanding <= BigInt(0)) continue;

    const overdue =
      invoice.status === "OVERDUE" ||
      ((invoice.status === "SENT" || invoice.status === "PARTIALLY_PAID") &&
        invoice.dueDate < today);

    if (overdue) {
      const daysOverdue = Math.max(0, daysBetween(invoice.dueDate, today));
      alerts.push({
        type: "OVERDUE_PAYMENT",
        severity: severityForOverdue(daysOverdue),
        title: `Overdue invoice ${invoice.invoiceNumber}`,
        description: `${invoice.customerName} owes ${currencyAmount(
          input.currency,
          outstanding,
        )}; invoice ${invoice.invoiceNumber} was due on ${invoice.dueDate} (${overdueLabel(
          daysOverdue,
        )}).`,
        recommendedAction:
          "Send a payment reminder, then prepare a follow-up if the balance is still unpaid.",
        relatedEntityType: "INVOICE",
        relatedEntityId: invoice.id,
        dedupeKey: `OVERDUE_PAYMENT:${invoice.id}`,
      });
      continue;
    }

    if (invoice.status !== "SENT" && invoice.status !== "PARTIALLY_PAID") continue;

    const daysUntilDue = daysBetween(today, invoice.dueDate);

    if (daysUntilDue >= 0 && daysUntilDue <= PAYMENT_APPROACHING_DAYS) {
      alerts.push({
        type: "PAYMENT_APPROACHING",
        severity: "WARNING",
        title: `Invoice ${invoice.invoiceNumber} due ${dayLabel(daysUntilDue)}`,
        description: `${invoice.customerName} owes ${currencyAmount(
          input.currency,
          outstanding,
        )}, due on ${invoice.dueDate}.`,
        recommendedAction:
          "Confirm the customer received the invoice and prepare a follow-up before the due date.",
        relatedEntityType: "INVOICE",
        relatedEntityId: invoice.id,
        dedupeKey: `PAYMENT_APPROACHING:${invoice.id}`,
      });
      continue;
    }

    if (invoice.status === "PARTIALLY_PAID" && daysUntilDue > PAYMENT_APPROACHING_DAYS) {
      const paid = parseMoney(invoice.amountPaid);
      const total = parseMoney(invoice.totalAmount);
      alerts.push({
        type: "PARTIAL_PAYMENT_DUE",
        severity: "INFO",
        title: `Partially paid invoice ${invoice.invoiceNumber}`,
        description: `${invoice.customerName} has paid ${currencyAmount(
          input.currency,
          paid,
        )} of ${currencyAmount(input.currency, total)}; ${currencyAmount(
          input.currency,
          outstanding,
        )} remains outstanding on invoice ${invoice.invoiceNumber}.`,
        recommendedAction:
          "Follow up on the remaining balance and agree a payment date with the customer.",
        relatedEntityType: "INVOICE",
        relatedEntityId: invoice.id,
        dedupeKey: `PARTIAL_PAYMENT_DUE:${invoice.id}`,
      });
    }
  }

  for (const expense of input.expenses) {
    if (expense.status !== "UPCOMING") continue;
    const amount = parseMoney(expense.amount);
    if (amount <= BigInt(0)) continue;

    const daysUntilDue = daysBetween(today, expense.dueDate);
    if (daysUntilDue < 0 || daysUntilDue > UPCOMING_EXPENSE_DAYS) continue;

    alerts.push({
      type: "UPCOMING_EXPENSE",
      severity: "WARNING",
      title: `Expense due ${dayLabel(daysUntilDue)}: ${expense.title}`,
      description: `${expense.title} (${currencyAmount(
        input.currency,
        amount,
      )}) is due on ${expense.dueDate}.`,
      recommendedAction:
        "Review the expense, confirm the amount, and make sure enough cash is available.",
      relatedEntityType: "EXPENSE",
      relatedEntityId: expense.id,
      dedupeKey: `UPCOMING_EXPENSE:${expense.id}`,
    });
  }

  if (input.shortage.becomesNegative) {
    const shortageDate = input.shortage.shortageDate ?? today;
    const daysUntilShortage = Math.max(0, daysBetween(today, shortageDate));
    alerts.push({
      type: "POTENTIAL_SHORTAGE",
      severity:
        daysUntilShortage <= SHORTAGE_CRITICAL_DAYS ? "CRITICAL" : "WARNING",
      title: `Projected cash shortage on ${shortageDate}`,
      description: `The ${input.shortage.horizonDays}-day forecast projects a low point of ${currencyAmount(
        input.currency,
        parseSignedMoney(input.shortage.lowestProjectedBalance),
      )} on ${input.shortage.lowestProjectedDate}. The balance turns negative on ${shortageDate}.`,
      recommendedAction:
        "Open the cash flow forecast, review upcoming outflows, and decide which receivables to collect or expenses to defer.",
      relatedEntityType: "FORECAST",
      relatedEntityId: null,
      dedupeKey: "POTENTIAL_SHORTAGE",
    });
  }

  const exposureByCustomer = new Map<
    string,
    { customerId: string; customerName: string; outstanding: bigint }
  >();
  for (const invoice of input.invoices) {
    if (!OVERDUE_INVOICE_STATUSES.has(invoice.status)) continue;
    if (invoice.currency !== input.currency) continue;
    const outstanding = outstandingCents(invoice.totalAmount, [
      { amount: invoice.amountPaid, reversed: false },
    ]);
    if (outstanding <= BigInt(0)) continue;

    const current = exposureByCustomer.get(invoice.customerId);
    if (current) {
      current.outstanding += outstanding;
    } else {
      exposureByCustomer.set(invoice.customerId, {
        customerId: invoice.customerId,
        customerName: invoice.customerName,
        outstanding,
      });
    }
  }

  // A single-customer book has no comparative concentration; it is already the
  // whole receivable book and would otherwise alert on every invoice.
  if (exposureByCustomer.size >= 2) {
    let total = BigInt(0);
    let top: { customerId: string; customerName: string; outstanding: bigint } | null = null;
    for (const exposure of exposureByCustomer.values()) {
      total += exposure.outstanding;
      if (
        top === null ||
        exposure.outstanding > top.outstanding ||
        (exposure.outstanding === top.outstanding &&
          exposure.customerId < top.customerId)
      ) {
        top = exposure;
      }
    }

    if (top !== null && total > BigInt(0)) {
      const shareBps = (top.outstanding * BigInt(10000)) / total;
      if (shareBps >= CONCENTRATION_THRESHOLD_BPS) {
        alerts.push({
          type: "CUSTOMER_CONCENTRATION",
          severity:
            shareBps >= CONCENTRATION_CRITICAL_BPS ? "CRITICAL" : "WARNING",
          title: `Receivables concentrated in ${top.customerName}`,
          description: `${top.customerName} accounts for ${formatPercent(
            shareBps,
          )}% of outstanding receivables (${currencyAmount(
            input.currency,
            top.outstanding,
          )} of ${currencyAmount(input.currency, total)}).`,
          recommendedAction:
            "Review this customer's payment history and avoid extending further credit until the balance is reduced.",
          relatedEntityType: "CUSTOMER",
          relatedEntityId: top.customerId,
          dedupeKey: `CUSTOMER_CONCENTRATION:${top.customerId}`,
        });
      }
    }
  }

  return alerts.sort(
    (left, right) =>
      ALERT_SEVERITY_RANK[right.severity] - ALERT_SEVERITY_RANK[left.severity] ||
      left.dedupeKey.localeCompare(right.dedupeKey),
  );
}
