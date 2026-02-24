import FitParser from "fit-file-parser";
import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import type { FitData, FitSession, FitLap } from "@/types/fit";
import { getZoneBoundaries, getZoneForHR, type ZoneBoundaries } from "@/lib/hr-zones";
import { db } from "@/lib/db";

const SEMICIRCLE_TO_DEG = 180 / Math.pow(2, 31);

function semiToDeg(semi: number | undefined): number | null {
  if (semi == null) return null;
  return semi * SEMICIRCLE_TO_DEG;
}

function parseFitBuffer(buffer: Buffer<ArrayBuffer>): Promise<FitData> {
  return new Promise((resolve, reject) => {
    const parser = new FitParser({
      force: true,
      speedUnit: "m/s",
      lengthUnit: "m",
      temperatureUnit: "celsius",
      elapsedRecordField: true,
      mode: "cascade",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parser.parse(buffer.buffer as ArrayBuffer, (error: any, data: any) => {
      if (error) reject(new Error(String(error)));
      else resolve(data as FitData);
    });
  });
}

function computeZoneTimesFromLaps(
  laps: FitLap[],
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
): Promise<{ activityId: string; isDuplicate: boolean }> {
  const fileHash = createHash("sha256").update(fileBuffer).digest("hex");

  // Check for duplicate
  const existing = await db.activity.findUnique({ where: { fileHash } });
  if (existing) {
    return { activityId: existing.id, isDuplicate: true };
  }

  const fitData = await parseFitBuffer(fileBuffer);

  const session: FitSession = fitData.sessions?.[0] ?? {};
  const laps: FitLap[] = fitData.laps ?? [];

  const boundaries = getZoneBoundaries(user);

  // HR zone times — use from session message if present, else compute from laps
  let hrZoneTimes: number[] | null = null;
  if (session.time_in_hr_zone && session.time_in_hr_zone.length >= 5) {
    hrZoneTimes = session.time_in_hr_zone.slice(0, 5);
  } else {
    hrZoneTimes = computeZoneTimesFromLaps(laps, boundaries);
  }

  const avgSpeed = session.avg_speed ?? 0;
  const avgPower = session.avg_power ?? null;
  const efficiencyScore =
    avgPower && avgPower > 0 ? avgSpeed / avgPower : null;

  const startTime = session.start_time ?? new Date();
  const elapsedTime = session.total_elapsed_time ?? session.total_timer_time ?? 0;
  const endTime = new Date(startTime.getTime() + elapsedTime * 1000);

  const activity = await db.activity.create({
    data: {
      userId: user.id,
      fileName,
      fileHash,
      sport: session.sport ?? "running",
      startTime,
      endTime,
      totalDistance: session.total_distance ?? 0,
      totalMovingTime: session.total_moving_time ?? session.total_timer_time ?? 0,
      totalElapsedTime: elapsedTime,
      totalCalories: session.total_calories ?? null,
      avgHeartRate: session.avg_heart_rate ?? null,
      maxHeartRate: session.max_heart_rate ?? null,
      avgSpeed,
      maxSpeed: session.max_speed ?? 0,
      avgCadence: session.avg_cadence ?? null,
      maxCadence: session.max_cadence ?? null,
      avgPower,
      maxPower: session.max_power ?? null,
      avgVerticalOscillation: session.avg_vertical_oscillation ?? null,
      avgGroundContactTime: session.avg_ground_contact_time ?? null,
      avgStrideLength: session.avg_stride_length ?? null,
      totalAscent: session.total_ascent ?? null,
      totalDescent: session.total_descent ?? null,
      hrZoneTimes: hrZoneTimes ?? Prisma.JsonNull,
      efficiencyScore,
    },
  });

  // Create laps
  if (laps.length > 0) {
    const lapData = laps.map((lap, index) => {
      const lapStart = lap.start_time ?? startTime;
      const lapElapsed = lap.total_elapsed_time ?? lap.total_timer_time ?? 0;
      const lapEnd = new Date(lapStart.getTime() + lapElapsed * 1000);

      const lapAvgSpeed = lap.avg_speed ?? 0;
      const lapAvgPower = lap.avg_power ?? null;
      const lapEfficiency =
        lapAvgPower && lapAvgPower > 0 ? lapAvgSpeed / lapAvgPower : null;

      let lapHrZoneTimes: number[] | null = null;
      if (lap.time_in_hr_zone && lap.time_in_hr_zone.length >= 5) {
        lapHrZoneTimes = lap.time_in_hr_zone.slice(0, 5);
      }

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
        maxSpeed: lap.max_speed ?? 0,
        avgCadence: lap.avg_cadence ?? null,
        avgPower: lapAvgPower,
        maxPower: lap.max_power ?? null,
        avgVerticalOscillation: lap.avg_vertical_oscillation ?? null,
        avgGroundContactTime: lap.avg_ground_contact_time ?? null,
        avgStrideLength: lap.avg_stride_length ?? null,
        totalAscent: lap.total_ascent ?? null,
        totalDescent: lap.total_descent ?? null,
        startLat: semiToDeg(lap.start_position_lat ?? undefined),
        startLng: semiToDeg(lap.start_position_long ?? undefined),
        endLat: semiToDeg(lap.end_position_lat ?? undefined),
        endLng: semiToDeg(lap.end_position_long ?? undefined),
        hrZoneTimes: lapHrZoneTimes ?? Prisma.JsonNull,
        efficiencyScore: lapEfficiency,
      };
    });

    await db.lap.createMany({ data: lapData });
  }

  return { activityId: activity.id, isDuplicate: false };
}
