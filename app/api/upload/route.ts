import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { auth } from "@/lib/auth";
import { parseFitFile } from "@/lib/fit-parser";
import { headers } from "next/headers";

export interface UploadFileResult {
  fileName: string;
  status: "imported" | "duplicate" | "skipped" | "error";
  activityId?: string;
  sport?: string;
  startTime?: string; // ISO string
  reason?: string;    // for skipped
  error?: string;     // for errors
}

interface UserForParsing {
  id: string;
  maxHeartRate?: number | null;
  hrZoneMode?: string | null;
  hrZoneBoundaries?: unknown;
}

async function extractFitBuffers(
  buffer: Buffer<ArrayBuffer>,
  fileName: string
): Promise<{ name: string; buffer: Buffer<ArrayBuffer> }[]> {
  if (fileName.toLowerCase().endsWith(".fit")) {
    return [{ name: fileName, buffer }];
  }

  if (fileName.toLowerCase().endsWith(".zip")) {
    const zip = await JSZip.loadAsync(buffer);
    const results: { name: string; buffer: Buffer<ArrayBuffer> }[] = [];

    for (const [path, entry] of Object.entries(zip.files)) {
      if (!entry.dir && path.toLowerCase().endsWith(".fit")) {
        const content = await entry.async("arraybuffer");
        results.push({
          name: path.split("/").pop() ?? path,
          buffer: Buffer.from(content) as Buffer<ArrayBuffer>,
        });
      }
    }

    return results;
  }

  return [];
}

async function processFitBuffer(
  buffer: Buffer<ArrayBuffer>,
  fileName: string,
  user: UserForParsing
): Promise<UploadFileResult> {
  try {
    const result = await parseFitFile(buffer, fileName, user);

    if (result.status === "created") {
      return {
        fileName,
        status: "imported",
        activityId: result.activityId,
        sport: result.sport,
        startTime: result.startTime.toISOString(),
      };
    }

    if (result.status === "duplicate") {
      return {
        fileName,
        status: "duplicate",
        activityId: result.activityId,
        sport: result.sport,
        startTime: result.startTime.toISOString(),
      };
    }

    // skipped
    return { fileName, status: "skipped", reason: result.reason };
  } catch (error) {
    console.error(`FIT parse error for ${fileName}:`, error);
    return { fileName, status: "error", error: "Failed to parse FIT file" };
  }
}

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

  const userForParsing: UserForParsing = {
    id: user.id,
    maxHeartRate: user.maxHeartRate,
    hrZoneMode: user.hrZoneMode,
    hrZoneBoundaries: user.hrZoneBoundaries,
  };

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const files = formData.getAll("files") as File[];
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const invalidFiles = files.filter(
    (f) =>
      !f.name.toLowerCase().endsWith(".fit") &&
      !f.name.toLowerCase().endsWith(".zip")
  );
  if (invalidFiles.length > 0) {
    return NextResponse.json(
      {
        error: `Unsupported file type(s): ${invalidFiles.map((f) => f.name).join(", ")}. Only .fit and .zip files are accepted.`,
      },
      { status: 400 }
    );
  }

  // Build results grouped by the original uploaded filename
  const fileResults: Record<string, UploadFileResult[]> = {};

  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer) as Buffer<ArrayBuffer>;
    fileResults[file.name] = [];

    let extracted: { name: string; buffer: Buffer<ArrayBuffer> }[];
    try {
      extracted = await extractFitBuffers(buffer, file.name);
    } catch {
      fileResults[file.name].push({
        fileName: file.name,
        status: "error",
        error: "Failed to open file",
      });
      continue;
    }

    if (extracted.length === 0) {
      fileResults[file.name].push({
        fileName: file.name,
        status: "error",
        error: "No .fit files found inside zip",
      });
      continue;
    }

    for (const { name, buffer: fitBuffer } of extracted) {
      const result = await processFitBuffer(fitBuffer, name, userForParsing);
      fileResults[file.name].push(result);
    }
  }

  const allResults = Object.values(fileResults).flat();
  const hasNew = allResults.some((r) => r.status === "imported");
  const allErrors = allResults.every((r) => r.status === "error");
  const status = allErrors ? 422 : hasNew ? 201 : 200;

  return NextResponse.json({ fileResults }, { status });
}
