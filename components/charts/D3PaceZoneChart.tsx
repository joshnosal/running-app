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
import { formatPace, type Units } from "@/lib/units";

const RUN_LIMIT_OPTIONS = [5, 10, 25, 50, 100] as const;

// Raw shape returned by /api/analytics?runs=N&type=laps
interface LapApiRecord {
  id: string;
  activityId: string;
  lapNumber: number;
  startTime: string;
  avgSpeed: number;
  avgPower: number | null;
}

// Internal point shape used by the drawing logic
interface ChartPoint {
  startTime: string;
  activityId: string;
  lapNumber: number;
  classifyValue: number; // avgSpeed m/s — determines zone
  avgSpeed: number;
  avgPower: number | null;
}

interface Props {
  zoneBoundaries: [number, number];
  zoneLabels: [string, string, string]; // [easy, tempo, threshold]
  units: Units;
}

interface TooltipData {
  svgX: number;
  svgY: number;
  efficiency: number;
  avgSpeed: number;
  avgPower: number;
  date: string;
}

interface SelectedPoint {
  startTime: string;
  activityId: string;
  lapNumber: number;
  avgSpeed: number;
  avgPower: number;
  efficiency: number;
}

// ── Layout ────────────────────────────────────────────────────────────────────
const PANEL_H = 150;
const M = { top: 12, right: 20, bottom: 36, left: 88 } as const;
// Left margin: [0–26] = rotated zone label, [26–88] = Y axis area
const LABEL_NAME_X = 9;
const LABEL_RANGE_X = 22;

// Zone colours: index matches classification (0=easy, 1=tempo, 2=threshold)
const COLORS = ["#43a047", "#fb8c00", "#e53935"] as const;

// Display order (top → bottom): Threshold, Tempo, Easy
// DISPLAY_ORDER[panelIndex] = zoneIndex
const DISPLAY_ORDER = [2, 1, 0] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strips the "/km" or "/mi" suffix from formatPace output */
function paceOnly(mps: number, units: Units): string {
  return formatPace(mps, units).replace(/ \/.*$/, "");
}

/**
 * Human-readable pace range for each zone.
 * Zone 0 (easy)      = slow speed  → pace > upper bound  → "> 7:28 /km"
 * Zone 1 (tempo)     = mid speed   → pace between bounds → "5:37–7:28 /km"
 * Zone 2 (threshold) = fast speed  → pace < lower bound  → "< 5:37 /km"
 */
function zoneRange(z: 0 | 1 | 2, bounds: [number, number], units: Units): string {
  const unit = units === "imperial" ? "/mi" : "/km";
  const b0 = paceOnly(bounds[0], units); // pace at slower boundary
  const b1 = paceOnly(bounds[1], units); // pace at faster boundary
  if (z === 0) return `> ${b0} ${unit}`;
  if (z === 1) return `${b1}–${b0} ${unit}`;
  return `< ${b1} ${unit}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function D3PaceZoneChart({ zoneBoundaries, zoneLabels, units }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [containerW, setContainerW] = useState(0);
  const [selected, setSelected] = useState<SelectedPoint | null>(null);
  const [runLimit, setRunLimit] = useState(10);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [fetching, setFetching] = useState(true);

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

  // ── Fetch laps for the selected number of runs ───────────────────────────
  useEffect(() => {
    let cancelled = false;
    setFetching(true);
    fetch(`/api/analytics?runs=${runLimit}&type=laps`)
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        const laps: LapApiRecord[] = res.laps ?? [];
        setChartData(
          laps.map((lap) => ({
            startTime: lap.startTime,
            activityId: lap.activityId,
            lapNumber: lap.lapNumber,
            classifyValue: lap.avgSpeed,
            avgSpeed: lap.avgSpeed,
            avgPower: lap.avgPower,
          }))
        );
        setFetching(false);
      })
      .catch(() => { if (!cancelled) setFetching(false); });
    return () => { cancelled = true; };
  }, [runLimit]);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || containerW === 0 || chartData.length === 0) return;

    // Filter to points that have valid power (required for efficiency formula)
    type ValidPoint = ChartPoint & { avgPower: number };
    const valid = chartData.filter((d): d is ValidPoint => d.avgPower != null && d.avgPower > 0);
    if (valid.length === 0) return;

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();

    const innerW = containerW - M.left - M.right;
    const totalH = M.top + 3 * PANEL_H + M.bottom;
    svg.attr("width", containerW).attr("height", totalH);

    // ── Sort: by activity date ASC, then by lapNumber ASC within an activity ──
    // This produces a stable chronological order where each lap is one "slot".
    const allSorted = [...valid].sort((a, b) => {
      const tDiff = +new Date(a.startTime) - +new Date(b.startTime);
      return tDiff !== 0 ? tDiff : a.lapNumber - b.lapNumber;
    });

    // Assign a global sequential index to every lap
    const globalIdxOf = new Map<ValidPoint, number>();
    allSorted.forEach((d, i) => globalIdxOf.set(d, i));
    const n = allSorted.length;

    // ── Classify laps and attach global index + efficiency ────────────────────
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
    // Each lap occupies one equally-wide slot regardless of real elapsed time.
    // Domain: [-0.5, n-0.5] so the outermost dots have half a slot of padding.
    const xScale = d3.scaleLinear()
      .domain([-0.5, n - 0.5])
      .range([0, innerW]);

    // ── Shared Y scale (efficiency = avgSpeed / avgPower × 10000) ─────────────
    const allEff = classified.map((d) => d.efficiency);
    const effMin = d3.min(allEff)!;
    const effMax = d3.max(allEff)!;
    const effPad = ((effMax - effMin) * 0.13) || 1;
    const yScale = d3.scaleLinear()
      .domain([effMin - effPad, effMax + effPad])
      .range([PANEL_H, 0])
      .nice();
    const yTicks = yScale.ticks(4);

    // ── Identify the first lap (lowest globalIdx) of each activity ─────────────
    // These positions drive both the vertical grid lines and the X-axis labels.
    const actFirstIdx = new Map<string, number>(); // activityId → globalIdx
    allSorted.forEach((d, i) => {
      if (!actFirstIdx.has(d.activityId)) actFirstIdx.set(d.activityId, i);
    });
    const activityStarts = Array.from(actFirstIdx.entries())
      .map(([actId, idx]) => ({ actId, idx, date: new Date(allSorted[idx]!.startTime) }))
      .sort((a, b) => a.idx - b.idx);

    // ── Clip-path defs ────────────────────────────────────────────────────────
    const defs = svg.append("defs");
    ([0, 1, 2] as const).forEach((panelIdx) => {
      defs.append("clipPath")
        .attr("id", `d3pz-clip-${panelIdx}`)
        .append("rect")
        .attr("x", 0).attr("y", 0)
        .attr("width", innerW).attr("height", PANEL_H);
    });

    const root = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);

    // ── Draw panels top-to-bottom: Threshold → Tempo → Easy ───────────────────
    DISPLAY_ORDER.forEach((zoneIdx, panelIdx) => {
      const panelTop = panelIdx * PANEL_H;
      const g = root.append("g").attr("transform", `translate(0,${panelTop})`);
      const color = COLORS[zoneIdx];
      const bucket = buckets[zoneIdx];

      // 1. Zone tint
      g.append("rect")
        .attr("width", innerW).attr("height", PANEL_H)
        .attr("fill", color).attr("fill-opacity", 0.05);

      // 2. Horizontal grid lines — same tick values across all panels so the
      //    lines run continuously when the panels are visually stacked.
      //    Panels 1 & 2 drop the top tick: it sits exactly on the inter-panel
      //    border and would visually double up with the one from the panel above.
      const gridTicks = panelIdx === 0 ? yTicks : yTicks.slice(0, -1);

      g.selectAll<SVGLineElement, number>(".hgl")
        .data(gridTicks)
        .join("line")
        .attr("class", "hgl")
        .attr("x1", 0).attr("x2", innerW)
        .attr("y1", (t) => yScale(t)).attr("y2", (t) => yScale(t))
        .attr("stroke", "#888").attr("stroke-opacity", 0.28)
        .attr("stroke-width", 0.75).attr("stroke-dasharray", "4,3");

      // 3. Vertical grid lines — one per activity, at the first lap of that run.
      //    These are drawn before dots so they sit behind the data.
      activityStarts.forEach(({ idx }) => {
        g.append("line")
          .attr("class", "vgl")
          .attr("x1", xScale(idx)).attr("x2", xScale(idx))
          .attr("y1", 0).attr("y2", PANEL_H)
          .attr("stroke", "#888").attr("stroke-opacity", 0.35)
          .attr("stroke-width", 0.75);
      });

      // 4. Average efficiency line — spans the full panel width at the zone mean.
      if (bucket.length > 0) {
        const avgEff = bucket.reduce((s, d) => s + d.efficiency, 0) / bucket.length;
        g.append("line")
          .attr("class", "avg-line")
          .attr("x1", 0).attr("x2", innerW)
          .attr("y1", yScale(avgEff)).attr("y2", yScale(avgEff))
          .attr("stroke", color)
          .attr("stroke-width", 1.5)
          .attr("stroke-dasharray", "6,4")
          .attr("stroke-opacity", 0.65);
      }

      // 5. Inter-panel divider (skip the very top edge — the outer border handles it)
      if (panelIdx > 0) {
        g.append("line")
          .attr("x1", 0).attr("x2", innerW).attr("y1", 0).attr("y2", 0)
          .attr("stroke", "#bbb").attr("stroke-width", 1);
      }

      // 6. Y axis — suppress the top tick on panels 1 & 2 (matches gridTicks)
      const axisTicks = panelIdx === 0 ? yTicks : yTicks.slice(0, -1);
      const yAxis = d3.axisLeft(yScale)
        .tickValues(axisTicks)
        .tickSize(0)
        .tickFormat((v) => d3.format(".1f")(+v));
      const yG = g.append("g").call(yAxis);
      yG.select(".domain").remove();
      yG.selectAll(".tick text")
        .attr("fill", "#777").attr("font-size", 10).attr("dx", -4);

      // 7. Rotated zone label: name on one line, pace range on a second line.
      //    Both sit in the [0–26] px label strip to the left of the Y axis.
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
        .text(zoneRange(zoneIdx, zoneBoundaries, units));

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

      // 9. Data dots (clipped to panel bounds)
      const dataG = g.append("g").attr("clip-path", `url(#d3pz-clip-${panelIdx})`);

      if (bucket.length === 0) {
        g.append("text")
          .attr("x", innerW / 2).attr("y", PANEL_H / 2 + 4)
          .attr("text-anchor", "middle").attr("fill", "#aaa").attr("font-size", 11)
          .text("No data in zone");
      } else {
        dataG.selectAll<SVGCircleElement, Classified>(".dot")
          .data(bucket)
          .join("circle")
          .attr("class", "dot")
          .attr("cx", (d) => xScale(d.globalIdx))
          .attr("cy", (d) => yScale(d.efficiency))
          .attr("r", 4)
          .attr("fill", color)
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
              avgPower: d.avgPower,
              date: new Date(d.startTime).toLocaleDateString(),
            });
          })
          .on("mousemove", (event: MouseEvent) => {
            const rect = svgEl.getBoundingClientRect();
            setTooltip((prev) =>
              prev ? { ...prev, svgX: event.clientX - rect.left, svgY: event.clientY - rect.top } : null
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
              efficiency: d.efficiency,
            });
          });
      }

      // 10. X axis with activity-start labels — bottom panel only
      if (panelIdx === 2) {
        const axisG = g.append("g").attr("transform", `translate(0,${PANEL_H})`);

        // Limit labels to at most 8 to avoid crowding
        const maxLabels = 8;
        const step = Math.max(1, Math.ceil(activityStarts.length / maxLabels));
        const labelStarts = activityStarts.filter((_, i) => i % step === 0);

        // Draw one tick mark + date label per selected activity start
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

        // Bottom axis line
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
  }, [chartData, zoneBoundaries[0], zoneBoundaries[1], zoneLabels[0], zoneLabels[1], zoneLabels[2], containerW, units]);

  function tooltipLeft(svgX: number) {
    const tipW = 200;
    return svgX + 14 + tipW > containerW ? svgX - tipW - 10 : svgX + 14;
  }

  return (
    <div style={{ width: "100%" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 1, mb: 1 }}>
        <Typography variant="body2" color="text.secondary">Runs:</Typography>
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
      {fetching && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>Loading…</Typography>
      )}
      {!fetching && chartData.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
          No lap data with power available.
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
          <div>Efficiency: <strong>{tooltip.efficiency.toFixed(2)}</strong></div>
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
