import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import RemoveIcon from "@mui/icons-material/Remove";
import MetricSparkline from "@/components/charts/MetricSparkline";
import { formatDistance, formatPace, formatDuration, type Units } from "@/lib/units";

type Period = "1m" | "3m" | "6m" | "1y";

function periodToDate(period: Period): Date {
  const now = new Date();
  switch (period) {
    case "3m": return new Date(now.setMonth(now.getMonth() - 3));
    case "6m": return new Date(now.setMonth(now.getMonth() - 6));
    case "1y": return new Date(now.setFullYear(now.getFullYear() - 1));
    default: return new Date(now.setMonth(now.getMonth() - 1));
  }
}

function avg(arr: (number | null | undefined)[]): number | null {
  const valid = arr.filter((v): v is number => v != null);
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

function DeltaIndicator({ current, baseline }: { current: number | null; baseline: number | null }) {
  if (current == null || baseline == null) return <RemoveIcon fontSize="small" color="disabled" />;
  const pct = ((current - baseline) / baseline) * 100;
  if (Math.abs(pct) < 2) return <RemoveIcon fontSize="small" color="disabled" />;
  if (pct > 0) return <TrendingUpIcon fontSize="small" color="success" />;
  return <TrendingDownIcon fontSize="small" color="error" />;
}

export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const user = session.user as typeof session.user & { units?: string };
  const units = (user.units ?? "metric") as Units;
  const params = await searchParams;
  const period = (params.period ?? "1m") as Period;
  const since = periodToDate(period);

  const allInPeriod = await db.activity.findMany({
    where: { userId: session.user.id, startTime: { gte: since } },
    orderBy: { startTime: "asc" },
    select: {
      id: true,
      startTime: true,
      totalDistance: true,
      totalMovingTime: true,
      avgHeartRate: true,
      avgCadence: true,
      avgPower: true,
      efficiencyScore: true,
      avgVerticalOscillation: true,
      avgGroundContactTime: true,
      avgSpeed: true,
    },
  });

  const recentRuns = allInPeriod.slice(-5);
  const baselineRuns = allInPeriod.slice(0, Math.max(0, allInPeriod.length - 5));
  const sparklineRuns = allInPeriod.slice(-20);

  const baseline = baselineRuns.length > 0 ? {
    totalDistance: avg(baselineRuns.map((r) => r.totalDistance)),
    avgSpeed: avg(baselineRuns.map((r) => r.avgSpeed)),
    avgHeartRate: avg(baselineRuns.map((r) => r.avgHeartRate)),
    avgCadence: avg(baselineRuns.map((r) => r.avgCadence)),
    avgPower: avg(baselineRuns.map((r) => r.avgPower)),
    efficiencyScore: avg(baselineRuns.map((r) => r.efficiencyScore)),
    avgVerticalOscillation: avg(baselineRuns.map((r) => r.avgVerticalOscillation)),
    avgGroundContactTime: avg(baselineRuns.map((r) => r.avgGroundContactTime)),
  } : null;

  const recentIds = new Set(recentRuns.map((r) => r.id));

  const sparklineData = (key: keyof typeof sparklineRuns[0]) =>
    sparklineRuns.map((r) => ({
      value: r[key] as number | null,
      isRecent: recentIds.has(r.id),
    }));

  const metrics = [
    {
      key: "totalDistance" as const,
      label: "Distance",
      format: (v: number) => formatDistance(v, units),
      baselineVal: baseline?.totalDistance ?? null,
    },
    {
      key: "avgSpeed" as const,
      label: "Avg Pace",
      format: (v: number) => formatPace(v, units),
      baselineVal: baseline?.avgSpeed ?? null,
    },
    {
      key: "avgHeartRate" as const,
      label: "Avg HR",
      format: (v: number) => `${Math.round(v)} bpm`,
      baselineVal: baseline?.avgHeartRate ?? null,
    },
    {
      key: "avgCadence" as const,
      label: "Cadence",
      format: (v: number) => `${Math.round(v)} spm`,
      baselineVal: baseline?.avgCadence ?? null,
    },
    {
      key: "avgPower" as const,
      label: "Avg Power",
      format: (v: number) => `${Math.round(v)} W`,
      baselineVal: baseline?.avgPower ?? null,
    },
    {
      key: "efficiencyScore" as const,
      label: "Efficiency",
      format: (v: number) => v.toFixed(4),
      baselineVal: baseline?.efficiencyScore ?? null,
    },
    {
      key: "avgVerticalOscillation" as const,
      label: "Vertical Osc.",
      format: (v: number) => `${v.toFixed(1)} mm`,
      baselineVal: baseline?.avgVerticalOscillation ?? null,
    },
    {
      key: "avgGroundContactTime" as const,
      label: "Ground Contact",
      format: (v: number) => `${Math.round(v)} ms`,
      baselineVal: baseline?.avgGroundContactTime ?? null,
    },
  ];

  const periodOptions: { value: Period; label: string }[] = [
    { value: "1m", label: "1 Month" },
    { value: "3m", label: "3 Months" },
    { value: "6m", label: "6 Months" },
    { value: "1y", label: "1 Year" },
  ];

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Typography variant="h4">Trends</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          {periodOptions.map((opt) => (
            <Chip
              key={opt.value}
              label={opt.label}
              component="a"
              href={`/trends?period=${opt.value}`}
              clickable
              color={period === opt.value ? "primary" : "default"}
              variant={period === opt.value ? "filled" : "outlined"}
            />
          ))}
        </Box>
      </Box>

      {recentRuns.length === 0 && (
        <Typography color="text.secondary">
          No activities in the selected period. Upload runs to see trends.
        </Typography>
      )}

      {recentRuns.length > 0 && (
        <>
          <Typography variant="h6" gutterBottom>
            Last {recentRuns.length} Runs vs. Baseline
          </Typography>
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
                {baseline && (
                  <tr style={{ background: "#f5f5f5" }}>
                    <td style={{ padding: "6px 12px", color: "#666" }}>Baseline avg</td>
                    {metrics.map((m) => (
                      <td key={m.key} style={{ padding: "6px 12px", textAlign: "right", color: "#666" }}>
                        {m.baselineVal != null ? m.format(m.baselineVal) : "—"}
                      </td>
                    ))}
                  </tr>
                )}
                {recentRuns.map((run) => (
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
                            <DeltaIndicator
                              current={val ?? null}
                              baseline={m.baselineVal}
                            />
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>

          <Typography variant="h6" gutterBottom>
            Metric Trends (last {sparklineRuns.length} runs)
          </Typography>
          <Grid container spacing={2}>
            {metrics.map((m) => (
              <Grid key={m.key} size={{ xs: 12, sm: 6, md: 3 }}>
                <Paper sx={{ p: 1.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    {m.label}
                  </Typography>
                  <MetricSparkline
                    data={sparklineData(m.key)}
                    baseline={m.baselineVal}
                    label={m.label}
                    formatValue={m.format}
                  />
                </Paper>
              </Grid>
            ))}
          </Grid>
        </>
      )}
    </Box>
  );
}
