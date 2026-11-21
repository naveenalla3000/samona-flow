// Server-only: reusable authorization guard for API Route Handlers.
import { NextResponse } from "next/server";
import { getCurrentUser } from "./get-current-user";
import { verifyAccessToken } from "./verify-token";
import type { AuthenticatedUser } from "./auth-types";

export type ApiAuthResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; response: NextResponse };

const UNAUTHORIZED_BODY = { error: "unauthenticated", message: "Authentication is required." };

function unauthorized(): ApiAuthResult {
  return {
    ok: false,
    response: NextResponse.json(UNAUTHORIZED_BODY, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    }),
  };
}

/**
 * Accepts either `Authorization: Bearer <access_token>` or the SSR session
 * cookie, and verifies the identity with the Supabase Auth server in both cases.
 * Each protected route handler must call this itself — the proxy is not an
 * authorization boundary for APIs.
 */
export async function requireApiUser(request: Request): Promise<ApiAuthResult> {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);

  if (match?.[1]) {
    const user = await verifyAccessToken(match[1].trim());
    return user ? { ok: true, user } : unauthorized();
  }

  const user = await getCurrentUser();
  return user ? { ok: true, user } : unauthorized();
}
