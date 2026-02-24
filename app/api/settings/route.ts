import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";

export async function PATCH(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, units, maxHeartRate, hrZoneMode, hrZoneBoundaries } = body;

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (units !== undefined) updateData.units = units;
  if (maxHeartRate !== undefined) updateData.maxHeartRate = maxHeartRate;
  if (hrZoneMode !== undefined) updateData.hrZoneMode = hrZoneMode;
  if (hrZoneBoundaries !== undefined)
    updateData.hrZoneBoundaries = hrZoneBoundaries;

  const updated = await db.user.update({
    where: { id: session.user.id },
    data: updateData,
    select: {
      id: true,
      name: true,
      email: true,
      units: true,
      maxHeartRate: true,
      hrZoneMode: true,
      hrZoneBoundaries: true,
    },
  });

  return NextResponse.json(updated);
}
