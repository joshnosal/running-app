"use client";

import { useEffect, useRef, useState } from "react";
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
import { formatPace, type Units } from "@/lib/units";

const RUN_LIMIT_OPTIONS = [5, 10, 25, 50, 100] as const;
type DataType = "activities" | "laps";

const MS_TO_KMH = 3.6;
const MS_TO_MPH = 2.23694;

interface ApiRecord {
  id: string;
  activityId?: string;
  startTime: string;
  avgSpeed: number;
  avgPower: number | null;
}

interface ChartPoint {
  startTime: string;
  activityId: string;
  avgSpeed: number;
  avgPower: number;
  displaySpeed: number; // in km/h or mph
}

interface TooltipData {
  svgX: number;
  svgY: number;
  avgSpeed: number;
  avgPower: number;
  date: string;
}

interface SelectedPoint {
  startTime: string;
  activityId: string;
  avgSpeed: number;
  avgPower: number;
}

// ── Layout ────────────────────────────────────────────────────────────────────
const CHART_H = 220;
const M = { top: 16, right: 20, bottom: 44, left: 60 } as const;
const COLOR = "#26a69a"; // teal

// ── Component ─────────────────────────────────────────────────────────────────

export default function D3SpeedPowerScatter({ units }: { units: Units }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [containerW, setContainerW] = useState(0);
  const [selected, setSelected] = useState<SelectedPoint | null>(null);
  const [runLimit, setRunLimit] = useState(10);
  const [dataType, setDataType] = useState<DataType>("activities");
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [fetching, setFetching] = useState(true);

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

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setFetching(true);
    const url =
      dataType === "laps"
        ? `/api/analytics?runs=${runLimit}&type=laps`
        : `/api/analytics?limit=${runLimit}&type=activities`;
    fetch(url)
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        const records: ApiRecord[] = res.activities ?? res.laps ?? [];
        const factor = units === "imperial" ? MS_TO_MPH : MS_TO_KMH;
        const points: ChartPoint[] = records
          .filter((r) => r.avgPower != null && r.avgPower > 0 && r.avgSpeed > 0)
          .map((r) => ({
            startTime: r.startTime,
            activityId: r.activityId ?? r.id,
            avgSpeed: r.avgSpeed,
            avgPower: r.avgPower as number,
            displaySpeed: r.avgSpeed * factor,
          }));
        setChartData(points);
        setFetching(false);
      })
      .catch(() => {
        if (!cancelled) setFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [runLimit, dataType, units]);

  // ── Draw ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || containerW === 0 || chartData.length === 0) return;

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();

    const innerW = containerW - M.left - M.right;
    const totalH = M.top + CHART_H + M.bottom;
    svg.attr("width", containerW).attr("height", totalH);

    const speeds = chartData.map((d) => d.displaySpeed);
    const powers = chartData.map((d) => d.avgPower);
    const speedExtent = d3.extent(speeds) as [number, number];
    const powerExtent = d3.extent(powers) as [number, number];
    const speedPad = Math.max((speedExtent[1] - speedExtent[0]) * 0.08, 0.5);
    const powerPad = Math.max((powerExtent[1] - powerExtent[0]) * 0.08, 5);

    const xScale = d3.scaleLinear()
      .domain([speedExtent[0] - speedPad, speedExtent[1] + speedPad])
      .range([0, innerW])
      .nice();

    const yScale = d3.scaleLinear()
      .domain([powerExtent[0] - powerPad, powerExtent[1] + powerPad])
      .range([CHART_H, 0])
      .nice();

    // Clip path
    const defs = svg.append("defs");
    defs.append("clipPath").attr("id", "d3sp-clip")
      .append("rect").attr("x", 0).attr("y", 0)
      .attr("width", innerW).attr("height", CHART_H);

    const root = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);

    // Background tint
    root.append("rect")
      .attr("width", innerW).attr("height", CHART_H)
      .attr("fill", COLOR).attr("fill-opacity", 0.04);

    // Horizontal grid lines
    const yTicks = yScale.ticks(5);
    root.selectAll<SVGLineElement, number>(".hgl")
      .data(yTicks).join("line").attr("class", "hgl")
      .attr("x1", 0).attr("x2", innerW)
      .attr("y1", (t) => yScale(t)).attr("y2", (t) => yScale(t))
      .attr("stroke", "#888").attr("stroke-opacity", 0.25)
      .attr("stroke-width", 0.75).attr("stroke-dasharray", "4,3");

    // Vertical grid lines
    const xTicks = xScale.ticks(6);
    root.selectAll<SVGLineElement, number>(".vgl")
      .data(xTicks).join("line").attr("class", "vgl")
      .attr("x1", (t) => xScale(t)).attr("x2", (t) => xScale(t))
      .attr("y1", 0).attr("y2", CHART_H)
      .attr("stroke", "#888").attr("stroke-opacity", 0.25)
      .attr("stroke-width", 0.75).attr("stroke-dasharray", "4,3");

    // Y axis
    const yAxis = d3.axisLeft(yScale).ticks(5).tickSize(0);
    const yG = root.append("g").call(yAxis);
    yG.select(".domain").remove();
    yG.selectAll(".tick text").attr("fill", "#777").attr("font-size", 10).attr("dx", -4);

    // Y axis label
    root.append("text")
      .attr("transform", `translate(${-M.left + 14},${CHART_H / 2}) rotate(-90)`)
      .attr("text-anchor", "middle").attr("fill", "#777").attr("font-size", 11)
      .text("Power (W)");

    // X axis
    const speedUnit = units === "imperial" ? "mph" : "km/h";
    const xAxis = d3.axisBottom(xScale).ticks(6).tickSize(0);
    const xG = root.append("g").attr("transform", `translate(0,${CHART_H})`).call(xAxis);
    xG.select(".domain").remove();
    xG.selectAll(".tick text").attr("fill", "#777").attr("font-size", 10).attr("dy", 12);

    // X axis line
    root.append("g").attr("transform", `translate(0,${CHART_H})`)
      .append("line").attr("x1", 0).attr("x2", innerW).attr("y1", 0).attr("y2", 0)
      .attr("stroke", "#bbb").attr("stroke-width", 1);

    // X axis label
    root.append("text")
      .attr("x", innerW / 2).attr("y", CHART_H + M.bottom - 6)
      .attr("text-anchor", "middle").attr("fill", "#777").attr("font-size", 11)
      .text(`Speed (${speedUnit})`);

    // Dots (clipped)
    const dataG = root.append("g").attr("clip-path", "url(#d3sp-clip)");
    dataG.selectAll<SVGCircleElement, ChartPoint>(".dot")
      .data(chartData).join("circle").attr("class", "dot")
      .attr("cx", (d) => xScale(d.displaySpeed))
      .attr("cy", (d) => yScale(d.avgPower))
      .attr("r", 4).attr("fill", COLOR)
      .attr("stroke", "#fff").attr("stroke-width", 1.5)
      .style("cursor", "pointer")
      .on("mouseenter", (event: MouseEvent, d: ChartPoint) => {
        d3.select(event.currentTarget as SVGCircleElement).attr("r", 6.5);
        const rect = svgEl.getBoundingClientRect();
        setTooltip({
          svgX: event.clientX - rect.left,
          svgY: event.clientY - rect.top,
          avgSpeed: d.avgSpeed,
          avgPower: d.avgPower,
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
        });
      });

    // Outer border
    root.append("rect")
      .attr("x", 0).attr("y", 0)
      .attr("width", innerW).attr("height", CHART_H)
      .attr("fill", "none").attr("stroke", "#bbb").attr("stroke-width", 1);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartData, containerW, units]);

  function tooltipLeft(svgX: number) {
    const tipW = 200;
    return svgX + 14 + tipW > containerW ? svgX - tipW - 10 : svgX + 14;
  }

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

      {fetching && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>Loading…</Typography>
      )}
      {!fetching && chartData.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
          No data with speed and power available.
        </Typography>
      )}

      <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
        <svg ref={svgRef} style={{ display: "block", overflow: "visible" }} />

        {tooltip && (
          <div style={{
            position: "absolute",
            left: tooltipLeft(tooltip.svgX),
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
            <div>Speed: <strong>{formatPace(tooltip.avgSpeed, units)}</strong></div>
            <div>Power: <strong>{Math.round(tooltip.avgPower)} W</strong></div>
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
