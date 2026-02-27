"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

interface WeekData {
  week: string;
  z1: number;
  z2: number;
  z3: number;
  z4: number;
  z5: number;
}

const ZONE_KEYS = ["z1", "z2", "z3", "z4", "z5"] as const;
type ZoneKey = typeof ZONE_KEYS[number];
const ZONE_COLORS = ["#64b5f6", "#81c784", "#ffb74d", "#e57373", "#ba68c8"] as const;
const ZONE_LABELS = ["Z1", "Z2", "Z3", "Z4", "Z5"] as const;

const CHART_H = 200;
const LEGEND_H = 20;
const M = { top: 8, right: 20, bottom: 24, left: 52 } as const;

export default function D3HRZoneChart({ data }: { data: WeekData[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; week: string;
    zones: { label: string; mins: number; pct: number; color: string }[];
  } | null>(null);

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

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();
    const innerW = containerW - M.left - M.right;
    const totalH = M.top + LEGEND_H + CHART_H + M.bottom;
    svg.attr("width", containerW).attr("height", totalH);

    const stack = d3.stack<WeekData, ZoneKey>().keys([...ZONE_KEYS]);
    const stacked = stack(data);

    const xScale = d3.scaleBand()
      .domain(data.map((d) => d.week))
      .range([0, innerW])
      .padding(0.3);

    const maxTotal = d3.max(data, (d) => ZONE_KEYS.reduce((s, k) => s + d[k], 0)) ?? 0;
    const yScale = d3.scaleLinear()
      .domain([0, maxTotal * 1.08 || 1])
      .range([CHART_H, 0])
      .nice();

    const root = svg.append("g").attr("transform", `translate(${M.left},${M.top + LEGEND_H})`);

    // Grid
    root.selectAll<SVGLineElement, number>(".hgl")
      .data(yScale.ticks(5)).join("line").attr("class", "hgl")
      .attr("x1", 0).attr("x2", innerW)
      .attr("y1", (t) => yScale(t)).attr("y2", (t) => yScale(t))
      .attr("stroke", "#888").attr("stroke-opacity", 0.2)
      .attr("stroke-width", 0.75).attr("stroke-dasharray", "4,3");

    // Y axis (seconds → minutes)
    const yAxis = d3.axisLeft(yScale).ticks(5).tickSize(0)
      .tickFormat((v) => `${Math.round(+v / 60)} min`);
    const yG = root.append("g").call(yAxis);
    yG.select(".domain").remove();
    yG.selectAll(".tick text").attr("fill", "#777").attr("font-size", 10).attr("dx", -4);

    // X axis
    const xG = root.append("g").attr("transform", `translate(0,${CHART_H})`)
      .call(d3.axisBottom(xScale).tickSize(0));
    xG.select(".domain").attr("stroke", "#bbb");
    xG.selectAll(".tick text").attr("fill", "#777").attr("font-size", 10).attr("dy", 12);

    // Stacked bars
    stacked.forEach((series, i) => {
      root.selectAll<SVGRectElement, d3.SeriesPoint<WeekData>>(`.bar-z${i + 1}`)
        .data(series).join("rect").attr("class", `bar-z${i + 1}`)
        .attr("x", (d) => xScale(d.data.week)!)
        .attr("y", (d) => yScale(d[1]))
        .attr("height", (d) => Math.max(0, yScale(d[0]) - yScale(d[1])))
        .attr("width", xScale.bandwidth())
        .attr("fill", ZONE_COLORS[i])
        .style("cursor", "pointer")
        .on("mouseenter", (event: MouseEvent, d) => {
          const rect = svgEl.getBoundingClientRect();
          const totalSecs = ZONE_KEYS.reduce((s, k) => s + d.data[k], 0);
          const zones = ZONE_KEYS.map((k, j) => ({
            label: ZONE_LABELS[j],
            mins: Math.round(d.data[k] / 60),
            pct: totalSecs > 0 ? Math.round((d.data[k] / totalSecs) * 100) : 0,
            color: ZONE_COLORS[j],
          }));
          setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, week: d.data.week, zones });
        })
        .on("mousemove", (event: MouseEvent) => {
          const rect = svgEl.getBoundingClientRect();
          setTooltip((prev) => prev ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top } : null);
        })
        .on("mouseleave", () => setTooltip(null));
    });

    // Legend
    const legendG = svg.append("g").attr("transform", `translate(${M.left},${M.top + 2})`);
    const itemW = 44;
    const legendOffsetX = (innerW - ZONE_LABELS.length * itemW) / 2;
    ZONE_LABELS.forEach((label, i) => {
      const x = legendOffsetX + i * itemW;
      legendG.append("rect").attr("x", x).attr("y", 0).attr("width", 12).attr("height", 12)
        .attr("fill", ZONE_COLORS[i]).attr("rx", 2);
      legendG.append("text").attr("x", x + 15).attr("y", 10)
        .attr("font-size", 11).attr("fill", "#777").text(label);
    });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, containerW]);

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <svg ref={svgRef} style={{ display: "block" }} />
      {tooltip && (
        <div style={{
          position: "absolute",
          ...(tooltip.x + 14 + 130 > containerW
            ? { right: containerW - tooltip.x + 14, left: undefined }
            : { left: tooltip.x + 14, right: undefined }),
          top: tooltip.y - 16,
          pointerEvents: "none",
          background: "rgba(22,22,22,0.92)",
          color: "#f0f0f0",
          padding: "6px 10px",
          borderRadius: 6,
          fontSize: 12,
          lineHeight: 1.7,
          whiteSpace: "nowrap",
          boxShadow: "0 3px 10px rgba(0,0,0,0.4)",
        }}>
          <div style={{ color: "#999", fontSize: 11, marginBottom: 2 }}>{tooltip.week}</div>
          {tooltip.zones.map(({ label, mins, pct, color }) => (
            <div key={label}>
              <span style={{ color }}>{label}:</span> <strong>{mins} min ({pct}%)</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
