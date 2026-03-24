"use client";

import { useState, useMemo } from "react";
import FilterBar from "@/components/filters/FilterBar";
import DonutChart from "@/components/charts/DonutChart";
import HorizontalBarChart from "@/components/charts/HorizontalBarChart";
import { useApi, buildQuery, useFilterOptions } from "@/hooks/useApi";
import type { AssignmentItem, AssignmentDetail } from "@/hooks/useApi";
import { CrossFilterProvider, useCrossFilter, applyFilters } from "@/lib/cross-filter";
import { getCategoryOrder } from "@/lib/budget-constants";
import LoadingOverlay from "@/components/ui/LoadingOverlay";

/* ───────── Helpers ───────── */

function ProgressBadge({ rate }: { rate: number }) {
  if (rate === 0) {
    return <span className="text-xs text-pwc-gray-600">-</span>;
  }
  let colorClass = "text-pwc-green";
  if (rate > 110) colorClass = "text-pwc-red";
  else if (rate > 90) colorClass = "text-pwc-orange";
  return <span className={`text-xs font-semibold ${colorClass}`}>{rate.toFixed(1)}%</span>;
}

/* ───────── Cross-filter dimension resolver ───────── */

function getPersonRowDimension(
  item: { project: string; budget_category?: string; budget_unit?: string },
  dimension: string
): string | undefined {
  switch (dimension) {
    case "project_name":
    case "project":
      return item.project;
    case "budget_category":
      return item.budget_category;
    case "budget_unit":
      return item.budget_unit;
    default:
      return undefined;
  }
}

function getBudgetUnitRowDimension(
  item: { unit: string; project_name: string; budget_category?: string },
  dimension: string
): string | undefined {
  switch (dimension) {
    case "project_name":
    case "project":
      return item.project_name;
    case "budget_unit":
      return item.unit;
    case "budget_category":
      return item.budget_category;
    default:
      return undefined;
  }
}

/* ───────── Inner component using cross-filter ───────── */

function AssignmentsContent() {
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState("월별");

  // Cross-filter hook
  const { state: cfState, toggleFilter, isSelected, hasActiveFilter, clearAll, getActiveFilters } =
    useCrossFilter();

  // API filter state
  const [filters, setFilters] = useState({
    el_empno: "", pm_empno: "", department: "", project_code: "",
  });
  const query = buildQuery(filters);
  const { data: assignmentList, loading: listLoading, error: listError } = useApi<AssignmentItem[]>(`/api/v1/assignments${query}`);
  const { data: filterOpts } = useFilterOptions();

  // Selected person
  const [selectedEmpno, setSelectedEmpno] = useState<string | null>(null);
  const { data: assignmentDetail, loading: detailLoading, error: detailError } = useApi<AssignmentDetail>(
    selectedEmpno ? `/api/v1/assignments/${selectedEmpno}` : null
  );

  // Deduplicate assignment list by empno
  const sidebarPeople = useMemo(() => {
    const raw = (assignmentList || []).map((p) => ({
      name: p.emp_name,
      empno: p.empno,
    }));
    const seen = new Set<string>();
    return raw.filter((p) => {
      if (seen.has(p.empno)) return false;
      seen.add(p.empno);
      return true;
    });
  }, [assignmentList]);

  const filteredPeople = sidebarPeople.filter(
    (p) =>
      p.name.includes(search) || p.empno.includes(search)
  );

  // Derive chart & table data from detail or empty
  const donutData = assignmentDetail
    ? assignmentDetail.projects.map((proj) => ({ name: proj.project_name, value: proj.budget }))
    : [];

  const barData = assignmentDetail
    ? assignmentDetail.details.reduce<Record<string, { budget: number; actual: number }>>((acc, d) => {
        const key = d.budget_category || "기타";
        if (!acc[key]) acc[key] = { budget: 0, actual: 0 };
        acc[key].budget += d.budget;
        acc[key].actual += d.actual;
        return acc;
      }, {})
    : null;
  const barChartData = barData
    ? Object.entries(barData)
        .map(([name, v]) => ({ name, budget: v.budget, actual: v.actual }))
        .sort((a, b) => getCategoryOrder(a.name) - getCategoryOrder(b.name))
    : [];

  const personTableData = assignmentDetail
    ? assignmentDetail.projects.map((proj) => ({
        bu: assignmentDetail.department || "",
        name: `${assignmentDetail.emp_name}(${assignmentDetail.empno})`,
        rank: assignmentDetail.grade || "",
        project: proj.project_name,
        el: proj.el_name,
        pm: proj.pm_name,
        budget: proj.budget,
        actual: proj.actual,
        remaining: proj.remaining,
        rate: proj.progress,
      }))
    : [];

  const budgetUnitData = assignmentDetail
    ? assignmentDetail.details
        .map((d) => ({
          unit: d.budget_unit,
          budget: d.budget,
          actual: d.actual,
          remaining: d.remaining,
          rate: d.progress,
          project_name: d.project_name,
          budget_category: d.budget_category || "기타",
        }))
        .sort((a, b) => getCategoryOrder(a.budget_category) - getCategoryOrder(b.budget_category))
    : [];

  // Selected person display info
  const selectedPersonInfo = assignmentDetail
    ? { name: assignmentDetail.emp_name, empno: assignmentDetail.empno }
    : selectedEmpno
      ? sidebarPeople.find((p) => p.empno === selectedEmpno) || sidebarPeople[0]
      : sidebarPeople[0] || { name: "", empno: "" };

  // ── Cross-filtered data ──
  const personFilters = getActiveFilters("personTable");
  const filteredPersonTableData = applyFilters(personTableData, personFilters, getPersonRowDimension);

  const budgetUnitFilters = getActiveFilters("budgetUnitTable");
  const filteredBudgetUnitData = applyFilters(budgetUnitData, budgetUnitFilters, getBudgetUnitRowDimension);

  // Active segment/bar derived from cross-filter state
  const donutActiveSegment =
    cfState.selections.find((s) => s.sourceId === "projectDonut")?.value ?? null;

  const barActiveBar =
    cfState.selections.find((s) => s.sourceId === "activityBar")?.value ?? null;

  return (
    <div className="p-6 space-y-5">
      {/* Error banners */}
      {listError && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-xs text-pwc-red">
          인원 목록을 불러오는 중 오류가 발생했습니다: {listError}
        </div>
      )}
      {detailError && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-xs text-pwc-red">
          상세 데이터를 불러오는 중 오류가 발생했습니다: {detailError}
        </div>
      )}

      {/* Filter bar */}
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
          { name: "project_code", label: "Project", options: filterOpts?.projects || [], value: filters.project_code, onChange: (v: string) => setFilters((f) => ({ ...f, project_code: v })) },
          { name: "el_empno", label: "EL", options: filterOpts?.els || [], value: filters.el_empno, onChange: (v: string) => setFilters((f) => ({ ...f, el_empno: v })) },
          { name: "pm_empno", label: "PM", options: filterOpts?.pms || [], value: filters.pm_empno, onChange: (v: string) => setFilters((f) => ({ ...f, pm_empno: v })) },
          { name: "department", label: "Staff소속본부", options: filterOpts?.departments || [], value: filters.department, onChange: (v: string) => setFilters((f) => ({ ...f, department: v })) },
        ]}
      />

      {/* Main layout */}
      <div className="flex gap-5">
        {/* Left sidebar - Assignment list */}
        <div className="w-[180px] shrink-0">
          <div className="bg-white rounded-lg border border-pwc-gray-100/60 shadow-sm overflow-hidden">
            <div className="px-3 py-2 bg-pwc-gray-50 border-b border-pwc-gray-100">
              <h3 className="text-xs font-bold text-pwc-black">Assignment</h3>
            </div>
            <div className="p-2">
              <input
                type="text"
                placeholder="검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-xs border border-pwc-gray-200 rounded px-2 py-1.5 mb-2 focus:outline-none focus:border-pwc-orange"
              />
            </div>
            <div className="max-h-[560px] overflow-y-auto">
              {listLoading ? (
                <div className="px-3 py-4 text-xs text-pwc-gray-600 text-center">불러오는 중...</div>
              ) : filteredPeople.length === 0 ? (
                <div className="px-3 py-4 text-xs text-pwc-gray-600 text-center">
                  {search ? "검색 결과가 없습니다." : "배정된 인원이 없습니다."}
                </div>
              ) : (
                filteredPeople.map((person) => {
                  const isPersonSelected = person.empno === selectedEmpno;
                  return (
                    <button
                      key={person.empno}
                      onClick={() => setSelectedEmpno(person.empno)}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                        isPersonSelected
                          ? "border-l-2 border-pwc-orange bg-pwc-gray-50 font-semibold text-pwc-black"
                          : "border-l-2 border-transparent hover:bg-pwc-gray-50 text-pwc-gray-600"
                      }`}
                    >
                      {person.name}
                      <span className="text-pwc-gray-600">({person.empno})</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 space-y-5">
          {/* Charts row */}
          <div className="grid grid-cols-2 gap-5">
            {/* Donut chart - Project별 Budget 현황 */}
            <div className="section-card">
              <h3 className="text-sm font-bold text-pwc-black uppercase tracking-wide mb-3">
                Project별 Budget 현황
              </h3>
              {donutData.length === 0 ? (
                <div className="flex items-center justify-center h-[220px] text-xs text-pwc-gray-600">
                  인원을 선택하면 Project별 Budget 현황이 표시됩니다.
                </div>
              ) : (
                <DonutChart
                  data={donutData}
                  height={220}
                  onSegmentClick={(name) =>
                    toggleFilter("projectDonut", "project_name", name)
                  }
                  activeSegment={donutActiveSegment}
                />
              )}
            </div>

            {/* Horizontal bar chart - Activity별 Time 현황 */}
            <div className="section-card">
              <h3 className="text-sm font-bold text-pwc-black uppercase tracking-wide mb-3">
                Activity별 Time 현황
              </h3>
              {barChartData.length === 0 ? (
                <div className="flex items-center justify-center h-[220px] text-xs text-pwc-gray-600">
                  인원을 선택하면 Activity별 Time 현황이 표시됩니다.
                </div>
              ) : (
                <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
                  <HorizontalBarChart
                    data={barChartData}
                    onBarClick={(name) =>
                      toggleFilter("activityBar", "budget_category", name)
                    }
                    activeBar={barActiveBar}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Person assignment detail table */}
          <div className="bg-white rounded-lg border border-pwc-gray-100/60 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-pwc-gray-50 border-b border-pwc-gray-100">
              <h3 className="text-sm font-bold text-pwc-black">
                {selectedPersonInfo.name}({selectedPersonInfo.empno}) 배정 현황
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-pwc-gray-50 border-b border-pwc-gray-100">
                    <th className="px-3 py-2 text-left font-semibold text-pwc-gray-600">본부</th>
                    <th className="px-3 py-2 text-left font-semibold text-pwc-gray-600">성명(사번)</th>
                    <th className="px-3 py-2 text-left font-semibold text-pwc-gray-600">직급</th>
                    <th className="px-3 py-2 text-left font-semibold text-pwc-gray-600">프로젝트</th>
                    <th className="px-3 py-2 text-left font-semibold text-pwc-gray-600">EL</th>
                    <th className="px-3 py-2 text-left font-semibold text-pwc-gray-600">PM</th>
                    <th className="px-3 py-2 text-right font-semibold text-pwc-gray-600">BudgetTime</th>
                    <th className="px-3 py-2 text-right font-semibold text-pwc-gray-600">ActualTime</th>
                    <th className="px-3 py-2 text-right font-semibold text-pwc-gray-600">잔여Budget</th>
                    <th className="px-3 py-2 text-right font-semibold text-pwc-gray-600">진행률(%)</th>
                  </tr>
                </thead>
                <tbody>
                  {detailLoading ? (
                    <tr><td colSpan={10} className="px-3 py-6 text-center text-xs text-pwc-gray-600">불러오는 중...</td></tr>
                  ) : filteredPersonTableData.length === 0 ? (
                    <tr><td colSpan={10} className="px-3 py-6 text-center text-xs text-pwc-gray-600">좌측 목록에서 인원을 선택해주세요.</td></tr>
                  ) : (
                    <>
                      {filteredPersonTableData.map((row, i) => {
                        const isRowSelected = isSelected("personTable", row.project);
                        const isFirst = i === 0;
                        const rowCount = filteredPersonTableData.length;
                        return (
                          <tr
                            key={i}
                            onClick={() =>
                              toggleFilter("personTable", "project", row.project)
                            }
                            className={`border-b border-pwc-gray-100 cursor-pointer transition-colors ${
                              isRowSelected
                                ? "bg-orange-50 border-l-2 border-l-[#D04A02]"
                                : "hover:bg-pwc-gray-50"
                            }`}
                          >
                            {isFirst && (
                              <>
                                <td className="px-3 py-2 text-pwc-black align-top" rowSpan={rowCount}>{row.bu}</td>
                                <td className="px-3 py-2 text-pwc-black align-top" rowSpan={rowCount}>{row.name}</td>
                                <td className="px-3 py-2 text-pwc-black align-top" rowSpan={rowCount}>{row.rank}</td>
                              </>
                            )}
                            <td className="px-3 py-2 text-pwc-black max-w-[260px] truncate">{row.project}</td>
                            <td className="px-3 py-2 text-pwc-black">{row.el}</td>
                            <td className="px-3 py-2 text-pwc-black">{row.pm}</td>
                            <td className="px-3 py-2 text-right text-pwc-black">{row.budget.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right text-pwc-black">{row.actual.toLocaleString()}</td>
                            <td className={`px-3 py-2 text-right font-semibold ${row.remaining < 0 ? "text-pwc-red" : "text-pwc-black"}`}>
                              {row.remaining}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <ProgressBadge rate={row.rate} />
                            </td>
                          </tr>
                        );
                      })}
                      {(() => {
                        const totalBudget = filteredPersonTableData.reduce((s, r) => s + r.budget, 0);
                        const totalActual = filteredPersonTableData.reduce((s, r) => s + r.actual, 0);
                        const totalRemaining = totalBudget - totalActual;
                        const totalRate = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;
                        return (
                          <tr className="border-t-2 border-pwc-black bg-pwc-gray-50 font-semibold">
                            <td className="px-3 py-2" colSpan={6}>합계</td>
                            <td className="px-3 py-2 text-right">{totalBudget.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right">{totalActual.toLocaleString()}</td>
                            <td className={`px-3 py-2 text-right ${totalRemaining < 0 ? "text-pwc-red" : ""}`}>{totalRemaining.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right"><ProgressBadge rate={totalRate} /></td>
                          </tr>
                        );
                      })()}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Budget unit detail table — 프로젝트 선택 시에만 표시 */}
          {personTableData.some((row) => isSelected("personTable", row.project)) && (
          <div className="bg-white rounded-lg border border-pwc-gray-100/60 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-pwc-gray-50 border-b border-pwc-gray-100 flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-pwc-orange inline-block" />
              <h3 className="text-sm font-bold text-pwc-black">
                {filteredBudgetUnitData.length > 0 ? filteredBudgetUnitData[0].project_name : ""}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-pwc-gray-50 border-b border-pwc-gray-100">
                    <th className="px-3 py-2 text-left font-semibold text-pwc-gray-600">프로젝트</th>
                    <th className="px-3 py-2 text-left font-semibold text-pwc-gray-600">성명(사번)</th>
                    <th className="px-3 py-2 text-left font-semibold text-pwc-gray-600">대분류</th>
                    <th className="px-3 py-2 text-left font-semibold text-pwc-gray-600">Budget관리단위</th>
                    <th className="px-3 py-2 text-right font-semibold text-pwc-gray-600">BudgetTime</th>
                    <th className="px-3 py-2 text-right font-semibold text-pwc-gray-600">ActualTime</th>
                    <th className="px-3 py-2 text-right font-semibold text-pwc-gray-600">잔여Budget</th>
                    <th className="px-3 py-2 text-right font-semibold text-pwc-gray-600">진행률(%)</th>
                  </tr>
                </thead>
                <tbody>
                  {detailLoading ? (
                    <tr><td colSpan={7} className="px-3 py-6 text-center text-xs text-pwc-gray-600">불러오는 중...</td></tr>
                  ) : filteredBudgetUnitData.length === 0 ? (
                    <tr><td colSpan={8} className="px-3 py-6 text-center text-xs text-pwc-gray-600">Budget 관리단위 데이터가 없습니다.</td></tr>
                  ) : (
                    <>
                      {(() => {
                        // 대분류별 rowSpan 계산
                        const catSpans: Record<string, number> = {};
                        const catFirstIdx: Record<string, number> = {};
                        filteredBudgetUnitData.forEach((row, i) => {
                          const cat = row.budget_category;
                          if (!(cat in catSpans)) {
                            catSpans[cat] = 0;
                            catFirstIdx[cat] = i;
                          }
                          catSpans[cat]++;
                        });

                        return filteredBudgetUnitData.map((row, i) => {
                          const isRowSelected = isSelected("budgetUnitTable", row.unit);
                          const isFirstOfCategory = catFirstIdx[row.budget_category] === i;
                          return (
                            <tr
                              key={i}
                              onClick={() =>
                                toggleFilter("budgetUnitTable", "budget_unit", row.unit)
                              }
                              className={`border-b border-pwc-gray-100 cursor-pointer transition-colors ${
                                isRowSelected
                                  ? "bg-orange-50 border-l-2 border-l-[#D04A02]"
                                  : "hover:bg-pwc-gray-50"
                              }`}
                            >
                              {i === 0 && (
                                <>
                                  <td className="px-3 py-2 text-pwc-black align-top" rowSpan={filteredBudgetUnitData.length}>
                                    {row.project_name}
                                  </td>
                                  <td className="px-3 py-2 text-pwc-black align-top" rowSpan={filteredBudgetUnitData.length}>
                                    {selectedPersonInfo.name}({selectedPersonInfo.empno})
                                  </td>
                                </>
                              )}
                              {isFirstOfCategory && (
                                <td className="px-3 py-2 text-pwc-gray-600 font-medium align-top border-r border-pwc-gray-100" rowSpan={catSpans[row.budget_category]}>
                                  {row.budget_category}
                                </td>
                              )}
                              <td className="px-3 py-2 text-pwc-black">{row.unit}</td>
                              <td className="px-3 py-2 text-right text-pwc-black">{row.budget}</td>
                              <td className="px-3 py-2 text-right text-pwc-black">{row.actual}</td>
                              <td className={`px-3 py-2 text-right font-semibold ${row.remaining < 0 ? "text-pwc-red" : "text-pwc-black"}`}>
                                {row.remaining}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <ProgressBadge rate={row.rate} />
                              </td>
                            </tr>
                          );
                        });
                      })()}
                      {(() => {
                        const totalBudget = filteredBudgetUnitData.reduce((s, r) => s + r.budget, 0);
                        const totalActual = filteredBudgetUnitData.reduce((s, r) => s + r.actual, 0);
                        const totalRemaining = totalBudget - totalActual;
                        const totalRate = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;
                        return (
                          <tr className="border-t-2 border-pwc-black bg-pwc-gray-50 font-semibold">
                            <td className="px-3 py-2" colSpan={4}>합계</td>
                            <td className="px-3 py-2 text-right">{totalBudget.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right">{totalActual.toLocaleString()}</td>
                            <td className={`px-3 py-2 text-right ${totalRemaining < 0 ? "text-pwc-red" : ""}`}>{totalRemaining.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right"><ProgressBadge rate={totalRate} /></td>
                          </tr>
                        );
                      })()}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────── Page ───────── */

export default function AssignmentsPage() {
  return (
    <CrossFilterProvider>
      <AssignmentsContent />
    </CrossFilterProvider>
  );
}
