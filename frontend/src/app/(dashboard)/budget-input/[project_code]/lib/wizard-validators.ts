// ── Wizard Pure Validators & Helpers ──────────────────────────────────────
// PURE functions only — no React hooks, no state, no side-effects.
// Import types from the sibling types.ts.

import type { TemplateRow } from "../types";

/**
 * Strip host/IP from user-facing error messages.
 * (#111 frontend sanitize safety net)
 */
export function sanitizeMsg(s: string): string {
  return s
    .replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?/g, "[host]")
    .replace(/localhost(:\d+)?/gi, "[host]");
}

/**
 * Validate template rows for "작성완료" status.
 * Returns an array of human-readable error strings (empty = valid).
 *
 * @param enabledRows - rows where row.enabled === true
 * @param etControllable - ET-controllable budget hours
 */
export function computeStep3Errors(
  enabledRows: TemplateRow[],
  etControllable: number
): string[] {
  const errors: string[] = [];

  const noEmpno = enabledRows.filter((r) => !r.empno);
  if (noEmpno.length > 0) {
    errors.push(
      `담당자 미지정 ${noEmpno.length}건:\n` +
        noEmpno
          .slice(0, 5)
          .map((r) => `  - ${r.budget_unit ?? ""}`)
          .join("\n") +
        (noEmpno.length > 5 ? `\n  ...외 ${noEmpno.length - 5}건` : "")
    );
  }

  const noHours = enabledRows.filter((r) =>
    Object.values(r.months ?? {}).every((h) => !h || h === 0)
  );
  if (noHours.length > 0) {
    errors.push(`시간 미입력 ${noHours.length}건`);
  }

  const totalSum = enabledRows.reduce(
    (s, r) => s + Object.values(r.months ?? {}).reduce((a, b) => a + (b || 0), 0),
    0
  );
  if (Math.abs(totalSum - etControllable) > 0.01) {
    errors.push(
      `시간 합계 ${totalSum.toLocaleString()} ≠ ET Controllable ${etControllable.toLocaleString()} (차이: ${(totalSum - etControllable).toFixed(1)}h)`
    );
  }

  return errors;
}

// ── Row-level real-time validation ────────────────────────────────────────
// Used by Step3Grid/MonthGrid.tsx to highlight cells while the user types.

export type RowValidationStatus =
  | "ok"
  | "missing-empno"
  | "no-hours"
  | "over-budget"
  | "negative";

export function validateRow(row: TemplateRow): RowValidationStatus {
  if (!row.enabled) return "ok"; // disabled rows not validated
  if (!row.empno || row.empno.trim() === "") return "missing-empno";
  const months = row.months ?? {};
  if (Object.values(months).some((v) => (v ?? 0) < 0)) return "negative";
  const total = Object.values(months).reduce((s, v) => s + (v || 0), 0);
  if (total === 0) return "no-hours";
  return "ok";
}

export function getRowValidationClass(status: RowValidationStatus): string {
  switch (status) {
    case "missing-empno":
    case "negative":
      return "border-l-4 border-l-pwc-red";
    case "no-hours":
      return "border-l-4 border-l-pwc-yellow";
    default:
      return "";
  }
}

export function getCellValidationClass(
  row: TemplateRow,
  columnType: "empno" | "hours-total"
): string {
  const status = validateRow(row);
  if (columnType === "empno" && status === "missing-empno") return "ring-1 ring-pwc-red ring-inset bg-red-50/50";
  if (columnType === "hours-total" && status === "no-hours") return "ring-1 ring-pwc-yellow ring-inset bg-yellow-50/50";
  if (columnType === "hours-total" && status === "negative") return "ring-1 ring-pwc-red ring-inset bg-red-50/50";
  return "";
}
