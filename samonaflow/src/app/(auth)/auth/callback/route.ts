import { NextResponse, type NextRequest } from "next/server";
import { sanitizeNextPath } from "@/lib/auth/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toVerifiedIdentity } from "@/server/auth/identity";
import { syncUserProfile } from "@/server/auth/profile-sync";

const NO_STORE = { "Cache-Control": "no-store" };

function loginError(request: NextRequest, reason: string): NextResponse {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url, { headers: NO_STORE });
}

/**
 * PKCE / email-verification callback. The profile is synchronized only after
 * Supabase has confirmed the code and the user's email address.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const next = sanitizeNextPath(request.nextUrl.searchParams.get("next"));
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return loginError(request, "invalid-link");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return loginError(request, "link-expired");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const identity = toVerifiedIdentity(user);
  if (identity) {
    await syncUserProfile(identity);
  }

  return NextResponse.redirect(new URL(next, request.url), { headers: NO_STORE });
}
