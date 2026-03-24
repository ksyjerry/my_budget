export const INDUSTRY_OPTIONS = [
  "① 제조업", "② 서비스업", "③ 건설업", "④ 금융업", "⑤ 도소매업", "⑥ 기타",
];

export const ASSET_SIZE_OPTIONS = [
  "① 별도 2조&연결 5조(자산매출평균) 이상",
  "② 별도 2조이상",
  "③ 별도 2조미만 ~ 5천억이상",
  "④ 별도 5천억미만 ~ 1천억이상",
  "⑤ 별도 1천억미만 ~ 500억이상",
  "⑥ 별도 500억미만 ~ 200억이상",
  "⑦ 별도 200억 미만",
];

export const LISTING_OPTIONS = [
  "① 유가증권상장", "② 코스닥상장", "③ 코넥스상장",
  "④ 채권상장", "⑤ 상장예정", "⑥ 비상장",
];

export const GAAP_OPTIONS = ["① IFRS", "② 일반기준"];
export const CONSOLIDATED_OPTIONS = ["① 작성", "② 미작성"];
export const BUSINESS_REPORT_OPTIONS = ["① 사업보고서 제출대상", "② 사업보고서 제출미대상"];

export const SUBSIDIARY_OPTIONS = [
  "① 없음", "② 10개 이하", "③ 11개~50개", "④ 51개~100개", "⑤ 100개 초과",
];

export const INTERNAL_CONTROL_OPTIONS = [
  "① 내부회계감사(연결)", "② 내부회계감사(별도)", "③ 내부회계검토", "④ 의무없음",
];

export const AUDIT_TYPE_OPTIONS = ["① 초도감사", "② 계속감사"];

export const MONTHS = [
  "2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09",
  "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03",
];

export const MONTH_LABELS = [
  "4월", "5월", "6월", "7월", "8월", "9월",
  "10월", "11월", "12월", "1월", "2월", "3월",
];

// 대분류 정렬 순서 (Budget 입력 기준)
export const CATEGORY_ORDER: Record<string, number> = {
  "분반기 검토": 1,
  "계획단계": 2,
  "재무제표 수준 위험": 3,
  "자산": 4,
  "부채 및 자본": 5,
  "수익/비용": 6,
  "종결단계": 7,
  "연결": 8,
  "내부통제": 9,
  "IT 감사-RA": 10,
  "(미배정)": 99,
};

export function getCategoryOrder(category: string): number {
  return CATEGORY_ORDER[category] ?? 50;
}
