import Link from "next/link";
import type { ReactNode } from "react";
import { formatMoney, parseSignedMoney } from "@/lib/invoice-math";
import type { DashboardPeriod } from "@/types/dashboard";

export type Tone = "neutral" | "primary" | "positive" | "warning" | "negative" | "brand";

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-zinc-900",
  primary: "text-zinc-900",
  brand: "text-blue-700",
  positive: "text-emerald-600",
  warning: "text-amber-600",
  negative: "text-rose-600",
};

const TONE_CHIP: Record<Tone, string> = {
  neutral: "bg-zinc-100 text-zinc-600",
  primary: "bg-blue-50 text-blue-600",
  brand: "bg-blue-50 text-blue-600",
  positive: "bg-emerald-50 text-emerald-600",
  warning: "bg-amber-50 text-amber-600",
  negative: "bg-rose-50 text-rose-600",
};

const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-zinc-400",
  primary: "bg-blue-600",
  brand: "bg-blue-600",
  positive: "bg-emerald-500",
  warning: "bg-amber-500",
  negative: "bg-rose-500",
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
  return `${currency} ${groupMoney(formatMoney(BigInt(minor)))}`;
}

function groupMoney(value: string): string {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction] = unsigned.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}${fraction ? `.${fraction}` : ""}`;
}

/** Forecast, invoice, expense and payment money is canonical 2dp major units. */
export function formatMajor(value: string, currency: string): string {
  return `${currency} ${groupMoney(formatMoney(parseSignedMoney(value)))}`;
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
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900";

export function SummaryCard({
  label,
  value,
  helper,
  tone = "neutral",
  icon,
  badge,
  badgeTone = "neutral",
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: Tone;
  icon?: ReactNode;
  badge?: string;
  badgeTone?: Tone;
}) {
  return (
    <article className="px-5 py-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`grid size-7 shrink-0 place-items-center rounded-lg ${TONE_CHIP[tone]}`}
            aria-hidden="true"
          >
            {icon ?? <span className={`block size-1.5 rounded-full ${TONE_DOT[tone]}`} />}
          </span>
          <p className="truncate text-[11px] font-medium uppercase tracking-[0.1em] text-zinc-500">
            {label}
          </p>
        </div>
        {badge ? (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${TONE_CHIP[badgeTone]}`}
          >
            {badge}
          </span>
        ) : null}
      </div>
      <p
        className={`mt-4 break-words text-[26px] font-semibold leading-none tracking-tight tabular-nums ${TONE_TEXT[tone]}`}
      >
        {value}
      </p>
      {helper ? <p className="mt-2 text-xs leading-relaxed text-zinc-500">{helper}</p> : null}
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
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgb(24_24_27_/_0.04)]"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
        <div className="min-w-0">
          <h2 id={id} className="text-sm font-semibold tracking-tight text-zinc-900 sm:text-base">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-zinc-500">{description}</p>
          ) : null}
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
    <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 px-6 py-10 text-center">
      <p className="text-sm font-medium text-zinc-800">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-zinc-500">{description}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function SectionError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
    >
      <p className="font-medium">This section could not be loaded.</p>
      <p className="mt-1 text-xs">{message}</p>
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
    <nav
      aria-label="Reporting period"
      className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-[0_1px_2px_rgb(24_24_27_/_0.04)]"
    >
      {DASHBOARD_PERIODS.map((option) => {
        const active = option === preset;
        return (
          <Link
            key={option}
            href={`/dashboard?preset=${option}&horizon=${horizon}`}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${FOCUS} ${
              active
                ? "bg-zinc-900 text-white shadow-sm"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
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
    <div
      className="inline-flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-zinc-50 p-0.5"
      aria-label="Cash-flow horizon"
    >
      {[30, 60, 90].map((option) => {
        const active = option === horizon;
        return (
          <Link
            key={option}
            href={`/dashboard?preset=${preset}&horizon=${option}`}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${FOCUS} ${
              active
                ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                : "text-zinc-500 hover:text-zinc-900"
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
      className={`text-xs font-medium text-blue-700 underline-offset-4 transition-colors hover:text-blue-800 hover:underline ${FOCUS}`}
    >
      {children}
    </Link>
  );
}

export function QuickLink({
  href,
  children,
  icon,
  description,
}: {
  href: string;
  children: ReactNode;
  icon?: ReactNode;
  description?: string;
}) {
  return (
    <Link
      href={href}
      className={`group flex items-start gap-3 rounded-xl border border-zinc-200/80 bg-white p-3 transition-colors hover:border-zinc-300 hover:bg-zinc-50 ${FOCUS}`}
    >
      {icon ? (
        <span
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-600 transition-colors group-hover:bg-zinc-900 group-hover:text-white"
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-zinc-900">{children}</span>
        {description ? (
          <span className="mt-0.5 block truncate text-[11px] text-zinc-500">{description}</span>
        ) : null}
      </span>
    </Link>
  );
}

export function formatDashboardMoney(minorOrMajor: bigint, currency: string): string {
  return `${currency} ${groupMoney(formatMoney(minorOrMajor))}`;
}

const STATUS_TONES: Record<Tone, string> = {
  neutral: "bg-zinc-100 text-zinc-600",
  primary: "bg-blue-50 text-blue-700",
  brand: "bg-blue-50 text-blue-700",
  positive: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  negative: "bg-rose-50 text-rose-700",
};

export function StatusBadge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_TONES[tone]}`}
    >
      {children}
    </span>
  );
}
