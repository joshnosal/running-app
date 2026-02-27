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

interface ChartPoint {
  startTime: string;
  activityId: string;
  lapNumber: number;
  totalDistance: number;
  avgSpeed: number;
  avgCadence: number | null;
  avgPower: number;
  efficiency: number;
  globalIdx: number;
}

interface TooltipData {
  svgX: number;
  svgY: number;
  efficiency: number;
  avgSpeed: number;
  avgCadence: number | null;
  avgPower: number;
  totalDistance: number;
  date: string;
}

interface SelectedPoint {
  startTime: string;
  activityId: string;
  avgSpeed: number;
  avgPower: number;
  efficiency: number;
}

// ── Layout ────────────────────────────────────────────────────────────────────
const CHART_H = 200;
const M = { top: 16, right: 20, bottom: 36, left: 60 } as const;
const COLOR = "#5c6bc0"; // indigo

// ── Component ─────────────────────────────────────────────────────────────────

export default function D3EfficiencyBandChart({
  units,
  activities,
  laps,
}: {
  units: Units;
  activities: ActivityRecord[];
  laps: LapRecord[];
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [containerW, setContainerW] = useState(0);
  const [selected, setSelected] = useState<SelectedPoint | null>(null);
  const [runLimit, setRunLimit] = useState(10);
  const [sdBasis, setSdBasis] = useState(25);
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

  // ── Derive display data from props ─────────────────────────────────────────
  const chartData = useMemo<ChartPoint[]>(() => {
    const source =
      dataType === "laps"
        ? (() => {
            const activeIds = new Set(activities.slice(0, runLimit).map((a) => a.id));
            return laps.filter((l) => activeIds.has(l.activityId)).map((l) => ({
              startTime: l.startTime,
              activityId: l.activityId,
              lapNumber: l.lapNumber,
              totalDistance: l.totalDistance,
              avgSpeed: l.avgSpeed,
              avgCadence: l.avgCadence,
              avgPower: l.avgPower,
            }));
          })()
        : activities.slice(0, runLimit).map((a) => ({
            startTime: a.startTime,
            activityId: a.id,
            lapNumber: 0,
            totalDistance: a.totalDistance,
            avgSpeed: a.avgSpeed,
            avgCadence: a.avgCadence,
            avgPower: a.avgPower,
          }));

    const sorted = source
      .filter((r) => r.avgPower != null && r.avgPower > 0)
      .sort((a, b) => {
        const tDiff = +new Date(a.startTime) - +new Date(b.startTime);
        return tDiff !== 0 ? tDiff : (a.lapNumber ?? 0) - (b.lapNumber ?? 0);
      });

    return sorted.map((r, i) => ({
      startTime: r.startTime,
      activityId: r.activityId,
      lapNumber: r.lapNumber ?? 0,
      totalDistance: r.totalDistance,
      avgSpeed: r.avgSpeed,
      avgCadence: r.avgCadence != null ? r.avgCadence * 2 : null,
      avgPower: r.avgPower as number,
      efficiency: (r.avgSpeed / (r.avgPower as number)) * 10000,
      globalIdx: i,
    }));
  }, [activities, laps, runLimit, dataType]);

  // ── SD basis: always computed from activity-level data ─────────────────────
  const sdBasisEfficiencies = useMemo<number[]>(() => {
    return activities
      .slice(0, sdBasis)
      .filter((a) => a.avgPower != null && a.avgPower > 0)
      .map((a) => (a.avgSpeed / (a.avgPower as number)) * 10000);
  }, [activities, sdBasis]);

  // ── Draw ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || containerW === 0 || chartData.length === 0) return;

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();

    const innerW = containerW - M.left - M.right;
    const totalH = M.top + CHART_H + M.bottom;
    svg.attr("width", containerW).attr("height", totalH);

    const n = chartData.length;
    const efficiencies = chartData.map((d) => d.efficiency);
    const mean = d3.mean(sdBasisEfficiencies) ?? 0;
    const sd = d3.deviation(sdBasisEfficiencies) ?? 0;

    // Equal-spacing X: each data point gets one slot
    const xScale = d3.scaleLinear()
      .domain([-0.5, n - 0.5])
      .range([0, innerW]);

    // Y scale: ensure ±2σ bands are always visible even if data is within them
    const effMin = d3.min(efficiencies)!;
    const effMax = d3.max(efficiencies)!;
    const yLow = Math.min(mean - 2.2 * sd, effMin - 0.5);
    const yHigh = Math.max(mean + 2.2 * sd, effMax + 0.5);
    const yScale = d3.scaleLinear()
      .domain([yLow, yHigh])
      .range([CHART_H, 0])
      .nice();
    const yTicks = yScale.ticks(5);

    // Identify first point of each activity for grid lines & axis labels
    const actFirstIdx = new Map<string, number>();
    chartData.forEach((d, i) => {
      if (!actFirstIdx.has(d.activityId)) actFirstIdx.set(d.activityId, i);
    });
    const activityStarts = Array.from(actFirstIdx.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([, idx]) => ({ idx, date: new Date(chartData[idx]!.startTime) }));

    // Clip path
    const defs = svg.append("defs");
    defs.append("clipPath").attr("id", "d3eb-clip")
      .append("rect").attr("x", 0).attr("y", 0)
      .attr("width", innerW).attr("height", CHART_H);

    const root = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);

    // Background tint
    root.append("rect")
      .attr("width", innerW).attr("height", CHART_H)
      .attr("fill", COLOR).attr("fill-opacity", 0.04);

    // ±2σ reference band (outer)
    root.append("rect")
      .attr("x", 0).attr("width", innerW)
      .attr("y", yScale(mean + 2 * sd))
      .attr("height", Math.max(0, yScale(mean - 2 * sd) - yScale(mean + 2 * sd)))
      .attr("fill", COLOR).attr("fill-opacity", 0.10);

    // ±1σ reference band (inner)
    root.append("rect")
      .attr("x", 0).attr("width", innerW)
      .attr("y", yScale(mean + sd))
      .attr("height", Math.max(0, yScale(mean - sd) - yScale(mean + sd)))
      .attr("fill", COLOR).attr("fill-opacity", 0.18);

    // Horizontal grid lines
    root.selectAll<SVGLineElement, number>(".hgl")
      .data(yTicks).join("line").attr("class", "hgl")
      .attr("x1", 0).attr("x2", innerW)
      .attr("y1", (t) => yScale(t)).attr("y2", (t) => yScale(t))
      .attr("stroke", "#888").attr("stroke-opacity", 0.25)
      .attr("stroke-width", 0.75).attr("stroke-dasharray", "4,3");

    // Mean dashed line
    root.append("line")
      .attr("x1", 0).attr("x2", innerW)
      .attr("y1", yScale(mean)).attr("y2", yScale(mean))
      .attr("stroke", COLOR).attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "6,4").attr("stroke-opacity", 0.7);

    // Vertical activity lines — laps mode only
    if (dataType === "laps") {
      activityStarts.forEach(({ idx }) => {
        root.append("line").attr("class", "vgl")
          .attr("x1", xScale(idx)).attr("x2", xScale(idx))
          .attr("y1", 0).attr("y2", CHART_H)
          .attr("stroke", "#888").attr("stroke-opacity", 0.35)
          .attr("stroke-width", 0.75);
      });
    }

    // Y axis
    const yAxis = d3.axisLeft(yScale)
      .tickValues(yTicks).tickSize(0)
      .tickFormat((v) => d3.format(".1f")(+v));
    const yG = root.append("g").call(yAxis);
    yG.select(".domain").remove();
    yG.selectAll(".tick text").attr("fill", "#777").attr("font-size", 10).attr("dx", -4);

    // Y axis label
    root.append("text")
      .attr("transform", `translate(${-M.left + 14},${CHART_H / 2}) rotate(-90)`)
      .attr("text-anchor", "middle").attr("fill", "#777").attr("font-size", 11)
      .text("Efficiency");

    // X axis
    const axisG = root.append("g").attr("transform", `translate(0,${CHART_H})`);
    axisG.append("line")
      .attr("x1", 0).attr("x2", innerW).attr("y1", 0).attr("y2", 0)
      .attr("stroke", "#bbb").attr("stroke-width", 1);

    const maxLabels = 8;
    const step = Math.max(1, Math.ceil(activityStarts.length / maxLabels));
    activityStarts.filter((_, i) => i % step === 0).forEach(({ idx, date }) => {
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

    // Dots (clipped)
    const dataG = root.append("g").attr("clip-path", "url(#d3eb-clip)");
    dataG.selectAll<SVGCircleElement, ChartPoint>(".dot")
      .data(chartData).join("circle").attr("class", "dot")
      .attr("cx", (d) => xScale(d.globalIdx))
      .attr("cy", (d) => yScale(d.efficiency))
      .attr("r", 4).attr("fill", COLOR)
      .attr("stroke", "#fff").attr("stroke-width", 1.5)
      .style("cursor", "pointer")
      .on("mouseenter", (event: MouseEvent, d: ChartPoint) => {
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
      .on("click", (_event: MouseEvent, d: ChartPoint) => {
        setSelected({
          startTime: d.startTime,
          activityId: d.activityId,
          avgSpeed: d.avgSpeed,
          avgPower: d.avgPower,
          efficiency: d.efficiency,
        });
      });

    // Outer border
    root.append("rect")
      .attr("x", 0).attr("y", 0)
      .attr("width", innerW).attr("height", CHART_H)
      .attr("fill", "none").attr("stroke", "#bbb").attr("stroke-width", 1);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartData, sdBasisEfficiencies, containerW, units, dataType]);


  return (
    <div style={{ width: "100%" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2, mb: 1, flexWrap: "wrap" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="body2" color="text.secondary">σ Runs:</Typography>
          <Select
            size="small"
            value={sdBasis}
            onChange={(e) => setSdBasis(Number(e.target.value))}
            sx={{ minWidth: 72 }}
          >
            {RUN_LIMIT_OPTIONS.map((v) => (
              <MenuItem key={v} value={v}>{v}</MenuItem>
            ))}
          </Select>
        </Box>
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
          No data with power available.
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
            {tooltip.avgCadence != null && <div>Cadence: <strong>{Math.round(tooltip.avgCadence)} spm</strong></div>}
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
