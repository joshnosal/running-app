import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseFitFile } from "@/lib/fit-parser";
import { headers } from "next/headers";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as typeof session.user & {
    maxHeartRate?: number | null;
    hrZoneMode?: string | null;
    hrZoneBoundaries?: unknown;
  };

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith(".fit")) {
    return NextResponse.json(
      { error: "Only .fit files are supported" },
      { status: 400 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer) as Buffer<ArrayBuffer>;

  try {
    const result = await parseFitFile(buffer, file.name, {
      id: user.id,
      maxHeartRate: user.maxHeartRate,
      hrZoneMode: user.hrZoneMode,
      hrZoneBoundaries: user.hrZoneBoundaries,
    });

    if (result.isDuplicate) {
      return NextResponse.json(
        { message: "Duplicate file — activity already exists", activityId: result.activityId, isDuplicate: true },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { message: "Activity uploaded successfully", activityId: result.activityId, isDuplicate: false },
      { status: 201 }
    );
  } catch (error) {
    console.error("FIT parse error:", error);
    return NextResponse.json(
      { error: "Failed to parse FIT file" },
      { status: 422 }
    );
  }
}
