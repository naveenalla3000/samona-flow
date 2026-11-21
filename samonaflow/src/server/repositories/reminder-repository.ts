// Server-only data access for Reminder Management. Every method requires an
// explicit businessId: there is intentionally no way to address a reminder,
// customer or invoice by id alone. The composite FK (invoiceId, customerId,
// businessId) is mirrored in findCreateContext, and status-changing writes use
// updateMany predicates so a stale request cannot rewrite a historical record.
import { Prisma } from "@/generated/prisma/client";
import { businessLocalDate } from "@/lib/business-date";
import { formatMoney, parseMoney } from "@/lib/invoice-math";
import { deriveDisplayStatus as deriveInvoiceDisplayStatus } from "@/lib/invoice-status";
import { whatsappClickToChatUrl } from "@/lib/reminder-message";
import { deriveFollowUpState, type ReminderTypeValue } from "@/lib/reminder-status";
import type {
  CreateReminderInput,
  ListRemindersQuery,
  UpdateReminderInput,
} from "@/lib/validations/reminder";
import { prisma } from "@/server/database/connection";
import type {
  ReminderContext,
  ReminderDetail,
  ReminderListResult,
  ReminderRecord,
  ReminderStatusValue,
} from "@/types/reminder";

const PAYMENT_SELECT = {
  amount: true,
  paymentReversals: { select: { id: true } },
} as const;

const REMINDER_SELECT = {
  id: true,
  businessId: true,
  customerId: true,
  invoiceId: true,
  reminderType: true,
  status: true,
  message: true,
  followUpDate: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: { name: true, phone: true } },
  invoice: {
    select: {
      invoiceNumber: true,
      dueDate: true,
      currency: true,
      status: true,
      totalAmount: true,
      payments: { select: PAYMENT_SELECT },
    },
  },
} satisfies Prisma.ReminderSelect;

type ReminderRow = Prisma.ReminderGetPayload<{ select: typeof REMINDER_SELECT }>;
type PaymentRow = ReminderRow["invoice"]["payments"][number];

export type CreateReminderRecord = CreateReminderInput & {
  businessId: string;
  message: string;
};

export interface ReminderRepository {
  /** Null unless customer and invoice both belong to this business and match. */
  findCreateContext(
    businessId: string,
    customerId: string,
    invoiceId: string,
  ): Promise<ReminderContext | null>;
  create(input: CreateReminderRecord): Promise<ReminderRecord>;
  findMany(businessId: string, query: ListRemindersQuery): Promise<ReminderListResult>;
  findById(businessId: string, reminderId: string): Promise<ReminderDetail | null>;
  update(
    businessId: string,
    reminderId: string,
    input: UpdateReminderInput,
    allowedStatuses: readonly ReminderStatusValue[],
  ): Promise<ReminderRecord | null>;
  markWhatsappOpened(businessId: string, reminderId: string): Promise<ReminderRecord | null>;
  markSent(businessId: string, reminderId: string): Promise<ReminderRecord | null>;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function asDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Reversed payments are appended, never deleted; exclude them from receipts. */
function activePaidCents(payments: PaymentRow[]): bigint {
  return payments
    .filter((payment) => payment.paymentReversals.length === 0)
    .reduce((sum, payment) => sum + parseMoney(payment.amount.toFixed(2)), BigInt(0));
}

type InvoiceMoney = { totalAmount: Prisma.Decimal; payments: PaymentRow[] };

function outstandingAmount(invoice: InvoiceMoney): string {
  return formatMoney(parseMoney(invoice.totalAmount.toFixed(2)) - activePaidCents(invoice.payments));
}

/** Business config is read with the already-verified businessId, never a guess. */
async function businessSettings(businessId: string): Promise<{ timezone: string; currency: string }> {
  const row = await prisma.business.findFirst({
    where: { id: businessId },
    select: { timezone: true, currency: true },
  });
  return {
    timezone: row?.timezone || "Asia/Kolkata",
    currency: row?.currency || "INR",
  };
}

function toRecord(row: ReminderRow, today: string, timezone: string): ReminderRecord {
  const status = row.status as ReminderStatusValue;
  const followUpDate = row.followUpDate ? dateOnly(row.followUpDate) : null;
  const invoiceDueDate = dateOnly(row.invoice.dueDate);
  const outstanding = outstandingAmount(row.invoice);
  return {
    id: row.id,
    businessId: row.businessId,
    customerId: row.customerId,
    invoiceId: row.invoiceId,
    customerName: row.customer.name,
    invoiceNumber: row.invoice.invoiceNumber,
    reminderType: row.reminderType as ReminderTypeValue,
    status,
    message: row.message,
    followUpDate,
    followUpState: deriveFollowUpState(status, followUpDate, today),
    invoiceDueDate,
    invoiceOverdue:
      deriveInvoiceDisplayStatus(
        row.invoice.status,
        invoiceDueDate,
        outstanding,
        today,
      ) === "OVERDUE",
    whatsappUrl: whatsappClickToChatUrl(row.customer.phone ?? null, row.message),
    currency: row.invoice.currency,
    timezone,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function toRecordAsync(businessId: string, row: ReminderRow): Promise<ReminderRecord> {
  const { timezone } = await businessSettings(businessId);
  return toRecord(row, businessLocalDate(timezone), timezone);
}

async function findRow(businessId: string, reminderId: string): Promise<ReminderRow | null> {
  return prisma.reminder.findFirst({
    where: { id: reminderId, businessId },
    select: REMINDER_SELECT,
  });
}

export const prismaReminderRepository: ReminderRepository = {
  async findCreateContext(businessId, customerId, invoiceId) {
    const [customer, invoice, settings] = await Promise.all([
      prisma.customer.findFirst({
        where: { id: customerId, businessId },
        select: { id: true, name: true, phone: true },
      }),
      // The composite predicate enforces same-business AND same-customer,
      // exactly like the applied database foreign key.
      prisma.invoice.findFirst({
        where: { id: invoiceId, customerId, businessId },
        select: {
          id: true,
          invoiceNumber: true,
          dueDate: true,
          currency: true,
          status: true,
          totalAmount: true,
          payments: { select: PAYMENT_SELECT },
        },
      }),
      businessSettings(businessId),
    ]);
    if (!customer || !invoice) return null;

    const dueDate = dateOnly(invoice.dueDate);
    const outstanding = outstandingAmount(invoice);
    return {
      customer,
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        dueDate,
        outstandingAmount: outstanding,
        currency: invoice.currency,
        status: invoice.status,
        displayStatus: deriveInvoiceDisplayStatus(invoice.status, dueDate, outstanding, businessLocalDate(settings.timezone)),
      },
      timezone: settings.timezone,
    };
  },

  async create(input) {
    const row = await prisma.reminder.create({
      data: {
        businessId: input.businessId,
        customerId: input.customerId,
        invoiceId: input.invoiceId,
        reminderType: input.reminderType,
        message: input.message,
        followUpDate: input.followUpDate ? asDate(input.followUpDate) : null,
      },
      select: REMINDER_SELECT,
    });
    return toRecordAsync(input.businessId, row);
  },

  async findMany(businessId, query) {
    const { timezone } = await businessSettings(businessId);
    const today = businessLocalDate(timezone);

    const followUp: Prisma.DateTimeFilter<"Reminder"> = {};
    if (query.status === "UPCOMING") followUp.gte = asDate(today);
    if (query.status === "OVERDUE") followUp.lt = asDate(today);
    if (query.fromDate && (!followUp.gte || asDate(query.fromDate) > followUp.gte)) {
      followUp.gte = asDate(query.fromDate);
    }
    if (query.toDate) followUp.lte = asDate(query.toDate);

    const where: Prisma.ReminderWhereInput = { businessId };
    if (query.status === "DRAFTED" || query.status === "WHATSAPP_OPENED" || query.status === "MARKED_SENT") {
      where.status = query.status;
    } else if (query.status === "UPCOMING" || query.status === "OVERDUE") {
      where.status = { not: "MARKED_SENT" };
    }
    if (Object.keys(followUp).length > 0) where.followUpDate = followUp;
    if (query.type) where.reminderType = query.type;
    if (query.customerId) where.customerId = query.customerId;
    if (query.invoiceId) where.invoiceId = query.invoiceId;
    if (query.search) {
      const contains = { contains: query.search, mode: "insensitive" as const };
      where.OR = [
        { message: contains },
        { invoice: { invoiceNumber: contains } },
        { customer: { name: contains } },
      ];
    }

    let orderBy: Prisma.ReminderOrderByWithRelationInput;
    if (query.sort === "customerName") {
      orderBy = { customer: { name: query.direction } };
    } else {
      orderBy = { [query.sort]: query.direction };
    }

    const [rows, total] = await Promise.all([
      prisma.reminder.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: REMINDER_SELECT,
      }),
      prisma.reminder.count({ where }),
    ]);

    return {
      items: rows.map((row) => toRecord(row, today, timezone)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  },

  async findById(businessId, reminderId) {
    const row = await findRow(businessId, reminderId);
    return row ? toRecordAsync(businessId, row) : null;
  },

  async update(businessId, reminderId, input, allowedStatuses) {
    // The service decides which statuses may be changed; repeating them here
    // makes the check atomic against a concurrent transition.
    const result = await prisma.reminder.updateMany({
      where: { id: reminderId, businessId, status: { in: [...allowedStatuses] } },
      data: {
        ...(input.message === undefined ? {} : { message: input.message }),
        ...(input.reminderType === undefined ? {} : { reminderType: input.reminderType }),
        ...(input.followUpDate === undefined
          ? {}
          : { followUpDate: input.followUpDate ? asDate(input.followUpDate) : null }),
      },
    });
    if (result.count === 0) return null;
    const row = await findRow(businessId, reminderId);
    return row ? toRecordAsync(businessId, row) : null;
  },

  async markWhatsappOpened(businessId, reminderId) {
    const result = await prisma.reminder.updateMany({
      where: { id: reminderId, businessId, status: "DRAFTED" },
      data: { status: "WHATSAPP_OPENED" },
    });
    if (result.count === 0) return null;
    const row = await findRow(businessId, reminderId);
    return row ? toRecordAsync(businessId, row) : null;
  },

  async markSent(businessId, reminderId) {
    // Repeating this call cannot change the record twice; the service also
    // treats an existing MARKED_SENT row as an idempotent success.
    const result = await prisma.reminder.updateMany({
      where: { id: reminderId, businessId, status: { in: ["DRAFTED", "WHATSAPP_OPENED"] } },
      data: { status: "MARKED_SENT" },
    });
    if (result.count === 0) return null;
    const row = await findRow(businessId, reminderId);
    return row ? toRecordAsync(businessId, row) : null;
  },
};

export const reminderRepository = prismaReminderRepository;
