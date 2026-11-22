"use client";

import { startTransition, useActionState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validations/auth";
import { resetPasswordAction } from "@/server/auth/actions";
import { initialAuthFormState } from "@/server/auth/auth-types";
import { PasswordInput } from "./password-input";

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialAuthFormState);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = handleSubmit((values) => {
    const formData = new FormData();
    formData.set("password", values.password);
    formData.set("confirmPassword", values.confirmPassword);
    startTransition(() => {
      formAction(formData);
    });
  });

  const passwordError = errors.password?.message ?? state.fieldErrors?.password;
  const confirmPasswordError = errors.confirmPassword?.message ?? state.fieldErrors?.confirmPassword;

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
      {state.status === "error" && state.message ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          {state.message}
        </p>
      ) : null}

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
          New password
        </label>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          placeholder="Create a new password"
          aria-invalid={Boolean(passwordError)}
          aria-describedby={passwordError ? "password-error" : undefined}
          {...register("password")}
        />
        {passwordError ? (
          <p id="password-error" role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
            {passwordError}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium">
          Confirm new password
        </label>
        <PasswordInput
          id="confirmPassword"
          autoComplete="new-password"
          placeholder="Re-enter your new password"
          aria-invalid={Boolean(confirmPasswordError)}
          aria-describedby={confirmPasswordError ? "confirm-password-error" : undefined}
          {...register("confirmPassword")}
        />
        {confirmPasswordError ? (
          <p
            id="confirm-password-error"
            role="alert"
            className="mt-1 text-xs text-red-600 dark:text-red-400"
          >
            {confirmPasswordError}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-blue-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-600 dark:text-white dark:hover:bg-white"
      >
        {pending ? "Resetting password…" : "Reset password"}
      </button>
    </form>
  );
}
