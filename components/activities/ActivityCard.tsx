import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardActionArea from "@mui/material/CardActionArea";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import FavoriteIcon from "@mui/icons-material/Favorite";
import SpeedIcon from "@mui/icons-material/Speed";
import { formatDistance, formatPace, formatDuration } from "@/lib/units";
import type { Units } from "@/lib/units";

interface ActivityCardProps {
  activity: {
    id: string;
    startTime: Date | string;
    totalDistance: number;
    totalMovingTime: number;
    avgHeartRate?: number | null;
    avgSpeed: number;
    sport: string;
    efficiencyScore?: number | null;
  };
  units: Units;
  onClick?: () => void;
}

export default function ActivityCard({
  activity,
  units,
  onClick,
}: ActivityCardProps) {
  const date = new Date(activity.startTime);

  return (
    <Card>
      <CardActionArea onClick={onClick}>
        <CardContent>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {date.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </Typography>
            <Chip label={activity.sport} size="small" />
          </Box>
          <Typography variant="h6">
            {formatDistance(activity.totalDistance, units)}
          </Typography>
          <Box sx={{ display: "flex", gap: 2, mt: 1 }}>
            <Typography variant="body2">
              {formatDuration(activity.totalMovingTime)}
            </Typography>
            <Typography variant="body2">
              {formatPace(activity.avgSpeed, units)}
            </Typography>
            {activity.avgHeartRate && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <FavoriteIcon sx={{ fontSize: 14, color: "error.main" }} />
                <Typography variant="body2">
                  {activity.avgHeartRate} bpm
                </Typography>
              </Box>
            )}
            {activity.efficiencyScore && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <SpeedIcon sx={{ fontSize: 14, color: "primary.main" }} />
                <Typography variant="body2">
                  {activity.efficiencyScore.toFixed(4)}
                </Typography>
              </Box>
            )}
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
