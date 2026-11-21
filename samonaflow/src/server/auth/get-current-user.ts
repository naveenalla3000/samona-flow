// Server-only: verifies the session with the Supabase Auth server.
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toAuthenticatedUser } from "./identity";
import type { AuthenticatedUser } from "./auth-types";

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createSupabaseServerClient();

  // getUser() calls the Auth server; getSession() would trust the cookie.
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;

  return toAuthenticatedUser(data.user);
}
