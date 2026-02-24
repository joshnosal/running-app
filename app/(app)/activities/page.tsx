import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import ActivityList from "@/components/activities/ActivityList";
import ActivityFilters from "@/components/activities/ActivityFilters";
import type { Units } from "@/lib/units";

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    distMin?: string;
    distMax?: string;
    sort?: string;
    order?: string;
    page?: string;
  }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const user = session.user as typeof session.user & { units?: string };
  const units = (user.units ?? "metric") as Units;

  const params = await searchParams;
  const page = parseInt(params.page ?? "1");
  const limit = 20;
  const sortField = params.sort ?? "startTime";
  const sortOrder = params.order ?? "desc";

  const validSortFields = [
    "startTime",
    "totalDistance",
    "totalMovingTime",
    "avgHeartRate",
    "efficiencyScore",
  ];
  const orderByField = validSortFields.includes(sortField) ? sortField : "startTime";

  // distMin/distMax are stored in the URL as meters
  const distMin = params.distMin ? parseFloat(params.distMin) : undefined;
  const distMax = params.distMax ? parseFloat(params.distMax) : undefined;

  const where = {
    userId: session.user.id,
    ...(params.from || params.to
      ? {
          startTime: {
            ...(params.from ? { gte: new Date(params.from) } : {}),
            ...(params.to ? { lte: new Date(params.to) } : {}),
          },
        }
      : {}),
    ...(distMin !== undefined || distMax !== undefined
      ? {
          totalDistance: {
            ...(distMin !== undefined ? { gte: distMin } : {}),
            ...(distMax !== undefined ? { lte: distMax } : {}),
          },
        }
      : {}),
  };

  const activities = await db.activity.findMany({
    where,
    orderBy: { [orderByField]: sortOrder === "asc" ? "asc" : "desc" },
    skip: (page - 1) * limit,
    take: limit,
    select: {
      id: true,
      startTime: true,
      endTime: true,
      totalDistance: true,
      totalMovingTime: true,
      avgHeartRate: true,
      avgSpeed: true,
      sport: true,
      efficiencyScore: true,
    },
  });

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Activities
      </Typography>
      <ActivityFilters
        units={units}
        from={params.from}
        to={params.to}
        distMin={params.distMin}
        distMax={params.distMax}
      />
      <ActivityList activities={activities} units={units} />
    </Box>
  );
}
