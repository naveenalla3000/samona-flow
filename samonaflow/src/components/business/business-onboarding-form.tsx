"use client";

import { useActionState } from "react";
import { createBusinessAction } from "@/server/actions/business-actions";
import { initialBusinessFormState } from "@/types/business";

type Props = { defaultEmail: string };

const BUSINESS_TYPES = [
  "Freelancer",
  "Consultant",
  "Agency",
  "Studio",
  "E-commerce",
  "Retail",
  "Services",
  "SaaS",
  "Other",
] as const;

const CURRENCIES = [
  { value: "INR", label: "INR - Indian Rupee" },
  { value: "USD", label: "USD - US Dollar" },
  { value: "EUR", label: "EUR - Euro" },
  { value: "GBP", label: "GBP - British Pound" },
  { value: "AED", label: "AED - UAE Dirham" },
  { value: "SGD", label: "SGD - Singapore Dollar" },
  { value: "AUD", label: "AUD - Australian Dollar" },
  { value: "CAD", label: "CAD - Canadian Dollar" },
] as const;

const TIMEZONES = [
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST)" },
  { value: "UTC", label: "UTC" },
  { value: "Asia/Dubai", label: "Asia/Dubai (GST)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (SGT)" },
  { value: "Europe/London", label: "Europe/London (GMT/BST)" },
  { value: "Europe/Berlin", label: "Europe/Berlin (CET/CEST)" },
  { value: "America/New_York", label: "America/New_York (ET)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PT)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (AET)" },
] as const;

export function BusinessOnboardingForm({ defaultEmail }: Props) {
  const [state, action, pending] = useActionState(createBusinessAction, initialBusinessFormState);

  return (
    <form action={action} className="space-y-6" noValidate>
      {state.status === "error" && state.message ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          {state.message}
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Business name" name="name" required error={state.fieldErrors?.name} />
        <Field label="Owner name" name="ownerName" required error={state.fieldErrors?.ownerName} />
        <Field
          label="Email"
          name="email"
          type="email"
          required
          defaultValue={defaultEmail}
          readOnly
          error={state.fieldErrors?.email}
        />
        <Field label="Phone number (optional)" name="phone" error={state.fieldErrors?.phone} />
        <SelectField
          label="Business type"
          name="businessType"
          required
          defaultValue=""
          error={state.fieldErrors?.businessType}
          options={BUSINESS_TYPES.map((type) => ({ value: type, label: type }))}
          placeholder="Select business type"
        />
        <SelectField
          label="Currency"
          name="currency"
          required
          defaultValue="INR"
          error={state.fieldErrors?.currency}
          options={CURRENCIES.map((currency) => ({ value: currency.value, label: currency.label }))}
        />
        <Field
          label="Business address (optional)"
          name="address"
          className="md:col-span-2"
          error={state.fieldErrors?.address}
        />
        <SelectField
          label="Timezone"
          name="timezone"
          required
          defaultValue="Asia/Kolkata"
          error={state.fieldErrors?.timezone}
          options={TIMEZONES.map((tz) => ({ value: tz.value, label: tz.label }))}
        />
        <Field
          label="Financial start date"
          name="openingBalanceDate"
          type="date"
          required
          error={state.fieldErrors?.openingBalanceDate}
        />
        <Field
          label="Opening cash balance"
          name="openingBalance"
          required
          defaultValue="0.00"
          inputMode="decimal"
          className="md:col-span-2"
          error={state.fieldErrors?.openingBalance}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-brand-700 px-5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-brand-600 dark:hover:bg-brand-500"
      >
        {pending ? "Creating workspace..." : "Create business workspace"}
      </button>
    </form>
  );
}

const inputClassName =
  "h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-brand-400 dark:focus:ring-brand-400/15";

function Field({
  label,
  name,
  error,
  type = "text",
  required,
  defaultValue,
  placeholder,
  inputMode,
  readOnly,
  className,
}: {
  label: string;
  name: string;
  error?: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  inputMode?: "decimal" | "text" | "email";
  readOnly?: boolean;
  className?: string;
}) {
  const id = `business-${name}`;
  return (
    <label className={`block text-sm ${className ?? ""}`}>
      <span className="mb-1.5 block font-medium text-slate-700 dark:text-slate-200">{label}</span>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        inputMode={inputMode}
        readOnly={readOnly}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${inputClassName} ${readOnly ? "cursor-not-allowed bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-400" : ""}`}
      />
      {error ? (
        <span id={`${id}-error`} className="mt-1.5 block text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function SelectField({
  label,
  name,
  error,
  required,
  defaultValue,
  options,
  placeholder,
  className,
}: {
  label: string;
  name: string;
  error?: string;
  required?: boolean;
  defaultValue?: string;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  className?: string;
}) {
  const id = `business-${name}`;
  return (
    <label className={`block text-sm ${className ?? ""}`}>
      <span className="mb-1.5 block font-medium text-slate-700 dark:text-slate-200">{label}</span>
      <select
        id={id}
        name={name}
        required={required}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${inputClassName} appearance-none pr-10`}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <span id={`${id}-error`} className="mt-1.5 block text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      ) : null}
    </label>
  );
}
