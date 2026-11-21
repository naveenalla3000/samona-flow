// Shared, serializable shapes for the Customer Management module.
// Money is represented as a decimal string so values never lose precision in
// JSON. Dates are ISO strings (dates without time use YYYY-MM-DD).

export type CustomerRecord = {
  id: string;
  businessId: string;
  name: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  address: string | null;
  notes: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerListItem = CustomerRecord & {
  invoiceCount: number;
};

export type CustomerFinancialSummary = {
  totalInvoiced: string;
  totalPaymentsReceived: string;
  outstandingAmount: string;
  invoiceCount: number;
  overdueInvoiceCount: number;
};

export type CustomerInvoiceHistoryItem = {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  status: string;
  totalAmount: string;
  amountPaid: string;
  outstandingAmount: string;
};

export type CustomerDetail = CustomerRecord & {
  financials: CustomerFinancialSummary;
  invoices: CustomerInvoiceHistoryItem[];
};

export type CustomerListResult = {
  items: CustomerListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
