"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import * as d3 from "d3";

interface MonthlyDatum {
  month: string; // label e.g. "2025년 6월"
  [key: string]: string | number;
}

interface SeriesConfig {
  key: string;
  label: string;
  color: string;
}

interface MonthlyTrendChartProps {
  data: MonthlyDatum[];
  series: SeriesConfig[];
  height?: number;
  formatValue?: (v: number) => string;
}

export default function MonthlyTrendChart({
  data,
  series,
  height = 300,
  formatValue,
}: MonthlyTrendChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const showTooltip = useCallback((event: MouseEvent, html: string) => {
    const tip = tooltipRef.current;
    const box = containerRef.current;
    if (!tip || !box) return;
    const r = box.getBoundingClientRect();
    tip.innerHTML = html;
    tip.style.opacity = "1";
    tip.style.left = `${event.clientX - r.left + 14}px`;
    tip.style.top = `${event.clientY - r.top - 10}px`;
  }, []);

  const hideTooltip = useCallback(() => {
    if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
  }, []);

  const fmtV = useCallback(
    (v: number) => {
      if (formatValue) return formatValue(v);
      const abs = Math.abs(v);
      if (abs >= 100000000) return `${(v / 100000000).toFixed(1)}억`;
      if (abs >= 10000) return `${(v / 10000).toFixed(0)}만`;
      return v.toLocaleString();
    },
    [formatValue]
  );

  useEffect(() => {
    if (!svgRef.current || !data.length || containerWidth === 0) return;

    const margin = { top: 20, right: 24, bottom: 60, left: 72 };
    const chartW = containerWidth - margin.left - margin.right;
    const chartH = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", containerWidth).attr("height", height);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const maxVal =
      d3.max(data, (d) => d3.max(series, (s) => Number(d[s.key]) || 0)) || 0;

    const x = d3
      .scaleBand()
      .domain(data.map((d) => d.month))
      .range([0, chartW])
      .padding(0.3);

    const xSub = d3
      .scaleBand()
      .domain(series.map((s) => s.key))
      .range([0, x.bandwidth()])
      .padding(0.08);

    const y = d3
      .scaleLinear()
      .domain([0, maxVal * 1.12])
      .range([chartH, 0])
      .nice();

    // Grid lines
    g.append("g")
      .selectAll("line")
      .data(y.ticks(5))
      .join("line")
      .attr("x1", 0)
      .attr("x2", chartW)
      .attr("y1", (d) => y(d))
      .attr("y2", (d) => y(d))
      .attr("stroke", "#E8E8E8")
      .attr("stroke-dasharray", "3,3");

    // Y axis
    g.append("g")
      .call(
        d3.axisLeft(y).ticks(5).tickFormat((d) => fmtV(d as number))
      )
      .call((a) => a.select(".domain").remove())
      .call((a) => a.selectAll(".tick line").attr("stroke", "#E0E0E0"))
      .selectAll("text")
      .style("font-size", "11px")
      .style("fill", "#6D6D6D");

    // X axis
    g.append("g")
      .attr("transform", `translate(0,${chartH})`)
      .call(d3.axisBottom(x))
      .call((a) => a.select(".domain").attr("stroke", "#E0E0E0"))
      .call((a) => a.selectAll(".tick line").attr("stroke", "#E0E0E0"))
      .selectAll("text")
      .style("font-size", "11px")
      .style("fill", "#6D6D6D")
      .attr("transform", "rotate(-30)")
      .style("text-anchor", "end");

    // Bars per month
    const groups = g
      .append("g")
      .selectAll<SVGGElement, MonthlyDatum>("g")
      .data(data)
      .join("g")
      .attr("transform", (d) => `translate(${x(d.month) || 0},0)`);

    series.forEach((s) => {
      groups
        .append("rect")
        .attr("x", () => xSub(s.key) || 0)
        .attr("y", chartH)
        .attr("width", xSub.bandwidth())
        .attr("height", 0)
        .attr("rx", 2)
        .attr("fill", s.color)
        .on("mouseenter", function (event, d) {
          d3.select(this)
            .transition()
            .duration(150)
            .attr("fill", d3.color(s.color)!.darker(0.2).formatHex());
          const lines = series
            .map(
              (ss) =>
                `<span style="color:${ss.color}">&#9679;</span> ${ss.label}: <strong>${fmtV(Number(d[ss.key] || 0))}</strong>`
            )
            .join("<br/>");
          showTooltip(event, `<strong>${d.month}</strong><br/>${lines}`);
        })
        .on("mousemove", function (event, d) {
          const lines = series
            .map(
              (ss) =>
                `<span style="color:${ss.color}">&#9679;</span> ${ss.label}: <strong>${fmtV(Number(d[ss.key] || 0))}</strong>`
            )
            .join("<br/>");
          showTooltip(event, `<strong>${d.month}</strong><br/>${lines}`);
        })
        .on("mouseleave", function () {
          d3.select(this).transition().duration(150).attr("fill", s.color);
          hideTooltip();
        })
        .transition()
        .duration(600)
        .delay((_, i) => i * 60)
        .attr("y", (d) => y(Number(d[s.key]) || 0))
        .attr("height", (d) => chartH - y(Number(d[s.key]) || 0));
    });

    // Legend
    const legend = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${height - 10})`);
    series.forEach((s, i) => {
      const lg = legend.append("g").attr("transform", `translate(${i * 90},0)`);
      lg.append("rect").attr("width", 12).attr("height", 10).attr("rx", 2).attr("fill", s.color);
      lg.append("text")
        .attr("x", 16)
        .attr("y", 9)
        .style("font-size", "11px")
        .style("fill", "#6D6D6D")
        .text(s.label);
    });
  }, [data, series, containerWidth, height, fmtV, showTooltip, hideTooltip]);

  return (
    <div ref={containerRef} className="relative w-full">
      <svg ref={svgRef} />
      <div
        ref={tooltipRef}
        className="absolute pointer-events-none bg-white border border-pwc-gray-100 shadow-lg rounded-lg px-3 py-2 text-xs text-pwc-gray-900 opacity-0 transition-opacity duration-150 z-10"
        style={{ whiteSpace: "nowrap" }}
      />
    </div>
  );
}
