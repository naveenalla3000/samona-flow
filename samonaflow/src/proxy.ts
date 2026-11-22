import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { sanitizeNextPath } from "@/lib/auth/safe-redirect";
import { prisma } from "@/lib/prisma";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { updateSession } from "@/lib/supabase/middleware";

const isProduction = process.env.NODE_ENV === "production";

const AUTH_PATHS = new Set(["/login", "/signup"]);
const ONBOARDING_PATHS = new Set(["/onboarding"]);

function isPath(pathname: string, exact: string): boolean {
  return pathname === exact || pathname.startsWith(`${exact}/`);
}

async function hasBusinessMembership(userId: string): Promise<boolean> {
  const membership = await prisma.businessMembership.findFirst({
    where: { userId },
    select: { id: true },
  });
  return Boolean(membership);
}

/**
 * Next.js 16 convention (formerly `middleware.ts`).
 *
 * This is a UX/session-refresh layer only. API routes perform their own
 * server-side token verification and never rely on this proxy for authorization.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const { response, user } = await updateSession(request);

  const isAuthPage = AUTH_PATHS.has(pathname);
  const isDashboardPage = isPath(pathname, "/dashboard");
  const isOnboardingPage = Array.from(ONBOARDING_PATHS).some((path) => isPath(pathname, path));
  const isProtectedPage = isDashboardPage || isOnboardingPage;

  if (isProtectedPage && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (user && (isAuthPage || isDashboardPage || isOnboardingPage)) {
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
        setAll() {
          // Session refresh cookies are already handled by updateSession.
        },
      },
    });
    const {
      data: { user: verifiedUser },
    } = await supabase.auth.getUser();
    const hasBusiness = verifiedUser ? await hasBusinessMembership(verifiedUser.id) : false;

    if (isDashboardPage && !hasBusiness) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }

    if (isOnboardingPage && hasBusiness) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    if (isAuthPage) {
      if (!hasBusiness) {
        return NextResponse.redirect(new URL("/onboarding", request.url));
      }
      const next = sanitizeNextPath(request.nextUrl.searchParams.get("next"));
      return NextResponse.redirect(new URL(next === "/onboarding" ? "/dashboard" : next, request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and image optimization:
     * _next/static, _next/image, favicon.ico, and files with an extension.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)",
  ],
};


