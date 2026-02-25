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
import type { Units } from "@/lib/units";

interface DataPoint {
  startTime: string;
  efficiencyScore: number;
  classifyValue: number;
}

interface Props {
  data: DataPoint[];
  zoneBoundaries: [number, number];
  zoneLabels: [string, string, string];
  yLabel: string;
  units: Units;
}

const ZONE_COLORS = ["#43a047", "#fb8c00", "#e53935"];

export default function ZoneEfficiencyChart({ data, zoneBoundaries, zoneLabels }: Props) {
  if (data.length === 0) {
    return <p style={{ color: "#888", fontSize: 14 }}>No lap data available.</p>;
  }

  // Classify each point into zone 0/1/2
  const classified = data.map((d) => {
    const v = d.classifyValue;
    let zone: 0 | 1 | 2;
    if (v < zoneBoundaries[0]) zone = 0;
    else if (v < zoneBoundaries[1]) zone = 1;
    else zone = 2;
    return { ...d, zone, eff: d.efficiencyScore * 1000 };
  });

  const zones: Array<Array<{ date: string; eff: number; idx: number }>> = [[], [], []];
  classified.forEach((d) => {
    zones[d.zone].push({
      date: new Date(d.startTime).toLocaleDateString(),
      eff: d.eff,
      idx: zones[d.zone].length,
    });
  });

  // Compute global Y domain across all zones
  const allEffs = classified.map((d) => d.eff);
  const globalMin = Math.floor(Math.min(...allEffs) - 0.5);
  const globalMax = Math.ceil(Math.max(...allEffs) + 0.5);

  return (
    <div>
      {([0, 1, 2] as const).map((z) => (
        <div key={z} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 2, paddingLeft: 8 }}>
            {zoneLabels[z]} ({zones[z].length} pts)
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={zones[z]} margin={{ top: 4, right: 16, bottom: 4, left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="date"
                tick={z === 2 ? { fontSize: 10 } : false}
                tickLine={z === 2}
                axisLine={z === 2}
                height={z === 2 ? 24 : 4}
              />
              <YAxis
                domain={[globalMin, globalMax]}
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => v.toFixed(1)}
                width={40}
              />
              <Tooltip
                formatter={(value) => {
                  const v = typeof value === "number" ? value : parseFloat(String(value));
                  return [v.toFixed(2), "Efficiency ×1000"];
                }}
              />
              <Line
                type="monotone"
                dataKey="eff"
                stroke={ZONE_COLORS[z]}
                dot={{ r: 3, fill: ZONE_COLORS[z] }}
                activeDot={{ r: 5 }}
                strokeWidth={1.5}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  );
}
