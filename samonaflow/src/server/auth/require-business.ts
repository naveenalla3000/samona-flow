// Server-only helper for UI pages and actions. The MVP has one business per
// owner, so the business is resolved from a verified user's membership rather
// than from a client-provided value. No client input can influence this.
import { prismaBusinessMembershipRepository } from "@/server/repositories/business-membership-repository";
import type { AuthenticatedUser } from "./auth-types";

export type BusinessResolution =
  | { ok: true; businessId: string }
  | { ok: false };

export async function resolveCurrentBusiness(user: AuthenticatedUser): Promise<BusinessResolution> {
  const membership = await prismaBusinessMembershipRepository.findFirstForUser(user.id);
  return membership ? { ok: true, businessId: membership.businessId } : { ok: false };
}
