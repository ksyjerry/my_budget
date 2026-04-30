"use client";

import { useRef } from "react";
import { gradeRank } from "@/lib/grade";
import { NumberField } from "@/components/ui/NumberField";
import type { TemplateRow, Member, BudgetUnit } from "../../types";
import { getCellValidationClass } from "../../lib/wizard-validators";

interface Quarter {
  label: string;
  months: string[];
}

interface MonthGridProps {
  rows: TemplateRow[];
  setRows: (rows: TemplateRow[]) => void;
  sortedIndices: number[];
  months: string[];
  monthLabels: string[];
  quarters: Quarter[];
  viewMode: "month" | "quarter";
  members: Member[];
  budgetUnits: BudgetUnit[];
  templateTotal: { total: number; monthTotals: Record<string, number> };
  activeCell: { row: number; col: number } | null;
  setActiveCell: (cell: { row: number; col: number } | null) => void;
  editingCell: { row: number; col: number } | null;
  setEditingCell: (cell: { row: number; col: number } | null) => void;
  toggleRow: (idx: number) => void;
  updateRowMonth: (idx: number, month: string, value: number) => void;
  updateRowAssignee: (idx: number, empno: string, name: string, grade: string) => void;
  duplicateRow: (idx: number) => void;
  rowTotal: (row: TemplateRow) => number;
  collapsedCategories: Set<string>;
  onToggleCategory: (category: string) => void;
}

// Column index constants
const FIRST_EDITABLE_COL = 3;
const MONTH_COL_START = 6;

export function MonthGrid({
  rows,
  setRows,
  sortedIndices,
  months: MONTHS,
  monthLabels: MONTH_LABELS,
  quarters: QUARTERS,
  viewMode,
  members,
  budgetUnits,
  templateTotal,
  activeCell,
  setActiveCell,
  editingCell,
  setEditingCell,
  toggleRow,
  updateRowMonth,
  updateRowAssignee,
  duplicateRow,
  rowTotal,
  collapsedCategories,
  onToggleCategory,
}: MonthGridProps) {
  const gridRef = useRef<HTMLTableElement>(null);

  const MONTH_COL_END = MONTH_COL_START + MONTHS.length - 1;

  const deleteRow = (idx: number) => {
    const newRows = rows.filter((_, i) => i !== idx);
    setRows(newRows);
    setActiveCell(null);
    setEditingCell(null);
  };

  const handleCellClick = (rowVisualIdx: number, col: number) => {
    setActiveCell({ row: rowVisualIdx, col });
    if (col >= MONTH_COL_START && col <= MONTH_COL_END) {
      setEditingCell({ row: rowVisualIdx, col });
    } else if (col === FIRST_EDITABLE_COL) {
      setEditingCell({ row: rowVisualIdx, col });
    } else {
      setEditingCell(null);
    }
  };

  const handleGridKeyDown = (
    e: React.KeyboardEvent,
    rowVisualIdx: number,
    col: number
  ) => {
    const enabledRowCount = sortedIndices.filter((i) => rows[i].enabled).length;
    let nextRow = rowVisualIdx;
    let nextCol = col;

    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        nextCol = col - 1;
        if (nextCol < MONTH_COL_START) {
          nextCol = MONTH_COL_END;
          nextRow = rowVisualIdx - 1;
        }
      } else {
        nextCol = col + 1;
        if (nextCol > MONTH_COL_END) {
          nextCol = MONTH_COL_START;
          nextRow = rowVisualIdx + 1;
        }
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      nextRow = rowVisualIdx + 1;
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      nextRow = rowVisualIdx + 1;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      nextRow = rowVisualIdx - 1;
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      nextCol = Math.min(col + 1, MONTH_COL_END);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      nextCol = Math.max(col - 1, MONTH_COL_START);
    } else if (e.key === "Escape") {
      setEditingCell(null);
      setActiveCell(null);
      return;
    } else {
      return;
    }

    nextRow = Math.max(0, Math.min(nextRow, enabledRowCount - 1));
    nextCol = Math.max(MONTH_COL_START, Math.min(nextCol, MONTH_COL_END));

    setActiveCell({ row: nextRow, col: nextCol });
    setEditingCell({ row: nextRow, col: nextCol });

    requestAnimationFrame(() => {
      const input = gridRef.current?.querySelector(
        `[data-row="${nextRow}"][data-col="${nextCol}"] input`
      ) as HTMLInputElement | null;
      input?.focus();
      input?.select();
    });
  };

  let lastCategory = "";
  let visualRowIdx = 0;

  return (
    <div className="overflow-auto max-h-[70vh] border border-pwc-gray-200 rounded-lg shadow-sm pb-24">
      <table
        ref={gridRef}
        className="w-full text-xs whitespace-nowrap border-separate border-spacing-0 select-none"
        style={{ tableLayout: "fixed" }}
      >
        <colgroup>
          <col style={{ width: 32 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 180 }} />
          <col style={{ width: 140 }} />
          <col style={{ width: 68 }} />
          <col style={{ width: 56 }} />
          {viewMode === "month"
            ? MONTHS.map((m) => <col key={m} style={{ width: 52 }} />)
            : QUARTERS.map((q) => <col key={q.label} style={{ width: 72 }} />)}
          <col style={{ width: 56 }} />
        </colgroup>
        <thead className="sticky top-0 z-20 shadow-sm">
          <tr className="border-b border-pwc-gray-200">
            {/* 해당 — sticky left col 0 (left: 0, width 32) — 마스터 V 토글 */}
            <th className="sticky left-0 z-30 bg-pwc-gray-50 px-1 py-2 text-center font-semibold text-pwc-gray-600 border-b border-r border-pwc-gray-200" style={{ minWidth: 32 }}>
              <input
                type="checkbox"
                title="전체 V 토글"
                checked={rows.length > 0 && rows.every((r) => r.enabled)}
                ref={(el) => {
                  if (!el) return;
                  const allOn = rows.length > 0 && rows.every((r) => r.enabled);
                  const someOn = rows.some((r) => r.enabled);
                  el.indeterminate = !allOn && someOn;
                }}
                onChange={() => {
                  const allEnabled = rows.every((r) => r.enabled);
                  setRows(rows.map((r) => ({ ...r, enabled: !allEnabled })));
                }}
                className="accent-pwc-orange cursor-pointer"
              />
            </th>
            {/* 대분류 — sticky left col 1 (left: 32, width 100) */}
            <th className="sticky left-[32px] z-30 bg-pwc-gray-50 px-2 py-2 text-left font-semibold text-pwc-gray-600 border-b border-r border-pwc-gray-200" style={{ minWidth: 100 }}>
              대분류
            </th>
            {/* 관리단위 — sticky left col 2 (left: 132, width 180) */}
            <th className="sticky left-[132px] z-30 bg-pwc-gray-50 px-2 py-2 text-left font-semibold text-pwc-gray-600 border-b border-r border-pwc-gray-200" style={{ minWidth: 180 }}>
              Budget 관리단위
            </th>
            {/* 담당자 — sticky left col 3 (left: 312, width 140) */}
            <th className="sticky left-[312px] z-30 bg-pwc-gray-50 px-2 py-2 text-left font-semibold text-pwc-gray-600 border-b border-r border-pwc-gray-200" style={{ minWidth: 140 }}>
              담당자
            </th>
            {/* 직급 — non-sticky */}
            <th className="bg-pwc-gray-50 px-2 py-2 text-left font-semibold text-pwc-gray-600 border-b border-r border-pwc-gray-200">
              직급
            </th>
            {/* 합계 — sticky right */}
            <th className="sticky right-0 z-30 bg-pwc-gray-50 px-2 py-2 text-right font-semibold text-pwc-gray-600 border-b border-l border-pwc-gray-200" style={{ minWidth: 56 }}>
              합계
            </th>
            {viewMode === "month"
              ? MONTH_LABELS.map((label, i) => (
                  <th
                    key={MONTHS[i]}
                    className="bg-pwc-gray-50 px-1 py-2 text-right font-semibold text-pwc-gray-600 border-b border-r border-pwc-gray-200"
                  >
                    {label}
                  </th>
                ))
              : QUARTERS.map((q) => (
                  <th
                    key={q.label}
                    className="bg-pwc-gray-50 px-1 py-2 text-right font-semibold text-pwc-gray-600 border-b border-r border-pwc-gray-200"
                  >
                    {q.label}
                  </th>
                ))}
            <th className="bg-pwc-gray-50 px-1 py-2 text-center font-semibold text-pwc-gray-600 border-b border-pwc-gray-200">
              <span title="복제/삭제">...</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {(() => {
            visualRowIdx = 0;
            lastCategory = "";
            return null;
          })()}
          {sortedIndices.map((idx) => {
            const row = rows[idx];
            const showCategory = row.budget_category !== lastCategory;
            lastCategory = row.budget_category;
            const total = rowTotal(row);
            const currentVisualRow = visualRowIdx;
            visualRowIdx++;
            const empnoValidationClass = getCellValidationClass(row, "empno");
            const totalValidationClass = getCellValidationClass(row, "hours-total");

            return (
              <tr
                key={idx}
                className={`h-7 border-b border-pwc-gray-100 hover:bg-blue-50/30 transition-colors ${
                  !row.enabled ? "opacity-30 bg-pwc-gray-50" : ""
                } ${showCategory ? "border-t-2 border-t-pwc-gray-300" : ""}`}
              >
                {/* Checkbox — sticky left col 0 */}
                <td className="sticky left-0 z-10 px-1 py-0.5 text-center border-r border-b border-pwc-gray-100 bg-white">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={() => toggleRow(idx)}
                    className="accent-pwc-orange cursor-pointer"
                  />
                </td>
                {/* 대분류 — sticky left col 1 */}
                <td
                  className={`sticky left-[32px] z-10 px-2 py-0.5 text-pwc-gray-500 border-r border-b border-pwc-gray-100 truncate bg-white ${
                    showCategory ? "cursor-pointer hover:bg-pwc-gray-50 font-medium" : ""
                  }`}
                  title={
                    showCategory
                      ? `${row.budget_category} — 클릭하여 ${
                          collapsedCategories.has(row.budget_category) ? "펼치기" : "접기"
                        }`
                      : row.budget_category
                  }
                  onClick={
                    showCategory
                      ? () => onToggleCategory(row.budget_category)
                      : undefined
                  }
                >
                  {showCategory ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="text-pwc-gray-400 text-[10px]">
                        {collapsedCategories.has(row.budget_category) ? "▶" : "▼"}
                      </span>
                      {row.budget_category}
                    </span>
                  ) : (
                    ""
                  )}
                </td>
                {/* 관리단위 — sticky left col 2 */}
                <td className="sticky left-[132px] z-10 border-r border-b border-pwc-gray-100 px-0.5 py-0 bg-white">
                  <select
                    value={row.budget_unit}
                    onChange={(e) => {
                      const newUnit = e.target.value;
                      const duplicate = rows.some(
                        (r, i) =>
                          i !== idx &&
                          r.enabled &&
                          r.budget_category === row.budget_category &&
                          r.budget_unit === newUnit &&
                          r.empno === row.empno &&
                          row.empno !== ""
                      );
                      if (duplicate) {
                        alert(
                          "동일인이 동일한 대분류/관리단위에 이미 배정되어 있습니다."
                        );
                        return;
                      }
                      const newRows = [...rows];
                      newRows[idx] = { ...newRows[idx], budget_unit: newUnit };
                      setRows(newRows);
                    }}
                    disabled={!row.enabled}
                    className="w-full h-full px-1 py-0 text-xs font-medium bg-transparent border-0 focus:outline-none focus:ring-0 disabled:opacity-50 cursor-pointer truncate leading-tight"
                  >
                    {budgetUnits
                      .filter((u) => u.category === row.budget_category)
                      .map((u, ui) => (
                        <option key={`${ui}-${u.unit_name}`} value={u.unit_name}>
                          {u.unit_name}
                        </option>
                      ))}
                  </select>
                </td>
                {/* 담당자 — sticky left col 3 */}
                <td
                  className={`sticky left-[312px] z-10 px-0.5 py-0 border-r border-b border-pwc-gray-100 bg-white ${
                    activeCell?.row === currentVisualRow &&
                    activeCell?.col === FIRST_EDITABLE_COL
                      ? "outline outline-1 outline-blue-400 -outline-offset-1"
                      : ""
                  } ${empnoValidationClass}`}
                  onClick={() =>
                    row.enabled &&
                    handleCellClick(currentVisualRow, FIRST_EDITABLE_COL)
                  }
                >
                  <select
                    value={row.empno}
                    onChange={(e) => {
                      const newEmpno = e.target.value;
                      const duplicate = rows.some(
                        (r, i) =>
                          i !== idx &&
                          r.enabled &&
                          r.budget_category === row.budget_category &&
                          r.budget_unit === row.budget_unit &&
                          r.empno === newEmpno &&
                          newEmpno !== ""
                      );
                      if (duplicate) {
                        alert(
                          "동일인이 동일한 대분류/관리단위에 이미 배정되어 있습니다."
                        );
                        return;
                      }
                      const m = members.find((m) => m.empno === newEmpno);
                      updateRowAssignee(
                        idx,
                        newEmpno,
                        m?.name || newEmpno,
                        m?.grade || ""
                      );
                    }}
                    disabled={!row.enabled}
                    className="w-full h-full px-1 py-0 text-xs bg-transparent border-0 focus:outline-none focus:ring-0 disabled:opacity-50 cursor-pointer leading-tight"
                  >
                    <option value="">선택</option>
                    {[...members]
                      .sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade))
                      .map((m) => (
                        <option key={`${m.empno}-${m.name}`} value={m.empno}>
                          {m.name}
                          {m.empno ? ` (${m.empno})` : ""}
                        </option>
                      ))}
                  </select>
                </td>
                {/* 직급 */}
                <td
                  className="px-2 py-0.5 text-pwc-gray-700 border-r border-b border-pwc-gray-100 truncate"
                  title={
                    row.grade ||
                    (members.find((m) => m.empno === row.empno)?.grade ?? "")
                  }
                >
                  {row.grade ||
                    members.find((m) => m.empno === row.empno)?.grade ||
                    ""}
                </td>
                {/* 합계 — sticky right */}
                <td className={`sticky right-0 z-10 px-2 py-0.5 text-right font-bold border-l border-b border-pwc-gray-200 bg-pwc-gray-50 ${totalValidationClass}`}>
                  {total > 0 ? total : ""}
                </td>
                {/* 월별 셀 */}
                {viewMode === "month"
                  ? MONTHS.map((month, mi) => {
                      const colIdx = MONTH_COL_START + mi;
                      const isActive =
                        activeCell?.row === currentVisualRow &&
                        activeCell?.col === colIdx;
                      const isEditing =
                        editingCell?.row === currentVisualRow &&
                        editingCell?.col === colIdx;

                      return (
                        <td
                          key={month}
                          data-row={currentVisualRow}
                          data-col={colIdx}
                          className={`px-0 py-0 text-right border-r border-b border-pwc-gray-100 cursor-cell ${
                            isActive
                              ? "outline outline-1 outline-blue-400 -outline-offset-1"
                              : ""
                          }`}
                          onClick={() =>
                            row.enabled && handleCellClick(currentVisualRow, colIdx)
                          }
                        >
                          {isEditing && row.enabled ? (
                            <NumberField
                              autoFocus
                              value={row.months[month] || 0}
                              step={0.25}
                              min={0}
                              max={300}
                              onChange={(v) => updateRowMonth(idx, month, v)}
                              onKeyDown={(e) =>
                                handleGridKeyDown(e, currentVisualRow, colIdx)
                              }
                              onBlur={() => setEditingCell(null)}
                              className="w-full h-full"
                              inputClassName="px-1 py-0 text-xs bg-white border-0 outline-none leading-tight h-full"
                            />
                          ) : (
                            <div className="px-1 py-0 text-xs leading-tight">
                              {row.months[month] || ""}
                            </div>
                          )}
                        </td>
                      );
                    })
                  : QUARTERS.map((q) => {
                      const sum = q.months.reduce(
                        (s, m) => s + (row.months?.[m] ?? 0),
                        0
                      );
                      return (
                        <td
                          key={q.label}
                          className="text-right text-xs text-pwc-gray-700 px-2 border-r border-b border-pwc-gray-100"
                        >
                          {sum > 0 ? sum.toLocaleString("ko-KR") : ""}
                        </td>
                      );
                    })}
                {/* Actions */}
                <td className="px-1 py-0.5 text-center border-b border-pwc-gray-100">
                  <div className="flex items-center justify-center gap-0.5">
                    <button
                      onClick={() => duplicateRow(idx)}
                      disabled={!row.enabled}
                      className="p-0.5 text-pwc-gray-400 hover:text-pwc-black disabled:opacity-20"
                      title="행 복제"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 4.5v15m7.5-7.5h-15"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={() => deleteRow(idx)}
                      className="p-0.5 text-pwc-gray-400 hover:text-pwc-red"
                      title="행 삭제"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
          {/* Totals row */}
          <tr className="border-t-2 border-pwc-black bg-pwc-gray-100 font-bold">
            {/* sticky left cols — repeat bg for visibility */}
            <td className="sticky left-0 z-10 bg-pwc-gray-100 px-1 py-2 border-r border-pwc-gray-200" />
            <td className="sticky left-[32px] z-10 bg-pwc-gray-100 px-2 py-2 border-r border-pwc-gray-200 text-right" colSpan={3}>
              합계
            </td>
            <td className="bg-pwc-gray-100 px-2 py-2 border-r border-pwc-gray-200" />
            {/* sticky right — grand total */}
            <td className="sticky right-0 z-10 bg-pwc-gray-100 px-2 py-2 text-right border-l border-pwc-gray-200">
              {templateTotal.total > 0
                ? templateTotal.total.toLocaleString()
                : ""}
            </td>
            {viewMode === "month"
              ? MONTHS.map((month) => (
                  <td key={month} className="bg-pwc-gray-100 px-1 py-2 text-right border-r border-pwc-gray-200">
                    {templateTotal.monthTotals[month] > 0
                      ? templateTotal.monthTotals[month]
                      : ""}
                  </td>
                ))
              : QUARTERS.map((q) => {
                  const total = q.months.reduce(
                    (s, m) => s + (templateTotal.monthTotals[m] ?? 0),
                    0
                  );
                  return (
                    <td key={q.label} className="bg-pwc-gray-100 px-1 py-2 text-right border-r border-pwc-gray-200">
                      {total > 0 ? total.toLocaleString("ko-KR") : ""}
                    </td>
                  );
                })}
            <td className="bg-pwc-gray-100" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
