"use client";

import { useActionState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { signInAction } from "@/server/auth/actions";
import { initialAuthFormState } from "@/server/auth/auth-types";
import { PasswordInput } from "./password-input";

const FIELD_CLASS =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signInAction, initialAuthFormState);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit((values) => {
    const formData = new FormData();
    formData.set("email", values.email);
    formData.set("password", values.password);
    formData.set("next", next);
    formAction(formData);
  });

  const emailError = errors.email?.message ?? state.fieldErrors?.email;
  const passwordError = errors.password?.message ?? state.fieldErrors?.password;

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
          className={FIELD_CLASS}
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
          autoComplete="current-password"
          placeholder="Your password"
          aria-invalid={Boolean(passwordError)}
          aria-describedby={passwordError ? "password-error" : undefined}
          {...register("password")}
        />
        {passwordError && (
          <p
            id="password-error"
            role="alert"
            className="mt-1 text-xs text-red-600 dark:text-red-400"
          >
            {passwordError}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
