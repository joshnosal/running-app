"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import Typography from "@mui/material/Typography";

interface WeekData {
  week: string;
  avgEfficiency: number | null;
}

interface EfficiencyTrendChartProps {
  data: WeekData[];
}

export default function EfficiencyTrendChart({
  data,
}: EfficiencyTrendChartProps) {
  const hasData = data.some((d) => d.avgEfficiency != null);

  if (!hasData) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
        Efficiency score requires power data (power meter or Garmin Running Power).
        No power data found in uploaded activities.
      </Typography>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="week" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip
          formatter={(v) => [Number(v).toFixed(4), "Efficiency (m/s/W)"]}
        />
        <Line
          type="monotone"
          dataKey="avgEfficiency"
          stroke="#2e7d32"
          dot={false}
          strokeWidth={2}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
