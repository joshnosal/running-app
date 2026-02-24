import FitParser from "fit-file-parser";

// Derive types from the library's parseAsync return type rather than reaching into internals
type ParsedFit = Awaited<ReturnType<FitParser["parseAsync"]>>;
type ParsedSession = NonNullable<NonNullable<ParsedFit["activity"]>["sessions"]>[number];
type ParsedLap = NonNullable<ParsedFit["laps"]>[number];

import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { getZoneBoundaries, getZoneForHR, type ZoneBoundaries } from "@/lib/hr-zones";
import { db } from "@/lib/db";

export type ParseFitResult =
  | { status: "created"; activityId: string; startTime: Date; sport: string }
  | { status: "duplicate"; activityId: string; startTime: Date; sport: string }
  | { status: "skipped"; reason: string };

function computeZoneTimesFromLaps(
  laps: ParsedLap[],
  boundaries: ZoneBoundaries
): [number, number, number, number, number] {
  const times: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const lap of laps) {
    const hr = lap.avg_heart_rate;
    const duration = lap.total_moving_time ?? lap.total_timer_time ?? 0;
    if (hr && duration) {
      const zone = getZoneForHR(hr, boundaries);
      times[zone - 1] += duration;
    }
  }
  return times;
}

interface UserForParsing {
  id: string;
  maxHeartRate?: number | null;
  hrZoneMode?: string | null;
  hrZoneBoundaries?: unknown;
}

export async function parseFitFile(
  fileBuffer: Buffer<ArrayBuffer>,
  fileName: string,
  user: UserForParsing
): Promise<ParseFitResult> {
  const fileHash = createHash("sha256").update(fileBuffer).digest("hex");

  const existing = await db.activity.findUnique({
    where: { fileHash },
    select: { id: true, startTime: true, sport: true },
  });
  if (existing) {
    return {
      status: "duplicate",
      activityId: existing.id,
      startTime: existing.startTime,
      sport: existing.sport,
    };
  }

  const parser = new FitParser({
    force: true,
    speedUnit: "m/s",
    lengthUnit: "m",
    temperatureUnit: "celsius",
    elapsedRecordField: true,
    mode: "cascade",
  });

  const fitData = await parser.parseAsync(fileBuffer);

  // In cascade mode, sessions are nested under activity
  const session: ParsedSession = fitData.activity?.sessions?.[0] ?? ({} as ParsedSession);
  // Laps may appear at top level or nested under the session
  const laps: ParsedLap[] = fitData.laps ?? fitData.activity?.sessions?.[0]?.laps ?? [];

  // Reject non-running activities
  const sport = session.sport ?? "running";
  if (sport !== "running") {
    return {
      status: "skipped",
      reason: `Not a running activity (${sport})`,
    };
  }

  const boundaries = getZoneBoundaries(user);

  // HR zone times — use from session message if present, else approximate from lap averages
  let hrZoneTimes: number[] | null = null;
  if (session.time_in_hr_zone && session.time_in_hr_zone.length >= 5) {
    hrZoneTimes = session.time_in_hr_zone.slice(0, 5);
  } else {
    hrZoneTimes = computeZoneTimesFromLaps(laps, boundaries);
  }

  const avgSpeed = session.enhanced_avg_speed ?? session.avg_speed ?? 0;
  const avgPower = session.avg_power ?? null;
  const efficiencyScore = avgPower && avgPower > 0 ? avgSpeed / avgPower : null;

  const startTime = session.start_time ? new Date(session.start_time) : new Date();
  const elapsedTime = session.total_elapsed_time ?? session.total_timer_time ?? 0;
  const endTime = new Date(startTime.getTime() + elapsedTime * 1000);

  const activity = await db.activity.create({
    data: {
      userId: user.id,
      fileName,
      fileHash,
      sport,
      startTime,
      endTime,
      totalDistance: session.total_distance ?? 0,
      totalMovingTime: session.total_moving_time ?? session.total_timer_time ?? 0,
      totalElapsedTime: elapsedTime,
      totalCalories: session.total_calories ?? null,
      avgHeartRate: session.avg_heart_rate ?? null,
      maxHeartRate: session.max_heart_rate ?? null,
      avgSpeed,
      maxSpeed: session.enhanced_max_speed ?? session.max_speed ?? 0,
      avgCadence: session.avg_cadence ?? null,
      maxCadence: session.max_cadence ?? null,
      avgPower,
      maxPower: session.max_power ?? null,
      avgVerticalOscillation: session.avg_vertical_oscillation ?? null,
      avgGroundContactTime: session.avg_stance_time ?? null,
      avgStrideLength: session.avg_step_length ?? null,
      totalAscent: session.total_ascent ?? null,
      totalDescent: session.total_descent ?? null,
      hrZoneTimes: hrZoneTimes ?? Prisma.JsonNull,
      efficiencyScore,
    },
  });

  if (laps.length > 0) {
    const lapData = laps.map((lap, index) => {
      const lapStart = lap.start_time ? new Date(lap.start_time) : startTime;
      const lapElapsed = lap.total_elapsed_time ?? lap.total_timer_time ?? 0;
      const lapEnd = new Date(lapStart.getTime() + lapElapsed * 1000);

      const lapAvgSpeed = lap.enhanced_avg_speed ?? lap.avg_speed ?? 0;
      const lapAvgPower = lap.avg_power ?? null;
      const lapEfficiency =
        lapAvgPower && lapAvgPower > 0 ? lapAvgSpeed / lapAvgPower : null;

      const lapHrZoneTimes =
        lap.time_in_hr_zone && lap.time_in_hr_zone.length >= 5
          ? lap.time_in_hr_zone.slice(0, 5)
          : null;

      return {
        activityId: activity.id,
        lapNumber: index + 1,
        startTime: lapStart,
        endTime: lapEnd,
        totalDistance: lap.total_distance ?? 0,
        totalMovingTime: lap.total_moving_time ?? lap.total_timer_time ?? 0,
        avgHeartRate: lap.avg_heart_rate ?? null,
        maxHeartRate: lap.max_heart_rate ?? null,
        avgSpeed: lapAvgSpeed,
        maxSpeed: lap.enhanced_max_speed ?? lap.max_speed ?? 0,
        avgCadence: lap.avg_cadence ?? null,
        avgPower: lapAvgPower,
        maxPower: lap.max_power ?? null,
        avgVerticalOscillation: lap.avg_vertical_oscillation ?? null,
        avgGroundContactTime: lap.avg_stance_time ?? null,
        avgStrideLength: lap.avg_step_length ?? null,
        totalAscent: lap.total_ascent ?? null,
        totalDescent: lap.total_descent ?? null,
        startLat: lap.start_position_lat ?? null,
        startLng: lap.start_position_long ?? null,
        endLat: lap.end_position_lat ?? null,
        endLng: lap.end_position_long ?? null,
        hrZoneTimes: lapHrZoneTimes ?? Prisma.JsonNull,
        efficiencyScore: lapEfficiency,
      };
    });

    await db.lap.createMany({ data: lapData });
  }

  return { status: "created", activityId: activity.id, startTime, sport };
}
