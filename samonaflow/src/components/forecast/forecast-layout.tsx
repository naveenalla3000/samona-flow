import Link from "next/link";
import type { ReactNode } from "react";
import { FORECAST_HORIZONS, type ForecastHorizon } from "@/types/forecast";

const CARD_CLASS =
  "rounded-lg border border-neutral-200 bg-white p-4 shadow-sm";

const NEGATIVE_CLASS = "text-red-600";
const POSITIVE_CLASS = "text-emerald-700";

export function ForecastHeader({ horizon }: { horizon: ForecastHorizon }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold">Cash flow forecast</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500">
          A deterministic estimate based on outstanding invoices, recorded payments and unpaid
          expenses. It is not a guarantee that a customer will pay on a specific date.
        </p>
      </div>
      <div className="flex flex-col items-start gap-3 sm:items-end">
        <ForecastHorizonSelector horizon={horizon} />
        <Link
          href={`/dashboard/forecast/simulator?horizon=${horizon}`}
          className="text-sm text-neutral-500 hover:underline"
        >
          What-if simulator →
        </Link>
      </div>
    </header>
  );
}

export function ForecastHorizonSelector({
  horizon,
  basePath = "/dashboard/forecast",
}: {
  horizon: ForecastHorizon;
  basePath?: string;
}) {
  return (
    <nav aria-label="Forecast horizon" className="flex flex-wrap gap-2">
      {FORECAST_HORIZONS.map((option) => (
        <Link
          key={option}
          href={`${basePath}?horizon=${option}`}
          aria-current={option === horizon ? "page" : undefined}
          className={`rounded-md border px-3 py-2 text-sm font-medium ${
            option === horizon
              ? "border-blue-900 bg-blue-900 text-white"
              : "border-neutral-300 bg-white text-neutral-700 hover:bg-white"
          }`}
        >
          {option} days
        </Link>
      ))}
    </nav>
  );
}

export function ForecastSimulatorHeader({ horizon }: { horizon: ForecastHorizon }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <Link href="/dashboard/forecast" className="text-sm text-neutral-500 hover:underline">
          ← Cash flow forecast
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">What-if cash flow simulator</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500">
          Test hypothetical payment and expense changes against the current forecast. Nothing you
          add here creates, updates or deletes an invoice, payment, reversal or expense.
        </p>
      </div>
      <div className="flex flex-col items-start gap-3 sm:items-end">
        <ForecastHorizonSelector
          horizon={horizon}
          basePath="/dashboard/forecast/simulator"
        />
        <Link href="/dashboard" className="text-sm text-neutral-500 hover:underline">
          Dashboard
        </Link>
      </div>
    </header>
  );
}

export function ForecastSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className={CARD_CLASS}>
      <div className="mb-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-neutral-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function ForecastStat({
  label,
  value,
  helper,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  helper?: string;
  tone?: "neutral" | "positive" | "negative" | "warning";
}) {
  const toneClass =
    tone === "negative"
      ? NEGATIVE_CLASS
      : tone === "positive"
        ? POSITIVE_CLASS
        : tone === "warning"
          ? "text-amber-700"
          : "text-neutral-900";

  return (
    <div className={CARD_CLASS}>
      <p className="text-sm text-neutral-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {helper ? <p className="mt-1 text-xs text-neutral-500">{helper}</p> : null}
    </div>
  );
}

export function Money({
  currency,
  value,
  className = "",
}: {
  currency: string;
  value: string;
  className?: string;
}) {
  const negative = value.startsWith("-");
  return (
    <span className={`tabular-nums ${negative ? NEGATIVE_CLASS : ""} ${className}`.trim()}>
      {currency} {value}
    </span>
  );
}

export function ForecastEstimateNote({
  calculatedAt,
  timezone,
}: {
  calculatedAt: string;
  timezone: string;
}) {
  let formatted = calculatedAt;
  try {
    formatted = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(calculatedAt));
  } catch {
    // An invalid stored timezone must never break the page.
  }

  return (
    <p className="text-xs text-neutral-500">
      Estimate only. Last calculated {formatted} ({timezone}). It uses the expected payment date
      when set, otherwise the invoice due date. Overdue items are projected on the first day.
    </p>
  );
}

export function ForecastNoBusinessState() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Cash flow forecast</h1>
      <div className="mt-6 rounded-lg border border-dashed border-neutral-300 p-10 text-center">
        <h2 className="text-lg font-medium">No business set up yet</h2>
        <p className="mt-2 text-sm text-neutral-500">
          Create a business and record invoices or expenses before forecasting.
        </p>
        <Link href="/onboarding" className="mt-4 inline-flex rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">Set up business</Link>
      </div>
    </main>
  );
}

export function ForecastLoadError() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Cash flow forecast</h1>
      <div
        role="alert"
        className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        We couldn&apos;t load the forecast right now. Please try again.
      </div>
    </main>
  );
}
