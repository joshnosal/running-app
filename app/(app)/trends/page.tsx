"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import CircularProgress from "@mui/material/CircularProgress";
import D3EfficiencyBandChart from "@/components/charts/D3EfficiencyBandChart";
import D3SpeedPowerScatter from "@/components/charts/D3SpeedPowerScatter";
import D3EfficiencyCadenceScatter from "@/components/charts/D3EfficiencyCadenceScatter";
import D3PaceZoneChart from "@/components/charts/D3PaceZoneChart";
import D3CadenceZoneChart from "@/components/charts/D3CadenceZoneChart";
import { useUserPreferences } from "@/lib/user-preferences-context";
import type { ActivityRecord, LapRecord } from "@/types/analytics";

export default function TrendsPage() {
  const { preferences } = useUserPreferences();
  const { units, paceZoneBoundaries, cadenceZoneBoundaries } = preferences;

  const paceBounds: [number, number] = paceZoneBoundaries ?? [3.35, 4.47];
  const cadBounds: [number, number] = cadenceZoneBoundaries ?? [160, 170];

  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [laps, setLaps] = useState<LapRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch("/api/analytics?limit=100&type=activities").then((r) => r.json()),
      fetch("/api/analytics?runs=100&type=laps").then((r) => r.json()),
    ])
      .then(([actRes, lapRes]) => {
        if (cancelled) return;
        setActivities(actRes.activities ?? []);
        setLaps(lapRes.laps ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>Analytics</Typography>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>Efficiency Statistical Bands</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Efficiency plotted against ±1σ / ±2σ bands computed over the selected run history.
        </Typography>
        <D3EfficiencyBandChart units={units} activities={activities} laps={laps} />
      </Paper>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>Speed vs Efficiency</Typography>
        <D3SpeedPowerScatter units={units} activities={activities} laps={laps} />
      </Paper>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>Efficiency vs Cadence</Typography>
        <D3EfficiencyCadenceScatter units={units} activities={activities} laps={laps} />
      </Paper>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>Efficiency by Pace Zone</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Data classified by speed into Easy / Tempo / Threshold zones.{" "}
          <Tooltip title="Configure pace zone boundaries in Settings → Training Zones">
            <span style={{ cursor: "help", textDecoration: "underline dotted" }}>
              Edit boundaries in Settings
            </span>
          </Tooltip>
        </Typography>
        <D3PaceZoneChart
          zoneBoundaries={paceBounds}
          zoneLabels={["Easy", "Tempo", "Threshold"]}
          units={units}
          activities={activities}
          laps={laps}
        />
      </Paper>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>Efficiency by Cadence Zone</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Data classified by cadence into Low / Mid / High zones.{" "}
          <Tooltip title="Configure cadence zone boundaries in Settings → Training Zones">
            <span style={{ cursor: "help", textDecoration: "underline dotted" }}>
              Edit boundaries in Settings
            </span>
          </Tooltip>
        </Typography>
        <D3CadenceZoneChart
          zoneBoundaries={cadBounds}
          zoneLabels={["Low", "Mid", "High"]}
          units={units}
          activities={activities}
          laps={laps}
        />
      </Paper>
    </Box>
  );
}
