import type { DashboardPeriod } from "@/types/dashboard";
import { formatMinor, PERIOD_LABELS, StatusBadge } from "./dashboard-ui";

function share(value: bigint, max: bigint): number {
  if (max <= BigInt(0)) return 0;
  return Number((value * BigInt(100)) / max);
}

function absolute(value: bigint): bigint {
  return value < BigInt(0) ? -value : value;
}

export function PeriodFlow({
  income,
  expenses,
  currency,
  preset,
}: {
  income: string;
  expenses: string;
  currency: string;
  preset: DashboardPeriod;
}) {
  const incomeMinor = BigInt(income);
  const expensesMinor = BigInt(expenses);
  const net = incomeMinor - expensesMinor;
  const max = [absolute(incomeMinor), absolute(expensesMinor)].reduce(
    (largest, value) => (value > largest ? value : largest),
    BigInt(0),
  );

  const incomeHeight = Math.max(4, share(incomeMinor, max));
  const expenseHeight = Math.max(4, share(expensesMinor, max));
  const isPositive = net >= BigInt(0);

  return (
    <section
      aria-labelledby="period-flow-heading"
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgb(24_24_27_/_0.04)]"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
        <div className="min-w-0">
          <h2
            id="period-flow-heading"
            className="text-sm font-semibold tracking-tight text-zinc-900 sm:text-base"
          >
            Income vs expenses
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Cash movement · {PERIOD_LABELS[preset]}
          </p>
        </div>
        <StatusBadge tone={isPositive ? "positive" : "negative"}>
          {isPositive ? "Net positive" : "Net negative"}
        </StatusBadge>
      </header>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-zinc-100 bg-zinc-50/60 px-3 py-3">
            <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
              <span className="size-1.5 rounded-full bg-cyan-500" aria-hidden="true" />
              Income
            </p>
            <p className="mt-1.5 break-words text-base font-semibold tabular-nums text-zinc-900">
              {formatMinor(income, currency)}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-100 bg-zinc-50/60 px-3 py-3">
            <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
              <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
              Expenses
            </p>
            <p className="mt-1.5 break-words text-base font-semibold tabular-nums text-zinc-900">
              {formatMinor(expenses, currency)}
            </p>
          </div>
        </div>

        <div className="relative flex min-h-44 flex-1 items-end justify-center gap-12 overflow-hidden rounded-xl border border-zinc-100 bg-zinc-50/50 px-6 pb-3 pt-5">
          <div
            className="dither-dots pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(to_top,black,transparent)]"
            aria-hidden="true"
          />
          <div className="relative flex h-full w-16 flex-col">
            <div className="flex flex-1 items-end">
              <div
                className="chart-dither w-full rounded-t-md bg-cyan-500"
                style={{ height: `${incomeHeight}%` }}
                title={`Income ${formatMinor(income, currency)}`}
              />
            </div>
            <p className="mt-2 text-center text-[11px] font-medium text-zinc-500">Income</p>
          </div>
          <div className="relative flex h-full w-16 flex-col">
            <div className="flex flex-1 items-end">
              <div
                className="chart-dither w-full rounded-t-md bg-amber-500"
                style={{ height: `${expenseHeight}%` }}
                title={`Expenses ${formatMinor(expenses, currency)}`}
              />
            </div>
            <p className="mt-2 text-center text-[11px] font-medium text-zinc-500">Expenses</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3 text-[11px] text-zinc-500">
          <span className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-cyan-500" aria-hidden="true" />
              Income
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
              Expenses
            </span>
          </span>
          <span>
            Net{" "}
            <span
              className={`font-semibold tabular-nums ${isPositive ? "text-emerald-600" : "text-rose-600"}`}
            >
              {formatMinor(net.toString(), currency)}
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}
