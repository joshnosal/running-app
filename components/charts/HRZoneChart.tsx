"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface WeekData {
  week: string;
  z1: number;
  z2: number;
  z3: number;
  z4: number;
  z5: number;
}

const ZONE_COLORS = ["#64b5f6", "#81c784", "#ffb74d", "#e57373", "#ba68c8"];

interface HRZoneChartProps {
  data: WeekData[];
}

export default function HRZoneChart({ data }: HRZoneChartProps) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="week" tick={{ fontSize: 12 }} />
        <YAxis unit=" min" tick={{ fontSize: 12 }} />
        <Tooltip
          formatter={(v, name) => [
            `${Math.round(Number(v) / 60)} min`,
            name,
          ]}
        />
        <Legend />
        {["Z1", "Z2", "Z3", "Z4", "Z5"].map((zone, i) => (
          <Bar
            key={zone}
            dataKey={`z${i + 1}`}
            name={zone}
            stackId="zones"
            fill={ZONE_COLORS[i]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
