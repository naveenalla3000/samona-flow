import { parseMoney } from "@/lib/invoice-math";
import type { ForecastResult } from "@/types/forecast";
import { ForecastStat, Money } from "./forecast-layout";

const ZERO = BigInt(0);

function isNegative(value: string): boolean {
  return value.startsWith("-");
}

function isPositive(value: string): boolean {
  return parseMoney(value) > ZERO;
}

export function ForecastSummary({ forecast }: { forecast: ForecastResult }) {
  const {
    currency,
    openingBalance,
    expectedIncoming,
    expectedOutgoing,
    netCashFlow,
    projectedEndingBalance,
    lowestProjectedBalance,
    lowestProjectedDate,
    shortageDate,
    becomesNegative,
    overdue,
    counts,
    excludedInvoices,
  } = forecast;

  const expensesExceedReceipts =
    isPositive(expectedOutgoing) &&
    parseMoney(expectedOutgoing) > parseMoney(expectedIncoming);

  return (
    <div className="space-y-4">
      {becomesNegative && shortageDate ? (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          <strong className="font-semibold">Potential cash shortage.</strong> The projected balance
          may fall below zero on <span className="tabular-nums">{shortageDate}</span>.
        </div>
      ) : (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          No negative projected balance in this horizon.
        </div>
      )}

      {isPositive(overdue.incoming) ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          You have <Money currency={currency} value={overdue.incoming} /> in overdue customer
          payments ({overdue.incomingCount} invoice{overdue.incomingCount === 1 ? "" : "s"}),
          projected on the first forecast day.
        </div>
      ) : null}

      {expensesExceedReceipts ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          Expected expenses exceed expected receipts during this horizon.
        </div>
      ) : null}

      {excludedInvoices.count > 0 ? (
        <div className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300">
          {excludedInvoices.count} outstanding invoice
          {excludedInvoices.count === 1 ? "" : "s"} in{" "}
          {excludedInvoices.currencies.join(", ")} were excluded so currencies are never mixed.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ForecastStat
          label="Current cash position"
          value={<Money currency={currency} value={openingBalance} />}
          helper="Opening balance plus recorded cash movements"
          tone={isNegative(openingBalance) ? "negative" : "neutral"}
        />
        <ForecastStat
          label="Expected incoming"
          value={<Money currency={currency} value={expectedIncoming} />}
          helper={`${counts.incoming} eligible invoice${counts.incoming === 1 ? "" : "s"}`}
          tone="positive"
        />
        <ForecastStat
          label="Expected outgoing"
          value={<Money currency={currency} value={expectedOutgoing} />}
          helper={`${counts.outgoing} unpaid expense${counts.outgoing === 1 ? "" : "s"}`}
          tone="negative"
        />
        <ForecastStat
          label="Net cash flow"
          value={<Money currency={currency} value={netCashFlow} />}
          helper="Expected incoming minus expected outgoing"
          tone={isNegative(netCashFlow) ? "negative" : "positive"}
        />
        <ForecastStat
          label={`Projected balance in ${forecast.horizonDays} days`}
          value={<Money currency={currency} value={projectedEndingBalance} />}
          helper={`Ends ${forecast.endDate}`}
          tone={isNegative(projectedEndingBalance) ? "negative" : "neutral"}
        />
        <ForecastStat
          label="Lowest projected balance"
          value={<Money currency={currency} value={lowestProjectedBalance} />}
          helper={`On ${lowestProjectedDate}`}
          tone={isNegative(lowestProjectedBalance) ? "negative" : "neutral"}
        />
        <ForecastStat
          label="Shortage indicator"
          value={becomesNegative ? `Shortfall on ${shortageDate}` : "No shortfall"}
          helper={
            becomesNegative
              ? "The projected balance becomes negative"
              : "The projected balance stays at or above zero"
          }
          tone={becomesNegative ? "negative" : "positive"}
        />
        <ForecastStat
          label="Overdue receivables"
          value={<Money currency={currency} value={overdue.incoming} />}
          helper={`${overdue.incomingCount} overdue invoice${overdue.incomingCount === 1 ? "" : "s"}`}
          tone={isPositive(overdue.incoming) ? "warning" : "neutral"}
        />
      </div>
    </div>
  );
}
