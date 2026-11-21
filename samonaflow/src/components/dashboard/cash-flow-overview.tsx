import Link from "next/link";
import { ForecastChart } from "@/components/forecast/forecast-chart";
import type { DashboardCashFlow, DashboardPeriod } from "@/types/dashboard";
import {
  DashboardSection,
  formatMajor,
  HorizonSelector,
  InlineLink,
  isNegativeMajor,
  isPositiveMajor,
  type Tone,
} from "./dashboard-ui";

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-slate-900",
  primary: "text-blue-900",
  positive: "text-emerald-700",
  warning: "text-amber-700",
  negative: "text-red-700",
};

function CashFlowStat({
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
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${TONE_TEXT[tone]}`}>{value}</p>
      {helper ? <p className="mt-0.5 text-xs text-slate-500">{helper}</p> : null}
    </div>
  );
}

export function CashFlowOverview({
  cashFlow,
  preset,
  horizon,
}: {
  cashFlow: DashboardCashFlow;
  preset: DashboardPeriod;
  horizon: number;
}) {
  const currency = cashFlow.currency;
  const incomingTone: Tone = isPositiveMajor(cashFlow.expectedIncoming) ? "positive" : "neutral";
  const outgoingTone: Tone = isPositiveMajor(cashFlow.expectedOutgoing) ? "negative" : "neutral";
  const closingTone: Tone = isNegativeMajor(cashFlow.projectedClosing) ? "negative" : "positive";
  const lowestTone: Tone = isNegativeMajor(cashFlow.lowestProjectedBalance)
    ? "negative"
    : "neutral";

  return (
    <DashboardSection
      id="cash-flow-overview"
      title="Cash-flow overview"
      description={`Deterministic ${cashFlow.horizonDays}-day projection from ${cashFlow.startDate} to ${cashFlow.endDate}. This is an estimate, not a bank balance.`}
      action={<HorizonSelector horizon={horizon} preset={preset} />}
    >
      <div className="space-y-4">
        {cashFlow.becomesNegative && cashFlow.shortageDate ? (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <strong className="font-semibold">Potential cash shortage.</strong> The projected
            balance may fall below zero on{" "}
            <span className="font-semibold tabular-nums">{cashFlow.shortageDate}</span>. Review the
            full forecast before committing new expenses.
          </div>
        ) : (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            The projected balance stays at or above zero for this horizon.
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <CashFlowStat
            label="Current cash"
            value={formatMajor(cashFlow.currentCash, currency)}
            helper="Opening balance plus recorded movements"
            tone={isNegativeMajor(cashFlow.currentCash) ? "negative" : "primary"}
          />
          <CashFlowStat
            label="Expected in"
            value={formatMajor(cashFlow.expectedIncoming, currency)}
            helper="Outstanding receivable balances"
            tone={incomingTone}
          />
          <CashFlowStat
            label="Expected out"
            value={formatMajor(cashFlow.expectedOutgoing, currency)}
            helper="Unpaid expenses in the horizon"
            tone={outgoingTone}
          />
          <CashFlowStat
            label="Projected closing"
            value={formatMajor(cashFlow.projectedClosing, currency)}
            helper={`Ends ${cashFlow.endDate}`}
            tone={closingTone}
          />
          <CashFlowStat
            label="Lowest balance"
            value={formatMajor(cashFlow.lowestProjectedBalance, currency)}
            helper={`On ${cashFlow.lowestProjectedDate}`}
            tone={lowestTone}
          />
          <CashFlowStat
            label="Shortage indicator"
            value={
              cashFlow.becomesNegative && cashFlow.shortageDate
                ? `Shortfall on ${cashFlow.shortageDate}`
                : "No shortfall"
            }
            helper={
              cashFlow.becomesNegative
                ? "The projected balance becomes negative"
                : "Projected balance stays at or above zero"
            }
            tone={cashFlow.becomesNegative ? "negative" : "positive"}
          />
        </div>

        <ForecastChart
          currency={currency}
          labels={cashFlow.series.map((point) => point.date)}
          incoming={cashFlow.series.map((point) => Number(point.incoming))}
          outgoing={cashFlow.series.map((point) => Number(point.outgoing))}
          balance={cashFlow.series.map((point) => Number(point.balance))}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Calculated {cashFlow.calculatedAt.slice(0, 16).replace("T", " ")} UTC.
          </p>
          <Link
            href={`/dashboard/forecast?horizon=${horizon}`}
            className="text-sm font-medium text-blue-800 underline-offset-2 hover:underline"
          >
            Open full cash-flow forecast
          </Link>
        </div>
      </div>
    </DashboardSection>
  );
}

export function CashFlowUnavailable({ horizon }: { horizon: number }) {
  return (
    <DashboardSection
      id="cash-flow-overview"
      title="Cash-flow overview"
      description="Projection of current cash, expected receipts and upcoming expenses."
    >
      <div
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        <p className="font-medium">The cash-flow overview could not be loaded.</p>
        <p className="mt-1">
          The projection depends on the same records as the{" "}
          <InlineLink href={`/dashboard/forecast?horizon=${horizon}`}>full forecast</InlineLink>.
        </p>
      </div>
    </DashboardSection>
  );
}
