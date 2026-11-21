// Dashboard metric definitions. These are PRD §10.1 definitions.
// Available cash is a manual position, not a bank balance.
// Net cash movement is not profit.
//
// Pure functions only: no database access and no I/O. Dates are business-local
// calendar strings ('YYYY-MM-DD') and all calendar math is UTC arithmetic on
// those strings, so the host timezone never affects a result. Money is integer
// minor units (BigInt); no Number or floating-point arithmetic touches money.
// BigInt literals need ES2020 and the project targets ES2017, so BigInt(0) is used.

export type BucketGranularity = "day" | "week" | "month";
export type DashboardPreset =
  | "last_30_days"
  | "last_90_days"
  | "this_month"
  | "last_month"
  | "year_to_date";
export type ReminderClassification = "overdue" | "upcoming" | "later";

export interface CurrencyAmount {
  currency: string;
  amount: bigint;
}

export interface HeadlineTotals {
  headline: bigint;
  byCurrency: Record<string, bigint>;
  excludedCount: number;
}

const ZERO = BigInt(0);
const DAY_MS = 86400000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function invalidRequest(message: string): Error {
  const error = new Error(message) as Error & { code: string };
  error.code = "invalid_request";
  return error;
}

function parseDate(date: string): { year: number; month: number; day: number } {
  const match = DATE_PATTERN.exec(date);
  if (!match) {
    throw invalidRequest(`Invalid business date: ${date}`);
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

// Milliseconds at 00:00 UTC for a calendar date. setUTCFullYear avoids the
// Date.UTC two-digit-year quirk for years 0-99.
function utcMs(date: string): number {
  const { year, month, day } = parseDate(date);
  const value = new Date(0);
  value.setUTCFullYear(year, month - 1, day);
  return value.getTime();
}

function fromUtcMs(ms: number): string {
  const value = new Date(ms);
  const year = String(value.getUTCFullYear()).padStart(4, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Add n calendar days (n may be negative) to a business-local date. */
export function addDays(date: string, n: number): string {
  return fromUtcMs(utcMs(date) + n * DAY_MS);
}

/** Calendar days from `from` to `to` (to minus from; may be negative). */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcMs(to) - utcMs(from)) / DAY_MS);
}

/** Inclusive range check on business-local date strings. */
export function isInRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

/** Start of the bucket containing `date`. Weeks start on Monday; months start on the 1st. */
export function bucketStart(date: string, granularity: BucketGranularity): string {
  switch (granularity) {
    case "day":
      return date;
    case "week": {
      // getUTCDay: 0 = Sunday. Monday-based offset: Monday = 0, Sunday = 6.
      const dayOfWeek = new Date(utcMs(date)).getUTCDay();
      return addDays(date, -((dayOfWeek + 6) % 7));
    }
    case "month": {
      const { year, month } = parseDate(date);
      return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
    }
    default:
      throw invalidRequest(`Unknown granularity: ${String(granularity)}`);
  }
}

function nextBucket(start: string, granularity: BucketGranularity): string {
  switch (granularity) {
    case "day":
      return addDays(start, 1);
    case "week":
      return addDays(start, 7);
    case "month": {
      const { year, month } = parseDate(start);
      const nextYear = month === 12 ? year + 1 : year;
      const nextMonth = month === 12 ? 1 : month + 1;
      return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`;
    }
    default:
      throw invalidRequest(`Unknown granularity: ${String(granularity)}`);
  }
}

/** Gap-free bucket start dates covering from..to inclusive. Empty when from > to. */
export function buildBuckets(
  from: string,
  to: string,
  granularity: BucketGranularity,
): string[] {
  const buckets: string[] = [];
  if (from > to) {
    return buckets;
  }
  let current = bucketStart(from, granularity);
  while (current <= to) {
    buckets.push(current);
    current = nextBucket(current, granularity);
  }
  return buckets;
}

/** Resolve a named dashboard preset to an inclusive business-local date range. */
export function resolvePreset(
  preset: DashboardPreset,
  today: string,
): { from: string; to: string } {
  const { year, month } = parseDate(today);
  const firstOfThisMonth = bucketStart(today, "month");
  switch (preset) {
    case "last_30_days":
      return { from: addDays(today, -29), to: today };
    case "last_90_days":
      return { from: addDays(today, -89), to: today };
    case "this_month":
      return { from: firstOfThisMonth, to: today };
    case "last_month": {
      const lastYear = month === 1 ? year - 1 : year;
      const lastMonth = month === 1 ? 12 : month - 1;
      const first = `${String(lastYear).padStart(4, "0")}-${String(lastMonth).padStart(2, "0")}-01`;
      return { from: first, to: addDays(firstOfThisMonth, -1) };
    }
    case "year_to_date":
      return { from: `${String(year).padStart(4, "0")}-01-01`, to: today };
    default:
      throw invalidRequest(`Unknown preset: ${String(preset)}`);
  }
}

/** Throws an invalid_request error when from > to or the inclusive span exceeds maxDays. */
export function assertSpan(from: string, to: string, maxDays = 366): void {
  if (from > to) {
    throw invalidRequest(`Invalid span: from ${from} is after to ${to}`);
  }
  const inclusiveDays = daysBetween(from, to) + 1;
  if (inclusiveDays > maxDays) {
    throw invalidRequest(
      `Span of ${inclusiveDays} days exceeds the maximum of ${maxDays}`,
    );
  }
}

/** Reminder bucket relative to today: overdue, due within the next 6 days, or later. */
export function classifyReminder(
  followUpDate: string,
  today: string,
): ReminderClassification {
  if (followUpDate < today) {
    return "overdue";
  }
  if (followUpDate <= addDays(today, 6)) {
    return "upcoming";
  }
  return "later";
}

/** True when an expense is due today or within the next 30 days. */
export function isUpcomingExpenseWindow(dueDate: string, today: string): boolean {
  return dueDate >= today && dueDate <= addDays(today, 30);
}

export function sumMinor(amounts: bigint[]): bigint {
  return amounts.reduce((sum, amount) => sum + amount, ZERO);
}

export function groupByCurrency(rows: CurrencyAmount[]): Record<string, bigint> {
  const totals: Record<string, bigint> = {};
  for (const row of rows) {
    totals[row.currency] = (totals[row.currency] ?? ZERO) + row.amount;
  }
  return totals;
}

/**
 * Headline total sums only rows in the business currency. byCurrency covers all
 * rows; other currencies are counted in excludedCount and never added to the headline.
 */
export function headlineTotals(
  rows: CurrencyAmount[],
  businessCurrency: string,
): HeadlineTotals {
  const businessRows = rows.filter((row) => row.currency === businessCurrency);
  return {
    headline: sumMinor(businessRows.map((row) => row.amount)),
    byCurrency: groupByCurrency(rows),
    excludedCount: rows.length - businessRows.length,
  };
}

/** Net cash movement for a period. This is income minus expenses, not profit. */
export function netCashMovement(income: bigint, expenses: bigint): bigint {
  return income - expenses;
}

/**
 * Available cash is a manual position (opening balance plus movements recorded
 * since), not a bank balance.
 */
export function availableCash(
  openingBalanceMinor: bigint,
  incomeSinceOpening: bigint,
  expensesSinceOpening: bigint,
): bigint {
  return openingBalanceMinor + incomeSinceOpening - expensesSinceOpening;
}

/**
 * Mirrors deriveDisplayStatus in src/lib/invoice-status.ts. A SENT or
 * PARTIALLY_PAID invoice is overdue when dueDate < today and outstanding > 0.
 * A stored OVERDUE status passes through as overdue, matching deriveDisplayStatus,
 * which returns the stored status unchanged in that case.
 */
export function isOverdueDisplay(
  status: string,
  dueDate: string,
  outstanding: bigint,
  today: string,
): boolean {
  if (status === "OVERDUE") {
    return true;
  }
  return (
    (status === "SENT" || status === "PARTIALLY_PAID") &&
    dueDate < today &&
    outstanding > ZERO
  );
}
