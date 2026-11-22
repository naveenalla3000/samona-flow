import Link from "next/link";
import { redirect } from "next/navigation";
import { sanitizeNextPath } from "@/lib/auth/safe-redirect";
import { getCurrentUser } from "@/server/auth/get-current-user";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

// Session and searchParams are request-time data and cannot be prerendered.
export const instant = false;

type LoginPageProps = {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[]; reset?: string | string[] }>;
};

const LOGIN_ERRORS: Record<string, string> = {
  "invalid-link": "That verification link is invalid. Please try signing in or sign up again.",
  "link-expired": "That verification link has expired or was already used. Request a new one.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = sanitizeNextPath(typeof params.next === "string" ? params.next : undefined);
  const user = await getCurrentUser();

  if (user) {
    redirect(next);
  }

  const errorKey = typeof params.error === "string" ? params.error : undefined;
  const reset = typeof params.reset === "string" ? params.reset : undefined;
  const notice = errorKey ? LOGIN_ERRORS[errorKey] : undefined;
  const success = reset === "success" ? "Your password has been reset. Sign in with your new password." : undefined;

  return (
    <AuthShell>
      <h1 className="text-xl font-semibold">Welcome back</h1>
      <p className="mt-1 text-sm text-neutral-500">Sign in to your samonaFlow account.</p>

      {success && (
        <p role="status" className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          {success}
        </p>
      )}
      {notice && (
        <p
          role="alert"
          className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
        >
          {notice}
        </p>
      )}

      <LoginForm next={next} />

      <p className="mt-6 text-center text-sm text-neutral-500">
        New here?{" "}
        <Link
          href={next === "/dashboard" ? "/signup" : `/signup?next=${encodeURIComponent(next)}`}
          className="font-medium text-neutral-900 underline underline-offset-4 dark:text-neutral-100"
        >
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
