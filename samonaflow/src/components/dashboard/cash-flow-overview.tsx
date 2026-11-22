import Link from "next/link";
import type { ReactNode } from "react";
import { ForecastChart } from "@/components/forecast/forecast-chart";
import { parseSignedMoney } from "@/lib/invoice-math";
import type { DashboardCashFlow, DashboardPeriod } from "@/types/dashboard";
import type { ForecastHorizon } from "@/types/forecast";
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
  cashFlow,
  preset,
  horizon,
  action,
}: {
  cashFlow: DashboardCashFlow;
  preset: DashboardPeriod;
  horizon: ForecastHorizon;
  action?: ReactNode;
}) {
  const currency = cashFlow.currency;
  const labels = cashFlow.series.map((day) => day.date.slice(5));

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900 sm:text-base dark:text-slate-100">Cash flow forecast</h2>
            <StatusBadge tone="brand">{cashFlow.horizonDays} days</StatusBadge>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {cashFlow.startDate} → {cashFlow.endDate} · business-local dates
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">{action}</div>
      </div>

      <div className="space-y-5 px-5 py-4">
        {cashFlow.becomesNegative ? (
          <div
            role="status"
            className="flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100"
          >
            <StatusBadge tone="negative">Shortage projected</StatusBadge>
            <span>
              Balance turns negative on <strong>{cashFlow.shortageDate ?? "the forecast horizon"}</strong>.
            </span>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <ForecastStat label="Current cash" value={money(cashFlow.currentCash, currency)} />
          <ForecastStat label="Expected incoming" value={money(cashFlow.expectedIncoming, currency)} tone="positive" />
          <ForecastStat label="Expected outgoing" value={money(cashFlow.expectedOutgoing, currency)} tone="negative" />
          <ForecastStat label="Projected closing balance" value={money(cashFlow.projectedClosing, currency)} tone={cashFlow.becomesNegative ? "negative" : "neutral"} />
          <ForecastStat label="Lowest projected balance" value={money(cashFlow.lowestProjectedBalance, currency)} tone={parseSignedMoney(cashFlow.lowestProjectedBalance) < BigInt(0) ? "negative" : "neutral"} />
          <ForecastStat label="Lowest balance on" value={cashFlow.lowestProjectedDate} />
        </div>

        <div className="rounded-xl border border-slate-100 p-2 dark:border-slate-800">
          <ForecastChart
            currency={currency}
            labels={labels}
            incoming={cashFlow.series.map((day) => Number(day.incoming))}
            outgoing={cashFlow.series.map((day) => Number(day.outgoing))}
            balance={cashFlow.series.map((day) => Number(day.balance))}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <p>
            Estimate based on outstanding invoices and unpaid expenses due in the horizon · calculated{" "}
            {new Date(cashFlow.calculatedAt).toLocaleString()}. Not a bank balance.
          </p>
          <Link
            href={`/dashboard/forecast?preset=${preset}&horizon=${horizon}`}
            className="font-semibold text-brand-700 hover:underline dark:text-brand-200"
          >
            Open full cash flow →
          </Link>
        </div>
      </div>
    </section>
  );
}

export function CashFlowUnavailable({ horizon }: { horizon: ForecastHorizon }) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900 sm:text-base dark:text-slate-100">Cash flow forecast</h2>
            <StatusBadge tone="brand">{horizon} days</StatusBadge>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Forecast data is temporarily unavailable.
          </p>
        </div>
      </div>
      <div className="px-5 py-6 text-sm text-slate-600 dark:text-slate-300">
        We couldn&apos;t load the cash flow projection right now. Other dashboard sections may still be available.
      </div>
    </section>
  );
}
