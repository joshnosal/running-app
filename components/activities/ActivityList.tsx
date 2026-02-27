"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Checkbox from "@mui/material/Checkbox";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import CircularProgress from "@mui/material/CircularProgress";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import ActivityCard from "./ActivityCard";
import UploadDialog from "./UploadDialog";
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  function handleUploadClose(didImport: boolean) {
    setUploadOpen(false);
    if (didImport) router.refresh();
  }

  if (activities.length === 0) {
    return (
      <>
        <Box sx={{ textAlign: "center", py: 6 }}>
          <Typography color="text.secondary" gutterBottom>
            No activities found. Upload a .fit file to get started.
          </Typography>
          <Button
            variant="contained"
            startIcon={<UploadFileIcon />}
            onClick={() => setUploadOpen(true)}
            sx={{ mt: 1 }}
          >
            Upload Activities
          </Button>
        </Box>
        <UploadDialog open={uploadOpen} onClose={handleUploadClose} />
      </>
    );
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === activities.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(activities.map((a) => a.id)));
    }
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      await fetch("/api/activities", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      setSelected(new Set());
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  const allSelected = selected.size === activities.length;
  const someSelected = selected.size > 0 && !allSelected;

  return (
    <Box>
      {/* Selection toolbar */}
      <Paper
        variant="outlined"
        sx={{
          mb: 1.5,
          px: 2,
          py: 1,
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        <Checkbox
          checked={allSelected}
          indeterminate={someSelected}
          onChange={toggleAll}
          size="small"
        />
        <Typography variant="body2" sx={{ flexGrow: 1 }}>
          {selected.size > 0
            ? `${selected.size} selected`
            : `${activities.length} activit${activities.length !== 1 ? "ies" : "y"}`}
        </Typography>
        {selected.size > 0 ? (
          <Button
            size="small"
            color="error"
            variant="outlined"
            onClick={deleteSelected}
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={14} /> : undefined}
          >
            {deleting ? "Deleting…" : `Delete ${selected.size}`}
          </Button>
        ) : (
          <Button
            size="small"
            variant="outlined"
            startIcon={<UploadFileIcon />}
            onClick={() => setUploadOpen(true)}
          >
            Upload
          </Button>
        )}
      </Paper>

      <Stack spacing={1.5}>
        {activities.map((activity) => (
          <Box key={activity.id} sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
            <Checkbox
              checked={selected.has(activity.id)}
              onChange={() => toggleSelect(activity.id)}
              size="small"
              sx={{ mt: 0.5 }}
            />
            <Box sx={{ flexGrow: 1 }}>
              <ActivityCard
                activity={activity}
                units={units}
                onClick={() => router.push(`/activities/${activity.id}`)}
              />
            </Box>
          </Box>
        ))}
      </Stack>

      <UploadDialog open={uploadOpen} onClose={handleUploadClose} />
    </Box>
  );
}
