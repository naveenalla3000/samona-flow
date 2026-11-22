import Link from "next/link";
import type { ReactNode } from "react";
import { TrendingUp } from "lucide-react";
import { ForecastChart } from "@/components/forecast/forecast-chart";
import { parseSignedMoney } from "@/lib/invoice-math";
import type { DashboardCashFlow, DashboardPeriod } from "@/types/dashboard";
import type { ForecastHorizon } from "@/types/forecast";
import {
  formatDashboardMoney,
  HorizonSelector,
  StatusBadge,
} from "./dashboard-ui";

function money(value: string, currency: string): string {
  return formatDashboardMoney(parseSignedMoney(value), currency);
}

function ForecastStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const color =
    tone === "positive"
      ? "text-emerald-600"
      : tone === "negative"
        ? "text-rose-600"
        : "text-zinc-900";
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-zinc-100 bg-zinc-50/60 px-3 py-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">{label}</p>
      <p className={`mt-1.5 break-words text-sm font-semibold tabular-nums sm:text-base ${color}`}>
        {value}
      </p>
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
    <section
      aria-labelledby="cash-flow-heading"
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgb(24_24_27_/_0.04)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
            <TrendingUp className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="cash-flow-heading"
                className="text-sm font-semibold tracking-tight text-zinc-900 sm:text-base"
              >
                Cash flow forecast
              </h2>
              <StatusBadge tone="brand">{cashFlow.horizonDays} days</StatusBadge>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">
              {cashFlow.startDate} → {cashFlow.endDate} · business-local dates
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {action}
          <HorizonSelector horizon={horizon} preset={preset} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        {cashFlow.becomesNegative ? (
          <div
            role="status"
            className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          >
            <StatusBadge tone="negative">Shortage projected</StatusBadge>
            <span>
              Balance turns negative on <strong>{cashFlow.shortageDate ?? "the forecast horizon"}</strong>.
            </span>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <ForecastStat label="Current cash" value={money(cashFlow.currentCash, currency)} />
          <ForecastStat
            label="Expected incoming"
            value={money(cashFlow.expectedIncoming, currency)}
            tone="positive"
          />
          <ForecastStat
            label="Expected outgoing"
            value={money(cashFlow.expectedOutgoing, currency)}
            tone="negative"
          />
          <ForecastStat
            label="Projected closing"
            value={money(cashFlow.projectedClosing, currency)}
            tone={cashFlow.becomesNegative ? "negative" : "neutral"}
          />
          <ForecastStat
            label="Lowest projected"
            value={money(cashFlow.lowestProjectedBalance, currency)}
            tone={
              parseSignedMoney(cashFlow.lowestProjectedBalance) < BigInt(0) ? "negative" : "neutral"
            }
          />
          <ForecastStat label="Lowest balance on" value={cashFlow.lowestProjectedDate} />
        </div>

        <div className="flex-1 rounded-xl border border-zinc-100 bg-white p-2">
          <ForecastChart
            currency={currency}
            labels={labels}
            incoming={cashFlow.series.map((day) => Number(day.incoming))}
            outgoing={cashFlow.series.map((day) => Number(day.outgoing))}
            balance={cashFlow.series.map((day) => Number(day.balance))}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-3 text-[11px] text-zinc-500">
          <p>
            Estimate based on outstanding invoices and unpaid expenses due in the horizon ·
            calculated {new Date(cashFlow.calculatedAt).toLocaleString()}. Not a bank balance.
          </p>
          <Link
            href={`/dashboard/forecast?preset=${preset}&horizon=${horizon}`}
            className="font-medium text-zinc-700 transition-colors hover:text-zinc-900 hover:underline"
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
    <section className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgb(24_24_27_/_0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-blue-50 text-blue-600">
            <TrendingUp className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-zinc-900 sm:text-base">
              Cash flow forecast
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">Forecast data is temporarily unavailable.</p>
          </div>
          <StatusBadge tone="brand">{horizon} days</StatusBadge>
        </div>
      </div>
      <div className="flex-1 px-5 py-8 text-sm text-zinc-600">
        We couldn&apos;t load the cash flow projection right now. Other dashboard sections may still
        be available.
      </div>
    </section>
  );
}
