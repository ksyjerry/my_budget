# S3 — Step 1/Step 3 UX 개선 + AI 엔드포인트 안정화

**Date:** 2026-04-21
**Status:** Approved (brainstorm)
**Sub-project:** S3 (of 7) — 2026-04-20 사용자 피드백 45건 분할안의 네 번째 단계
**Addresses feedback items:** #15, #17, #18, #29, #30, #31, #36, #37, #38, #42, #56

## Context

Budget 입력 Wizard 의 Step 1(기본정보) UX 를 중심으로 11개 사용자 피드백을 처리한다. 2개 항목(#29, #56) 은 이미 S1/기존 구현으로 완료 상태이므로 회귀 테스트만 추가한다. #37, #36 은 기존 로직의 작은 확장. 나머지 7건은 새 구현이 필요하며, 특히 AI 추천/검증 엔드포인트(#18, #42) 실패 원인을 근본 조사해 사용자에게 실패 사유를 노출한다.

## Goals

1. Budget 입력 Step 1 의 input 공통화 — NumberField 에 `min=0` 옵션, 천단위 구분, 음수 방지 (#38)
2. ET Controllable Budget 의 **명칭·설명·계산 범위** 개선 — travel_hours 분리, 라벨 + 툴팁 (#30, #31)
3. Project 검색 시 클라이언트 정보까지 자동 채움 (#37) — S1 T11 의 autofill 로직 재사용
4. Step 3 AI Assistant / 다음 버튼 **겹침 해소** (#15)
5. Step 3 React "duplicate key" 콘솔 에러 제거 (#17)
6. `/budget-assist/suggest` `/validate` 실패 원인 진단 + graceful error 전달 (#18, #42)
7. QRP 필드 공란 원인 확인 및 문서화 / 수기 입력 명확히 (#36)
8. S1 의 `/clients/{code}/info` autofill 동작 회귀 테스트 (#29)
9. 임시저장 동작 회귀 테스트 (#56)

## Non-Goals

- 중간저장의 "어디까지 저장됐는지" 시각화 (#56 UX 확장) — 임시저장 버튼으로 이미 기능은 존재. 시각화는 별도 ticket.
- AI 엔진 자체 재설계 — 실패 원인이 단순 bug 면 fix, 근본 문제(모델/권한 등)면 graceful degrade 로 사용자에게 안내만.
- Step 2/Step 3 의 다른 UX 이슈 — S4, S5 에서 별도 처리 (단, #15/#17 은 Step 3 관련이지만 Step 1 brainstorm 과정에서 함께 묶인 item)
- travel_hours 의 ET controllable 로직 제거 — UI 상 분리만 하고 백엔드 계산은 기존 유지 (도메인 해석 미확정)

## Feedback → 설계 매핑

| No | 사용자 | 요지 | 대응 |
|---|---|---|---|
| #15 | 홍상호 | Step 3 AI/다음 버튼 겹침 | §4 |
| #17 | 홍상호 | React duplicate key 콘솔 에러 | §5 |
| #18 | 홍상호 | AI 추천 버튼 실패 | §6 |
| #29 | 신승엽 | 클라이언트 정보 자동입력 | §8 (회귀 테스트만) |
| #30 | 신승엽 | 출장시간 ET controllable 레벨 문제 | §2 |
| #31 | 신승엽 | ET controllable 명칭/설명 | §2 |
| #36 | 서보경 | QRP 공란 | §7 |
| #37 | 서보경 | 프로젝트 검색 시 클라 정보 자동 | §3 |
| #38 | 서보경 | 음수·천단위 | §1 |
| #42 | 서보경 | AI 검증/추천 실패 (Step 3) | §6 |
| #56 | 김미진 | 중간저장 | §9 (회귀 테스트만) |

## Design

### 1. NumberField 개선 (#38)

**파일:** `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx` lines 44-54

**현재:**
```tsx
function NumberField({ label, value, onChange, readOnly, step }: NumberFieldProps) {
  return (
    <input
      type="number"
      value={value ?? ""}
      onChange={(e) => onChange?.(parseFloat(e.target.value) || 0)}
      ...
    />
  );
}
```

**변경:**
- Prop 추가: `min?: number` (default: undefined = 제한 없음, 하지만 Step 1 시간 배분 필드에는 `min={0}` 명시)
- Prop 추가: `allowNegative?: boolean` (default: false for 시간 배분, true for ET controllable display-only)
- 표시 시 `toLocaleString("ko-KR")` 로 천단위 구분 — **editable input 에는 type=number 유지하되, readOnly 필드만 formatted 표시**
- 음수 입력 시 `onChange` 에서 `Math.max(0, parsed)` 로 clamp (allowNegative 가 false 일 때)

**새 컴포넌트 구조:**
```tsx
interface NumberFieldProps {
  label: string;
  value?: number;
  onChange?: (v: number) => void;
  readOnly?: boolean;
  step?: number;
  min?: number;
  allowNegative?: boolean;
}

function NumberField(props: NumberFieldProps) {
  const display = props.readOnly && typeof props.value === "number"
    ? props.value.toLocaleString("ko-KR")
    : props.value ?? "";
  ...
  onChange={(e) => {
    let v = parseFloat(e.target.value) || 0;
    if (!props.allowNegative && v < 0) v = 0;
    if (typeof props.min === "number" && v < props.min) v = props.min;
    props.onChange?.(v);
  }}
  min={props.min}
}
```

**시간 배분 필드 업데이트 (#38):**
Step 1 의 AX/DX, QRP, RM, FLDT-EL, FLDT-PM, RA-EL/PM, travel 등 number input 들에 `min={0}` 추가.

**Controllable 음수 경고 (#38):**
ET controllable 계산 결과가 음수일 때, 계산 결과 아래에 빨간색 경고 표시:
```tsx
{etControllable < 0 && (
  <p className="text-xs text-pwc-red mt-1">
    ⚠ 차감 항목 합계가 총 계약시간을 초과합니다. 시간 배분을 재검토하세요.
  </p>
)}
```

### 2. ET Controllable 레이블 + travel 분리 (#30, #31)

**파일:** `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx`

**명칭 변경 (#31):** "ET Controllable Budget" → **"ET 잔여 시간 (Controllable Budget)"**

**툴팁 추가 (#31):** ET controllable 숫자 옆에 info icon, hover 시 설명:

```
"ET 잔여 시간 = 총 계약시간 − (AX/DX + QRP + RM/CRS/M&T + FLDT-EL + FLDT-PM +
RA-EL/PM + Fulcrum + RA-Staff + Specialist + 출장시간)

= 현장 팀(FLDT 구성원) 이 집행할 수 있는 실제 Budget 시간"
```

**travel_hours UI 분리 (#30):**
현재 Step 1 의 "시간 배분" grid 에서 `출장시간` 은 다른 팀 role-based 항목들과 같은 위치에 있음. 의미상 팀 구성과 무관한 비용 항목이므로 **시각적으로 구분**:

- `시간 배분` 섹션을 **2 개 group** 으로 나눔:
  - **Group A: 팀 구성원별 시간** (AX/DX, QRP, RM, FLDT-EL, FLDT-PM, RA-EL/PM, Fulcrum, RA-Staff, Specialist)
  - **Group B: 기타 차감 항목** (출장시간 — 단독)
- Group B 에는 안내 문구: "* 출장시간도 ET 잔여 시간에서 차감됩니다."

**백엔드 계산식은 변경하지 않음** — travel 은 기존처럼 ET controllable 에서 차감. 시각적 분리만 적용.

### 3. Project 검색 시 클라이언트 자동입력 (#37)

**파일:** `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx` lines 1315-1349

**현재:** `ProjectSearchModal` 의 `onSelect` 는 project 필드만 setProject() 로 주입. 클라이언트 세부 정보(industry 등)는 null/empty 로 남음.

**변경:** onSelect 안에서 project 주입 직후, `client_code` 가 있으면 `/clients/{code}/info` 호출 → `setClient` 로 클라이언트 필드 채움. **S1 T11 의 autofill 로직과 동일**:

```tsx
onSelect={async (p) => {
  setProject({...기존});
  if (p.client_code) {
    cField("client_code", p.client_code as string);
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const r = await fetch(`${API_BASE}/api/v1/budget/clients/${p.client_code}/info`, {
        credentials: "include",
      });
      if (r.ok) {
        const info = await r.json();
        setClient((prev) => ({
          ...prev,
          industry: prev.industry || info.industry || "",
          asset_size: prev.asset_size || info.asset_size || "",
          // 이하 9개 필드 — 기존 값 우선
          ...
        }));
      }
    } catch {
      /* silent fail */
    }
  }
}}
```

**동일 패턴 재사용 — 별도 공통 헬퍼 함수로 추출 가능**:

```tsx
async function fetchAndMergeClientInfo(clientCode: string, setClient: Setter): Promise<void> {
  ...
}
```

### 4. Step 3 AI 버튼 / 다음 버튼 레이아웃 (#15)

**파일:** `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx` 

**현재 이슈:** AI Assistant 버튼(lines ~2160) 과 "다음" 버튼(lines ~782) 이 Step 3 에서 같은 화면 영역에 노출되며 겹침.

**조사**: Step 3 의 JSX 구조를 확인해 sticky 버튼과 absolute positioning 이 충돌하는지 점검. 일반 해결:

- AI 버튼 bar 를 테이블 영역 상단에 `flex-wrap` 컨테이너로 배치
- 다음/이전 버튼 bar 는 페이지 하단 sticky 유지하되, 충돌 시 `bottom` 간격 증가

**구체 수정:**
- AI button container 를 `<div className="flex flex-wrap gap-2 items-center mb-3">` 로 재작성
- 다음 버튼 container 에 `z-10` 추가 (AI 버튼이 겹치는 경우 다음 버튼이 위로 올라오도록)
- Step 3 테이블 스크롤 영역에 bottom padding 추가 (`pb-20`) 해서 마지막 행이 다음 버튼에 가려지지 않도록

### 5. React duplicate key (#17)

**파일:** `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx` 주변 라인 2436

**가능 원인:**
- `MONTHS.map((month) => ...)` 에서 `month` 를 key 로 썼는데 `MONTHS` 배열에 중복이 있을 수 있음 — 예: 회계연도가 2년 걸치는 경우 같은 "1월" 이 2번 등장
- Row render 에서 row id 가 undefined/중복

**조사 + fix:**
1. `key` 로 쓰인 곳을 전수조사 (Step 1/2/3)
2. row level: `id` 가 있으면 사용, 없으면 `` `${project_code}-${budget_unit}-${idx}` `` 같이 고유 조합 생성
3. month level: `` `${year}-${month}` `` 또는 단순 `idx` 로 교체

### 6. AI 엔드포인트 실패 (#18, #42)

**백엔드 파일:** `backend/app/api/v1/budget_assist.py`

- `/budget-assist/suggest` (line ~152)
- `/budget-assist/validate` (line ~241)

**조사 절차:**
1. 로컬에서 실제 호출해 실패 응답 캡처
2. 에러 로그 스택 트레이스 확인 — 외부 AI 서비스(Anthropic/OpenAI) 키 미설정인지, Pydantic validation 실패인지, DB 조회 실패인지 구분
3. 원인에 따라:
   - **키 미설정** → 배포 환경 변수 체크 + 엔드포인트에서 "AI 서비스가 구성되지 않았습니다. 관리자에게 문의하세요" 503 반환
   - **Pydantic validation** → 요청 body 수정
   - **DB 조회 실패** → fallback 데이터로 기본 추천 반환
4. 프론트 `budget-input/[project_code]/page.tsx` 의 에러 팝업에 서버가 반환한 detail 메시지를 표시하도록 수정 (현재는 "실패" 한 단어만 띄움)

**프론트 변경 예시:**
```tsx
const r = await fetch(...);
if (!r.ok) {
  const data = await r.json().catch(() => ({ detail: "AI 추천 실패" }));
  alert(data.detail || "AI 추천 실패");  // 또는 toast
  return;
}
```

**graceful degrade:** AI 엔드포인트가 구성되지 않았거나 일시적으로 실패해도 Wizard 자체는 계속 사용 가능해야 함. 현재 이미 AI 는 optional 이므로 이 조건을 명시적으로 테스트.

### 7. QRP 공란 조사 (#36)

**파일:** `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx` lines 1489-1494

**관찰:** QRP 필드는 `NumberField` + `onChange` → 이미 editable. 사용자 피드백의 "공란" 은 다음 중 하나:
1. 시간(`qrp_hours`) 은 편집 가능한데 **QRP empno 가 null** 이라 다른 곳에서 "공란" 으로 인식
2. 프로젝트 검색 후 project state 에 QRP 값이 없어서 기본값 0 으로 표시됨

**행동:**
- 실제 재현 필요. Staff cookie 로 로그인해 감사클라이언트 프로젝트 생성 시 QRP 필드 확인.
- 이미 #5 (S0 때 해결됨 — Budget 입력 Step 1 에서 QRP 사번 직접 입력 가능) 의 연장선
- **최소 변경**: QRP empno + 시간 필드에 placeholder 추가 "수기 입력 가능" 문구
- 라벨 변경: "QRP (수기 입력)" 같이 표시

### 8. #29 회귀 테스트 (S1 autofill)

S1 T11 에서 구현한 `/clients/{code}/info` 호출이 실제로 Step 1 필드에 데이터 주입하는지 Playwright 로 확인. 이미 `task-s1-client-autofill.spec.ts` 가 API 레벨을 검증 — UI 레벨로 확장하거나, 현 API 테스트가 충분하므로 추가 작업 없음.

**결정:** 추가 Playwright UI 테스트는 건너뜀 (과도한 selector 튜닝). API 테스트 유지.

### 9. #56 임시저장 회귀 테스트

임시저장 버튼이 실제로 저장 상태로 "작성중" 를 DB 에 반영하는지 pytest 로 검증. 기존 백엔드 `test_task6_budget_actual.py` 또는 유사 테스트에 status="작성중" flow 가 있다면 활용. 없으면 신규 추가.

### 10. 테스트 플랜

**백엔드 pytest:**

- `test_budget_assist_endpoints.py`
  - `/budget-assist/suggest` 실패 케이스 — config 없을 때 503
  - `/budget-assist/validate` 유효 호출 시 200 + 구조
  - 실패 응답에 `detail` 필드 포함

**프론트 Playwright E2E (API-level):**

- `task-s3-project-search-autofill.spec.ts` — 프로젝트 검색 후 `/clients/{code}/info` 가 호출되는지 네트워크 검증 (#37)
- `task-s3-number-field-validation.spec.ts` — 시간 배분 필드 음수 입력 → 0 clamp 확인 (#38)

**수동 검증 (사용자에게 인계):**
- Step 1 시간 배분 필드에 음수/소수점 입력 시 거부 (#38)
- ET Controllable 툴팁 hover 시 설명 표시 (#31)
- travel_hours 가 "기타 차감" 섹션으로 이동 (#30)
- Step 3 AI 버튼과 다음 버튼 겹치지 않음 (#15)
- 콘솔에 duplicate key 경고 없음 (#17)
- AI 추천 버튼 실패 시 의미 있는 에러 메시지 표시 (#18, #42)
- 프로젝트 검색 → 클라이언트 9개 필드 자동 채워짐 (#37)
- QRP 필드 수기 입력 가능 (#36)

### 11. 성공 기준

- 사용자가 Step 1 에서 음수 입력 불가 (#38)
- ET Controllable 라벨이 이해 가능하고 툴팁이 나타남 (#31)
- travel_hours 가 시각적으로 분리됨 (#30)
- 프로젝트 검색만으로 클라이언트 정보 자동 채움 (#37)
- Step 3 AI/다음 버튼 겹침 해소 (#15)
- Console duplicate key 경고 0 건 (#17)
- AI 엔드포인트 실패 시 사용자에게 원인 노출 (#18, #42)
- Playwright + pytest 모두 green, S0/S1/S2 회귀 없음

## Open Questions

- AI 엔드포인트 실패의 실제 원인이 무엇인지 — 구현 중 재현 후 결정 (키 미설정 / 로직 bug / 외부 서비스 다운)
- travel_hours 의 ET controllable 포함 여부 — 현 범위에선 시각 분리만. 도메인 팀 결정 대기
- "ET 잔여 시간 (Controllable Budget)" 최종 라벨 — 사용자 확인 대기
