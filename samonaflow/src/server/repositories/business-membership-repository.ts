// Server-only data access for business membership. This is the single source
// of truth used to decide whether a verified user may reach a business.
import { prisma } from "@/server/database/connection";

export type BusinessMembershipRecord = {
  userId: string;
  businessId: string;
  role: "OWNER" | "STAFF";
};

export interface BusinessMembershipRepository {
  findMembership(
    userId: string,
    businessId: string,
  ): Promise<BusinessMembershipRecord | null>;
  /** Used by UI pages to resolve the signed-in user's business in the MVP. */
  findFirstForUser(userId: string): Promise<BusinessMembershipRecord | null>;
}

export const prismaBusinessMembershipRepository: BusinessMembershipRepository = {
  async findMembership(userId, businessId) {
    // The composite unique key prevents any ambiguity about tenancy.
    return prisma.businessMembership.findUnique({
      where: { userId_businessId: { userId, businessId } },
      select: { userId: true, businessId: true, role: true },
    });
  },

  async findFirstForUser(userId) {
    return prisma.businessMembership.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { userId: true, businessId: true, role: true },
    });
  },
};
