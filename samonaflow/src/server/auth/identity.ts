import type { User } from "@supabase/supabase-js";
import type { AuthenticatedUser } from "./auth-types";

/** Builds the app identity from a Supabase Auth user returned by getUser(). */
export function toAuthenticatedUser(user: User | null | undefined): AuthenticatedUser | null {
  if (!user?.email) return null;
  return { id: user.id, email: user.email };
}

/** Only verified identities may be used to create or update a UserProfile. */
export function toVerifiedIdentity(user: User | null | undefined): AuthenticatedUser | null {
  if (!user?.email_confirmed_at) return null;
  return toAuthenticatedUser(user);
}
