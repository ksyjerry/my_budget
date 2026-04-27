"use client";

import type { BudgetUnit } from "../../types";

interface AddRowModalProps {
  categories: string[];
  budgetUnits: BudgetUnit[];
  newRowCategory: string;
  setNewRowCategory: (v: string) => void;
  newRowUnit: string;
  setNewRowUnit: (v: string) => void;
  onAdd: () => void;
  onCancel: () => void;
}

export function AddRowModal({
  categories,
  budgetUnits,
  newRowCategory,
  setNewRowCategory,
  newRowUnit,
  setNewRowUnit,
  onAdd,
  onCancel,
}: AddRowModalProps) {
  const filteredUnits = newRowCategory
    ? budgetUnits.filter((u) => u.category === newRowCategory)
    : [];

  return (
    <div className="border border-pwc-gray-200 bg-white rounded-lg p-4 shadow-sm space-y-3">
      <h4 className="text-sm font-bold text-pwc-black">새 행 추가</h4>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs text-pwc-gray-600 mb-1">대분류</label>
          <select
            value={newRowCategory}
            onChange={(e) => {
              setNewRowCategory(e.target.value);
              setNewRowUnit("");
            }}
            className="w-full px-2 py-1.5 text-sm border border-pwc-gray-200 rounded focus:outline-none focus:border-pwc-orange"
          >
            <option value="">선택하세요</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs text-pwc-gray-600 mb-1">
            Budget 관리단위
          </label>
          <select
            value={newRowUnit}
            onChange={(e) => setNewRowUnit(e.target.value)}
            disabled={!newRowCategory}
            className="w-full px-2 py-1.5 text-sm border border-pwc-gray-200 rounded focus:outline-none focus:border-pwc-orange disabled:bg-pwc-gray-50"
          >
            <option value="">선택하세요</option>
            {filteredUnits.map((u, ui) => (
              <option key={`${ui}-${u.unit_name}`} value={u.unit_name}>
                {u.unit_name}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={onAdd}
          disabled={!newRowCategory || !newRowUnit}
          className="px-4 py-1.5 text-sm font-medium bg-pwc-black text-white rounded hover:bg-pwc-gray-900 disabled:opacity-40 transition-colors"
        >
          추가
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-pwc-gray-600 hover:text-pwc-black"
        >
          취소
        </button>
      </div>
    </div>
  );
}
