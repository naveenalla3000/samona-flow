// Server-only helper for UI pages and actions. A user may own or belong to
// several businesses; the active one is selected by an httpOnly cookie and is
// always re-verified against a BusinessMembership row. A stale or forged cookie
// therefore falls back to the user's first membership and can never expose
// another tenant's data.
import { businessIdSchema } from "@/lib/validations/business";
import { prismaBusinessMembershipRepository } from "@/server/repositories/business-membership-repository";
import { getActiveBusinessId } from "./active-business";
import type { AuthenticatedUser } from "./auth-types";

export type BusinessResolution =
  | { ok: true; businessId: string }
  | { ok: false };

export async function resolveCurrentBusiness(user: AuthenticatedUser): Promise<BusinessResolution> {
  const requested = await getActiveBusinessId();
  const parsed = requested ? businessIdSchema.safeParse(requested) : null;

  if (parsed?.success) {
    const membership = await prismaBusinessMembershipRepository.findMembership(
      user.id,
      parsed.data,
    );
    if (membership) {
      return { ok: true, businessId: membership.businessId };
    }
  }

  const membership = await prismaBusinessMembershipRepository.findFirstForUser(user.id);
  return membership ? { ok: true, businessId: membership.businessId } : { ok: false };
}
