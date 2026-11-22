// Server-only: decides where an authenticated user should land. Users without
// a business membership must complete onboarding before entering the dashboard.
import { sanitizeNextPath } from "@/lib/auth/safe-redirect";
import { prismaBusinessMembershipRepository } from "@/server/repositories/business-membership-repository";
import type { AuthenticatedUser } from "./auth-types";

export async function resolvePostAuthPath(
  user: AuthenticatedUser,
  requested?: string | null,
): Promise<string> {
  const membership = await prismaBusinessMembershipRepository.findFirstForUser(user.id);
  if (!membership) {
    return "/onboarding";
  }

  const next = sanitizeNextPath(requested);
  return next === "/onboarding" ? "/dashboard" : next;
}
