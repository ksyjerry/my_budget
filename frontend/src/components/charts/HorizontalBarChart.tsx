"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import * as d3 from "d3";

interface BarDatum {
  name: string;
  budget: number;
  actual: number;
}

interface HorizontalBarChartProps {
  data: BarDatum[];
  height?: number;
  onBarClick?: (name: string) => void;
  activeBar?: string | null;
}

const BUDGET_COLOR = "#C6C6C6";
const ACTUAL_COLOR = "#D04A02";
const ACTUAL_OVER_COLOR = "#D93954";
const BAR_HEIGHT = 14;
const BAR_GAP = 2;
const GROUP_PADDING = 0.35;

export default function HorizontalBarChart({
  data,
  height: propHeight,
  onBarClick,
  activeBar,
}: HorizontalBarChartProps) {
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

    const margin = { top: 8, right: 56, bottom: 40, left: 180 };
    const chartW = containerWidth - margin.left - margin.right;
    const rowH = (BAR_HEIGHT * 2 + BAR_GAP) / (1 - GROUP_PADDING);
    const height = propHeight || Math.max(data.length * rowH + margin.top + margin.bottom, 120);
    const chartH = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", containerWidth).attr("height", height);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const maxVal = d3.max(data, (d) => Math.max(d.budget, d.actual)) || 0;
    const x = d3.scaleLinear().domain([0, maxVal * 1.15]).range([0, chartW]).nice();
    const y = d3.scaleBand().domain(data.map((d) => d.name)).range([0, chartH]).padding(GROUP_PADDING);

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
      .attr("y", (d) => (y(d.name) || 0) + y.bandwidth() / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", "end")
      .style("font-size", "11px")
      .style("fill", "#2D2D2D")
      .style("cursor", onBarClick ? "pointer" : "default")
      .text((d) => (d.name.length > 28 ? d.name.slice(0, 28) + "..." : d.name))
      .on("click", (_, d) => onBarClick?.(d.name))
      .append("title").text((d) => d.name);

    // Bar groups
    const groups = g.append("g")
      .selectAll<SVGGElement, BarDatum>("g")
      .data(data)
      .join("g")
      .attr("transform", (d) => `translate(0,${y(d.name) || 0})`)
      .style("cursor", onBarClick ? "pointer" : "default")
      .on("click", (_, d) => onBarClick?.(d.name));

    const halfBand = y.bandwidth() / 2;
    const budgetY = halfBand - BAR_HEIGHT - BAR_GAP / 2;
    const actualY = halfBand + BAR_GAP / 2;

    // Active highlight bg
    if (hasActive) {
      groups.filter((d) => d.name === activeBar)
        .insert("rect", ":first-child")
        .attr("x", -4).attr("y", -2)
        .attr("width", chartW + 8).attr("height", y.bandwidth() + 4)
        .attr("rx", 4).attr("fill", "#FFF3ED")
        .attr("stroke", "#D04A02").attr("stroke-width", 1).attr("stroke-opacity", 0.3);
    }

    // Budget bars
    groups.append("rect")
      .attr("y", budgetY).attr("height", BAR_HEIGHT).attr("rx", 2)
      .attr("fill", BUDGET_COLOR)
      .attr("opacity", (d) => (hasActive && d.name !== activeBar ? 0.2 : 1))
      .attr("width", 0)
      .on("mouseenter", function (event, d) {
        if (!hasActive || d.name === activeBar) d3.select(this).transition().duration(150).attr("fill", "#ABABAB");
        showTooltip(event,
          `<strong>${d.name}</strong><br/><span style="color:${BUDGET_COLOR}">&#9679;</span> Budget: <strong>${d.budget.toLocaleString()}</strong>`);
      })
      .on("mousemove", function (event, d) {
        showTooltip(event,
          `<strong>${d.name}</strong><br/><span style="color:${BUDGET_COLOR}">&#9679;</span> Budget: <strong>${d.budget.toLocaleString()}</strong>`);
      })
      .on("mouseleave", function () {
        d3.select(this).transition().duration(150).attr("fill", BUDGET_COLOR);
        hideTooltip();
      })
      .transition().duration(600).delay((_, i) => i * 80)
      .attr("width", (d) => x(d.budget));

    // Actual bars
    groups.append("rect")
      .attr("y", actualY).attr("height", BAR_HEIGHT).attr("rx", 2)
      .attr("fill", (d) => (d.actual > d.budget && d.budget > 0 ? ACTUAL_OVER_COLOR : ACTUAL_COLOR))
      .attr("opacity", (d) => (hasActive && d.name !== activeBar ? 0.2 : 1))
      .attr("width", 0)
      .on("mouseenter", function (event, d) {
        const base = d.actual > d.budget && d.budget > 0 ? ACTUAL_OVER_COLOR : ACTUAL_COLOR;
        if (!hasActive || d.name === activeBar)
          d3.select(this).transition().duration(150).attr("fill", d3.color(base)!.darker(0.3).formatHex());
        const pct = d.budget > 0 ? ((d.actual / d.budget) * 100).toFixed(1) : "-";
        showTooltip(event,
          `<strong>${d.name}</strong><br/><span style="color:${ACTUAL_COLOR}">&#9679;</span> Actual: <strong>${d.actual.toLocaleString()}</strong><br/>Progress: <strong>${pct}%</strong>`);
      })
      .on("mousemove", function (event, d) {
        const pct = d.budget > 0 ? ((d.actual / d.budget) * 100).toFixed(1) : "-";
        showTooltip(event,
          `<strong>${d.name}</strong><br/><span style="color:${ACTUAL_COLOR}">&#9679;</span> Actual: <strong>${d.actual.toLocaleString()}</strong><br/>Progress: <strong>${pct}%</strong>`);
      })
      .on("mouseleave", function (_, d) {
        d3.select(this).transition().duration(150)
          .attr("fill", d.actual > d.budget && d.budget > 0 ? ACTUAL_OVER_COLOR : ACTUAL_COLOR);
        hideTooltip();
      })
      .transition().duration(600).delay((_, i) => i * 80 + 100)
      .attr("width", (d) => x(d.actual));

    // Progress % labels
    groups.append("text")
      .attr("x", (d) => x(Math.max(d.budget, d.actual)) + 6)
      .attr("y", halfBand).attr("dy", "0.35em")
      .style("font-size", "10px").style("fill", "#6D6D6D").style("opacity", 0)
      .text((d) => {
        const pct = d.budget > 0 ? ((d.actual / d.budget) * 100).toFixed(0) : "0";
        return `${pct}%`;
      })
      .transition().duration(400).delay((_, i) => i * 80 + 500)
      .style("opacity", (d) => (hasActive && d.name !== activeBar ? "0.2" : "1"));

    // Legend
    const legend = svg.append("g").attr("transform", `translate(${margin.left},${height - 12})`);
    [
      { label: "Budget", color: BUDGET_COLOR },
      { label: "Actual", color: ACTUAL_COLOR },
    ].forEach((item, i) => {
      const lg = legend.append("g").attr("transform", `translate(${i * 80},0)`);
      lg.append("rect").attr("width", 12).attr("height", 10).attr("rx", 2).attr("fill", item.color);
      lg.append("text").attr("x", 16).attr("y", 9).style("font-size", "11px").style("fill", "#6D6D6D").text(item.label);
    });
  }, [data, containerWidth, propHeight, hasActive, activeBar, onBarClick, showTooltip, hideTooltip]);

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
