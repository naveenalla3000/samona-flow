// Reminder domain rules, in one place. PRD §FR-07 defines four reminder
// categories and three history states, but no automatic processing or delivery.
// The applied schema mirrors that: DRAFTED -> WHATSAPP_OPENED -> MARKED_SENT,
// where opening WhatsApp is NOT delivery and only the owner marks sent.
// There is no CANCELLED/FAILED state and no scheduled timestamp — only the
// nullable DATE followUpDate — so those concepts are intentionally absent.
import type { ReminderFollowUpState, ReminderStatusValue } from "@/types/reminder";

export const REMINDER_TYPES = [
  "UPCOMING_PAYMENT",
  "DUE_TODAY",
  "OVERDUE_PAYMENT",
  "FINAL_FOLLOW_UP",
] as const;

export type ReminderTypeValue = (typeof REMINDER_TYPES)[number];

export const REMINDER_TYPE_LABELS: Record<ReminderTypeValue, string> = {
  UPCOMING_PAYMENT: "Upcoming payment",
  DUE_TODAY: "Due today",
  OVERDUE_PAYMENT: "Overdue payment",
  FINAL_FOLLOW_UP: "Final follow-up",
};

export const REMINDER_STATUS_LABELS: Record<ReminderStatusValue, string> = {
  DRAFTED: "Draft generated",
  WHATSAPP_OPENED: "WhatsApp opened",
  MARKED_SENT: "Marked sent",
};

/**
 * A draft may be fully edited. Once the WhatsApp link has been opened the
 * message is history, so only the next follow-up date may be rescheduled.
 * MARKED_SENT is terminal: no edit, reschedule or regression is permitted.
 */
export function canEditMessage(status: ReminderStatusValue): boolean {
  return status === "DRAFTED";
}

export function canReschedule(status: ReminderStatusValue): boolean {
  return status === "DRAFTED" || status === "WHATSAPP_OPENED";
}

export function canMarkWhatsappOpened(status: ReminderStatusValue): boolean {
  return status === "DRAFTED";
}

export function canMarkSent(status: ReminderStatusValue): boolean {
  return status === "DRAFTED" || status === "WHATSAPP_OPENED";
}

/** Suggested category for an invoice, used only to pre-select the form field. */
export function suggestReminderType(
  invoiceDueDate: string,
  businessLocalDate: string,
): ReminderTypeValue {
  if (invoiceDueDate < businessLocalDate) return "OVERDUE_PAYMENT";
  if (invoiceDueDate === businessLocalDate) return "DUE_TODAY";
  return "UPCOMING_PAYMENT";
}

/** Date-derived follow-up urgency for badges and filters. */
export function deriveFollowUpState(
  status: ReminderStatusValue,
  followUpDate: string | null,
  businessLocalDate: string,
): ReminderFollowUpState {
  if (!followUpDate || status === "MARKED_SENT") return "NONE";
  if (followUpDate < businessLocalDate) return "OVERDUE";
  if (followUpDate === businessLocalDate) return "DUE_TODAY";
  return "UPCOMING";
}
