"use client";

import { startTransition, useActionState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signupSchema, type SignupInput } from "@/lib/validations/auth";
import { signUpAction } from "@/server/auth/actions";
import { initialAuthFormState } from "@/server/auth/auth-types";
import { PasswordInput } from "./password-input";

const FIELD_CLASS =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 pr-11 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";

export function SignupForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signUpAction, initialAuthFormState);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  const onSubmit = handleSubmit((values) => {
    const formData = new FormData();
    formData.set("email", values.email);
    formData.set("password", values.password);
    formData.set("confirmPassword", values.confirmPassword);
    formData.set("next", next);
    startTransition(() => {
      formAction(formData);
    });
  });

  const emailError = errors.email?.message ?? state.fieldErrors?.email;
  const passwordError = errors.password?.message ?? state.fieldErrors?.password;
  const confirmError = errors.confirmPassword?.message ?? state.fieldErrors?.confirmPassword;

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
      <input type="hidden" name="next" value={next} />

      {state.status === "error" && state.message && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          {state.message}
        </p>
      )}

      {state.status === "needs-verification" && state.message && (
        <p
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          {state.message}
        </p>
      )}

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
          Email address
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          aria-invalid={Boolean(emailError)}
          aria-describedby={emailError ? "email-error" : undefined}
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          {...register("email")}
        />
        {emailError && (
          <p id="email-error" role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
            {emailError}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
          Password
        </label>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          aria-invalid={Boolean(passwordError)}
          aria-describedby={passwordError ? "password-error" : "password-hint"}
          className={FIELD_CLASS}
          {...register("password")}
        />
        {passwordError ? (
          <p
            id="password-error"
            role="alert"
            className="mt-1 text-xs text-red-600 dark:text-red-400"
          >
            {passwordError}
          </p>
        ) : (
          <p id="password-hint" className="mt-1 text-xs text-neutral-500">
            Use 8–72 characters.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium">
          Confirm password
        </label>
        <PasswordInput
          id="confirmPassword"
          autoComplete="new-password"
          placeholder="Repeat your password"
          aria-invalid={Boolean(confirmError)}
          aria-describedby={confirmError ? "confirm-error" : undefined}
          className={FIELD_CLASS}
          {...register("confirmPassword")}
        />
        {confirmError && (
          <p
            id="confirm-error"
            role="alert"
            className="mt-1 text-xs text-red-600 dark:text-red-400"
          >
            {confirmError}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending || state.status === "needs-verification"}
        className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
      >
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
