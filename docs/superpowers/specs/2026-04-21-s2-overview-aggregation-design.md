# S2 — Overview 집계 버그 수정 + 필터 확장 + 도넛 drill-down

**Date:** 2026-04-21
**Status:** Approved (brainstorm)
**Sub-project:** S2 (of 7) — 2026-04-20 사용자 피드백 45건 분할안의 세 번째 단계
**Addresses feedback items:** #24, #25, #26, #49, #50, #51

## Context

Overview 페이지의 EL/PM/QRP Time 표와 STAFF TIME 표에서 Actual 시간 집계가 **중복 계산되거나 누락되는 버그**, 서비스 분류(감사/비감사) **필터가 노출되지만 실제 동작 안 함**, 도넛 차트의 drill-down 미구현 — 총 6건을 한 번에 처리한다. 모든 이슈의 근본 원인이 `backend/app/services/azure_service.py::get_overview_actuals`, `backend/app/services/budget_service.py::get_overview_data`, `backend/app/api/v1/overview.py` 3개 파일에 집중돼 있어 결합된 단일 spec 으로 처리해도 범위가 작다.

## Goals

1. PM 중복 누적 버그(#26) 를 `azure_service.py:390` 의 single-line 삭제로 해소
2. 미편성(budget=0) staff 의 Actual 을 STAFF TIME 표에 포함 (#25)
3. Fulcrum/RA/QRP 역할별 총 Actual 을 EL/PM/QRP Time 또는 Overview KPI 에 반영 (#24)
4. Overview 필터 바에 **service_type (대분류)** 필터 추가 — 등록된 프로젝트의 service_type 만 옵션으로 노출 (#50, #51)
5. 도넛 차트(예: Budget 관리단위별 Status / 활동별 Budget) 세그먼트 클릭 시 하단 테이블이 해당 카테고리로 필터링 (#49)

## Non-Goals

- `get_overview_actuals` 의 구조적 재설계 — 최소 패치로 끝낸다
- 도넛 drill-down 에서 새 페이지로 이동 — 같은 페이지 내 필터링만
- 대분류 필터 드롭다운에 존재하지 않는 값 강제 노출 (감사/세무/자문 전부) — DB 에서 실제 사용 중인 service_type 만 동적 노출
- 감사업무 Activity 표준화 파일의 감사용 mapping 재작성 (S1 에서 비감사만 처리, 감사는 별도)
- 새 API 엔드포인트 — 기존 `/overview`, `/filter-options` 만 확장

## Feedback → 설계 매핑

| No | 사용자 | 요지 | 대응 섹션 |
|---|---|---|---|
| #24 | 홍상호 | Overview Actual 합계에 Fulcrum/QRP 시간 누락 | §3 |
| #25 | 홍상호 | Budget 미입력 인원은 STAFF TIME actual 집계 X | §2 |
| #26 | 홍상호 | 프로젝트 미선택 시 PM Actual 2배 (123.25 → 246.5) | §1 |
| #49 | 서보경 | 도넛 클릭 시 세부 프로젝트명 drill-down 원함 | §6 |
| #50 | 서보경 | 대분류 필터에 "세무" 등 미사용 옵션 노출 | §4 |
| #51 | 서보경 | 대분류 필터 변경해도 view 가 안 바뀜 | §5 |

## Design

### 1. #26 PM 중복 집계 제거

**File:** `backend/app/services/azure_service.py`

**현재 (lines 385~390):**
```python
if role_set and emp in role_set:
    by_project_empno[(pc, emp)] += t

if staff_set and emp in staff_set:
    by_empno[emp] += t
    by_project_empno[(pc, emp)] += t   # 중복 누적 버그 — 삭제
```

**수정 후:**
```python
if role_set and emp in role_set:
    by_project_empno[(pc, emp)] += t

if staff_set and emp in staff_set:
    by_empno[emp] += t
```

PM/EL 이 staff_set 에도 포함될 때 `by_project_empno[(pc, emp)]` 에 두 번 추가되는 문제를 해결.

**테스트 (pytest)**:
- Fixture: 특정 empno 가 role_set 과 staff_set 양쪽에 포함되는 케이스 (실제 PM 이 Budget 구성원으로도 등록)
- Before: `by_project_empno[(pc, emp)] == 2 * expected`
- After: `by_project_empno[(pc, emp)] == expected`

### 2. #25 미편성 staff 의 Actual 포함

**File:** `backend/app/services/budget_service.py`

**현재 (line 246 부근):**
```python
staff_empnos = list(staff_budget.keys())  # Budget 있는 empno 만
```

**수정 후:**
```python
# Budget 있는 empno + TMS 에서 본 empno 모두 포함
tms_empnos = azure_service.get_project_empnos(project_codes)  # 신규 헬퍼
staff_empnos = list(set(staff_budget.keys()) | set(tms_empnos) - set(role_empnos))
```

여기서 `role_empnos` (EL/PM/QRP) 는 STAFF TIME 표에서 제외해야 하므로 차집합.

**신규 헬퍼** `azure_service.get_project_empnos(project_codes) -> list[str]`:
- 주어진 project_codes 의 TMS 행에서 distinct empno 반환
- 이미 `_fetch_tms_rows` 가 모든 행을 반환하므로, 같은 쿼리 재사용
- 성능: 캐시 활용 (기존 `@lru_cache` 패턴 따름)

**대안**: `staff_empnos` 를 확장하지 않고, `get_overview_actuals` 안에서 empno 가 role_set 에 없으면 무조건 `by_empno` 에 누적 — 단순하나 API 일관성이 깨질 수 있어 **헬퍼 방식 선택**.

**테스트**:
- Fixture: TMS 에 empno X 의 시간 기록이 있지만 Budget 에는 없음
- Before: `by_empno` 에 X 없음
- After: `by_empno[X]` 에 시간 합 표시

### 3. #24 Fulcrum/RA/QRP 역할별 Actual

**문제 재정의**: "Fulcrum" / "RA" 는 특정 empno 가 아니라 역할 레이블이다. Budget 에는 `empno='Fulcrum'` 같은 placeholder 문자열로 저장되지만 TMS 에는 실제 개인 사번으로 들어온다 → 직접 매칭 불가.

**현재 동작**:
- `by_category` 는 **모든** TMS 행을 categorized (budget_category 별). 즉 "Fulcrum" category 의 총 시간은 이미 계산됨.
- `by_project` 역시 모든 empno 의 시간 합산.
- 문제는 **STAFF TIME 표의 개별 행** 에 Fulcrum/RA 이름으로 시간이 보이지 않는 것.

**수정 전략**:
- §2 fix 로 미편성 staff Actual 이 포함되면 그 중 Fulcrum/RA/QRP 역할로 일한 시간도 자동 포함됨
- 추가로 Overview 의 KPI "총 Actual" 합계가 모든 by_project 값의 합산이 맞는지 검증 — `total_actual = sum(by_project.values())` 가 올바른지 테스트로 pinning
- Fulcrum/RA 레이블을 STAFF TIME 표에 역할-집계 행으로 보여주는 **선택적 개선**: Budget 쪽 empno 가 `Fulcrum` / `RA` 같은 placeholder 일 때, TMS 에서 해당 project 의 non-role 실사번의 시간을 합산해 한 행으로 표시 — 도메인 해석이 모호하므로 **이번 범위에서 제외**, S5 (Step3 UX) 에서 재논의.

결론: §2 fix 가 실질적으로 #24 의 "합계 누락" 부분을 해소한다. 추가 논의 필요한 UX 변경은 defer.

### 4. #50 service_type 필터 옵션 — DB 실사용 값만

**File:** `backend/app/api/v1/overview.py` (`/filter-options` 엔드포인트)

**현재 반환**:
```json
{"projects": [...], "els": [...], "pms": [...], "departments": [...]}
```

**추가**:
```json
{..., "service_types": [
  {"code": "AUDIT", "name": "감사"},
  {"code": "AC", "name": "회계자문"},
  {"code": "ESG", "name": "ESG"},
  ...
]}
```

**쿼리**:
```python
distinct_codes = (
    db.query(Project.service_type)
    .filter(Project.service_type.isnot(None))
    .distinct()
    .all()
)
# 8 전체 코드 중 실제 등록된 것만 + code→name 매핑 적용
from app.api.v1.budget_input import SERVICE_TYPES
name_by_code = {s["code"]: s["name"] for s in SERVICE_TYPES}
service_types = [
    {"code": c[0], "name": name_by_code.get(c[0], c[0])}
    for c in distinct_codes
]
```

"세무" 는 DB 에 없으므로 자동으로 옵션에서 제외됨 — #50 의 "세무 노출 문제" 자연 해소.

### 5. #51 service_type 필터 실제 동작

**파일:**
- `backend/app/api/v1/overview.py` `/overview` 엔드포인트 시그니처에 `service_type: Optional[str] = None` 추가
- `backend/app/services/budget_service.py` `get_overview_data(..., service_type=None)` 매개변수 추가 및 프로젝트 쿼리에 `.filter(Project.service_type == service_type)` when provided
- `frontend/src/app/(dashboard)/page.tsx` 필터 state 에 `service_type` 추가, 드롭다운 컴포넌트 추가, `fetchOverview` 에 쿼리 파라미터 전달

**필터 state (frontend)**:
```tsx
const [filters, setFilters] = useState({
  el_empno: "",
  pm_empno: "",
  department: "",
  project_code: "",
  year_month: "",
  service_type: "",   // ← 추가
});
```

**드롭다운 UI** — 기존 EL/PM/부서 드롭다운과 동일 컴포넌트 재사용, 옵션은 `/filter-options` 응답의 `service_types` 에서 매핑.

**백엔드 필터**:
```python
query = db.query(Project)
if service_type:
    query = query.filter(Project.service_type == service_type)
# 이후 기존 필터 체인 (el_empno, pm_empno, department, project_code) 동일 적용
```

### 6. #49 도넛 drill-down

**파일:**
- `frontend/src/app/(dashboard)/page.tsx`
- `frontend/src/components/charts/DonutChart.tsx` (변경 불필요 — `onSegmentClick` 이미 지원)

**동작**:
- 도넛 차트의 한 세그먼트를 클릭하면 **`selectedCategory` state 가 설정됨**
- 하단 "Budget 관리단위별 Status" 테이블이 `selectedCategory` 기준으로 필터링됨 (기존 필터 state 에 추가)
- 선택된 세그먼트는 시각적으로 강조 (unchanged opacity, 나머지 dimmed)
- 같은 세그먼트 재클릭 → 선택 해제 (필터 초기화)
- "필터 초기화" 버튼 하단 테이블 상단에 추가

**`page.tsx` 에 추가**:
```tsx
const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

<DonutChart
  data={categoryData}
  onSegmentClick={(name) =>
    setSelectedCategory((prev) => (prev === name ? null : name))
  }
  selected={selectedCategory}
/>
```

`DonutChart` 가 `selected` prop 으로 강조 처리되도록 — `DonutChart.tsx` 에서 선택된 세그먼트는 opacity 1.0, 나머지는 0.4 정도.

**하단 테이블 필터 적용**:
```tsx
const filteredUnits = selectedCategory
  ? budgetUnits.filter(u => u.budget_category === selectedCategory)
  : budgetUnits;
```

### 7. 마이그레이션 / 배포

- 스키마 변경 없음 — 순수 로직/UI 패치
- 백엔드 재배포, 프론트 재배포 순서로 진행
- 배포 후 수동 확인: EL/PM/QRP Time 표의 PM 값이 현실적인지, STAFF TIME 에 이전에 빠졌던 인원이 나타나는지, 대분류 필터 동작 + 도넛 클릭 필터링

### 8. 테스트 플랜

**백엔드 pytest** (`backend/tests/`):

- `test_overview_aggregation.py`
  - `test_pm_actual_not_double_counted` — #26 재현: empno 가 role_set/staff_set 양쪽에 있을 때 `by_project_empno` 가 1x 값인지 검증
  - `test_tms_only_empno_captured_in_by_empno` — #25 재현: Budget 없는 empno 의 TMS 시간이 `by_empno` 에 포함되는지
  - `test_total_actual_matches_sum_of_by_project` — 합계 일관성 검증 (#24 회귀 방지)

- `test_overview_filters.py`
  - `test_filter_options_returns_service_types` — `/filter-options` 응답에 service_types 배열 존재
  - `test_filter_options_only_db_service_types` — DB 에 없는 code 는 옵션에 없음 (예: TAX 미등록 시)
  - `test_overview_filters_by_service_type` — `/overview?service_type=ESG` 가 ESG 프로젝트만 반환

**Playwright E2E** (`frontend/tests/`):

- `task-s2-overview-filters.spec.ts`
  - service_type 드롭다운이 렌더되고 옵션이 API 응답 값
  - ESG 선택 시 프로젝트 리스트가 ESG 한정
- `task-s2-donut-drilldown.spec.ts`
  - 도넛 세그먼트 클릭 시 하단 테이블 행 수 감소 + 해당 category 만 표시
  - 재클릭 시 필터 해제

### 9. 성공 기준

- 홍상호 계정으로 Overview 접속 시 PM 시간이 프로젝트 선택 전후로 동일 (#26 해소)
- 서보경 계정으로 대분류 드롭다운에서 ESG 선택 시 ESG 프로젝트만 목록/차트에 반영 (#51 해소)
- 대분류 드롭다운에 "세무" 같은 미등록 항목 미노출 (#50 해소)
- 도넛 세그먼트 클릭 시 하단 테이블이 해당 카테고리로 자동 필터링 (#49)
- Budget 미입력 인원의 TMS 시간도 STAFF TIME 표에 반영 (#25, #24 합계 포함)
- Playwright + pytest 전부 green, S0/S1 회귀 없음

## Open Questions

- Fulcrum/RA 역할 집계 행을 STAFF TIME 표에 별도 표시할지 — 도메인 해석이 필요하므로 S2 에서 defer, 필요 시 별도 ticket
- 대분류 필터와 도넛 필터(selectedCategory) 둘 다 활성화 시 상호작용 — 지금은 **AND 조건** (둘 다 적용)
- `get_project_empnos` 헬퍼의 캐싱 수준 — 현재 `_fetch_tms_rows` 가 project_codes tuple 별로 `@lru_cache` 되어 있음. 재사용 시 중복 fetch 없어야 함 (구현 중 확인)
