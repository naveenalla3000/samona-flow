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
      <p className="py-10 text-center text-sm text-zinc-500">
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
      <p className="mb-2 px-1 text-[11px] text-zinc-500">
        Amounts in {currency}. Bars show daily expected movements; the line is the projected
        closing balance.
      </p>
      <ResponsiveContainer width="100%" height="90%">
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="4 4" stroke="#e4e4e7" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#71717a" }}
            tickLine={false}
            axisLine={{ stroke: "#e4e4e7" }}
            minTickGap={24}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#71717a" }}
            tickLine={false}
            axisLine={false}
            width={80}
            tickFormatter={(value: number) => new Intl.NumberFormat("en-US").format(value)}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #e4e4e7",
              boxShadow: "0 12px 32px rgb(24 24 27 / 0.08)",
              fontSize: 12,
            }}
            labelStyle={{ color: "#18181b", fontWeight: 600 }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            iconType="circle"
            iconSize={8}
          />
          <ReferenceLine y={0} stroke="#a1a1aa" strokeDasharray="4 4" />
          <Bar
            dataKey="incoming"
            name="Expected incoming"
            fill="#06b6d4"
            radius={[4, 4, 0, 0]}
            maxBarSize={16}
            isAnimationActive={false}
          />
          <Bar
            dataKey="outgoing"
            name="Expected outgoing"
            fill="#f59e0b"
            radius={[4, 4, 0, 0]}
            maxBarSize={16}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="balance"
            name="Projected balance"
            stroke="#2563eb"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
