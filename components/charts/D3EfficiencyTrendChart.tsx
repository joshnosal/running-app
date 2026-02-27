"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import Typography from "@mui/material/Typography";

interface WeekData {
  week: string;
  avgEfficiency: number | null;
}

const CHART_H = 200;
const M = { top: 8, right: 20, bottom: 24, left: 60 } as const;
const COLOR = "#2e7d32";

export default function D3EfficiencyTrendChart({ data }: { data: WeekData[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; week: string; value: number } | null>(null);

  const hasData = data.some((d) => d.avgEfficiency != null);

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
    if (!svgEl || containerW === 0 || !hasData) return;

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();
    const innerW = containerW - M.left - M.right;
    svg.attr("width", containerW).attr("height", M.top + CHART_H + M.bottom);

    // X: band scale; center of each band used for line/dot positions
    const xBand = d3.scaleBand()
      .domain(data.map((d) => d.week))
      .range([0, innerW]);
    const xPos = (week: string) => (xBand(week) ?? 0) + xBand.bandwidth() / 2;

    const validVals = data.filter((d) => d.avgEfficiency != null).map((d) => d.avgEfficiency as number);
    const yMin = d3.min(validVals)!;
    const yMax = d3.max(validVals)!;
    const pad = ((yMax - yMin) * 0.2) || 0.0002;
    const yScale = d3.scaleLinear()
      .domain([yMin - pad, yMax + pad])
      .range([CHART_H, 0])
      .nice();

    const root = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);

    // Grid
    root.selectAll<SVGLineElement, number>(".hgl")
      .data(yScale.ticks(5)).join("line").attr("class", "hgl")
      .attr("x1", 0).attr("x2", innerW)
      .attr("y1", (t) => yScale(t)).attr("y2", (t) => yScale(t))
      .attr("stroke", "#888").attr("stroke-opacity", 0.2)
      .attr("stroke-width", 0.75).attr("stroke-dasharray", "4,3");

    // Y axis
    const yAxis = d3.axisLeft(yScale).ticks(5).tickSize(0)
      .tickFormat((v) => d3.format(".4f")(+v));
    const yG = root.append("g").call(yAxis);
    yG.select(".domain").remove();
    yG.selectAll(".tick text").attr("fill", "#777").attr("font-size", 10).attr("dx", -4);

    // X axis
    const xG = root.append("g").attr("transform", `translate(0,${CHART_H})`)
      .call(d3.axisBottom(xBand).tickSize(0));
    xG.select(".domain").attr("stroke", "#bbb");
    xG.selectAll(".tick text").attr("fill", "#777").attr("font-size", 10).attr("dy", 12);

    // Line connecting non-null points
    const line = d3.line<WeekData>()
      .defined((d) => d.avgEfficiency != null)
      .x((d) => xPos(d.week))
      .y((d) => yScale(d.avgEfficiency!))
      .curve(d3.curveMonotoneX);

    root.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", COLOR)
      .attr("stroke-width", 2)
      .attr("d", line);

    // Dots on non-null points
    const dots = data.map((d, i) => ({ ...d, idx: i })).filter((d) => d.avgEfficiency != null);
    root.selectAll<SVGCircleElement, typeof dots[0]>(".dot")
      .data(dots).join("circle").attr("class", "dot")
      .attr("cx", (d) => xPos(d.week))
      .attr("cy", (d) => yScale(d.avgEfficiency!))
      .attr("r", 3.5).attr("fill", COLOR)
      .attr("stroke", "#fff").attr("stroke-width", 1.5)
      .style("cursor", "pointer")
      .on("mouseenter", (event: MouseEvent, d) => {
        d3.select(event.currentTarget as SVGCircleElement).attr("r", 5.5);
        const rect = svgEl.getBoundingClientRect();
        setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, week: d.week, value: d.avgEfficiency! });
      })
      .on("mousemove", (event: MouseEvent) => {
        const rect = svgEl.getBoundingClientRect();
        setTooltip((prev) => prev ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top } : null);
      })
      .on("mouseleave", (event: MouseEvent) => {
        d3.select(event.currentTarget as SVGCircleElement).attr("r", 3.5);
        setTooltip(null);
      });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, containerW, hasData]);

  if (!hasData) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
        Efficiency score requires power data (power meter or Garmin Running Power).
        No power data found in uploaded activities.
      </Typography>
    );
  }

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <svg ref={svgRef} style={{ display: "block" }} />
      {tooltip && (
        <div style={{
          position: "absolute",
          ...(tooltip.x + 14 + 180 > containerW
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
          <div><strong>{tooltip.value.toFixed(4)}</strong> Efficiency (m/s/W)</div>
        </div>
      )}
    </div>
  );
}
