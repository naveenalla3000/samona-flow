import type { AuthenticatedUser } from "@/server/auth/auth-types";
import type { BusinessMembershipRepository } from "@/server/repositories/business-membership-repository";
import type {
  CreateCustomerRecord,
  CustomerRepository,
} from "@/server/repositories/customer-repository";
import type { ListCustomersQuery, UpdateCustomerInput } from "@/lib/validations/customer";
import type {
  CustomerDetail,
  CustomerListItem,
  CustomerListResult,
  CustomerRecord,
} from "@/types/customer";

export const USER_A: AuthenticatedUser = {
  id: "10000000-0000-4000-8000-000000000001",
  email: "owner-a@example.com",
};
export const USER_B: AuthenticatedUser = {
  id: "10000000-0000-4000-8000-000000000002",
  email: "owner-b@example.com",
};
export const BUSINESS_A = "20000000-0000-4000-8000-000000000001";
export const BUSINESS_B = "20000000-0000-4000-8000-000000000002";
export const CUSTOMER_A = "30000000-0000-4000-8000-000000000001";
export const CUSTOMER_B = "30000000-0000-4000-8000-000000000002";

const NOW = "2026-01-01T00:00:00.000Z";

export function makeCustomerRecord(overrides: Partial<CustomerRecord> = {}): CustomerRecord {
  return {
    id: "40000000-0000-4000-8000-000000000001",
    businessId: BUSINESS_A,
    name: "Acme Studio",
    email: "hello@acme.test",
    phone: null,
    companyName: null,
    address: null,
    notes: null,
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export type FakeInvoice = {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  status: string;
  totalAmount: string;
  amountPaid: string;
};

/** In-memory membership repository with a fixed, explicit membership set. */
export function createFakeMemberships(
  memberships: { userId: string; businessId: string }[] = [
    { userId: USER_A.id, businessId: BUSINESS_A },
    { userId: USER_B.id, businessId: BUSINESS_B },
  ],
): BusinessMembershipRepository {
  return {
    async findMembership(userId, businessId) {
      const found = memberships.find((m) => m.userId === userId && m.businessId === businessId);
      return found ? { ...found, role: "OWNER" } : null;
    },
    async findFirstForUser(userId) {
      const found = memberships.find((m) => m.userId === userId);
      return found ? { ...found, role: "OWNER" } : null;
    },
  };
}

/**
 * In-memory customer repository. The composite `${businessId}:${id}` key means
 * a customer can never be addressed across businesses, mirroring the real
 * repository's `where: { id, businessId }` queries.
 */
export function createFakeCustomers(seed: CustomerRecord[] = []) {
  const rows = new Map<string, CustomerRecord>();
  const invoices = new Map<string, FakeInvoice[]>();
  for (const row of seed) rows.set(`${row.businessId}:${row.id}`, structuredClone(row));

  const key = (businessId: string, id: string) => `${businessId}:${id}`;

  const repository: CustomerRepository = {
    async create(input: CreateCustomerRecord) {
      const row = makeCustomerRecord({
        ...input,
        id: `40000000-0000-4000-8000-00000000${String(rows.size + 1).padStart(4, "0")}`,
      });
      rows.set(key(row.businessId, row.id), row);
      return row;
    },

    async findMany(businessId, query: ListCustomersQuery): Promise<CustomerListResult> {
      let matches = [...rows.values()].filter((row) => row.businessId === businessId);

      if (query.status === "active") matches = matches.filter((row) => !row.archivedAt);
      if (query.status === "archived") matches = matches.filter((row) => row.archivedAt);

      if (query.search) {
        const needle = query.search.toLowerCase();
        matches = matches.filter((row) =>
          [row.name, row.email, row.phone, row.companyName].some((value) =>
            value?.toLowerCase().includes(needle),
          ),
        );
      }

      matches.sort((a, b) => {
        const left = (a[query.sort] ?? "").toString().toLowerCase();
        const right = (b[query.sort] ?? "").toString().toLowerCase();
        const result = left.localeCompare(right);
        return query.direction === "asc" ? result : -result;
      });

      const total = matches.length;
      const start = (query.page - 1) * query.pageSize;
      const pageRows = matches.slice(start, start + query.pageSize);

      const items: CustomerListItem[] = pageRows.map((row) => ({
        ...row,
        invoiceCount: invoices.get(key(row.businessId, row.id))?.length ?? 0,
      }));

      return {
        items,
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.ceil(total / query.pageSize),
      };
    },

    async findById(businessId, customerId): Promise<CustomerDetail | null> {
      const row = rows.get(key(businessId, customerId));
      if (!row) return null;

      const customerInvoices = invoices.get(key(businessId, customerId)) ?? [];
      const active = customerInvoices.filter((invoice) => invoice.status !== "VOID");
      const totalInvoiced = active.reduce((sum, i) => sum + Number(i.totalAmount), 0);
      const totalPaymentsReceived = active.reduce((sum, i) => sum + Number(i.amountPaid), 0);

      return {
        ...row,
        financials: {
          totalInvoiced: totalInvoiced.toFixed(2),
          totalPaymentsReceived: totalPaymentsReceived.toFixed(2),
          outstandingAmount: (totalInvoiced - totalPaymentsReceived).toFixed(2),
          invoiceCount: customerInvoices.length,
          overdueInvoiceCount: active.filter((i) => i.status === "OVERDUE").length,
        },
        invoices: customerInvoices.map((invoice) => ({
          ...invoice,
          outstandingAmount: (Number(invoice.totalAmount) - Number(invoice.amountPaid)).toFixed(2),
        })),
      };
    },

    async findBaseById(businessId, customerId) {
      return rows.get(key(businessId, customerId)) ?? null;
    },

    async update(businessId, customerId, input: UpdateCustomerInput) {
      const existing = rows.get(key(businessId, customerId));
      if (!existing) return null;
      const updated = { ...existing, ...input, updatedAt: new Date().toISOString() };
      rows.set(key(businessId, customerId), updated);
      return updated;
    },

    async archive(businessId, customerId) {
      const existing = rows.get(key(businessId, customerId));
      if (!existing) return null;
      // Only the status timestamp changes; financial rows are never touched.
      const updated = {
        ...existing,
        archivedAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      };
      rows.set(key(businessId, customerId), updated);
      return updated;
    },
  };

  return {
    repository,
    seedInvoice(businessId: string, customerId: string, invoice: FakeInvoice) {
      const k = key(businessId, customerId);
      invoices.set(k, [...(invoices.get(k) ?? []), invoice]);
    },
    getInvoices(businessId: string, customerId: string) {
      return invoices.get(key(businessId, customerId)) ?? [];
    },
  };
}
