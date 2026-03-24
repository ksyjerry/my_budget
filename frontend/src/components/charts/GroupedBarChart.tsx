"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import * as d3 from "d3";

interface GroupedBarDatum {
  group: string;
  [key: string]: string | number;
}

interface SeriesConfig {
  key: string;
  label: string;
  color: string;
}

interface GroupedBarChartProps {
  data: GroupedBarDatum[];
  series: SeriesConfig[];
  height?: number;
  onBarClick?: (group: string) => void;
  activeBar?: string | null;
}

const BAR_HEIGHT = 12;
const BAR_GAP = 2;
const GROUP_PADDING = 0.3;

export default function GroupedBarChart({
  data,
  series,
  height: propHeight,
  onBarClick,
  activeBar,
}: GroupedBarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const hasActive = activeBar != null;

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

  useEffect(() => {
    if (!svgRef.current || !data.length || containerWidth === 0) return;

    const margin = { top: 8, right: 40, bottom: 44, left: 50 };
    const chartW = containerWidth - margin.left - margin.right;
    const seriesCount = series.length;
    const rowH = (BAR_HEIGHT * seriesCount + BAR_GAP * (seriesCount - 1)) / (1 - GROUP_PADDING);
    const height = propHeight || Math.max(data.length * rowH + margin.top + margin.bottom, 120);
    const chartH = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", containerWidth).attr("height", height);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Scales
    const maxVal = d3.max(data, (d) => d3.max(series, (s) => Number(d[s.key]) || 0)) || 0;
    const x = d3.scaleLinear().domain([0, maxVal * 1.12]).range([0, chartW]).nice();
    const y = d3.scaleBand().domain(data.map((d) => d.group)).range([0, chartH]).padding(GROUP_PADDING);
    const ySub = d3.scaleBand().domain(series.map((s) => s.key)).range([0, y.bandwidth()]).padding(0.15);

    // Grid
    g.append("g")
      .selectAll("line")
      .data(x.ticks(5))
      .join("line")
      .attr("x1", (d) => x(d)).attr("x2", (d) => x(d))
      .attr("y1", 0).attr("y2", chartH)
      .attr("stroke", "#E8E8E8").attr("stroke-dasharray", "3,3");

    // X axis
    g.append("g")
      .attr("transform", `translate(0,${chartH})`)
      .call(
        d3.axisBottom(x).ticks(5).tickFormat((d) => {
          const n = d as number;
          return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
        }),
      )
      .call((a) => a.select(".domain").remove())
      .selectAll("text").style("font-size", "11px").style("fill", "#6D6D6D");

    // Y separator
    g.append("line").attr("x1", 0).attr("x2", 0).attr("y1", 0).attr("y2", chartH).attr("stroke", "#E0E0E0");

    // Y labels
    g.append("g")
      .selectAll("text")
      .data(data)
      .join("text")
      .attr("x", -8)
      .attr("y", (d) => (y(d.group) || 0) + y.bandwidth() / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", "end")
      .style("font-size", "12px")
      .style("font-weight", "500")
      .style("fill", "#2D2D2D")
      .style("cursor", onBarClick ? "pointer" : "default")
      .text((d) => d.group)
      .on("click", (_, d) => onBarClick?.(d.group));

    // Bar groups
    const groups = g.append("g")
      .selectAll<SVGGElement, GroupedBarDatum>("g")
      .data(data)
      .join("g")
      .attr("transform", (d) => `translate(0,${y(d.group) || 0})`)
      .style("cursor", onBarClick ? "pointer" : "default")
      .on("click", (_, d) => onBarClick?.(d.group));

    // Active highlight
    if (hasActive) {
      groups.filter((d) => d.group === activeBar)
        .insert("rect", ":first-child")
        .attr("x", -4).attr("y", -2)
        .attr("width", chartW + 8).attr("height", y.bandwidth() + 4)
        .attr("rx", 4).attr("fill", "#FFF3ED")
        .attr("stroke", "#D04A02").attr("stroke-width", 1).attr("stroke-opacity", 0.3);
    }

    // Bars per series
    series.forEach((s, si) => {
      groups.append("rect")
        .attr("y", () => ySub(s.key) || 0)
        .attr("height", ySub.bandwidth())
        .attr("rx", 2)
        .attr("fill", s.color)
        .attr("opacity", (d) => (hasActive && d.group !== activeBar ? 0.2 : 1))
        .attr("width", 0)
        .on("mouseenter", function (event, d) {
          if (!hasActive || d.group === activeBar)
            d3.select(this).transition().duration(150).attr("fill", d3.color(s.color)!.darker(0.2).formatHex());
          const lines = series.map((ss) =>
            `<span style="color:${ss.color}">&#9679;</span> ${ss.label}: <strong>${Number(d[ss.key] || 0).toLocaleString()}</strong>`
          ).join("<br/>");
          showTooltip(event, `<strong>${d.group}</strong><br/>${lines}`);
        })
        .on("mousemove", function (event, d) {
          const lines = series.map((ss) =>
            `<span style="color:${ss.color}">&#9679;</span> ${ss.label}: <strong>${Number(d[ss.key] || 0).toLocaleString()}</strong>`
          ).join("<br/>");
          showTooltip(event, `<strong>${d.group}</strong><br/>${lines}`);
        })
        .on("mouseleave", function (_, d) {
          d3.select(this).transition().duration(150).attr("fill", s.color);
          hideTooltip();
        })
        .transition().duration(600).delay((_, i) => i * 80 + si * 100)
        .attr("width", (d) => x(Number(d[s.key]) || 0));
    });

    // Legend
    const legend = svg.append("g").attr("transform", `translate(${margin.left},${height - 14})`);
    series.forEach((s, i) => {
      const lg = legend.append("g").attr("transform", `translate(${i * 90},0)`);
      lg.append("rect").attr("width", 12).attr("height", 10).attr("rx", 2).attr("fill", s.color);
      lg.append("text").attr("x", 16).attr("y", 9).style("font-size", "11px").style("fill", "#6D6D6D").text(s.label);
    });
  }, [data, series, containerWidth, propHeight, hasActive, activeBar, onBarClick, showTooltip, hideTooltip]);

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
