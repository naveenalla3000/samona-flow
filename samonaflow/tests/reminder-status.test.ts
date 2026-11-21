import assert from "node:assert/strict";
import test from "node:test";
import { generateReminderMessage, whatsappClickToChatUrl } from "@/lib/reminder-message";
import {
  REMINDER_TYPES,
  canEditMessage,
  canMarkSent,
  canMarkWhatsappOpened,
  canReschedule,
  deriveFollowUpState,
  suggestReminderType,
} from "@/lib/reminder-status";
import { makeReminderContext } from "./helpers/reminder-fakes";

test("PRD categories and three-state history matrix", () => {
  assert.deepEqual([...REMINDER_TYPES], [
    "UPCOMING_PAYMENT",
    "DUE_TODAY",
    "OVERDUE_PAYMENT",
    "FINAL_FOLLOW_UP",
  ]);
  assert.equal(canEditMessage("DRAFTED"), true);
  assert.equal(canEditMessage("WHATSAPP_OPENED"), false);
  assert.equal(canReschedule("WHATSAPP_OPENED"), true);
  assert.equal(canReschedule("MARKED_SENT"), false);
  assert.equal(canMarkWhatsappOpened("DRAFTED"), true);
  assert.equal(canMarkWhatsappOpened("MARKED_SENT"), false);
  assert.equal(canMarkSent("DRAFTED"), true);
  assert.equal(canMarkSent("WHATSAPP_OPENED"), true);
  assert.equal(canMarkSent("MARKED_SENT"), false);
});

test("follow-up urgency is derived from the business-local date", () => {
  assert.equal(deriveFollowUpState("DRAFTED", "2026-06-14", "2026-06-15"), "OVERDUE");
  assert.equal(deriveFollowUpState("DRAFTED", "2026-06-15", "2026-06-15"), "DUE_TODAY");
  assert.equal(deriveFollowUpState("DRAFTED", "2026-06-16", "2026-06-15"), "UPCOMING");
  assert.equal(deriveFollowUpState("DRAFTED", null, "2026-06-15"), "NONE");
  // A sent reminder is history, not an overdue item.
  assert.equal(deriveFollowUpState("MARKED_SENT", "2026-01-01", "2026-06-15"), "NONE");
});

test("suggested category follows the invoice due date", () => {
  assert.equal(suggestReminderType("2026-06-10", "2026-06-15"), "OVERDUE_PAYMENT");
  assert.equal(suggestReminderType("2026-06-15", "2026-06-15"), "DUE_TODAY");
  assert.equal(suggestReminderType("2026-06-20", "2026-06-15"), "UPCOMING_PAYMENT");
});

test("generated text includes customer, invoice, outstanding amount and due date", () => {
  const context = makeReminderContext();
  for (const type of REMINDER_TYPES) {
    const message = generateReminderMessage(type, context);
    assert.match(message, /Rahul/);
    assert.match(message, /INV-102/);
    assert.match(message, /INR 20000\.00/);
    assert.match(message, /10 June/);
    assert.match(message, /2026-06-10/);
    assert.match(message, /Thank you!/);
  }
});

test("WhatsApp helper is a click-to-chat link only; no phone means no link", () => {
  const url = whatsappClickToChatUrl("+91 98765 43210", "Hi Rahul");
  assert.ok(url?.startsWith("https://wa.me/919876543210?text="));
  assert.match(url!, /Hi%20Rahul/);
  assert.equal(whatsappClickToChatUrl(null, "Hi"), null);
  assert.equal(whatsappClickToChatUrl("123", "Hi"), null);
  assert.doesNotMatch(url!, /api|send|deliver/i);
});
