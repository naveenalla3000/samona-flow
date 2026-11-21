// Server-only: mirrors the verified Supabase Auth user into Prisma.
import { prisma } from "@/server/database/connection";
import type { AuthenticatedUser } from "./auth-types";

/**
 * Idempotent upsert keyed by the Supabase Auth UUID. The caller must pass an
 * identity obtained from a verified Supabase user, never from request input.
 */
export async function syncUserProfile(identity: AuthenticatedUser): Promise<void> {
  await prisma.userProfile.upsert({
    where: { id: identity.id },
    create: { id: identity.id, email: identity.email },
    update: { email: identity.email },
  });
}
