"use client";

import { useCallback } from "react";
import type { TemplateRow } from "../types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface UseStep3ResetOptions {
  projectCode: string;
  months: string[];
  setRows: React.Dispatch<React.SetStateAction<TemplateRow[]>>;
}

export function useStep3Reset({
  projectCode,
  months: MONTHS,
  setRows,
}: UseStep3ResetOptions) {
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

  return { handleReset };
}
