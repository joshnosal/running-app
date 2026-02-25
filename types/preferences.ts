export type Units = "metric" | "imperial";
export type ThemePreference = "light" | "dark" | "system";
export type HRZoneMode = "formula" | "custom";

export interface UserPreferences {
  units: Units;
  theme: ThemePreference;
  maxHeartRate: number;
  hrZoneMode: HRZoneMode;
  hrZoneBoundaries: number[] | null;
  paceZoneBoundaries: [number, number] | null;
  cadenceZoneBoundaries: [number, number] | null;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  units: "metric",
  theme: "system",
  maxHeartRate: 185,
  hrZoneMode: "formula",
  hrZoneBoundaries: null,
  paceZoneBoundaries: [3.35, 4.47],
  cadenceZoneBoundaries: [160, 170],
};
