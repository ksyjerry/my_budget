"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import HorizontalBarChart from "@/components/charts/HorizontalBarChart";
import DonutChart from "@/components/charts/DonutChart";


const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

function ProgressBadge({ value }: { value: number }) {
  if (value === 0) return <span className="text-pwc-gray-600">-</span>;
  const color = value > 110 ? "text-pwc-red" : value > 90 ? "text-pwc-orange" : "text-pwc-green";
  return <span className={`font-semibold ${color}`}>{Math.round(value)}%</span>;
}

interface ProjectItem {
  project_code: string; project_name: string;
  el_name: string; pm_name: string;
  budget: number; actual: number; progress: number;
}
interface CategoryItem { name: string; value: number; actual: number }
interface UnitItem { unit: string; category: string; budget: number; actual: number; progress: number }
interface PersonOverviewData {
  kpi: { budget_total: number; actual_total: number; progress: number };
  projects: ProjectItem[];
  budget_by_category: CategoryItem[];
  budget_by_unit: UnitItem[];
}

export default function PersonOverviewPage() {
  const [data, setData] = useState<PersonOverviewData | null>(null);
  const [filteredData, setFilteredData] = useState<PersonOverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Always fetch full (unfiltered) data once
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/overview-person`, { credentials: "include" });
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch filtered data when project is selected (for donut + unit table)
  useEffect(() => {
    if (!selectedProject) {
      setFilteredData(null);
      return;
    }
    const params = new URLSearchParams({ project_code: selectedProject });
    fetch(`${API_BASE}/api/v1/overview-person?${params}`, { credentials: "include" })
      .then((res) => res.ok ? res.json() : null)
      .then((d) => { if (d) setFilteredData(d); })
      .catch(() => {});
  }, [selectedProject]);

  // Full data (always unfiltered) for bar chart + project table
  const allData = useMemo(() => {
    if (!data) return { projects: [], categories: [], units: [] };
    return {
      projects: data.projects,
      categories: data.budget_by_category,
      units: data.budget_by_unit,
    };
  }, [data]);

  // Filtered data for donut + unit table (falls back to full data when no project selected)
  const viewData = useMemo(() => {
    const src = filteredData || data;
    if (!src) return { categories: [], units: [] };
    return {
      categories: src.budget_by_category,
      units: src.budget_by_unit,
    };
  }, [filteredData, data]);

  const kpi = data?.kpi || { budget_total: 0, actual_total: 0, progress: 0 };

  const barData = useMemo(() =>
    allData.projects.map((p) => ({ name: p.project_name, budget: p.budget, actual: p.actual, project_code: p.project_code })),
    [allData.projects]
  );

  const donutData = useMemo(() =>
    viewData.categories.map((c) => ({ name: c.name, value: c.value })),
    [viewData.categories]
  );

  const projTotalBudget = allData.projects.reduce((s, p) => s + p.budget, 0);
  const projTotalActual = allData.projects.reduce((s, p) => s + p.actual, 0);
  const projTotalProgress = projTotalBudget > 0 ? (projTotalActual / projTotalBudget) * 100 : 0;

  const handleBarClick = (name: string) => {
    const proj = allData.projects.find((p) => p.project_name === name);
    if (!proj) return;
    setSelectedProject((prev) => prev === proj.project_code ? null : proj.project_code);
  };

  const handleDonutClick = (name: string) => {
    setSelectedCategory((prev) => prev === name ? null : name);
  };

  const handleProjectRowClick = (code: string) => {
    setSelectedProject((prev) => prev === code ? null : code);
  };

  if (loading && !data) {
    return <div className="p-6 text-sm text-pwc-gray-600">데이터를 불러오는 중...</div>;
  }

  return (
    <div className="p-6 space-y-4">
      {/* Top: Bar chart + KPI + Project Table */}
      <div className="grid grid-cols-12 gap-4">
        {/* Bar Chart */}
        <div className="col-span-5 bg-white rounded-lg border border-pwc-gray-100/60 shadow-sm p-4">
          <h3 className="text-sm font-bold text-pwc-black mb-3 pb-2 border-b border-pwc-gray-100">
            프로젝트별 Time 현황
          </h3>
          {barData.length === 0 ? (
            <div className="py-12 text-center text-sm text-pwc-gray-600">데이터가 없습니다.</div>
          ) : (
            <div className="overflow-y-auto" style={{ maxHeight: 380 }}>
              <HorizontalBarChart
                data={barData}
                onBarClick={handleBarClick}
                activeBar={allData.projects.find((p) => p.project_code === selectedProject)?.project_name || null}
              />
            </div>
          )}
        </div>

        {/* KPI + Table */}
        <div className="col-span-7 space-y-4">
          {/* KPI Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-lg border border-pwc-gray-100/60 shadow-sm px-5 py-4">
              <p className="text-[11px] text-pwc-gray-600 font-medium tracking-wide uppercase mb-1">Budget time (A)</p>
              <p className="text-2xl font-bold text-pwc-orange">{Math.round(kpi.budget_total).toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-lg border border-pwc-gray-100/60 shadow-sm px-5 py-4">
              <p className="text-[11px] text-pwc-gray-600 font-medium tracking-wide uppercase mb-1">Actual time (B)</p>
              <p className="text-2xl font-bold text-pwc-orange">{Math.round(kpi.actual_total).toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-lg border border-pwc-gray-100/60 shadow-sm px-5 py-4">
              <p className="text-[11px] text-pwc-gray-600 font-medium tracking-wide uppercase mb-1">Progress (B)/(A)</p>
              <p className={`text-2xl font-bold ${kpi.progress > 110 ? "text-pwc-red" : kpi.progress > 90 ? "text-pwc-orange" : "text-pwc-green"}`}>
                {Math.round(kpi.progress)}%
              </p>
            </div>
          </div>

          {/* Project Table */}
          <div className="bg-white rounded-lg border border-pwc-gray-100/60 shadow-sm overflow-hidden">
            <div className="overflow-y-auto" style={{ maxHeight: 310 }}>
              <table className="w-full text-xs">
                <thead className="bg-pwc-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-pwc-gray-600">프로젝트명</th>
                    <th className="px-3 py-2 text-left font-semibold text-pwc-gray-600">EL</th>
                    <th className="px-3 py-2 text-left font-semibold text-pwc-gray-600">PM</th>
                    <th className="px-3 py-2 text-right font-semibold text-pwc-gray-600">Budget</th>
                    <th className="px-3 py-2 text-right font-semibold text-pwc-gray-600">Actual</th>
                    <th className="px-3 py-2 text-right font-semibold text-pwc-gray-600">진행률(%)</th>
                  </tr>
                </thead>
                <tbody>
                  {allData.projects.map((p) => (
                    <tr
                      key={p.project_code}
                      onClick={() => handleProjectRowClick(p.project_code)}
                      className={`border-t border-pwc-gray-100 cursor-pointer transition-colors ${
                        selectedProject === p.project_code
                          ? "bg-orange-50 border-l-2 border-l-pwc-orange"
                          : "hover:bg-pwc-gray-50"
                      }`}
                    >
                      <td className="px-3 py-2 text-pwc-black max-w-[240px] truncate">{p.project_name}</td>
                      <td className="px-3 py-2 text-pwc-black">{p.el_name}</td>
                      <td className="px-3 py-2 text-pwc-black">{p.pm_name}</td>
                      <td className="px-3 py-2 text-right text-pwc-black">{Math.round(p.budget).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-pwc-black">{Math.round(p.actual).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right"><ProgressBadge value={p.progress} /></td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-pwc-black bg-pwc-gray-50 font-semibold text-xs">
                    <td className="px-3 py-2" colSpan={3}>합계</td>
                    <td className="px-3 py-2 text-right">{Math.round(projTotalBudget).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{Math.round(projTotalActual).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right"><ProgressBadge value={projTotalProgress} /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom: Donut + Budget Unit Status */}
      <div className="grid grid-cols-12 gap-4">
        {/* Donut Chart */}
        <div className="col-span-5 bg-white rounded-lg border border-pwc-gray-100/60 shadow-sm p-4">
          <h3 className="text-sm font-bold text-pwc-black mb-3 pb-2 border-b border-pwc-gray-100">
            활동별 Budget 현황
          </h3>
          {donutData.length === 0 ? (
            <div className="py-12 text-center text-sm text-pwc-gray-600">데이터가 없습니다.</div>
          ) : (
            <DonutChart
              data={donutData}
              onSegmentClick={handleDonutClick}
              activeSegment={selectedCategory}
            />
          )}
        </div>

        {/* Budget Unit Status */}
        <div className="col-span-7 bg-white rounded-lg border border-pwc-gray-100/60 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-pwc-gray-50 border-b border-pwc-gray-100">
            <h3 className="text-sm font-bold text-pwc-black">Budget 관리단위별 Status</h3>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 380 }}>
            <table className="w-full text-xs">
              <thead className="bg-pwc-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-pwc-gray-600">대분류</th>
                  <th className="px-3 py-2 text-left font-semibold text-pwc-gray-600">관리단위</th>
                  <th className="px-3 py-2 text-right font-semibold text-pwc-gray-600">Budget</th>
                  <th className="px-3 py-2 text-right font-semibold text-pwc-gray-600">Actual</th>
                  <th className="px-3 py-2 text-right font-semibold text-pwc-gray-600">진행률(%)</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const units = viewData.units;
                  const rows: React.ReactNode[] = [];
                  let i = 0;
                  while (i < units.length) {
                    const cat = units[i].category;
                    let span = 1;
                    while (i + span < units.length && units[i + span].category === cat) span++;
                    for (let j = 0; j < span; j++) {
                      const u = units[i + j];
                      rows.push(
                        <tr key={u.unit} className="border-t border-pwc-gray-100 hover:bg-pwc-gray-50">
                          {j === 0 && (
                            <td className="px-3 py-2 text-pwc-black font-medium align-top" rowSpan={span}>{cat}</td>
                          )}
                          <td className="px-3 py-2 text-pwc-black">{u.unit}</td>
                          <td className="px-3 py-2 text-right text-pwc-black">{Math.round(u.budget).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-pwc-black">{Math.round(u.actual).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right"><ProgressBadge value={u.progress} /></td>
                        </tr>
                      );
                    }
                    i += span;
                  }
                  return rows;
                })()}
                {viewData.units.length > 0 && (() => {
                  const totB = viewData.units.reduce((s, u) => s + u.budget, 0);
                  const totA = viewData.units.reduce((s, u) => s + u.actual, 0);
                  const totP = totB > 0 ? (totA / totB) * 100 : 0;
                  return (
                    <tr className="border-t-2 border-pwc-black bg-pwc-gray-50 font-semibold">
                      <td className="px-3 py-2" colSpan={2}>합계</td>
                      <td className="px-3 py-2 text-right">{Math.round(totB).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{Math.round(totA).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right"><ProgressBadge value={totP} /></td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
