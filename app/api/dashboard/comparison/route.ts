import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

function periodToDate(period: string): Date {
  const now = new Date();
  switch (period) {
    case "3m": return new Date(now.setMonth(now.getMonth() - 3));
    case "6m": return new Date(now.setMonth(now.getMonth() - 6));
    case "1y": return new Date(now.setFullYear(now.getFullYear() - 1));
    default:   return new Date(now.setMonth(now.getMonth() - 1));
  }
}

function avg(arr: (number | null | undefined)[]): number | null {
  const valid = arr.filter((v): v is number => v != null);
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

const select = {
  id: true,
  startTime: true,
  totalDistance: true,
  avgSpeed: true,
  avgHeartRate: true,
  efficiencyScore: true,
} as const;

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") ?? "1m";
  const since = periodToDate(period);

  const [allInPeriod, recentTen] = await Promise.all([
    db.activity.findMany({
      where: { userId: session.user.id, startTime: { gte: since } },
      orderBy: { startTime: "asc" },
      select,
    }),
    db.activity.findMany({
      where: { userId: session.user.id },
      orderBy: { startTime: "desc" },
      take: 10,
      select,
    }),
  ]);
  type PeriodActivity = typeof allInPeriod[number];

  const baseline = allInPeriod.length > 0 ? {
    totalDistance: avg(allInPeriod.map((r: PeriodActivity) => r.totalDistance)),
    avgSpeed:      avg(allInPeriod.map((r: PeriodActivity) => r.avgSpeed)),
    avgHeartRate:  avg(allInPeriod.map((r: PeriodActivity) => r.avgHeartRate)),
    efficiencyScore: avg(allInPeriod.map((r: PeriodActivity) => r.efficiencyScore)),
  } : null;

  return NextResponse.json({
    baseline,
    recentRuns: recentTen,
    periodCount: allInPeriod.length,
  });
}
