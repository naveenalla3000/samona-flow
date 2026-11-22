import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { getCurrentUser } from "@/server/auth/get-current-user";
import { resolvePostAuthPath } from "@/server/auth/post-auth-redirect";

export const instant = false;

type Props = { searchParams: Promise<{ error?: string | string[] }> };

export default async function ForgotPasswordPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (user) redirect(await resolvePostAuthPath(user, "/dashboard"));

  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <AuthShell>
      <h1 className="text-xl font-semibold">Reset your password</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Enter your email address and we&apos;ll send a secure password reset link.
      </p>

      {error === "invalid-or-expired" ? (
        <p role="alert" className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          That password reset link is invalid, expired, or was already used. Request a new one.
        </p>
      ) : null}

      <ForgotPasswordForm />

      <p className="mt-6 text-center text-sm text-neutral-500">
        Remembered your password?{" "}
        <Link href="/login" className="font-medium text-neutral-900 underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
