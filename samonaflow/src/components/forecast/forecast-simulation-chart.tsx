"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ForecastSimulationChartProps = {
  currency: string;
  labels: string[];
  baseline: number[];
  simulated: number[];
};

// Values arrive already converted to major units for display; this component
// does no money math. Every authoritative amount is calculated on the server.
export function ForecastSimulationChart({
  currency,
  labels,
  baseline,
  simulated,
}: ForecastSimulationChartProps) {
  if (labels.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-neutral-500">
        No simulation days to display.
      </p>
    );
  }

  const data = labels.map((label, index) => ({
    label,
    baseline: baseline[index] ?? 0,
    simulated: simulated[index] ?? 0,
  }));

  return (
    <div className="h-80 w-full">
      <p className="mb-2 text-xs text-neutral-500">
        Amounts in {currency}. The solid line is the simulated closing balance; the dashed line is
        the unchanged baseline.
      </p>
      <ResponsiveContainer width="100%" height="90%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
          <YAxis tick={{ fontSize: 11 }} width={80} />
          <Tooltip />
          <Legend />
          <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="baseline"
            name="Baseline balance"
            stroke="#6b7280"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="simulated"
            name="Simulated balance"
            stroke="#2563eb"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
