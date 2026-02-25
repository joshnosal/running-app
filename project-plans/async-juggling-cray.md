# Analytics Charts — Implementation Plan

## Context

The user wants a dedicated analytics view on `/trends` showing efficiency trends by pace/cadence zones, a statistical band chart, and a speed/power scatter. The existing `/trends` content (sparklines + metrics comparison table) moves to `/dashboard`. Four new chart types are added, each requiring new data endpoints and chart components. Two new user-configurable zone settings (pace and cadence thresholds) are added to the user profile.

---

## Decisions & Key Constraints

- **Chart 1 (SD bands)**: Fixed horizontal ±1σ/±2σ reference areas computed over the last N activities/laps. Last 10 of those plotted as dots chronologically on the X-axis (date).
- **Charts 3 & 4 (zone charts)**: Always use **lap data** regardless of the laps/runs toggle (toggle is disabled for these charts).
- **Pace/cadence zone boundaries**: Stored in m/s (pace) and spm (cadence). Displayed in the user's preferred unit (min/km or min/mile) in settings UI, converted on save.
- **Efficiency display**: Multiply raw score by 1000 everywhere in this new page so values are human-readable (e.g. 15.23 instead of 0.01523).
- **Page controls**: One global N selector (10 / 25 / 50 / 100, default 50) and one Laps/Runs toggle at the top of the page; they apply to all charts (Charts 3/4 ignore the toggle and always use laps).

---

## 1 — Database Schema (`prisma/schema.prisma`)

Add two new nullable JSON fields to the `User` model:

```prisma
paceZoneBoundaries    Json?   // [boundary1_mps, boundary2_mps]  e.g. [3.35, 4.47]
cadenceZoneBoundaries Json?   // [boundary1_spm, boundary2_spm]  e.g. [160, 170]
```

Run `npx prisma db push` after the schema change.

---

## 2 — Types (`types/preferences.ts`)

Add to `UserPreferences`:

```typescript
paceZoneBoundaries: [number, number] | null    // m/s, two thresholds defining easy/tempo/threshold
cadenceZoneBoundaries: [number, number] | null  // spm, two thresholds defining low/mid/high cadence
```

Add defaults to `DEFAULT_PREFERENCES`:
```typescript
paceZoneBoundaries: [3.35, 4.47]    // ≈ 8:00/mi and 6:00/mi
cadenceZoneBoundaries: [160, 170]
```

---

## 3 — Settings (`app/(app)/settings/page.tsx` + `app/api/settings/route.ts` + `app/(app)/layout.tsx`)

### Settings page
Add a new "Training Zones" section below the existing HR zones section with two sub-sections:

**Pace Zones** (3 zones: Easy / Tempo / Threshold)
- Two text inputs labelled "Easy → Tempo boundary" and "Tempo → Threshold boundary"
- Display values in the user's unit (min/km or min/mile), with the label adapting to the unit
- On load: convert stored m/s → pace string using `formatPace()` from `lib/units.ts`
- On save: parse pace string back to m/s using the inverse of `formatPace()` (add a new `parsePace(str, units): number` helper to `lib/units.ts`)

**Cadence Zones** (3 zones: Low / Mid / High)
- Two number inputs labelled "Low → Mid boundary (spm)" and "Mid → High boundary (spm)"
- Values stored directly in spm, no conversion needed

### Settings API (`app/api/settings/route.ts`)
Accept and persist `paceZoneBoundaries` and `cadenceZoneBoundaries` in the `PATCH` handler (both as `Json?` / array).

### Layout (`app/(app)/layout.tsx`)
Add `paceZoneBoundaries` and `cadenceZoneBoundaries` to the `user` select query and the `preferences` object passed to `AppShell`.

---

## 4 — New Analytics API (`app/api/analytics/route.ts`)

**`GET /api/analytics?limit=50&type=activities`**

Returns the last `limit` records of the requested type for the authenticated user, ordered by startTime desc.

**For `type=activities`:**
```typescript
activities: Array<{
  id, startTime, avgSpeed, avgPower, avgCadence, avgHeartRate, efficiencyScore
}>
```

**For `type=laps`:**
```typescript
laps: Array<{
  id, activityId, startTime,   // startTime from parent activity
  avgSpeed, avgPower, avgCadence, avgHeartRate, efficiencyScore
}>
```

Filter out rows where `efficiencyScore` is null (Charts 1/3/4). For Chart 2, filter where `avgPower` is null. The client receives all fields and filters for specific charts as needed.

For laps, join through `activity` to get `startTime`:
```typescript
db.lap.findMany({
  where: { activity: { userId } },
  orderBy: { activity: { startTime: 'desc' } },
  take: limit,
  include: { activity: { select: { startTime: true } } }
})
```

---

## 5 — Dashboard (`app/(app)/dashboard/page.tsx`)

Move the following from the current `/trends` page into the dashboard:
- Period selector chips (1m / 3m / 6m / 1y)
- Baseline vs recent metrics comparison table
- Sparklines grid (4 metrics: Distance, Pace, HR, Efficiency)

The dashboard currently fetches its own DB data. Extend the existing query to also compute `recentRuns`, `baselineAverages`, `allRunsForSparkline` (the same logic as the current `/trends` page server-side query — copy and consolidate). The three existing dashboard charts (Weekly Mileage, Efficiency Trend, HR Zones) remain on the dashboard.

---

## 6 — Trends Page (`app/(app)/trends/page.tsx`)

Replace the entire page content with the analytics view. The page becomes a **client component** (`"use client"`).

**Layout:**
```
[Page title: "Analytics"]
[Global controls: N selector (10/25/50/100) | Laps / Runs toggle]

[Chart 1 — Efficiency Statistical Bands]
[Chart 2 — Speed vs Power]
[Chart 3 — Efficiency by Pace Zone (3 stacked panels)]
[Chart 4 — Efficiency by Cadence Zone (3 stacked panels)]
```

**Data fetching:** Two `useEffect` / `fetch` calls triggered when N or laps/runs toggle changes:
1. Fetch `/api/analytics?limit=${n}&type=${dataType}` → used by Charts 1 and 2
2. Fetch `/api/analytics?limit=${n}&type=laps` → used by Charts 3 and 4

Charts 3/4 always use laps. Charts 1/2 use the selected data type.

**Zone boundaries:** Passed in from the `UserPreferencesContext` (already available via `usePreferences()`).

---

## 7 — Chart Components

### `components/charts/EfficiencyBandChart.tsx` (Chart 1)

**Props:**
```typescript
interface Props {
  data: Array<{ startTime: string; efficiencyScore: number }>  // all N points
  units: Units
}
```

**Logic (computed inside component):**
- Sort by startTime ascending
- Compute `mean` and `sd` of all efficiencyScore × 1000
- Take last 10 points as the "recent dots" to plot
- Render a Recharts `ComposedChart`:
  - `ReferenceArea y1={mean-2*sd} y2={mean+2*sd}` — light fill (outer band)
  - `ReferenceArea y1={mean-sd} y2={mean+sd}` — medium fill (inner band)
  - `ReferenceLine y={mean}` — dashed center line
  - `Scatter` (or `Line` with dots only) for the last 10 points, X = date, Y = efficiency × 1000
- XAxis: `dataKey="startTime"` formatted as short date
- YAxis: labeled "Efficiency Score (×1000)"
- Tooltip: shows date + efficiency value to 2 decimal places

### `components/charts/SpeedPowerScatter.tsx` (Chart 2)

**Props:**
```typescript
interface Props {
  data: Array<{ startTime: string; avgSpeed: number; avgPower: number }>
  units: Units
}
```

**Render:** Recharts `ScatterChart`
- XAxis: speed in km/h or mph (= `avgSpeed × MS_TO_KMH` or `× MS_TO_MPH`). Label: "Speed (km/h)" or "(mph)".
- YAxis: avgPower in W. Label: "Power (W)".
- Tooltip: shows speed as pace (using `formatPace()`), power in W, both to 2 decimal places.
- Each point is one run or lap.

### `components/charts/ZoneEfficiencyChart.tsx` (Charts 3 & 4)

**Props:**
```typescript
interface Props {
  data: Array<{ startTime: string; efficiencyScore: number; classifyValue: number }>
  // classifyValue = avgSpeed (Chart 3) or avgCadence (Chart 4)
  zoneBoundaries: [number, number]
  zoneLabels: [string, string, string]   // e.g. ["Easy", "Tempo", "Threshold"]
  yLabel: string
  units: Units
}
```

**Logic:**
- Classify each lap into zone 0/1/2 based on `classifyValue` vs `zoneBoundaries`
  - Zone 0 (easy/low): classifyValue < boundary[0]
  - Zone 1 (tempo/mid): boundary[0] ≤ classifyValue < boundary[1]
  - Zone 2 (threshold/high): classifyValue ≥ boundary[1]
  - **Note for pace zones:** Since higher speed = lower pace number (faster), invert:
    - Easy = avgSpeed < boundary[0], Tempo = boundary[0]–boundary[1], Threshold = avgSpeed > boundary[1]
- Compute global Y domain across all 3 zones: `[globalMin, globalMax]` of efficiency × 1000
- Render 3 `ResponsiveContainer > LineChart` stacked vertically with equal heights (~160px each)
- All 3 share the same `domain={[globalMin, globalMax]}` on the YAxis
- XAxis on all 3 (date); only show XAxis tick labels on the bottom chart to save space
- Each panel has a label in the top-left (zone name + point count)
- Tooltip: date + efficiency × 1000 to 2 decimal places

---

## 8 — `lib/units.ts` Addition

Add `parsePace(str: string, units: Units): number` — inverse of `formatPace`:
- Input: "8:00" (string in min:sec format)
- Output: m/s speed value
- For metric: `1000 / (minutes * 60 + seconds)` m/s
- For imperial: `1609.34 / (minutes * 60 + seconds)` m/s

---

## File Summary

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `paceZoneBoundaries Json?`, `cadenceZoneBoundaries Json?` to User |
| `types/preferences.ts` | Add two new fields + defaults |
| `app/(app)/layout.tsx` | Fetch + pass new preference fields |
| `app/api/settings/route.ts` | Accept + save new zone fields |
| `app/(app)/settings/page.tsx` | Add "Training Zones" section with 4 inputs |
| `app/(app)/dashboard/page.tsx` | Add period selector + metrics table + sparklines (moved from trends) |
| `app/(app)/trends/page.tsx` | Replace with 4-chart analytics view (client component) |
| `lib/units.ts` | Add `parsePace()` helper |
| `app/api/analytics/route.ts` | **New** — parameterized activity/lap data endpoint |
| `components/charts/EfficiencyBandChart.tsx` | **New** — Chart 1 |
| `components/charts/SpeedPowerScatter.tsx` | **New** — Chart 2 |
| `components/charts/ZoneEfficiencyChart.tsx` | **New** — Charts 3 & 4 (reused for both) |

---

## Verification

1. `npx tsc --noEmit` — no type errors
2. `npm run build` — clean build
3. Open `/settings` → Training Zones section appears → enter pace/cadence boundaries → save → verify DB fields updated
4. Open `/dashboard` → period selector, metrics table, and sparklines appear alongside existing charts
5. Open `/trends` → global N selector and Laps/Runs toggle visible
6. With power data available:
   - Chart 1: bands appear, last 10 dots plotted
   - Chart 2: scatter points appear with pace tooltip
   - Charts 3/4: 3 stacked panels each with data in the appropriate zones
7. Change N from 50 → 10 → charts re-fetch and update
8. Toggle Laps → Runs on Charts 1/2 → data changes; Charts 3/4 remain on laps (toggle visually disabled)
9. Hover a point — tooltip shows value to ≤2 decimal places with unit label
10. Efficiency values display as ×1000 (e.g. "15.23" not "0.01523")
