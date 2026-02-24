export type ZoneBoundaries = [number, number, number, number, number];

interface UserZoneConfig {
  maxHeartRate?: number | null;
  hrZoneMode?: string | null;
  hrZoneBoundaries?: unknown;
}

/**
 * Returns [z1Max, z2Max, z3Max, z4Max, z5Max] BPM values.
 * z5Max is set to 300 (effectively unlimited).
 */
export function getZoneBoundaries(user: UserZoneConfig): ZoneBoundaries {
  if (user.hrZoneMode === "custom" && user.hrZoneBoundaries) {
    const boundaries = user.hrZoneBoundaries as number[];
    if (Array.isArray(boundaries) && boundaries.length === 4) {
      return [
        boundaries[0],
        boundaries[1],
        boundaries[2],
        boundaries[3],
        300,
      ];
    }
  }

  const maxHR = user.maxHeartRate ?? 185;
  return [
    Math.round(maxHR * 0.6),
    Math.round(maxHR * 0.7),
    Math.round(maxHR * 0.8),
    Math.round(maxHR * 0.9),
    300,
  ];
}

/**
 * Returns which zone (1-5) a given HR value falls into.
 */
export function getZoneForHR(
  hr: number,
  boundaries: ZoneBoundaries
): 1 | 2 | 3 | 4 | 5 {
  if (hr <= boundaries[0]) return 1;
  if (hr <= boundaries[1]) return 2;
  if (hr <= boundaries[2]) return 3;
  if (hr <= boundaries[3]) return 4;
  return 5;
}

/**
 * Returns readable zone ranges as strings e.g. "< 111 bpm"
 */
export function getZoneLabels(
  boundaries: ZoneBoundaries
): Array<{ zone: number; label: string }> {
  return [
    { zone: 1, label: `< ${boundaries[0]} bpm` },
    { zone: 2, label: `${boundaries[0]}–${boundaries[1]} bpm` },
    { zone: 3, label: `${boundaries[1]}–${boundaries[2]} bpm` },
    { zone: 4, label: `${boundaries[2]}–${boundaries[3]} bpm` },
    { zone: 5, label: `> ${boundaries[3]} bpm` },
  ];
}
