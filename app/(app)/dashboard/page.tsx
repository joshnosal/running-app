import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import RemoveIcon from "@mui/icons-material/Remove";
import WeeklyMileageChart from "@/components/charts/WeeklyMileageChart";
import EfficiencyTrendChart from "@/components/charts/EfficiencyTrendChart";
import HRZoneChart from "@/components/charts/HRZoneChart";
import MetricSparkline from "@/components/charts/MetricSparkline";
import { formatDistance, formatDuration, formatPace, type Units } from "@/lib/units";

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

function getISOWeekLabel(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum =
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    );
  return `W${weekNum}`;
}

// suppress unused warning — formatDuration may be unused after metrics restructure
void formatDuration;

export default async function DashboardPage({
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

  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

  const [recentActivities, allInPeriod] = await Promise.all([
    db.activity.findMany({
      where: { userId: session.user.id, startTime: { gte: twelveWeeksAgo } },
      orderBy: { startTime: "asc" },
      select: {
        id: true,
        startTime: true,
        totalDistance: true,
        totalMovingTime: true,
        avgHeartRate: true,
        efficiencyScore: true,
        hrZoneTimes: true,
      },
    }),
    db.activity.findMany({
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
    }),
  ]);

  // --- Weekly chart data ---
  const weekMap = new Map<
    string,
    { distanceM: number; efficiency: number[]; hrZones: number[] }
  >();
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    const label = getISOWeekLabel(d);
    if (!weekMap.has(label)) {
      weekMap.set(label, { distanceM: 0, efficiency: [], hrZones: [0, 0, 0, 0, 0] });
    }
  }
  for (const activity of recentActivities) {
    const label = getISOWeekLabel(new Date(activity.startTime));
    if (!weekMap.has(label)) {
      weekMap.set(label, { distanceM: 0, efficiency: [], hrZones: [0, 0, 0, 0, 0] });
    }
    const entry = weekMap.get(label)!;
    entry.distanceM += activity.totalDistance;
    if (activity.efficiencyScore) entry.efficiency.push(activity.efficiencyScore);
    if (Array.isArray(activity.hrZoneTimes)) {
      const zones = activity.hrZoneTimes as number[];
      for (let i = 0; i < 5; i++) {
        entry.hrZones[i] += zones[i] ?? 0;
      }
    }
  }
  const weekLabels = Array.from(weekMap.keys());
  const weeklyMileageData = weekLabels.map((week) => ({
    week,
    distanceM: weekMap.get(week)!.distanceM,
  }));
  const efficiencyData = weekLabels.map((week) => {
    const eff = weekMap.get(week)!.efficiency;
    return {
      week,
      avgEfficiency: eff.length ? eff.reduce((a, b) => a + b, 0) / eff.length : null,
    };
  });
  const hrZoneData = weekLabels.map((week) => {
    const zones = weekMap.get(week)!.hrZones;
    return { week, z1: zones[0], z2: zones[1], z3: zones[2], z4: zones[3], z5: zones[4] };
  });

  // --- Period metrics (for comparison table + sparklines) ---
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
      unit: units === "imperial" ? "mi" : "km",
      format: (v: number) => formatDistance(v, units),
      baselineVal: baseline?.totalDistance ?? null,
    },
    {
      key: "avgSpeed" as const,
      label: "Avg Pace",
      unit: units === "imperial" ? "/mi" : "/km",
      format: (v: number) => formatPace(v, units),
      baselineVal: baseline?.avgSpeed ?? null,
    },
    {
      key: "avgHeartRate" as const,
      label: "Avg HR",
      unit: "bpm",
      format: (v: number) => `${Math.round(v)} bpm`,
      baselineVal: baseline?.avgHeartRate ?? null,
    },
    {
      key: "efficiencyScore" as const,
      label: "Efficiency",
      unit: "×1000",
      format: (v: number) => (v * 1000).toFixed(2),
      baselineVal: baseline?.efficiencyScore ?? null,
    },
  ];

  const periodOptions: { value: Period; label: string }[] = [
    { value: "1m", label: "1 Month" },
    { value: "3m", label: "3 Months" },
    { value: "6m", label: "6 Months" },
    { value: "1y", label: "1 Year" },
  ];

  // Summary stat cards
  const thisWeekStart = new Date();
  thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
  const thisWeekLabel = getISOWeekLabel(thisWeekStart);
  const thisWeekDist = weekMap.get(thisWeekLabel)?.distanceM ?? 0;
  const monthAgo = new Date();
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  const monthActivities = recentActivities.filter((a) => new Date(a.startTime) >= monthAgo);
  const monthCount = monthActivities.length;
  const monthAvgHR = monthCount
    ? monthActivities.filter((a) => a.avgHeartRate).reduce((sum, a) => sum + (a.avgHeartRate ?? 0), 0) /
      (monthActivities.filter((a) => a.avgHeartRate).length || 1)
    : null;
  const monthAvgEff = monthCount
    ? monthActivities.filter((a) => a.efficiencyScore).reduce((sum, a) => sum + (a.efficiencyScore ?? 0), 0) /
      (monthActivities.filter((a) => a.efficiencyScore).length || 1)
    : null;

  const statCards = [
    { label: "This Week", value: formatDistance(thisWeekDist, units) },
    { label: "Avg Efficiency (Month)", value: monthAvgEff ? (monthAvgEff * 1000).toFixed(2) : "—" },
    { label: "Avg HR (Month)", value: monthAvgHR ? `${Math.round(monthAvgHR)} bpm` : "—" },
    { label: "Runs (Month)", value: String(monthCount) },
  ];

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {statCards.map((card) => (
          <Grid key={card.label} size={{ xs: 12, sm: 6, md: 3 }}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  {card.label}
                </Typography>
                <Typography variant="h5">{card.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Weekly Mileage (12 weeks)
            </Typography>
            <WeeklyMileageChart data={weeklyMileageData} units={units} />
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Efficiency Trend
            </Typography>
            <EfficiencyTrendChart data={efficiencyData} />
          </Paper>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              HR Zone Distribution (12 weeks)
            </Typography>
            <HRZoneChart data={hrZoneData} />
          </Paper>
        </Grid>
      </Grid>

      {/* Period comparison section */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Typography variant="h6">Period Comparison</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          {periodOptions.map((opt) => (
            <Chip
              key={opt.value}
              label={opt.label}
              component="a"
              href={`/dashboard?period=${opt.value}`}
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
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Last {recentRuns.length} runs vs. baseline
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

          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Metric trends (last {sparklineRuns.length} runs)
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
                    unit={m.unit}
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
