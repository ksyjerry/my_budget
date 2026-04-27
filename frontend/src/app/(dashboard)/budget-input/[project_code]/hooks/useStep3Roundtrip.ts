"use client";

import { useCallback } from "react";
import type { TemplateRow } from "../types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface UseStep3RoundtripOptions {
  projectCode: string;
  months: string[];
  setRows: React.Dispatch<React.SetStateAction<TemplateRow[]>>;
  onTemplateImported?: () => Promise<void>;
}

export function useStep3Roundtrip({
  projectCode,
  months: MONTHS,
  setRows,
  onTemplateImported,
}: UseStep3RoundtripOptions) {
  const handleExportTemplate = useCallback(async () => {
    const res = await fetch(
      `${API_BASE}/api/v1/budget/projects/${projectCode}/template/export`,
      { credentials: "include" }
    );
    if (!res.ok) {
      alert("다운로드 실패");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `template_${projectCode}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [projectCode]);

  const handleExportBlankTemplate = useCallback(async () => {
    const res = await fetch(
      `${API_BASE}/api/v1/budget/template/blank-export`,
      { credentials: "include" }
    );
    if (!res.ok) {
      alert("빈 Template 다운로드 실패");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "budget_template_blank.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImportTemplate = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!confirm("기존 Time Budget 데이터가 모두 교체됩니다. 계속하시겠습니까?")) {
        e.target.value = "";
        return;
      }
      const fd = new FormData();
      fd.append("file", file);
      try {
        const r = await fetch(
          `${API_BASE}/api/v1/budget/projects/${projectCode}/template/upload`,
          { method: "POST", body: fd, credentials: "include" }
        );
        if (!r.ok) {
          const d = await r.json().catch(() => ({ detail: "업로드 실패" }));
          alert(d.detail || "업로드 실패");
          return;
        }
        const data = await r.json();
        alert(`${data.imported_count}건 업로드 완료. Time Budget을 다시 로드합니다.`);
        if (typeof onTemplateImported === "function") {
          await onTemplateImported();
        } else {
          const u = new URL(window.location.href);
          window.location.href = u.toString();
        }
      } catch (err) {
        alert(`업로드 오류: ${err instanceof Error ? err.message : "알 수 없음"}`);
      }
      e.target.value = "";
    },
    [projectCode, onTemplateImported]
  );

  const handleReset = useCallback(
    async (rows: TemplateRow[]) => {
      if (!confirm("Time Budget 의 모든 입력값을 초기화 합니다. 계속하시겠습니까?")) return;
      try {
        await fetch(
          `${API_BASE}/api/v1/budget/projects/${projectCode}/template/reset`,
          { method: "POST", credentials: "include" }
        );
      } catch {
        // best-effort; reset frontend state regardless
      }
      setRows(
        rows.map((r) => ({
          ...r,
          enabled: false,
          empno: "",
          emp_name: "",
          grade: "",
          months: Object.fromEntries(MONTHS.map((m) => [m, 0])) as Record<string, number>,
        }))
      );
    },
    [projectCode, MONTHS, setRows]
  );

  return {
    handleExportTemplate,
    handleExportBlankTemplate,
    handleImportTemplate,
    handleReset,
  };
}
