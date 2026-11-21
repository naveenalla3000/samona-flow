// The invoice lifecycle rules, in one place. The PRD defines statuses and
// status rules but no explicit transition matrix, so this conservative matrix
// is documented in README:
//   - DRAFT is the only editable status.
//   - SEND: DRAFT -> SENT only.
//   - VOID: SENT / PARTIALLY_PAID / OVERDUE -> VOID only. DRAFT and PAID can
//     never be voided; there is no un-send, un-void or edit-after-issue path.
//   - PARTIALLY_PAID and PAID are payment-derived and are never set by this
//     module (payment management is out of scope).
//   - OVERDUE is a display derivation from the business-local date, not a
//     manually set status.
import { parseSignedMoney } from "@/lib/invoice-math";
import type { InvoiceStatusValue } from "@/types/invoice";

export const EDITABLE_STATUSES: readonly InvoiceStatusValue[] = ["DRAFT"];
export const VOIDABLE_STATUSES: readonly InvoiceStatusValue[] = [
  "SENT",
  "PARTIALLY_PAID",
  "OVERDUE",
];

export function canEditInvoice(status: InvoiceStatusValue): boolean {
  return EDITABLE_STATUSES.includes(status);
}

export function canSendInvoice(status: InvoiceStatusValue): boolean {
  return status === "DRAFT";
}

export function canVoidInvoice(status: InvoiceStatusValue): boolean {
  return VOIDABLE_STATUSES.includes(status);
}

/**
 * PRD §FR-04: a sent invoice becomes overdue when its due date passes and an
 * amount remains outstanding. Calculated from the business-local date, never
 * from a UTC timestamp comparison or a manually updated stored status.
 */
export function deriveDisplayStatus(
  status: InvoiceStatusValue,
  dueDate: string,
  outstandingAmount: string,
  businessLocalDate: string,
): InvoiceStatusValue {
  if (
    (status === "SENT" || status === "PARTIALLY_PAID") &&
    dueDate < businessLocalDate &&
    parseSignedMoney(outstandingAmount) > BigInt(0)
  ) {
    return "OVERDUE";
  }
  return status;
}
