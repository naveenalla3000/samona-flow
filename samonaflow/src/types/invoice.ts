// Shared, serializable shapes for the Invoice Management module.
// Money is a decimal string with exactly 2 places so JSON never loses precision.
// Dates without a time are YYYY-MM-DD; timestamps are ISO strings.

export type InvoiceStatusValue =
  | "DRAFT"
  | "SENT"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERDUE"
  | "VOID";

export type InvoiceItemRecord = {
  id: string;
  businessId: string;
  invoiceId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  position: number;
  createdAt: string;
};

export type InvoiceRecord = {
  id: string;
  businessId: string;
  customerId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  expectedPaymentDate: string | null;
  status: InvoiceStatusValue;
  /** PRD-derived display status: SENT/PARTIALLY_PAID become OVERDUE when past due. */
  displayStatus: InvoiceStatusValue;
  subtotal: string;
  discount: string;
  tax: string;
  totalAmount: string;
  amountPaid: string;
  outstandingAmount: string;
  currency: string;
  notes: string | null;
  isEditable: boolean;
  createdAt: string;
  updatedAt: string;
};

export type InvoiceListItem = InvoiceRecord & {
  customerName: string;
  customerCompanyName: string | null;
};

export type InvoiceDetail = InvoiceRecord & {
  items: InvoiceItemRecord[];
  customer: {
    id: string;
    name: string;
    companyName: string | null;
    email: string | null;
    phone: string | null;
  };
};

export type InvoiceListResult = {
  items: InvoiceListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type InvoiceBusinessProfile = {
  name: string;
  ownerName: string;
  email: string;
  phone: string | null;
  currency: string;
  timezone: string;
};
