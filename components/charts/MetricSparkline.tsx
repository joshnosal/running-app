"use client";

import {
  LineChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

interface SparklinePoint {
  value: number | null;
  isRecent: boolean;
}

interface MetricSparklineProps {
  data: SparklinePoint[];
  baseline: number | null;
  label: string;
  unit?: string;
}

export default function MetricSparkline({
  data,
  baseline,
  label,
  unit,
}: MetricSparklineProps) {
  const fmt = (v: number) =>
    unit ? `${v.toFixed(2)} ${unit}` : v.toFixed(2);

  return (
    <ResponsiveContainer width="100%" height={80}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
        <Tooltip
          formatter={(v) => [fmt(Number(v)), label]}
          contentStyle={{ fontSize: 11 }}
        />
        {baseline != null && (
          <ReferenceLine y={baseline} stroke="#888" strokeDasharray="3 3" />
        )}
        <Line
          type="monotone"
          dataKey="value"
          dot={(props) => {
            const { cx, cy, payload } = props;
            return (
              <circle
                key={`dot-${cx}-${cy}`}
                cx={cx}
                cy={cy}
                r={3}
                fill={payload.isRecent ? "#f57c00" : "#1976d2"}
              />
            );
          }}
          stroke="#1976d2"
          strokeWidth={1.5}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
