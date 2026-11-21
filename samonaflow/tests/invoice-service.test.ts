import assert from "node:assert/strict";
import test from "node:test";
import type { ListInvoicesQuery } from "@/lib/validations/invoice";
import { createInvoiceSchema } from "@/lib/validations/invoice";
import { createInvoiceService, InvoiceServiceError } from "@/server/services/invoice-service";
import {
  BUSINESS_A,
  BUSINESS_B,
  CUSTOMER_A,
  CUSTOMER_B,
  USER_A,
  USER_B,
  createFakeCustomers,
  createFakeMemberships,
  makeCustomerRecord,
} from "./helpers/fakes";
import {
  INVOICE_A,
  INVOICE_B,
  createFakeInvoiceRepository,
  makeInvoiceRecord,
} from "./helpers/invoice-fakes";

const listQuery: ListInvoicesQuery = {
  page: 1,
  pageSize: 20,
  status: "all",
  customerId: undefined,
  sort: "issueDate",
  direction: "desc",
};

const createBody = {
  customerId: CUSTOMER_A,
  issueDate: "2026-06-01",
  dueDate: "2026-06-15",
  currency: "inr",
  notes: " Website redesign ",
  discount: "2.06",
  tax: "1.00",
  items: [
    { description: "Design", quantity: "2", unitPrice: "10.25" },
    { description: "Copy", quantity: "1.15", unitPrice: "10.05" },
  ],
};

function setup() {
  const customers = createFakeCustomers([
    makeCustomerRecord({ id: CUSTOMER_A, businessId: BUSINESS_A, name: "Acme Studio" }),
    makeCustomerRecord({ id: CUSTOMER_B, businessId: BUSINESS_B, name: "Zulu Co" }),
  ]);
  const invoices = createFakeInvoiceRepository();
  invoices.setCustomerName(BUSINESS_A, CUSTOMER_A, "Acme Studio");
  const service = createInvoiceService({
    memberships: createFakeMemberships(),
    customers: customers.repository,
    invoices: invoices.repository,
  });
  return { service, invoices, customers };
}

function input(overrides: Record<string, unknown> = {}) {
  return createInvoiceSchema.parse({ ...createBody, ...overrides });
}

test("create recalculates totals, snapshots currency and generates a per-business number", async () => {
  const { service } = setup();
  const created = await service.create(USER_A, BUSINESS_A, input());

  assert.equal(created.businessId, BUSINESS_A);
  assert.equal(created.customerId, CUSTOMER_A);
  assert.equal(created.invoiceNumber, "INV-2026-0001");
  assert.equal(created.currency, "INR");
  assert.equal(created.subtotal, "32.06");
  assert.equal(created.discount, "2.06");
  assert.equal(created.tax, "1.00");
  assert.equal(created.totalAmount, "31.00");
  assert.equal(created.status, "DRAFT");
  assert.equal(created.isEditable, true);
});

test("create snapshots the business currency when the request omits it", async () => {
  const { service } = setup();
  const parsed = input();
  delete (parsed as { currency?: string }).currency;
  const created = await service.create(USER_A, BUSINESS_A, parsed);
  assert.equal(created.currency, "INR");
});

test("create rejects discounts above the subtotal before any invoice is written", async () => {
  const { service, invoices } = setup();
  await assert.rejects(
    service.create(USER_A, BUSINESS_A, input({ discount: "999.00" })),
    (error: unknown) => error instanceof InvoiceServiceError && error.code === "INVALID_AMOUNTS",
  );
  assert.equal(invoices.count(), 0);
});

test("create refuses a customer from another business", async () => {
  const { service, invoices } = setup();
  await assert.rejects(
    service.create(USER_A, BUSINESS_A, input({ customerId: CUSTOMER_B })),
    (error: unknown) => error instanceof InvoiceServiceError && error.code === "CUSTOMER_NOT_FOUND",
  );
  assert.equal(invoices.count(), 0);
});

test("every operation rejects a user without membership in the business", async () => {
  const { service, invoices } = setup();
  invoices.seedInvoice(makeInvoiceRecord({ id: INVOICE_A, status: "DRAFT" }));

  const operations = [
    () => service.create(USER_B, BUSINESS_A, input()),
    () => service.list(USER_B, BUSINESS_A, listQuery),
    () => service.get(USER_B, BUSINESS_A, INVOICE_A),
    () => service.update(USER_B, BUSINESS_A, INVOICE_A, { items: input().items }),
    () => service.send(USER_B, BUSINESS_A, INVOICE_A),
    () => service.void(USER_B, BUSINESS_A, INVOICE_A),
  ];

  for (const operation of operations) {
    await assert.rejects(operation, (error: unknown) => {
      assert.ok(error instanceof InvoiceServiceError);
      assert.equal(error.code, "BUSINESS_FORBIDDEN");
      return true;
    });
  }
});

test("a guessed invoice id from another business is never readable or writable", async () => {
  const { service, invoices } = setup();
  invoices.seedInvoice(
    makeInvoiceRecord({
      id: INVOICE_B,
      businessId: BUSINESS_B,
      customerId: CUSTOMER_B,
      invoiceNumber: "INV-2026-0001",
      status: "SENT",
      isEditable: false,
    }),
  );

  const operations = [
    () => service.get(USER_A, BUSINESS_A, INVOICE_B),
    () => service.update(USER_A, BUSINESS_A, INVOICE_B, { items: input().items }),
    () => service.send(USER_A, BUSINESS_A, INVOICE_B),
    () => service.void(USER_A, BUSINESS_A, INVOICE_B),
  ];
  for (const operation of operations) {
    await assert.rejects(operation, (error: unknown) => {
      assert.ok(error instanceof InvoiceServiceError);
      assert.equal(error.code, "INVOICE_NOT_FOUND");
      return true;
    });
  }
});

test("list is tenant-scoped, searchable, filterable, sortable and paginated", async () => {
  const { service, invoices } = setup();
  invoices.seedInvoice(makeInvoiceRecord({ id: INVOICE_A, status: "DRAFT", invoiceNumber: "INV-2026-0001" }));
  invoices.seedInvoice(
    makeInvoiceRecord({
      id: "50000000-0000-4000-8000-000000000003",
      invoiceNumber: "INV-2026-0002",
      status: "SENT",
      isEditable: false,
      issueDate: "2026-06-02",
      dueDate: "2026-06-10",
      totalAmount: "250.00",
      outstandingAmount: "250.00",
    }),
  );
  invoices.seedInvoice(
    makeInvoiceRecord({
      id: INVOICE_B,
      businessId: BUSINESS_B,
      customerId: CUSTOMER_B,
      invoiceNumber: "INV-2026-0001",
    }),
  );

  const all = await service.list(USER_A, BUSINESS_A, listQuery);
  assert.equal(all.total, 2);
  assert.ok(all.items.every((item) => item.businessId === BUSINESS_A));

  const drafts = await service.list(USER_A, BUSINESS_A, { ...listQuery, status: "DRAFT" });
  assert.equal(drafts.total, 1);
  assert.equal(drafts.items[0]?.invoiceNumber, "INV-2026-0001");

  const searched = await service.list(USER_A, BUSINESS_A, {
    ...listQuery,
    search: "0002",
  });
  assert.equal(searched.total, 1);
  assert.equal(searched.items[0]?.id, "50000000-0000-4000-8000-000000000003");

  const paginated = await service.list(USER_A, BUSINESS_A, {
    ...listQuery,
    pageSize: 1,
    page: 2,
    sort: "issueDate",
    direction: "asc",
  });
  assert.equal(paginated.totalPages, 2);
  assert.equal(paginated.items[0]?.id, "50000000-0000-4000-8000-000000000003");
});

test("draft edit replaces items and recomputes every money field", async () => {
  const { service, invoices } = setup();
  const created = await service.create(USER_A, BUSINESS_A, input());

  const updated = await service.update(USER_A, BUSINESS_A, created.id, {
    tax: "5.00",
    items: [{ description: "Revised", quantity: "3", unitPrice: "20.00" }],
  });
  assert.equal(updated.subtotal, "60.00");
  assert.equal(updated.discount, "2.06");
  assert.equal(updated.tax, "5.00");
  assert.equal(updated.totalAmount, "62.94");

  const detail = await service.get(USER_A, BUSINESS_A, created.id);
  assert.equal(detail.items.length, 1);
  assert.equal(detail.items[0]?.description, "Revised");
  assert.equal(detail.items[0]?.lineTotal, "60.00");
  assert.equal(invoices.getInvoice(BUSINESS_A, created.id)?.items.length, 1);
});

test("issued, paid and voided invoices cannot be edited", async () => {
  const { service, invoices } = setup();
  for (const status of ["SENT", "PAID", "VOID"] as const) {
    invoices.seedInvoice(makeInvoiceRecord({ id: INVOICE_A, status, isEditable: false }));
    await assert.rejects(
      service.update(USER_A, BUSINESS_A, INVOICE_A, { items: input().items }),
      (error: unknown) => error instanceof InvoiceServiceError && error.code === "INVOICE_LOCKED",
    );
  }
});

test("send and void enforce the lifecycle matrix", async () => {
  const { service, invoices } = setup();

  invoices.seedInvoice(makeInvoiceRecord({ id: INVOICE_A, status: "DRAFT" }));
  const sent = await service.send(USER_A, BUSINESS_A, INVOICE_A);
  assert.equal(sent.status, "SENT");
  assert.equal(sent.isEditable, false);
  await assert.rejects(
    service.send(USER_A, BUSINESS_A, INVOICE_A),
    (error: unknown) => error instanceof InvoiceServiceError && error.code === "INVALID_TRANSITION",
  );
  const voided = await service.void(USER_A, BUSINESS_A, INVOICE_A);
  assert.equal(voided.status, "VOID");
  await assert.rejects(
    service.void(USER_A, BUSINESS_A, INVOICE_A),
    (error: unknown) => error instanceof InvoiceServiceError && error.code === "INVALID_TRANSITION",
  );

  const draftId = "50000000-0000-4000-8000-000000000004";
  const paidId = "50000000-0000-4000-8000-000000000005";
  invoices.seedInvoice(makeInvoiceRecord({ id: draftId, status: "DRAFT" }));
  invoices.seedInvoice(makeInvoiceRecord({ id: paidId, status: "PAID", isEditable: false }));
  await assert.rejects(
    service.void(USER_A, BUSINESS_A, draftId),
    (error: unknown) => error instanceof InvoiceServiceError && error.code === "INVALID_TRANSITION",
  );
  await assert.rejects(
    service.void(USER_A, BUSINESS_A, paidId),
    (error: unknown) => error instanceof InvoiceServiceError && error.code === "INVALID_TRANSITION",
  );
});

test("concurrent creates get distinct invoice numbers", async () => {
  const { service, invoices } = setup();
  invoices.enableConcurrencyBarrier();
  const created = await Promise.all([
    service.create(USER_A, BUSINESS_A, input()),
    service.create(USER_A, BUSINESS_A, input()),
    service.create(USER_A, BUSINESS_A, input()),
  ]);
  const numbers = created.map((invoice) => invoice.invoiceNumber);
  assert.equal(new Set(numbers).size, 3);
  assert.deepEqual([...numbers].sort(), [
    "INV-2026-0001",
    "INV-2026-0002",
    "INV-2026-0003",
  ]);
  assert.ok(invoices.getCreateAttempts() > 3, "a conflicting attempt should retry");
});

test("a failed create leaves no partial invoice or line items", async () => {
  const { service, invoices } = setup();
  invoices.failNextCreate();
  await assert.rejects(service.create(USER_A, BUSINESS_A, input()), /simulated transaction failure/);
  assert.equal(invoices.count(), 0);
  assert.deepEqual(invoices.getCommittedNumbers(), []);
});
