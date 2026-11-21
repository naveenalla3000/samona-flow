// Server-only data access for Payment Management. Every method requires an
// explicit businessId. Recording and reversing use a row-locking transaction so
// the outstanding balance is re-read and checked atomically: two concurrent
// payments cannot spend the same balance, and a payment cannot be reversed
// twice. The original payment and reversal rows are never deleted or edited.
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { businessLocalDate } from "@/lib/business-date";
import {
  calculatePaymentSummary,
  derivePaymentStatus,
  paymentFitsOutstanding,
  type PaymentAmount,
} from "@/lib/payment-math";
import { canRecordPayment, canReversePayment } from "@/lib/payment-status";
import type { ListPaymentsQuery } from "@/lib/validations/payment";
import { deriveDisplayStatus } from "@/lib/invoice-status";
import { moneyDecimal } from "@/server/utils/invoice-decimal";
import { prisma } from "@/server/database/connection";
import type {
  CreatePaymentInput,
  ReversePaymentInput,
} from "@/lib/validations/payment";
import type {
  PaymentDetail,
  PaymentInvoiceContext,
  PaymentRecord,
  PaymentReversalRecord,
} from "@/types/payment";
import type { PaymentMethodValue } from "@/lib/payment-status";

const INVOICE_CONTEXT_SELECT = {
  id: true,
  businessId: true,
  invoiceNumber: true,
  customerId: true,
  dueDate: true,
  status: true,
  currency: true,
  totalAmount: true,
  business: { select: { timezone: true } },
  customer: { select: { id: true, name: true, companyName: true } },
  payments: {
    select: {
      id: true,
      amount: true,
      paymentReversals: { select: { id: true } },
    },
  },
} satisfies Prisma.InvoiceSelect;

const DETAIL_INCLUDE = {
  invoice: { select: INVOICE_CONTEXT_SELECT },
  paymentReversals: {
    select: {
      id: true,
      businessId: true,
      paymentId: true,
      reversedById: true,
      reason: true,
      reversedAt: true,
      createdAt: true,
      reversedBy: { select: { email: true } },
    },
  },
} satisfies Prisma.PaymentInclude;

type InvoiceContextRow = Prisma.InvoiceGetPayload<{ select: typeof INVOICE_CONTEXT_SELECT }>;
type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof DETAIL_INCLUDE }>;
type DbClient = PrismaClient | Prisma.TransactionClient;

export type CreatePaymentRecord = CreatePaymentInput & { businessId: string };
export type ReversePaymentRecord = ReversePaymentInput & {
  businessId: string;
  paymentId: string;
  reversedById: string;
};

export type PaymentMutationErrorCode =
  | "INVOICE_NOT_FOUND"
  | "INVOICE_LOCKED"
  | "PAYMENT_EXCEEDS_OUTSTANDING"
  | "PAYMENT_NOT_FOUND"
  | "PAYMENT_ALREADY_REVERSED";

export type PaymentMutationResult =
  | { ok: true; payment: PaymentRecord }
  | { ok: false; code: PaymentMutationErrorCode; message: string };

export interface PaymentRepository {
  findInvoiceContext(
    businessId: string,
    invoiceId: string,
  ): Promise<PaymentInvoiceContext | null>;
  create(input: CreatePaymentRecord): Promise<PaymentMutationResult>;
  reverse(input: ReversePaymentRecord): Promise<PaymentMutationResult>;
  findMany(businessId: string, query: ListPaymentsQuery): Promise<import("@/types/payment").PaymentListResult>;
  findManyForInvoice(
    businessId: string,
    invoiceId: string,
    query: ListPaymentsQuery,
  ): Promise<import("@/types/payment").PaymentListResult>;
  findById(businessId: string, paymentId: string): Promise<PaymentDetail | null>;
}

function failure(code: PaymentMutationErrorCode, message: string): PaymentMutationResult {
  return { ok: false, code, message };
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function paymentAmounts(row: InvoiceContextRow): PaymentAmount[] {
  return row.payments.map((payment) => ({
    id: payment.id,
    amount: payment.amount.toFixed(2),
    reversed: payment.paymentReversals.length > 0,
  }));
}

function toContext(row: InvoiceContextRow): PaymentInvoiceContext {
  const today = businessLocalDate(row.business.timezone || "Asia/Kolkata");
  const totalAmount = row.totalAmount.toFixed(2);
  const summary = calculatePaymentSummary(totalAmount, paymentAmounts(row));
  return {
    id: row.id,
    businessId: row.businessId,
    invoiceNumber: row.invoiceNumber,
    customerId: row.customerId,
    customerName: row.customer.name,
    customerCompanyName: row.customer.companyName,
    status: row.status,
    displayStatus: deriveDisplayStatus(
      row.status,
      dateOnly(row.dueDate),
      summary.outstandingAmount,
      today,
    ),
    currency: row.currency,
    dueDate: dateOnly(row.dueDate),
    totalAmount,
    amountPaid: summary.amountPaid,
    outstandingAmount: summary.outstandingAmount,
  };
}

function toReversal(row: PaymentRow["paymentReversals"][number]): PaymentReversalRecord {
  return {
    id: row.id,
    businessId: row.businessId,
    paymentId: row.paymentId,
    reversedById: row.reversedById,
    reversedByEmail: row.reversedBy.email,
    reason: row.reason,
    reversedAt: row.reversedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function toRecord(row: PaymentRow): PaymentRecord {
  const context = toContext(row.invoice);
  const reversal = row.paymentReversals[0];
  return {
    id: row.id,
    businessId: row.businessId,
    invoiceId: row.invoiceId,
    invoiceNumber: context.invoiceNumber,
    customerId: context.customerId,
    customerName: context.customerName,
    customerCompanyName: context.customerCompanyName,
    amount: row.amount.toFixed(2),
    paymentDate: dateOnly(row.paymentDate),
    method: row.method as PaymentMethodValue,
    transactionReference: row.transactionReference,
    notes: row.notes,
    currency: context.currency,
    status: reversal ? "REVERSED" : "RECORDED",
    reversal: reversal ? toReversal(reversal) : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDetail(row: PaymentRow): PaymentDetail {
  const context = toContext(row.invoice);
  return {
    ...toRecord(row),
    invoice: {
      id: context.id,
      invoiceNumber: context.invoiceNumber,
      status: context.status,
      displayStatus: context.displayStatus,
      currency: context.currency,
      dueDate: context.dueDate,
      totalAmount: context.totalAmount,
      amountPaid: context.amountPaid,
      outstandingAmount: context.outstandingAmount,
    },
  };
}

async function findPaymentRow(
  client: DbClient,
  businessId: string,
  paymentId: string,
): Promise<PaymentRow | null> {
  return client.payment.findFirst({
    where: { id: paymentId, businessId },
    include: DETAIL_INCLUDE,
  });
}

async function findInvoiceRow(
  client: DbClient,
  businessId: string,
  invoiceId: string,
): Promise<InvoiceContextRow | null> {
  return client.invoice.findFirst({
    where: { id: invoiceId, businessId },
    select: INVOICE_CONTEXT_SELECT,
  });
}

async function lockInvoice(
  tx: Prisma.TransactionClient,
  businessId: string,
  invoiceId: string,
): Promise<void> {
  // Serializes all payment/reversal mutations for one invoice. The composite
  // tenant predicate prevents a lock from being taken on a foreign invoice.
  await tx.$queryRaw`
    SELECT id FROM invoices
    WHERE id = ${invoiceId}::uuid AND business_id = ${businessId}::uuid
    FOR UPDATE
  `;
}

async function lockPayment(
  tx: Prisma.TransactionClient,
  businessId: string,
  paymentId: string,
): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM payments
    WHERE id = ${paymentId}::uuid AND business_id = ${businessId}::uuid
    FOR UPDATE
  `;
}

function isReversalConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

export const prismaPaymentRepository: PaymentRepository = {
  async findInvoiceContext(businessId, invoiceId) {
    const row = await findInvoiceRow(prisma, businessId, invoiceId);
    return row ? toContext(row) : null;
  },

  async create(input) {
    try {
      return await prisma.$transaction(async (tx) => {
        await lockInvoice(tx, input.businessId, input.invoiceId);
        const invoiceRow = await findInvoiceRow(tx, input.businessId, input.invoiceId);
        if (!invoiceRow) return failure("INVOICE_NOT_FOUND", "Invoice not found.");

        const context = toContext(invoiceRow);
        if (!canRecordPayment(context.status)) {
          return failure(
            "INVOICE_LOCKED",
            "Payments can only be recorded against sent, partially paid or overdue invoices.",
          );
        }
        const alreadyPaid = paymentAmounts(invoiceRow);
        if (!paymentFitsOutstanding(input.amount, context.totalAmount, alreadyPaid)) {
          return failure(
            "PAYMENT_EXCEEDS_OUTSTANDING",
            "Payment amount cannot exceed the outstanding balance.",
          );
        }

        const created = await tx.payment.create({
          data: {
            businessId: input.businessId,
            invoiceId: input.invoiceId,
            amount: moneyDecimal(input.amount),
            paymentDate: new Date(`${input.paymentDate}T00:00:00.000Z`),
            method: input.method,
            transactionReference: input.transactionReference,
            notes: input.notes,
          },
          select: { id: true },
        });

        const nextAmounts: PaymentAmount[] = [
          ...alreadyPaid,
          { amount: input.amount, reversed: false },
        ];
        const nextStatus = derivePaymentStatus(
          context.totalAmount,
          nextAmounts,
          context.status === "OVERDUE" ? "OVERDUE" : "SENT",
        );
        const updated = await tx.invoice.updateMany({
          where: { id: input.invoiceId, businessId: input.businessId },
          data: { status: nextStatus },
        });
        if (updated.count !== 1) throw new Error("Invoice disappeared during payment recording");

        const row = await findPaymentRow(tx, input.businessId, created.id);
        if (!row) throw new Error("Payment disappeared after creation");
        return { ok: true as const, payment: toRecord(row) };
      });
    } catch (error) {
      // A serialization conflict is retried once by the caller's higher-level
      // guard; returning a clear error here avoids leaking database details.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        return failure("PAYMENT_EXCEEDS_OUTSTANDING", "The invoice changed. Please retry the payment.");
      }
      throw error;
    }
  },

  async reverse(input) {
    try {
      return await prisma.$transaction(async (tx) => {
        await lockPayment(tx, input.businessId, input.paymentId);
        const paymentRow = await findPaymentRow(tx, input.businessId, input.paymentId);
        if (!paymentRow) return failure("PAYMENT_NOT_FOUND", "Payment not found.");
        if (paymentRow.paymentReversals.length > 0) {
          return failure(
            "PAYMENT_ALREADY_REVERSED",
            "This payment has already been reversed.",
          );
        }

        await lockInvoice(tx, input.businessId, paymentRow.invoiceId);
        const invoiceRow = await findInvoiceRow(
          tx,
          input.businessId,
          paymentRow.invoiceId,
        );
        if (!invoiceRow) return failure("INVOICE_NOT_FOUND", "Invoice not found.");
        const context = toContext(invoiceRow);
        if (!canReversePayment(context.status)) {
          return failure("INVOICE_LOCKED", "This payment can no longer be reversed.");
        }

        await tx.paymentReversal.create({
          data: {
            businessId: input.businessId,
            paymentId: input.paymentId,
            reversedById: input.reversedById,
            reason: input.reason,
          },
          select: { id: true },
        });

        const nextAmounts = paymentAmounts(invoiceRow).map((payment) =>
          payment.id === input.paymentId ? { ...payment, reversed: true } : payment,
        );
        const nextStatus = derivePaymentStatus(
          context.totalAmount,
          nextAmounts,
          context.status === "OVERDUE" ? "OVERDUE" : "SENT",
        );
        const updated = await tx.invoice.updateMany({
          where: { id: paymentRow.invoiceId, businessId: input.businessId },
          data: { status: nextStatus },
        });
        if (updated.count !== 1) throw new Error("Invoice disappeared during reversal");

        const row = await findPaymentRow(tx, input.businessId, input.paymentId);
        if (!row) throw new Error("Payment disappeared after reversal");
        return { ok: true as const, payment: toRecord(row) };
      });
    } catch (error) {
      if (isReversalConflict(error)) {
        return failure(
          "PAYMENT_ALREADY_REVERSED",
          "This payment has already been reversed.",
        );
      }
      throw error;
    }
  },

  async findMany(businessId, query) {
    const where: Prisma.PaymentWhereInput = { businessId };
    if (query.invoiceId) where.invoiceId = query.invoiceId;
    if (query.customerId) where.invoice = { customerId: query.customerId };
    if (query.method) where.method = query.method;
    if (query.status === "RECORDED") where.paymentReversals = { none: {} };
    if (query.status === "REVERSED") where.paymentReversals = { some: {} };
    if (query.search) {
      const contains = { contains: query.search, mode: "insensitive" as const };
      where.OR = [
        { transactionReference: contains },
        { notes: contains },
        { invoice: { invoiceNumber: contains } },
        { invoice: { customer: { name: contains } } },
        { invoice: { customer: { companyName: contains } } },
      ];
    }
    const dateFilter: Prisma.DateTimeFilter<"Payment"> = {};
    if (query.fromDate) dateFilter.gte = new Date(`${query.fromDate}T00:00:00.000Z`);
    if (query.toDate) dateFilter.lte = new Date(`${query.toDate}T00:00:00.000Z`);
    if (Object.keys(dateFilter).length > 0) where.paymentDate = dateFilter;

    const orderBy: Prisma.PaymentOrderByWithRelationInput = {
      [query.sort]: query.direction,
    };

    const [rows, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: DETAIL_INCLUDE,
      }),
      prisma.payment.count({ where }),
    ]);

    return {
      items: rows.map(toRecord),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  },

  async findManyForInvoice(businessId, invoiceId, query) {
    return this.findMany(businessId, { ...query, invoiceId });
  },

  async findById(businessId, paymentId) {
    const row = await findPaymentRow(prisma, businessId, paymentId);
    return row ? toDetail(row) : null;
  },
};

export const paymentRepository = prismaPaymentRepository;
