"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import ListItemSecondaryAction from "@mui/material/ListItemSecondaryAction";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import InfoIcon from "@mui/icons-material/Info";
import WarningIcon from "@mui/icons-material/Warning";
import FolderZipIcon from "@mui/icons-material/FolderZip";
import DirectionsRunIcon from "@mui/icons-material/DirectionsRun";
import type { UploadFileResult } from "@/app/api/upload/route";

type FileStatus = "pending" | "uploading" | "done";

interface QueueEntry {
  file: File;
  status: FileStatus;
  results?: UploadFileResult[];
  error?: string;
}

const ACCEPTED = ".fit,.zip";

function formatActivityLabel(result: UploadFileResult): string {
  if (!result.startTime || !result.sport) return result.fileName;
  const date = new Date(result.startTime);
  const sport = result.sport.charAt(0).toUpperCase() + result.sport.slice(1);
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const day = date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  return `${sport} · ${time}, ${day}`;
}

function FitResultRow({
  result,
  onView,
}: {
  result: UploadFileResult;
  onView?: () => void;
}) {
  if (result.status === "error") {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Chip icon={<ErrorIcon />} label={result.error ?? "Error"} color="error" size="small" variant="outlined" />
      </Box>
    );
  }
  if (result.status === "skipped") {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Chip icon={<WarningIcon />} label={result.reason ?? "Skipped"} color="warning" size="small" variant="outlined" />
      </Box>
    );
  }
  if (result.status === "duplicate") {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Chip icon={<InfoIcon />} label="Already uploaded" color="default" size="small" variant="outlined" />
        {onView && (
          <Button size="small" variant="text" sx={{ fontSize: 11, p: 0, minWidth: 0 }} onClick={onView}>
            View
          </Button>
        )}
      </Box>
    );
  }
  // imported
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      <Chip icon={<CheckCircleIcon />} label="Imported" color="success" size="small" variant="outlined" />
      {onView && (
        <Button size="small" variant="text" sx={{ fontSize: 11, p: 0, minWidth: 0 }} onClick={onView}>
          View
        </Button>
      )}
    </Box>
  );
}

function ZipSummary({ results }: { results: UploadFileResult[] }) {
  const imported = results.filter((r) => r.status === "imported").length;
  const duplicate = results.filter((r) => r.status === "duplicate").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;
  const total = results.length;

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
      <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center" }}>
        {total} file{total !== 1 ? "s" : ""}:
      </Typography>
      {imported > 0 && (
        <Chip label={`${imported} imported`} color="success" size="small" variant="outlined" />
      )}
      {duplicate > 0 && (
        <Chip label={`${duplicate} duplicate`} color="default" size="small" variant="outlined" />
      )}
      {skipped > 0 && (
        <Chip label={`${skipped} skipped`} color="warning" size="small" variant="outlined" />
      )}
      {errors > 0 && (
        <Chip label={`${errors} error${errors !== 1 ? "s" : ""}`} color="error" size="small" variant="outlined" />
      )}
    </Box>
  );
}

export default function UploadPage() {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter(
      (f) =>
        f.name.toLowerCase().endsWith(".fit") || f.name.toLowerCase().endsWith(".zip")
    );
    if (arr.length === 0) return;
    setQueue((prev) => [
      ...prev,
      ...arr.map((file) => ({ file, status: "pending" as FileStatus })),
    ]);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  }

  function removeEntry(index: number) {
    setQueue((prev) => prev.filter((_, i) => i !== index));
  }

  function clearAll() {
    setQueue([]);
  }

  const uploadAll = useCallback(async () => {
    const pending = queue.filter((e) => e.status === "pending");
    if (pending.length === 0) return;

    setUploading(true);
    setQueue((prev) =>
      prev.map((e) => (e.status === "pending" ? { ...e, status: "uploading" } : e))
    );

    const formData = new FormData();
    for (const entry of pending) {
      formData.append("files", entry.file);
    }

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok && !data.fileResults) {
        setQueue((prev) =>
          prev.map((e) =>
            e.status === "uploading"
              ? { ...e, status: "done", error: data.error ?? "Upload failed" }
              : e
          )
        );
        return;
      }

      const fileResults: Record<string, UploadFileResult[]> = data.fileResults ?? {};

      setQueue((prev) =>
        prev.map((entry) => {
          if (entry.status !== "uploading") return entry;
          const results = fileResults[entry.file.name];
          if (!results) {
            return { ...entry, status: "done", error: "No result received" };
          }
          if (results.length === 0) {
            return { ...entry, status: "done", error: "No .fit files found in zip" };
          }
          return { ...entry, status: "done", results };
        })
      );
    } catch {
      setQueue((prev) =>
        prev.map((e) =>
          e.status === "uploading" ? { ...e, status: "done", error: "Network error" } : e
        )
      );
    } finally {
      setUploading(false);
    }
  }, [queue]);

  const pendingCount = queue.filter((e) => e.status === "pending").length;
  const doneCount = queue.filter((e) => e.status === "done").length;
  const allResults = queue.flatMap((e) => e.results ?? []);
  const importedCount = allResults.filter((r) => r.status === "imported").length;
  const duplicateCount = allResults.filter((r) => r.status === "duplicate").length;

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Upload Activities
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Upload Garmin .fit files or .zip archives. Non-running activities are skipped automatically.
      </Typography>

      {/* Drop zone */}
      <Paper
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        sx={{
          border: 2,
          borderStyle: "dashed",
          borderColor: dragging ? "primary.main" : "grey.400",
          bgcolor: dragging ? "action.hover" : "background.paper",
          p: 5,
          textAlign: "center",
          cursor: "pointer",
          borderRadius: 2,
          transition: "all 0.15s",
          "&:hover": { borderColor: "primary.main" },
          mb: 3,
        }}
      >
        <UploadFileIcon sx={{ fontSize: 48, color: "text.secondary", mb: 1 }} />
        <Typography variant="h6" gutterBottom>
          Drop .fit or .zip files here
        </Typography>
        <Typography variant="body2" color="text.secondary">
          or click to browse — multiple files supported
        </Typography>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          multiple
          onChange={handleFileChange}
          style={{ display: "none" }}
          onClick={(e) => e.stopPropagation()}
        />
      </Paper>

      {/* Queue */}
      {queue.length > 0 && (
        <Paper sx={{ mb: 3 }}>
          <Box
            sx={{
              px: 2,
              py: 1.5,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Typography variant="subtitle2">
              {queue.length} file{queue.length !== 1 ? "s" : ""} queued
            </Typography>
            <Box sx={{ display: "flex", gap: 1 }}>
              {pendingCount > 0 && (
                <Button
                  variant="contained"
                  size="small"
                  onClick={uploadAll}
                  disabled={uploading}
                >
                  Upload {pendingCount} file{pendingCount !== 1 ? "s" : ""}
                </Button>
              )}
              <Button size="small" color="inherit" onClick={clearAll} disabled={uploading}>
                Clear all
              </Button>
            </Box>
          </Box>

          {uploading && <LinearProgress />}
          <Divider />

          <List dense disablePadding>
            {queue.map((entry, index) => {
              const isZip = entry.file.name.toLowerCase().endsWith(".zip");
              const hasImported = entry.results?.some((r) => r.status === "imported");

              return (
                <Box key={`${entry.file.name}-${index}`}>
                  <ListItem alignItems="flex-start" sx={{ py: 1 }}>
                    <ListItemIcon sx={{ minWidth: 36, mt: 0.5 }}>
                      {entry.status === "done" && entry.error ? (
                        <ErrorIcon color="error" />
                      ) : entry.status === "done" && hasImported ? (
                        <CheckCircleIcon color="success" />
                      ) : entry.status === "done" ? (
                        <InfoIcon color="action" />
                      ) : isZip ? (
                        <FolderZipIcon color="action" />
                      ) : (
                        <DirectionsRunIcon color="primary" />
                      )}
                    </ListItemIcon>

                    <ListItemText
                      primary={
                        entry.status === "done" && !entry.error && entry.results && !isZip
                          ? formatActivityLabel(entry.results[0])
                          : entry.file.name
                      }
                      secondary={
                        entry.status === "uploading" ? (
                          "Uploading…"
                        ) : entry.status === "done" && entry.error ? (
                          <Typography variant="caption" color="error">
                            {entry.error}
                          </Typography>
                        ) : entry.status === "done" && entry.results ? (
                          isZip ? (
                            <ZipSummary results={entry.results} />
                          ) : (
                            <FitResultRow
                              result={entry.results[0]}
                              onView={
                                entry.results[0].activityId
                                  ? () => router.push(`/activities/${entry.results![0].activityId}`)
                                  : undefined
                              }
                            />
                          )
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            Ready to upload
                          </Typography>
                        )
                      }
                      secondaryTypographyProps={{ component: "div" }}
                    />

                    {entry.status === "pending" && (
                      <ListItemSecondaryAction>
                        <Button size="small" color="inherit" onClick={() => removeEntry(index)}>
                          Remove
                        </Button>
                      </ListItemSecondaryAction>
                    )}
                  </ListItem>
                  {index < queue.length - 1 && <Divider component="li" />}
                </Box>
              );
            })}
          </List>
        </Paper>
      )}

      {/* Summary */}
      {doneCount > 0 && (
        <Alert
          severity={importedCount > 0 ? "success" : duplicateCount > 0 ? "info" : "warning"}
        >
          {importedCount > 0 && (
            <>{importedCount} activit{importedCount !== 1 ? "ies" : "y"} imported. </>
          )}
          {duplicateCount > 0 && (
            <>{duplicateCount} already existed and were skipped. </>
          )}
          {importedCount === 0 && duplicateCount === 0 && "No new activities were imported."}
          {importedCount > 0 && (
            <Button
              size="small"
              color="inherit"
              onClick={() => router.push("/activities")}
              sx={{ ml: 1 }}
            >
              View activities
            </Button>
          )}
        </Alert>
      )}
    </Box>
  );
}
