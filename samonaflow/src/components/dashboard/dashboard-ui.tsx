import Link from "next/link";
import type { ReactNode } from "react";
import { formatMoney, parseSignedMoney } from "@/lib/invoice-math";
import type { DashboardPeriod } from "@/types/dashboard";

export type Tone = "neutral" | "primary" | "positive" | "warning" | "negative" | "brand";

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-slate-900",
  primary: "text-blue-900",
  brand: "text-blue-900",
  positive: "text-emerald-700",
  warning: "text-amber-700",
  negative: "text-red-700",
};

const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-slate-400",
  primary: "bg-blue-700",
  brand: "bg-blue-700",
  positive: "bg-emerald-500",
  warning: "bg-amber-500",
  negative: "bg-red-500",
};

export const DASHBOARD_PERIODS: readonly DashboardPeriod[] = [
  "this_month",
  "last_month",
  "last_30_days",
  "last_90_days",
];

export const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  this_month: "This month",
  last_month: "Last month",
  last_30_days: "Last 30 days",
  last_90_days: "Last 90 days",
};

/** Summary money is integer minor units ("12345" = 123.45). */
export function formatMinor(minor: string, currency: string): string {
  return `${currency} ${formatMoney(BigInt(minor))}`;
}

/** Forecast, invoice, expense and payment money is canonical 2dp major units. */
export function formatMajor(value: string, currency: string): string {
  return `${currency} ${formatMoney(parseSignedMoney(value))}`;
}

export function isNegativeMajor(value: string): boolean {
  return parseSignedMoney(value) < BigInt(0);
}

export function isPositiveMajor(value: string): boolean {
  return parseSignedMoney(value) > BigInt(0);
}

export function isNegativeMinor(value: string): boolean {
  return BigInt(value) < BigInt(0);
}

export function isPositiveMinor(value: string): boolean {
  return BigInt(value) > BigInt(0);
}

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800";

export function SummaryCard({
  label,
  value,
  helper,
  tone = "neutral",
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: Tone;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${TONE_DOT[tone]}`} aria-hidden="true" />
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      </div>
      <p className={`mt-3 text-2xl font-semibold tabular-nums ${TONE_TEXT[tone]}`}>{value}</p>
      {helper ? <p className="mt-1 text-xs text-slate-500">{helper}</p> : null}
    </article>
  );
}

export function DashboardSection({
  id,
  title,
  description,
  action,
  children,
  bodyClassName = "p-5",
}: {
  id: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex h-full flex-col rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <h2 id={id} className="text-base font-semibold text-slate-900">
            {title}
          </h2>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className={`flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{description}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function SectionError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      <p className="font-medium">This section could not be loaded.</p>
      <p className="mt-1">{message}</p>
    </div>
  );
}

export function PeriodSelector({
  preset,
  horizon,
}: {
  preset: DashboardPeriod;
  horizon: number;
}) {
  return (
    <nav aria-label="Reporting period" className="flex flex-wrap gap-2">
      {DASHBOARD_PERIODS.map((option) => {
        const active = option === preset;
        return (
          <Link
            key={option}
            href={`/dashboard?preset=${option}&horizon=${horizon}`}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${FOCUS} ${
              active
                ? "border-blue-900 bg-blue-900 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            {PERIOD_LABELS[option]}
          </Link>
        );
      })}
    </nav>
  );
}

export function HorizonSelector({
  horizon,
  preset,
}: {
  horizon: number;
  preset: DashboardPeriod;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1" aria-label="Cash-flow horizon">
      {[30, 60, 90].map((option) => {
        const active = option === horizon;
        return (
          <Link
            key={option}
            href={`/dashboard?preset=${preset}&horizon=${option}`}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${FOCUS} ${
              active
                ? "bg-blue-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {option}d
          </Link>
        );
      })}
    </div>
  );
}

export function InlineLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={`text-sm font-medium text-blue-800 underline-offset-2 hover:underline ${FOCUS}`}
    >
      {children}
    </Link>
  );
}

export function QuickLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100 ${FOCUS}`}
    >
      {children}
    </Link>
  );
}

export function formatDashboardMoney(minorOrMajor: bigint, currency: string): string {
  return `${currency} ${formatMoney(minorOrMajor)}`;
}

const STATUS_TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  primary: "bg-blue-100 text-blue-800",
  brand: "bg-blue-100 text-blue-800",
  positive: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-800",
  negative: "bg-red-100 text-red-800",
};

export function StatusBadge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONES[tone]}`}>
      {children}
    </span>
  );
}
