// Server-only data access for businesses and their settings. The owner
// membership is created in the same transaction as the business, as required by
// the database design (section 9). Every read/write is scoped by businessId and
// ownerId where applicable; there is no id-only mutation path.
import type { Prisma } from "@/generated/prisma/client";
import type {
  CreateBusinessInput,
  UpdateBusinessInput,
} from "@/lib/validations/business";
import { prisma } from "@/server/database/connection";
import { moneyDecimal } from "@/server/utils/invoice-decimal";
import type {
  BusinessRecord,
  BusinessRoleValue,
  BusinessSummary,
} from "@/types/business";

type BusinessRow = {
  id: string;
  ownerId: string;
  name: string;
  ownerName: string;
  email: string;
  phone: string | null;
  businessType: string;
  currency: string;
  timezone: string;
  openingBalance: Prisma.Decimal;
  openingBalanceDate: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type BusinessProfile = Omit<BusinessRecord, "role">;

export interface BusinessRepository {
  /** Create a business and its OWNER membership atomically. */
  createForOwner(
    user: { id: string; email: string },
    input: CreateBusinessInput,
  ): Promise<BusinessRecord>;
  findById(businessId: string): Promise<BusinessProfile | null>;
  listForUser(userId: string): Promise<BusinessSummary[]>;
  /** Owner-scoped update. Returns null when the row is not owned by ownerId. */
  update(
    businessId: string,
    ownerId: string,
    input: UpdateBusinessInput,
  ): Promise<BusinessProfile | null>;
  /** True when currency-changing would reinterpret existing amounts. */
  hasFinancialRecords(businessId: string): Promise<boolean>;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toProfile(row: BusinessRow): BusinessProfile {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    ownerName: row.ownerName,
    email: row.email,
    phone: row.phone,
    businessType: row.businessType,
    currency: row.currency,
    timezone: row.timezone,
    openingBalance: row.openingBalance.toFixed(2),
    openingBalanceDate: dateOnly(row.openingBalanceDate),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const PROFILE_SELECT = {
  id: true,
  ownerId: true,
  name: true,
  ownerName: true,
  email: true,
  phone: true,
  businessType: true,
  currency: true,
  timezone: true,
  openingBalance: true,
  openingBalanceDate: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BusinessSelect;

export const prismaBusinessRepository: BusinessRepository = {
  async createForOwner(user, input) {
    const created = await prisma.$transaction(async (tx) => {
      // The profile normally exists from the auth callback. Upserting here makes
      // onboarding resilient to a missed sync without trusting client identity.
      await tx.userProfile.upsert({
        where: { id: user.id },
        create: { id: user.id, email: user.email },
        update: { email: user.email },
      });

      const business = await tx.business.create({
        data: {
          ownerId: user.id,
          name: input.name,
          ownerName: input.ownerName,
          email: input.email,
          phone: input.phone,
          businessType: input.businessType,
          currency: input.currency,
          timezone: input.timezone,
          openingBalance: moneyDecimal(input.openingBalance),
          openingBalanceDate: new Date(`${input.openingBalanceDate}T00:00:00.000Z`),
        },
        select: PROFILE_SELECT,
      });

      await tx.businessMembership.create({
        data: { userId: user.id, businessId: business.id, role: "OWNER" },
      });

      return business;
    });

    return { ...toProfile(created), role: "OWNER" };
  },

  async findById(businessId) {
    const row = await prisma.business.findUnique({
      where: { id: businessId },
      select: PROFILE_SELECT,
    });
    return row ? toProfile(row) : null;
  },

  async listForUser(userId) {
    const memberships = await prisma.businessMembership.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: {
        role: true,
        business: {
          select: { id: true, name: true, currency: true, timezone: true },
        },
      },
    });

    return memberships.map((membership) => ({
      id: membership.business.id,
      name: membership.business.name,
      role: membership.role as BusinessRoleValue,
      currency: membership.business.currency,
      timezone: membership.business.timezone,
    }));
  },

  async update(businessId, ownerId, input) {
    const data: Prisma.BusinessUpdateManyMutationInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.ownerName !== undefined) data.ownerName = input.ownerName;
    if (input.email !== undefined) data.email = input.email;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.businessType !== undefined) data.businessType = input.businessType;
    if (input.currency !== undefined) data.currency = input.currency;
    if (input.timezone !== undefined) data.timezone = input.timezone;
    if (input.openingBalance !== undefined) {
      data.openingBalance = moneyDecimal(input.openingBalance);
    }
    if (input.openingBalanceDate !== undefined) {
      data.openingBalanceDate = new Date(`${input.openingBalanceDate}T00:00:00.000Z`);
    }

    const result = await prisma.business.updateMany({
      where: { id: businessId, ownerId },
      data,
    });
    if (result.count === 0) return null;

    const row = await prisma.business.findUnique({
      where: { id: businessId },
      select: PROFILE_SELECT,
    });
    return row ? toProfile(row) : null;
  },

  async hasFinancialRecords(businessId) {
    const [invoices, payments, expenses] = await Promise.all([
      prisma.invoice.count({ where: { businessId } }),
      prisma.payment.count({ where: { businessId } }),
      prisma.expense.count({ where: { businessId } }),
    ]);
    return invoices + payments + expenses > 0;
  },
};
