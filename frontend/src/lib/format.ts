/** 숫자를 반올림하여 천단위 콤마로 표시 */
export function fmt(n: number | null | undefined): string {
  if (n == null) return "-";
  return Math.round(n).toLocaleString();
}

/** 진행률을 반올림 정수 + % 표시 */
export function fmtPct(n: number | null | undefined): string {
  if (n == null) return "-";
  return `${Math.round(n)}%`;
}
