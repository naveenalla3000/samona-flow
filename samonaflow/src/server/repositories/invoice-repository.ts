// Server-only data access for invoices. Every method requires an explicit
// businessId: there is deliberately no way to address an invoice by id alone.
// Creation and mutation run in transactions so the header, generated number
// and line items always commit together.
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { businessLocalDate } from "@/lib/business-date";
import { formatMoney, parseMoney } from "@/lib/invoice-math";
import { invoiceNumberPrefix, nextInvoiceNumber } from "@/lib/invoice-numbering";
import { canEditInvoice, deriveDisplayStatus } from "@/lib/invoice-status";
import type { ListInvoicesQuery } from "@/lib/validations/invoice";
import { prisma } from "@/server/database/connection";
import { moneyDecimal } from "@/server/utils/invoice-decimal";
import type {
  InvoiceBusinessProfile,
  InvoiceDetail,
  InvoiceItemRecord,
  InvoiceListItem,
  InvoiceListResult,
  InvoiceRecord,
  InvoiceStatusValue,
} from "@/types/invoice";

const DETAIL_INCLUDE = {
  customer: { select: { id: true, name: true, companyName: true, email: true, phone: true } },
  items: { orderBy: { position: "asc" as const } },
  payments: { select: { amount: true, paymentReversals: { select: { id: true } } } },
} satisfies Prisma.InvoiceInclude;

type InvoiceRow = Prisma.InvoiceGetPayload<{ include: typeof DETAIL_INCLUDE }>;

type DbClient = PrismaClient | Prisma.TransactionClient;

/** All client-owned invoice fields plus the server-calculated money fields. */
export interface InvoiceMutation {
  customerId: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  notes: string | null;
  discount: string;
  tax: string;
  subtotal: string;
  totalAmount: string;
  items: {
    description: string;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
  }[];
}

export type CreateInvoiceRecord = InvoiceMutation & { businessId: string };

export interface InvoiceRepository {
  create(input: CreateInvoiceRecord): Promise<InvoiceRecord>;
  findMany(businessId: string, query: ListInvoicesQuery): Promise<InvoiceListResult>;
  findById(businessId: string, invoiceId: string): Promise<InvoiceDetail | null>;
  findBaseById(businessId: string, invoiceId: string): Promise<InvoiceRecord | null>;
  update(
    businessId: string,
    invoiceId: string,
    input: InvoiceMutation,
  ): Promise<InvoiceRecord | null>;
  setStatus(
    businessId: string,
    invoiceId: string,
    next: "SENT" | "VOID",
    allowedFrom: readonly InvoiceStatusValue[],
  ): Promise<InvoiceRecord | null>;
  findBusinessProfile(businessId: string): Promise<InvoiceBusinessProfile | null>;
}

async function loadToday(businessId: string): Promise<string> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { timezone: true },
  });
  return businessLocalDate(business?.timezone ?? "Asia/Kolkata");
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function paidCents(row: InvoiceRow): bigint {
  // Reversed payments are appended, never deleted; exclude them from receipts.
  return row.payments
    .filter((payment) => payment.paymentReversals.length === 0)
    .reduce((sum, payment) => sum + parseMoney(payment.amount.toFixed(2)), BigInt(0));
}

function toRecord(row: InvoiceRow, today: string): InvoiceRecord {
  const received = paidCents(row);
  const outstanding = formatMoney(parseMoney(row.totalAmount.toFixed(2)) - received);
  return {
    id: row.id,
    businessId: row.businessId,
    customerId: row.customerId,
    invoiceNumber: row.invoiceNumber,
    issueDate: dateOnly(row.issueDate),
    dueDate: dateOnly(row.dueDate),
    expectedPaymentDate: row.expectedPaymentDate ? dateOnly(row.expectedPaymentDate) : null,
    status: row.status,
    displayStatus: deriveDisplayStatus(row.status, dateOnly(row.dueDate), outstanding, today),
    subtotal: row.subtotal.toFixed(2),
    discount: row.discount.toFixed(2),
    tax: row.tax.toFixed(2),
    totalAmount: row.totalAmount.toFixed(2),
    amountPaid: formatMoney(received),
    outstandingAmount: outstanding,
    currency: row.currency,
    notes: row.notes,
    isEditable: canEditInvoice(row.status),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toListItem(row: InvoiceRow, today: string): InvoiceListItem {
  return {
    ...toRecord(row, today),
    customerName: row.customer.name,
    customerCompanyName: row.customer.companyName,
  };
}

function toDetail(row: InvoiceRow, today: string): InvoiceDetail {
  const items: InvoiceItemRecord[] = row.items.map((item) => ({
    id: item.id,
    businessId: item.businessId,
    invoiceId: item.invoiceId,
    description: item.description,
    quantity: item.quantity.toFixed(2),
    unitPrice: item.unitPrice.toFixed(2),
    lineTotal: item.lineTotal.toFixed(2),
    position: item.position,
    createdAt: item.createdAt.toISOString(),
  }));
  return {
    ...toRecord(row, today),
    items,
    customer: {
      id: row.customer.id,
      name: row.customer.name,
      companyName: row.customer.companyName,
      email: row.customer.email,
      phone: row.customer.phone,
    },
  };
}

async function findRow(
  client: DbClient,
  businessId: string,
  invoiceId: string,
): Promise<InvoiceRow | null> {
  return client.invoice.findFirst({
    where: { id: invoiceId, businessId },
    include: DETAIL_INCLUDE,
  });
}

function isInvoiceNumberConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const target = error.meta?.target;
  const fields = Array.isArray(target) ? target.map(String).join(",") : String(target ?? "");
  return fields.includes("invoice_number") || fields.includes("invoices_business_id_invoice_number_key");
}

const MAX_NUMBER_ATTEMPTS = 5;

function toItemData(input: InvoiceMutation["items"]) {
  return input.map((item, index) => ({
    description: item.description,
    quantity: moneyDecimal(item.quantity),
    unitPrice: moneyDecimal(item.unitPrice),
    lineTotal: moneyDecimal(item.lineTotal),
    position: index + 1,
  }));
}

export const prismaInvoiceRepository: InvoiceRepository = {
  async create(input) {
    const prefix = invoiceNumberPrefix(input.issueDate);

    // Retry on the per-business unique number constraint. Each attempt is a
    // fresh transaction that re-reads the highest number, so concurrent
    // creators converge on distinct numbers without a schema counter table.
    for (let attempt = 0; attempt < MAX_NUMBER_ATTEMPTS; attempt += 1) {
      try {
        return await prisma.$transaction(async (tx) => {
          const existing = await tx.invoice.findMany({
            where: { businessId: input.businessId, invoiceNumber: { startsWith: prefix } },
            select: { invoiceNumber: true },
          });
          const invoiceNumber = nextInvoiceNumber(
            prefix,
            existing.map((row) => row.invoiceNumber),
          );

          const created = await tx.invoice.create({
            data: {
              businessId: input.businessId,
              customerId: input.customerId,
              invoiceNumber,
              issueDate: new Date(`${input.issueDate}T00:00:00.000Z`),
              dueDate: new Date(`${input.dueDate}T00:00:00.000Z`),
              status: "DRAFT",
              subtotal: moneyDecimal(input.subtotal),
              discount: moneyDecimal(input.discount),
              tax: moneyDecimal(input.tax),
              totalAmount: moneyDecimal(input.totalAmount),
              currency: input.currency,
              notes: input.notes,
              items: { create: toItemData(input.items) },
            },
            select: { id: true },
          });

          const row = await findRow(tx, input.businessId, created.id);
          if (!row) throw new Error("Invoice disappeared after creation");
          return toRecord(row, await loadToday(input.businessId));
        });
      } catch (error) {
        if (isInvoiceNumberConflict(error) && attempt < MAX_NUMBER_ATTEMPTS - 1) continue;
        throw error;
      }
    }
    throw new Error("Invoice number generation exhausted retries");
  },

  async findMany(businessId, query) {
    const today = await loadToday(businessId);

    const where: Prisma.InvoiceWhereInput = { businessId };
    if (query.status !== "all") {
      if (query.status === "OVERDUE") {
        // OVERDUE is display-derived; approximate it at the query layer using
        // the business-local date. A partially paid invoice still has balance.
        where.status = { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] };
        where.dueDate = { lt: new Date(`${today}T00:00:00.000Z`) };
      } else {
        where.status = query.status;
      }
    }
    if (query.customerId) where.customerId = query.customerId;
    if (query.search) {
      const contains = { contains: query.search, mode: "insensitive" as const };
      where.OR = [
        { invoiceNumber: contains },
        { notes: contains },
        { customer: { name: contains } },
        { customer: { companyName: contains } },
      ];
    }
    const dateFilter: Prisma.DateTimeFilter<"Invoice"> = {};
    if (query.fromDate) dateFilter.gte = new Date(`${query.fromDate}T00:00:00.000Z`);
    if (query.toDate) dateFilter.lte = new Date(`${query.toDate}T00:00:00.000Z`);
    if (Object.keys(dateFilter).length > 0) where.issueDate = dateFilter;

    const orderBy: Prisma.InvoiceOrderByWithRelationInput = {
      [query.sort]: query.direction,
    };

    const [rows, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: DETAIL_INCLUDE,
      }),
      prisma.invoice.count({ where }),
    ]);

    return {
      items: rows.map((row) => toListItem(row, today)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  },

  async findById(businessId, invoiceId) {
    const row = await findRow(prisma, businessId, invoiceId);
    return row ? toDetail(row, await loadToday(businessId)) : null;
  },

  async findBaseById(businessId, invoiceId) {
    const row = await findRow(prisma, businessId, invoiceId);
    return row ? toRecord(row, await loadToday(businessId)) : null;
  },

  async update(businessId, invoiceId, input) {
    const updated = await prisma.$transaction(async (tx) => {
      // The status guard is inside the transaction: a concurrent SEND cannot
      // interleave with an edit of the same draft.
      const result = await tx.invoice.updateMany({
        where: { id: invoiceId, businessId, status: "DRAFT" },
        data: {
          customerId: input.customerId,
          issueDate: new Date(`${input.issueDate}T00:00:00.000Z`),
          dueDate: new Date(`${input.dueDate}T00:00:00.000Z`),
          currency: input.currency,
          notes: input.notes,
          discount: moneyDecimal(input.discount),
          tax: moneyDecimal(input.tax),
          subtotal: moneyDecimal(input.subtotal),
          totalAmount: moneyDecimal(input.totalAmount),
        },
      });
      if (result.count === 0) return null;

      // Replacing the whole item set is what makes add/edit/remove atomic and
      // prevents orphaned items from a previous draft version.
      await tx.invoiceItem.deleteMany({ where: { invoiceId, businessId } });
      await tx.invoiceItem.createMany({
        data: toItemData(input.items).map((item) => ({ ...item, invoiceId, businessId })),
      });

      const row = await findRow(tx, businessId, invoiceId);
      return row ? toRecord(row, await loadToday(businessId)) : null;
    });
    return updated;
  },

  async setStatus(businessId, invoiceId, next, allowedFrom) {
    const result = await prisma.invoice.updateMany({
      where: { id: invoiceId, businessId, status: { in: [...allowedFrom] } },
      data: { status: next },
    });
    if (result.count === 0) return null;
    return this.findBaseById(businessId, invoiceId);
  },

  async findBusinessProfile(businessId) {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: {
        name: true,
        ownerName: true,
        email: true,
        phone: true,
        currency: true,
        timezone: true,
      },
    });
    return business;
  },
};
