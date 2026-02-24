"use client";

import { useRouter } from "next/navigation";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ActivityCard from "./ActivityCard";
import type { Units } from "@/lib/units";

interface Activity {
  id: string;
  startTime: Date | string;
  totalDistance: number;
  totalMovingTime: number;
  avgHeartRate?: number | null;
  avgSpeed: number;
  sport: string;
  efficiencyScore?: number | null;
}

interface ActivityListProps {
  activities: Activity[];
  units: Units;
}

export default function ActivityList({ activities, units }: ActivityListProps) {
  const router = useRouter();

  if (activities.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ textAlign: "center", py: 4 }}>
        No activities found. Upload a .fit file to get started.
      </Typography>
    );
  }

  return (
    <Stack spacing={1.5}>
      {activities.map((activity) => (
        <ActivityCard
          key={activity.id}
          activity={activity}
          units={units}
          onClick={() => router.push(`/activities/${activity.id}`)}
        />
      ))}
    </Stack>
  );
}
