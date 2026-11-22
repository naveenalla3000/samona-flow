// Server-only application service for business onboarding and settings.
//
// Creating a business is allowed for any authenticated user. Reading and
// updating one requires a verified BusinessMembership; updates additionally
// require the OWNER role and the matching ownerId. Currency is locked once any
// financial record exists, because invoices snapshot their currency while
// expenses have no currency column and changing it would silently reinterpret
// historical amounts.
import type { AuthenticatedUser } from "@/server/auth/auth-types";
import {
  prismaBusinessMembershipRepository,
  type BusinessMembershipRepository,
} from "@/server/repositories/business-membership-repository";
import {
  prismaBusinessRepository,
  type BusinessRepository,
} from "@/server/repositories/business-repository";
import type {
  CreateBusinessInput,
  UpdateBusinessInput,
} from "@/lib/validations/business";
import type { BusinessRecord, BusinessSummary } from "@/types/business";

export type BusinessServiceErrorCode =
  | "BUSINESS_FORBIDDEN"
  | "BUSINESS_NOT_FOUND"
  | "NOT_OWNER"
  | "CURRENCY_LOCKED";

export class BusinessServiceError extends Error {
  readonly code: BusinessServiceErrorCode;

  constructor(code: BusinessServiceErrorCode, message: string) {
    super(message);
    this.name = "BusinessServiceError";
    this.code = code;
  }
}

export interface BusinessService {
  create(user: AuthenticatedUser, input: CreateBusinessInput): Promise<BusinessRecord>;
  list(user: AuthenticatedUser): Promise<BusinessSummary[]>;
  get(user: AuthenticatedUser, businessId: string): Promise<BusinessRecord>;
  update(
    user: AuthenticatedUser,
    businessId: string,
    input: UpdateBusinessInput,
  ): Promise<BusinessRecord>;
}

export function createBusinessService(dependencies: {
  memberships: BusinessMembershipRepository;
  businesses: BusinessRepository;
}): BusinessService {
  const { memberships, businesses } = dependencies;

  async function requireMembership(user: AuthenticatedUser, businessId: string) {
    const membership = await memberships.findMembership(user.id, businessId);
    if (!membership) {
      throw new BusinessServiceError(
        "BUSINESS_FORBIDDEN",
        "You do not have access to this business.",
      );
    }
    return membership;
  }

  return {
    async create(user, input) {
      return businesses.createForOwner(user, input);
    },

    async list(user) {
      return businesses.listForUser(user.id);
    },

    async get(user, businessId) {
      const membership = await requireMembership(user, businessId);
      const business = await businesses.findById(businessId);
      if (!business) {
        throw new BusinessServiceError("BUSINESS_NOT_FOUND", "Business not found.");
      }
      return { ...business, role: membership.role };
    },

    async update(user, businessId, input) {
      const membership = await requireMembership(user, businessId);
      const existing = await businesses.findById(businessId);
      if (!existing) {
        throw new BusinessServiceError("BUSINESS_NOT_FOUND", "Business not found.");
      }
      if (membership.role !== "OWNER" || existing.ownerId !== user.id) {
        throw new BusinessServiceError(
          "NOT_OWNER",
          "Only the business owner can change these settings.",
        );
      }

      if (
        input.currency !== undefined &&
        input.currency !== existing.currency &&
        (await businesses.hasFinancialRecords(businessId))
      ) {
        throw new BusinessServiceError(
          "CURRENCY_LOCKED",
          "Currency cannot be changed after invoices, payments or expenses exist. Create a new business instead.",
        );
      }

      const updated = await businesses.update(businessId, user.id, input);
      if (!updated) {
        throw new BusinessServiceError("BUSINESS_NOT_FOUND", "Business not found.");
      }
      return { ...updated, role: membership.role };
    },
  };
}

export const businessService = createBusinessService({
  memberships: prismaBusinessMembershipRepository,
  businesses: prismaBusinessRepository,
});
