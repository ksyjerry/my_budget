"use client";

import { useState, useMemo } from "react";
import { useApi, buildQuery, useFilterOptions, OverviewData } from "@/hooks/useApi";
import KPICard from "@/components/ui/KPICard";
import HorizontalBarChart from "@/components/charts/HorizontalBarChart";
import DonutChart from "@/components/charts/DonutChart";
import FilterBar from "@/components/filters/FilterBar";
import { gradeRank } from "@/lib/grade";

// ── Helper Components ──────────────────────────────
function ProgressBadge({ value }: { value: number }) {
  if (value === 0) return <span className="text-pwc-gray-600">-</span>;
  const color =
    value > 110
      ? "text-pwc-red"
      : value > 90
        ? "text-pwc-orange"
        : "text-pwc-green";
  return <span className={`font-semibold ${color}`}>{Math.round(value)}%</span>;
}

function SummaryRow({ label, budget, actual, progress }: { label: string; budget: number; actual: number; progress: number }) {
  return (
    <tr className="border-t-2 border-pwc-black bg-pwc-gray-50 font-semibold text-sm">
      <td colSpan={3} className="px-3 py-2 text-right">{label}</td>
      <td className="px-3 py-2 text-right">{Math.round(budget).toLocaleString()}</td>
      <td className="px-3 py-2 text-right">{Math.round(actual).toLocaleString()}</td>
      <td className="px-3 py-2 text-right"><ProgressBadge value={progress} /></td>
    </tr>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-sm text-pwc-gray-600">
      {message}
    </div>
  );
}

// ── Main Page (inner) ──────────────────────────────
function OverviewInner() {
  const [viewMode, setViewMode] = useState("누적");
  // Project selection state (highlight bar chart, filter other views)
  const [selectedProjectCode, setSelectedProjectCode] = useState<string | null>(null);

  // Filter state
  const [filters, setFilters] = useState({
    el_empno: "",
    pm_empno: "",
    department: "",
    project_code: "",
    year_month: "",
    service_type: "",
  });

  // Full (unfiltered) API call — always fetches all data
  const query = buildQuery({
    ...filters,
    cumulative: viewMode === "누적" ? "true" : "false",
  });
  const { data: apiData, loading, error } = useApi<OverviewData>(`/api/v1/overview${query}`);
  const { data: filterOpts } = useFilterOptions();

  // Filtered API call — when a project is selected, fetch filtered data for other views
  const filteredQuery = selectedProjectCode
    ? buildQuery({ ...filters, project_code: selectedProjectCode, cumulative: viewMode === "누적" ? "true" : "false" })
    : null;
  const { data: filteredApiData } = useApi<OverviewData>(filteredQuery ? `/api/v1/overview${filteredQuery}` : null);

  // Full data (bar chart + project table always use this)
  const kpi = apiData?.kpi || { contract_hours: 0, axdx_hours: 0, axdx_ratio: 0, staff_budget: 0, actual_hours: 0, progress: 0, template_status: "-" };
  const rawProjects = apiData?.projects || [];

  // Filtered data (donut, budget unit, EL/PM, staff tables use this when project selected)
  const viewSource = (selectedProjectCode && filteredApiData) ? filteredApiData : apiData;
  const budgetByCategory = viewSource?.budget_by_category || [];
  const rawBudgetUnits = viewSource?.budget_by_unit || [];
  const rawElpmQrp = viewSource?.elpm_qrp_time || [];
  const rawStaffTime = viewSource?.staff_time || [];

  // Sort projects by budget descending
  const sortedProjects = useMemo(() => {
    return [...rawProjects].sort((a, b) => b.budget - a.budget);
  }, [rawProjects]);

  // Map to bar chart format
  const allProjectsBar = useMemo(() => {
    return sortedProjects.map((p) => ({ name: p.project_name, budget: p.budget, actual: p.actual, project_code: p.project_code }));
  }, [sortedProjects]);

  // Map API categories to donut chart format
  const categories = useMemo(() => {
    return budgetByCategory.map((c) => ({ name: c.category, value: c.hours, budget_category: c.category }));
  }, [budgetByCategory]);

  // Map API elpm_qrp_time to table format
  const elpmQrpRows = useMemo(() => {
    return rawElpmQrp.map((r) => ({
      project_code: (r as Record<string, unknown>).project_code as string || "",
      project_name: r.project_name,
      role: r.role,
      budget: r.budget,
      actual: r.actual,
      progress: r.progress,
    }));
  }, [rawElpmQrp]);

  // Map API staff_time to table format — grade 순으로 정렬 (P>MD>D>SM>M>SA>A>AA)
  const staffTimeRows = useMemo(() => {
    return rawStaffTime
      .map((r) => ({
        empno: r.empno,
        fldt_group: "",
        division: r.department,
        name: `${r.emp_name}(${r.empno})`,
        grade: r.grade,
        budget: r.budget,
        actual: r.actual,
        progress: r.progress,
      }))
      .sort((a, b) => {
        const ga = gradeRank(a.grade);
        const gb = gradeRank(b.grade);
        if (ga !== gb) return ga - gb;
        return (b.budget || 0) - (a.budget || 0);
      });
  }, [rawStaffTime]);

  const budgetUnits = rawBudgetUnits;

  // Handlers
  const handleProjectClick = (projectCode: string) => {
    setSelectedProjectCode((prev) => prev === projectCode ? null : projectCode);
  };

  // Project table totals (always full data)
  const projTotalBudget = sortedProjects.reduce((s, p) => s + (p.budget || 0), 0);
  const projTotalActual = sortedProjects.reduce((s, p) => s + (p.actual || 0), 0);
  const projTotalProgress = projTotalBudget > 0 ? (projTotalActual / projTotalBudget) * 100 : 0;

  return (
    <div className="p-6 space-y-5">

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-pwc-red">
          데이터를 불러오지 못했습니다: {error}
        </div>
      )}

      {/* Filters */}
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
            name: "year_month", label: "연월", options: [],
            value: filters.year_month,
            onChange: (v: string) => setFilters((f) => ({ ...f, year_month: v })),
          },
          {
            name: "project", label: "Project",
            options: filterOpts?.projects || [],
            value: filters.project_code,
            onChange: (v: string) => setFilters((f) => ({ ...f, project_code: v })),
          },
          {
            name: "el", label: "EL",
            options: filterOpts?.els || [],
            value: filters.el_empno,
            onChange: (v: string) => setFilters((f) => ({ ...f, el_empno: v })),
          },
          {
            name: "pm", label: "PM",
            options: filterOpts?.pms || [],
            value: filters.pm_empno,
            onChange: (v: string) => setFilters((f) => ({ ...f, pm_empno: v })),
          },
          {
            name: "dept", label: "EL소속본부",
            options: filterOpts?.departments || [],
            value: filters.department,
            onChange: (v: string) => setFilters((f) => ({ ...f, department: v })),
          },
          {
            name: "service_type", label: "대분류",
            options: filterOpts?.service_types || [],
            value: filters.service_type,
            onChange: (v: string) => setFilters((f) => ({ ...f, service_type: v })),
          },
        ]}
      />

      {/* KPI Cards */}
      <div className="section-card !p-0 flex divide-x divide-pwc-gray-100/80">
        <KPICard label="총 계약시간 (A)" value={kpi.contract_hours} />
        <KPICard
          label="AX/DX 시간"
          value={kpi.axdx_hours}
          subtitle={`총계약시간대비 ${kpi.axdx_ratio}%`}
        />
        <KPICard label="총계약시간-AX/DX" value={kpi.contract_hours - kpi.axdx_hours} />
        <KPICard label="Staff 총 Budget time" value={kpi.staff_budget} />
        <KPICard label="Actual time (B)" value={kpi.actual_hours} highlight />
        <KPICard label="Progress (B)/(A)" value={`${kpi.progress}%`} highlight />
        <KPICard label="작성여부" value={kpi.template_status || "-"} highlight />
      </div>

      {/* Row 1: 프로젝트별 Time 현황 (bar) + 프로젝트 테이블 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start" style={{ gridAutoRows: "min-content" }}>
        {/* 프로젝트별 Time 현황 */}
        <div className="section-card" style={{ maxHeight: 420, display: "flex", flexDirection: "column" }}>
          <h3 className="text-sm font-bold text-pwc-black uppercase tracking-wide mb-3 shrink-0">
            프로젝트별 Time 현황
          </h3>
          {allProjectsBar.length > 0 ? (
            <div className="overflow-y-auto flex-1 min-h-0">
              <HorizontalBarChart
                data={allProjectsBar}
                onBarClick={(name) => {
                  const item = allProjectsBar.find((p) => p.name === name);
                  if (item?.project_code) handleProjectClick(item.project_code);
                }}
                activeBar={
                  allProjectsBar.find((p) => p.project_code === selectedProjectCode)?.name || null
                }
              />
            </div>
          ) : (
            <EmptyState message={loading ? "로딩 중..." : "데이터가 없습니다."} />
          )}
        </div>

        {/* 프로젝트 테이블 */}
        <div className="section-card" style={{ maxHeight: 420, display: "flex", flexDirection: "column" }}>
          <h3 className="text-sm font-bold text-pwc-black uppercase tracking-wide mb-3 shrink-0">프로젝트</h3>
          <div className="overflow-auto border border-pwc-gray-100 rounded-lg flex-1 min-h-0">
            <table className="w-full text-sm">
              <thead className="bg-pwc-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-pwc-gray-600">프로젝트</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-pwc-gray-600">EL</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-pwc-gray-600">PM</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-pwc-gray-600">Budget</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-pwc-gray-600">Actual</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-pwc-gray-600">진행률%</th>
                </tr>
              </thead>
              <tbody>
                {sortedProjects.length === 0 && !loading ? (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-xs text-pwc-gray-600">데이터가 없습니다.</td></tr>
                ) : sortedProjects.map((row, i) => {
                  const pc = row.project_code;
                  const selected = pc === selectedProjectCode;

                  return (
                    <tr
                      key={i}
                      className={`border-t border-pwc-gray-100 cursor-pointer transition-colors ${
                        selected ? "bg-orange-50 border-l-2 border-l-[#D04A02]" : "hover:bg-pwc-gray-50"
                      }`}
                      onClick={() => handleProjectClick(pc)}
                    >
                      <td className="px-3 py-1.5 text-xs whitespace-nowrap max-w-[220px] truncate" title={row.project_name}>{row.project_name}</td>
                      <td className="px-3 py-1.5 text-xs">{row.el_name}</td>
                      <td className="px-3 py-1.5 text-xs">{row.pm_name}</td>
                      <td className="px-3 py-1.5 text-xs text-right">{Math.round(row.budget).toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-xs text-right">{Math.round(row.actual).toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-xs text-right"><ProgressBadge value={row.progress} /></td>
                    </tr>
                  );
                })}
                {sortedProjects.length > 0 && (
                  <SummaryRow label="합계" budget={projTotalBudget} actual={projTotalActual} progress={projTotalProgress} />
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Row 2: EL/PM/QRP Time + Staff Time */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* EL/PM/QRP Time */}
        <div className="section-card">
          <h3 className="text-sm font-bold text-pwc-black uppercase tracking-wide mb-3">EL/PM/QRP Time</h3>
          <div className="overflow-auto border border-pwc-gray-100 rounded-lg" style={{ maxHeight: "320px" }}>
            <table className="w-full text-sm">
              <thead className="bg-pwc-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-pwc-gray-600">프로젝트</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-pwc-gray-600 w-12">구분</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-pwc-gray-600">Budget</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-pwc-gray-600">Actual</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-pwc-gray-600">진행률(%)</th>
                </tr>
              </thead>
              <tbody>
                {elpmQrpRows.length === 0 && !loading ? (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-xs text-pwc-gray-600">데이터가 없습니다.</td></tr>
                ) : (() => {
                  // 프로젝트별 그룹핑 (셀 병합용)
                  const grouped: Record<string, typeof elpmQrpRows> = {};
                  for (const row of elpmQrpRows) {
                    const key = row.project_code || row.project_name;
                    if (!grouped[key]) grouped[key] = [];
                    grouped[key].push(row);
                  }
                  return Object.entries(grouped).map(([pc, rows]) => {
                    return rows.map((row, ri) => (
                      <tr
                        key={`${pc}-${ri}`}
                        className="border-t border-pwc-gray-100 hover:bg-pwc-gray-50"
                      >
                        {ri === 0 && (
                          <td
                            className="px-3 py-1.5 text-xs whitespace-nowrap max-w-[260px] truncate align-top"
                            title={row.project_name}
                            rowSpan={rows.length}
                          >
                            {row.project_name}
                          </td>
                        )}
                        <td className="px-3 py-1.5 text-xs font-medium">{row.role}</td>
                        <td className="px-3 py-1.5 text-xs text-right">{row.budget}</td>
                        <td className="px-3 py-1.5 text-xs text-right">{row.actual}</td>
                        <td className="px-3 py-1.5 text-xs text-right">
                          <ProgressBadge value={row.progress} />
                        </td>
                      </tr>
                    ));
                  });
                })()}
                {elpmQrpRows.length > 0 && (() => {
                  const totalBudget = elpmQrpRows.reduce((s, r) => s + r.budget, 0);
                  const totalActual = elpmQrpRows.reduce((s, r) => s + r.actual, 0);
                  const totalProgress = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;
                  return (
                    <tr className="border-t-2 border-pwc-black bg-pwc-gray-50 font-semibold text-sm">
                      <td className="px-3 py-2" colSpan={2}>합계</td>
                      <td className="px-3 py-2 text-right">{Math.round(totalBudget).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{Math.round(totalActual).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right"><ProgressBadge value={totalProgress} /></td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* Staff Time */}
        <div className="section-card">
          <h3 className="text-sm font-bold text-pwc-black uppercase tracking-wide mb-3">Staff Time</h3>
          <div className="overflow-auto border border-pwc-gray-100 rounded-lg" style={{ maxHeight: "320px" }}>
            <table className="w-full text-sm">
              <thead className="bg-pwc-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-pwc-gray-600">본부</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-pwc-gray-600">성명(사번)</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-pwc-gray-600 w-10">직급</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-pwc-gray-600">Budget</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-pwc-gray-600">Actual</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-pwc-gray-600">진행률(%)</th>
                </tr>
              </thead>
              <tbody>
                {staffTimeRows.length === 0 && !loading ? (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-xs text-pwc-gray-600">데이터가 없습니다.</td></tr>
                ) : staffTimeRows.map((row, i) => (
                  <tr key={`staff-${i}`} className="border-t border-pwc-gray-100 hover:bg-pwc-gray-50">
                    <td className="px-3 py-1.5 text-xs">{row.division}</td>
                    <td className="px-3 py-1.5 text-xs whitespace-nowrap">{row.name}</td>
                    <td className="px-3 py-1.5 text-xs">{row.grade}</td>
                    <td className="px-3 py-1.5 text-xs text-right">{row.budget ? Math.round(row.budget).toLocaleString() : ""}</td>
                    <td className="px-3 py-1.5 text-xs text-right">{row.actual ? Math.round(row.actual).toLocaleString() : ""}</td>
                    <td className="px-3 py-1.5 text-xs text-right">
                      <ProgressBadge value={row.progress} />
                    </td>
                  </tr>
                ))}
                {staffTimeRows.length > 0 && (() => {
                  const totalBudget = staffTimeRows.reduce((s, r) => s + (r.budget || 0), 0);
                  const totalActual = staffTimeRows.reduce((s, r) => s + (r.actual || 0), 0);
                  const totalProgress = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;
                  return (
                    <tr className="border-t-2 border-pwc-black bg-pwc-gray-50 font-semibold text-sm">
                      <td className="px-3 py-2" colSpan={3}>합계</td>
                      <td className="px-3 py-2 text-right">{Math.round(totalBudget).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{Math.round(totalActual).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right"><ProgressBadge value={totalProgress} /></td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Row 3: 활동별 Budget 현황 (donut) + Budget 관리단위별 Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 활동별 Budget 현황 */}
        <div className="section-card">
          <h3 className="text-sm font-bold text-pwc-black uppercase tracking-wide mb-3">
            활동별 Budget 현황
          </h3>
          {categories.length > 0 ? (
            <DonutChart
              data={categories.map((c) => ({ name: c.name, value: c.value }))}
              height={280}
            />
          ) : (
            <EmptyState message={loading ? "로딩 중..." : "데이터가 없습니다."} />
          )}
        </div>

        {/* Budget 관리단위별 Status */}
        <div className="section-card">
          <h3 className="text-sm font-bold text-pwc-black uppercase tracking-wide mb-3">
            Budget 관리단위별 Status
          </h3>
          <div className="overflow-auto border border-pwc-gray-100 rounded-lg" style={{ maxHeight: "350px" }}>
            <table className="w-full text-sm">
              <thead className="bg-pwc-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-pwc-gray-600">대분류</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-pwc-gray-600">관리단위</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-pwc-gray-600">Budget</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-pwc-gray-600">Actual</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-pwc-gray-600">진행률(%)</th>
                </tr>
              </thead>
              <tbody>
                {budgetUnits.length === 0 && !loading ? (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-xs text-pwc-gray-600">데이터가 없습니다.</td></tr>
                ) : (() => {
                  const rows: React.ReactNode[] = [];
                  let i = 0;
                  while (i < budgetUnits.length) {
                    const cat = budgetUnits[i].category || "기타";
                    let span = 1;
                    while (i + span < budgetUnits.length && (budgetUnits[i + span].category || "기타") === cat) span++;
                    for (let j = 0; j < span; j++) {
                      const row = budgetUnits[i + j];
                      rows.push(
                        <tr key={i + j} className="border-t border-pwc-gray-100 hover:bg-pwc-gray-50">
                          {j === 0 && (
                            <td className="px-3 py-1.5 text-xs font-medium text-pwc-black align-top" rowSpan={span}>{cat}</td>
                          )}
                          <td className="px-3 py-1.5 text-xs whitespace-nowrap">{row.unit}</td>
                          <td className="px-3 py-1.5 text-xs text-right">{Math.round(row.budget).toLocaleString()}</td>
                          <td className="px-3 py-1.5 text-xs text-right">{Math.round(row.actual).toLocaleString()}</td>
                          <td className="px-3 py-1.5 text-xs text-right">
                            <ProgressBadge value={row.progress} />
                          </td>
                        </tr>
                      );
                    }
                    i += span;
                  }
                  return rows;
                })()}
                {budgetUnits.length > 0 && (() => {
                  const totalBudget = budgetUnits.reduce((s, r) => s + r.budget, 0);
                  const totalActual = budgetUnits.reduce((s, r) => s + r.actual, 0);
                  const totalProgress = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;
                  return (
                    <tr className="border-t-2 border-pwc-black bg-pwc-gray-50 font-semibold text-sm">
                      <td className="px-3 py-2" colSpan={2}>합계</td>
                      <td className="px-3 py-2 text-right">{Math.round(totalBudget).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{Math.round(totalActual).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right"><ProgressBadge value={totalProgress} /></td>
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

export default function OverviewPage() {
  return <OverviewInner />;
}
