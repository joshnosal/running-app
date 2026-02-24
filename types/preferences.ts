export type Units = "metric" | "imperial";
export type ThemePreference = "light" | "dark" | "system";
export type HRZoneMode = "formula" | "custom";

export interface UserPreferences {
  units: Units;
  theme: ThemePreference;
  maxHeartRate: number;
  hrZoneMode: HRZoneMode;
  hrZoneBoundaries: number[] | null;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  units: "metric",
  theme: "system",
  maxHeartRate: 185,
  hrZoneMode: "formula",
  hrZoneBoundaries: null,
};
