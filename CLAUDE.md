# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start development server (localhost:3000)
npm run build        # Production build
npx tsc --noEmit     # Type-check without emitting
npx prisma db push   # Push schema changes to DB (no migration files)
npx prisma studio    # GUI DB explorer
```

## Architecture

This is a **running analytics app** that ingests Garmin `.fit` files and visualizes training data.

### Route Groups
- `app/(auth)/` — sign-in, sign-up pages (public)
- `app/(app)/` — protected routes; `layout.tsx` is a server component that validates session via Better Auth and redirects to `/sign-in` if unauthenticated
- `app/api/` — REST endpoints: `upload`, `activities`, `activities/[id]`, `analytics`, `settings/preferences`, `settings/units`, `auth`

### Auth & Session
- Better Auth v1 handles sessions. Server-side: `auth.api.getSession({ headers: await headers() })`. Client-side: `authClient` from `lib/auth-client.ts`.
- The `app/(app)/layout.tsx` is the single auth gate — it fetches user preferences from DB and passes them as `initialPreferences` to `AppShell`.

### Theme & Preferences
- `AppShell.tsx` is a client component that wraps `UserPreferencesProvider` (context) + `ThemedShell` (reads context, creates MUI theme).
- `layout.tsx` must stay a server component for the auth guard — `AppShell` handles the client boundary.
- `useUserPreferences()` hook is available in any client component under `app/(app)/`.
- Settings changes call `updatePreferences()` from the context for immediate effect without page reload.

### Database (Prisma v7)
- `datasource db` in `schema.prisma` has **no `url` field** — connection URL lives in `prisma.config.ts`.
- `lib/db.ts` uses `new PrismaPg({ connectionString })` adapter — required for Prisma v7.
- Use `Prisma.JsonNull` (not `null`) for nullable JSON fields like `hrZoneTimes`.
- Models: `User`, `Session`, `Account`, `Verification`, `Activity`, `Lap`.

### FIT File Ingestion
- `lib/fit-parser.ts` — parses `.fit` buffers into DB records. FIT parser runs in `cascade` mode; sessions are nested under `activity`.
- Duplicate detection uses SHA-256 hash of file content (`fileHash` unique constraint on `Activity`).
- Only `sport === "running"` activities are stored; others return `status: "skipped"`.
- `api/upload/route.ts` accepts `.fit` or `.zip` files (multi-file supported). Returns `{ fileResults: Record<filename, UploadFileResult[]> }`.

### Units & HR Zones
- All speeds stored as **m/s**, distances as **meters** in DB. `lib/units.ts` provides formatting helpers for display.
- HR zones computed via `lib/hr-zones.ts`: either formula-based (% of `maxHeartRate`) or custom boundaries stored as JSON in User.
- `ActivityFilters` component stores `distMin`/`distMax` filter values in URL params as meters.

### Charts
- Two implementations exist in parallel: **Recharts** (original) and **D3** (newer, being built out).
- Recharts charts: `WeeklyMileageChart`, `EfficiencyTrendChart`, `HRZoneChart`, `MetricSparkline`, `SpeedPowerScatter`, `EfficiencyBandChart`, `ZoneEfficiencyChart`.
- D3 charts: `D3PaceZoneChart`, `D3EfficiencyBandChart`, `D3SpeedPowerScatter`, `D3CadenceZoneChart`.
- The Trends page (`app/(app)/trends/page.tsx`) currently renders both versions side-by-side for comparison.

## Key Gotchas

- Recharts `Tooltip` formatter must use untyped `(v) =>` signatures — value can be `undefined` at runtime.
- `fit-file-parser` callback types are loose — use `any` casts where needed.
- `file.arrayBuffer()` result must be cast to `Buffer<ArrayBuffer>` before passing to fit-parser.
- `app/(app)/layout.tsx` must remain a server component — do not add `"use client"` to it.
