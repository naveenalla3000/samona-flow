// Shared, serializable shapes for Reminder Management (PRD FR-07). Reminder
// statuses are the three values defined by the schema: a draft is generated,
// opening WhatsApp is recorded separately, and only the owner can mark sent.
// There is deliberately no DELIVERED/FAILED/CANCELLED value: the schema does
// not have one and PRD §FR-07 forbids claiming automatic delivery.
import type { ReminderTypeValue } from "@/lib/reminder-status";

export type ReminderStatusValue = "DRAFTED" | "WHATSAPP_OPENED" | "MARKED_SENT";

/** Derived from the business-local date; never stored. */
export type ReminderFollowUpState = "NONE" | "OVERDUE" | "DUE_TODAY" | "UPCOMING";

export type ReminderRecord = {
  id: string;
  businessId: string;
  customerId: string;
  invoiceId: string;
  customerName: string;
  invoiceNumber: string;
  reminderType: ReminderTypeValue;
  status: ReminderStatusValue;
  /** Server-generated from the invoice/customer snapshot; never client-trusted. */
  message: string;
  followUpDate: string | null;
  followUpState: ReminderFollowUpState;
  invoiceDueDate: string;
  invoiceOverdue: boolean;
  /** wa.me click-to-chat URL, or null when the customer has no usable phone. */
  whatsappUrl: string | null;
  currency: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
};

export type ReminderDetail = ReminderRecord;

export type ReminderListResult = {
  items: ReminderRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/** Minimal, business-verified snapshot used to generate a reminder message. */
export type ReminderContext = {
  customer: { id: string; name: string; phone: string | null };
  invoice: {
    id: string;
    invoiceNumber: string;
    dueDate: string;
    outstandingAmount: string;
    currency: string;
    status: string;
    displayStatus: string;
  };
  timezone: string;
};
