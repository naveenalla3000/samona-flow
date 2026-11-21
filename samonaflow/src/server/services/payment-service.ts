// Server-only application service for Payment Management.
//
// Every operation first requires a verified business membership. User identity
// for reversals comes only from the authenticated session, never from a
// request body. All balances and statuses are recalculated on the server; the
// repository re-checks them inside a row-locking transaction before writing.
import { paymentFitsOutstanding, type PaymentAmount } from "@/lib/payment-math";
import { canRecordPayment, canReversePayment } from "@/lib/payment-status";
import type {
  CreatePaymentInput,
  ListPaymentsQuery,
  ReversePaymentInput,
} from "@/lib/validations/payment";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import {
  prismaBusinessMembershipRepository,
  type BusinessMembershipRepository,
} from "@/server/repositories/business-membership-repository";
import {
  prismaPaymentRepository,
  type PaymentMutationResult,
  type PaymentRepository,
} from "@/server/repositories/payment-repository";
import type {
  PaymentDetail,
  PaymentListResult,
  PaymentRecord,
} from "@/types/payment";

export type PaymentServiceErrorCode =
  | "BUSINESS_FORBIDDEN"
  | "INVOICE_NOT_FOUND"
  | "INVOICE_LOCKED"
  | "PAYMENT_NOT_FOUND"
  | "PAYMENT_EXCEEDS_OUTSTANDING"
  | "PAYMENT_ALREADY_REVERSED";

export class PaymentServiceError extends Error {
  readonly code: PaymentServiceErrorCode;

  constructor(code: PaymentServiceErrorCode, message: string) {
    super(message);
    this.name = "PaymentServiceError";
    this.code = code;
  }
}

export interface PaymentService {
  create(user: AuthenticatedUser, businessId: string, input: CreatePaymentInput): Promise<PaymentRecord>;
  list(user: AuthenticatedUser, businessId: string, query: ListPaymentsQuery): Promise<PaymentListResult>;
  listForInvoice(
    user: AuthenticatedUser,
    businessId: string,
    invoiceId: string,
    query: ListPaymentsQuery,
  ): Promise<PaymentListResult>;
  get(user: AuthenticatedUser, businessId: string, paymentId: string): Promise<PaymentDetail>;
  reverse(
    user: AuthenticatedUser,
    businessId: string,
    paymentId: string,
    input: ReversePaymentInput,
  ): Promise<PaymentRecord>;
}

function unwrap(result: PaymentMutationResult): PaymentRecord {
  if (result.ok) return result.payment;
  throw new PaymentServiceError(result.code, result.message);
}

export function createPaymentService(dependencies: {
  memberships: BusinessMembershipRepository;
  payments: PaymentRepository;
}): PaymentService {
  const { memberships, payments } = dependencies;

  async function requireMembership(user: AuthenticatedUser, businessId: string): Promise<void> {
    const membership = await memberships.findMembership(user.id, businessId);
    if (!membership) {
      throw new PaymentServiceError(
        "BUSINESS_FORBIDDEN",
        "You do not have access to this business.",
      );
    }
  }

  return {
    async create(user, businessId, input) {
      await requireMembership(user, businessId);

      const invoice = await payments.findInvoiceContext(businessId, input.invoiceId);
      if (!invoice) {
        throw new PaymentServiceError("INVOICE_NOT_FOUND", "Invoice not found.");
      }
      if (!canRecordPayment(invoice.status)) {
        throw new PaymentServiceError(
          "INVOICE_LOCKED",
          "Payments can only be recorded against sent, partially paid or overdue invoices.",
        );
      }
      // Friendly early check. The repository repeats this check inside its
      // transaction so concurrent requests cannot both spend the same balance.
      const currentAmounts: PaymentAmount[] = [
        { amount: invoice.amountPaid, reversed: false },
      ];
      if (!paymentFitsOutstanding(input.amount, invoice.totalAmount, currentAmounts)) {
        throw new PaymentServiceError(
          "PAYMENT_EXCEEDS_OUTSTANDING",
          "Payment amount cannot exceed the outstanding balance.",
        );
      }

      return unwrap(await payments.create({ ...input, businessId }));
    },

    async list(user, businessId, query) {
      await requireMembership(user, businessId);
      return payments.findMany(businessId, query);
    },

    async listForInvoice(user, businessId, invoiceId, query) {
      await requireMembership(user, businessId);
      const invoice = await payments.findInvoiceContext(businessId, invoiceId);
      if (!invoice) {
        throw new PaymentServiceError("INVOICE_NOT_FOUND", "Invoice not found.");
      }
      return payments.findManyForInvoice(businessId, invoiceId, query);
    },

    async get(user, businessId, paymentId) {
      await requireMembership(user, businessId);
      const payment = await payments.findById(businessId, paymentId);
      if (!payment) {
        throw new PaymentServiceError("PAYMENT_NOT_FOUND", "Payment not found.");
      }
      return payment;
    },

    async reverse(user, businessId, paymentId, input) {
      await requireMembership(user, businessId);
      const existing = await payments.findById(businessId, paymentId);
      if (!existing) {
        throw new PaymentServiceError("PAYMENT_NOT_FOUND", "Payment not found.");
      }
      if (existing.status === "REVERSED") {
        throw new PaymentServiceError(
          "PAYMENT_ALREADY_REVERSED",
          "This payment has already been reversed.",
        );
      }
      if (!canReversePayment(existing.invoice.status)) {
        throw new PaymentServiceError(
          "INVOICE_LOCKED",
          "This payment can no longer be reversed.",
        );
      }

      return unwrap(
        await payments.reverse({
          businessId,
          paymentId,
          reason: input.reason,
          reversedById: user.id,
        }),
      );
    },
  };
}

export const paymentService = createPaymentService({
  memberships: prismaBusinessMembershipRepository,
  payments: prismaPaymentRepository,
});
