// Centralized invoice money arithmetic.
//
// Amounts are handled as integer minor units (paise/cents) with BigInt. This is
// exact fixed-point decimal arithmetic: there is no floating-point operation
// anywhere in the calculation path. The same module is used by the server (the
// authoritative calculation) and by the client draft preview, so the formula
// exists in exactly one place (PRD §7.3: no duplicated financial logic).
//
// Rounding rule (documented in README): each line total is rounded HALF_UP to
// 2 decimal places before it is added to the subtotal, matching the applied DB
// CHECK `line_total = ROUND(quantity * unit_price, 2)`. The subtotal is the sum
// of the rounded line totals; discount and tax are already 2dp values. Total =
// subtotal - discount + tax.

const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;
const SIGNED_MONEY_PATTERN = /^-?\d+(\.\d{1,2})?$/;
// BigInt literals require ES2020; the project targets ES2017.
const ZERO = BigInt(0);
const HUNDRED = BigInt(100);
const TWO = BigInt(2);

/** Parse a validated 2dp decimal string into integer minor units. */
export function parseMoney(value: string): bigint {
  if (!MONEY_PATTERN.test(value)) {
    throw new Error(`Invalid money value: ${value}`);
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole ?? "0") * HUNDRED + BigInt((fraction + "00").slice(0, 2));
}

/**
 * Parse a potentially negative derived amount (totals before validation and
 * outstanding balances). Input validation always uses the non-negative parser.
 */
export function parseSignedMoney(value: string): bigint {
  if (!SIGNED_MONEY_PATTERN.test(value)) {
    throw new Error(`Invalid signed money value: ${value}`);
  }
  const negative = value.startsWith("-");
  const magnitude = parseMoney(negative ? value.slice(1) : value);
  return negative ? -magnitude : magnitude;
}

/** Format integer minor units as a canonical 2dp decimal string. */
export function formatMoney(cents: bigint): string {
  const negative = cents < ZERO;
  const absolute = negative ? -cents : cents;
  const whole = absolute / HUNDRED;
  const fraction = absolute % HUNDRED;
  return `${negative ? "-" : ""}${whole}.${fraction.toString().padStart(2, "0")}`;
}

/** Divide integers with HALF_UP rounding (denominator is always positive here). */
function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * TWO >= denominator ? quotient + BigInt(1) : quotient;
}

/**
 * quantity and unitPrice are validated decimal strings with at most 2dp.
 * (Q/100) * (P/100) = (Q*P)/10000; rounding to cents is round(Q*P/100).
 */
export function lineTotalCents(quantity: string, unitPrice: string): bigint {
  return roundHalfUp(parseMoney(quantity) * parseMoney(unitPrice), HUNDRED);
}

export interface BillableLine {
  quantity: string;
  unitPrice: string;
}

export interface InvoiceTotals {
  /** All four are canonical decimal strings with exactly 2 decimal places. */
  subtotal: string;
  discount: string;
  tax: string;
  totalAmount: string;
}

/**
 * Recompute every authoritative money field from validated client inputs.
 * The client never submits subtotal, lineTotal or totalAmount.
 */
export function calculateInvoiceTotals(
  items: readonly BillableLine[],
  discount: string,
  tax: string,
): InvoiceTotals {
  const subtotal = items.reduce(
    (sum, item) => sum + lineTotalCents(item.quantity, item.unitPrice),
    ZERO,
  );
  const discountCents = parseMoney(discount);
  const taxCents = parseMoney(tax);
  return {
    subtotal: formatMoney(subtotal),
    discount: formatMoney(discountCents),
    tax: formatMoney(taxCents),
    totalAmount: formatMoney(subtotal - discountCents + taxCents),
  };
}

/** The largest value representable by the schema's Decimal(12, 2) columns. */
export const MAX_MONEY_CENTS = BigInt("999999999999");
