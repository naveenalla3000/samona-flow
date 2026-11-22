"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState } from "react";
import { useForm } from "react-hook-form";
import { createCustomerSchema } from "@/lib/validations/customer";
import type { CustomerFormState, CustomerFormValues } from "@/types/customer-form";

type CustomerFormProps = {
  submitLabel: string;
  defaultValues: CustomerFormValues;
  action: (state: CustomerFormState, formData: FormData) => Promise<CustomerFormState>;
  cancelHref: string;
};

const FIELD_CLASS =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";

const LABEL_CLASS = "block text-sm font-medium text-neutral-800 dark:text-neutral-200";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}

export function CustomerForm({
  submitLabel,
  defaultValues,
  action,
  cancelHref,
}: CustomerFormProps) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(createCustomerSchema),
    defaultValues,
  });

  const onSubmit = handleSubmit((values) => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(values)) {
      formData.set(key, value ?? "");
    }
    startTransition(() => {
      formAction(formData);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8 space-y-6">
      {state.status === "error" && state.message ? (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          {state.message}
        </div>
      ) : null}

      <div>
        <label htmlFor="name" className={LABEL_CLASS}>
          Customer name <span className="text-red-600">*</span>
        </label>
        <input
          id="name"
          type="text"
          autoComplete="name"
          maxLength={200}
          aria-invalid={Boolean(errors.name ?? state.fieldErrors?.name)}
          aria-describedby={errors.name || state.fieldErrors?.name ? "name-error" : undefined}
          className={`${FIELD_CLASS} mt-1`}
          {...register("name")}
        />
        <FieldError id="name-error" message={errors.name?.message ?? state.fieldErrors?.name} />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="email" className={LABEL_CLASS}>
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(errors.email ?? state.fieldErrors?.email)}
            aria-describedby={errors.email || state.fieldErrors?.email ? "email-error" : undefined}
            className={`${FIELD_CLASS} mt-1`}
            {...register("email")}
          />
          <FieldError id="email-error" message={errors.email?.message ?? state.fieldErrors?.email} />
        </div>

        <div>
          <label htmlFor="phone" className={LABEL_CLASS}>
            Phone
          </label>
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            maxLength={50}
            aria-invalid={Boolean(errors.phone ?? state.fieldErrors?.phone)}
            aria-describedby={errors.phone || state.fieldErrors?.phone ? "phone-error" : undefined}
            className={`${FIELD_CLASS} mt-1`}
            {...register("phone")}
          />
          <FieldError id="phone-error" message={errors.phone?.message ?? state.fieldErrors?.phone} />
        </div>
      </div>

      <div>
        <label htmlFor="companyName" className={LABEL_CLASS}>
          Company name
        </label>
        <input
          id="companyName"
          type="text"
          autoComplete="organization"
          maxLength={200}
          aria-invalid={Boolean(errors.companyName ?? state.fieldErrors?.companyName)}
          aria-describedby={
            errors.companyName || state.fieldErrors?.companyName ? "companyName-error" : undefined
          }
          className={`${FIELD_CLASS} mt-1`}
          {...register("companyName")}
        />
        <FieldError
          id="companyName-error"
          message={errors.companyName?.message ?? state.fieldErrors?.companyName}
        />
      </div>

      <div>
        <label htmlFor="address" className={LABEL_CLASS}>
          Address
        </label>
        <textarea
          id="address"
          rows={3}
          aria-invalid={Boolean(errors.address ?? state.fieldErrors?.address)}
          aria-describedby={errors.address || state.fieldErrors?.address ? "address-error" : undefined}
          className={`${FIELD_CLASS} mt-1`}
          {...register("address")}
        />
        <FieldError id="address-error" message={errors.address?.message ?? state.fieldErrors?.address} />
      </div>

      <div>
        <label htmlFor="notes" className={LABEL_CLASS}>
          Notes
        </label>
        <textarea
          id="notes"
          rows={3}
          aria-invalid={Boolean(errors.notes ?? state.fieldErrors?.notes)}
          aria-describedby={errors.notes || state.fieldErrors?.notes ? "notes-error" : undefined}
          className={`${FIELD_CLASS} mt-1`}
          {...register("notes")}
        />
        <FieldError id="notes-error" message={errors.notes?.message ?? state.fieldErrors?.notes} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900 disabled:opacity-60 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500"
        >
          {pending ? "Saving..." : submitLabel}
        </button>
        <a
          href={cancelHref}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
