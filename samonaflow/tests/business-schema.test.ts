import assert from "node:assert/strict";
import test from "node:test";
import {
  createBusinessSchema,
  updateBusinessSchema,
} from "@/lib/validations/business";

const valid = {
  name: "Acme Studio",
  ownerName: "Asha Rao",
  email: "asha@acme.test",
  phone: "",
  businessType: "Freelancer",
  currency: "inr",
  timezone: "Asia/Kolkata",
  openingBalance: "25000",
  openingBalanceDate: "2026-01-01",
};

test("create schema normalizes currency, phone and opening balance", () => {
  const parsed = createBusinessSchema.parse(valid);
  assert.equal(parsed.currency, "INR");
  assert.equal(parsed.phone, null);
  assert.equal(parsed.openingBalance, "25000.00");
});

test("create schema applies the documented defaults", () => {
  const parsed = createBusinessSchema.parse({
    name: "Acme",
    ownerName: "Asha",
    email: "asha@acme.test",
    businessType: "Freelancer",
    openingBalanceDate: "2026-01-01",
  });
  assert.equal(parsed.currency, "INR");
  assert.equal(parsed.timezone, "Asia/Kolkata");
  assert.equal(parsed.openingBalance, "0.00");
});

test("create schema rejects invalid currency, timezone, money and dates", () => {
  for (const patch of [
    { currency: "RUPEES" },
    { timezone: "Mars/Olympus" },
    { openingBalance: "1.234" },
    { openingBalance: "1e5" },
    { openingBalanceDate: "2026-02-31" },
    { email: "not-an-email" },
    { name: "" },
  ]) {
    const result = createBusinessSchema.safeParse({ ...valid, ...patch });
    assert.equal(result.success, false, JSON.stringify(patch));
  }
});

test("create schema accepts a negative opening balance but strips server-owned fields", () => {
  const parsed = createBusinessSchema.parse({
    ...valid,
    openingBalance: "-1500.50",
    id: "20000000-0000-4000-8000-000000000009",
    ownerId: "10000000-0000-4000-8000-000000000009",
  });
  assert.equal(parsed.openingBalance, "-1500.50");
  assert.equal("id" in parsed, false);
  assert.equal("ownerId" in parsed, false);
});

test("update schema allows a partial change but rejects an empty object", () => {
  assert.equal(updateBusinessSchema.safeParse({ name: "Renamed" }).success, true);
  assert.equal(updateBusinessSchema.safeParse({}).success, false);
  assert.equal(updateBusinessSchema.safeParse({ currency: "usd" }).success, true);
});
