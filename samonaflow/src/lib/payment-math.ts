// Centralized payment arithmetic. Like invoice-math.ts, this uses integer
// minor units (BigInt) so no JavaScript floating-point operation is ever part
// of a financial calculation. Inputs are canonical 2dp decimal strings.
//
// Rounding: payments are validated to at most two decimal places and stored in
// Decimal(12, 2), so no rounding is needed when they are summed. All outputs
// are canonical 2dp strings. A reversed payment is retained in history but
// excluded from the effective paid total, matching the schema comment and the
// invoice module's existing calculation.
import { formatMoney, parseMoney, parseSignedMoney } from "@/lib/invoice-math";
import type { InvoiceStatusValue } from "@/types/invoice";

const ZERO = BigInt(0);

export interface PaymentAmount {
  /** Optional stable id, used when a specific payment is reversed. */
  id?: string;
  /** Canonical 2dp decimal string. */
  amount: string;
  reversed: boolean;
}

export function activePaidCents(payments: readonly PaymentAmount[]): bigint {
  return payments.reduce(
    (sum, payment) =>
      payment.reversed ? sum : sum + parseMoney(payment.amount),
    ZERO,
  );
}

export function outstandingCents(
  totalAmount: string,
  payments: readonly PaymentAmount[],
): bigint {
  return parseSignedMoney(totalAmount) - activePaidCents(payments);
}

export interface PaymentSummary {
  amountPaid: string;
  outstandingAmount: string;
}

export function calculatePaymentSummary(
  totalAmount: string,
  payments: readonly PaymentAmount[],
): PaymentSummary {
  return {
    amountPaid: formatMoney(activePaidCents(payments)),
    outstandingAmount: formatMoney(outstandingCents(totalAmount, payments)),
  };
}

/**
 * derive the stored status from effective receipts. `fallback` is used when
 * nothing is currently paid; it preserves SENT/OVERDUE instead of inventing a
 * payment-derived status. PARTIALLY_PAID and PAID are service-owned.
 */
export function derivePaymentStatus(
  totalAmount: string,
  payments: readonly PaymentAmount[],
  fallback: Extract<InvoiceStatusValue, "SENT" | "OVERDUE"> = "SENT",
  ): InvoiceStatusValue {
  const paid = activePaidCents(payments);
  const total = parseSignedMoney(totalAmount);
  if (paid >= total) return "PAID";
  if (paid > ZERO) return "PARTIALLY_PAID";
  return fallback;
}

/** True when another payment of `amount` fits within the current outstanding balance. */
export function paymentFitsOutstanding(
  amount: string,
  totalAmount: string,
  payments: readonly PaymentAmount[],
): boolean {
  return parseMoney(amount) <= outstandingCents(totalAmount, payments);
}
