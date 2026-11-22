import Link from "next/link";
import type { ReactNode } from "react";
import { ForecastChart } from "@/components/forecast/forecast-chart";
import { parseSignedMoney } from "@/lib/invoice-math";
import type { DashboardCashFlowOverview } from "@/types/dashboard";
import { formatDashboardMoney, StatusBadge } from "./dashboard-ui";

function money(value: string, currency: string): string {
  return formatDashboardMoney(parseSignedMoney(value), currency);
}

function ForecastStat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "positive" | "negative" }) {
  const color =
    tone === "positive"
      ? "text-positive dark:text-emerald-300"
      : tone === "negative"
        ? "text-negative dark:text-red-300"
        : "text-slate-900 dark:text-slate-50";
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-3 dark:bg-slate-800/60">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1 text-sm font-semibold tabular-nums sm:text-base ${color}`}>{value}</p>
    </div>
  );
}

export function CashFlowOverview({
  overview,
  action,
}: {
  overview: DashboardCashFlowOverview;
  action?: ReactNode;
}) {
  const currency = overview.currency;
  const labels = overview.daily.map((day) => day.date.slice(5));

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900 sm:text-base dark:text-slate-100">Cash flow forecast</h2>
            <StatusBadge tone="brand">{overview.horizonDays} days</StatusBadge>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {overview.startDate} → {overview.endDate} · business-local dates
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">{action}</div>
      </div>

      <div className="space-y-5 px-5 py-4">
        {overview.becomesNegative ? (
          <div
            role="status"
            className="flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100"
          >
            <StatusBadge tone="negative">Shortage projected</StatusBadge>
            <span>
              Balance turns negative on <strong>{overview.shortageDate ?? "the forecast horizon"}</strong>.
            </span>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <ForecastStat label="Current cash" value={money(overview.currentCash, currency)} />
          <ForecastStat label="Expected incoming" value={money(overview.expectedIncoming, currency)} tone="positive" />
          <ForecastStat label="Expected outgoing" value={money(overview.expectedOutgoing, currency)} tone="negative" />
          <ForecastStat label="Projected closing balance" value={money(overview.projectedClosingBalance, currency)} tone={overview.becomesNegative ? "negative" : "neutral"} />
          <ForecastStat label="Lowest projected balance" value={money(overview.lowestProjectedBalance, currency)} tone={parseSignedMoney(overview.lowestProjectedBalance) < BigInt(0) ? "negative" : "neutral"} />
          <ForecastStat label="Lowest balance on" value={overview.lowestProjectedDate} />
        </div>

        <div className="rounded-xl border border-slate-100 p-2 dark:border-slate-800">
          <ForecastChart
            currency={currency}
            labels={labels}
            incoming={overview.daily.map((day) => Number(day.incoming))}
            outgoing={overview.daily.map((day) => Number(day.outgoing))}
            balance={overview.daily.map((day) => Number(day.projectedBalance))}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <p>
            Estimate based on outstanding invoices and unpaid expenses due in the horizon · calculated{" "}
            {new Date(overview.calculatedAt).toLocaleString()}. Not a bank balance.
          </p>
          <Link href="/dashboard/forecast" className="font-semibold text-brand-700 hover:underline dark:text-brand-200">
            Open full cash flow →
          </Link>
        </div>
      </div>
    </section>
  );
}
