// Server-side generation of PRD §FR-07 reminder text. The content is derived
// exclusively from a business-verified invoice/customer snapshot, so a client
// can never inject its own amount or due date into a reminder. The generated
// text is stored with the reminder and reused verbatim for copy/WhatsApp.
import type { ReminderTypeValue } from "@/lib/reminder-status";
import type { ReminderContext } from "@/types/reminder";

/** PostgreSQL DATE values are UTC midnights; format them without TZ drift. */
function friendlyDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

/**
 * Every category includes the customer name, invoice number, amount and due
 * date (PRD acceptance criteria). `outstandingAmount` is used rather than the
 * original total so partially paid invoices are not over-claimed.
 */
export function generateReminderMessage(
  reminderType: ReminderTypeValue,
  context: ReminderContext,
): string {
  const { customer, invoice } = context;
  const amount = `${invoice.currency} ${invoice.outstandingAmount}`;
  const reference = `This is a friendly reminder regarding invoice ${invoice.invoiceNumber} for ${amount}.`;
  const due = `The payment was due on ${friendlyDate(invoice.dueDate)} (${invoice.dueDate}).`;

  switch (reminderType) {
    case "UPCOMING_PAYMENT":
      return [
        `Hi ${customer.name},`,
        `This is a friendly heads-up regarding invoice ${invoice.invoiceNumber} for ${amount}.`,
        `The payment is due on ${friendlyDate(invoice.dueDate)} (${invoice.dueDate}).`,
        "Could you please let us know when we can expect payment?",
        "Thank you!",
      ].join("\n\n");
    case "DUE_TODAY":
      return [
        `Hi ${customer.name},`,
        reference,
        `The payment is due today, ${friendlyDate(invoice.dueDate)} (${invoice.dueDate}).`,
        "Could you please share an update on the expected payment date?",
        "Thank you!",
      ].join("\n\n");
    case "OVERDUE_PAYMENT":
      return [
        `Hi ${customer.name},`,
        reference,
        due,
        "The amount still appears outstanding. Could you please share an update on the expected payment date?",
        "Thank you!",
      ].join("\n\n");
    case "FINAL_FOLLOW_UP":
      return [
        `Hi ${customer.name},`,
        `This is our final follow-up regarding invoice ${invoice.invoiceNumber} for ${amount}.`,
        due,
        "Please share an update on the expected payment date or let us know if there is an issue.",
        "Thank you!",
      ].join("\n\n");
  }
}

/**
 * PRD §FR-07: a `https://wa.me/` click-to-chat link only. It opens WhatsApp
 * with a prefilled message; the owner sends it manually. There is no API call,
 * webhook, credential or delivery assertion. Returns null when the customer
 * has no usable phone number, and never logs the phone or message.
 */
export function whatsappClickToChatUrl(phone: string | null, message: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
