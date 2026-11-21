// Serializable shapes for Payment Management. Money is always a canonical 2dp
// decimal string; payment status is derived from the append-only reversal rows.
import type { InvoiceStatusValue } from "@/types/invoice";
import type { PaymentMethodValue } from "@/lib/payment-status";

export type PaymentStatusValue = "RECORDED" | "REVERSED";

export type PaymentReversalRecord = {
  id: string;
  businessId: string;
  paymentId: string;
  reversedById: string;
  reversedByEmail: string | null;
  reason: string;
  reversedAt: string;
  createdAt: string;
};

export type PaymentRecord = {
  id: string;
  businessId: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerCompanyName: string | null;
  amount: string;
  paymentDate: string;
  method: PaymentMethodValue;
  transactionReference: string | null;
  notes: string | null;
  /** Snapshot from the invoice; Payment has no currency column of its own. */
  currency: string;
  status: PaymentStatusValue;
  reversal: PaymentReversalRecord | null;
  createdAt: string;
};

export type PaymentInvoiceSummary = {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatusValue;
  displayStatus: InvoiceStatusValue;
  currency: string;
  dueDate: string;
  totalAmount: string;
  amountPaid: string;
  outstandingAmount: string;
};

/** Used by the service for pre-flight checks and by the UI for context. */
export type PaymentInvoiceContext = PaymentInvoiceSummary & {
  businessId: string;
  customerId: string;
  customerName: string;
  customerCompanyName: string | null;
};

export type PaymentDetail = PaymentRecord & {
  invoice: PaymentInvoiceSummary;
};

export type PaymentListResult = {
  items: PaymentRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
