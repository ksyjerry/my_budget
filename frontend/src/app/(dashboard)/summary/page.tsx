"use client";

import { useState, useMemo, useCallback } from "react";
import FilterBar from "@/components/filters/FilterBar";
import { useApi, buildQuery, useFilterOptions, SummaryData } from "@/hooks/useApi";
import { CrossFilterProvider, useCrossFilter, applyFilters } from "@/lib/cross-filter";
import GroupedBarChart from "@/components/charts/GroupedBarChart";

// --- Helpers ---

function fmt(n: number): string {
  return Math.round(n).toLocaleString();
}

function yraColor(yra: number): string {
  if (yra > 110) return "text-pwc-red";
  if (yra > 90) return "text-pwc-orange";
  return "text-pwc-green";
}

// --- Inner component that uses cross-filter ---

const GRADE_ORDER: Record<string, number> = {
  P: 0, MD: 1, D: 2, SM: 3, M: 4, SA: 5, A: 6, AA: 7,
};

function SummaryContent() {
  const [filters, setFilters] = useState({
    el_empno: "",
    pm_empno: "",
    department: "",
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "grade" | "budget" | "actual">("name");

  const { toggleFilter, clearAll, isSelected, hasActiveFilter, getActiveFilters } = useCrossFilter();

  const handleGroupBarClick = useCallback(
    (group: string) => toggleFilter("groupBar", "group", group),
    [toggleFilter]
  );

  const query = buildQuery(filters);
  const { data: apiData, loading, error } = useApi<SummaryData>(`/api/v1/summary${query}`);
  const { data: filterOpts } = useFilterOptions();

  // Use API data or empty arrays
  const groups = apiData?.groups || [];
  const projects = apiData?.projects || [];

  // --- Cross-filter: determine active group filter ---
  const activeGroupFilter = useMemo(() => {
    const allSelections = getActiveFilters("__none__"); // get all selections
    const groupSel = allSelections.find((s) => s.dimension === "group");
    return groupSel?.value ?? null;
  }, [getActiveFilters]);

  // --- Cross-filtered projects ---
  const filteredProjects = useMemo(() => {
    const projectFilters = getActiveFilters("projectTable");
    return applyFilters(projects, projectFilters, (item, dimension) => {
      if (dimension === "group") return item.group_code;
      if (dimension === "project_code") return item.project_code;
      return undefined;
    });
  }, [projects, getActiveFilters]);

  // Compute totals from current data
  const groupTotals = useMemo(() => {
    return {
      contract: groups.reduce((s, r) => s + r.contract_hours, 0),
      budget: groups.reduce((s, r) => s + r.total_budget, 0),
      actual: groups.reduce((s, r) => s + r.total_actual, 0),
      axdx: groups.reduce((s, r) => s + r.axdx, 0),
    };
  }, [groups]);

  const groupTotalYra = groupTotals.budget > 0 ? (groupTotals.actual / groupTotals.budget) * 100 : 0;
  const groupTotalRatio = groupTotals.contract > 0 ? (groupTotals.axdx / groupTotals.contract) * 100 : 0;

  // Search + sort applied on top of cross-filtered projects
  const filteredSortedProjects = useMemo(() => {
    let arr = [...filteredProjects];
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      arr = arr.filter((s) =>
        ((s.project_name || "") + "").toLowerCase().includes(q) ||
        ((s.project_code || "") + "").toLowerCase().includes(q)
      );
    }
    arr.sort((a, b) => {
      if (sortBy === "name") return ((a.project_name || "") + "").localeCompare(((b.project_name || "") + ""), "ko");
      if (sortBy === "grade") return (GRADE_ORDER[(a as any).grade] ?? 99) - (GRADE_ORDER[(b as any).grade] ?? 99);
      if (sortBy === "budget") return (b.total_budget ?? 0) - (a.total_budget ?? 0);
      if (sortBy === "actual") return (b.total_actual ?? 0) - (a.total_actual ?? 0);
      return 0;
    });
    return arr;
  }, [filteredProjects, searchQuery, sortBy]);

  const projectTotals = useMemo(() => {
    return {
      contract: filteredSortedProjects.reduce((s, r) => s + r.contract_hours, 0),
      budget: filteredSortedProjects.reduce((s, r) => s + r.total_budget, 0),
      actual: filteredSortedProjects.reduce((s, r) => s + r.total_actual, 0),
      axdx: filteredSortedProjects.reduce((s, r) => s + r.axdx, 0),
    };
  }, [filteredSortedProjects]);

  const projectTotalYra = projectTotals.budget > 0 ? (projectTotals.actual / projectTotals.budget) * 100 : 0;
  const projectTotalRatio = projectTotals.contract > 0 ? (projectTotals.axdx / projectTotals.contract) * 100 : 0;

  // Map groups to chart data
  const chartData = useMemo(() => {
    return groups.map((g) => ({
      group: g.group,
      contract: g.contract_hours,
      budget: g.total_budget,
      actual: g.total_actual,
    }));
  }, [groups]);

  const chartSeries = [
    { key: "contract", label: "총계약시간", color: "#2D2D2D" },
    { key: "budget", label: "Budget", color: "#C6C6C6" },
    { key: "actual", label: "Actual", color: "#D04A02" },
  ];

  const filterBarItems = [
    { name: "el", label: "EL", options: filterOpts?.els || [], value: filters.el_empno, onChange: (v: string) => setFilters((f) => ({ ...f, el_empno: v })) },
    { name: "pm", label: "PM", options: filterOpts?.pms || [], value: filters.pm_empno, onChange: (v: string) => setFilters((f) => ({ ...f, pm_empno: v })) },
    { name: "dept", label: "EL소속본부", options: filterOpts?.departments || [], value: filters.department, onChange: (v: string) => setFilters((f) => ({ ...f, department: v })) },
  ];

  return (
    <div className="min-h-screen">
      {/* Filter Bar */}
      <FilterBar filters={filterBarItems} />

      {/* Error banner */}
      {error && (
        <div className="mx-6 mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
          <span className="text-sm text-red-800 font-medium">데이터를 불러오는 중 오류가 발생했습니다: {error}</span>
        </div>
      )}


      {/* Main Content */}
      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left: Horizontal grouped bar chart */}
          <div className="section-card">
            <div className="flex items-center gap-1.5 mb-4">
              <h3 className="text-sm font-bold text-pwc-black uppercase tracking-wide">그룹별 time 현황</h3>
              <span className="text-pwc-gray-400 text-sm cursor-help" title="그룹별 총계약시간, Budget, Actual 비교">
                &#9432;
              </span>
            </div>
            {chartData.length === 0 && !loading ? (
              <div className="flex items-center justify-center h-[280px] text-sm text-pwc-gray-400">
                표시할 그룹별 데이터가 없습니다.
              </div>
            ) : (
              <GroupedBarChart
                data={chartData}
                series={chartSeries}
                height={320}
                onBarClick={handleGroupBarClick}
                activeBar={activeGroupFilter}
              />
            )}
          </div>

          {/* Right: Two tables stacked */}
          <div className="flex flex-col gap-5">
            {/* Group summary table */}
            <div className="section-card">
              <h3 className="text-sm font-bold text-pwc-black uppercase tracking-wide mb-3">Group Summary</h3>
              <div className="overflow-auto border border-pwc-gray-100 rounded-lg" style={{ maxHeight: "320px" }}>
                <table className="w-full text-sm">
                  <thead className="bg-pwc-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-pwc-gray-600">Group</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-pwc-gray-600">최종계약시간</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-pwc-gray-600">Budget</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-pwc-gray-600">Actual</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-pwc-gray-600">YRA</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-pwc-gray-600">AX/DX</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-pwc-gray-600">비율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.length === 0 && !loading && (
                      <tr><td colSpan={7} className="px-3 py-8 text-center text-xs text-pwc-gray-600">데이터가 없습니다.</td></tr>
                    )}
                    {groups.map((row) => {
                      const selected = isSelected("groupTable", row.group);
                      return (
                        <tr
                          key={row.group}
                          className={`border-t border-pwc-gray-100 cursor-pointer transition-colors ${
                            selected ? "bg-orange-50 border-l-2 border-l-[#D04A02]" : "hover:bg-pwc-gray-50"
                          }`}
                          onClick={() => toggleFilter("groupTable", "group", row.group)}
                        >
                          <td className="px-3 py-1.5 text-xs font-medium">{row.group}</td>
                          <td className="px-3 py-1.5 text-xs text-right">{fmt(row.contract_hours)}</td>
                          <td className="px-3 py-1.5 text-xs text-right">{fmt(row.total_budget)}</td>
                          <td className="px-3 py-1.5 text-xs text-right">{fmt(row.total_actual)}</td>
                          <td className={`px-3 py-1.5 text-xs text-right font-semibold ${yraColor(row.yra)}`}>
                            {Math.round(row.yra)}%
                          </td>
                          <td className="px-3 py-1.5 text-xs text-right">{fmt(row.axdx)}</td>
                          <td className="px-3 py-1.5 text-xs text-right">{Math.round(row.axdx_ratio)}%</td>
                        </tr>
                      );
                    })}
                    {groups.length > 0 && (
                      <tr className="border-t-2 border-pwc-black bg-pwc-gray-50 font-semibold text-sm">
                        <td className="px-3 py-2">합계</td>
                        <td className="px-3 py-2 text-right">{fmt(groupTotals.contract)}</td>
                        <td className="px-3 py-2 text-right">{fmt(groupTotals.budget)}</td>
                        <td className="px-3 py-2 text-right">{fmt(groupTotals.actual)}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${yraColor(groupTotalYra)}`}>
                          {Math.round(groupTotalYra)}%
                        </td>
                        <td className="px-3 py-2 text-right">{fmt(groupTotals.axdx)}</td>
                        <td className="px-3 py-2 text-right">{Math.round(groupTotalRatio)}%</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Project summary table */}
            <div className="section-card">
              <h3 className="text-sm font-bold text-pwc-black uppercase tracking-wide mb-3">Project Summary</h3>
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="text"
                  placeholder="프로젝트명/코드 검색"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="border border-pwc-gray-200 rounded-md px-3 py-1.5 text-sm bg-white w-44"
                />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "name" | "grade" | "budget" | "actual")}
                  className="border border-pwc-gray-200 rounded-md px-3 py-1.5 text-sm bg-white"
                >
                  <option value="name">이름순</option>
                  <option value="grade">직급순</option>
                  <option value="budget">Budget 큰 순</option>
                  <option value="actual">Actual 큰 순</option>
                </select>
              </div>
              <div className="overflow-auto border border-pwc-gray-100 rounded-lg" style={{ maxHeight: "320px" }}>
                <table className="w-full text-sm">
                  <thead className="bg-pwc-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-pwc-gray-600">프로젝트</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-pwc-gray-600">최종계약시간</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-pwc-gray-600">Budget</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-pwc-gray-600">Actual</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-pwc-gray-600">YRA</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-pwc-gray-600">AX/DX</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-pwc-gray-600">비율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSortedProjects.length === 0 && !loading && (
                      <tr><td colSpan={7} className="px-3 py-8 text-center text-xs text-pwc-gray-600">데이터가 없습니다.</td></tr>
                    )}
                    {filteredSortedProjects.map((row, idx) => (
                      <tr key={row.project_code || idx} className="border-t border-pwc-gray-100 hover:bg-pwc-gray-50">
                        <td className="px-3 py-1.5 text-xs whitespace-nowrap max-w-[220px] truncate" title={row.project_name}>
                          {row.project_name}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-right">{fmt(row.contract_hours)}</td>
                        <td className="px-3 py-1.5 text-xs text-right">{fmt(row.total_budget)}</td>
                        <td className="px-3 py-1.5 text-xs text-right">{fmt(row.total_actual)}</td>
                        <td className={`px-3 py-1.5 text-xs text-right font-semibold ${yraColor(row.yra)}`}>
                          {Math.round(row.yra)}%
                        </td>
                        <td className="px-3 py-1.5 text-xs text-right">{fmt(row.axdx)}</td>
                        <td className="px-3 py-1.5 text-xs text-right">{Math.round(row.axdx_ratio)}%</td>
                      </tr>
                    ))}
                    {filteredSortedProjects.length > 0 && (
                      <tr className="border-t-2 border-pwc-black bg-pwc-gray-50 font-semibold text-sm">
                        <td className="px-3 py-2">합계</td>
                        <td className="px-3 py-2 text-right">{fmt(projectTotals.contract)}</td>
                        <td className="px-3 py-2 text-right">{fmt(projectTotals.budget)}</td>
                        <td className="px-3 py-2 text-right">{fmt(projectTotals.actual)}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${yraColor(projectTotalYra)}`}>
                          {Math.round(projectTotalYra)}%
                        </td>
                        <td className="px-3 py-2 text-right">{fmt(projectTotals.axdx)}</td>
                        <td className="px-3 py-2 text-right">{Math.round(projectTotalRatio)}%</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Page component with CrossFilterProvider wrapper ---

export default function SummaryPage() {
  return (
    <CrossFilterProvider>
      <SummaryContent />
    </CrossFilterProvider>
  );
}
