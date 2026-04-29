"use client";

import type { TemplateRow, BudgetUnit } from "../../types";
import type { AiResult } from "../../hooks/useAiAssist";

interface ToolbarProps {
  rows: TemplateRow[];
  setRows: (rows: TemplateRow[]) => void;
  viewMode: "month" | "quarter";
  setViewMode: (v: "month" | "quarter") => void;
  aiLoading: boolean;
  aiResult: AiResult | null;
  etControllable: number;
  templateTotal: number;
  fiscalEnd?: string | null;
  onFiscalEndChange?: (val: string | null) => void;
  categories: string[];
  budgetUnits: BudgetUnit[];
  // action handlers
  onAiSuggest: () => void;
  onAiValidate: () => void;
  onReset: () => void;
  onApplyAiSuggestions: () => void;
  onDismissAiResult: () => void;
  onShowAddRow: () => void;
}

export function Toolbar({
  rows,
  setRows,
  viewMode,
  setViewMode,
  aiLoading,
  aiResult,
  etControllable,
  templateTotal,
  fiscalEnd,
  onFiscalEndChange,
  categories,
  onAiSuggest,
  onAiValidate,
  onReset,
  onApplyAiSuggestions,
  onDismissAiResult,
  onShowAddRow,
}: ToolbarProps) {
  return (
    <>
      {/* AI Assist + Controls row */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {/* 월/분기 view toggle */}
        <div className="flex items-center gap-1 text-xs">
          <button
            type="button"
            onClick={() => setViewMode("month")}
            className={`px-2 py-1 rounded ${
              viewMode === "month"
                ? "bg-pwc-orange text-white"
                : "border border-pwc-gray-200 text-pwc-gray-600"
            }`}
          >
            월
          </button>
          <button
            type="button"
            onClick={() => setViewMode("quarter")}
            className={`px-2 py-1 rounded ${
              viewMode === "quarter"
                ? "bg-pwc-orange text-white"
                : "border border-pwc-gray-200 text-pwc-gray-600"
            }`}
          >
            분기
          </button>
        </div>

        <button
          onClick={onAiSuggest}
          disabled={aiLoading || etControllable <= 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gradient-to-r from-pwc-orange to-[#EB8C00] text-white rounded-lg hover:opacity-90 disabled:opacity-40 transition-all"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
            />
          </svg>
          {aiLoading ? "분석 중..." : "AI 추천"}
        </button>

        <button
          onClick={onAiValidate}
          disabled={aiLoading || templateTotal <= 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-pwc-orange text-pwc-orange rounded-lg hover:bg-orange-50 disabled:opacity-40 transition-all"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {aiLoading ? "검증 중..." : "AI 검증"}
        </button>

        {/* 전체 V 토글 */}
        <button
          type="button"
          onClick={() => {
            const allEnabled = rows.every((r) => r.enabled);
            setRows(rows.map((r) => ({ ...r, enabled: !allEnabled })));
          }}
          className="px-3 py-1.5 text-xs border border-pwc-gray-200 rounded-lg hover:bg-pwc-gray-50 text-pwc-gray-900"
        >
          전체 V {rows.every((r) => r.enabled) ? "해제" : "체크"}
        </button>

        {/* 종료월 입력 */}
        {onFiscalEndChange && (
          <label className="flex items-center gap-1 text-xs text-pwc-gray-600">
            종료월:
            <input
              type="month"
              value={fiscalEnd ? fiscalEnd.substring(0, 7) : ""}
              onChange={(e) =>
                onFiscalEndChange(e.target.value ? `${e.target.value}-01` : null)
              }
              className="ml-1 px-2 py-1 text-xs border border-pwc-gray-200 rounded focus:outline-none focus:border-pwc-orange"
            />
          </label>
        )}

        <div className="flex-1" />

        {/* 초기화 */}
        <button
          type="button"
          onClick={onReset}
          className="px-3 py-1.5 text-xs border border-pwc-gray-200 rounded-lg hover:bg-pwc-gray-50 text-pwc-gray-900"
        >
          🔄 초기화
        </button>

        <button
          disabled={categories.length === 0}
          title={
            categories.length === 0
              ? "해당 서비스의 관리단위가 아직 설정되지 않았습니다. 관리자에게 문의하세요."
              : undefined
          }
          onClick={onShowAddRow}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-pwc-black text-pwc-black rounded-lg hover:bg-pwc-gray-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
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
          행 추가
        </button>
      </div>

      {/* AI Result Panel */}
      {aiResult && (
        <div className="border border-pwc-orange/30 bg-orange-50/50 rounded-lg p-4 text-sm space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-pwc-orange flex items-center gap-1.5">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                />
              </svg>
              {aiResult.type === "suggest" ? "AI 추천 결과" : "AI 검증 결과"}
            </h4>
            <button
              onClick={onDismissAiResult}
              className="text-pwc-gray-600 hover:text-pwc-black text-xs"
            >
              닫기 ✕
            </button>
          </div>
          <p className="text-pwc-gray-900">
            {(aiResult.data.summary as string) || ""}
          </p>
          {aiResult.type === "suggest" && (
            <>
              <div className="overflow-x-auto">
                <table className="text-xs w-full border border-pwc-gray-200 rounded">
                  <thead className="bg-pwc-gray-50">
                    <tr>
                      <th className="px-2 py-1 text-left">대분류</th>
                      <th className="px-2 py-1 text-left">관리단위</th>
                      <th className="px-2 py-1 text-right">추천시간</th>
                      <th className="px-2 py-1 text-left">근거</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      (aiResult.data.suggestions || []) as {
                        category: string;
                        unit_name: string;
                        hours: number;
                        reason: string;
                      }[]
                    ).map((s, i) => (
                      <tr key={i} className="border-t border-pwc-gray-100">
                        <td className="px-2 py-1">{s.category}</td>
                        <td className="px-2 py-1">{s.unit_name}</td>
                        <td className="px-2 py-1 text-right font-medium">
                          {s.hours}
                        </td>
                        <td className="px-2 py-1 text-pwc-gray-600">
                          {s.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={onApplyAiSuggestions}
                className="px-3 py-1.5 text-xs font-medium bg-pwc-orange text-white rounded hover:bg-[#B8400A] transition-colors"
              >
                추천값 적용하기
              </button>
            </>
          )}
          {aiResult.type === "validate" && (
            <div className="space-y-1">
              {(
                (aiResult.data.feedback || []) as {
                  type: string;
                  message: string;
                  unit?: string;
                }[]
              ).map((f, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 text-xs px-2 py-1 rounded ${
                    f.type === "warning"
                      ? "bg-red-50 text-pwc-red"
                      : f.type === "ok"
                      ? "bg-green-50 text-pwc-green"
                      : "bg-blue-50 text-blue-700"
                  }`}
                >
                  <span>
                    {f.type === "warning"
                      ? "⚠️"
                      : f.type === "ok"
                      ? "✅"
                      : "ℹ️"}
                  </span>
                  <span>
                    {f.message}
                    {f.unit ? ` (${f.unit})` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
