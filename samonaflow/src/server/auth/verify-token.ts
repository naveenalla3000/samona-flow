// Server-only: stateless verification of a Supabase access token.
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { toAuthenticatedUser } from "./identity";
import type { AuthenticatedUser } from "./auth-types";

/**
 * Verifies a bearer token against the Supabase Auth server. Nothing derived
 * from a request body is ever used as an identity source.
 */
export async function verifyAccessToken(token: string): Promise<AuthenticatedUser | null> {
  const { url, anonKey } = getSupabaseEnv();

  // A plain, stateless client is intentional here: we validate the supplied
  // token only, with no cookie storage and no privileged key.
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error) return null;

  return toAuthenticatedUser(data.user);
}
