"use server";

import { redirect } from "next/navigation";
import type { ZodError } from "zod";
import { getAppUrl } from "@/lib/config/app-url";
import { sanitizeNextPath } from "@/lib/auth/safe-redirect";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from "@/lib/validations/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapAuthError } from "./auth-errors";
import { toVerifiedIdentity } from "./identity";
import { resolvePostAuthPath } from "./post-auth-redirect";
import { syncUserProfile } from "./profile-sync";
import type { AuthFormState } from "./auth-types";

type FieldErrors = NonNullable<AuthFormState["fieldErrors"]>;

function toFieldErrors(error: ZodError): FieldErrors {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (
      (field === "email" || field === "password" || field === "confirmPassword") &&
      !fieldErrors[field]
    ) {
      fieldErrors[field] = issue.message;
    }
  }
  return fieldErrors;
}

function invalidForm(): AuthFormState {
  return { status: "error", message: "Please correct the highlighted fields." };
}

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function signInAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: getString(formData, "email"),
    password: getString(formData, "password"),
  });

  if (!parsed.success) {
    return { ...invalidForm(), fieldErrors: toFieldErrors(parsed.error) };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return {
      status: "error",
      message: mapAuthError(error.message, "Unable to sign in. Please try again."),
    };
  }

  // getUser() re-verifies the freshly issued session with the Auth server.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const identity = toVerifiedIdentity(user);
  if (identity) {
    await syncUserProfile(identity);
    redirect(await resolvePostAuthPath(identity, getString(formData, "next")));
  }

  redirect("/onboarding");
}

export async function signUpAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse({
    email: getString(formData, "email"),
    password: getString(formData, "password"),
    confirmPassword: getString(formData, "confirmPassword"),
  });

  if (!parsed.success) {
    return { ...invalidForm(), fieldErrors: toFieldErrors(parsed.error) };
  }

  const next = sanitizeNextPath(getString(formData, "next"));
  const callbackUrl = new URL("/auth/callback", getAppUrl());
  callbackUrl.searchParams.set("next", next);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: callbackUrl.toString() },
  });

  if (error) {
    return {
      status: "error",
      message: mapAuthError(error.message, "Unable to create your account. Please try again."),
    };
  }

  // With email confirmation enabled Supabase returns a user but no session.
  // No profile is created until the address is verified in the callback.
  if (!data.session) {
    return {
      status: "needs-verification",
      message:
        "Check your email for a verification link. You can sign in once your address is confirmed.",
    };
  }

  const identity = toVerifiedIdentity(data.user);
  if (identity) {
    await syncUserProfile(identity);
    redirect(await resolvePostAuthPath(identity, next));
  }

  redirect(next);
}

export async function forgotPasswordAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = forgotPasswordSchema.safeParse({
    email: getString(formData, "email"),
  });

  if (!parsed.success) {
    return { ...invalidForm(), fieldErrors: toFieldErrors(parsed.error) };
  }

  const callbackUrl = new URL("/auth/callback", getAppUrl());
  callbackUrl.searchParams.set("next", "/reset-password");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: callbackUrl.toString(),
  });

  if (error) {
    return {
      status: "error",
      message: mapAuthError(
        error.message,
        "Unable to send a password reset link. Please try again.",
      ),
    };
  }

  return {
    status: "success",
    message:
      "If an account exists for that email, a password reset link has been sent.",
  };
}

export async function resetPasswordAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = resetPasswordSchema.safeParse({
    password: getString(formData, "password"),
    confirmPassword: getString(formData, "confirmPassword"),
  });

  if (!parsed.success) {
    return { ...invalidForm(), fieldErrors: toFieldErrors(parsed.error) };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/forgot-password?error=invalid-or-expired");
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return {
      status: "error",
      message: mapAuthError(error.message, "Unable to reset your password. Please try again."),
    };
  }

  await supabase.auth.signOut();
  redirect("/login?reset=success");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
