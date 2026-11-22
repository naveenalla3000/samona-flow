import Link from "next/link";
import { redirect } from "next/navigation";
import { sanitizeNextPath } from "@/lib/auth/safe-redirect";
import { getCurrentUser } from "@/server/auth/get-current-user";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";

// Session and searchParams are request-time data and cannot be prerendered.
export const instant = false;

type SignupPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const next = sanitizeNextPath(typeof params.next === "string" ? params.next : undefined);
  const user = await getCurrentUser();

  if (user) {
    redirect(next);
  }

  return (
    <AuthShell>
      <h1 className="text-xl font-semibold">Create your account</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Start managing your finances with samonaFlow.
      </p>

      <SignupForm next={next} />

      <p className="mt-6 text-center text-sm text-neutral-500">
        Already have an account?{" "}
        <Link
          href={next === "/dashboard" ? "/login" : `/login?next=${encodeURIComponent(next)}`}
          className="font-medium text-neutral-900 underline underline-offset-4 dark:text-neutral-100"
        >
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
