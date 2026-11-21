import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase/env";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Refreshes the Supabase session and returns a response carrying both the
 * refreshed auth cookies and the anti-caching headers required by @supabase/ssr.
 *
 * `getUser()` verifies the JWT with the Supabase Auth server; `getSession()`
 * only decodes the cookie and must not be used for authorization.
 */
export async function updateSession(
  request: NextRequest,
): Promise<{ response: NextResponse; user: User | null }> {
  let response = NextResponse.next({ request });

  const { url, anonKey } = getSupabaseEnv();

  const supabase = createServerClient(url, anonKey, {
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      path: "/",
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        // Prevent CDNs/proxies from caching a response that contains session cookies.
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
