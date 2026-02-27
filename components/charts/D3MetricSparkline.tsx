"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

interface SparklinePoint {
  value: number | null;
  isRecent: boolean;
}

interface Props {
  data: SparklinePoint[];
  baseline: number | null;
  label: string;
  unit?: string;
}

const CHART_H = 68;
const M = { top: 6, right: 4, bottom: 6, left: 4 } as const;

export default function D3MetricSparkline({ data, baseline, label, unit }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; value: number } | null>(null);

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
    svg.attr("width", containerW).attr("height", M.top + CHART_H + M.bottom);

    const validVals = data.map((d) => d.value).filter((v): v is number => v != null);
    if (validVals.length === 0) return;

    const allVals = baseline != null ? [...validVals, baseline] : validVals;
    const yMin = d3.min(allVals)!;
    const yMax = d3.max(allVals)!;
    const pad = ((yMax - yMin) * 0.15) || 0.001;

    const xScale = d3.scaleLinear().domain([0, Math.max(data.length - 1, 1)]).range([0, innerW]);
    const yScale = d3.scaleLinear().domain([yMin - pad, yMax + pad]).range([CHART_H, 0]);

    const root = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);

    // Baseline reference
    if (baseline != null) {
      root.append("line")
        .attr("x1", 0).attr("x2", innerW)
        .attr("y1", yScale(baseline)).attr("y2", yScale(baseline))
        .attr("stroke", "#888").attr("stroke-dasharray", "3,3").attr("stroke-width", 1);
    }

    // Line
    const line = d3.line<SparklinePoint>()
      .defined((d) => d.value != null)
      .x((_, i) => xScale(i))
      .y((d) => yScale(d.value!))
      .curve(d3.curveMonotoneX);

    root.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#1976d2")
      .attr("stroke-width", 1.5)
      .attr("d", line);

    // Dots with original index preserved
    const dots = data.map((d, i) => ({ ...d, idx: i })).filter((d) => d.value != null);
    root.selectAll<SVGCircleElement, typeof dots[0]>(".dot")
      .data(dots).join("circle").attr("class", "dot")
      .attr("cx", (d) => xScale(d.idx))
      .attr("cy", (d) => yScale(d.value!))
      .attr("r", 3)
      .attr("fill", (d) => d.isRecent ? "#f57c00" : "#1976d2")
      .style("cursor", "pointer")
      .on("mouseenter", (event: MouseEvent, d) => {
        d3.select(event.currentTarget as SVGCircleElement).attr("r", 5);
        const rect = svgEl.getBoundingClientRect();
        setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, value: d.value! });
      })
      .on("mousemove", (event: MouseEvent) => {
        const rect = svgEl.getBoundingClientRect();
        setTooltip((prev) => prev ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top } : null);
      })
      .on("mouseleave", (event: MouseEvent) => {
        d3.select(event.currentTarget as SVGCircleElement).attr("r", 3);
        setTooltip(null);
      });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, baseline, containerW]);

  const fmt = (v: number) => unit ? `${v.toFixed(2)} ${unit}` : v.toFixed(2);

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <svg ref={svgRef} style={{ display: "block" }} />
      {tooltip && (
        <div style={{
          position: "absolute",
          ...(tooltip.x + 14 + 120 > containerW
            ? { right: containerW - tooltip.x + 14, left: undefined }
            : { left: tooltip.x + 14, right: undefined }),
          top: Math.max(0, tooltip.y - 32),
          pointerEvents: "none",
          background: "rgba(22,22,22,0.92)",
          color: "#f0f0f0",
          padding: "4px 8px",
          borderRadius: 5,
          fontSize: 11,
          lineHeight: 1.5,
          whiteSpace: "nowrap",
          boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
        }}>
          <div style={{ color: "#bbb" }}>{label}</div>
          <div><strong>{fmt(tooltip.value)}</strong></div>
        </div>
      )}
    </div>
  );
}
