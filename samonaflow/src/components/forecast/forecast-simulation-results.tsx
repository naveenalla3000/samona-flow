import type { ForecastSimulationResult } from "@/types/forecast-simulation";
import { ForecastSimulationChart } from "./forecast-simulation-chart";
import { ADJUSTMENT_TYPE_LABELS } from "./forecast-simulation-labels";
import { ForecastSection, ForecastStat, Money } from "./forecast-layout";

const TABLE_HEAD_CLASS =
  "bg-white text-xs uppercase tracking-wide text-neutral-500";
const CELL_CLASS = "px-3 py-2";

function isNegative(value: string): boolean {
  return value.startsWith("-");
}

function describeDelta(currency: string, delta: string): string {
  if (delta === "0.00") return "No change from baseline";
  return `${delta.startsWith("-") ? "" : "+"}${currency} ${delta} vs baseline`;
}

function comparisonHelper(
  currency: string,
  baseline: string,
  delta: string,
): string {
  return `Baseline ${currency} ${baseline} · ${describeDelta(currency, delta)}`;
}

function ShortageAlert({ result }: { result: ForecastSimulationResult }) {
  const { baseline, simulated } = result;

  if (simulated.becomesNegative && !baseline.becomesNegative) {
    return (
      <div
        role="alert"
        className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        <strong className="font-semibold">The simulated scenario creates a cash shortage.</strong>{" "}
        The projected balance falls below zero on{" "}
        <span className="tabular-nums">{simulated.shortageDate}</span>; the baseline never does.
      </div>
    );
  }

  if (!simulated.becomesNegative && baseline.becomesNegative) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <strong className="font-semibold">The simulated scenario avoids the baseline shortage.</strong>{" "}
        The baseline falls below zero on{" "}
        <span className="tabular-nums">{baseline.shortageDate}</span>; the simulation stays at or
        above zero.
      </div>
    );
  }

  if (
    simulated.becomesNegative &&
    baseline.shortageDate &&
    simulated.shortageDate &&
    simulated.shortageDate < baseline.shortageDate
  ) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Both scenarios become negative, but the simulated shortage starts earlier:{" "}
        <span className="tabular-nums">{simulated.shortageDate}</span> instead of{" "}
        <span className="tabular-nums">{baseline.shortageDate}</span>.
      </div>
    );
  }

  if (
    simulated.becomesNegative &&
    baseline.shortageDate &&
    simulated.shortageDate &&
    simulated.shortageDate > baseline.shortageDate
  ) {
    return (
      <div className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        Both scenarios become negative, but the simulated shortage starts later:{" "}
        <span className="tabular-nums">{simulated.shortageDate}</span> instead of{" "}
        <span className="tabular-nums">{baseline.shortageDate}</span>.
      </div>
    );
  }

  if (simulated.becomesNegative) {
    return (
      <div
        role="alert"
        className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        Both scenarios become negative on{" "}
        <span className="tabular-nums">{simulated.shortageDate}</span>. The simulated scenario does
        not remove the baseline shortage.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
      No negative projected balance in either the baseline or the simulated scenario.
    </div>
  );
}

export function ForecastSimulationResults({ result }: { result: ForecastSimulationResult }) {
  const { currency, baseline, simulated, comparison, daily, adjustments } = result;

  return (
    <div className="space-y-6">
      <ShortageAlert result={result} />

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Baseline vs simulated</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Simulated values are recalculated with the existing forecast engine after applying the
            hypothetical adjustments.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ForecastStat
            label="Projected ending cash"
            value={<Money currency={currency} value={simulated.projectedEndingBalance} />}
            helper={`Baseline ${currency} ${baseline.projectedEndingBalance} · ${describeDelta(
              currency,
              comparison.projectedEndingBalance.delta,
            )}`}
            tone={isNegative(simulated.projectedEndingBalance) ? "negative" : "neutral"}
          />
          <ForecastStat
            label="Lowest projected balance"
            value={<Money currency={currency} value={simulated.lowestProjectedBalance} />}
            helper={`Baseline ${currency} ${baseline.lowestProjectedBalance} on ${baseline.lowestProjectedDate}`}
            tone={isNegative(simulated.lowestProjectedBalance) ? "negative" : "neutral"}
          />
          <ForecastStat
            label="Total incoming cash"
            value={<Money currency={currency} value={simulated.expectedIncoming} />}
            helper={comparisonHelper(
              currency,
              comparison.expectedIncoming.baseline,
              comparison.expectedIncoming.delta,
            )}
            tone="positive"
          />
          <ForecastStat
            label="Total outgoing cash"
            value={<Money currency={currency} value={simulated.expectedOutgoing} />}
            helper={comparisonHelper(
              currency,
              comparison.expectedOutgoing.baseline,
              comparison.expectedOutgoing.delta,
            )}
            tone="negative"
          />
          <ForecastStat
            label="Net cash flow"
            value={<Money currency={currency} value={simulated.netCashFlow} />}
            helper={comparisonHelper(
              currency,
              comparison.netCashFlow.baseline,
              comparison.netCashFlow.delta,
            )}
            tone={isNegative(simulated.netCashFlow) ? "negative" : "positive"}
          />
          <ForecastStat
            label="Cash shortage date"
            value={simulated.shortageDate ?? "No shortfall"}
            helper={`Baseline: ${baseline.shortageDate ?? "no shortfall"}`}
            tone={simulated.becomesNegative ? "negative" : "positive"}
          />
          <ForecastStat
            label="Lowest balance date"
            value={simulated.lowestProjectedDate}
            helper={`Baseline: ${baseline.lowestProjectedDate}`}
            tone="neutral"
          />
          <ForecastStat
            label="Negative balance"
            value={simulated.becomesNegative ? "Yes" : "No"}
            helper={`Baseline: ${baseline.becomesNegative ? "yes" : "no"}`}
            tone={simulated.becomesNegative ? "negative" : "positive"}
          />
        </div>
      </section>

      <ForecastSection
        title="Projected balance comparison"
        description={`Daily closing balances from ${result.startDate} to ${result.endDate}.`}
      >
        <ForecastSimulationChart
          currency={currency}
          labels={daily.map((day) => day.date)}
          baseline={daily.map((day) => Number(day.baselineBalance))}
          simulated={daily.map((day) => Number(day.simulatedBalance))}
        />
      </ForecastSection>

      <ForecastSection
        title="Applied hypothetical adjustments"
        description="These changes exist only in this response. No financial record was written."
      >
        {adjustments.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            No adjustments were applied. The simulation reproduces the baseline.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className={TABLE_HEAD_CLASS}>
                <tr>
                  <th scope="col" className={`${CELL_CLASS} font-medium`}>Type</th>
                  <th scope="col" className={`${CELL_CLASS} font-medium`}>Hypothetical change</th>
                  <th scope="col" className={`${CELL_CLASS} text-right font-medium`}>
                    Amount change
                  </th>
                  <th scope="col" className={`${CELL_CLASS} font-medium`}>Date change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {adjustments.map((adjustment) => (
                  <tr key={adjustment.id}>
                    <td className={`${CELL_CLASS} whitespace-nowrap font-medium`}>
                      {ADJUSTMENT_TYPE_LABELS[adjustment.type]}
                    </td>
                    <td className={CELL_CLASS}>{adjustment.description}</td>
                    <td className={`${CELL_CLASS} text-right`}>
                      {adjustment.amountDelta === "0.00" ? (
                        <span className="text-neutral-500">—</span>
                      ) : (
                        <Money currency={currency} value={adjustment.amountDelta} />
                      )}
                    </td>
                    <td className={`${CELL_CLASS} whitespace-nowrap`}>
                      {adjustment.dateFrom && adjustment.dateTo
                        ? `${adjustment.dateFrom} → ${adjustment.dateTo}`
                        : adjustment.dateTo ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ForecastSection>

      <ForecastSection
        title="Daily projected balances"
        description="Baseline and simulated closing balances for every day in the horizon."
      >
        {daily.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            No projected balances to display.
          </p>
        ) : (
          <div className="max-h-[420px] overflow-auto rounded-lg border border-neutral-200">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className={`${TABLE_HEAD_CLASS} sticky top-0 z-10`}>
                <tr>
                  <th scope="col" className={`${CELL_CLASS} font-medium`}>Date</th>
                  <th scope="col" className={`${CELL_CLASS} text-right font-medium`}>Baseline in</th>
                  <th scope="col" className={`${CELL_CLASS} text-right font-medium`}>Simulated in</th>
                  <th scope="col" className={`${CELL_CLASS} text-right font-medium`}>Baseline out</th>
                  <th scope="col" className={`${CELL_CLASS} text-right font-medium`}>Simulated out</th>
                  <th scope="col" className={`${CELL_CLASS} text-right font-medium`}>Baseline balance</th>
                  <th scope="col" className={`${CELL_CLASS} text-right font-medium`}>Simulated balance</th>
                  <th scope="col" className={`${CELL_CLASS} text-right font-medium`}>Balance change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {daily.map((day) => (
                  <tr key={day.date}>
                    <td className={`${CELL_CLASS} whitespace-nowrap font-medium`}>{day.date}</td>
                    <td className={`${CELL_CLASS} text-right`}>
                      <Money currency={currency} value={day.baselineIncoming} />
                    </td>
                    <td className={`${CELL_CLASS} text-right`}>
                      <Money currency={currency} value={day.simulatedIncoming} />
                    </td>
                    <td className={`${CELL_CLASS} text-right`}>
                      <Money currency={currency} value={day.baselineOutgoing} />
                    </td>
                    <td className={`${CELL_CLASS} text-right`}>
                      <Money currency={currency} value={day.simulatedOutgoing} />
                    </td>
                    <td className={`${CELL_CLASS} text-right`}>
                      <Money currency={currency} value={day.baselineBalance} />
                    </td>
                    <td className={`${CELL_CLASS} text-right`}>
                      <Money currency={currency} value={day.simulatedBalance} />
                    </td>
                    <td className={`${CELL_CLASS} text-right`}>
                      <Money currency={currency} value={day.balanceDelta} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ForecastSection>

      <p className="text-xs text-neutral-500">
        Simulation only. The response was calculated in memory from existing records; no invoice,
        payment, reversal or expense was created, updated or deleted.
      </p>
    </div>
  );
}
