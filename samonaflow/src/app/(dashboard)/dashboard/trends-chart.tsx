"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type TrendsChartProps = {
  currency: string;
  labels: string[];
  collected: number[];
  invoiced: number[];
  expenses: number[];
};

// Values arrive already converted to major units for display; this component does no money math.
export function TrendsChart({ currency, labels, collected, invoiced, expenses }: TrendsChartProps) {
  const allZero = [...collected, ...invoiced, ...expenses].every((value) => value === 0);
  if (labels.length === 0 || allZero) {
    return <p className="py-10 text-center text-sm text-gray-500">No activity in this period.</p>;
  }

  const data = labels.map((label, index) => ({
    label,
    collected: collected[index] ?? 0,
    invoiced: invoiced[index] ?? 0,
    expenses: expenses[index] ?? 0,
  }));

  return (
    <div className="h-72 w-full">
      <p className="mb-2 text-xs text-gray-500">Amounts in {currency}</p>
      <ResponsiveContainer width="100%" height="90%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} width={70} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="collected" name="Collected" stroke="#16a34a" dot={false} />
          <Line type="monotone" dataKey="invoiced" name="Invoiced" stroke="#2563eb" dot={false} />
          <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#dc2626" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
