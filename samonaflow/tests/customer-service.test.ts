import assert from "node:assert/strict";
import test from "node:test";
import { createCustomerService, CustomerServiceError } from "@/server/services/customer-service";
import type { ListCustomersQuery } from "@/lib/validations/customer";
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

const defaultQuery: ListCustomersQuery = {
  page: 1,
  pageSize: 20,
  status: "active",
  sort: "name",
  direction: "asc",
};

function setup() {
  const data = createFakeCustomers([
    makeCustomerRecord({ id: CUSTOMER_A, businessId: BUSINESS_A, name: "Bravo" }),
    makeCustomerRecord({ id: CUSTOMER_B, businessId: BUSINESS_B, name: "Zulu" }),
  ]);
  return {
    data,
    service: createCustomerService({
      memberships: createFakeMemberships(),
      customers: data.repository,
    }),
  };
}

test("create scopes the new customer to the verified business", async () => {
  const { service } = setup();
  const created = await service.create(USER_A, BUSINESS_A, {
    name: "New Client",
    email: null,
    phone: null,
    companyName: null,
    address: null,
    notes: null,
  });
  assert.equal(created.businessId, BUSINESS_A);
  assert.equal(created.name, "New Client");
});

test("all operations reject a user without membership in the business", async () => {
  const { service } = setup();
  const operations = [
    () =>
      service.create(USER_B, BUSINESS_A, {
        name: "X",
        email: null,
        phone: null,
        companyName: null,
        address: null,
        notes: null,
      }),
    () => service.list(USER_B, BUSINESS_A, defaultQuery),
    () => service.get(USER_B, BUSINESS_A, CUSTOMER_A),
    () => service.update(USER_B, BUSINESS_A, CUSTOMER_A, { name: "X" }),
    () => service.archive(USER_B, BUSINESS_A, CUSTOMER_A),
  ];

  for (const operation of operations) {
    await assert.rejects(operation, (error: unknown) => {
      assert.ok(error instanceof CustomerServiceError);
      assert.equal(error.code, "BUSINESS_FORBIDDEN");
      return true;
    });
  }
});

test("a guessed customer id from another business is never readable or writable", async () => {
  const { service } = setup();
  // USER_A owns BUSINESS_A but guesses the id of BUSINESS_B's customer.
  await assert.rejects(
    service.get(USER_A, BUSINESS_A, CUSTOMER_B),
    (error: unknown) =>
      error instanceof CustomerServiceError && error.code === "CUSTOMER_NOT_FOUND",
  );
  await assert.rejects(
    service.update(USER_A, BUSINESS_A, CUSTOMER_B, { name: "Hacked" }),
    (error: unknown) =>
      error instanceof CustomerServiceError && error.code === "CUSTOMER_NOT_FOUND",
  );
  await assert.rejects(
    service.archive(USER_A, BUSINESS_A, CUSTOMER_B),
    (error: unknown) =>
      error instanceof CustomerServiceError && error.code === "CUSTOMER_NOT_FOUND",
  );
});

test("member of business B cannot reach business A by swapping the path id", async () => {
  const { service } = setup();
  await assert.rejects(service.list(USER_B, BUSINESS_A, defaultQuery));
  const result = await service.list(USER_B, BUSINESS_B, defaultQuery);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.businessId, BUSINESS_B);
});

test("list is scoped, paginated and searchable", async () => {
  const { service } = setup();
  await service.create(USER_A, BUSINESS_A, {
    name: "Alpha Ltd",
    email: "alpha@test.test",
    phone: null,
    companyName: null,
    address: null,
    notes: null,
  });

  const firstPage = await service.list(USER_A, BUSINESS_A, {
    ...defaultQuery,
    pageSize: 1,
    search: "alpha",
  });
  assert.equal(firstPage.total, 1);
  assert.equal(firstPage.totalPages, 1);
  assert.equal(firstPage.items.length, 1);
  assert.equal(firstPage.items[0]?.name, "Alpha Ltd");

  const secondPage = await service.list(USER_A, BUSINESS_A, { ...defaultQuery, page: 2 });
  assert.equal(secondPage.items.length, 0);
  assert.equal(secondPage.page, 2);
});

test("update changes only the provided customer fields", async () => {
  const { service } = setup();
  const updated = await service.update(USER_A, BUSINESS_A, CUSTOMER_A, { phone: "555-0100" });
  assert.equal(updated.phone, "555-0100");
  assert.equal(updated.name, "Bravo");
  assert.equal(updated.businessId, BUSINESS_A);
});

test("archive preserves invoices and payment history on the customer profile", async () => {
  const { service, data } = setup();
  data.seedInvoice(BUSINESS_A, CUSTOMER_A, {
    id: "50000000-0000-4000-8000-000000000001",
    invoiceNumber: "INV-001",
    issueDate: "2026-01-01",
    dueDate: "2026-01-31",
    status: "PAID",
    totalAmount: "100.00",
    amountPaid: "100.00",
  });

  const before = await service.get(USER_A, BUSINESS_A, CUSTOMER_A);
  assert.equal(before.financials.invoiceCount, 1);
  assert.equal(before.financials.totalInvoiced, "100.00");

  const archived = await service.archive(USER_A, BUSINESS_A, CUSTOMER_A);
  assert.ok(archived.archivedAt);

  const after = await service.get(USER_A, BUSINESS_A, CUSTOMER_A);
  assert.equal(after.financials.invoiceCount, 1);
  assert.equal(after.invoices[0]?.invoiceNumber, "INV-001");
  assert.equal(data.getInvoices(BUSINESS_A, CUSTOMER_A).length, 1);
});

test("customer financial summary excludes draft and void invoices but keeps them in history", async () => {
  const { service, data } = setup();
  data.seedInvoice(BUSINESS_A, CUSTOMER_A, {
    id: "50000000-0000-4000-8000-000000000011",
    invoiceNumber: "INV-DRAFT",
    issueDate: "2026-01-01",
    dueDate: "2026-01-31",
    status: "DRAFT",
    totalAmount: "500.00",
    amountPaid: "0.00",
  });
  data.seedInvoice(BUSINESS_A, CUSTOMER_A, {
    id: "50000000-0000-4000-8000-000000000012",
    invoiceNumber: "INV-VOID",
    issueDate: "2026-01-01",
    dueDate: "2026-01-31",
    status: "VOID",
    totalAmount: "250.00",
    amountPaid: "0.00",
  });
  data.seedInvoice(BUSINESS_A, CUSTOMER_A, {
    id: "50000000-0000-4000-8000-000000000013",
    invoiceNumber: "INV-SENT",
    issueDate: "2026-01-01",
    dueDate: "2026-01-31",
    status: "PARTIALLY_PAID",
    totalAmount: "100.00",
    amountPaid: "40.00",
  });

  const detail = await service.get(USER_A, BUSINESS_A, CUSTOMER_A);
  assert.equal(detail.financials.invoiceCount, 3);
  assert.equal(detail.financials.totalInvoiced, "100.00");
  assert.equal(detail.financials.totalPaymentsReceived, "40.00");
  assert.equal(detail.financials.outstandingAmount, "60.00");
  assert.equal(detail.invoices.length, 3);
});

test("archived customers are hidden from the default list but available via filter", async () => {
  const { service } = setup();
  await service.archive(USER_A, BUSINESS_A, CUSTOMER_A);

  const active = await service.list(USER_A, BUSINESS_A, defaultQuery);
  assert.equal(active.total, 0);

  const archived = await service.list(USER_A, BUSINESS_A, { ...defaultQuery, status: "archived" });
  assert.equal(archived.total, 1);
});
