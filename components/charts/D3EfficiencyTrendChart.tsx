"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import Typography from "@mui/material/Typography";

interface WeekData {
  week: string;
  avgEfficiency: number | null;
  avgCadence: number | null;
}

const CHART_H = 200;
const M = { top: 8, right: 52, bottom: 24, left: 60 } as const;
const EFF_COLOR = "#2e7d32";
const CAD_COLOR = "#e65100";

export default function D3EfficiencyTrendChart({ data }: { data: WeekData[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; week: string;
    efficiency: number | null; cadence: number | null;
  } | null>(null);

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

    // Y left: efficiency × 10000
    const validEff = data.filter((d) => d.avgEfficiency != null).map((d) => d.avgEfficiency! * 10000);
    const effMin = d3.min(validEff)!;
    const effMax = d3.max(validEff)!;
    const effPad = ((effMax - effMin) * 0.2) || 0.2;
    const yEff = d3.scaleLinear()
      .domain([effMin - effPad, effMax + effPad])
      .range([CHART_H, 0])
      .nice();

    // Y right: cadence (total spm)
    const validCad = data.filter((d) => d.avgCadence != null).map((d) => d.avgCadence!);
    const hasCadence = validCad.length > 0;
    const cadMin = hasCadence ? d3.min(validCad)! : 150;
    const cadMax = hasCadence ? d3.max(validCad)! : 200;
    const cadPad = ((cadMax - cadMin) * 0.2) || 5;
    const yCad = d3.scaleLinear()
      .domain([cadMin - cadPad, cadMax + cadPad])
      .range([CHART_H, 0])
      .nice();

    const root = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);

    // Grid (keyed to left axis)
    root.selectAll<SVGLineElement, number>(".hgl")
      .data(yEff.ticks(5)).join("line").attr("class", "hgl")
      .attr("x1", 0).attr("x2", innerW)
      .attr("y1", (t) => yEff(t)).attr("y2", (t) => yEff(t))
      .attr("stroke", "#888").attr("stroke-opacity", 0.2)
      .attr("stroke-width", 0.75).attr("stroke-dasharray", "4,3");

    // Y left axis (efficiency × 10000)
    const yAxisLeft = d3.axisLeft(yEff).ticks(5).tickSize(0)
      .tickFormat((v) => d3.format(".2f")(+v));
    const yGLeft = root.append("g").call(yAxisLeft);
    yGLeft.select(".domain").remove();
    yGLeft.selectAll(".tick text").attr("fill", EFF_COLOR).attr("font-size", 10).attr("dx", -4);

    // Y right axis (cadence) + dashed line
    if (hasCadence) {
      const yAxisRight = d3.axisRight(yCad).ticks(5).tickSize(0)
        .tickFormat((v) => `${Math.round(+v)}`);
      const yGRight = root.append("g")
        .attr("transform", `translate(${innerW},0)`)
        .call(yAxisRight);
      yGRight.select(".domain").remove();
      yGRight.selectAll(".tick text").attr("fill", CAD_COLOR).attr("font-size", 10).attr("dx", 4);

      const cadLine = d3.line<WeekData>()
        .defined((d) => d.avgCadence != null)
        .x((d) => xPos(d.week))
        .y((d) => yCad(d.avgCadence!))
        .curve(d3.curveMonotoneX);

      root.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", CAD_COLOR)
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "5,3")
        .attr("d", cadLine);

      const cadDots = data.filter((d) => d.avgCadence != null);
      root.selectAll<SVGCircleElement, WeekData>(".cad-dot")
        .data(cadDots).join("circle").attr("class", "cad-dot")
        .attr("cx", (d) => xPos(d.week))
        .attr("cy", (d) => yCad(d.avgCadence!))
        .attr("r", 2.5).attr("fill", CAD_COLOR)
        .attr("stroke", "#fff").attr("stroke-width", 1);
    }

    // X axis
    const xG = root.append("g").attr("transform", `translate(0,${CHART_H})`)
      .call(d3.axisBottom(xBand).tickSize(0));
    xG.select(".domain").attr("stroke", "#bbb");
    xG.selectAll(".tick text").attr("fill", "#777").attr("font-size", 10).attr("dy", 12);

    // Efficiency line
    const effLine = d3.line<WeekData>()
      .defined((d) => d.avgEfficiency != null)
      .x((d) => xPos(d.week))
      .y((d) => yEff(d.avgEfficiency! * 10000))
      .curve(d3.curveMonotoneX);

    root.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", EFF_COLOR)
      .attr("stroke-width", 2)
      .attr("d", effLine);

    // Efficiency dots (interactive)
    const effDots = data.filter((d) => d.avgEfficiency != null);
    root.selectAll<SVGCircleElement, WeekData>(".eff-dot")
      .data(effDots).join("circle").attr("class", "eff-dot")
      .attr("cx", (d) => xPos(d.week))
      .attr("cy", (d) => yEff(d.avgEfficiency! * 10000))
      .attr("r", 3.5).attr("fill", EFF_COLOR)
      .attr("stroke", "#fff").attr("stroke-width", 1.5)
      .style("cursor", "pointer")
      .on("mouseenter", (event: MouseEvent, d) => {
        d3.select(event.currentTarget as SVGCircleElement).attr("r", 5.5);
        const rect = svgEl.getBoundingClientRect();
        setTooltip({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          week: d.week,
          efficiency: d.avgEfficiency,
          cadence: d.avgCadence,
        });
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
          ...(tooltip.x + 14 + 200 > containerW
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
          {tooltip.efficiency != null && (
            <div>
              <strong style={{ color: EFF_COLOR }}>{(tooltip.efficiency * 10000).toFixed(2)}</strong>
              <span style={{ color: "#aaa" }}> Efficiency (×10⁴)</span>
            </div>
          )}
          {tooltip.cadence != null && (
            <div>
              <strong style={{ color: CAD_COLOR }}>{Math.round(tooltip.cadence)}</strong>
              <span style={{ color: "#aaa" }}> spm cadence</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
