import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import WeeklyMileageChart from "@/components/charts/WeeklyMileageChart";
import EfficiencyTrendChart from "@/components/charts/EfficiencyTrendChart";
import HRZoneChart from "@/components/charts/HRZoneChart";
import { formatDistance, formatDuration, type Units } from "@/lib/units";

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

  const user = session.user as typeof session.user & {
    units?: string;
  };
  const units = (user.units ?? "metric") as Units;

  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

  const monthAgo = new Date();
  monthAgo.setMonth(monthAgo.getMonth() - 1);

  const [recentActivities, monthActivities] = await Promise.all([
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
      where: { userId: session.user.id, startTime: { gte: monthAgo } },
      select: {
        totalDistance: true,
        avgHeartRate: true,
        efficiencyScore: true,
      },
    }),
  ]);

  // Group by week
  const weekMap = new Map<
    string,
    { distanceM: number; efficiency: number[]; hrZones: number[] }
  >();

  // Seed 12 weeks
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

  // Stats
  const thisWeekStart = new Date();
  thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
  const thisWeekLabel = getISOWeekLabel(thisWeekStart);
  const thisWeekDist = weekMap.get(thisWeekLabel)?.distanceM ?? 0;

  const monthCount = monthActivities.length;
  const monthAvgHR = monthCount
    ? monthActivities
        .filter((a) => a.avgHeartRate)
        .reduce((sum, a) => sum + (a.avgHeartRate ?? 0), 0) /
      monthActivities.filter((a) => a.avgHeartRate).length
    : null;
  const monthAvgEff = monthCount
    ? monthActivities
        .filter((a) => a.efficiencyScore)
        .reduce((sum, a) => sum + (a.efficiencyScore ?? 0), 0) /
      (monthActivities.filter((a) => a.efficiencyScore).length || 1)
    : null;

  const statCards = [
    { label: "This Week", value: formatDistance(thisWeekDist, units) },
    {
      label: "Avg Efficiency (Month)",
      value: monthAvgEff ? monthAvgEff.toFixed(4) : "—",
    },
    {
      label: "Avg HR (Month)",
      value: monthAvgHR ? `${Math.round(monthAvgHR)} bpm` : "—",
    },
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

      <Grid container spacing={2}>
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
    </Box>
  );
}
