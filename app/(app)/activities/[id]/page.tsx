import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import Alert from "@mui/material/Alert";
import D3HRZoneChart from "@/components/charts/D3HRZoneChart";
import DeleteActivityButton from "@/components/activities/DeleteActivityButton";
import {
  formatDistance,
  formatPace,
  formatDuration,
  formatElevation,
  type Units,
} from "@/lib/units";

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const { id } = await params;
  const user = session.user as typeof session.user & { units?: string };
  const units = (user.units ?? "metric") as Units;

  const activity = await db.activity.findFirst({
    where: { id, userId: session.user.id },
    include: { laps: { orderBy: { lapNumber: "asc" } } },
  });

  if (!activity) notFound();

  const date = new Date(activity.startTime).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const statCards = [
    { label: "Distance", value: formatDistance(activity.totalDistance, units) },
    { label: "Duration", value: formatDuration(activity.totalMovingTime) },
    { label: "Pace", value: formatPace(activity.avgSpeed, units) },
    { label: "Avg HR", value: activity.avgHeartRate ? `${activity.avgHeartRate} bpm` : "—" },
    { label: "Max HR", value: activity.maxHeartRate ? `${activity.maxHeartRate} bpm` : "—" },
    { label: "Avg Cadence", value: activity.avgCadence ? `${activity.avgCadence} spm` : "—" },
    {
      label: "Elevation Gain",
      value: activity.totalAscent != null ? formatElevation(activity.totalAscent, units) : "—",
    },
    {
      label: "Calories",
      value: activity.totalCalories ? `${activity.totalCalories} kcal` : "—",
    },
    {
      label: "Vertical Oscillation",
      value: activity.avgVerticalOscillation
        ? `${activity.avgVerticalOscillation.toFixed(1)} mm`
        : "—",
    },
    {
      label: "Ground Contact",
      value: activity.avgGroundContactTime
        ? `${Math.round(activity.avgGroundContactTime)} ms`
        : "—",
    },
    {
      label: "Stride Length",
      value: activity.avgStrideLength
        ? `${activity.avgStrideLength.toFixed(2)} m`
        : "—",
    },
    {
      label: "Efficiency Score",
      value: activity.efficiencyScore ? activity.efficiencyScore.toFixed(4) : "—",
    },
  ];

  const hrZoneData = Array.isArray(activity.hrZoneTimes)
    ? [
        {
          week: "This Run",
          z1: (activity.hrZoneTimes as number[])[0] ?? 0,
          z2: (activity.hrZoneTimes as number[])[1] ?? 0,
          z3: (activity.hrZoneTimes as number[])[2] ?? 0,
          z4: (activity.hrZoneTimes as number[])[3] ?? 0,
          z5: (activity.hrZoneTimes as number[])[4] ?? 0,
        },
      ]
    : [];

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 2 }}>
        <Box>
          <Typography variant="h4">{date}</Typography>
          <Typography variant="body2" color="text.secondary">
            {activity.sport} &bull; {activity.fileName}
          </Typography>
        </Box>
        <DeleteActivityButton activityId={activity.id} />
      </Box>

      {!activity.avgPower && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Power data unavailable — efficiency score requires a power meter or
          Garmin Running Power.
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {statCards.map((card) => (
          <Grid key={card.label} size={{ xs: 6, sm: 4, md: 3 }}>
            <Card>
              <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                <Typography variant="body2" color="text.secondary">
                  {card.label}
                </Typography>
                <Typography variant="h6">{card.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {hrZoneData.length > 0 && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle1" gutterBottom>
            HR Zone Breakdown
          </Typography>
          <D3HRZoneChart data={hrZoneData} />
        </Paper>
      )}

      {activity.laps.length > 0 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            Laps ({activity.laps.length})
          </Typography>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Lap</TableCell>
                  <TableCell>Distance</TableCell>
                  <TableCell>Time</TableCell>
                  <TableCell>Pace</TableCell>
                  <TableCell>Avg HR</TableCell>
                  <TableCell>Cadence</TableCell>
                  <TableCell>Power</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {activity.laps.map((lap: typeof activity.laps[number]) => (
                  <TableRow key={lap.id}>
                    <TableCell>{lap.lapNumber}</TableCell>
                    <TableCell>{formatDistance(lap.totalDistance, units)}</TableCell>
                    <TableCell>{formatDuration(lap.totalMovingTime)}</TableCell>
                    <TableCell>{formatPace(lap.avgSpeed, units)}</TableCell>
                    <TableCell>
                      {lap.avgHeartRate ? `${lap.avgHeartRate} bpm` : "—"}
                    </TableCell>
                    <TableCell>
                      {lap.avgCadence ? `${lap.avgCadence} spm` : "—"}
                    </TableCell>
                    <TableCell>
                      {lap.avgPower ? `${Math.round(lap.avgPower)} W` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Paper>
      )}
    </Box>
  );
}
