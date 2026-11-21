import { formatMoney, parseMoney } from "@/lib/invoice-math";
import { invoiceNumberPrefix, nextInvoiceNumber } from "@/lib/invoice-numbering";
import { deriveDisplayStatus } from "@/lib/invoice-status";
import type { ListInvoicesQuery } from "@/lib/validations/invoice";
import type {
  CreateInvoiceRecord,
  InvoiceMutation,
  InvoiceRepository,
} from "@/server/repositories/invoice-repository";
import type {
  InvoiceBusinessProfile,
  InvoiceDetail,
  InvoiceItemRecord,
  InvoiceListItem,
  InvoiceRecord,
  InvoiceStatusValue,
} from "@/types/invoice";
import { BUSINESS_A, BUSINESS_B, CUSTOMER_A, CUSTOMER_B } from "./fakes";

export const INVOICE_A = "50000000-0000-4000-8000-000000000001";
export const INVOICE_B = "50000000-0000-4000-8000-000000000002";
export const TODAY = "2026-06-15";

const key = (businessId: string, id: string) => `${businessId}:${id}`;

export function makeInvoiceRecord(overrides: Partial<InvoiceRecord> = {}): InvoiceRecord {
  const base: InvoiceRecord = {
    id: INVOICE_A,
    businessId: BUSINESS_A,
    customerId: CUSTOMER_A,
    invoiceNumber: "INV-2026-0001",
    issueDate: "2026-06-01",
    dueDate: "2026-06-30",
    expectedPaymentDate: null,
    status: "DRAFT",
    displayStatus: "DRAFT",
    subtotal: "100.00",
    discount: "0.00",
    tax: "0.00",
    totalAmount: "100.00",
    amountPaid: "0.00",
    outstandingAmount: "100.00",
    currency: "INR",
    notes: null,
    isEditable: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };
  return { ...base, ...overrides };
}

function makeItem(invoiceId: string, businessId: string, index: number, input: InvoiceMutation["items"][number]): InvoiceItemRecord {
  return {
    id: `60000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    businessId,
    invoiceId,
    description: input.description,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    lineTotal: input.lineTotal,
    position: index,
    createdAt: "2026-06-01T00:00:00.000Z",
  };
}

/**
 * In-memory invoice repository with the same tenancy and numbering guarantees
 * as the Prisma repository: keys are composite `(businessId, id)` and numbers
 * are unique per business. A yield plus uniqueness check models the concurrent
 * create retry that the real database unique constraint provides.
 */
export function createFakeInvoiceRepository(seed: InvoiceRecord[] = []) {
  const rows = new Map<string, InvoiceRecord>();
  const items = new Map<string, InvoiceItemRecord[]>();
  const customerNames = new Map<string, string>([
    [key(BUSINESS_A, CUSTOMER_A), "Acme Studio"],
    [key(BUSINESS_B, CUSTOMER_B), "Zulu Co"],
  ]);
  const profiles = new Map<string, InvoiceBusinessProfile>([
    [
      BUSINESS_A,
      {
        name: "A Business",
        ownerName: "Owner A",
        email: "a@example.test",
        phone: null,
        currency: "INR",
        timezone: "Asia/Kolkata",
      },
    ],
    [
      BUSINESS_B,
      {
        name: "B Business",
        ownerName: "Owner B",
        email: "b@example.test",
        phone: null,
        currency: "USD",
        timezone: "UTC",
      },
    ],
  ]);

  for (const row of seed) rows.set(key(row.businessId, row.id), structuredClone(row));

  let nextId = seed.length + 1;
  let nextItemId = 1;
  let createAttempts = 0;
  let failNextCreate = false;
  let concurrencyBarrier = false;
  const waiters: (() => void)[] = [];
  const committedNumbers: string[] = [];

  /** Hold two creates at the number-generation point to force a real conflict. */
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

  function customerName(businessId: string, customerId: string): string {
    return customerNames.get(key(businessId, customerId)) ?? "Unknown customer";
  }

  function withDerivedStatus(row: InvoiceRecord): InvoiceRecord {
    return {
      ...row,
      displayStatus: deriveDisplayStatus(
        row.status,
        row.dueDate,
        row.outstandingAmount,
        TODAY,
      ),
      isEditable: row.status === "DRAFT",
    };
  }

  function toDetail(row: InvoiceRecord): InvoiceDetail {
    return {
      ...row,
      items: structuredClone(items.get(key(row.businessId, row.id)) ?? []),
      customer: {
        id: row.customerId,
        name: customerName(row.businessId, row.customerId),
        companyName: null,
        email: null,
        phone: null,
      },
    };
  }

  const repository: InvoiceRepository = {
    async create(input: CreateInvoiceRecord) {
      const prefix = invoiceNumberPrefix(input.issueDate);

      for (let attempt = 0; attempt < 5; attempt += 1) {
        createAttempts += 1;
        const existing = [...rows.values()]
          .filter((row) => row.businessId === input.businessId && row.invoiceNumber.startsWith(prefix))
          .map((row) => row.invoiceNumber);
        const invoiceNumber = nextInvoiceNumber(prefix, existing);

        // Give a concurrent create a chance to interleave, then enforce the
        // same unique constraint the database would enforce.
        await yieldForCreate();

        if (failNextCreate) {
          failNextCreate = false;
          throw new Error("simulated transaction failure");
        }
        if ([...rows.values()].some((row) => row.businessId === input.businessId && row.invoiceNumber === invoiceNumber)) {
          continue;
        }

        const id = `50000000-0000-4000-8000-${String(nextId).padStart(12, "0")}`;
        nextId += 1;
        const createdItems = input.items.map((item) => {
          const record = makeItem(id, input.businessId, nextItemId, item);
          nextItemId += 1;
          return record;
        });
        const row = withDerivedStatus({
          id,
          businessId: input.businessId,
          customerId: input.customerId,
          invoiceNumber,
          issueDate: input.issueDate,
          dueDate: input.dueDate,
          expectedPaymentDate: null,
          status: "DRAFT",
          displayStatus: "DRAFT",
          subtotal: input.subtotal,
          discount: input.discount,
          tax: input.tax,
          totalAmount: input.totalAmount,
          amountPaid: "0.00",
          outstandingAmount: input.totalAmount,
          currency: input.currency,
          notes: input.notes,
          isEditable: true,
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
        });

        rows.set(key(row.businessId, row.id), row);
        items.set(key(row.businessId, row.id), createdItems);
        committedNumbers.push(invoiceNumber);
        return row;
      }
      throw Object.assign(new Error("duplicate invoice number"), { code: "P2002" });
    },

    async findMany(businessId, query: ListInvoicesQuery) {
      let matches = [...rows.values()].filter((row) => row.businessId === businessId);

      if (query.status !== "all") {
        matches = matches.filter((row) =>
          query.status === "OVERDUE" ? row.displayStatus === "OVERDUE" : row.status === query.status,
        );
      }
      if (query.customerId) matches = matches.filter((row) => row.customerId === query.customerId);
      const fromDate = query.fromDate;
      const toDate = query.toDate;
      if (fromDate) matches = matches.filter((row) => row.issueDate >= fromDate);
      if (toDate) matches = matches.filter((row) => row.issueDate <= toDate);
      if (query.search) {
        const needle = query.search.toLowerCase();
        matches = matches.filter((row) =>
          [row.invoiceNumber, row.notes ?? "", customerName(row.businessId, row.customerId)].some(
            (value) => value.toLowerCase().includes(needle),
          ),
        );
      }

      matches.sort((a, b) => {
        const left = query.sort === "totalAmount" ? parseMoney(a.totalAmount) : String(a[query.sort]);
        const right = query.sort === "totalAmount" ? parseMoney(b.totalAmount) : String(b[query.sort]);
        const result = typeof left === "bigint" && typeof right === "bigint"
          ? left < right ? -1 : left > right ? 1 : 0
          : String(left).localeCompare(String(right));
        return query.direction === "asc" ? result : -result;
      });

      const total = matches.length;
      const start = (query.page - 1) * query.pageSize;
      const pageRows = matches.slice(start, start + query.pageSize);
      const result: InvoiceListItem[] = pageRows.map((row) => ({
        ...row,
        customerName: customerName(row.businessId, row.customerId),
        customerCompanyName: null,
      }));
      return {
        items: result,
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.ceil(total / query.pageSize),
      };
    },

    async findById(businessId, invoiceId) {
      const row = rows.get(key(businessId, invoiceId));
      return row ? toDetail(row) : null;
    },

    async findBaseById(businessId, invoiceId) {
      const row = rows.get(key(businessId, invoiceId));
      return row ? { ...row } : null;
    },

    async update(businessId, invoiceId, input: InvoiceMutation) {
      const k = key(businessId, invoiceId);
      const existing = rows.get(k);
      if (!existing || existing.status !== "DRAFT") return null;

      const outstandingAmount = formatMoney(
        parseMoney(input.totalAmount) - parseMoney(existing.amountPaid),
      );
      const updated = withDerivedStatus({
        ...existing,
        customerId: input.customerId,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        currency: input.currency,
        notes: input.notes,
        discount: input.discount,
        tax: input.tax,
        subtotal: input.subtotal,
        totalAmount: input.totalAmount,
        outstandingAmount,
        updatedAt: "2026-06-02T00:00:00.000Z",
      });
      rows.set(k, updated);
      items.set(
        k,
        input.items.map((item) => makeItem(invoiceId, businessId, nextItemId++, item)),
      );
      return { ...updated };
    },

    async setStatus(businessId, invoiceId, next, allowedFrom: readonly InvoiceStatusValue[]) {
      const k = key(businessId, invoiceId);
      const existing = rows.get(k);
      if (!existing || !allowedFrom.includes(existing.status)) return null;
      const updated = withDerivedStatus({
        ...existing,
        status: next,
        updatedAt: "2026-06-03T00:00:00.000Z",
      });
      rows.set(k, updated);
      return { ...updated };
    },

    async findBusinessProfile(businessId) {
      return profiles.get(businessId) ?? null;
    },
  };

  return {
    repository,
    seedInvoice(row: InvoiceRecord, seededItems: InvoiceItemRecord[] = []) {
      rows.set(key(row.businessId, row.id), withDerivedStatus(structuredClone(row)));
      items.set(key(row.businessId, row.id), structuredClone(seededItems));
    },
    setCustomerName(businessId: string, customerId: string, name: string) {
      customerNames.set(key(businessId, customerId), name);
    },
    getInvoice(businessId: string, invoiceId: string) {
      const row = rows.get(key(businessId, invoiceId));
      return row ? { ...row, items: items.get(key(businessId, invoiceId)) ?? [] } : null;
    },
    count() {
      return rows.size;
    },
    getCommittedNumbers() {
      return [...committedNumbers];
    },
    getCreateAttempts() {
      return createAttempts;
    },
    failNextCreate() {
      failNextCreate = true;
    },
    enableConcurrencyBarrier() {
      concurrencyBarrier = true;
    },
  };
}
