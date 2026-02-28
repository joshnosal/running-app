import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 200);
  const type = searchParams.get("type") ?? "activities";

  if (type === "laps") {
    // ?runs=N returns ALL laps for the N most-recent activities (two queries).
    // ?limit=N returns the N most-recent individual laps (original behaviour).
    const runsParam = searchParams.get("runs");
    if (runsParam) {
      const runsLimit = Math.min(parseInt(runsParam, 10) || 10, 200);

      const recentActivities = await db.activity.findMany({
        where: { userId: session.user.id },
        orderBy: { startTime: "desc" },
        take: runsLimit,
        select: { id: true },
      });
      type RecentActivityId = typeof recentActivities[number];

      const activityIds = recentActivities.map((a: RecentActivityId) => a.id);

      const laps = await db.lap.findMany({
        where: { activityId: { in: activityIds }, totalDistance: { gte: 25 } },
        orderBy: [{ activity: { startTime: "desc" } }, { lapNumber: "asc" }],
        include: { activity: { select: { startTime: true } } },
      });
      type LapRow = typeof laps[number];

      return NextResponse.json({
        laps: laps.map((lap: LapRow) => ({
          id: lap.id,
          activityId: lap.activityId,
          lapNumber: lap.lapNumber,
          startTime: lap.activity.startTime.toISOString(),
          totalDistance: lap.totalDistance,
          avgSpeed: lap.avgSpeed,
          avgPower: lap.avgPower,
          avgCadence: lap.avgCadence,
          avgHeartRate: lap.avgHeartRate,
          efficiencyScore: lap.efficiencyScore,
        })),
      });
    }

    const laps = await db.lap.findMany({
      where: { activity: { userId: session.user.id }, totalDistance: { gte: 25 } },
      orderBy: [{ activity: { startTime: "desc" } }, { lapNumber: "asc" }],
      take: limit,
      include: { activity: { select: { startTime: true } } },
    });
    type LapRow = typeof laps[number];

    return NextResponse.json({
      laps: laps.map((lap: LapRow) => ({
        id: lap.id,
        activityId: lap.activityId,
        lapNumber: lap.lapNumber,
        startTime: lap.activity.startTime.toISOString(),
        totalDistance: lap.totalDistance,
        avgSpeed: lap.avgSpeed,
        avgPower: lap.avgPower,
        avgCadence: lap.avgCadence,
        avgHeartRate: lap.avgHeartRate,
        efficiencyScore: lap.efficiencyScore,
      })),
    });
  }

  // type === "activities"
  const activities = await db.activity.findMany({
    where: { userId: session.user.id },
    orderBy: { startTime: "desc" },
    take: limit,
    select: {
      id: true,
      startTime: true,
      totalDistance: true,
      avgSpeed: true,
      avgPower: true,
      avgCadence: true,
      avgHeartRate: true,
      efficiencyScore: true,
    },
  });
  type ActivityRow = typeof activities[number];

  return NextResponse.json({
    activities: activities.map((a: ActivityRow) => ({
      id: a.id,
      startTime: a.startTime.toISOString(),
      totalDistance: a.totalDistance,
      avgSpeed: a.avgSpeed,
      avgPower: a.avgPower,
      avgCadence: a.avgCadence,
      avgHeartRate: a.avgHeartRate,
      efficiencyScore: a.efficiencyScore,
    })),
  });
}
