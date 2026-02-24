"use client";

import { useState, useRef } from "react";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import LinearProgress from "@mui/material/LinearProgress";
import UploadFileIcon from "@mui/icons-material/UploadFile";

export default function UploadPage() {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    type: "success" | "error" | "duplicate";
    message: string;
    activityId?: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".fit")) {
      setResult({ type: "error", message: "Only .fit files are supported." });
      return;
    }

    setUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setResult({ type: "error", message: data.error ?? "Upload failed." });
      } else if (data.isDuplicate) {
        setResult({
          type: "duplicate",
          message: "This file was already uploaded.",
          activityId: data.activityId,
        });
      } else {
        setResult({
          type: "success",
          message: "Activity uploaded successfully!",
          activityId: data.activityId,
        });
      }
    } catch {
      setResult({ type: "error", message: "Network error. Please try again." });
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Upload Activity
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Upload a Garmin .fit file to import your run data.
      </Typography>

      <Paper
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        sx={{
          border: 2,
          borderStyle: "dashed",
          borderColor: dragging ? "primary.main" : "grey.400",
          bgcolor: dragging ? "primary.50" : "background.paper",
          p: 6,
          textAlign: "center",
          cursor: "pointer",
          borderRadius: 2,
          transition: "all 0.2s",
          "&:hover": { borderColor: "primary.main" },
          mb: 3,
        }}
      >
        <UploadFileIcon sx={{ fontSize: 48, color: "text.secondary", mb: 1 }} />
        <Typography variant="h6" gutterBottom>
          Drop your .fit file here
        </Typography>
        <Typography variant="body2" color="text.secondary">
          or click to browse
        </Typography>
        <input
          ref={inputRef}
          type="file"
          accept=".fit"
          onChange={handleFileChange}
          style={{ display: "none" }}
          onClick={(e) => e.stopPropagation()}
        />
      </Paper>

      {uploading && <LinearProgress sx={{ mb: 2 }} />}

      {result && (
        <Alert
          severity={result.type === "success" ? "success" : result.type === "duplicate" ? "warning" : "error"}
          sx={{ mb: 2 }}
          action={
            result.activityId ? (
              <Button
                color="inherit"
                size="small"
                href={`/activities/${result.activityId}`}
              >
                View
              </Button>
            ) : undefined
          }
        >
          {result.message}
        </Alert>
      )}
    </Box>
  );
}
