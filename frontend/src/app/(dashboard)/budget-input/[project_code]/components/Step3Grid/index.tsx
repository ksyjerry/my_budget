"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
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
import { DistributionHelper } from "./DistributionHelper";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

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

  // ── Distribution helper state ───────────────────────
  const [showDistHelper, setShowDistHelper] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [peerGroup, setPeerGroup] = useState<string | null>(null);

  // ── Peer group fetch ────────────────────────────────
  useEffect(() => {
    if (!clientInfo.industry || !clientInfo.asset_size) return;
    const params = new URLSearchParams({
      industry: clientInfo.industry,
      asset_size: clientInfo.asset_size,
      listing_status: clientInfo.listing_status || "",
      consolidated: clientInfo.consolidated || "",
      internal_control: clientInfo.internal_control || "",
    });
    fetch(`${API_BASE}/api/v1/budget/peer-group?${params}`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setPeerGroup(data?.stat_group || null))
      .catch(() => {});
  }, [
    clientInfo.industry,
    clientInfo.asset_size,
    clientInfo.listing_status,
    clientInfo.consolidated,
    clientInfo.internal_control,
  ]);

  // ── Apply distribution changes ──────────────────────
  const applyDistributionChanges = useCallback(
    (changes: Map<string, Record<string, number>>) => {
      setRows((prev) =>
        prev.map((row) => {
          const key = `${row.budget_category}|${row.budget_unit}|${row.empno}`;
          const newMonths = changes.get(key);
          if (!newMonths) return row;
          return { ...row, months: { ...row.months, ...newMonths } };
        })
      );
    },
    [setRows]
  );

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

  // ── Search + collapse state (sessionStorage persisted) ─────
  const [searchQuery, setSearchQuery] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return sessionStorage.getItem("step3-search") || "";
  });
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    () => {
      if (typeof window === "undefined") return new Set<string>();
      try {
        const saved = sessionStorage.getItem("step3-collapsed");
        return saved ? new Set<string>(JSON.parse(saved)) : new Set<string>();
      } catch {
        return new Set<string>();
      }
    }
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem("step3-search", searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(
      "step3-collapsed",
      JSON.stringify(Array.from(collapsedCategories))
    );
  }, [collapsedCategories]);

  const toggleCategory = useCallback((category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  const expandAllCategories = useCallback(() => {
    setCollapsedCategories(new Set());
  }, []);

  const collapseAllCategories = useCallback(() => {
    setCollapsedCategories(new Set(categories));
  }, [categories]);

  const visibleIndices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sortedIndices.filter((idx) => {
      const row = rows[idx];
      if (collapsedCategories.has(row.budget_category)) return false;
      if (!q) return true;
      return (
        row.budget_category.toLowerCase().includes(q) ||
        row.budget_unit.toLowerCase().includes(q) ||
        (row.emp_name || "").toLowerCase().includes(q) ||
        (row.empno || "").toLowerCase().includes(q)
      );
    });
  }, [sortedIndices, rows, searchQuery, collapsedCategories]);

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
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onExpandAll={expandAllCategories}
        onCollapseAll={collapseAllCategories}
        collapsedCount={collapsedCategories.size}
        totalCategoryCount={categories.length}
        onAiSuggest={handleAiSuggest}
        onAiValidate={handleAiValidate}
        onReset={() => handleReset(rows)}
        onApplyAiSuggestions={applyAiSuggestions}
        onDismissAiResult={dismissAiResult}
        onShowAddRow={() => setShowAddRow(true)}
        onOpenDistributionHelper={() => setShowDistHelper(true)}
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
        sortedIndices={visibleIndices}
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
        collapsedCategories={collapsedCategories}
        onToggleCategory={toggleCategory}
      />

      {/* Distribution Helper Modal */}
      <DistributionHelper
        open={showDistHelper}
        onClose={() => setShowDistHelper(false)}
        templateRows={rows}
        selectedRowKeys={selectedRowKeys}
        monthRange={MONTHS}
        peerGroup={peerGroup}
        baseHours={etControllable}
        onApply={applyDistributionChanges}
      />
    </div>
  );
}
