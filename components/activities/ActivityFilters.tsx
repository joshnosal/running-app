"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import type { Units } from "@/lib/units";

function metersToUnit(meters: number, units: Units): number {
  return units === "imperial" ? meters / 1609.344 : meters / 1000;
}

function unitToMeters(value: number, units: Units): number {
  return units === "imperial" ? value * 1609.344 : value * 1000;
}

interface Props {
  units: Units;
  from?: string;
  to?: string;
  distMin?: string; // meters
  distMax?: string; // meters
}

export default function ActivityFilters({ units, from: initFrom, to: initTo, distMin: initDistMin, distMax: initDistMax }: Props) {
  const router = useRouter();
  const unitLabel = units === "metric" ? "km" : "mi";

  const [from, setFrom] = useState(initFrom ?? "");
  const [to, setTo] = useState(initTo ?? "");
  const [distMin, setDistMin] = useState(
    initDistMin ? metersToUnit(parseFloat(initDistMin), units).toFixed(1) : ""
  );
  const [distMax, setDistMax] = useState(
    initDistMax ? metersToUnit(parseFloat(initDistMax), units).toFixed(1) : ""
  );

  function apply() {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (distMin) {
      params.set("distMin", String(unitToMeters(parseFloat(distMin), units)));
    }
    if (distMax) {
      params.set("distMax", String(unitToMeters(parseFloat(distMax), units)));
    }
    router.push(`/activities?${params.toString()}`);
  }

  function reset() {
    setFrom("");
    setTo("");
    setDistMin("");
    setDistMax("");
    router.push("/activities");
  }

  const hasFilters = from || to || distMin || distMax;

  return (
    <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2, alignItems: "flex-end" }}>
      <TextField
        label="From date"
        type="date"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        size="small"
        slotProps={{ inputLabel: { shrink: true } }}
        sx={{ width: 160 }}
      />
      <TextField
        label="To date"
        type="date"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        size="small"
        slotProps={{ inputLabel: { shrink: true } }}
        sx={{ width: 160 }}
      />
      <TextField
        label={`Min distance (${unitLabel})`}
        type="number"
        value={distMin}
        onChange={(e) => setDistMin(e.target.value)}
        size="small"
        slotProps={{ htmlInput: { min: 0, step: 0.1 } }}
        sx={{ width: 170 }}
      />
      <TextField
        label={`Max distance (${unitLabel})`}
        type="number"
        value={distMax}
        onChange={(e) => setDistMax(e.target.value)}
        size="small"
        slotProps={{ htmlInput: { min: 0, step: 0.1 } }}
        sx={{ width: 170 }}
      />
      <Button variant="contained" size="small" onClick={apply}>
        Apply
      </Button>
      {hasFilters && (
        <Button size="small" color="inherit" onClick={reset}>
          Clear
        </Button>
      )}
    </Box>
  );
}
