"use client";

import {
  ComposedChart,
  Scatter,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Units } from "@/lib/units";

interface DataPoint {
  startTime: string;
  efficiencyScore: number;
}

interface Props {
  data: DataPoint[];
  units: Units;
}

export default function EfficiencyBandChart({ data }: Props) {
  if (data.length === 0) {
    return <p style={{ color: "#888", fontSize: 14 }}>No efficiency data available.</p>;
  }

  const sorted = [...data].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  const scores = sorted.map((d) => d.efficiencyScore * 1000);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
  const sd = Math.sqrt(variance);

  const recent = sorted.slice(-10);
  const chartData = recent.map((d, i) => ({
    x: i,
    y: d.efficiencyScore * 1000,
    date: new Date(d.startTime).toLocaleDateString(),
  }));

  const yMin = Math.min(mean - 2.5 * sd, ...chartData.map((d) => d.y)) - 0.5;
  const yMax = Math.max(mean + 2.5 * sd, ...chartData.map((d) => d.y)) + 0.5;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis
          type="number"
          dataKey="x"
          domain={[-0.5, recent.length - 0.5]}
          tickFormatter={(v) => {
            const idx = Math.round(v);
            if (idx >= 0 && idx < chartData.length) return chartData[idx].date;
            return "";
          }}
          tick={{ fontSize: 11 }}
        />
        <YAxis
          domain={[yMin, yMax]}
          label={{ value: "Efficiency (×1000)", angle: -90, position: "insideLeft", fontSize: 11 }}
          tick={{ fontSize: 11 }}
          tickFormatter={(v) => v.toFixed(1)}
        />
        <Tooltip
          formatter={(value) => {
            const v = typeof value === "number" ? value : parseFloat(String(value));
            return [v.toFixed(2), "Efficiency ×1000"];
          }}
          labelFormatter={(label) => {
            const idx = Math.round(Number(label));
            if (idx >= 0 && idx < chartData.length) return chartData[idx].date;
            return String(label);
          }}
        />
        <ReferenceArea y1={mean - 2 * sd} y2={mean + 2 * sd} fill="#90caf9" fillOpacity={0.2} />
        <ReferenceArea y1={mean - sd} y2={mean + sd} fill="#42a5f5" fillOpacity={0.25} />
        <ReferenceLine y={mean} stroke="#1565c0" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: "mean", position: "right", fontSize: 10 }} />
        <Scatter data={chartData} dataKey="y" fill="#1976d2" r={5} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
