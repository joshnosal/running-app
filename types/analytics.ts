export interface ActivityRecord {
  id: string;
  startTime: string;
  totalDistance: number;
  avgSpeed: number;
  avgCadence: number | null;
  avgPower: number | null;
}

export interface LapRecord {
  id: string;
  activityId: string;
  lapNumber: number;
  /** Parent activity's startTime (ISO string) */
  startTime: string;
  totalDistance: number;
  avgSpeed: number;
  avgCadence: number | null;
  avgPower: number | null;
}
