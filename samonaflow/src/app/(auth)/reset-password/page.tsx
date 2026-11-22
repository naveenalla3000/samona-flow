import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getCurrentUser } from "@/server/auth/get-current-user";

export const instant = false;

export default async function ResetPasswordPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/forgot-password?error=invalid-or-expired");
  }

  return (
    <AuthShell>
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Enter a new password for your account. After resetting, you&apos;ll sign in again.
      </p>

      <ResetPasswordForm />

      <p className="mt-6 text-center text-sm text-neutral-500">
        Need a new link?{" "}
        <Link href="/forgot-password" className="font-medium text-neutral-900 underline underline-offset-4 dark:text-neutral-100">
          Request password reset
        </Link>
      </p>
    </AuthShell>
  );
}
