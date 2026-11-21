// Server-only data access for customers. Every method requires an explicit
// businessId: there is intentionally no way to address a customer by id alone.
import { Prisma } from "@/generated/prisma/client";
import type {
  CreateCustomerInput,
  ListCustomersQuery,
  UpdateCustomerInput,
} from "@/lib/validations/customer";
import { prisma } from "@/server/database/connection";
import type {
  CustomerDetail,
  CustomerListItem,
  CustomerListResult,
  CustomerRecord,
} from "@/types/customer";

type CustomerRow = {
  id: string;
  businessId: string;
  name: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  address: string | null;
  notes: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type CustomerListRow = CustomerRow & { _count: { invoices: number } };

type InvoiceForSummary = {
  id: string;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  status: string;
  totalAmount: Prisma.Decimal;
  payments: {
    amount: Prisma.Decimal;
    paymentReversals: { id: string }[];
  }[];
};

export type CreateCustomerRecord = CreateCustomerInput & { businessId: string };

export interface CustomerRepository {
  create(input: CreateCustomerRecord): Promise<CustomerRecord>;
  findMany(businessId: string, query: ListCustomersQuery): Promise<CustomerListResult>;
  findById(businessId: string, customerId: string): Promise<CustomerDetail | null>;
  findBaseById(businessId: string, customerId: string): Promise<CustomerRecord | null>;
  update(
    businessId: string,
    customerId: string,
    input: UpdateCustomerInput,
  ): Promise<CustomerRecord | null>;
  archive(businessId: string, customerId: string): Promise<CustomerRecord | null>;
}

function toRecord(row: CustomerRow): CustomerRecord {
  return {
    id: row.id,
    businessId: row.businessId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    companyName: row.companyName,
    address: row.address,
    notes: row.notes,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toListItem(row: CustomerListRow): CustomerListItem {
  return { ...toRecord(row), invoiceCount: row._count.invoices };
}

function sum(values: Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((total, value) => total.plus(value), new Prisma.Decimal(0));
}

function paidAmount(invoice: InvoiceForSummary): Prisma.Decimal {
  // A reversal is append-only and reverses the whole payment, so reversed
  // payments are excluded from the amount actually received.
  return sum(
    invoice.payments
      .filter((payment) => payment.paymentReversals.length === 0)
      .map((payment) => payment.amount),
  );
}

function toDetail(row: CustomerRow & { invoices: InvoiceForSummary[] }): CustomerDetail {
  // Only issued invoices contribute to the customer's financial summary.
  // DRAFT invoices are not yet a receivable, and VOID invoices are retained as
  // history but no longer represent an obligation. Both stay in the invoice
  // list below so the profile remains a complete record.
  const activeInvoices = row.invoices.filter(
    (invoice) => invoice.status !== "VOID" && invoice.status !== "DRAFT",
  );
  const totalInvoiced = sum(activeInvoices.map((invoice) => invoice.totalAmount));
  const totalPaymentsReceived = sum(activeInvoices.map(paidAmount));
  const outstandingAmount = totalInvoiced.minus(totalPaymentsReceived);

  return {
    ...toRecord(row),
    financials: {
      totalInvoiced: totalInvoiced.toFixed(2),
      totalPaymentsReceived: totalPaymentsReceived.toFixed(2),
      outstandingAmount: outstandingAmount.toFixed(2),
      invoiceCount: row.invoices.length,
      // OVERDUE is the stored, service-refreshed value from the schema; it is
      // not recomputed here because the business timezone is not available.
      overdueInvoiceCount: row.invoices.filter((invoice) => invoice.status === "OVERDUE").length,
    },
    invoices: row.invoices.map((invoice) => {
      const amountPaid = paidAmount(invoice);
      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        issueDate: invoice.issueDate.toISOString().slice(0, 10),
        dueDate: invoice.dueDate.toISOString().slice(0, 10),
        status: invoice.status,
        totalAmount: invoice.totalAmount.toFixed(2),
        amountPaid: amountPaid.toFixed(2),
        outstandingAmount: invoice.totalAmount.minus(amountPaid).toFixed(2),
      };
    }),
  };
}

export const prismaCustomerRepository: CustomerRepository = {
  async create(input) {
    const row = await prisma.customer.create({
      data: {
        businessId: input.businessId,
        name: input.name,
        email: input.email,
        phone: input.phone,
        companyName: input.companyName,
        address: input.address,
        notes: input.notes,
      },
    });
    return toRecord(row);
  },

  async findMany(businessId, query) {
    const archivedFilter =
      query.status === "active"
        ? { archivedAt: null }
        : query.status === "archived"
          ? { archivedAt: { not: null } }
          : {};

    const searchFilter = query.search
      ? {
          OR: ["name", "email", "phone", "companyName"].map((field) => ({
            [field]: { contains: query.search, mode: "insensitive" as const },
          })),
        }
      : {};

    const where: Prisma.CustomerWhereInput = {
      businessId,
      ...archivedFilter,
      ...searchFilter,
    };
    const orderBy: Prisma.CustomerOrderByWithRelationInput = {
      [query.sort]: query.direction,
    };

    const [rows, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          businessId: true,
          name: true,
          email: true,
          phone: true,
          companyName: true,
          address: true,
          notes: true,
          archivedAt: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { invoices: true } },
        },
      }),
      prisma.customer.count({ where }),
    ]);

    return {
      items: rows.map(toListItem),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  },

  async findById(businessId, customerId) {
    const row = await prisma.customer.findFirst({
      where: { id: customerId, businessId },
      include: {
        invoices: {
          orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
          include: {
            payments: {
              select: {
                amount: true,
                paymentReversals: { select: { id: true } },
              },
            },
          },
        },
      },
    });

    return row ? toDetail(row) : null;
  },

  async findBaseById(businessId, customerId) {
    const row = await prisma.customer.findFirst({ where: { id: customerId, businessId } });
    return row ? toRecord(row) : null;
  },

  async update(businessId, customerId, input) {
    const result = await prisma.customer.updateMany({
      where: { id: customerId, businessId },
      data: input,
    });
    if (result.count === 0) return null;
    return this.findBaseById(businessId, customerId);
  },

  async archive(businessId, customerId) {
    const result = await prisma.customer.updateMany({
      where: { id: customerId, businessId },
      data: { archivedAt: new Date() },
    });
    if (result.count === 0) return null;
    return this.findBaseById(businessId, customerId);
  },
};
