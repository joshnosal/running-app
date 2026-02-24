export type Units = "metric" | "imperial";

const M_TO_KM = 0.001;
const M_TO_MI = 0.000621371;
const M_TO_FT = 3.28084;
const MS_TO_KMH = 3.6;
const MS_TO_MPH = 2.23694;

export function formatDistance(m: number, units: Units): string {
  if (units === "imperial") {
    return `${(m * M_TO_MI).toFixed(2)} mi`;
  }
  return `${(m * M_TO_KM).toFixed(2)} km`;
}

export function formatPace(mps: number, units: Units): string {
  if (mps <= 0) return "—";
  if (units === "imperial") {
    const secPerMile = 1609.34 / mps;
    return `${formatSecsToMinSec(secPerMile)} /mi`;
  }
  const secPerKm = 1000 / mps;
  return `${formatSecsToMinSec(secPerKm)} /km`;
}

function formatSecsToMinSec(totalSecs: number): string {
  const mins = Math.floor(totalSecs / 60);
  const secs = Math.round(totalSecs % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatSpeed(mps: number, units: Units): string {
  if (units === "imperial") {
    return `${(mps * MS_TO_MPH).toFixed(1)} mph`;
  }
  return `${(mps * MS_TO_KMH).toFixed(1)} km/h`;
}

export function formatElevation(m: number, units: Units): string {
  if (units === "imperial") {
    return `${Math.round(m * M_TO_FT)} ft`;
  }
  return `${Math.round(m)} m`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function metersToDisplayDistance(m: number, units: Units): number {
  return units === "imperial" ? m * M_TO_MI : m * M_TO_KM;
}

export function distanceUnitLabel(units: Units): string {
  return units === "imperial" ? "mi" : "km";
}
