"use client";

import { useState, useMemo } from "react";
import type {
  TemplateRow,
  Member,
  BudgetUnit,
  ClientInfo,
} from "../../types";
import { useAiAssist } from "../../hooks/useAiAssist";
import { useStep3Reset } from "../../hooks/useStep3Reset";
import { SummaryRow } from "./SummaryRow";
import { Toolbar } from "./Toolbar";
import { AddRowModal } from "./AddRowModal";
import { MonthGrid } from "./MonthGrid";

interface Step3GridProps {
  rows: TemplateRow[];
  setRows: React.Dispatch<React.SetStateAction<TemplateRow[]>>;
  toggleRow: (idx: number) => void;
  updateRowMonth: (idx: number, month: string, value: number) => void;
  updateRowAssignee: (
    idx: number,
    empno: string,
    name: string,
    grade: string
  ) => void;
  duplicateRow: (idx: number) => void;
  rowTotal: (row: TemplateRow) => number;
  templateTotal: { total: number; monthTotals: Record<string, number> };
  members: Member[];
  etControllable: number;
  budgetUnits: BudgetUnit[];
  projectCode: string;
  clientInfo: ClientInfo;
  months: string[];
  monthLabels: string[];
  fiscalEnd?: string | null;
  onFiscalEndChange?: (val: string | null) => void;
}

export function Step3Grid({
  rows,
  setRows,
  toggleRow,
  updateRowMonth,
  updateRowAssignee,
  duplicateRow,
  rowTotal,
  templateTotal,
  members,
  etControllable,
  budgetUnits,
  projectCode,
  clientInfo,
  months: MONTHS,
  monthLabels: MONTH_LABELS,
  fiscalEnd,
  onFiscalEndChange,
}: Step3GridProps) {
  // ── View state ─────────────────────────────────────
  const [viewMode, setViewMode] = useState<"month" | "quarter">("month");

  // ── Grid interaction state ──────────────────────────
  const [activeCell, setActiveCell] = useState<{
    row: number;
    col: number;
  } | null>(null);
  const [editingCell, setEditingCell] = useState<{
    row: number;
    col: number;
  } | null>(null);

  // ── Add-row modal state ─────────────────────────────
  const [showAddRow, setShowAddRow] = useState(false);
  const [newRowCategory, setNewRowCategory] = useState("");
  const [newRowUnit, setNewRowUnit] = useState("");

  // ── Hooks ───────────────────────────────────────────
  const { handleReset } = useStep3Reset({
    projectCode,
    months: MONTHS,
    setRows,
  });

  const {
    aiLoading,
    aiResult,
    handleAiSuggest,
    handleAiValidate,
    applyAiSuggestions,
    dismissAiResult,
  } = useAiAssist({
    projectCode,
    etControllable,
    templateRows: rows,
    setTemplateRows: setRows,
    members,
    clientInfo,
  });

  // ── Derived state ───────────────────────────────────
  const QUARTERS = useMemo(() => {
    const out: { label: string; months: string[] }[] = [];
    for (let i = 0; i < MONTHS.length; i += 3) {
      const slice = MONTHS.slice(i, i + 3);
      if (slice.length === 0) break;
      const startMonth = parseInt(slice[0].slice(5), 10);
      const endMonth = parseInt(slice[slice.length - 1].slice(5), 10);
      const qIdx = i / 3 + 1;
      out.push({
        label: `${qIdx}Q (${startMonth}-${endMonth}월)`,
        months: slice,
      });
    }
    return out;
  }, [MONTHS]);

  const sortedIndices = useMemo(() => {
    const unitOrderMap = new Map<string, number>();
    budgetUnits.forEach((u) => {
      unitOrderMap.set(`${u.category}|${u.unit_name}`, u.sort_order);
    });
    const indices = rows.map((_, i) => i);
    indices.sort((a, b) => {
      const ra = rows[a],
        rb = rows[b];
      if (ra.enabled !== rb.enabled) return ra.enabled ? -1 : 1;
      const oa =
        unitOrderMap.get(`${ra.budget_category}|${ra.budget_unit}`) ?? 9999;
      const ob =
        unitOrderMap.get(`${rb.budget_category}|${rb.budget_unit}`) ?? 9999;
      if (oa !== ob) return oa - ob;
      return (ra.emp_name || "").localeCompare(rb.emp_name || "");
    });
    return indices;
  }, [rows, budgetUnits]);

  const categories = useMemo(
    () => [...new Set(budgetUnits.map((u) => u.category))],
    [budgetUnits]
  );

  // ── Add-row handler ─────────────────────────────────
  const addNewRow = () => {
    if (!newRowCategory || !newRowUnit) return;
    const defaultAssignee =
      members.find((m) => m.role === "FLDT 구성원") || members[0];
    const newRow: TemplateRow = {
      budget_category: newRowCategory,
      budget_unit: newRowUnit,
      empno: defaultAssignee?.empno || "",
      emp_name: defaultAssignee?.name || "",
      grade: defaultAssignee?.grade || "",
      months: {},
      enabled: true,
    };
    setRows((prev) => [...prev, newRow]);
    setShowAddRow(false);
    setNewRowCategory("");
    setNewRowUnit("");
  };

  // setRows shim — Toolbar needs (rows: TemplateRow[]) => void (not dispatch)
  const setRowsArray = (next: TemplateRow[]) => setRows(next);

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <SummaryRow total={templateTotal.total} etControllable={etControllable} />

      {/* Toolbar + AI panel */}
      <Toolbar
        rows={rows}
        setRows={setRowsArray}
        viewMode={viewMode}
        setViewMode={setViewMode}
        aiLoading={aiLoading}
        aiResult={aiResult}
        etControllable={etControllable}
        templateTotal={templateTotal.total}
        fiscalEnd={fiscalEnd}
        onFiscalEndChange={onFiscalEndChange}
        categories={categories}
        budgetUnits={budgetUnits}
        onAiSuggest={handleAiSuggest}
        onAiValidate={handleAiValidate}
        onReset={() => handleReset(rows)}
        onApplyAiSuggestions={applyAiSuggestions}
        onDismissAiResult={dismissAiResult}
        onShowAddRow={() => setShowAddRow(true)}
      />

      {/* Add Row Modal */}
      {showAddRow && (
        <AddRowModal
          categories={categories}
          budgetUnits={budgetUnits}
          newRowCategory={newRowCategory}
          setNewRowCategory={setNewRowCategory}
          newRowUnit={newRowUnit}
          setNewRowUnit={setNewRowUnit}
          onAdd={addNewRow}
          onCancel={() => {
            setShowAddRow(false);
            setNewRowCategory("");
            setNewRowUnit("");
          }}
        />
      )}

      {/* Spreadsheet grid */}
      <MonthGrid
        rows={rows}
        setRows={setRowsArray}
        sortedIndices={sortedIndices}
        months={MONTHS}
        monthLabels={MONTH_LABELS}
        quarters={QUARTERS}
        viewMode={viewMode}
        members={members}
        budgetUnits={budgetUnits}
        templateTotal={templateTotal}
        activeCell={activeCell}
        setActiveCell={setActiveCell}
        editingCell={editingCell}
        setEditingCell={setEditingCell}
        toggleRow={toggleRow}
        updateRowMonth={updateRowMonth}
        updateRowAssignee={updateRowAssignee}
        duplicateRow={duplicateRow}
        rowTotal={rowTotal}
      />
    </div>
  );
}
