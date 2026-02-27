"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { formatPace, formatDistance, type Units } from "@/lib/units";
import type { ActivityRecord, LapRecord } from "@/types/analytics";

const RUN_LIMIT_OPTIONS = [5, 10, 25, 50, 100] as const;
type DataType = "activities" | "laps";

// Internal point shape used by the drawing logic
interface ChartPoint {
  startTime: string;
  activityId: string;
  lapNumber: number;
  totalDistance: number;
  classifyValue: number; // total cadence spm (already ×2) — determines zone
  avgSpeed: number;
  avgPower: number;
  avgCadence: number; // total spm (already ×2), guaranteed non-null by filter
}

interface Props {
  zoneBoundaries: [number, number]; // [low→mid, mid→high] thresholds in spm
  zoneLabels: [string, string, string]; // [low, mid, high]
  units: Units;
  activities: ActivityRecord[];
  laps: LapRecord[];
}

interface TooltipData {
  svgX: number;
  svgY: number;
  efficiency: number;
  avgSpeed: number;
  avgCadence: number;
  avgPower: number;
  totalDistance: number;
  date: string;
}

interface SelectedPoint {
  startTime: string;
  activityId: string;
  lapNumber: number;
  avgSpeed: number;
  avgPower: number;
  avgCadence: number;
  efficiency: number;
}

// ── Layout ────────────────────────────────────────────────────────────────────
const PANEL_H = 150;
const M = { top: 12, right: 20, bottom: 36, left: 88 } as const;
const LABEL_NAME_X = 9;
const LABEL_RANGE_X = 22;

// Zone colours: index matches classification (0=low, 1=mid, 2=high)
const COLORS = ["#43a047", "#fb8c00", "#e53935"] as const;

// Display order (top → bottom): High, Mid, Low
const DISPLAY_ORDER = [2, 1, 0] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function cadenceRange(z: 0 | 1 | 2, bounds: [number, number]): string {
  const b0 = Math.round(bounds[0]);
  const b1 = Math.round(bounds[1]);
  if (z === 0) return `< ${b0} spm`;
  if (z === 1) return `${b0}–${b1} spm`;
  return `≥ ${b1} spm`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function D3CadenceZoneChart({ zoneBoundaries, zoneLabels, units, activities, laps }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [containerW, setContainerW] = useState(0);
  const [selected, setSelected] = useState<SelectedPoint | null>(null);
  const [runLimit, setRunLimit] = useState(10);
  const [dataType, setDataType] = useState<DataType>("laps");

  // ── ResizeObserver ─────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w > 0) setContainerW(w);
    });
    ro.observe(el);
    const initial = el.getBoundingClientRect().width;
    if (initial > 0) setContainerW(initial);
    return () => ro.disconnect();
  }, []);

  // ── Derive chart data from props ───────────────────────────────────────────
  const chartData = useMemo<ChartPoint[]>(() => {
    if (dataType === "laps") {
      const activeIds = new Set(activities.slice(0, runLimit).map((a) => a.id));
      return laps
        .filter((l) => activeIds.has(l.activityId) && l.avgCadence != null && l.avgPower != null && l.avgPower > 0)
        .map((l) => {
          const totalCadence = (l.avgCadence as number) * 2;
          return {
            startTime: l.startTime,
            activityId: l.activityId,
            lapNumber: l.lapNumber,
            totalDistance: l.totalDistance,
            classifyValue: totalCadence,
            avgSpeed: l.avgSpeed,
            avgPower: l.avgPower as number,
            avgCadence: totalCadence,
          };
        });
    }
    // activities mode
    return activities
      .slice(0, runLimit)
      .filter((a) => a.avgCadence != null && a.avgPower != null && a.avgPower > 0)
      .map((a) => {
        const totalCadence = (a.avgCadence as number) * 2;
        return {
          startTime: a.startTime,
          activityId: a.id,
          lapNumber: 0,
          totalDistance: a.totalDistance,
          classifyValue: totalCadence,
          avgSpeed: a.avgSpeed,
          avgPower: a.avgPower as number,
          avgCadence: totalCadence,
        };
      });
  }, [activities, laps, runLimit, dataType]);

  // ── Draw ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || containerW === 0 || chartData.length === 0) return;

    // chartData is already filtered for cadence + power in the useMemo
    const valid = chartData;
    if (valid.length === 0) return;

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();

    const innerW = containerW - M.left - M.right;
    const totalH = M.top + 3 * PANEL_H + M.bottom;
    svg.attr("width", containerW).attr("height", totalH);

    // ── Sort: by activity date ASC, then by lapNumber ASC ─────────────────────
    const allSorted = [...valid].sort((a, b) => {
      const tDiff = +new Date(a.startTime) - +new Date(b.startTime);
      return tDiff !== 0 ? tDiff : a.lapNumber - b.lapNumber;
    });

    // Assign a global sequential index to every point
    type ValidPoint = ChartPoint;
    const globalIdxOf = new Map<ValidPoint, number>();
    allSorted.forEach((d, i) => globalIdxOf.set(d, i));
    const n = allSorted.length;

    // ── Classify points and attach global index + efficiency ──────────────────
    type Classified = ValidPoint & { zone: 0 | 1 | 2; efficiency: number; globalIdx: number };
    const classified: Classified[] = valid.map((d) => ({
      ...d,
      zone: (d.classifyValue < zoneBoundaries[0] ? 0
        : d.classifyValue < zoneBoundaries[1] ? 1 : 2) as 0 | 1 | 2,
      efficiency: (d.avgSpeed / d.avgPower) * 10000,
      globalIdx: globalIdxOf.get(d)!,
    }));

    const buckets: Classified[][] = [[], [], []];
    classified.forEach((d) => buckets[d.zone].push(d));

    // ── Equal-spacing X scale ─────────────────────────────────────────────────
    const xScale = d3.scaleLinear()
      .domain([-0.5, n - 0.5])
      .range([0, innerW]);

    // ── Shared Y scale ────────────────────────────────────────────────────────
    const allEff = classified.map((d) => d.efficiency);
    const effMin = d3.min(allEff)!;
    const effMax = d3.max(allEff)!;
    const effPad = ((effMax - effMin) * 0.13) || 1;
    const yScale = d3.scaleLinear()
      .domain([effMin - effPad, effMax + effPad])
      .range([PANEL_H, 0])
      .nice();
    const yTicks = yScale.ticks(4);

    // ── Activity start positions for X-axis labels ────────────────────────────
    const actFirstIdx = new Map<string, number>();
    allSorted.forEach((d, i) => {
      if (!actFirstIdx.has(d.activityId)) actFirstIdx.set(d.activityId, i);
    });
    const activityStarts = Array.from(actFirstIdx.entries())
      .map(([actId, idx]) => ({ actId, idx, date: new Date(allSorted[idx]!.startTime) }))
      .sort((a, b) => a.idx - b.idx);

    // ── Clip-path defs ─────────────────────────────────────────────────────────
    const defs = svg.append("defs");
    ([0, 1, 2] as const).forEach((panelIdx) => {
      defs.append("clipPath")
        .attr("id", `d3cz-clip-${panelIdx}`)
        .append("rect")
        .attr("x", 0).attr("y", 0)
        .attr("width", innerW).attr("height", PANEL_H);
    });

    const root = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);

    // ── Draw panels top-to-bottom: High → Mid → Low ────────────────────────────
    DISPLAY_ORDER.forEach((zoneIdx, panelIdx) => {
      const panelTop = panelIdx * PANEL_H;
      const g = root.append("g").attr("transform", `translate(0,${panelTop})`);
      const color = COLORS[zoneIdx];
      const bucket = buckets[zoneIdx];

      // 1. Zone tint
      g.append("rect")
        .attr("width", innerW).attr("height", PANEL_H)
        .attr("fill", color).attr("fill-opacity", 0.05);

      // 2. Horizontal grid lines
      const gridTicks = panelIdx === 0 ? yTicks : yTicks.slice(0, -1);
      g.selectAll<SVGLineElement, number>(".hgl")
        .data(gridTicks).join("line").attr("class", "hgl")
        .attr("x1", 0).attr("x2", innerW)
        .attr("y1", (t) => yScale(t)).attr("y2", (t) => yScale(t))
        .attr("stroke", "#888").attr("stroke-opacity", 0.28)
        .attr("stroke-width", 0.75).attr("stroke-dasharray", "4,3");

      // 3. Vertical activity grid lines — laps mode only
      if (dataType === "laps") {
        activityStarts.forEach(({ idx }) => {
          g.append("line").attr("class", "vgl")
            .attr("x1", xScale(idx)).attr("x2", xScale(idx))
            .attr("y1", 0).attr("y2", PANEL_H)
            .attr("stroke", "#888").attr("stroke-opacity", 0.35)
            .attr("stroke-width", 0.75);
        });
      }

      // 4. Average efficiency line
      if (bucket.length > 0) {
        const avgEff = bucket.reduce((s, d) => s + d.efficiency, 0) / bucket.length;
        g.append("line").attr("class", "avg-line")
          .attr("x1", 0).attr("x2", innerW)
          .attr("y1", yScale(avgEff)).attr("y2", yScale(avgEff))
          .attr("stroke", color).attr("stroke-width", 1.5)
          .attr("stroke-dasharray", "6,4").attr("stroke-opacity", 0.65);
      }

      // 5. Inter-panel divider
      if (panelIdx > 0) {
        g.append("line")
          .attr("x1", 0).attr("x2", innerW).attr("y1", 0).attr("y2", 0)
          .attr("stroke", "#bbb").attr("stroke-width", 1);
      }

      // 6. Y axis
      const axisTicks = panelIdx === 0 ? yTicks : yTicks.slice(0, -1);
      const yAxis = d3.axisLeft(yScale)
        .tickValues(axisTicks).tickSize(0)
        .tickFormat((v) => d3.format(".1f")(+v));
      const yG = g.append("g").call(yAxis);
      yG.select(".domain").remove();
      yG.selectAll(".tick text").attr("fill", "#777").attr("font-size", 10).attr("dx", -4);

      // 7. Rotated zone label
      const midY = M.top + panelTop + PANEL_H / 2;
      svg.append("text")
        .attr("transform", `translate(${LABEL_NAME_X},${midY}) rotate(-90)`)
        .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
        .attr("fill", color).attr("font-size", 11).attr("font-weight", "700")
        .text(zoneLabels[zoneIdx]);
      svg.append("text")
        .attr("transform", `translate(${LABEL_RANGE_X},${midY}) rotate(-90)`)
        .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
        .attr("fill", color).attr("font-size", 8).attr("fill-opacity", 0.85)
        .text(cadenceRange(zoneIdx, zoneBoundaries));

      // 8. Average efficiency badge (top-right corner)
      if (bucket.length > 0) {
        const avgEff = bucket.reduce((s, d) => s + d.efficiency, 0) / bucket.length;
        const bW = 90, bH = 20, bX = innerW - bW - 6, bY = 5;
        const boxG = g.append("g");
        boxG.append("rect")
          .attr("x", bX).attr("y", bY)
          .attr("width", bW).attr("height", bH).attr("rx", 4)
          .attr("fill", color).attr("fill-opacity", 0.12)
          .attr("stroke", color).attr("stroke-width", 0.75).attr("stroke-opacity", 0.5);
        boxG.append("text")
          .attr("x", bX + bW / 2).attr("y", bY + bH / 2)
          .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
          .attr("fill", color).attr("font-size", 10).attr("font-weight", "600")
          .text(`avg ${avgEff.toFixed(2)}`);
      }

      // 9. Data dots (clipped)
      const dataG = g.append("g").attr("clip-path", `url(#d3cz-clip-${panelIdx})`);

      if (bucket.length === 0) {
        g.append("text")
          .attr("x", innerW / 2).attr("y", PANEL_H / 2 + 4)
          .attr("text-anchor", "middle").attr("fill", "#aaa").attr("font-size", 11)
          .text("No data in zone");
      } else {
        dataG.selectAll<SVGCircleElement, Classified>(".dot")
          .data(bucket).join("circle").attr("class", "dot")
          .attr("cx", (d) => xScale(d.globalIdx))
          .attr("cy", (d) => yScale(d.efficiency))
          .attr("r", 4).attr("fill", color)
          .attr("stroke", "#fff").attr("stroke-width", 1.5)
          .style("cursor", "pointer")
          .on("mouseenter", (event: MouseEvent, d: Classified) => {
            d3.select(event.currentTarget as SVGCircleElement).attr("r", 6.5);
            const rect = svgEl.getBoundingClientRect();
            setTooltip({
              svgX: event.clientX - rect.left,
              svgY: event.clientY - rect.top,
              efficiency: d.efficiency,
              avgSpeed: d.avgSpeed,
              avgCadence: d.avgCadence,
              avgPower: d.avgPower,
              totalDistance: d.totalDistance,
              date: new Date(d.startTime).toLocaleDateString(),
            });
          })
          .on("mousemove", (event: MouseEvent) => {
            const rect = svgEl.getBoundingClientRect();
            setTooltip((prev) =>
              prev
                ? { ...prev, svgX: event.clientX - rect.left, svgY: event.clientY - rect.top }
                : null
            );
          })
          .on("mouseleave", (event: MouseEvent) => {
            d3.select(event.currentTarget as SVGCircleElement).attr("r", 4);
            setTooltip(null);
          })
          .on("click", (_event: MouseEvent, d: Classified) => {
            setSelected({
              startTime: d.startTime,
              activityId: d.activityId,
              lapNumber: d.lapNumber,
              avgSpeed: d.avgSpeed,
              avgPower: d.avgPower,
              avgCadence: d.avgCadence,
              efficiency: d.efficiency,
            });
          });
      }

      // 10. X axis with activity-start labels — bottom panel only
      if (panelIdx === 2) {
        const axisG = g.append("g").attr("transform", `translate(0,${PANEL_H})`);

        const maxLabels = 8;
        const step = Math.max(1, Math.ceil(activityStarts.length / maxLabels));
        const labelStarts = activityStarts.filter((_, i) => i % step === 0);

        labelStarts.forEach(({ idx, date }) => {
          const x = xScale(idx);
          axisG.append("line")
            .attr("x1", x).attr("x2", x).attr("y1", 0).attr("y2", 5)
            .attr("stroke", "#bbb");
          axisG.append("text")
            .attr("x", x).attr("y", 8)
            .attr("text-anchor", "middle").attr("dominant-baseline", "hanging")
            .attr("font-size", 10).attr("fill", "#777")
            .text(d3.timeFormat("%b %d")(date));
        });

        axisG.append("line")
          .attr("x1", 0).attr("x2", innerW).attr("y1", 0).attr("y2", 0)
          .attr("stroke", "#bbb").attr("stroke-width", 1);
      }
    });

    // ── Single outer border around all 3 stacked panels ───────────────────────
    root.append("rect")
      .attr("x", 0).attr("y", 0)
      .attr("width", innerW).attr("height", 3 * PANEL_H)
      .attr("fill", "none")
      .attr("stroke", "#bbb").attr("stroke-width", 1);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartData, zoneBoundaries[0], zoneBoundaries[1], zoneLabels[0], zoneLabels[1], zoneLabels[2], containerW, units, dataType]);


  return (
    <div style={{ width: "100%" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2, mb: 1 }}>
        <ToggleButtonGroup
          value={dataType}
          exclusive
          onChange={(_, v) => { if (v) setDataType(v); }}
          size="small"
        >
          <ToggleButton value="activities">Runs</ToggleButton>
          <ToggleButton value="laps">Laps</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="body2" color="text.secondary">N:</Typography>
          <Select
            size="small"
            value={runLimit}
            onChange={(e) => setRunLimit(Number(e.target.value))}
            sx={{ minWidth: 72 }}
          >
            {RUN_LIMIT_OPTIONS.map((v) => (
              <MenuItem key={v} value={v}>{v}</MenuItem>
            ))}
          </Select>
        </Box>
      </Box>

      {chartData.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
          No data with cadence and power available.
        </Typography>
      )}

      <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
        <svg ref={svgRef} style={{ display: "block", overflow: "visible" }} />

        {tooltip && (
          <div style={{
            position: "absolute",
            ...(tooltip.svgX + 14 + 180 > containerW
              ? { right: containerW - tooltip.svgX + 14, left: undefined }
              : { left: tooltip.svgX + 14, right: undefined }),
            top: tooltip.svgY - 16,
            pointerEvents: "none",
            background: "rgba(22,22,22,0.92)",
            color: "#f0f0f0",
            padding: "8px 12px",
            borderRadius: 6,
            fontSize: 12,
            lineHeight: 1.7,
            whiteSpace: "nowrap",
            boxShadow: "0 3px 10px rgba(0,0,0,0.4)",
          }}>
            <div style={{ color: "#999", fontSize: 11, marginBottom: 2 }}>{tooltip.date}</div>
            <div>Distance: <strong>{formatDistance(tooltip.totalDistance, units)}</strong></div>
            <div>Speed: <strong>{formatPace(tooltip.avgSpeed, units)}</strong></div>
            <div>Cadence: <strong>{Math.round(tooltip.avgCadence)} spm</strong></div>
            <div>Power: <strong>{Math.round(tooltip.avgPower)} W</strong></div>
            <div>Efficiency: <strong>{tooltip.efficiency.toFixed(2)}</strong></div>
          </div>
        )}

        <Dialog open={selected !== null} onClose={() => setSelected(null)} maxWidth="sm" fullWidth>
          <DialogTitle>Activity Details</DialogTitle>
          <DialogContent>
            <Typography color="text.secondary" sx={{ py: 2 }}>
              (Activity layout coming soon)
            </Typography>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
