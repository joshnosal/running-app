"use client";

import { useState, useEffect } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import Skeleton from "@mui/material/Skeleton";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import RemoveIcon from "@mui/icons-material/Remove";
import { formatDistance, formatPace, type Units } from "@/lib/units";

type Period = "1m" | "3m" | "6m" | "1y";

interface RunRecord {
  id: string;
  startTime: string;
  totalDistance: number;
  avgSpeed: number | null;
  avgHeartRate: number | null;
  efficiencyScore: number | null;
}

interface Baseline {
  totalDistance: number | null;
  avgSpeed: number | null;
  avgHeartRate: number | null;
  efficiencyScore: number | null;
}

interface ComparisonData {
  baseline: Baseline | null;
  recentRuns: RunRecord[];
  periodCount: number;
}

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "1m", label: "1 Month" },
  { value: "3m", label: "3 Months" },
  { value: "6m", label: "6 Months" },
  { value: "1y", label: "1 Year" },
];

const PERIOD_LABELS: Record<Period, string> = {
  "1m": "1 month", "3m": "3 months", "6m": "6 months", "1y": "1 year",
};

// Show arrow for any change ≥ 0.1% — catches differences like 8:11 vs 8:18 pace
// or efficiency scores of 84.8 vs 84.9.
function DeltaIndicator({ current, baseline }: { current: number | null; baseline: number | null }) {
  if (current == null || baseline == null || baseline === 0) {
    return <RemoveIcon fontSize="small" color="disabled" />;
  }
  const pct = ((current - baseline) / Math.abs(baseline)) * 100;
  if (Math.abs(pct) < 0.1) return <RemoveIcon fontSize="small" color="disabled" />;
  if (pct > 0) return <TrendingUpIcon fontSize="small" color="success" />;
  return <TrendingDownIcon fontSize="small" color="error" />;
}

export default function PeriodComparison({ units }: { units: Units }) {
  const [period, setPeriod] = useState<Period>("1m");
  const [data, setData] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/comparison?period=${period}`)
      .then((r) => r.json())
      .then((d: ComparisonData) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [period]);

  const metrics: {
    key: keyof RunRecord;
    label: string;
    format: (v: number) => string;
    baselineVal: number | null;
  }[] = [
    {
      key: "totalDistance",
      label: "Distance",
      format: (v) => formatDistance(v, units),
      baselineVal: data?.baseline?.totalDistance ?? null,
    },
    {
      key: "avgSpeed",
      label: "Avg Pace",
      format: (v) => formatPace(v, units),
      baselineVal: data?.baseline?.avgSpeed ?? null,
    },
    {
      key: "avgHeartRate",
      label: "Avg HR",
      format: (v) => `${Math.round(v)} bpm`,
      baselineVal: data?.baseline?.avgHeartRate ?? null,
    },
    {
      key: "efficiencyScore",
      label: "Efficiency (×10⁴)",
      format: (v) => (v * 10000).toFixed(2),
      baselineVal: data?.baseline?.efficiencyScore ?? null,
    },
  ];

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Typography variant="h6">Period Comparison</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          {PERIOD_OPTIONS.map((opt) => (
            <Chip
              key={opt.value}
              label={opt.label}
              onClick={() => setPeriod(opt.value)}
              color={period === opt.value ? "primary" : "default"}
              variant={period === opt.value ? "filled" : "outlined"}
            />
          ))}
        </Box>
      </Box>

      {/* Subtitle line — skeleton while loading */}
      <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ minHeight: 20 }}>
        {loading ? (
          <Skeleton variant="text" width={280} />
        ) : !data || data.recentRuns.length === 0 ? (
          "No activities found. Upload runs to see trends."
        ) : (
          <>
            Last {data.recentRuns.length} runs vs.{" "}
            {data.baseline
              ? `${PERIOD_LABELS[period]} average (${data.periodCount} runs)`
              : `${PERIOD_LABELS[period]} — no data in that window`}
          </>
        )}
      </Typography>

      {/* Table — always rendered at full height; skeleton cells fill in while loading */}
      <Box sx={{ overflowX: "auto", mb: 4 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #e0e0e0" }}>
              <th style={{ padding: "8px 12px", textAlign: "left" }}>Date</th>
              {metrics.map((m) => (
                <th key={m.key} style={{ padding: "8px 12px", textAlign: "right" }}>
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Baseline / avg row */}
            <tr style={{ background: "#f5f5f5" }}>
              <td style={{ padding: "6px 12px", color: "#666", fontStyle: "italic" }}>
                {loading ? <Skeleton variant="text" width={90} /> : `${PERIOD_LABELS[period]} avg`}
              </td>
              {metrics.map((m) => (
                <td key={m.key} style={{ padding: "6px 12px", textAlign: "right", color: "#666" }}>
                  {loading ? (
                    <Skeleton variant="text" width={60} sx={{ ml: "auto" }} />
                  ) : (
                    m.baselineVal != null ? m.format(m.baselineVal) : "—"
                  )}
                </td>
              ))}
            </tr>

            {/* Data rows — 10 skeleton rows while loading, real rows when loaded */}
            {loading
              ? Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "6px 12px" }}>
                      <Skeleton variant="text" width={80} />
                    </td>
                    {metrics.map((m) => (
                      <td key={m.key} style={{ padding: "6px 12px", textAlign: "right" }}>
                        <Skeleton variant="text" width={58} sx={{ ml: "auto" }} />
                      </td>
                    ))}
                  </tr>
                ))
              : (data?.recentRuns ?? []).map((run) => (
                  <tr key={run.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "6px 12px" }}>
                      {new Date(run.startTime).toLocaleDateString()}
                    </td>
                    {metrics.map((m) => {
                      const val = run[m.key] as number | null | undefined;
                      return (
                        <td key={m.key} style={{ padding: "6px 12px", textAlign: "right" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            {val != null ? m.format(val) : "—"}
                            <DeltaIndicator current={val ?? null} baseline={m.baselineVal} />
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
          </tbody>
        </table>
      </Box>
    </Box>
  );
}
