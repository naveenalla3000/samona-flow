import assert from "node:assert/strict";
import test from "node:test";
import {
  businessIdSchema,
  createCustomerSchema,
  customerIdSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from "@/lib/validations/customer";

test("create schema accepts only PRD fields and normalizes text", () => {
  const parsed = createCustomerSchema.safeParse({
    name: "  Acme Studio  ",
    email: "  owner@acme.test  ",
    phone: " ",
    companyName: " Acme ",
    address: "  12 Main St  ",
    notes: "  Preferred client  ",
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.name, "Acme Studio");
  assert.equal(parsed.data.email, "owner@acme.test");
  assert.equal(parsed.data.phone, null);
  assert.equal(parsed.data.companyName, "Acme");
  assert.equal(parsed.data.address, "12 Main St");
  assert.equal(parsed.data.notes, "Preferred client");
  // Server-owned fields are stripped rather than trusted from the client.
  assert.equal("businessId" in parsed.data, false);
  assert.equal("archivedAt" in parsed.data, false);
});

test("create schema requires a name and rejects invalid email", () => {
  const noName = createCustomerSchema.safeParse({ email: "a@b.com" });
  assert.equal(noName.success, false);
  if (!noName.success) assert.ok(noName.error.issues.some((i) => i.path[0] === "name"));

  const badEmail = createCustomerSchema.safeParse({ name: "Acme", email: "not-an-email" });
  assert.equal(badEmail.success, false);
});

test("create schema enforces the name length matching the VARCHAR(200) column", () => {
  const parsed = createCustomerSchema.safeParse({ name: "x".repeat(201) });
  assert.equal(parsed.success, false);
});

test("update schema requires at least one field and allows partial updates", () => {
  assert.equal(updateCustomerSchema.safeParse({}).success, false);
  assert.equal(updateCustomerSchema.safeParse({ phone: "555-0100" }).success, true);
  assert.equal(updateCustomerSchema.safeParse({ name: "" }).success, false);
});

test("list query coerces pagination and applies documented defaults", () => {
  const parsed = listCustomersQuerySchema.safeParse({ page: "2", pageSize: "10", search: " acme " });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.page, 2);
  assert.equal(parsed.data.pageSize, 10);
  assert.equal(parsed.data.search, "acme");
  assert.equal(parsed.data.status, "active");
  assert.equal(parsed.data.sort, "name");
  assert.equal(parsed.data.direction, "asc");
});

test("list query rejects out-of-range pagination and unknown sort/filter values", () => {
  assert.equal(listCustomersQuerySchema.safeParse({ page: "0" }).success, false);
  assert.equal(listCustomersQuerySchema.safeParse({ pageSize: "101" }).success, false);
  assert.equal(listCustomersQuerySchema.safeParse({ sort: "amount" }).success, false);
  assert.equal(listCustomersQuerySchema.safeParse({ status: "deleted" }).success, false);
});

test("path id schemas reject malformed identifiers", () => {
  assert.equal(businessIdSchema.safeParse("not-a-uuid").success, false);
  assert.equal(customerIdSchema.safeParse("not-a-uuid").success, false);
  assert.equal(businessIdSchema.safeParse(BUSINESS_ID).success, true);
});

const BUSINESS_ID = "20000000-0000-4000-8000-000000000001";
