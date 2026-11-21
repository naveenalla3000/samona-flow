// Pure cash-flow forecasting engine (PRD FR-08).
//
// This module has no Prisma, Next.js or browser dependency. It receives an
// explicit, already-authorized snapshot from the repository and returns a
// deterministic result for a fixed `today`. All money is integer minor units
// (BigInt); no floating-point operation touches a financial value.
//
// Formulas (also documented in README):
//   currentCash      = openingBalance + recorded cash in since opening
//                                     - recorded cash out since opening
//   day opening      = previous day closing
//   day closing      = day opening + expected receipts - expected expenses
//   lowest balance   = min(currentCash, every day closing)
//   shortage date    = first negative position (currentCash counts as day 0)
//
// Expected receipts use only the invoice's outstanding balance (total minus
// active, non-reversed payments), so partial payments are never counted twice.
// Overdue invoices and expenses are scheduled on the first forecast day: their
// contractual date has already passed, and dropping them would understate the
// position. This is a conservative assumption, not an invented payment date.

import {
  addDays,
  availableCash,
  bucketStart,
  sumMinor,
} from "@/lib/dashboard-metrics";
import { formatMoney, parseMoney, parseSignedMoney } from "@/lib/invoice-math";
import { outstandingCents } from "@/lib/payment-math";
import type {
  ForecastDay,
  ForecastExcludedInvoices,
  ForecastHorizon,
  ForecastIncomingItem,
  ForecastInput,
  ForecastMonth,
  ForecastOutgoingItem,
  ForecastResult,
  ForecastWeek,
} from "@/types/forecast";

const ZERO = BigInt(0);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const FORECASTABLE_INVOICE_STATUSES = new Set(["SENT", "PARTIALLY_PAID", "OVERDUE"]);
const FORECASTABLE_EXPENSE_STATUSES = new Set(["UPCOMING", "OVERDUE"]);

function invalid(message: string): Error {
  return new Error(`Invalid forecast input: ${message}`);
}

function assertDate(value: string, label: string): string {
  if (!DATE_PATTERN.test(value)) {
    throw invalid(`${label} must be a YYYY-MM-DD date`);
  }
  return value;
}

function assertHorizon(value: number): asserts value is ForecastHorizon {
  if (value !== 30 && value !== 60 && value !== 90) {
    throw invalid("horizonDays must be 30, 60 or 90");
  }
}

/** Overdue items are projected on the first forecast day; future items keep their date. */
function scheduleDate(contractDate: string, today: string): string {
  return contractDate < today ? today : contractDate;
}

interface ScheduledAmounts {
  incoming: bigint;
  outgoing: bigint;
}

function emptySchedule(startDate: string, days: number): Map<string, ScheduledAmounts> {
  const schedule = new Map<string, ScheduledAmounts>();
  for (let index = 0; index < days; index += 1) {
    schedule.set(addDays(startDate, index), { incoming: ZERO, outgoing: ZERO });
  }
  return schedule;
}

function addScheduled(
  schedule: Map<string, ScheduledAmounts>,
  date: string,
  direction: keyof ScheduledAmounts,
  amount: bigint,
): void {
  const bucket = schedule.get(date);
  if (!bucket) {
    // The caller filters by endDate, so a missing bucket is a programming error.
    throw invalid(`scheduled date ${date} is outside the forecast window`);
  }
  bucket[direction] += amount;
}

export function calculateForecast(input: ForecastInput): ForecastResult {
  assertHorizon(input.horizonDays);
  const today = assertDate(input.today, "today");
  assertDate(input.openingBalanceDate, "openingBalanceDate");

  const startDate = today;
  const endDate = addDays(startDate, input.horizonDays - 1);

  const openingMinor = availableCash(
    parseSignedMoney(input.openingBalance),
    parseMoney(input.cashInSinceOpening),
    parseMoney(input.cashOutSinceOpening),
  );

  const schedule = emptySchedule(startDate, input.horizonDays);
  const incomingItems: ForecastIncomingItem[] = [];
  const outgoingItems: ForecastOutgoingItem[] = [];

  const excludedByCurrency = new Map<string, bigint>();
  let excludedCount = 0;

  for (const invoice of input.invoices) {
    if (!FORECASTABLE_INVOICE_STATUSES.has(invoice.status)) {
      continue;
    }

    const outstanding = outstandingCents(invoice.totalAmount, [
      { amount: invoice.amountPaid, reversed: false },
    ]);
    if (outstanding <= ZERO) {
      // Fully paid or anomalous overpayment: never forecast it as a receipt.
      continue;
    }

    if (invoice.currency !== input.currency) {
      // Multi-currency conversion is a PRD non-goal. Report, never mix.
      excludedCount += 1;
      excludedByCurrency.set(
        invoice.currency,
        (excludedByCurrency.get(invoice.currency) ?? ZERO) + outstanding,
      );
      continue;
    }

    const contractDate = invoice.expectedPaymentDate ?? invoice.dueDate;
    assertDate(contractDate, `invoice ${invoice.id} expected date`);
    const scheduled = scheduleDate(contractDate, today);
    if (scheduled > endDate) {
      continue;
    }

    addScheduled(schedule, scheduled, "incoming", outstanding);
    incomingItems.push({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customerName,
      status: invoice.status,
      dueDate: invoice.dueDate,
      expectedPaymentDate: invoice.expectedPaymentDate,
      scheduledDate: scheduled,
      amount: formatMoney(outstanding),
      // Overdue means the invoice itself is past due. A stale expected payment
      // date on a not-yet-due invoice is scheduled today (conservative) but is
      // not labelled overdue.
      isOverdue: invoice.status === "OVERDUE" || invoice.dueDate < today,
    });
  }

  for (const expense of input.expenses) {
    if (!FORECASTABLE_EXPENSE_STATUSES.has(expense.status)) {
      continue;
    }

    assertDate(expense.dueDate, `expense ${expense.id} due date`);
    const scheduled = scheduleDate(expense.dueDate, today);
    if (scheduled > endDate) {
      continue;
    }

    const amount = parseMoney(expense.amount);
    if (amount <= ZERO) {
      continue;
    }

    addScheduled(schedule, scheduled, "outgoing", amount);
    outgoingItems.push({
      expenseId: expense.id,
      title: expense.title,
      category: expense.category,
      status: expense.status,
      dueDate: expense.dueDate,
      scheduledDate: scheduled,
      amount: formatMoney(amount),
      isOverdue: expense.status === "OVERDUE" || expense.dueDate < today,
    });
  }

  incomingItems.sort(
    (a, b) =>
      a.scheduledDate.localeCompare(b.scheduledDate) ||
      a.invoiceNumber.localeCompare(b.invoiceNumber) ||
      a.invoiceId.localeCompare(b.invoiceId),
  );
  outgoingItems.sort(
    (a, b) =>
      a.scheduledDate.localeCompare(b.scheduledDate) ||
      a.title.localeCompare(b.title) ||
      a.expenseId.localeCompare(b.expenseId),
  );

  const daily: ForecastDay[] = [];
  let balance = openingMinor;
  let cumulativeIncoming = ZERO;
  let cumulativeOutgoing = ZERO;
  let lowestBalance = openingMinor;
  let lowestDate = startDate;
  let shortageDate: string | null = openingMinor < ZERO ? startDate : null;

  for (let index = 0; index < input.horizonDays; index += 1) {
    const date = addDays(startDate, index);
    const bucket = schedule.get(date);
    const incoming = bucket?.incoming ?? ZERO;
    const outgoing = bucket?.outgoing ?? ZERO;
    const dayOpening = balance;

    balance = dayOpening + incoming - outgoing;
    cumulativeIncoming += incoming;
    cumulativeOutgoing += outgoing;

    if (balance < lowestBalance) {
      lowestBalance = balance;
      lowestDate = date;
    }
    if (shortageDate === null && balance < ZERO) {
      shortageDate = date;
    }

    daily.push({
      date,
      openingBalance: formatMoney(dayOpening),
      incoming: formatMoney(incoming),
      outgoing: formatMoney(outgoing),
      net: formatMoney(incoming - outgoing),
      projectedBalance: formatMoney(balance),
      cumulativeIncoming: formatMoney(cumulativeIncoming),
      cumulativeOutgoing: formatMoney(cumulativeOutgoing),
    });
  }

  const expectedIncoming = sumMinor(
    incomingItems.map((item) => parseMoney(item.amount)),
  );
  const expectedOutgoing = sumMinor(
    outgoingItems.map((item) => parseMoney(item.amount)),
  );
  const projectedEndingBalance = balance;

  const overdueIncoming = sumMinor(
    incomingItems
      .filter((item) => item.isOverdue)
      .map((item) => parseMoney(item.amount)),
  );
  const overdueOutgoing = sumMinor(
    outgoingItems
      .filter((item) => item.isOverdue)
      .map((item) => parseMoney(item.amount)),
  );

  const monthly = aggregateMonths(daily);
  const weekly = aggregateWeeks(daily, startDate, endDate);

  const excludedInvoices: ForecastExcludedInvoices = {
    count: excludedCount,
    byCurrency: Object.fromEntries(
      [...excludedByCurrency.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([currency, amount]) => [currency, formatMoney(amount)]),
    ),
    currencies: [...excludedByCurrency.keys()].sort(),
  };

  return {
    currency: input.currency,
    timezone: input.timezone,
    horizonDays: input.horizonDays,
    startDate,
    endDate,
    today,
    calculatedAt: input.calculatedAt,
    openingBalance: formatMoney(openingMinor),
    expectedIncoming: formatMoney(expectedIncoming),
    expectedOutgoing: formatMoney(expectedOutgoing),
    netCashFlow: formatMoney(expectedIncoming - expectedOutgoing),
    projectedEndingBalance: formatMoney(projectedEndingBalance),
    lowestProjectedBalance: formatMoney(lowestBalance),
    lowestProjectedDate: lowestDate,
    shortageDate,
    becomesNegative: lowestBalance < ZERO,
    counts: {
      incoming: incomingItems.length,
      outgoing: outgoingItems.length,
      excludedInvoices: excludedCount,
    },
    overdue: {
      incoming: formatMoney(overdueIncoming),
      outgoing: formatMoney(overdueOutgoing),
      incomingCount: incomingItems.filter((item) => item.isOverdue).length,
      outgoingCount: outgoingItems.filter((item) => item.isOverdue).length,
    },
    excludedInvoices,
    incoming: incomingItems,
    outgoing: outgoingItems,
    daily,
    weekly,
    monthly,
  };
}

/** Calendar-month buckets (YYYY-MM), zero-filled by the daily series. */
export function aggregateMonths(daily: readonly ForecastDay[]): ForecastMonth[] {
  const months: ForecastMonth[] = [];
  for (const day of daily) {
    const month = day.date.slice(0, 7);
    const last = months[months.length - 1];
    if (last && last.month === month) {
      last.incoming = formatMoney(parseMoney(last.incoming) + parseMoney(day.incoming));
      last.outgoing = formatMoney(parseMoney(last.outgoing) + parseMoney(day.outgoing));
      last.net = formatMoney(parseMoney(last.incoming) - parseMoney(last.outgoing));
      last.closingBalance = day.projectedBalance;
      last.cumulativeIncoming = day.cumulativeIncoming;
      last.cumulativeOutgoing = day.cumulativeOutgoing;
    } else {
      months.push({
        month,
        incoming: day.incoming,
        outgoing: day.outgoing,
        net: day.net,
        closingBalance: day.projectedBalance,
        cumulativeIncoming: day.cumulativeIncoming,
        cumulativeOutgoing: day.cumulativeOutgoing,
      });
    }
  }
  return months;
}

/** Monday-based calendar weeks clipped to the forecast window. */
export function aggregateWeeks(
  daily: readonly ForecastDay[],
  startDate: string,
  endDate: string,
): ForecastWeek[] {
  const weeks: ForecastWeek[] = [];
  for (const day of daily) {
    const bucket = bucketStart(day.date, "week");
    const weekStart = bucket < startDate ? startDate : bucket;
    const weekEndCandidate = addDays(bucket, 6);
    const weekEnd = weekEndCandidate > endDate ? endDate : weekEndCandidate;

    const last = weeks[weeks.length - 1];
    if (last && last.weekStart === weekStart) {
      last.incoming = formatMoney(parseMoney(last.incoming) + parseMoney(day.incoming));
      last.outgoing = formatMoney(parseMoney(last.outgoing) + parseMoney(day.outgoing));
      last.net = formatMoney(parseMoney(last.incoming) - parseMoney(last.outgoing));
      last.closingBalance = day.projectedBalance;
    } else {
      weeks.push({
        weekStart,
        weekEnd,
        incoming: day.incoming,
        outgoing: day.outgoing,
        net: day.net,
        closingBalance: day.projectedBalance,
      });
    }
  }
  return weeks;
}

/** Defensive eligibility helpers, shared with tests and documentation. */
export function isForecastableInvoiceStatus(status: string): boolean {
  return FORECASTABLE_INVOICE_STATUSES.has(status);
}

export function isForecastableExpenseStatus(status: string): boolean {
  return FORECASTABLE_EXPENSE_STATUSES.has(status);
}
