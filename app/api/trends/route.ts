import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";

function periodToDate(period: string): Date {
  const now = new Date();
  switch (period) {
    case "3m":
      return new Date(now.setMonth(now.getMonth() - 3));
    case "6m":
      return new Date(now.setMonth(now.getMonth() - 6));
    case "1y":
      return new Date(now.setFullYear(now.getFullYear() - 1));
    default:
      return new Date(now.setMonth(now.getMonth() - 1));
  }
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") ?? "1m";
  const since = periodToDate(period);

  const allInPeriod = await db.activity.findMany({
    where: {
      userId: session.user.id,
      startTime: { gte: since },
    },
    orderBy: { startTime: "asc" },
    select: {
      id: true,
      startTime: true,
      totalDistance: true,
      totalMovingTime: true,
      avgHeartRate: true,
      avgCadence: true,
      avgPower: true,
      efficiencyScore: true,
      avgVerticalOscillation: true,
      avgGroundContactTime: true,
      avgSpeed: true,
    },
  });

  // Last 5 runs
  const recentRuns = allInPeriod.slice(-5);
  // All except the last 5 form the baseline
  const baselineRuns = allInPeriod.slice(0, Math.max(0, allInPeriod.length - 5));

  function avg(arr: (number | null | undefined)[]): number | null {
    const valid = arr.filter((v): v is number => v != null);
    if (valid.length === 0) return null;
    return valid.reduce((a, b) => a + b, 0) / valid.length;
  }

  const baselineAverages =
    baselineRuns.length > 0
      ? {
          totalDistance: avg(baselineRuns.map((r) => r.totalDistance)),
          totalMovingTime: avg(baselineRuns.map((r) => r.totalMovingTime)),
          avgHeartRate: avg(baselineRuns.map((r) => r.avgHeartRate)),
          avgCadence: avg(baselineRuns.map((r) => r.avgCadence)),
          avgPower: avg(baselineRuns.map((r) => r.avgPower)),
          efficiencyScore: avg(baselineRuns.map((r) => r.efficiencyScore)),
          avgVerticalOscillation: avg(
            baselineRuns.map((r) => r.avgVerticalOscillation)
          ),
          avgGroundContactTime: avg(
            baselineRuns.map((r) => r.avgGroundContactTime)
          ),
          avgSpeed: avg(baselineRuns.map((r) => r.avgSpeed)),
        }
      : null;

  // Sparkline: up to last 20 runs in period
  const sparklineRuns = allInPeriod.slice(-20);

  return NextResponse.json({
    recentRuns,
    baselineAverages,
    allRunsForSparkline: sparklineRuns,
    period,
  });
}
