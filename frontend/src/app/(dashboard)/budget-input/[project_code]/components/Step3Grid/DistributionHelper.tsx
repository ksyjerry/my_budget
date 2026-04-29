"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { NumberField } from "@/components/ui/NumberField";
import {
  distributeEvenly,
  distributeYearEndConcentrated,
  distributeByPeerRatio,
} from "../../lib/distribution";
import type { TemplateRow } from "../../types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface DistributionHelperProps {
  open: boolean;
  onClose: () => void;
  templateRows: TemplateRow[];
  selectedRowKeys: string[]; // ["category|unit|empno", ...]
  monthRange: string[];
  peerGroup: string | null; // e.g., "A1" — fetched from /peer-group
  baseHours: number; // ET controllable budget
  onApply: (changes: Map<string, Record<string, number>>) => void;
}

type Target = "selected" | "active";
type Mode = "even" | "year-end" | "peer";

export function DistributionHelper(props: DistributionHelperProps) {
  const {
    open,
    onClose,
    templateRows,
    selectedRowKeys,
    monthRange,
    peerGroup,
    baseHours,
    onApply,
  } = props;

  const [target, setTarget] = useState<Target>("selected");
  const [mode, setMode] = useState<Mode>("even");
  const [totalHours, setTotalHours] = useState(0);
  const [yearEndRatio, setYearEndRatio] = useState(0.5);
  const [peerStats, setPeerStats] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<Map<
    string,
    Record<string, number>
  > | null>(null);

  // Fetch peer stats if mode = peer
  useEffect(() => {
    if (mode !== "peer" || !peerGroup) return;
    fetch(
      `${API_BASE}/api/v1/budget/master/peer-stats?group=${peerGroup}`,
      { credentials: "include" }
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { budget_unit: string; avg_ratio: number }[]) => {
        // data: [{budget_unit, avg_ratio}, ...]
        const stats: Record<string, number> = {};
        if (Array.isArray(data)) {
          for (const item of data) stats[item.budget_unit] = item.avg_ratio;
        }
        setPeerStats(stats);
      })
      .catch(() => {});
  }, [mode, peerGroup]);

  if (!open) return null;

  const targetRows =
    target === "selected"
      ? templateRows.filter((r) =>
          selectedRowKeys.includes(
            `${r.budget_category}|${r.budget_unit}|${r.empno}`
          )
        )
      : templateRows.filter((r) => r.enabled);

  const computePreview = () => {
    let result;
    if (mode === "even") {
      result = distributeEvenly(targetRows, monthRange, totalHours);
    } else if (mode === "year-end") {
      result = distributeYearEndConcentrated(
        targetRows,
        monthRange,
        totalHours,
        yearEndRatio
      );
    } else {
      result = distributeByPeerRatio(
        targetRows,
        monthRange,
        peerStats,
        baseHours
      );
    }
    setPreview(result.changes);
  };

  const apply = () => {
    if (preview) {
      onApply(preview);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg p-6 w-[600px] max-h-[80vh] overflow-auto">
        <h3 className="text-lg font-bold mb-4">📊 분배 도우미</h3>

        <fieldset className="mb-4">
          <legend className="text-sm font-semibold mb-2">적용 대상</legend>
          <label className="block">
            <input
              type="radio"
              name="target"
              checked={target === "selected"}
              onChange={() => setTarget("selected")}
            />
            <span className="ml-2">
              선택한 행만 ({selectedRowKeys.length}개)
            </span>
          </label>
          <label className="block">
            <input
              type="radio"
              name="target"
              checked={target === "active"}
              onChange={() => setTarget("active")}
            />
            <span className="ml-2">
              활성(V 체크) 행 전체 (
              {templateRows.filter((r) => r.enabled).length}개)
            </span>
          </label>
        </fieldset>

        <fieldset className="mb-4">
          <legend className="text-sm font-semibold mb-2">분배 방식</legend>

          <label className="block mb-2">
            <input
              type="radio"
              name="mode"
              checked={mode === "even"}
              onChange={() => setMode("even")}
            />
            <span className="ml-2">총 시간 → 12개월 균등 분배</span>
            {mode === "even" && (
              <div className="ml-6 mt-1">
                <NumberField
                  label="총 시간 (행당)"
                  value={totalHours}
                  onChange={setTotalHours}
                  step={0.25}
                  min={0}
                  max={300}
                />
              </div>
            )}
          </label>

          <label className="block mb-2">
            <input
              type="radio"
              name="mode"
              checked={mode === "year-end"}
              onChange={() => setMode("year-end")}
            />
            <span className="ml-2">기말 집중 (마지막 3개월에 비중)</span>
            {mode === "year-end" && (
              <div className="ml-6 mt-1 space-y-2">
                <NumberField
                  label="총 시간 (행당)"
                  value={totalHours}
                  onChange={setTotalHours}
                  step={0.25}
                  min={0}
                  max={300}
                />
                <label className="block text-sm">
                  기말 비율: {Math.round(yearEndRatio * 100)}%
                  <input
                    type="range"
                    min={0.1}
                    max={0.9}
                    step={0.05}
                    value={yearEndRatio}
                    onChange={(e) =>
                      setYearEndRatio(parseFloat(e.target.value))
                    }
                    className="w-full"
                  />
                </label>
              </div>
            )}
          </label>

          <label className="block">
            <input
              type="radio"
              name="mode"
              checked={mode === "peer"}
              onChange={() => setMode("peer")}
            />
            <span className="ml-2">유사회사 평균 비율 적용</span>
            {mode === "peer" && (
              <div className="ml-6 mt-1 text-sm text-pwc-gray-600">
                {peerGroup
                  ? `유사회사 그룹: ${peerGroup}`
                  : "유사회사 그룹 미매핑 — Step 1 정보 확인"}
                {peerGroup && Object.keys(peerStats).length > 0 && (
                  <div>
                    비율 수: {Object.keys(peerStats).length}건 / 적용 기준 시간:{" "}
                    {baseHours}h
                  </div>
                )}
              </div>
            )}
          </label>
        </fieldset>

        {preview && (
          <div className="mb-4 p-3 bg-blue-50 rounded">
            <div className="text-sm font-semibold">미리보기</div>
            <div className="text-sm">
              {preview.size} 개 행에 변경 예정. 총{" "}
              {Array.from(preview.values())
                .reduce(
                  (s, m) =>
                    s + Object.values(m).reduce((a, b) => a + b, 0),
                  0
                )
                .toFixed(2)}
              h
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-pwc-gray-200 rounded"
          >
            취소
          </button>
          <button
            onClick={computePreview}
            className="px-4 py-2 text-sm border border-pwc-orange text-pwc-orange rounded"
          >
            미리보기
          </button>
          <button
            onClick={apply}
            disabled={!preview}
            className="px-4 py-2 text-sm bg-pwc-orange text-white rounded disabled:opacity-50"
          >
            적용
          </button>
        </div>
      </div>
    </div>
  );
}
