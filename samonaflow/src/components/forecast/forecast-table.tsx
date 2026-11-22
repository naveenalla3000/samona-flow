import type { ForecastWeek } from "@/types/forecast";
import { Money } from "./forecast-layout";

export function ForecastTable({
  currency,
  weeks,
}: {
  currency: string;
  weeks: ForecastWeek[];
}) {
  if (weeks.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
        No projected balances to display.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200">
      <table className="w-full min-w-[620px] text-left text-sm">
        <thead className="bg-white text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Week</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Expected incoming</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Expected outgoing</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Net</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Closing balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200">
          {weeks.map((week) => (
            <tr key={week.weekStart}>
              <td className="px-3 py-2 tabular-nums">
                {week.weekStart} → {week.weekEnd}
              </td>
              <td className="px-3 py-2 text-right">
                <Money currency={currency} value={week.incoming} />
              </td>
              <td className="px-3 py-2 text-right">
                <Money currency={currency} value={week.outgoing} />
              </td>
              <td className="px-3 py-2 text-right">
                <Money currency={currency} value={week.net} />
              </td>
              <td className="px-3 py-2 text-right font-medium">
                <Money currency={currency} value={week.closingBalance} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
