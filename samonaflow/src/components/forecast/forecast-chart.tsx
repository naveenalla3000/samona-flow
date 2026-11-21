"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ForecastChartProps = {
  currency: string;
  labels: string[];
  incoming: number[];
  outgoing: number[];
  balance: number[];
};

// Values arrive already converted to major units for display; this component
// does no money math. The authoritative calculation stays on the server.
export function ForecastChart({
  currency,
  labels,
  incoming,
  outgoing,
  balance,
}: ForecastChartProps) {
  if (labels.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-neutral-500">
        No forecast days to display.
      </p>
    );
  }

  const data = labels.map((label, index) => ({
    label,
    incoming: incoming[index] ?? 0,
    outgoing: outgoing[index] ?? 0,
    balance: balance[index] ?? 0,
  }));

  return (
    <div className="h-80 w-full">
      <p className="mb-2 text-xs text-neutral-500">
        Amounts in {currency}. Bars show daily expected movements; the line is the projected
        closing balance.
      </p>
      <ResponsiveContainer width="100%" height="90%">
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
          <YAxis tick={{ fontSize: 11 }} width={80} />
          <Tooltip />
          <Legend />
          <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="4 4" />
          <Bar dataKey="incoming" name="Expected incoming" fill="#16a34a" />
          <Bar dataKey="outgoing" name="Expected outgoing" fill="#dc2626" />
          <Line
            type="monotone"
            dataKey="balance"
            name="Projected balance"
            stroke="#2563eb"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
