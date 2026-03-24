"use client";

import { useState, useMemo } from "react";
import FilterBar from "@/components/filters/FilterBar";
import DonutChart from "@/components/charts/DonutChart";
import HorizontalBarChart from "@/components/charts/HorizontalBarChart";
import { useApi, buildQuery, useFilterOptions } from "@/hooks/useApi";
import type { ProjectListItem, ProjectDetail } from "@/hooks/useApi";
import { useAuth } from "@/lib/auth";

// --------------- Flat table row type ---------------

interface DetailRow {
  category: string;
  unit: string;
  budget: number;
  actual: number;
  remaining: number;
  progress: number;
}

// --------------- Progress Badge ---------------

function ProgressBadge({ value }: { value: number | null }) {
  if (value === null || value === undefined) {
    return <span className="text-pwc-gray-600">-</span>;
  }
  if (value === 0) {
    return <span className="text-pwc-gray-600">-</span>;
  }

  let colorClass = "text-pwc-green";
  if (value > 110) {
    colorClass = "text-pwc-red";
  } else if (value > 90) {
    colorClass = "text-pwc-orange";
  }

  return <span className={`font-medium ${colorClass}`}>{value.toFixed(1)}%</span>;
}

function SearchIcon() {
  return (
    <svg className="w-4 h-4 text-pwc-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function fmtNum(v: number | null): string {
  if (v === null || v === undefined) return "";
  return v.toLocaleString();
}

// --------------- Page Component ---------------

export default function ProjectsStaffPage() {
  const { user } = useAuth();

  // Filter state
  const [viewMode, setViewMode] = useState("월별");
  const [filterYm, setFilterYm] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filters, setFilters] = useState({
    el_empno: "",
    pm_empno: "",
    department: "",
  });

  // API: filter options
  const { data: filterOpts } = useFilterOptions();

  // API: project list
  const query = buildQuery(filters);
  const { data: projectList, loading: listLoading, error: listError } = useApi<ProjectListItem[]>(`/api/v1/projects${query}`);

  // Engagement sidebar
  const sidebarProjects = useMemo(() => {
    if (projectList && projectList.length > 0) {
      return projectList.map((p) => ({
        code: p.project_code,
        name: p.project_name,
      }));
    }
    return [];
  }, [projectList]);

  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Auto-select first project when sidebar data loads
  const effectiveSelected = selectedProject || (sidebarProjects.length > 0 ? sidebarProjects[0].code : null);

  // API: project detail
  const { data: projectDetail, loading: detailLoading, error: detailError } = useApi<ProjectDetail>(
    effectiveSelected ? `/api/v1/projects/${effectiveSelected}` : null
  );

  // Filter details to current user only
  const myDetails = useMemo(() => {
    if (!projectDetail?.details || !user) return [];
    return projectDetail.details.filter((d) => d.empno === user.empno);
  }, [projectDetail, user]);

  // Derive donut chart data from current user's budget by category
  const donutData = useMemo(() => {
    if (myDetails.length === 0) return [];
    const catMap = new Map<string, number>();
    for (const d of myDetails) {
      const cat = d.category || "기타";
      catMap.set(cat, (catMap.get(cat) || 0) + (d.budget || 0));
    }
    return Array.from(catMap.entries()).map(([name, value]) => ({ name, value }));
  }, [myDetails]);

  // Derive bar chart data from current user's details only
  const barData = useMemo(() => {
    if (myDetails.length > 0) {
      const catMap = new Map<string, { budget: number; actual: number }>();
      for (const d of myDetails) {
        const cat = d.category || "기타";
        if (!catMap.has(cat)) catMap.set(cat, { budget: 0, actual: 0 });
        const entry = catMap.get(cat)!;
        entry.budget += d.budget || 0;
        entry.actual += d.actual || 0;
      }
      return Array.from(catMap.entries()).map(([name, vals]) => ({
        name,
        budget: vals.budget,
        actual: vals.actual,
      }));
    }
    return [];
  }, [myDetails]);

  // Derive flat table rows from current user's details
  const tableRows: DetailRow[] = useMemo(() => {
    return myDetails.map((d) => ({
      category: d.category || "기타",
      unit: d.unit || "기타",
      budget: d.budget || 0,
      actual: d.actual || 0,
      remaining: d.remaining || 0,
      progress: d.progress || 0,
    }));
  }, [myDetails]);

  const filteredEngagements = sidebarProjects.filter(
    (e) =>
      searchTerm === "" ||
      e.code.includes(searchTerm) ||
      e.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isLoading = listLoading || detailLoading;
  const apiError = listError || detailError;

  return (
    <div className="p-6 space-y-5">
      {/* Error banner */}
      {apiError && (
        <div className="flex items-center gap-2 px-4 py-3 text-sm text-pwc-red bg-red-50 border border-red-200 rounded-lg">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          데이터를 불러오는 중 오류가 발생했습니다: {apiError}
        </div>
      )}


      {/* Filter Bar */}
      <FilterBar
        toggles={[
          {
            name: "viewMode",
            options: ["월별", "누적"],
            value: viewMode,
            onChange: setViewMode,
          },
        ]}
        filters={[
          {
            name: "연월",
            label: "연월",
            options: [
              { value: "2025-12", label: "2025-12" },
              { value: "2025-11", label: "2025-11" },
              { value: "2025-10", label: "2025-10" },
            ],
            value: filterYm,
            onChange: setFilterYm,
          },
          {
            name: "대분류명",
            label: "대분류명",
            options: [
              { value: "감사", label: "감사" },
              { value: "세무", label: "세무" },
              { value: "자문", label: "자문" },
            ],
            value: filterCategory,
            onChange: setFilterCategory,
          },
          {
            name: "EL",
            label: "EL",
            options: filterOpts?.els || [],
            value: filters.el_empno,
            onChange: (v: string) => setFilters((prev) => ({ ...prev, el_empno: v })),
          },
          {
            name: "PM",
            label: "PM",
            options: filterOpts?.pms || [],
            value: filters.pm_empno,
            onChange: (v: string) => setFilters((prev) => ({ ...prev, pm_empno: v })),
          },
          {
            name: "EL소속본부",
            label: "EL소속본부",
            options: filterOpts?.departments || [],
            value: filters.department,
            onChange: (v: string) => setFilters((prev) => ({ ...prev, department: v })),
          },
        ]}
      />

      {/* Main Content: Sidebar + Charts + Table */}
      <div className="flex gap-5">
        {/* Left sidebar - Engagement list */}
        <div className="w-[220px] shrink-0">
          <div className="bg-white rounded-lg border border-pwc-gray-100/60 shadow-sm overflow-hidden">
            <div className="px-3 py-2.5 border-b border-pwc-gray-100">
              <h3 className="text-sm font-bold text-pwc-black mb-2">Engagement</h3>
              <div className="relative">
                <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none">
                  <SearchIcon />
                </div>
                <input
                  type="text"
                  placeholder="프로젝트 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-pwc-gray-200 rounded bg-white text-pwc-gray-900 placeholder-pwc-gray-600 focus:outline-none focus:border-pwc-orange"
                />
              </div>
            </div>
            <div className="max-h-[520px] overflow-y-auto">
              {filteredEngagements.length === 0 && !isLoading ? (
                <div className="px-3 py-6 text-center text-xs text-pwc-gray-600">
                  데이터가 없습니다.
                </div>
              ) : (
                filteredEngagements.map((eng) => {
                  const isSelected = eng.code === effectiveSelected;
                  return (
                    <button
                      key={eng.code}
                      onClick={() => setSelectedProject(eng.code)}
                      className={`w-full text-left px-3 py-2.5 border-b border-pwc-gray-100 transition-colors hover:bg-pwc-gray-50 ${
                        isSelected ? "border-l-[3px] border-l-pwc-orange bg-orange-50" : "border-l-[3px] border-l-transparent"
                      }`}
                    >
                      <p className="text-[11px] font-medium text-pwc-gray-900 leading-tight">
                        [{eng.code}]
                      </p>
                      <p className="text-[10px] text-pwc-gray-600 leading-tight mt-0.5 truncate">
                        {eng.name}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 space-y-5 min-w-0">
          {/* Charts row */}
          <div className="grid grid-cols-2 gap-5">
            <div className="section-card">
              <h3 className="text-sm font-bold text-pwc-black uppercase tracking-wide mb-3">활동별 Budget 현황</h3>
              {donutData.length === 0 ? (
                <div className="flex items-center justify-center h-[200px] text-xs text-pwc-gray-600">데이터가 없습니다.</div>
              ) : (
                <DonutChart data={donutData} height={200} />
              )}
            </div>
            <div className="section-card">
              <h3 className="text-sm font-bold text-pwc-black uppercase tracking-wide mb-3">Activity별 Time 현황</h3>
              {barData.length === 0 ? (
                <div className="flex items-center justify-center h-[200px] text-xs text-pwc-gray-600">데이터가 없습니다.</div>
              ) : (
                <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
                  <HorizontalBarChart data={barData} />
                </div>
              )}
            </div>
          </div>

          {/* Flat detail table */}
          <div className="bg-white rounded-lg border border-pwc-gray-100/60 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-pwc-gray-100">
              <h3 className="text-sm font-bold text-pwc-black">Project별 상세내역</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-pwc-gray-50 border-b border-pwc-gray-100">
                    <th className="text-left px-3 py-2 font-semibold text-pwc-gray-900">대분류</th>
                    <th className="text-left px-3 py-2 font-semibold text-pwc-gray-900">Budget관리단위</th>
                    <th className="text-right px-3 py-2 font-semibold text-pwc-gray-900 w-[80px]">Budget</th>
                    <th className="text-right px-3 py-2 font-semibold text-pwc-gray-900 w-[80px]">Actual</th>
                    <th className="text-right px-3 py-2 font-semibold text-pwc-gray-900 w-[90px]">잔여Budget</th>
                    <th className="text-right px-3 py-2 font-semibold text-pwc-gray-900 w-[80px]">진행률(%)</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-pwc-gray-600">
                        데이터가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {tableRows.map((row, i) => (
                        <tr key={i} className="border-b border-pwc-gray-100 hover:bg-pwc-gray-50">
                          <td className="px-3 py-2 text-pwc-gray-900">{row.category}</td>
                          <td className="px-3 py-2 text-pwc-gray-900">{row.unit}</td>
                          <td className="px-3 py-2 text-right text-pwc-gray-900">{fmtNum(row.budget)}</td>
                          <td className="px-3 py-2 text-right text-pwc-gray-900">{fmtNum(row.actual)}</td>
                          <td className={`px-3 py-2 text-right font-medium ${row.remaining < 0 ? "text-pwc-red" : "text-pwc-gray-900"}`}>
                            {fmtNum(row.remaining)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <ProgressBadge value={row.progress} />
                          </td>
                        </tr>
                      ))}
                      {(() => {
                        const totB = tableRows.reduce((s, r) => s + r.budget, 0);
                        const totA = tableRows.reduce((s, r) => s + r.actual, 0);
                        const totR = totB - totA;
                        const totP = totB > 0 ? (totA / totB) * 100 : 0;
                        return (
                          <tr className="border-t-2 border-pwc-black bg-pwc-gray-50 font-semibold">
                            <td className="px-3 py-2" colSpan={2}>합계</td>
                            <td className="px-3 py-2 text-right">{fmtNum(totB)}</td>
                            <td className="px-3 py-2 text-right">{fmtNum(totA)}</td>
                            <td className={`px-3 py-2 text-right ${totR < 0 ? "text-pwc-red" : ""}`}>{fmtNum(totR)}</td>
                            <td className="px-3 py-2 text-right"><ProgressBadge value={totP} /></td>
                          </tr>
                        );
                      })()}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

