"use client";

import { useCallback, useRef, useState } from "react";
import type { ClientInfo, Member, TemplateRow } from "../types";
import { sanitizeMsg } from "../lib/wizard-validators";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export interface AiResult {
  type: "suggest" | "validate";
  data: Record<string, unknown>;
}

interface UseAiAssistOptions {
  projectCode: string;
  etControllable: number;
  templateRows: TemplateRow[];
  setTemplateRows: React.Dispatch<React.SetStateAction<TemplateRow[]>>;
  members: Member[];
  clientInfo: ClientInfo;
}

export function useAiAssist({
  projectCode,
  etControllable,
  templateRows,
  setTemplateRows,
  members,
  clientInfo,
}: UseAiAssistOptions) {
  const aiAbortRef = useRef<AbortController | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);

  const handleAiSuggest = useCallback(async () => {
    setAiLoading(true);
    setAiResult(null);
    try {
      const enabledUnits = templateRows
        .filter((r) => r.enabled)
        .map((r) => ({
          category: r.budget_category,
          unit_name: r.budget_unit,
        }));
      const uniqueUnits = enabledUnits.filter(
        (u, i, arr) =>
          arr.findIndex(
            (x) => x.category === u.category && x.unit_name === u.unit_name
          ) === i
      );
      const res = await fetch(`${API_BASE}/api/v1/budget-assist/suggest`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_code: projectCode,
          et_controllable: etControllable,
          enabled_units: uniqueUnits,
          members: members
            .filter((m) => m.role === "FLDT")
            .map((m) => ({ empno: m.empno, name: m.name, grade: m.grade })),
          client_info: clientInfo,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: "AI 추천 실패" }));
        throw new Error(errData.detail || "AI 추천 실패");
      }
      const data = await res.json();
      setAiResult({ type: "suggest", data });
    } catch (e) {
      alert(e instanceof Error ? e.message : "AI 추천 오류");
    } finally {
      setAiLoading(false);
    }
  }, [projectCode, etControllable, templateRows, members, clientInfo]);

  const handleAiValidate = useCallback(async () => {
    // abort previous in-flight request if any
    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;
    setAiLoading(true);
    setAiResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/budget-assist/validate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          project_code: projectCode,
          et_controllable: etControllable,
          rows: templateRows.filter((r) => r.enabled).map((r) => ({
            budget_category: r.budget_category,
            budget_unit: r.budget_unit,
            months: r.months,
            enabled: r.enabled,
          })),
          client_info: clientInfo,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: "AI 검증 실패" }));
        throw new Error(sanitizeMsg(errData.detail || "AI 검증 실패"));
      }
      const data = await res.json();
      setAiResult({ type: "validate", data });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      alert(e instanceof Error ? sanitizeMsg(e.message) : "AI 검증 오류");
    } finally {
      setAiLoading(false);
    }
  }, [projectCode, etControllable, templateRows, clientInfo]);

  const applyAiSuggestions = useCallback(() => {
    if (!aiResult || aiResult.type !== "suggest") return;
    const suggestions = (aiResult.data.suggestions || []) as {
      category: string;
      unit_name: string;
      hours: number;
    }[];
    setTemplateRows((prev) => {
      const newRows = [...prev];
      for (const s of suggestions) {
        const idx = newRows.findIndex(
          (r) =>
            r.budget_category === s.category &&
            r.budget_unit === s.unit_name &&
            r.enabled
        );
        if (idx >= 0) {
          const months = { ...newRows[idx].months };
          const monthKeys = Object.keys(months).filter((k) => k.startsWith("20"));
          if (monthKeys.length > 0) {
            const perMonth = Math.floor(s.hours / monthKeys.length);
            const remainder = s.hours - perMonth * monthKeys.length;
            monthKeys.forEach((k, i) => {
              months[k] = perMonth + (i === 0 ? remainder : 0);
            });
          }
          newRows[idx] = { ...newRows[idx], months };
        }
      }
      return newRows;
    });
    setAiResult(null);
  }, [aiResult, setTemplateRows]);

  const dismissAiResult = useCallback(() => setAiResult(null), []);

  return {
    aiLoading,
    aiResult,
    handleAiSuggest,
    handleAiValidate,
    applyAiSuggestions,
    dismissAiResult,
  };
}
