"use client";

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatPace, type Units } from "@/lib/units";

interface DataPoint {
  startTime: string;
  avgSpeed: number;
  avgPower: number;
}

interface Props {
  data: DataPoint[];
  units: Units;
}

const MS_TO_KMH = 3.6;
const MS_TO_MPH = 2.23694;

export default function SpeedPowerScatter({ data, units }: Props) {
  if (data.length === 0) {
    return <p style={{ color: "#888", fontSize: 14 }}>No speed/power data available.</p>;
  }

  const chartData = data.map((d) => ({
    speed: units === "imperial" ? d.avgSpeed * MS_TO_MPH : d.avgSpeed * MS_TO_KMH,
    power: d.avgPower,
    mps: d.avgSpeed,
    date: new Date(d.startTime).toLocaleDateString(),
  }));

  const speedLabel = units === "imperial" ? "Speed (mph)" : "Speed (km/h)";

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis
          type="number"
          dataKey="speed"
          name="Speed"
          label={{ value: speedLabel, position: "insideBottom", offset: -15, fontSize: 12 }}
          tick={{ fontSize: 11 }}
          tickFormatter={(v) => v.toFixed(1)}
        />
        <YAxis
          type="number"
          dataKey="power"
          name="Power"
          label={{ value: "Power (W)", angle: -90, position: "insideLeft", fontSize: 11 }}
          tick={{ fontSize: 11 }}
        />
        <Tooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0]?.payload as { mps: number; power: number; date: string } | undefined;
            if (!d) return null;
            return (
              <div style={{ background: "rgba(0,0,0,0.8)", color: "#fff", padding: "8px 12px", borderRadius: 6, fontSize: 13 }}>
                <div>{d.date}</div>
                <div>Pace: {formatPace(d.mps, units)}</div>
                <div>Power: {d.power.toFixed(0)} W</div>
              </div>
            );
          }}
        />
        <Scatter data={chartData} fill="#7c4dff" opacity={0.75} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
