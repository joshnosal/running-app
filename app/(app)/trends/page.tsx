"use client";

import { useState, useEffect } from "react";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Tooltip from "@mui/material/Tooltip";
import EfficiencyBandChart from "@/components/charts/EfficiencyBandChart";
import SpeedPowerScatter from "@/components/charts/SpeedPowerScatter";
import ZoneEfficiencyChart from "@/components/charts/ZoneEfficiencyChart";
import D3PaceZoneChart from "@/components/charts/D3PaceZoneChart";
import { useUserPreferences } from "@/lib/user-preferences-context";

interface AnalyticsRecord {
  id: string;
  activityId?: string;
  lapNumber?: number;
  startTime: string;
  avgSpeed: number;
  avgPower: number | null;
  avgCadence: number | null;
  avgHeartRate: number | null;
  efficiencyScore: number | null;
}

type DataType = "activities" | "laps";

export default function TrendsPage() {
  const { preferences } = useUserPreferences();
  const { units, paceZoneBoundaries, cadenceZoneBoundaries } = preferences;

  const [n, setN] = useState(50);
  const [dataType, setDataType] = useState<DataType>("activities");
  const [mainData, setMainData] = useState<AnalyticsRecord[]>([]);
  const [lapsData, setLapsData] = useState<AnalyticsRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const typeParam = dataType;
    Promise.all([
      fetch(`/api/analytics?limit=${n}&type=${typeParam}`).then((r) => r.json()),
      fetch(`/api/analytics?limit=${n}&type=laps`).then((r) => r.json()),
    ]).then(([mainRes, lapsRes]) => {
      const main: AnalyticsRecord[] = mainRes.activities ?? mainRes.laps ?? [];
      const laps: AnalyticsRecord[] = lapsRes.laps ?? [];
      setMainData(main);
      setLapsData(laps);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [n, dataType]);

  // Filtered sets for each chart
  const efficiencyData = mainData.filter((d) => d.efficiencyScore != null) as Array<
    AnalyticsRecord & { efficiencyScore: number }
  >;
  const speedPowerData = mainData.filter(
    (d) => d.avgSpeed != null && d.avgPower != null
  ) as Array<AnalyticsRecord & { avgPower: number }>;

  const lapEfficiencyData = lapsData.filter((d) => d.efficiencyScore != null) as Array<
    AnalyticsRecord & { efficiencyScore: number }
  >;

  const paceBounds: [number, number] = paceZoneBoundaries ?? [3.35, 4.47];
  const cadBounds: [number, number] = cadenceZoneBoundaries ?? [160, 170];

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Typography variant="h4">Analytics</Typography>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
          <FormControl size="small" sx={{ minWidth: 80 }}>
            <InputLabel>N</InputLabel>
            <Select value={n} label="N" onChange={(e) => setN(Number(e.target.value))}>
              <MenuItem value={10}>10</MenuItem>
              <MenuItem value={25}>25</MenuItem>
              <MenuItem value={50}>50</MenuItem>
              <MenuItem value={100}>100</MenuItem>
            </Select>
          </FormControl>
          <ToggleButtonGroup
            value={dataType}
            exclusive
            onChange={(_, v) => { if (v) setDataType(v); }}
            size="small"
          >
            <ToggleButton value="activities">Runs</ToggleButton>
            <ToggleButton value="laps">Laps</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>

      {loading && (
        <Typography color="text.secondary">Loading data…</Typography>
      )}

      {!loading && (
        <>
          {/* Chart 1 — Efficiency Statistical Bands */}
          <Paper sx={{ p: 2, mb: 3 }}>
            <Typography variant="subtitle1" gutterBottom>
              Efficiency Statistical Bands
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Last 10 data points plotted against ±1σ / ±2σ bands computed over all {n} {dataType}.
            </Typography>
            <EfficiencyBandChart data={efficiencyData} units={units} />
          </Paper>

          {/* Chart 2 — Speed vs Power */}
          <Paper sx={{ p: 2, mb: 3 }}>
            <Typography variant="subtitle1" gutterBottom>
              Speed vs Power
            </Typography>
            <SpeedPowerScatter data={speedPowerData} units={units} />
          </Paper>

          {/* Chart 3 — Efficiency by Pace Zone */}
          <Paper sx={{ p: 2, mb: 3 }}>
            <Typography variant="subtitle1" gutterBottom>
              Efficiency by Pace Zone (laps)
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Laps classified by speed into Easy / Tempo / Threshold zones.{" "}
              <Tooltip title="Configure pace zone boundaries in Settings → Training Zones">
                <span style={{ cursor: "help", textDecoration: "underline dotted" }}>
                  Edit boundaries in Settings
                </span>
              </Tooltip>
            </Typography>
            <ZoneEfficiencyChart
              data={lapEfficiencyData.map((d) => ({
                startTime: d.startTime,
                efficiencyScore: d.efficiencyScore,
                classifyValue: d.avgSpeed,
              }))}
              zoneBoundaries={paceBounds}
              zoneLabels={["Easy", "Tempo", "Threshold"]}
              yLabel="Efficiency ×1000"
              units={units}
            />
          </Paper>

          {/* Chart 3b — Efficiency by Pace Zone (D3) */}
          <Paper sx={{ p: 2, mb: 3 }}>
            <Typography variant="subtitle1" gutterBottom>
              Efficiency by Pace Zone (laps)
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Laps classified by speed into Easy / Tempo / Threshold zones.{" "}
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
            />
          </Paper>

          {/* Chart 4 — Efficiency by Cadence Zone */}
          <Paper sx={{ p: 2, mb: 3 }}>
            <Typography variant="subtitle1" gutterBottom>
              Efficiency by Cadence Zone (laps)
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Laps classified by cadence into Low / Mid / High zones.{" "}
              <Tooltip title="Configure cadence zone boundaries in Settings → Training Zones">
                <span style={{ cursor: "help", textDecoration: "underline dotted" }}>
                  Edit boundaries in Settings
                </span>
              </Tooltip>
            </Typography>
            <ZoneEfficiencyChart
              data={lapEfficiencyData
                .filter((d) => d.avgCadence != null)
                .map((d) => ({
                  startTime: d.startTime,
                  efficiencyScore: d.efficiencyScore,
                  classifyValue: d.avgCadence as number,
                }))}
              zoneBoundaries={cadBounds}
              zoneLabels={["Low", "Mid", "High"]}
              yLabel="Efficiency ×1000"
              units={units}
            />
          </Paper>
        </>
      )}
    </Box>
  );
}
