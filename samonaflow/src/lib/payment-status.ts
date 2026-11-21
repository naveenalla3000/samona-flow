// Payment domain rules. The PRD defines payment fields and supported payment
// methods but not an explicit payment lifecycle, so these conservative rules
// are documented in README and reused by services, repositories and the UI.
import type { InvoiceStatusValue } from "@/types/invoice";

export const PAYMENT_METHODS = ["UPI", "BANK_TRANSFER", "CASH", "OTHER"] as const;
export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];

export const RECORDABLE_STATUSES: readonly InvoiceStatusValue[] = [
  "SENT",
  "PARTIALLY_PAID",
  "OVERDUE",
];

// A reversal on a VOID invoice would effectively reopen it. DRAFT invoices
// cannot have payments in the first place.
export const REVERSIBLE_STATUSES: readonly InvoiceStatusValue[] = [
  "SENT",
  "PARTIALLY_PAID",
  "OVERDUE",
  "PAID",
];

export function canRecordPayment(status: InvoiceStatusValue): boolean {
  return RECORDABLE_STATUSES.includes(status);
}

export function canReversePayment(status: InvoiceStatusValue): boolean {
  return REVERSIBLE_STATUSES.includes(status);
}
