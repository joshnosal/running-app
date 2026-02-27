"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import type { Units } from "@/lib/units";

interface WeekData {
  week: string;
  distanceM: number;
  avgPaceMs: number | null;
}

const CHART_H = 200;
const M = { top: 8, right: 64, bottom: 24, left: 56 } as const;
const BAR_COLOR = "#1976d2";
const PACE_COLOR = "#e65100";

export default function D3WeeklyMileageChart({ data, units }: { data: WeekData[]; units: Units }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; week: string; dist: number; avgPaceMs: number | null;
  } | null>(null);

  const fmtPaceStr = (mps: number): string => {
    const secsPerUnit = units === "imperial" ? 1609.34 : 1000;
    const secs = secsPerUnit / mps;
    const m = Math.floor(secs / 60);
    const s = Math.round(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")} /${units === "imperial" ? "mi" : "km"}`;
  };

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

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || containerW === 0) return;

    const factor = units === "imperial" ? 0.000621371 : 0.001;
    const unitLabel = units === "imperial" ? "mi" : "km";
    const secsPerUnit = units === "imperial" ? 1609.34 : 1000;
    const chartData = data.map((d) => ({
      week: d.week,
      dist: d.distanceM * factor,
      avgPaceMs: d.avgPaceMs,
    }));

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();
    const innerW = containerW - M.left - M.right;
    svg.attr("width", containerW).attr("height", M.top + CHART_H + M.bottom);

    const xScale = d3.scaleBand()
      .domain(chartData.map((d) => d.week))
      .range([0, innerW])
      .padding(0.3);

    // Left Y axis: distance
    const yMax = d3.max(chartData, (d) => d.dist) ?? 0;
    const yScale = d3.scaleLinear()
      .domain([0, yMax * 1.12 || 1])
      .range([CHART_H, 0])
      .nice();

    // Right Y axis: pace (seconds per unit — inverted so faster is higher)
    const paceData = chartData.filter((d) => d.avgPaceMs != null && d.avgPaceMs > 0);
    const hasPace = paceData.length > 0;
    let yPaceScale: d3.ScaleLinear<number, number> | null = null;

    if (hasPace) {
      const paceSecs = paceData.map((d) => secsPerUnit / d.avgPaceMs!);
      const paceMin = d3.min(paceSecs)!;
      const paceMax = d3.max(paceSecs)!;
      const pacePad = ((paceMax - paceMin) * 0.25) || 15;
      // Invert: slower (more secs) at bottom, faster at top
      yPaceScale = d3.scaleLinear()
        .domain([paceMax + pacePad, paceMin - pacePad])
        .range([CHART_H, 0])
        .nice();
    }

    const root = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);

    // Grid
    root.selectAll<SVGLineElement, number>(".hgl")
      .data(yScale.ticks(5)).join("line").attr("class", "hgl")
      .attr("x1", 0).attr("x2", innerW)
      .attr("y1", (t) => yScale(t)).attr("y2", (t) => yScale(t))
      .attr("stroke", "#888").attr("stroke-opacity", 0.2)
      .attr("stroke-width", 0.75).attr("stroke-dasharray", "4,3");

    // Y left axis (distance)
    const yAxis = d3.axisLeft(yScale).ticks(5).tickSize(0)
      .tickFormat((v) => `${d3.format(".1f")(+v)} ${unitLabel}`);
    const yG = root.append("g").call(yAxis);
    yG.select(".domain").remove();
    yG.selectAll(".tick text").attr("fill", "#777").attr("font-size", 10).attr("dx", -4);

    // Y right axis (pace)
    if (hasPace && yPaceScale) {
      const fmtAxisPace = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = Math.round(secs % 60);
        return `${m}:${s.toString().padStart(2, "0")}`;
      };
      const yAxisRight = d3.axisRight(yPaceScale).ticks(5).tickSize(0)
        .tickFormat((v) => fmtAxisPace(+v));
      const yGRight = root.append("g")
        .attr("transform", `translate(${innerW},0)`)
        .call(yAxisRight);
      yGRight.select(".domain").remove();
      yGRight.selectAll(".tick text").attr("fill", PACE_COLOR).attr("font-size", 10).attr("dx", 4);
    }

    // X axis
    const xG = root.append("g").attr("transform", `translate(0,${CHART_H})`)
      .call(d3.axisBottom(xScale).tickSize(0));
    xG.select(".domain").attr("stroke", "#bbb");
    xG.selectAll(".tick text").attr("fill", "#777").attr("font-size", 10).attr("dy", 12);

    // Bars
    root.selectAll<SVGRectElement, typeof chartData[0]>(".bar")
      .data(chartData).join("rect").attr("class", "bar")
      .attr("x", (d) => xScale(d.week)!)
      .attr("y", (d) => yScale(d.dist))
      .attr("width", xScale.bandwidth())
      .attr("height", (d) => CHART_H - yScale(d.dist))
      .attr("fill", BAR_COLOR).attr("rx", 3)
      .style("cursor", "pointer")
      .on("mouseenter", (event: MouseEvent, d) => {
        d3.select(event.currentTarget as SVGRectElement).attr("fill", "#1565c0");
        const rect = svgEl.getBoundingClientRect();
        setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, week: d.week, dist: d.dist, avgPaceMs: d.avgPaceMs });
      })
      .on("mousemove", (event: MouseEvent) => {
        const rect = svgEl.getBoundingClientRect();
        setTooltip((prev) => prev ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top } : null);
      })
      .on("mouseleave", (event: MouseEvent) => {
        d3.select(event.currentTarget as SVGRectElement).attr("fill", BAR_COLOR);
        setTooltip(null);
      });

    // Pace line + dots
    if (hasPace && yPaceScale) {
      const scale = yPaceScale;
      const paceLine = d3.line<typeof chartData[0]>()
        .defined((d) => d.avgPaceMs != null && d.avgPaceMs > 0)
        .x((d) => (xScale(d.week) ?? 0) + xScale.bandwidth() / 2)
        .y((d) => scale(secsPerUnit / d.avgPaceMs!))
        .curve(d3.curveMonotoneX);

      root.append("path")
        .datum(chartData)
        .attr("fill", "none")
        .attr("stroke", PACE_COLOR)
        .attr("stroke-width", 2)
        .attr("d", paceLine);

      const paceDots = chartData.filter((d) => d.avgPaceMs != null && d.avgPaceMs > 0);
      root.selectAll<SVGCircleElement, typeof chartData[0]>(".pace-dot")
        .data(paceDots).join("circle").attr("class", "pace-dot")
        .attr("cx", (d) => (xScale(d.week) ?? 0) + xScale.bandwidth() / 2)
        .attr("cy", (d) => scale(secsPerUnit / d.avgPaceMs!))
        .attr("r", 3).attr("fill", PACE_COLOR)
        .attr("stroke", "#fff").attr("stroke-width", 1);
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, containerW, units]);

  const unitLabel = units === "imperial" ? "mi" : "km";

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <svg ref={svgRef} style={{ display: "block" }} />
      {tooltip && (
        <div style={{
          position: "absolute",
          ...(tooltip.x + 14 + 160 > containerW
            ? { right: containerW - tooltip.x + 14, left: undefined }
            : { left: tooltip.x + 14, right: undefined }),
          top: tooltip.y - 16,
          pointerEvents: "none",
          background: "rgba(22,22,22,0.92)",
          color: "#f0f0f0",
          padding: "6px 10px",
          borderRadius: 6,
          fontSize: 12,
          lineHeight: 1.6,
          whiteSpace: "nowrap",
          boxShadow: "0 3px 10px rgba(0,0,0,0.4)",
        }}>
          <div style={{ color: "#999", fontSize: 11 }}>{tooltip.week}</div>
          <div><strong style={{ color: BAR_COLOR }}>{tooltip.dist.toFixed(2)} {unitLabel}</strong></div>
          {tooltip.avgPaceMs != null && tooltip.avgPaceMs > 0 && (
            <div><strong style={{ color: PACE_COLOR }}>{fmtPaceStr(tooltip.avgPaceMs)}</strong> avg pace</div>
          )}
        </div>
      )}
    </div>
  );
}
