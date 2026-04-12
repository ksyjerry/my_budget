"use client";

import { useState, useMemo } from "react";
import FilterBar from "@/components/filters/FilterBar";
import KPICard from "@/components/ui/KPICard";
import DonutChart from "@/components/charts/DonutChart";
import HorizontalBarChart from "@/components/charts/HorizontalBarChart";
import { useApi, buildQuery, useFilterOptions } from "@/hooks/useApi";
import type { ProjectListItem, ProjectDetail } from "@/hooks/useApi";
import { CrossFilterProvider, useCrossFilter, applyFilters } from "@/lib/cross-filter";
import { getCategoryOrder } from "@/lib/budget-constants";
import { gradeRank } from "@/lib/grade";
import LoadingOverlay from "@/components/ui/LoadingOverlay";

// --------------- Empty Defaults ---------------

const EMPTY_KPI_DATA = [
  { label: "총 계약시간", value: "-" as string | number, highlight: true },
  { label: "FLDT-Staff", value: "-" as string | number },
  { label: "Fulcrum", value: "-" as string | number },
  { label: "RA-Staff", value: "-" as string | number },
  { label: "Specialist", value: "-" as string | number },
  { label: "AX/DX", value: "-" as string | number },
  { label: "RM/CRS/M&T", value: "-" as string | number },
  { label: "RA-EL/PM", value: "-" as string | number },
  { label: "출장", value: "-" as string | number },
  { label: "검증", value: "-" as string | number },
];

interface TreePerson {
  team: string;
  name: string;
  empId: string;
  rank: string;
  budget: number | null;
  actual: number | null;
  remaining: number | null;
  progress: number | null;
}

interface TreeBudgetUnit {
  unitName: string;
  category?: string;
  people: TreePerson[];
  totalBudget: number;
  totalActual: number;
  totalRemaining: number;
  totalProgress: number | null;
}

interface TreeProject {
  projectName: string;
  units: TreeBudgetUnit[];
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

  return <span className={`font-medium ${colorClass}`}>{Math.round(value)}%</span>;
}

function SearchIcon() {
  return (
    <svg className="w-4 h-4 text-pwc-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

// --------------- Format Helpers ---------------

function fmtNum(v: number | null): string {
  if (v === null || v === undefined) return "";
  return Math.round(v).toLocaleString();
}

// --------------- Cross-filtered Detail Panel ---------------

function ProjectDetailPanel({
  donutData,
  barData,
  treeData,
}: {
  donutData: { name: string; value: number }[];
  barData: { name: string; budget: number; actual: number }[];
  treeData: TreeProject[];
}) {
  const {
    toggleFilter,
    isSelected,
    hasActiveFilter,
    clearAll,
    getActiveFilters,
  } = useCrossFilter();

  // Active segment/bar derived from cross-filter state
  const donutActive = useMemo(() => {
    const sel = getActiveFilters("__none__").find((s) => s.sourceId === "fldtDonut");
    return sel?.value ?? null;
  }, [getActiveFilters]);

  const barActive = useMemo(() => {
    const sel = getActiveFilters("__none__").find((s) => s.sourceId === "activityBar");
    return sel?.value ?? null;
  }, [getActiveFilters]);

  // Determine which budget_category values are active from any filter source
  const activeCategoryFilter = useMemo(() => {
    const sel = getActiveFilters("__none__").find((s) => s.dimension === "budget_category");
    return sel?.value ?? null;
  }, [getActiveFilters]);

  // Determine which budget_unit values are active from the tree table filter
  const activeUnitFilter = useMemo(() => {
    const sel = getActiveFilters("__none__").find((s) => s.dimension === "budget_unit");
    return sel?.value ?? null;
  }, [getActiveFilters]);

  // Determine which fldt_type values are active from the donut filter
  const activeFldtFilter = useMemo(() => {
    const sel = getActiveFilters("__none__").find((s) => s.dimension === "fldt_type");
    return sel?.value ?? null;
  }, [getActiveFilters]);

  // Filter donut data based on other sources' filters (exclude own sourceId)
  const filteredDonutData = useMemo(() => {
    const otherFilters = getActiveFilters("fldtDonut");
    return applyFilters(donutData, otherFilters, (item, dimension) => {
      if (dimension === "budget_category") return undefined; // donut doesn't have budget_category dimension
      if (dimension === "budget_unit") return undefined;
      return item.name;
    });
  }, [donutData, getActiveFilters]);

  // Filter bar data based on other sources' filters
  const filteredBarData = useMemo(() => {
    const otherFilters = getActiveFilters("activityBar");
    return applyFilters(barData, otherFilters, (item, dimension) => {
      if (dimension === "budget_category") return item.name;
      if (dimension === "fldt_type") return undefined; // bar doesn't have fldt_type dimension
      if (dimension === "budget_unit") return undefined;
      return item.name;
    });
  }, [barData, getActiveFilters]);

  // Filter tree data based on cross-filter selections from donut and bar
  const filteredTreeData = useMemo(() => {
    if (!hasActiveFilter) return treeData;

    const otherFilters = getActiveFilters("treeTable");

    if (otherFilters.length === 0) return treeData;

    return treeData.map((project) => {
      const filteredUnits = project.units.filter((unit) => {
        return otherFilters.every((f) => {
          if (f.dimension === "budget_category") {
            return unit.category === f.value || unit.unitName === f.value;
          }
          if (f.dimension === "fldt_type") {
            // fldt_type filtering: "FLDT-Staff" shows all units, "Fulcrum" would show none from tree
            // This is a simplified mapping - in practice the tree table shows FLDT-Staff detail
            return true;
          }
          return true;
        });
      });

      return { ...project, units: filteredUnits };
    }).filter((p) => p.units.length > 0);
  }, [treeData, hasActiveFilter, getActiveFilters]);

  // Determine highlight state for tree table units
  const isUnitHighlighted = (unit: TreeBudgetUnit): boolean => {
    if (!hasActiveFilter) return false;

    if (activeCategoryFilter) {
      return unit.category === activeCategoryFilter || unit.unitName === activeCategoryFilter;
    }
    if (activeUnitFilter) {
      return unit.unitName === activeUnitFilter;
    }
    if (activeFldtFilter) {
      return true; // All units highlighted when filtering by FLDT type
    }
    return false;
  };

  return (
    <div className="flex-1 space-y-5 min-w-0">
      {/* Charts row */}
      <div className="grid grid-cols-2 gap-5">
        {/* Donut Chart */}
        <div className="section-card">
          <h3 className="text-sm font-bold text-pwc-black uppercase tracking-wide mb-3">FLDT구분별 Budget 현황</h3>
          <DonutChart
            data={filteredDonutData}
            height={200}
            onSegmentClick={(name) => toggleFilter("fldtDonut", "fldt_type", name)}
            activeSegment={donutActive}
          />
        </div>

        {/* Horizontal Bar Chart */}
        <div className="section-card">
          <h3 className="text-sm font-bold text-pwc-black uppercase tracking-wide mb-3">Activity별 Time 현황</h3>
          <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
            <HorizontalBarChart
              data={filteredBarData}
              onBarClick={(name) => toggleFilter("activityBar", "budget_category", name)}
              activeBar={barActive}
            />
          </div>
        </div>
      </div>

      {/* Flat Detail Table per project */}
      {filteredTreeData.map((project) => {
        const projectTotalBudget = project.units.reduce((s, u) => s + u.totalBudget, 0);
        const projectTotalActual = project.units.reduce((s, u) => s + u.totalActual, 0);
        const projectTotalRemaining = project.units.reduce((s, u) => s + u.totalRemaining, 0);
        const projectProgress = projectTotalBudget > 0 ? (projectTotalActual / projectTotalBudget) * 100 : null;

        // Flatten: category → unit → people, compute rowspan for merging
        const flatRows: {
          category: string; unit: string; person: TreePerson;
          categoryRowSpan: number; unitRowSpan: number;
          showCategory: boolean; showUnit: boolean;
        }[] = [];

        // Group by category first, sorted by CATEGORY_ORDER
        const catMap = new Map<string, TreeBudgetUnit[]>();
        for (const u of project.units) {
          const cat = u.category || "기타";
          if (!catMap.has(cat)) catMap.set(cat, []);
          catMap.get(cat)!.push(u);
        }

        const sortedCats = [...catMap.entries()].sort(
          (a, b) => getCategoryOrder(a[0]) - getCategoryOrder(b[0])
        );

        for (const [cat, units] of sortedCats) {
          const catPersonCount = units.reduce((s, u) => s + Math.max(u.people.length, 1), 0);
          let isFirstCat = true;

          for (const unit of units) {
            const unitPersonCount = Math.max(unit.people.length, 1);
            let isFirstUnit = true;

            if (unit.people.length === 0) {
              flatRows.push({
                category: cat, unit: unit.unitName,
                person: { team: "", name: "", empId: "", rank: "", budget: 0, actual: 0, remaining: 0, progress: null },
                categoryRowSpan: isFirstCat ? catPersonCount : 0,
                unitRowSpan: isFirstUnit ? unitPersonCount : 0,
                showCategory: isFirstCat, showUnit: isFirstUnit,
              });
              isFirstCat = false;
              isFirstUnit = false;
            } else {
              for (const p of unit.people) {
                flatRows.push({
                  category: cat, unit: unit.unitName, person: p,
                  categoryRowSpan: isFirstCat ? catPersonCount : 0,
                  unitRowSpan: isFirstUnit ? unitPersonCount : 0,
                  showCategory: isFirstCat, showUnit: isFirstUnit,
                });
                isFirstCat = false;
                isFirstUnit = false;
              }
            }
          }
        }

        return (
          <div key={project.projectName} className="bg-white rounded-lg border border-pwc-gray-100/60 shadow-sm overflow-hidden">
            {/* Project title header */}
            <div className="px-4 py-3 border-b border-pwc-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-pwc-black truncate">{project.projectName}</h3>
              <div className="flex items-center gap-4 text-xs text-pwc-gray-600 shrink-0">
                <span>Budget: <b className="text-pwc-black">{fmtNum(projectTotalBudget)}</b></span>
                <span>Actual: <b className="text-pwc-black">{fmtNum(projectTotalActual)}</b></span>
                <span>잔여: <b className="text-pwc-black">{fmtNum(projectTotalRemaining)}</b></span>
                <ProgressBadge value={projectProgress} />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-pwc-gray-50 border-b border-pwc-gray-100">
                    <th className="text-left px-3 py-2 font-semibold text-pwc-gray-900 w-[100px]">대분류</th>
                    <th className="text-left px-3 py-2 font-semibold text-pwc-gray-900 w-[160px]">Budget 관리단위</th>
                    <th className="text-left px-3 py-2 font-semibold text-pwc-gray-900 w-[100px]">본부명</th>
                    <th className="text-left px-3 py-2 font-semibold text-pwc-gray-900 w-[130px]">성명(사번)</th>
                    <th className="text-center px-3 py-2 font-semibold text-pwc-gray-900 w-[50px]">직급</th>
                    <th className="text-right px-3 py-2 font-semibold text-pwc-gray-900 w-[70px]">Budget</th>
                    <th className="text-right px-3 py-2 font-semibold text-pwc-gray-900 w-[70px]">Actual</th>
                    <th className="text-right px-3 py-2 font-semibold text-pwc-gray-900 w-[80px]">잔여Budget</th>
                    <th className="text-right px-3 py-2 font-semibold text-pwc-gray-900 w-[70px]">진행률(%)</th>
                  </tr>
                </thead>
                <tbody>
                  {flatRows.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-6 text-center text-sm text-pwc-gray-600">데이터가 없습니다.</td></tr>
                  )}
                  {flatRows.map((row, i) => (
                    <tr key={i} className={`border-b border-pwc-gray-100 hover:bg-gray-50 ${row.showCategory ? "border-t border-t-pwc-gray-200" : ""}`}>
                      {row.showCategory && (
                        <td className="px-3 py-1.5 text-pwc-gray-600 font-medium align-top border-r border-pwc-gray-100" rowSpan={row.categoryRowSpan}>
                          {row.category}
                        </td>
                      )}
                      {row.showUnit && (
                        <td className="px-3 py-1.5 text-pwc-gray-900 font-medium align-top border-r border-pwc-gray-100" rowSpan={row.unitRowSpan}>
                          {row.unit}
                        </td>
                      )}
                      <td className="px-3 py-1.5 text-pwc-gray-600">{row.person.team}</td>
                      <td className="px-3 py-1.5 text-pwc-gray-900">
                        {row.person.name}{row.person.empId ? `(${row.person.empId})` : ""}
                      </td>
                      <td className="px-3 py-1.5 text-center text-pwc-gray-600">{row.person.rank}</td>
                      <td className="px-3 py-1.5 text-right text-pwc-gray-900">{fmtNum(row.person.budget)}</td>
                      <td className="px-3 py-1.5 text-right text-pwc-gray-900">{fmtNum(row.person.actual)}</td>
                      <td className="px-3 py-1.5 text-right text-pwc-gray-900">{fmtNum(row.person.remaining)}</td>
                      <td className="px-3 py-1.5 text-right"><ProgressBadge value={row.person.progress} /></td>
                    </tr>
                  ))}
                  {/* Total row */}
                  <tr className="border-t-2 border-pwc-black bg-pwc-gray-50 font-semibold">
                    <td colSpan={5} className="px-3 py-2 text-right">합계</td>
                    <td className="px-3 py-2 text-right">{fmtNum(projectTotalBudget)}</td>
                    <td className="px-3 py-2 text-right">{fmtNum(projectTotalActual)}</td>
                    <td className="px-3 py-2 text-right">{fmtNum(projectTotalRemaining)}</td>
                    <td className="px-3 py-2 text-right"><ProgressBadge value={projectProgress} /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      {filteredTreeData.length === 0 && (
        <div className="section-card text-center text-sm text-pwc-gray-600 py-8">데이터가 없습니다.</div>
      )}
    </div>
  );
}

// --------------- Page Component ---------------

export default function ProjectsPage() {
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

  // Derive KPI cards from API or fallback
  const kpiData = useMemo(() => {
    if (projectDetail?.project) {
      const p = projectDetail.project;
      return [
        { label: "총 계약시간", value: p.contract_hours, highlight: true },
        { label: "FLDT-Staff", value: p.et_controllable_budget },
        { label: "Fulcrum", value: p.fulcrum_hours },
        { label: "RA-Staff", value: p.ra_staff_hours },
        { label: "Specialist", value: p.specialist_hours || "-" },
        { label: "AX/DX", value: p.axdx_hours },
        { label: "RM/CRS/M&T", value: p.rm_hours || 0 },
        { label: "RA-EL/PM", value: (p.ra_elpm_hours || 0) + (p.el_hours || 0) + (p.pm_hours || 0) },
        { label: "출장", value: p.travel_hours || 0 },
        { label: "검증", value: (() => {
          const templateTotal = projectDetail?.details
            ? projectDetail.details.reduce((s, d) => s + (d.budget || 0), 0)
            : 0;
          const diff = templateTotal - (p.et_controllable_budget || 0);
          return diff === 0 ? "True" : `False(${diff})`;
        })() },
      ];
    }
    return EMPTY_KPI_DATA;
  }, [projectDetail]);

  // Derive donut chart data from API or fallback
  const donutData = useMemo(() => {
    if (projectDetail?.project) {
      const p = projectDetail.project;
      return [
        { name: "Fulcrum", value: p.fulcrum_hours || 0 },
        { name: "FLDT-Staff", value: p.et_controllable_budget || 0 },
      ];
    }
    return [];
  }, [projectDetail]);

  // Derive bar chart data from API details (aggregate by budget_category) or fallback
  const barData = useMemo(() => {
    if (projectDetail?.details && projectDetail.details.length > 0) {
      const catMap = new Map<string, { budget: number; actual: number }>();
      for (const d of projectDetail.details) {
        const cat = d.category || "기타";
        if (!catMap.has(cat)) catMap.set(cat, { budget: 0, actual: 0 });
        const entry = catMap.get(cat)!;
        entry.budget += d.budget || 0;
        entry.actual += d.actual || 0;
      }
      return Array.from(catMap.entries())
        .map(([name, vals]) => ({
          name,
          budget: vals.budget,
          actual: vals.actual,
        }))
        .sort((a, b) => getCategoryOrder(a.name) - getCategoryOrder(b.name));
    }
    return [];
  }, [projectDetail]);

  // Derive tree table data from API details grouped by unit -> department -> person
  const apiTreeData: TreeProject[] = useMemo(() => {
    if (!projectDetail?.details || projectDetail.details.length === 0) return [];

    const projectName = projectDetail.project?.project_name || "Project";
    const unitMap = new Map<string, { category: string; deptMap: Map<string, typeof projectDetail.details> }>();

    for (const d of projectDetail.details) {
      const unitKey = d.unit || "기타";
      if (!unitMap.has(unitKey)) unitMap.set(unitKey, { category: d.category || "기타", deptMap: new Map() });
      const { deptMap } = unitMap.get(unitKey)!;
      const deptKey = d.department || "";
      if (!deptMap.has(deptKey)) deptMap.set(deptKey, []);
      deptMap.get(deptKey)!.push(d);
    }

    const units: TreeBudgetUnit[] = [];
    for (const [unitName, { category, deptMap }] of unitMap) {
      const people: TreePerson[] = [];
      let totalBudget = 0;
      let totalActual = 0;
      let totalRemaining = 0;

      for (const [dept, persons] of deptMap) {
        for (const p of persons) {
          people.push({
            team: dept,
            name: p.emp_name,
            empId: p.empno,
            rank: p.grade,
            budget: p.budget,
            actual: p.actual,
            remaining: p.remaining,
            progress: p.progress,
          });
          totalBudget += p.budget || 0;
          totalActual += p.actual || 0;
          totalRemaining += p.remaining || 0;
        }
      }

      // grade 순으로 정렬 (P>MD>D>SM>M>SA>A>AA), 같은 grade 는 budget 큰 순
      people.sort((a, b) => {
        const ga = gradeRank(a.rank);
        const gb = gradeRank(b.rank);
        if (ga !== gb) return ga - gb;
        return (b.budget || 0) - (a.budget || 0);
      });

      units.push({
        unitName,
        category,
        people,
        totalBudget,
        totalActual,
        totalRemaining,
        totalProgress: totalBudget > 0 ? (totalActual / totalBudget) * 100 : null,
      });
    }

    return [{ projectName, units }];
  }, [projectDetail]);

  const treeData = apiTreeData;


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

      {/* KPI Cards */}
      <div className="section-card !p-0 flex divide-x divide-pwc-gray-100/80 overflow-x-auto">
        {kpiData.map((kpi) => (
          <KPICard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            highlight={kpi.highlight}
          />
        ))}
      </div>

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

        {/* Main content with cross-filtering */}
        <CrossFilterProvider>
          <ProjectDetailPanel
            donutData={donutData}
            barData={barData}
            treeData={treeData}
          />
        </CrossFilterProvider>
      </div>
    </div>
  );
}

