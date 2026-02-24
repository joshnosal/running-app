import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const sortField = searchParams.get("sort") ?? "startTime";
  const sortOrder = searchParams.get("order") ?? "desc";
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where = {
    userId: session.user.id,
    ...(from || to
      ? {
          startTime: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {}),
  };

  const validSortFields = [
    "startTime",
    "totalDistance",
    "totalMovingTime",
    "avgHeartRate",
    "efficiencyScore",
  ];
  const orderByField = validSortFields.includes(sortField) ? sortField : "startTime";

  const [activities, total] = await Promise.all([
    db.activity.findMany({
      where,
      orderBy: { [orderByField]: sortOrder === "asc" ? "asc" : "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        fileName: true,
        sport: true,
        startTime: true,
        endTime: true,
        totalDistance: true,
        totalMovingTime: true,
        totalElapsedTime: true,
        totalCalories: true,
        avgHeartRate: true,
        maxHeartRate: true,
        avgSpeed: true,
        avgPower: true,
        efficiencyScore: true,
        avgCadence: true,
        totalAscent: true,
        totalDescent: true,
        createdAt: true,
      },
    }),
    db.activity.count({ where }),
  ]);

  return NextResponse.json({ activities, total, page, limit });
}
