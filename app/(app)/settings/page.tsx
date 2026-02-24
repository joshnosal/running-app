"use client";

import { useState, useEffect } from "react";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import RadioGroup from "@mui/material/RadioGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import FormControl from "@mui/material/FormControl";
import FormLabel from "@mui/material/FormLabel";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import { useSession } from "@/lib/auth-client";
import { getZoneBoundaries, getZoneLabels } from "@/lib/hr-zones";
import { useUserPreferences } from "@/lib/user-preferences-context";

type HRZoneMode = "formula" | "custom";
type UnitsMode = "metric" | "imperial";
type ThemeMode = "light" | "dark" | "system";

interface UserExtra {
  maxHeartRate?: number | null;
  hrZoneMode?: string | null;
  hrZoneBoundaries?: unknown;
  units?: string | null;
  theme?: string | null;
}

export default function SettingsPage() {
  const { data: session } = useSession();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = session?.user as any as (Record<string, unknown> & UserExtra) | undefined;
  const { updatePreferences } = useUserPreferences();

  const [name, setName] = useState("");
  const [units, setUnits] = useState<UnitsMode>("metric");
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [hrZoneMode, setHRZoneMode] = useState<HRZoneMode>("formula");
  const [maxHR, setMaxHR] = useState(185);
  const [customBounds, setCustomBounds] = useState<[number, number, number, number]>([
    111, 129, 148, 166,
  ]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  useEffect(() => {
    if (!user) return;
    setName(String(user.name ?? ""));
    setUnits((user.units as UnitsMode) ?? "metric");
    setTheme((user.theme as ThemeMode) ?? "system");
    setHRZoneMode((user.hrZoneMode as HRZoneMode) ?? "formula");
    setMaxHR(user.maxHeartRate ?? 185);
    if (Array.isArray(user.hrZoneBoundaries)) {
      const b = user.hrZoneBoundaries as number[];
      if (b.length === 4) setCustomBounds([b[0], b[1], b[2], b[3]]);
    }
  }, [user]);

  const boundaries = getZoneBoundaries({
    maxHeartRate: maxHR,
    hrZoneMode,
    hrZoneBoundaries: hrZoneMode === "custom" ? customBounds : null,
  });
  const zoneLabels = getZoneLabels(boundaries);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setResult(null);

    const body: Record<string, unknown> = {
      name,
      units,
      theme,
      hrZoneMode,
      maxHeartRate: maxHR,
      hrZoneBoundaries: hrZoneMode === "custom" ? customBounds : null,
    };

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setResult({ type: "success", message: "Settings saved." });
        updatePreferences({
          units,
          theme,
          maxHeartRate: maxHR,
          hrZoneMode,
          hrZoneBoundaries: hrZoneMode === "custom" ? Array.from(customBounds) : null,
        });
      } else {
        const data = await res.json();
        setResult({ type: "error", message: data.error ?? "Save failed." });
      }
    } catch {
      setResult({ type: "error", message: "Network error." });
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Settings
      </Typography>

      <Box component="form" onSubmit={handleSave}>
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Profile
          </Typography>
          <TextField
            label="Display Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            margin="normal"
          />
          <TextField
            label="Email"
            value={user.email ?? ""}
            fullWidth
            margin="normal"
            disabled
            helperText="Email cannot be changed"
          />
        </Paper>

        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Appearance
          </Typography>
          <FormControl>
            <FormLabel>Theme</FormLabel>
            <RadioGroup
              value={theme}
              onChange={(e) => setTheme(e.target.value as ThemeMode)}
              row
            >
              <FormControlLabel value="light" control={<Radio />} label="Light" />
              <FormControlLabel value="dark" control={<Radio />} label="Dark" />
              <FormControlLabel value="system" control={<Radio />} label="System default" />
            </RadioGroup>
          </FormControl>
        </Paper>

        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Units
          </Typography>
          <FormControl>
            <RadioGroup
              value={units}
              onChange={(e) => setUnits(e.target.value as UnitsMode)}
              row
            >
              <FormControlLabel value="metric" control={<Radio />} label="Metric (km, m)" />
              <FormControlLabel value="imperial" control={<Radio />} label="Imperial (mi, ft)" />
            </RadioGroup>
          </FormControl>
        </Paper>

        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            HR Zone Configuration
          </Typography>
          <FormControl sx={{ mb: 2 }}>
            <FormLabel>Zone Mode</FormLabel>
            <RadioGroup
              value={hrZoneMode}
              onChange={(e) => setHRZoneMode(e.target.value as HRZoneMode)}
              row
            >
              <FormControlLabel value="formula" control={<Radio />} label="Max HR formula" />
              <FormControlLabel value="custom" control={<Radio />} label="Custom zones" />
            </RadioGroup>
          </FormControl>

          {hrZoneMode === "formula" && (
            <Box>
              <TextField
                label="Max Heart Rate"
                type="number"
                value={maxHR}
                onChange={(e) => setMaxHR(parseInt(e.target.value) || 185)}
                slotProps={{ htmlInput: { min: 100, max: 220 } }}
                sx={{ width: 180, mb: 2 }}
              />
              <Typography variant="body2" color="text.secondary">
                Computed zones:
              </Typography>
              {zoneLabels.map((z) => (
                <Typography key={z.zone} variant="body2">
                  Zone {z.zone}: {z.label}
                </Typography>
              ))}
            </Box>
          )}

          {hrZoneMode === "custom" && (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Set upper BPM boundary for each zone (Z1–Z4). Z5 is everything above Z4.
              </Typography>
              {([1, 2, 3, 4] as const).map((z) => (
                <TextField
                  key={z}
                  label={`Zone ${z} upper bound (bpm)`}
                  type="number"
                  value={customBounds[z - 1]}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    setCustomBounds((prev) => {
                      const next = [...prev] as [number, number, number, number];
                      next[z - 1] = val;
                      return next;
                    });
                  }}
                  slotProps={{ htmlInput: { min: 50, max: 220 } }}
                  sx={{ width: 220, mb: 1, display: "block" }}
                  error={z > 1 && customBounds[z - 1] <= customBounds[z - 2]}
                  helperText={
                    z > 1 && customBounds[z - 1] <= customBounds[z - 2]
                      ? `Must be greater than Z${z - 1} (${customBounds[z - 2]})`
                      : ""
                  }
                />
              ))}
            </Box>
          )}
        </Paper>

        {result && (
          <Alert severity={result.type} sx={{ mb: 2 }}>
            {result.message}
          </Alert>
        )}

        <Button type="submit" variant="contained" disabled={saving}>
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </Box>
    </Box>
  );
}
