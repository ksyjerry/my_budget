# S5 — Step 3 Time Budget UX 개선

**Date:** 2026-04-21
**Status:** Approved (brainstorm)
**Sub-project:** S5 (of 7) — 2026-04-20 사용자 피드백 45건 분할안의 여섯 번째 단계
**Addresses feedback items:** #19, #20, #21, #22, #41, #43, #44, #52 (#42 는 S3 에서 처리)

## Context

Budget 입력 Wizard 의 Step 3 Time Budget 입력 UX 개선. 9건 중 #42(AI 실패) 는 S3 에서 이미 fix 됨. 실질 8건. 모두 frontend 변경 + 일부 backend export/import 추가.

## Goals

1. month cell input 검증 강화 — 음수 차단·step=0.25·max=300 (#41)
2. "입력 초기화" 버튼 — 모든 행 enabled=false + hours=0 (#44)
3. "등록완료" 시 필수 누락 필드 친화적 안내 (#52)
4. 임시저장 시 enabled=false 행도 보존 — 새로고침 후 복원 (#22)
5. 월/분기 표시 토글 — 분기 모드는 합산만 (#19)
6. Step 3 Time Budget Excel export + import (#20, #43)
7. 비감사 회계연도 D/D+1 지원 — `project.fiscal_start` 기반 동적 MONTHS (#21)

## Non-Goals

- AI 추천/검증 로직 변경 (S3 에서 처리)
- DB 스키마 변경 (fiscal_start 컬럼은 이미 존재)
- Step 1/Step 2 변경 (이전 sub-project 에서 처리)
- 분기 모드 입력 가능 (display only — 입력은 월 단위 유지)

## Feedback → 설계 매핑

| No | 사용자 | 요지 | 대응 |
|---|---|---|---|
| #19 | 홍상호 | 월/분기 단위 선택 | §5 |
| #20 | 홍상호 | Excel 업/다운 | §6 |
| #21 | 홍상호 | 비감사 D/D+1 회계연도 | §7 |
| #22 | 홍상호 | 임시저장 시 V 안된 항목 사라짐 | §4 |
| #41 | 서보경 | 음수/0.25/0-300 범위 | §1 |
| #43 | 서보경 | Excel import/export | §6 (#20 과 동일) |
| #44 | 서보경 | 입력 초기화 버튼 | §2 |
| #52 | 서보경 | 등록완료 시 누락 안내 | §3 |

## Design

### 1. Month cell validation 강화 (#41)

**파일:** `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx` lines 2675-2700 (month cell input)

**현재:** NumberField 가 적용되어 음수/min=0 은 처리되지만 max·step 제한 없음.

**변경:** Month input 에 `max={300}` + `step={0.25}` 추가:

```tsx
<NumberField
  value={row.hours[m]}
  onChange={(v) => updateMonthHours(rowIdx, m, v)}
  min={0}
  max={300}
  step={0.25}
/>
```

NumberField 컴포넌트도 `max?: number` prop 지원하도록 확장.

### 2. "입력 초기화" 버튼 (#44)

**파일:** `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx` lines 2378-2412 (toolbar)

기존 toolbar (AI 추천 / AI 검증 / + 행 추가) 옆에 "🔄 초기화" 버튼 추가:

```tsx
<button
  onClick={() => {
    if (confirm("모든 입력값을 초기화 합니다. 계속하시겠습니까?")) {
      setTemplateRows((prev) => prev.map((r) => ({
        ...r,
        enabled: false,
        empno: "",
        hours: Object.fromEntries(MONTHS.map((m) => [m, 0])),
      })));
    }
  }}
  className="..."
>
  🔄 초기화
</button>
```

### 3. 등록완료 누락 안내 (#52)

**파일:** `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx` saveAll 함수 (lines 525-548)

기존: `enabledRows.length > 0` 만 체크. 부족.

**변경:** 등록완료(`status === '작성완료'`) 시:
1. enabled rows 중 empno 가 비어있는 행 검출 → "담당자 미지정 N개"
2. enabled rows 중 모든 month hours 가 0 인 행 검출 → "시간 미입력 N개"
3. ET controllable budget 과 합계 차이 검증 → "시간 합계가 ET 잔여시간과 다름 (X시간 차이)"

각 case 의 rows 를 alert 메시지로 표시:

```tsx
const errors: string[] = [];
const noEmpno = enabledRows.filter((r) => !r.empno);
if (noEmpno.length > 0) {
  errors.push(
    `담당자 미지정 ${noEmpno.length}건:\n` +
    noEmpno.slice(0, 5).map((r) => `  - ${r.budget_unit}`).join("\n") +
    (noEmpno.length > 5 ? `\n  ...외 ${noEmpno.length - 5}건` : "")
  );
}
const noHours = enabledRows.filter((r) =>
  Object.values(r.hours).every((h) => !h || h === 0)
);
if (noHours.length > 0) {
  errors.push(`시간 미입력 ${noHours.length}건`);
}
const totalSum = enabledRows.reduce((s, r) =>
  s + Object.values(r.hours).reduce((a, b) => a + (b || 0), 0), 0
);
if (Math.abs(totalSum - etControllable) > 0.01) {
  errors.push(
    `시간 합계 ${totalSum.toLocaleString()} ≠ ET 잔여시간 ${etControllable.toLocaleString()} (차이: ${(totalSum - etControllable).toFixed(1)}h)`
  );
}
if (errors.length > 0 && status === "작성완료") {
  alert("등록완료 전 확인이 필요합니다:\n\n" + errors.join("\n\n"));
  return;
}
```

작성중(`작성중`) 상태로 임시저장하면 검증 건너뜀.

### 4. 임시저장 시 disabled 행 보존 (#22)

**파일:** `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx` saveStep3 (lines 454-455), saveAll (line 525), load logic (line 314)

**현재 문제:**
- save 시 `enabledRows = templateRows.filter((r) => r.enabled)` 만 DB 에 보냄
- DB 에 enabled=false 행은 저장 안 됨
- 새로고침 시 load 가 master units 와 DB 행을 merge 하지만, 사용자가 토글한 enabled=false 상태가 손실됨

**변경:**
- save 시 모든 행 보냄 (`templateRows` 전체) — 백엔드는 enabled flag 도 함께 저장
- 백엔드 `budget_details` 테이블에 `enabled` 컬럼이 있는지 확인 — 없으면 추가 (Alembic migration 005)
- 또는 DB row 가 있으면 enabled=true, 없으면 enabled=false 로 단순화 (현 구조 유지) — 단, **사용자가 명시적으로 disable 한 행** 을 별도 표시할 방법 필요

**최소 변경 안**: budget_details 의 budget_hours=0 행 도 저장하면 load 시 enabled=true 로 복원됨. 즉 0 시간 행을 저장하면 enabled 토글 상태가 유지됨. 사용자 직관에 부합.

구체:
- saveStep3 / saveAll 에서 `enabledRows` 가 아닌 `templateRows.filter((r) => r.enabled)` 대신 `templateRows.filter((r) => r.enabled || hasNonZeroHours(r))` — 즉 enabled true 또는 hours 입력 있는 행 모두 저장. enabled false + 0 시간은 DB 에 저장 안 함 (불필요).
- 사용자가 enabled=true 했지만 hours 0 인 경우도 저장됨 → load 시 enabled=true 로 복원 ✓

이 변경만으로 #22 사용자 피드백("V 표시한 항목 + 시간 입력한 항목" 은 유지) 이 자연스럽게 해결.

### 5. 월/분기 표시 토글 (#19)

**파일:** `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx` Step 3 toolbar + table

**State**: `viewMode: 'month' | 'quarter'` (default 'month')

**Toggle UI**: toolbar 에 "월" / "분기" 라디오 그룹 또는 toggle button 추가.

**Quarter mode 동작**:
- Column header: `1Q (4-6월)`, `2Q (7-9월)`, `3Q (10-12월)`, `4Q (1-3월)` 4개
- Cell: 해당 분기 3개월 hours 합산 표시 (read-only)
- 입력은 여전히 월 단위 (월 모드 전환 후 입력)

**구현**:
```tsx
const QUARTERS = [
  { label: "1Q", months: ["4월", "5월", "6월"] },
  { label: "2Q", months: ["7월", "8월", "9월"] },
  { label: "3Q", months: ["10월", "11월", "12월"] },
  { label: "4Q", months: ["1월", "2월", "3월"] },
];

function quarterSum(row, quarter) {
  return quarter.months.reduce((s, m) => s + (row.hours[m] || 0), 0);
}
```

Toolbar 에 toggle. 테이블은 `viewMode` 분기로 columns 다르게 렌더.

### 6. Step 3 Time Budget Excel export/import (#20, #43)

**Backend 신규 엔드포인트:**

```
GET  /api/v1/budget/projects/{code}/template/export
  require_login
  → openpyxl 생성 (rows × month columns)
  헤더: budget_category | budget_unit | empno | name | grade | <month1> | <month2> | ...

POST /api/v1/budget/projects/{code}/template/upload
  require_elpm + assert_can_modify_project
  → openpyxl parse → upsert budget_details
  응답: {"imported_count": n, "skipped": [...]}
```

**Frontend toolbar**: "📥 Excel 다운로드", "📤 Excel 업로드" 추가 (Step 2 와 동일 패턴).

**Excel 구조 (단순)**:
- 1행: 헤더
- 2행~: 각 행 = 한 budget_details 항목
- month columns 은 fiscal year 시작에 따라 동적 (12개)

### 7. 비감사 D/D+1 회계연도 (#21)

**파일:** 
- `frontend/src/lib/budget-constants.ts` — 정적 MONTHS 제거, helper 함수로
- `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx` — `project.fiscal_start` 기반 MONTHS 생성

**helper:**

```ts
// budget-constants.ts
export function generateMonths(fiscalStartIso: string | null | undefined): string[] {
  // 기본값: 4월 시작 (감사)
  const startMonth = fiscalStartIso
    ? new Date(fiscalStartIso).getMonth() + 1
    : 4;
  const startYear = fiscalStartIso
    ? new Date(fiscalStartIso).getFullYear()
    : new Date().getFullYear();
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const m = ((startMonth - 1 + i) % 12) + 1;
    const y = startYear + Math.floor((startMonth - 1 + i) / 12);
    months.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return months;
}

export function generateMonthLabels(months: string[]): string[] {
  return months.map((m) => `${parseInt(m.slice(5), 10)}월`);
}
```

**page.tsx:**

```tsx
const MONTHS = useMemo(() => generateMonths(project.fiscal_start), [project.fiscal_start]);
const MONTH_LABELS = useMemo(() => generateMonthLabels(MONTHS), [MONTHS]);
```

기존 import 된 `MONTHS` 상수를 컴포넌트 local 변수로 교체. fiscal_start 가 null 이면 default(4월) 사용.

**비감사 (#21 D/D+1)**: 비감사 프로젝트는 시작일을 자유롭게 설정 가능. 예를 들어 fiscal_start='2026-06-01' 이면 MONTHS = [2026-06, 2026-07, ..., 2027-05].

**기존 데이터 호환**: budget_details 의 year_month 가 ISO ("2025-04") 형식이라 fiscal year 변경에도 그대로 매핑 가능.

### 8. 테스트 플랜

**백엔드 pytest:**

- `test_template_upload_export.py`
  - export → xlsx content-type, 헤더 검증
  - upload → 5컬럼 + month columns parse → DB 반영
  - staff cookie → 403

**Playwright E2E (API):**

- `task-s5-template-export.spec.ts` — export 200 + xlsx
- `task-s5-template-upload.spec.ts` — basic upload (skip if DB lacks project)

### 9. 성공 기준

- Step 3 month input: 음수/300 초과 거부 (#41)
- 초기화 버튼 → confirm → 모든 행 reset (#44)
- 등록완료 시 누락 alert (#52)
- 임시저장 → 새로고침 → V 표시한 행 복원 (#22)
- 월/분기 toggle 동작 (#19)
- Excel export/import 동작 (#20, #43)
- fiscal_start 기반 MONTHS 정상 (#21)

## Open Questions

- 분기 모드에서 row 클릭 시 inline 입력 허용? — 현재는 read-only. 사용자 요청 시 확장.
- Excel import 시 기존 budget_details 전체 truncate vs append — **truncate** 가 일관성 (#22 fix 와 동일 철학).
- fiscal_start 가 변경되면 기존 budget_details 의 year_month 와 mismatch 가능 — 사용자 경고 표시.
