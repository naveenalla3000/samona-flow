// Server-only: do not import from client components.
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/supabase/env";

const isProduction = process.env.NODE_ENV === "production";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient(url, anonKey, {
    // Explicit, least-privilege cookie attributes. The anon key is public; no
    // service-role key is ever passed to a Supabase client in this module.
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      path: "/",
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // proxy refreshes the session and writes the cookies instead.
        }
      },
    },
  });
}
