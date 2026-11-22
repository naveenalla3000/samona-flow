import assert from "node:assert/strict";
import test from "node:test";
import type { BusinessMembershipRepository } from "@/server/repositories/business-membership-repository";
import type { BusinessProfile, BusinessRepository } from "@/server/repositories/business-repository";
import { BusinessServiceError, createBusinessService } from "@/server/services/business-service";
import type { BusinessRecord, BusinessRoleValue } from "@/types/business";
import { BUSINESS_A, BUSINESS_B, USER_A, USER_B } from "./helpers/fakes";

const BUSINESS_C = "20000000-0000-4000-8000-000000000003";
const NOW = "2026-01-01T00:00:00.000Z";

function profile(overrides: Partial<BusinessProfile> = {}): BusinessProfile {
  return {
    id: BUSINESS_A,
    ownerId: USER_A.id,
    name: "Alpha Studio",
    ownerName: "Asha",
    email: "asha@alpha.test",
    phone: null,
    businessType: "Freelancer",
    currency: "INR",
    timezone: "Asia/Kolkata",
    openingBalance: "10000.00",
    openingBalanceDate: "2026-01-01",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function setup(options: {
  financialRecords?: boolean;
  memberships?: { userId: string; businessId: string; role: BusinessRoleValue }[];
} = {}) {
  const rows = new Map<string, BusinessProfile>([
    [BUSINESS_A, profile()],
    [BUSINESS_B, profile({ id: BUSINESS_B, ownerId: USER_B.id, name: "Beta Studio" })],
  ]);
  const memberships = options.memberships ?? [
    { userId: USER_A.id, businessId: BUSINESS_A, role: "OWNER" as const },
    { userId: USER_B.id, businessId: BUSINESS_B, role: "OWNER" as const },
  ];

  const membershipRepository: BusinessMembershipRepository = {
    async findMembership(userId, businessId) {
      return memberships.find((m) => m.userId === userId && m.businessId === businessId) ?? null;
    },
    async findFirstForUser(userId) {
      return memberships.find((m) => m.userId === userId) ?? null;
    },
  };

  const businessRepository: BusinessRepository = {
    async createForOwner(user, input) {
      const created: BusinessRecord = {
        ...profile({
          id: BUSINESS_C,
          ownerId: user.id,
          name: input.name,
          ownerName: input.ownerName,
          email: input.email,
          currency: input.currency,
          timezone: input.timezone,
          openingBalance: input.openingBalance,
          openingBalanceDate: input.openingBalanceDate,
        }),
        role: "OWNER",
      };
      rows.set(created.id, { ...created });
      memberships.push({ userId: user.id, businessId: created.id, role: "OWNER" });
      return created;
    },
    async findById(businessId) {
      return rows.get(businessId) ?? null;
    },
    async listForUser(userId) {
      return memberships
        .filter((membership) => membership.userId === userId)
        .map((membership) => {
          const row = rows.get(membership.businessId);
          return {
            id: membership.businessId,
            name: row?.name ?? "Unknown",
            role: membership.role,
            currency: row?.currency ?? "INR",
            timezone: row?.timezone ?? "Asia/Kolkata",
          };
        });
    },
    async update(businessId, ownerId, input) {
      const existing = rows.get(businessId);
      if (!existing || existing.ownerId !== ownerId) return null;
      const updated = { ...existing, ...input } as BusinessProfile;
      rows.set(businessId, updated);
      return updated;
    },
    async hasFinancialRecords() {
      return options.financialRecords ?? false;
    },
  };

  return {
    rows,
    service: createBusinessService({
      memberships: membershipRepository,
      businesses: businessRepository,
    }),
  };
}

function rejectsWith(code: string) {
  return (error: unknown) => {
    assert.ok(error instanceof BusinessServiceError);
    assert.equal(error.code, code);
    return true;
  };
}

test("create scopes the business and owner membership to the signed-in user", async () => {
  const { service } = setup();
  const created = await service.create(USER_A, {
    name: "New Studio",
    ownerName: "Asha",
    email: "asha@new.test",
    phone: null,
    businessType: "Freelancer",
    currency: "INR",
    timezone: "Asia/Kolkata",
    openingBalance: "0.00",
    openingBalanceDate: "2026-01-01",
  });
  assert.equal(created.ownerId, USER_A.id);
  assert.equal(created.role, "OWNER");
  assert.equal((await service.list(USER_A)).length, 2);
  assert.equal((await service.list(USER_B)).length, 1);
});

test("get and list only expose businesses the user belongs to", async () => {
  const { service } = setup();
  const business = await service.get(USER_A, BUSINESS_A);
  assert.equal(business.role, "OWNER");

  await assert.rejects(service.get(USER_B, BUSINESS_A), rejectsWith("BUSINESS_FORBIDDEN"));
  const list = await service.list(USER_B);
  assert.deepEqual(
    list.map((item) => item.id),
    [BUSINESS_B],
  );
});

test("only the owner can update settings", async () => {
  const { service } = setup({
    memberships: [{ userId: USER_A.id, businessId: BUSINESS_A, role: "STAFF" }],
  });
  await assert.rejects(
    service.update(USER_A, BUSINESS_A, { name: "Renamed" }),
    rejectsWith("NOT_OWNER"),
  );
});

test("a member of another business cannot update by swapping the id", async () => {
  const { service } = setup();
  await assert.rejects(
    service.update(USER_B, BUSINESS_A, { name: "Hijacked" }),
    rejectsWith("BUSINESS_FORBIDDEN"),
  );
});

test("currency is locked once financial records exist but other settings remain editable", async () => {
  const { service } = setup({ financialRecords: true });
  await assert.rejects(
    service.update(USER_A, BUSINESS_A, { currency: "USD" }),
    rejectsWith("CURRENCY_LOCKED"),
  );

  const renamed = await service.update(USER_A, BUSINESS_A, {
    name: "Renamed Studio",
    timezone: "Asia/Dubai",
    openingBalance: "-500.00",
  });
  assert.equal(renamed.name, "Renamed Studio");
  assert.equal(renamed.timezone, "Asia/Dubai");
  assert.equal(renamed.openingBalance, "-500.00");
  assert.equal(renamed.currency, "INR");
});

test("currency can change while the business has no financial records", async () => {
  const { service } = setup({ financialRecords: false });
  const updated = await service.update(USER_A, BUSINESS_A, { currency: "USD" });
  assert.equal(updated.currency, "USD");
});

test("a business without a membership is forbidden even if its id is guessed", async () => {
  const { service } = setup();
  await assert.rejects(
    service.get(USER_A, BUSINESS_C),
    rejectsWith("BUSINESS_FORBIDDEN"),
  );
});

test("a stale membership pointing at a missing business reports not found", async () => {
  const { service } = setup({
    memberships: [{ userId: USER_A.id, businessId: BUSINESS_C, role: "OWNER" }],
  });
  await assert.rejects(
    service.get(USER_A, BUSINESS_C),
    rejectsWith("BUSINESS_NOT_FOUND"),
  );
});
