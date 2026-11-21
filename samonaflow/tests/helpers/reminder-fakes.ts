import { generateReminderMessage, whatsappClickToChatUrl } from "@/lib/reminder-message";
import { deriveFollowUpState } from "@/lib/reminder-status";
import type {
  CreateReminderInput,
  ListRemindersQuery,
  UpdateReminderInput,
} from "@/lib/validations/reminder";
import type { CreateReminderRecord, ReminderRepository } from "@/server/repositories/reminder-repository";
import type { ReminderContext, ReminderListResult, ReminderRecord, ReminderStatusValue } from "@/types/reminder";
import { BUSINESS_A } from "./fakes";

export const REMINDER_A = "70000000-0000-4000-8000-000000000001";
export const REMINDER_B = "70000000-0000-4000-8000-000000000002";
/** Fixed "business-local" date used by the fake for overdue derivation. */
export const REMINDER_TODAY = "2026-06-15";

const key = (businessId: string, id: string) => `${businessId}:${id}`;

export function makeReminderContext(
  overrides: Partial<ReminderContext> = {},
): ReminderContext {
  return {
    customer: { id: "30000000-0000-4000-8000-000000000001", name: "Rahul", phone: "+91 98765 43210" },
    invoice: {
      id: "50000000-0000-4000-8000-000000000001",
      invoiceNumber: "INV-102",
      dueDate: "2026-06-10",
      outstandingAmount: "20000.00",
      currency: "INR",
      status: "OVERDUE",
      displayStatus: "OVERDUE",
    },
    timezone: "Asia/Kolkata",
    ...overrides,
  };
}

/**
 * In-memory repository with composite (businessId, id) keys. Customer/invoice
 * contexts must be explicitly seeded for a business pair, mirroring the real
 * composite foreign keys. Transitions repeat their status predicates so a
 * stale request cannot rewrite a historical reminder.
 */
export function createFakeReminderRepository(seed: ReminderRecord[] = []) {
  const reminders = new Map<string, ReminderRecord>();
  const contexts = new Map<string, ReminderContext>();
  // Start above the fixed ids used by fixtures so a generated id cannot
  // collide with a seeded reminder in another business.
  let nextId = 1000;

  for (const reminder of seed) reminders.set(key(reminder.businessId, reminder.id), structuredClone(reminder));

  const contextKey = (businessId: string, customerId: string, invoiceId: string) =>
    `${businessId}:${customerId}:${invoiceId}`;

  function withDerived(record: ReminderRecord): ReminderRecord {
    return {
      ...record,
      followUpState: deriveFollowUpState(record.status, record.followUpDate, REMINDER_TODAY),
    };
  }

  function list(businessId: string, query: ListRemindersQuery): ReminderListResult {
    let matches = [...reminders.values()]
      .filter((reminder) => reminder.businessId === businessId)
      .map(withDerived);

    if (query.status === "DRAFTED" || query.status === "WHATSAPP_OPENED" || query.status === "MARKED_SENT") {
      matches = matches.filter((reminder) => reminder.status === query.status);
    } else if (query.status === "OVERDUE" || query.status === "UPCOMING") {
      matches = matches.filter(
        (reminder) =>
          reminder.status !== "MARKED_SENT" && reminder.followUpState === query.status,
      );
    }
    if (query.type) matches = matches.filter((reminder) => reminder.reminderType === query.type);
    if (query.customerId) matches = matches.filter((reminder) => reminder.customerId === query.customerId);
    if (query.invoiceId) matches = matches.filter((reminder) => reminder.invoiceId === query.invoiceId);
    if (query.fromDate) matches = matches.filter((reminder) => (reminder.followUpDate ?? "") >= query.fromDate!);
    if (query.toDate) matches = matches.filter((reminder) => (reminder.followUpDate ?? "") <= query.toDate!);
    if (query.search) {
      const needle = query.search.toLowerCase();
      matches = matches.filter(
        (reminder) =>
          reminder.message.toLowerCase().includes(needle) ||
          reminder.customerName.toLowerCase().includes(needle) ||
          reminder.invoiceNumber.toLowerCase().includes(needle),
      );
    }

    matches.sort((a, b) => {
      const field = query.sort;
      const left = field === "customerName" ? a.customerName : a[field] ?? "";
      const right = field === "customerName" ? b.customerName : b[field] ?? "";
      const result = String(left).localeCompare(String(right));
      return query.direction === "asc" ? result : -result;
    });

    const total = matches.length;
    const start = (query.page - 1) * query.pageSize;
    return {
      items: matches.slice(start, start + query.pageSize),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  const repository: ReminderRepository = {
    async findCreateContext(businessId, customerId, invoiceId) {
      const context = contexts.get(contextKey(businessId, customerId, invoiceId));
      return context ? structuredClone(context) : null;
    },

    async create(input: CreateReminderRecord) {
      const context = contexts.get(contextKey(input.businessId, input.customerId, input.invoiceId));
      const record: ReminderRecord = {
        id: `70000000-0000-4000-8000-${String(nextId).padStart(12, "0")}`,
        businessId: input.businessId,
        customerId: input.customerId,
        invoiceId: input.invoiceId,
        customerName: context?.customer.name ?? "Customer",
        invoiceNumber: context?.invoice.invoiceNumber ?? "INV-000",
        reminderType: input.reminderType,
        status: "DRAFTED",
        message: input.message,
        followUpDate: input.followUpDate,
        followUpState: deriveFollowUpState("DRAFTED", input.followUpDate, REMINDER_TODAY),
        invoiceDueDate: context?.invoice.dueDate ?? "2026-06-10",
        invoiceOverdue: context?.invoice.status === "OVERDUE",
        whatsappUrl: whatsappClickToChatUrl(context?.customer.phone ?? null, input.message),
        currency: context?.invoice.currency ?? "INR",
        timezone: context?.timezone ?? "Asia/Kolkata",
        createdAt: "2026-06-10T00:00:00.000Z",
        updatedAt: "2026-06-10T00:00:00.000Z",
      };
      nextId += 1;
      reminders.set(key(record.businessId, record.id), record);
      return withDerived(record);
    },

    async findMany(businessId, query) {
      return list(businessId, query);
    },

    async findById(businessId, reminderId) {
      const record = reminders.get(key(businessId, reminderId));
      return record ? withDerived(record) : null;
    },

    async update(businessId, reminderId, input: UpdateReminderInput, allowedStatuses) {
      const k = key(businessId, reminderId);
      const existing = reminders.get(k);
      if (!existing || !allowedStatuses.includes(existing.status)) return null;
      const updated: ReminderRecord = {
        ...existing,
        ...(input.message === undefined ? {} : { message: input.message }),
        ...(input.reminderType === undefined ? {} : { reminderType: input.reminderType }),
        ...(input.followUpDate === undefined ? {} : { followUpDate: input.followUpDate }),
        updatedAt: "2026-06-12T00:00:00.000Z",
      };
      reminders.set(k, updated);
      return withDerived(updated);
    },

    async markWhatsappOpened(businessId, reminderId) {
      const k = key(businessId, reminderId);
      const existing = reminders.get(k);
      if (!existing || existing.status !== "DRAFTED") return null;
      const updated = { ...existing, status: "WHATSAPP_OPENED" as const, updatedAt: "2026-06-12T00:00:00.000Z" };
      reminders.set(k, updated);
      return withDerived(updated);
    },

    async markSent(businessId, reminderId) {
      const k = key(businessId, reminderId);
      const existing = reminders.get(k);
      if (!existing || !(["DRAFTED", "WHATSAPP_OPENED"] as string[]).includes(existing.status)) return null;
      const updated = { ...existing, status: "MARKED_SENT" as const, updatedAt: "2026-06-12T00:00:00.000Z" };
      reminders.set(k, updated);
      return withDerived(updated);
    },
  };

  return {
    repository,
    seedContext(businessId: string, context: ReminderContext) {
      contexts.set(contextKey(businessId, context.customer.id, context.invoice.id), structuredClone(context));
    },
    getReminder(businessId: string, reminderId: string) {
      const record = reminders.get(key(businessId, reminderId));
      return record ? withDerived(record) : null;
    },
    setStatus(businessId: string, reminderId: string, status: ReminderStatusValue) {
      const k = key(businessId, reminderId);
      const record = reminders.get(k);
      if (record) reminders.set(k, { ...record, status });
    },
    count() {
      return reminders.size;
    },
    defaultBusinessId: BUSINESS_A,
  };
}

export function makeReminderRecord(overrides: Partial<ReminderRecord> = {}): ReminderRecord {
  const context = makeReminderContext();
  const message = generateReminderMessage("OVERDUE_PAYMENT", context);
  const base: ReminderRecord = {
    id: REMINDER_A,
    businessId: BUSINESS_A,
    customerId: context.customer.id,
    invoiceId: context.invoice.id,
    customerName: context.customer.name,
    invoiceNumber: context.invoice.invoiceNumber,
    reminderType: "OVERDUE_PAYMENT",
    status: "DRAFTED",
    message,
    followUpDate: "2026-06-20",
    followUpState: "UPCOMING",
    invoiceDueDate: context.invoice.dueDate,
    invoiceOverdue: true,
    whatsappUrl: whatsappClickToChatUrl(context.customer.phone, message),
    currency: context.invoice.currency,
    timezone: context.timezone,
    createdAt: "2026-06-10T00:00:00.000Z",
    updatedAt: "2026-06-10T00:00:00.000Z",
  };
  return { ...base, ...overrides };
}

export type { CreateReminderInput };
