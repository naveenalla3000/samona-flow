"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useActionState } from "react";
import { useForm } from "react-hook-form";
import {
  BUSINESS_CURRENCIES,
  BUSINESS_TIMEZONES,
  BUSINESS_TYPES,
  createBusinessSchema,
} from "@/lib/validations/business";
import type { BusinessFormState, BusinessFormValues } from "@/types/business-form";

type BusinessFormProps = {
  mode: "create" | "update";
  submitLabel: string;
  defaultValues: BusinessFormValues;
  action: (state: BusinessFormState, formData: FormData) => Promise<BusinessFormState>;
  cancelHref?: string;
};

const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-700 focus:ring-2 focus:ring-blue-700/15 disabled:opacity-60";
const LABEL_CLASS = "block text-sm font-medium text-slate-800";
const HINT_CLASS = "mt-1 text-xs text-slate-500";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-sm text-red-700">
      {message}
    </p>
  );
}

/**
 * Keep a stored value selectable even when it is outside the curated list
 * (for example a business imported with another ISO currency or timezone).
 * Otherwise the browser would silently select the first option and overwrite
 * the real setting on save.
 */
function withCurrent(options: readonly string[], current: string | undefined): string[] {
  if (!current || options.includes(current)) return [...options];
  return [current, ...options];
}

export function BusinessForm({
  mode,
  submitLabel,
  defaultValues,
  action,
  cancelHref,
}: BusinessFormProps) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BusinessFormValues>({
    resolver: zodResolver(createBusinessSchema),
    defaultValues,
  });

  const onSubmit = handleSubmit((values) => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(values)) {
      formData.set(key, value == null ? "" : String(value));
    }
    formAction(formData);
  });

  const errorFor = (field: keyof BusinessFormValues) =>
    errors[field]?.message ?? state.fieldErrors?.[field];

  const businessTypeOptions = withCurrent(BUSINESS_TYPES, defaultValues.businessType);
  const currencyOptions = withCurrent(BUSINESS_CURRENCIES, defaultValues.currency);
  const timezoneOptions = withCurrent(BUSINESS_TIMEZONES, defaultValues.timezone);

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-8">
      {state.status === "error" && state.message ? (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {state.message}
        </div>
      ) : null}

      {state.status === "success" && state.message ? (
        <div
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {state.message}
        </div>
      ) : null}

      <section aria-labelledby="business-details-heading" className="space-y-5">
        <div>
          <h2 id="business-details-heading" className="text-base font-semibold text-slate-900">
            Business details
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            These details appear on invoices and in the dashboard header.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className={LABEL_CLASS}>
              Business name <span className="text-red-600">*</span>
            </label>
            <input
              id="name"
              type="text"
              autoComplete="organization"
              maxLength={200}
              aria-invalid={Boolean(errorFor("name"))}
              aria-describedby={errorFor("name") ? "name-error" : undefined}
              className={FIELD_CLASS}
              {...register("name")}
            />
            <FieldError id="name-error" message={errorFor("name")} />
          </div>

          <div>
            <label htmlFor="ownerName" className={LABEL_CLASS}>
              Owner name <span className="text-red-600">*</span>
            </label>
            <input
              id="ownerName"
              type="text"
              autoComplete="name"
              maxLength={200}
              aria-invalid={Boolean(errorFor("ownerName"))}
              aria-describedby={errorFor("ownerName") ? "ownerName-error" : undefined}
              className={FIELD_CLASS}
              {...register("ownerName")}
            />
            <FieldError id="ownerName-error" message={errorFor("ownerName")} />
          </div>

          <div>
            <label htmlFor="email" className={LABEL_CLASS}>
              Business email <span className="text-red-600">*</span>
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(errorFor("email"))}
              aria-describedby={errorFor("email") ? "email-error" : undefined}
              className={FIELD_CLASS}
              {...register("email")}
            />
            <FieldError id="email-error" message={errorFor("email")} />
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
              aria-invalid={Boolean(errorFor("phone"))}
              aria-describedby={errorFor("phone") ? "phone-error" : undefined}
              className={FIELD_CLASS}
              {...register("phone")}
            />
            <FieldError id="phone-error" message={errorFor("phone")} />
          </div>

          <div>
            <label htmlFor="businessType" className={LABEL_CLASS}>
              Business type <span className="text-red-600">*</span>
            </label>
            <select
              id="businessType"
              aria-invalid={Boolean(errorFor("businessType"))}
              aria-describedby={errorFor("businessType") ? "businessType-error" : undefined}
              className={FIELD_CLASS}
              {...register("businessType")}
            >
              {businessTypeOptions.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <FieldError id="businessType-error" message={errorFor("businessType")} />
          </div>
        </div>
      </section>

      <section aria-labelledby="financial-settings-heading" className="space-y-5">
        <div>
          <h2 id="financial-settings-heading" className="text-base font-semibold text-slate-900">
            Financial settings
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Currency and timezone drive every financial calculation. The opening balance is a
            manual starting position, not a live bank balance.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="currency" className={LABEL_CLASS}>
              Currency <span className="text-red-600">*</span>
            </label>
            <select
              id="currency"
              aria-invalid={Boolean(errorFor("currency"))}
              aria-describedby={errorFor("currency") ? "currency-error" : "currency-hint"}
              className={FIELD_CLASS}
              {...register("currency")}
            >
              {currencyOptions.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
            <p id="currency-hint" className={HINT_CLASS}>
              {mode === "update"
                ? "Locked after the first invoice, payment or expense is recorded."
                : "Invoices snapshot this currency when they are created."}
            </p>
            <FieldError id="currency-error" message={errorFor("currency")} />
          </div>

          <div>
            <label htmlFor="timezone" className={LABEL_CLASS}>
              Timezone <span className="text-red-600">*</span>
            </label>
            <select
              id="timezone"
              aria-invalid={Boolean(errorFor("timezone"))}
              aria-describedby={errorFor("timezone") ? "timezone-error" : "timezone-hint"}
              className={FIELD_CLASS}
              {...register("timezone")}
            >
              {timezoneOptions.map((timezone) => (
                <option key={timezone} value={timezone}>
                  {timezone}
                </option>
              ))}
            </select>
            <p id="timezone-hint" className={HINT_CLASS}>
              Due dates and overdue checks use this business-local calendar.
            </p>
            <FieldError id="timezone-error" message={errorFor("timezone")} />
          </div>

          <div>
            <label htmlFor="openingBalance" className={LABEL_CLASS}>
              Opening balance <span className="text-red-600">*</span>
            </label>
            <input
              id="openingBalance"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              aria-invalid={Boolean(errorFor("openingBalance"))}
              aria-describedby={
                errorFor("openingBalance") ? "openingBalance-error" : "openingBalance-hint"
              }
              className={FIELD_CLASS}
              {...register("openingBalance")}
            />
            <p id="openingBalance-hint" className={HINT_CLASS}>
              May be negative. Use a decimal string such as 25000.00.
            </p>
            <FieldError id="openingBalance-error" message={errorFor("openingBalance")} />
          </div>

          <div>
            <label htmlFor="openingBalanceDate" className={LABEL_CLASS}>
              Opening balance date <span className="text-red-600">*</span>
            </label>
            <input
              id="openingBalanceDate"
              type="date"
              aria-invalid={Boolean(errorFor("openingBalanceDate"))}
              aria-describedby={
                errorFor("openingBalanceDate")
                  ? "openingBalanceDate-error"
                  : "openingBalanceDate-hint"
              }
              className={FIELD_CLASS}
              {...register("openingBalanceDate")}
            />
            <p id="openingBalanceDate-hint" className={HINT_CLASS}>
              Cash recorded on or after this date is added to the position.
            </p>
            <FieldError
              id="openingBalanceDate-error"
              message={errorFor("openingBalanceDate")}
            />
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-5">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        {cancelHref ? (
          <Link
            href={cancelHref}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900"
          >
            Cancel
          </Link>
        ) : null}
      </div>
    </form>
  );
}
