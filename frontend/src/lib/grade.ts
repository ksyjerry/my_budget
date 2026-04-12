// Grade 정렬 유틸 — 모든 표에서 공통 사용
// 순서: P > MD > D > SM > M > SA > A > AA (PwC Assurance 계층)
export const GRADE_ORDER = ["P", "MD", "D", "SM", "M", "SA", "A", "AA"];

export const GRADE_ALIASES: Record<string, string> = {
  "P": "P", "Partner": "P", "Ptr": "P",
  "MD": "MD", "Managing Director": "MD",
  "D": "D", "Dir": "D", "Director": "D",
  "SM": "SM", "Sr.Manager": "SM", "Sr Manager": "SM",
  "Senior Manager": "SM", "Senior-Manager": "SM",
  "M": "M", "Manager": "M", "Manager 1": "M", "Manager 2": "M",
  "SA": "SA", "SA1": "SA", "SA2": "SA",
  "Sr.Associate": "SA", "Senior Associate": "SA", "Senior-Associate": "SA",
  "Senior-Associate 1": "SA", "Senior-Associate 2": "SA",
  "A": "A", "Associate": "A",
  "AA": "AA", "A.Associate": "AA", "Assistant-Associate": "AA", "Assistant Associate": "AA",
};

export function gradeRank(raw: string | undefined | null): number {
  if (!raw) return 999;
  const normalized = GRADE_ALIASES[raw.trim()];
  if (!normalized) return 999;
  const idx = GRADE_ORDER.indexOf(normalized);
  return idx === -1 ? 999 : idx;
}
