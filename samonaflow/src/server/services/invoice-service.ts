// Server-only application service for Invoice Management.
//
// Authorization is enforced here on every operation using the verified session
// identity. A businessId is never trusted without a matching membership row,
// every invoice/customer lookup is scoped by that business, and all money is
// recalculated on the server from validated inputs.
import { businessLocalDate } from "@/lib/business-date";
import {
  calculateInvoiceTotals,
  MAX_MONEY_CENTS,
  parseMoney,
  parseSignedMoney,
} from "@/lib/invoice-math";
import { canEditInvoice, canSendInvoice, canVoidInvoice } from "@/lib/invoice-status";
import type { CreateInvoiceInput, ListInvoicesQuery, UpdateInvoiceInput } from "@/lib/validations/invoice";
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import {
  prismaBusinessMembershipRepository,
  type BusinessMembershipRepository,
} from "@/server/repositories/business-membership-repository";
import {
  prismaCustomerRepository,
  type CustomerRepository,
} from "@/server/repositories/customer-repository";
import {
  prismaInvoiceRepository,
  type InvoiceMutation,
  type InvoiceRepository,
} from "@/server/repositories/invoice-repository";
import type { InvoiceDetail, InvoiceListResult, InvoiceRecord } from "@/types/invoice";

export type InvoiceServiceErrorCode =
  | "BUSINESS_FORBIDDEN"
  | "CUSTOMER_NOT_FOUND"
  | "INVOICE_NOT_FOUND"
  | "INVALID_INPUT"
  | "INVALID_AMOUNTS"
  | "INVOICE_LOCKED"
  | "INVALID_TRANSITION"
  | "CONFLICT";

export class InvoiceServiceError extends Error {
  readonly code: InvoiceServiceErrorCode;

  constructor(code: InvoiceServiceErrorCode, message: string) {
    super(message);
    this.name = "InvoiceServiceError";
    this.code = code;
  }
}

export interface InvoiceService {
  create(user: AuthenticatedUser, businessId: string, input: CreateInvoiceInput): Promise<InvoiceRecord>;
  list(user: AuthenticatedUser, businessId: string, query: ListInvoicesQuery): Promise<InvoiceListResult>;
  get(user: AuthenticatedUser, businessId: string, invoiceId: string): Promise<InvoiceDetail>;
  update(
    user: AuthenticatedUser,
    businessId: string,
    invoiceId: string,
    input: UpdateInvoiceInput,
  ): Promise<InvoiceRecord>;
  send(user: AuthenticatedUser, businessId: string, invoiceId: string): Promise<InvoiceRecord>;
  void(user: AuthenticatedUser, businessId: string, invoiceId: string): Promise<InvoiceRecord>;
}

function isUniqueConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (error as { code?: unknown }).code === "P2002";
}

function assertValidAmounts(totals: {
  subtotal: string;
  discount: string;
  tax: string;
  totalAmount: string;
}): void {
  const subtotal = parseMoney(totals.subtotal);
  const discount = parseMoney(totals.discount);
  const tax = parseMoney(totals.tax);
  const total = parseSignedMoney(totals.totalAmount);

  // These mirror the applied DB CHECK constraints so clients get a clear error
  // instead of an opaque database failure.
  if (discount > subtotal) {
    throw new InvoiceServiceError("INVALID_AMOUNTS", "Discount cannot exceed the subtotal.");
  }
  if (total < BigInt(0)) {
    throw new InvoiceServiceError("INVALID_AMOUNTS", "The invoice total cannot be negative.");
  }
  for (const [label, value] of [
    ["subtotal", subtotal],
    ["discount", discount],
    ["tax", tax],
    ["total", total],
  ] as const) {
    if (value > MAX_MONEY_CENTS) {
      throw new InvoiceServiceError(
        "INVALID_AMOUNTS",
        `The invoice ${label} exceeds the maximum supported amount of 9999999999.99.`,
      );
    }
  }
}

export function createInvoiceService(dependencies: {
  memberships: BusinessMembershipRepository;
  customers: CustomerRepository;
  invoices: InvoiceRepository;
}): InvoiceService {
  const { memberships, customers, invoices } = dependencies;

  async function requireMembership(user: AuthenticatedUser, businessId: string) {
    const membership = await memberships.findMembership(user.id, businessId);
    if (!membership) {
      throw new InvoiceServiceError(
        "BUSINESS_FORBIDDEN",
        "You do not have access to this business.",
      );
    }
    return membership;
  }

  async function requireCustomer(businessId: string, customerId: string) {
    const customer = await customers.findBaseById(businessId, customerId);
    if (!customer) {
      throw new InvoiceServiceError("CUSTOMER_NOT_FOUND", "Customer not found in this business.");
    }
    return customer;
  }

  function buildMutation(input: {
    customerId: string;
    issueDate: string;
    dueDate: string;
    currency?: string | undefined;
    notes?: string | null;
    discount?: string | undefined;
    tax?: string | undefined;
    items: { description: string; quantity: string; unitPrice: string }[];
  }, currency: string): InvoiceMutation {
    if (input.dueDate < input.issueDate) {
      throw new InvoiceServiceError(
        "INVALID_INPUT",
        "Due date must be on or after the issue date.",
      );
    }
    const totals = calculateInvoiceTotals(
      input.items,
      input.discount ?? "0.00",
      input.tax ?? "0.00",
    );
    assertValidAmounts(totals);
    return {
      customerId: input.customerId,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      currency,
      notes: input.notes ?? null,
      discount: totals.discount,
      tax: totals.tax,
      subtotal: totals.subtotal,
      totalAmount: totals.totalAmount,
      items: input.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        // Recomputed here; a client-submitted line total is never accepted.
        lineTotal: calculateInvoiceTotals([item], "0.00", "0.00").subtotal,
      })),
    };
  }

  return {
    async create(user, businessId, input) {
      await requireMembership(user, businessId);
      await requireCustomer(businessId, input.customerId);

      const profile = await invoices.findBusinessProfile(businessId);
      if (!profile) {
        throw new InvoiceServiceError("BUSINESS_FORBIDDEN", "Business not found.");
      }
      const mutation = buildMutation(input, input.currency ?? profile.currency);

      try {
        return await invoices.create({ ...mutation, businessId });
      } catch (error) {
        if (isUniqueConflict(error)) {
          throw new InvoiceServiceError(
            "CONFLICT",
            "An invoice with this number already exists. Please retry.",
          );
        }
        throw error;
      }
    },

    async list(user, businessId, query) {
      await requireMembership(user, businessId);
      return invoices.findMany(businessId, query);
    },

    async get(user, businessId, invoiceId) {
      await requireMembership(user, businessId);
      const invoice = await invoices.findById(businessId, invoiceId);
      if (!invoice) {
        throw new InvoiceServiceError("INVOICE_NOT_FOUND", "Invoice not found.");
      }
      return invoice;
    },

    async update(user, businessId, invoiceId, input) {
      await requireMembership(user, businessId);
      const existing = await invoices.findBaseById(businessId, invoiceId);
      if (!existing) {
        throw new InvoiceServiceError("INVOICE_NOT_FOUND", "Invoice not found.");
      }
      if (!canEditInvoice(existing.status)) {
        throw new InvoiceServiceError(
          "INVOICE_LOCKED",
          "Only draft invoices can be edited. Issued, paid and voided invoices are locked.",
        );
      }

      const customerId = input.customerId ?? existing.customerId;
      if (input.customerId && input.customerId !== existing.customerId) {
        await requireCustomer(businessId, customerId);
      }
      const mutation = buildMutation(
        {
          customerId,
          issueDate: input.issueDate ?? existing.issueDate,
          dueDate: input.dueDate ?? existing.dueDate,
          currency: input.currency ?? existing.currency,
          notes: input.notes === undefined ? existing.notes : input.notes,
          discount: input.discount ?? existing.discount,
          tax: input.tax ?? existing.tax,
          items: input.items,
        },
        input.currency ?? existing.currency,
      );

      const updated = await invoices.update(businessId, invoiceId, mutation);
      if (!updated) {
        // The invoice left DRAFT between the read and the guarded write.
        throw new InvoiceServiceError(
          "INVOICE_LOCKED",
          "This invoice is no longer editable.",
        );
      }
      return updated;
    },

    async send(user, businessId, invoiceId) {
      await requireMembership(user, businessId);
      const existing = await invoices.findBaseById(businessId, invoiceId);
      if (!existing) {
        throw new InvoiceServiceError("INVOICE_NOT_FOUND", "Invoice not found.");
      }
      if (!canSendInvoice(existing.status)) {
        throw new InvoiceServiceError(
          "INVALID_TRANSITION",
          `Cannot send an invoice in ${existing.status} status. Only drafts can be sent.`,
        );
      }
      const sent = await invoices.setStatus(businessId, invoiceId, "SENT", ["DRAFT"]);
      if (!sent) {
        throw new InvoiceServiceError("INVALID_TRANSITION", "This invoice is no longer a draft.");
      }
      return sent;
    },

    async void(user, businessId, invoiceId) {
      await requireMembership(user, businessId);
      const existing = await invoices.findBaseById(businessId, invoiceId);
      if (!existing) {
        throw new InvoiceServiceError("INVOICE_NOT_FOUND", "Invoice not found.");
      }
      if (!canVoidInvoice(existing.status)) {
        throw new InvoiceServiceError(
          "INVALID_TRANSITION",
          `Cannot void an invoice in ${existing.status} status. Only sent, partially paid or overdue invoices can be voided.`,
        );
      }
      const voided = await invoices.setStatus(businessId, invoiceId, "VOID", [
        "SENT",
        "PARTIALLY_PAID",
        "OVERDUE",
      ]);
      if (!voided) {
        throw new InvoiceServiceError("INVALID_TRANSITION", "This invoice can no longer be voided.");
      }
      return voided;
    },
  };
}

export const invoiceService = createInvoiceService({
  memberships: prismaBusinessMembershipRepository,
  customers: prismaCustomerRepository,
  invoices: prismaInvoiceRepository,
});

// Re-exported for UI default dates and tests.
export { businessLocalDate };
