"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import * as d3 from "d3";

const COLORS = [
  "#D04A02", "#EB8C00", "#FFB600", "#C6C6C6",
  "#6D6D6D", "#2D2D2D", "#4A90D9", "#8B5CF6",
  "#22992E", "#D93954",
];

interface DonutChartProps {
  data: { name: string; value: number }[];
  height?: number;
  onSegmentClick?: (name: string) => void;
  activeSegment?: string | null;
}

export default function DonutChart({
  data,
  height = 280,
  onSegmentClick,
  activeSegment,
}: DonutChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);
  const hasActive = activeSegment != null;

  const sortedData = useMemo(() => [...data].sort((a, b) => b.value - a.value), [data]);

  // Observe container width for responsive layout
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

  // Donut chart size: fill available space, reserve space for legend
  const donutSize = useMemo(() => {
    if (containerWidth === 0) return height;
    // Legend takes ~200px, rest goes to donut, capped at height
    const available = containerWidth - 220;
    return Math.max(180, Math.min(height, available));
  }, [height, containerWidth]);

  useEffect(() => {
    if (!svgRef.current || sortedData.length === 0 || donutSize === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const size = donutSize;
    const outerRadius = size / 2 - 6;
    const innerRadius = outerRadius * 0.58;

    svg.attr("width", size).attr("height", size);

    const g = svg.append("g").attr("transform", `translate(${size / 2},${size / 2})`);

    const pie = d3
      .pie<{ name: string; value: number }>()
      .value((d) => d.value)
      .sort(null)
      .padAngle(0.012);

    const arc = d3
      .arc<d3.PieArcDatum<{ name: string; value: number }>>()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius)
      .cornerRadius(2);

    const arcHover = d3
      .arc<d3.PieArcDatum<{ name: string; value: number }>>()
      .innerRadius(innerRadius - 2)
      .outerRadius(outerRadius + 8)
      .cornerRadius(2);

    const arcs = pie(sortedData);

    // Paths
    g.selectAll("path")
      .data(arcs)
      .join("path")
      .attr("d", arc)
      .attr("fill", (_, i) => COLORS[i % COLORS.length])
      .attr("opacity", (d) => (hasActive && d.data.name !== activeSegment ? 0.2 : 1))
      .attr("cursor", onSegmentClick ? "pointer" : "default")
      .on("mouseenter", function (event, d) {
        const i = arcs.indexOf(d);
        setHoveredIndex(i);
        d3.select(this).transition().duration(200)
          .attr("d", arcHover(d) as string).attr("opacity", 1);
        const pct = Math.round((d.data.value / total) * 100);
        showTooltip(event, `<strong>${d.data.name}</strong><br/>${Math.round(d.data.value).toLocaleString()} (${pct}%)`);
      })
      .on("mousemove", function (event, d) {
        const pct = Math.round((d.data.value / total) * 100);
        showTooltip(event, `<strong>${d.data.name}</strong><br/>${Math.round(d.data.value).toLocaleString()} (${pct}%)`);
      })
      .on("mouseleave", function (_, d) {
        setHoveredIndex(null);
        d3.select(this).transition().duration(200)
          .attr("d", arc(d) as string)
          .attr("opacity", hasActive && d.data.name !== activeSegment ? 0.2 : 1);
        hideTooltip();
      })
      .on("click", (_, d) => onSegmentClick?.(d.data.name));

    // Center total label
    g.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "-0.2em")
      .style("font-size", `${Math.max(11, size / 16)}px`)
      .style("fill", "#6D6D6D")
      .text("합계");
    g.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "1.2em")
      .style("font-size", `${Math.max(14, size / 12)}px`)
      .style("font-weight", "700")
      .style("fill", "#2D2D2D")
      .text(Math.round(total).toLocaleString());

    // Entry animation
    g.selectAll("path")
      .attr("opacity", 0)
      .transition()
      .duration(600)
      .delay((_, i) => i * 50)
      .attr("opacity", (d) => {
        const datum = d as unknown as d3.PieArcDatum<{ name: string; value: number }>;
        return hasActive && datum.data.name !== activeSegment ? 0.2 : 1;
      });
  }, [sortedData, donutSize, total, hasActive, activeSegment, onSegmentClick, showTooltip, hideTooltip]);

  return (
    <div ref={containerRef} className="relative w-full flex items-center gap-4">
      {/* Donut SVG — centered in remaining space */}
      <div className="flex-1 flex items-center justify-center">
        <div className="relative shrink-0" style={{ width: donutSize, height: donutSize }}>
          <svg ref={svgRef} />
        </div>
      </div>

      {/* Legend — right-aligned, vertically centered */}
      <div className="flex flex-col justify-center gap-1 text-xs shrink-0 py-1">
        {sortedData.map((d, i) => {
          const pct = Math.round((d.value / total) * 100);
          const dimmed = hasActive && d.name !== activeSegment;
          const highlighted = hoveredIndex === i;

          return (
            <div
              key={d.name}
              className={`flex items-center gap-2 rounded px-2 py-1 -mx-1 transition-all duration-150 ${
                onSegmentClick ? "cursor-pointer hover:bg-pwc-gray-50" : ""
              } ${highlighted ? "bg-pwc-gray-50" : ""}`}
              style={{ opacity: dimmed ? 0.25 : 1 }}
              onClick={() => onSegmentClick?.(d.name)}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <span
                className="w-3 h-3 rounded-full inline-block shrink-0"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className="text-pwc-gray-900 whitespace-nowrap">
                {d.name}{" "}
                <span className="text-pwc-gray-600 font-medium">
                  {Math.round(d.value).toLocaleString()}
                </span>{" "}
                <span className="text-pwc-gray-600">({pct}%)</span>
              </span>
            </div>
          );
        })}
      </div>

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="absolute pointer-events-none bg-white border border-pwc-gray-100 shadow-lg rounded-lg px-3 py-2 text-xs text-pwc-gray-900 opacity-0 transition-opacity duration-150 z-10"
        style={{ whiteSpace: "nowrap" }}
      />
    </div>
  );
}
