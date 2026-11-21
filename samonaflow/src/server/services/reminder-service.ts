// Server-only application service for Reminder Management (PRD FR-07).
// Authorization is enforced here on every operation from the verified session
// identity. Customer/invoice references are checked against the authenticated
// business before a message is generated, and no client-supplied derived value
// (message, status, WhatsApp URL, currency) is ever persisted. There is no
// delivery job: the only state changes are the owner opening the click-to-chat
// link and manually marking the reminder as sent.
import { parseSignedMoney } from "@/lib/invoice-math";
import { generateReminderMessage } from "@/lib/reminder-message";
import {
  canEditMessage,
  canMarkSent,
  canMarkWhatsappOpened,
  canReschedule,
} from "@/lib/reminder-status";
import type {
  CreateReminderInput,
  ListRemindersQuery,
  UpdateReminderInput,
} from "@/lib/validations/reminder";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import {
  prismaBusinessMembershipRepository,
  type BusinessMembershipRepository,
} from "@/server/repositories/business-membership-repository";
import {
  prismaReminderRepository,
  type ReminderRepository,
} from "@/server/repositories/reminder-repository";
import type { ReminderDetail, ReminderListResult, ReminderRecord } from "@/types/reminder";

export type ReminderServiceErrorCode =
  | "BUSINESS_FORBIDDEN"
  | "REMINDER_CONTEXT_NOT_FOUND"
  | "REMINDER_NOT_FOUND"
  | "INVALID_TRANSITION";

export class ReminderServiceError extends Error {
  readonly code: ReminderServiceErrorCode;

  constructor(code: ReminderServiceErrorCode, message: string) {
    super(message);
    this.name = "ReminderServiceError";
    this.code = code;
  }
}

export interface ReminderService {
  create(
    user: AuthenticatedUser,
    businessId: string,
    input: CreateReminderInput,
  ): Promise<ReminderRecord>;
  list(
    user: AuthenticatedUser,
    businessId: string,
    query: ListRemindersQuery,
  ): Promise<ReminderListResult>;
  get(user: AuthenticatedUser, businessId: string, reminderId: string): Promise<ReminderDetail>;
  update(
    user: AuthenticatedUser,
    businessId: string,
    reminderId: string,
    input: UpdateReminderInput,
  ): Promise<ReminderRecord>;
  markWhatsappOpened(
    user: AuthenticatedUser,
    businessId: string,
    reminderId: string,
  ): Promise<ReminderRecord>;
  markSent(
    user: AuthenticatedUser,
    businessId: string,
    reminderId: string,
  ): Promise<ReminderRecord>;
}

const REMINDABLE_INVOICE_STATUSES = ["SENT", "PARTIALLY_PAID", "OVERDUE"];

export function createReminderService(dependencies: {
  memberships: BusinessMembershipRepository;
  reminders: ReminderRepository;
}): ReminderService {
  const { memberships, reminders } = dependencies;

  async function requireMembership(user: AuthenticatedUser, businessId: string): Promise<void> {
    const membership = await memberships.findMembership(user.id, businessId);
    if (!membership) {
      throw new ReminderServiceError(
        "BUSINESS_FORBIDDEN",
        "You do not have access to this business.",
      );
    }
  }

  async function requireReminder(
    user: AuthenticatedUser,
    businessId: string,
    reminderId: string,
  ): Promise<ReminderDetail> {
    await requireMembership(user, businessId);
    const reminder = await reminders.findById(businessId, reminderId);
    if (!reminder) {
      throw new ReminderServiceError("REMINDER_NOT_FOUND", "Reminder not found.");
    }
    return reminder;
  }

  return {
    async create(user, businessId, input) {
      await requireMembership(user, businessId);
      const context = await reminders.findCreateContext(businessId, input.customerId, input.invoiceId);
      if (!context) {
        throw new ReminderServiceError(
          "REMINDER_CONTEXT_NOT_FOUND",
          "The customer and invoice must both belong to this business and refer to each other.",
        );
      }
      if (
        !REMINDABLE_INVOICE_STATUSES.includes(context.invoice.status) ||
        parseSignedMoney(context.invoice.outstandingAmount) <= BigInt(0)
      ) {
        throw new ReminderServiceError(
          "REMINDER_CONTEXT_NOT_FOUND",
          "Only an issued invoice with an outstanding balance can have a reminder.",
        );
      }
      const message = generateReminderMessage(input.reminderType, context);
      return reminders.create({ ...input, businessId, message });
    },

    async list(user, businessId, query) {
      await requireMembership(user, businessId);
      return reminders.findMany(businessId, query);
    },

    async get(user, businessId, reminderId) {
      return requireReminder(user, businessId, reminderId);
    },

    async update(user, businessId, reminderId, input) {
      const existing = await requireReminder(user, businessId, reminderId);
      const editsMessage = input.message !== undefined || input.reminderType !== undefined;
      const reschedules = input.followUpDate !== undefined;

      if (editsMessage && !canEditMessage(existing.status)) {
        throw new ReminderServiceError(
          "INVALID_TRANSITION",
          "Only draft reminders can be edited after generation.",
        );
      }
      if (reschedules && !canReschedule(existing.status)) {
        throw new ReminderServiceError(
          "INVALID_TRANSITION",
          "This reminder has already been sent and cannot be rescheduled.",
        );
      }

      // Repeat the predicate atomically so a concurrent mark-sent cannot be
      // overwritten by a stale edit.
      const allowedStatuses = editsMessage ? (["DRAFTED"] as const) : (["DRAFTED", "WHATSAPP_OPENED"] as const);
      const updated = await reminders.update(businessId, reminderId, input, allowedStatuses);
      if (!updated) {
        throw new ReminderServiceError("REMINDER_NOT_FOUND", "Reminder not found.");
      }
      return updated;
    },

    async markWhatsappOpened(user, businessId, reminderId) {
      const existing = await requireReminder(user, businessId, reminderId);
      // A repeat after a successful transition is a no-op, not a failure.
      if (existing.status === "WHATSAPP_OPENED") return existing;
      if (!canMarkWhatsappOpened(existing.status)) {
        throw new ReminderServiceError(
          "INVALID_TRANSITION",
          "This reminder has already been sent and cannot be reopened.",
        );
      }
      const updated = await reminders.markWhatsappOpened(businessId, reminderId);
      if (!updated) {
        // Lost a race with another request; read the winner and report it.
        const current = await reminders.findById(businessId, reminderId);
        if (current?.status === "WHATSAPP_OPENED" || current?.status === "MARKED_SENT") {
          return current;
        }
        throw new ReminderServiceError("REMINDER_NOT_FOUND", "Reminder not found.");
      }
      return updated;
    },

    async markSent(user, businessId, reminderId) {
      const existing = await requireReminder(user, businessId, reminderId);
      // Marking sent twice is idempotent: no duplicate delivery is asserted.
      if (existing.status === "MARKED_SENT") return existing;
      if (!canMarkSent(existing.status)) {
        throw new ReminderServiceError(
          "INVALID_TRANSITION",
          "This reminder can no longer be marked as sent.",
        );
      }
      const updated = await reminders.markSent(businessId, reminderId);
      if (!updated) {
        const current = await reminders.findById(businessId, reminderId);
        if (current?.status === "MARKED_SENT") return current;
        throw new ReminderServiceError("REMINDER_NOT_FOUND", "Reminder not found.");
      }
      return updated;
    },
  };
}

export const reminderService = createReminderService({
  memberships: prismaBusinessMembershipRepository,
  reminders: prismaReminderRepository,
});
