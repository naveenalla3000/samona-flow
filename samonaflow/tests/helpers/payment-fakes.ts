import { deriveDisplayStatus } from "@/lib/invoice-status";
import {
  calculatePaymentSummary,
  derivePaymentStatus,
  paymentFitsOutstanding,
} from "@/lib/payment-math";
import { canRecordPayment, canReversePayment } from "@/lib/payment-status";
import type { ListPaymentsQuery } from "@/lib/validations/payment";
import type {
  CreatePaymentRecord,
  PaymentMutationResult,
  PaymentRepository,
  ReversePaymentRecord,
} from "@/server/repositories/payment-repository";
import type {
  PaymentDetail,
  PaymentInvoiceContext,
  PaymentListResult,
  PaymentRecord,
  PaymentReversalRecord,
} from "@/types/payment";
import { BUSINESS_A, CUSTOMER_A } from "./fakes";

export const PAYMENT_A = "70000000-0000-4000-8000-000000000001";
export const PAYMENT_B = "70000000-0000-4000-8000-000000000002";
export const INVOICE_FOR_PAYMENT = "50000000-0000-4000-8000-000000000001";
export const TODAY = "2026-06-15";

const key = (businessId: string, id: string) => `${businessId}:${id}`;

type StoredPayment = Omit<
  PaymentRecord,
  "invoiceNumber" | "customerName" | "customerCompanyName" | "currency" | "status"
> & {
  status: PaymentRecord["status"];
  reversal: PaymentReversalRecord | null;
};

type StoredInvoice = PaymentInvoiceContext & {
  payments: StoredPayment[];
};

export function makePaymentInvoiceContext(
  overrides: Partial<PaymentInvoiceContext> = {},
): PaymentInvoiceContext {
  const base: PaymentInvoiceContext = {
    id: INVOICE_FOR_PAYMENT,
    businessId: BUSINESS_A,
    invoiceNumber: "INV-2026-0001",
    customerId: CUSTOMER_A,
    customerName: "Acme Studio",
    customerCompanyName: null,
    status: "SENT",
    displayStatus: "SENT",
    currency: "INR",
    dueDate: "2026-06-30",
    totalAmount: "100.00",
    amountPaid: "0.00",
    outstandingAmount: "100.00",
  };
  const context = { ...base, ...overrides };
  return {
    ...context,
    displayStatus: deriveDisplayStatus(
      context.status,
      context.dueDate,
      context.outstandingAmount,
      TODAY,
    ),
  };
}

function failure(code: Extract<PaymentMutationResult, { ok: false }>["code"], message: string): PaymentMutationResult {
  return { ok: false, code, message };
}

/**
 * In-memory payment repository with composite `(businessId, id)` keys, an
 * append-only reversal list and the same re-check/concurrency guarantees as
 * the row-locking Prisma repository.
 */
export function createFakePaymentRepository(seed: PaymentInvoiceContext[] = []) {
  const invoices = new Map<string, StoredInvoice>();
  const payments = new Map<string, StoredPayment>();
  let nextId = 1;
  let nextReversalId = 1;
  let failNextCreate = false;
  let concurrencyBarrier = false;
  const waiters: (() => void)[] = [];

  for (const context of seed) {
    invoices.set(key(context.businessId, context.id), { ...context, payments: [] });
  }

  async function yieldForCreate(): Promise<void> {
    if (!concurrencyBarrier) {
      await Promise.resolve();
      return;
    }
    await new Promise<void>((resolve) => {
      waiters.push(resolve);
      if (waiters.length === 2) {
        concurrencyBarrier = false;
        for (const release of waiters.splice(0)) release();
      }
    });
  }

  function contextOf(invoice: StoredInvoice): PaymentInvoiceContext {
    return {
      id: invoice.id,
      businessId: invoice.businessId,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      customerCompanyName: invoice.customerCompanyName,
      status: invoice.status,
      displayStatus: invoice.displayStatus,
      currency: invoice.currency,
      dueDate: invoice.dueDate,
      totalAmount: invoice.totalAmount,
      amountPaid: invoice.amountPaid,
      outstandingAmount: invoice.outstandingAmount,
    };
  }

  function recompute(invoice: StoredInvoice): void {
    const amounts = invoice.payments.map((payment) => ({
      amount: payment.amount,
      reversed: Boolean(payment.reversal),
    }));
    const summary = calculatePaymentSummary(invoice.totalAmount, amounts);
    invoice.amountPaid = summary.amountPaid;
    invoice.outstandingAmount = summary.outstandingAmount;
    invoice.status = derivePaymentStatus(
      invoice.totalAmount,
      amounts,
      invoice.status === "OVERDUE" ? "OVERDUE" : "SENT",
    );
    invoice.displayStatus = deriveDisplayStatus(
      invoice.status,
      invoice.dueDate,
      invoice.outstandingAmount,
      TODAY,
    );
  }

  function toRecord(payment: StoredPayment): PaymentRecord {
    const invoice = invoices.get(key(payment.businessId, payment.invoiceId));
    if (!invoice) throw new Error("Payment invoice missing from fake repository");
    return {
      id: payment.id,
      businessId: payment.businessId,
      invoiceId: payment.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      customerCompanyName: invoice.customerCompanyName,
      amount: payment.amount,
      paymentDate: payment.paymentDate,
      method: payment.method,
      transactionReference: payment.transactionReference,
      notes: payment.notes,
      currency: invoice.currency,
      status: payment.reversal ? "REVERSED" : "RECORDED",
      reversal: payment.reversal ? { ...payment.reversal } : null,
      createdAt: payment.createdAt,
    };
  }

  function toDetail(payment: StoredPayment): PaymentDetail {
    const record = toRecord(payment);
    const invoice = contextOf(invoices.get(key(payment.businessId, payment.invoiceId))!);
    return {
      ...record,
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        displayStatus: invoice.displayStatus,
        currency: invoice.currency,
        dueDate: invoice.dueDate,
        totalAmount: invoice.totalAmount,
        amountPaid: invoice.amountPaid,
        outstandingAmount: invoice.outstandingAmount,
      },
    };
  }

  function list(businessId: string, query: ListPaymentsQuery): PaymentListResult {
    let matches = [...payments.values()].filter((payment) => payment.businessId === businessId);
    if (query.invoiceId) matches = matches.filter((p) => p.invoiceId === query.invoiceId);
    if (query.method) matches = matches.filter((p) => p.method === query.method);
    if (query.status === "RECORDED") matches = matches.filter((p) => !p.reversal);
    if (query.status === "REVERSED") matches = matches.filter((p) => Boolean(p.reversal));
    if (query.customerId) {
      matches = matches.filter(
        (p) => invoices.get(key(p.businessId, p.invoiceId))?.customerId === query.customerId,
      );
    }
    if (query.fromDate) matches = matches.filter((p) => p.paymentDate >= query.fromDate!);
    if (query.toDate) matches = matches.filter((p) => p.paymentDate <= query.toDate!);
    if (query.search) {
      const needle = query.search.toLowerCase();
      matches = matches.filter((p) => {
        const invoice = invoices.get(key(p.businessId, p.invoiceId));
        return [
          p.transactionReference ?? "",
          p.notes ?? "",
          invoice?.invoiceNumber ?? "",
          invoice?.customerName ?? "",
          invoice?.customerCompanyName ?? "",
        ].some((value) => value.toLowerCase().includes(needle));
      });
    }

    matches.sort((a, b) => {
      const left = query.sort === "amount" ? a.amount : a[query.sort];
      const right = query.sort === "amount" ? b.amount : b[query.sort];
      const result = String(left).localeCompare(String(right));
      return query.direction === "asc" ? result : -result;
    });

    const total = matches.length;
    const start = (query.page - 1) * query.pageSize;
    return {
      items: matches.slice(start, start + query.pageSize).map(toRecord),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  const repository: PaymentRepository = {
    async findInvoiceContext(businessId, invoiceId) {
      const invoice = invoices.get(key(businessId, invoiceId));
      return invoice ? contextOf(invoice) : null;
    },

    async create(input: CreatePaymentRecord) {
      const k = key(input.businessId, input.invoiceId);
      const invoice = invoices.get(k);
      if (!invoice) return failure("INVOICE_NOT_FOUND", "Invoice not found.");
      if (!canRecordPayment(invoice.status)) {
        return failure("INVOICE_LOCKED", "Invoice is locked for payments.");
      }
      const amounts = () =>
        invoice.payments.map((p) => ({ amount: p.amount, reversed: Boolean(p.reversal) }));
      if (!paymentFitsOutstanding(input.amount, invoice.totalAmount, amounts())) {
        return failure("PAYMENT_EXCEEDS_OUTSTANDING", "Payment exceeds outstanding.");
      }

      // Force both concurrent requests past the first check before either
      // commits, then repeat the check just like the row-locking repository.
      await yieldForCreate();
      if (!paymentFitsOutstanding(input.amount, invoice.totalAmount, amounts())) {
        return failure("PAYMENT_EXCEEDS_OUTSTANDING", "Payment exceeds outstanding.");
      }
      if (failNextCreate) {
        failNextCreate = false;
        throw new Error("simulated transaction failure");
      }

      const id = `70000000-0000-4000-8000-${String(nextId).padStart(12, "0")}`;
      nextId += 1;
      const payment: StoredPayment = {
        id,
        businessId: input.businessId,
        invoiceId: input.invoiceId,
        customerId: invoice.customerId,
        amount: input.amount,
        paymentDate: input.paymentDate,
        method: input.method,
        transactionReference: input.transactionReference,
        notes: input.notes,
        createdAt: "2026-06-10T00:00:00.000Z",
        status: "RECORDED",
        reversal: null,
      };
      payments.set(key(payment.businessId, payment.id), payment);
      invoice.payments.push(payment);
      recompute(invoice);
      return { ok: true, payment: toRecord(payment) };
    },

    async reverse(input: ReversePaymentRecord) {
      const k = key(input.businessId, input.paymentId);
      const payment = payments.get(k);
      if (!payment) return failure("PAYMENT_NOT_FOUND", "Payment not found.");
      if (payment.reversal) {
        return failure("PAYMENT_ALREADY_REVERSED", "Payment already reversed.");
      }
      const invoice = invoices.get(key(input.businessId, payment.invoiceId));
      if (!invoice) return failure("INVOICE_NOT_FOUND", "Invoice not found.");
      if (!canReversePayment(invoice.status)) {
        return failure("INVOICE_LOCKED", "Invoice is locked for reversals.");
      }

      payment.reversal = {
        id: `71000000-0000-4000-8000-${String(nextReversalId).padStart(12, "0")}`,
        businessId: input.businessId,
        paymentId: input.paymentId,
        reversedById: input.reversedById,
        reversedByEmail: "owner-a@example.com",
        reason: input.reason,
        reversedAt: "2026-06-11T00:00:00.000Z",
        createdAt: "2026-06-11T00:00:00.000Z",
      };
      nextReversalId += 1;
      payment.status = "REVERSED";
      recompute(invoice);
      return { ok: true, payment: toRecord(payment) };
    },

    async findMany(businessId, query) {
      return list(businessId, query);
    },

    async findManyForInvoice(businessId, invoiceId, query) {
      return list(businessId, { ...query, invoiceId });
    },

    async findById(businessId, paymentId) {
      const payment = payments.get(key(businessId, paymentId));
      return payment ? toDetail(payment) : null;
    },
  };

  return {
    repository,
    seedInvoice(context: PaymentInvoiceContext) {
      invoices.set(key(context.businessId, context.id), { ...context, payments: [] });
    },
    getInvoice(businessId: string, invoiceId: string) {
      const invoice = invoices.get(key(businessId, invoiceId));
      return invoice ? contextOf(invoice) : null;
    },
    setInvoiceStatus(businessId: string, invoiceId: string, status: PaymentInvoiceContext["status"]) {
      const invoice = invoices.get(key(businessId, invoiceId));
      if (!invoice) return;
      invoice.status = status;
      invoice.displayStatus = status;
    },
    getPayment(businessId: string, paymentId: string) {
      const payment = payments.get(key(businessId, paymentId));
      return payment ? toRecord(payment) : null;
    },
    count() {
      return payments.size;
    },
    failNextCreate() {
      failNextCreate = true;
    },
    enableConcurrencyBarrier() {
      concurrencyBarrier = true;
    },
  };
}
