import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import D3WeeklyMileageChart from "@/components/charts/D3WeeklyMileageChart";
import D3EfficiencyTrendChart from "@/components/charts/D3EfficiencyTrendChart";
import D3HRZoneChart from "@/components/charts/D3HRZoneChart";
import PeriodComparison from "@/components/dashboard/PeriodComparison";
import { formatDistance, type Units } from "@/lib/units";

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

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const user = session.user as typeof session.user & { units?: string };
  const units = (user.units ?? "metric") as Units;

  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

  const recentActivities = await db.activity.findMany({
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
      avgCadence: true,
    },
  });
  type RecentActivity = typeof recentActivities[number];

  // --- Weekly chart data ---
  const weekMap = new Map<
    string,
    { distanceM: number; efficiency: number[]; hrZones: number[]; cadences: number[]; totalTimeS: number }
  >();
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    const label = getISOWeekLabel(d);
    if (!weekMap.has(label)) {
      weekMap.set(label, { distanceM: 0, efficiency: [], hrZones: [0, 0, 0, 0, 0], cadences: [], totalTimeS: 0 });
    }
  }
  for (const activity of recentActivities as RecentActivity[]) {
    const label = getISOWeekLabel(new Date(activity.startTime));
    if (!weekMap.has(label)) {
      weekMap.set(label, { distanceM: 0, efficiency: [], hrZones: [0, 0, 0, 0, 0], cadences: [], totalTimeS: 0 });
    }
    const entry = weekMap.get(label)!;
    entry.distanceM += activity.totalDistance;
    entry.totalTimeS += activity.totalMovingTime;
    if (activity.efficiencyScore) entry.efficiency.push(activity.efficiencyScore);
    if (activity.avgCadence) entry.cadences.push(activity.avgCadence * 2);
    if (Array.isArray(activity.hrZoneTimes)) {
      const zones = activity.hrZoneTimes as number[];
      for (let i = 0; i < 5; i++) {
        entry.hrZones[i] += zones[i] ?? 0;
      }
    }
  }
  const weekLabels = Array.from(weekMap.keys());
  const weeklyMileageData = weekLabels.map((week) => {
    const entry = weekMap.get(week)!;
    return {
      week,
      distanceM: entry.distanceM,
      avgPaceMs: entry.totalTimeS > 0 && entry.distanceM > 0 ? entry.distanceM / entry.totalTimeS : null,
    };
  });
  const efficiencyData = weekLabels.map((week) => {
    const entry = weekMap.get(week)!;
    const eff = entry.efficiency;
    const cads = entry.cadences;
    return {
      week,
      avgEfficiency: eff.length ? eff.reduce((a, b) => a + b, 0) / eff.length : null,
      avgCadence: cads.length ? cads.reduce((a, b) => a + b, 0) / cads.length : null,
    };
  });
  const hrZoneData = weekLabels.map((week) => {
    const zones = weekMap.get(week)!.hrZones;
    return { week, z1: zones[0], z2: zones[1], z3: zones[2], z4: zones[3], z5: zones[4] };
  });

  // --- Summary stat cards ---
  const thisWeekLabel = getISOWeekLabel(new Date());
  const thisWeekDist = weekMap.get(thisWeekLabel)?.distanceM ?? 0;
  const monthAgo = new Date();
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  const monthActivities = recentActivities.filter((a: RecentActivity) => new Date(a.startTime) >= monthAgo);
  const monthCount = monthActivities.length;
  const monthAvgHR = monthCount
    ? monthActivities.filter((a: RecentActivity) => a.avgHeartRate).reduce((sum, a: RecentActivity) => sum + (a.avgHeartRate ?? 0), 0) /
      (monthActivities.filter((a: RecentActivity) => a.avgHeartRate).length || 1)
    : null;
  const monthAvgEff = monthCount
    ? monthActivities.filter((a: RecentActivity) => a.efficiencyScore).reduce((sum, a: RecentActivity) => sum + (a.efficiencyScore ?? 0), 0) /
      (monthActivities.filter((a: RecentActivity) => a.efficiencyScore).length || 1)
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
            <D3WeeklyMileageChart data={weeklyMileageData} units={units} />
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Efficiency Trend
            </Typography>
            <D3EfficiencyTrendChart data={efficiencyData} />
          </Paper>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              HR Zone Distribution (12 weeks)
            </Typography>
            <D3HRZoneChart data={hrZoneData} />
          </Paper>
        </Grid>
      </Grid>

      <PeriodComparison units={units} />
    </Box>
  );
}
