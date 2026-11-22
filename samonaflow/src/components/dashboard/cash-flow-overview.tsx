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
      ? "text-positive"
      : tone === "negative"
        ? "text-negative"
        : "text-slate-900";
  return (
    <div className="min-w-0 overflow-hidden rounded-xl bg-white px-3 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 break-words text-sm font-semibold tabular-nums sm:text-base ${color}`}>{value}</p>
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
    <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900 sm:text-base">Cash flow forecast</h2>
            <StatusBadge tone="brand">{cashFlow.horizonDays} days</StatusBadge>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {cashFlow.startDate} → {cashFlow.endDate} · business-local dates
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">{action}</div>
      </div>

      <div className="space-y-5 px-5 py-4">
        {cashFlow.becomesNegative ? (
          <div
            role="status"
            className="flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
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

        <div className="rounded-xl border border-slate-100 p-2">
          <ForecastChart
            currency={currency}
            labels={labels}
            incoming={cashFlow.series.map((day) => Number(day.incoming))}
            outgoing={cashFlow.series.map((day) => Number(day.outgoing))}
            balance={cashFlow.series.map((day) => Number(day.balance))}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <p>
            Estimate based on outstanding invoices and unpaid expenses due in the horizon · calculated{" "}
            {new Date(cashFlow.calculatedAt).toLocaleString()}. Not a bank balance.
          </p>
          <Link
            href={`/dashboard/forecast?preset=${preset}&horizon=${horizon}`}
            className="font-semibold text-brand-700 hover:underline"
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
    <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900 sm:text-base">Cash flow forecast</h2>
            <StatusBadge tone="brand">{horizon} days</StatusBadge>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Forecast data is temporarily unavailable.
          </p>
        </div>
      </div>
      <div className="px-5 py-6 text-sm text-slate-600">
        We couldn&apos;t load the cash flow projection right now. Other dashboard sections may still be available.
      </div>
    </section>
  );
}
