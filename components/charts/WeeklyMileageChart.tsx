"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Units } from "@/lib/units";

interface WeekData {
  week: string;
  distanceM: number;
}

interface WeeklyMileageChartProps {
  data: WeekData[];
  units: Units;
}

export default function WeeklyMileageChart({
  data,
  units,
}: WeeklyMileageChartProps) {
  const factor = units === "imperial" ? 0.000621371 : 0.001;
  const label = units === "imperial" ? "mi" : "km";

  const chartData = data.map((d) => ({
    week: d.week,
    distance: parseFloat((d.distanceM * factor).toFixed(2)),
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="week" tick={{ fontSize: 12 }} />
        <YAxis unit={` ${label}`} tick={{ fontSize: 12 }} />
        <Tooltip formatter={(v) => [`${v ?? 0} ${label}`, "Distance"]} />
        <Bar dataKey="distance" fill="#1976d2" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
