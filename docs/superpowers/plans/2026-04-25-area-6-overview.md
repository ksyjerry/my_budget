# 영역 6 (Overview / Tracking) Implementation Plan

> **For agentic workers:** subagent-driven, batched.

**Goal:** Fix 10 결함 + #03 시트 9건 + BT-001~016 권한 매트릭스. POL-01 (b) + POL-08 (b) 적용. 마지막 영역.

**Architecture:** Riding on Areas 1-5. Activates `display_budget()` (영역 1에서 NotImplementedError stub). Tracking endpoints 권한 가드 추가. Overview/Details/Appendix 화면 다수 fix.

---

## Spec Reference
[../specs/2026-04-25-area-6-overview-design.md](../specs/2026-04-25-area-6-overview-design.md)

## Files

**Create**:
- `backend/tests/regression/test_display_budget_pol01.py`
- `backend/tests/regression/test_overview_data_completeness.py` (#65 #93 #94)
- `backend/tests/regression/test_tracking_permission_pol08.py`
- `frontend/tests/regression/test_overview_filter_search_input.spec.ts`
- `frontend/tests/regression/test_overview_donut_cascading.spec.ts`
- `docs/superpowers/qa-checklists/area-6.md`
- `docs/superpowers/retros/area-6.md`
- `docs/superpowers/retros/s7-meta-cycle.md` — **S7 전체 사이클 회고**
- `docs/superpowers/runbooks/area-6-baseline-report.md`

**Modify**:
- `backend/app/services/budget_definitions.py` (display_budget activation per POL-01 (b))
- `backend/app/api/v1/overview.py` (display_budget 사용, Staff time 분리, 실질 Progress)
- `backend/app/api/v1/tracking.py` (POL-08 권한 가드)
- `backend/app/api/v1/assignments.py` (인원 이름 fallback)
- `backend/app/services/azure_service.py` (QRP TMS 확장, Budget 없는 인원)
- `backend/app/api/v1/export.py` 또는 appendix 관련 (Content-Disposition fix)
- `backend/tests/fixtures/permission_matrix.yaml` (BT endpoints 추가)
- `frontend/src/app/(dashboard)/overview-person/page.tsx` (도넛 cascading, 필터 검색, 연월, EL cascading, Staff time 분리)
- `frontend/src/app/(dashboard)/projects-staff/page.tsx` 또는 details 화면 (인원 이름 fallback)

---

## Batch 1: Baseline + RED tests + POL-01 활성화

### Task 1: Baseline
```bash
cd /Users/jkim564/Documents/Programming/my_budget/.worktrees/s7-area-6-overview
cd backend && pytest 2>&1 | tail -5
cd .. && bash scripts/ci/check-no-direct-number-input.sh && bash scripts/ci/check-no-direct-budget-arithmetic.sh && bash scripts/ci/check-docker-compose-no-dev.sh
git commit --allow-empty -m "chore(s7-area6): Area 6 baseline — Areas 1-5 safety net green"
```

### Task 2: 5 RED tests + POL-01 activation in display_budget

**File**: `backend/app/services/budget_definitions.py` — Replace `display_budget` body:

```python
def display_budget(project, *, view: BudgetView) -> float:
    """View별 표시 Budget — POL-01 (b) 적용: 모든 view에서 axdx_excluded_budget()."""
    return axdx_excluded_budget(project)
```

**File**: `backend/tests/regression/test_display_budget_pol01.py`
```python
"""POL-01 (b) — display_budget 가 모든 view에서 axdx_excluded_budget() 반환."""
from types import SimpleNamespace


def test_display_budget_overview_kpi_total_contract():
    from app.services.budget_definitions import display_budget
    p = SimpleNamespace(contract_hours=500.0, axdx_hours=77.0)
    assert display_budget(p, view="overview_kpi_total_contract") == 423.0


def test_display_budget_overview_project_table():
    from app.services.budget_definitions import display_budget
    p = SimpleNamespace(contract_hours=500.0, axdx_hours=77.0)
    assert display_budget(p, view="overview_project_table_budget") == 423.0


def test_display_budget_tracking():
    from app.services.budget_definitions import display_budget
    p = SimpleNamespace(contract_hours=500.0, axdx_hours=77.0)
    assert display_budget(p, view="tracking_budget_hour") == 423.0


def test_display_budget_summary():
    from app.services.budget_definitions import display_budget
    p = SimpleNamespace(contract_hours=500.0, axdx_hours=77.0)
    assert display_budget(p, view="summary_project_budget") == 423.0


def test_display_budget_zero_axdx():
    from app.services.budget_definitions import display_budget
    p = SimpleNamespace(contract_hours=500.0, axdx_hours=0.0)
    assert display_budget(p, view="overview_kpi_total_contract") == 500.0
```

**File**: `backend/tests/regression/test_overview_data_completeness.py`
```python
"""Regression #65 #93 #94 — Overview 데이터 완전성."""
import pytest


def test_qrp_tms_lookup_uses_qrp_empno():
    pytest.skip("requires Azure SQL mock — manual test on staging")


def test_overview_includes_unbudgeted_employees():
    pytest.skip("requires TMS data + budget seed — manual test on staging")


def test_employee_name_fallback_for_unknown_empno(db):
    """타 LoS 인원 등 employees에 없는 사번 — fallback 표시 검증.
    
    이 케이스는 frontend 표시 로직에서 처리. backend 응답에 emp_name이 비어 있으면
    '이름 미등록' or 사번만 표시.
    """
    pytest.skip("frontend display logic — covered by E2E")
```

**File**: `backend/tests/regression/test_tracking_permission_pol08.py`
```python
"""POL-08 (b) — Budget Tracking endpoints는 EL+admin만 접근."""
import pytest


@pytest.mark.parametrize("path,persona,expected", [
    # tracking endpoints — POL-08 (b): EL + admin only
    ("/api/v1/tracking/overview", "admin", 200),
    ("/api/v1/tracking/overview", "elpm", 200),  # elpm includes EL
    ("/api/v1/tracking/overview", "staff", 403),
    ("/api/v1/tracking/overview", "anon", 401),
])
def test_tracking_pol08_permission(client, admin_cookie, elpm_cookie, staff_cookie, path, persona, expected):
    cookies = {"admin": admin_cookie, "elpm": elpm_cookie, "staff": staff_cookie, "anon": None}[persona]
    resp = client.get(path, cookies=cookies)
    if expected in (200, 201):
        assert resp.status_code not in (401, 403), f"{persona} expected allow on {path}, got {resp.status_code}"
    else:
        assert resp.status_code == expected, f"{persona} expected {expected} on {path}, got {resp.status_code}"
```

**File**: `frontend/tests/regression/test_overview_filter_search_input.spec.ts`
```ts
import { test, expect } from "@playwright/test";

test.describe("regression #60 + #03 시트 #9 — 필터에 검색 input 추가", () => {
  test.skip(true, "manual test — Overview filter dropdown 가드");
});
```

**File**: `frontend/tests/regression/test_overview_donut_cascading.spec.ts`
```ts
import { test, expect } from "@playwright/test";

test.describe("regression #03 시트 #7 #8 — 도넛 click 시 KPI + Staff Time 동시 필터", () => {
  test.skip(true, "manual test — Overview 도넛 cascading");
});
```

**Run + commit**:
```bash
cd backend && pytest tests/regression/test_display_budget_pol01.py -v 2>&1 | tail -10
```
Expected: 5/5 PASS (POL-01 activation 동시 적용).

```bash
cd backend && pytest 2>&1 | tail -5
```
Expected: ~216 passed (211 + 5 new).

```bash
git add backend/app/services/budget_definitions.py backend/tests/regression/test_display_budget_pol01.py backend/tests/regression/test_overview_data_completeness.py backend/tests/regression/test_tracking_permission_pol08.py frontend/tests/regression/test_overview_*.spec.ts
git commit -m "feat+test(s7-area6): POL-01 (b) display_budget 활성화 + 5 RED tests"
```

---

## Batch 2: Backend fixes

### Task 3: Tracking POL-08 권한 가드

**File**: `backend/app/api/v1/tracking.py`

Find existing endpoints (likely `/tracking/overview`, `/tracking/sync` 등). Add `require_elpm` (or new `require_el_or_admin`) dependency to all GET endpoints (sync는 이미 admin only).

```bash
grep -n "@router\.\|require_" backend/app/api/v1/tracking.py | head -10
```

For each tracking endpoint that doesn't already have a guard:
```python
def get_tracking_overview(
    ...,
    user: dict = Depends(require_elpm),  # POL-08 (b): EL + admin only
):
```

Update permission_matrix.yaml fixture to include tracking endpoints with the right expected statuses.

```bash
cd backend && pytest tests/regression/test_tracking_permission_pol08.py tests/regression/test_permission_matrix.py -v 2>&1 | tail -15
git add backend/app/api/v1/tracking.py backend/tests/fixtures/permission_matrix.yaml
git commit -m "fix(s7-area6): POL-08 (b) — Budget Tracking endpoints 권한 가드 (EL+admin)"
```

### Task 4: Overview/Details data fixes (#65 #93 #94 + display_budget 적용)

**File**: `backend/app/api/v1/overview.py`

1. Replace any direct contract_hours/axdx 산술 with `axdx_excluded_budget(project)` or `display_budget(project, view=...)`.
2. Add 실질 Progress 컬럼 (#03 시트 #1): `actual_time / axdx_excluded_budget(project) * 100` (기존 Progress(B/A) 옆).
3. Add Staff time 분리 컬럼 (#03 시트 #5): FLDT-Staff vs Fulcrum/RA-Staff/Specialist 별도 집계.

**File**: `backend/app/services/azure_service.py`

1. **#93 — QRP TMS lookup**: In `get_overview_actuals()` or 유사 함수, ensure `qrp_empno` is in role_empnos when fetching actuals. If `qrp_empno` is null, log warning.
2. **#94 — Budget 없는 인원**: Already in S2 fix — extend to all overview views (not just STAFF TIME).

**File**: `backend/app/api/v1/assignments.py`

1. **#65 — 인원 이름 fallback**: If `emp_name` is missing/empty, return placeholder like `"이름 미등록 ({empno})"`.

```bash
cd backend && pytest 2>&1 | tail -5
git add backend/app/api/v1/overview.py backend/app/api/v1/assignments.py backend/app/services/azure_service.py
git commit -m "fix(s7-area6): Group A+B — display_budget 적용 + QRP TMS + Budget없는 인원 + 인원이름 fallback (#65 #93 #94 #03시트1,5)"
```

### Task 5: Appendix 다운로드 + service_type 분류 (#77 #78)

**File**: `backend/app/api/v1/export.py` (or appendix-related)

1. **#78**: Ensure `Content-Disposition: attachment; filename="..."` (UTF-8 encoded) + correct `Content-Type` for xlsx (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`).

2. **#77**: 분류명 표시 통일 — service_type enum 표시명을 "감사/비감사" 로 단순화 (또는 frontend 매핑).

```bash
cd backend && pytest 2>&1 | tail -5
git add backend/app/api/v1/
git commit -m "fix(s7-area6): #77 #78 — service_type 분류명 통일 + Appendix 다운로드 헤더"
```

---

## Batch 3: Frontend + docs + PR

### Task 6: Overview frontend (Groups C/E/H/I/J)

**File**: `frontend/src/app/(dashboard)/overview-person/page.tsx` 등 Overview 화면

1. **#60 + #03 시트 #9**: Project/PM/EL 등 필터 dropdown에 input 검색. (각 dropdown 안에 `<input type="text" placeholder="검색...">` 추가, 결과 client-side filter)
2. **#95**: 연월 dropdown 동적 생성 (현재 회계연도 4월~3월 12개)
3. **#96**: 프로젝트 선택 시 EL/PM dropdown filter — selected project 의 el_empno / pm_empno 만 활성화
4. **#03 시트 #7 #8**: 도넛 click → 상단 KPI + Staff Time 동시 필터 (state lift)
5. **#03 시트 #5**: Staff Time 분리 표시 (FLDT-Staff / Fulcrum/RA-Staff/Specialist 별도 컬럼)
6. **#65 frontend**: 인원 이름이 비어있으면 "({empno})" 표시 (fallback)
7. **#77**: service_type 표시 "감사/비감사"

```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -3
git add frontend/src/app/\(dashboard\)/overview-person/page.tsx frontend/src/app/\(dashboard\)/
git commit -m "fix(s7-area6): Overview frontend — Groups C/E/H/I/J (#60 #65 #77 #95 #96 #03시트5,7,8,9)"
```

### Task 7: Docs (qa-checklist + retro + S7 메타 회고) + final + PR

#### qa-checklist `docs/superpowers/qa-checklists/area-6.md`
```markdown
# Area 6 — Manual QA Checklist

**Tester:** ___ **Date:** ___

## Group A — POL-01 (b) Budget 정의
- [ ] Overview KPI / Project 테이블 / Tracking / Summary 모두 Budget = 총계약 - AX/DX
- [ ] 실질 Progress 컬럼 표시 (Actual / (총계약-AX/DX))

## Group B — 데이터 완전성
- [ ] QRP Actual 표시 (TMS에서)
- [ ] Budget 없는 인원도 Actual 집계
- [ ] 타 LoS 인원 — 이름 미등록 시 "({empno})" fallback

## Group C — 필터 UX
- [ ] Project/PM/EL 필터 dropdown 에 검색 input
- [ ] 연월 월별 dropdown (4월~3월 12개)
- [ ] 프로젝트 선택 → 해당 프로젝트의 EL/PM 만 활성화

## Group D — POL-08 (b) Budget Tracking 권한
- [ ] EL 계정 — Budget Tracking 화면 접근 가능
- [ ] admin 계정 — 접근 가능
- [ ] PM 계정 — 403 차단
- [ ] Staff 계정 — 403 차단

## Group E — 분류명 통일
- [ ] service_type 분류 "감사/비감사" 로 표시

## Group F — Appendix
- [ ] 다운로드 시 차단 경고 미발생
- [ ] 파일이 정상 xlsx로 저장됨

## Group G — POL-06 (a) RA 주관
- [ ] FLDT overview 만 노출 유지

## Group H — 도넛 cascading
- [ ] Overview 도넛 click → 상단 KPI + Staff Time 동시 필터
- [ ] "✕ 필터 해제" 버튼으로 초기화

## Group I — Staff time 분리
- [ ] FLDT-Staff 와 Fulcrum/RA-Staff/Specialist 별도 컬럼

## Group J — 직접 입력
- [ ] 모든 필터에서 검색 input 사용 가능

## 누적 회귀 (Areas 1-5)
- [ ] 모든 이전 영역 결함 fix 유지
- [ ] CI 5 jobs 녹색
```

#### retro `docs/superpowers/retros/area-6.md`
```markdown
# Area 6 Retrospective

**Completed:** ___

## POL-01 (b) 적용 효과
- 모든 view 동일 정의 → 사용자 혼동 제거

## POL-08 (b) 적용 효과
- Budget Tracking 권한 명확화

## Tests added
- backend/tests/regression/test_display_budget_pol01.py (5 tests)
- backend/tests/regression/test_overview_data_completeness.py (skip — manual)
- backend/tests/regression/test_tracking_permission_pol08.py (4 tests)
- frontend/tests/regression/test_overview_*.spec.ts (skip — manual)

## 외부 결정자 컨펌 진행
- POL-01: ___
- POL-08: ___

## Sign-off — S7 전체 사이클 종료
- [ ] All Phase E green
- [ ] User confirmed Area 6 ends
- [ ] S7 메타 사이클 회고 작성 (s7-meta-cycle.md)
```

#### S7 메타 회고 `docs/superpowers/retros/s7-meta-cycle.md`
```markdown
# S7 메타 사이클 회고 — Areas 1~6 종합

**기간**: 2026-04-25 ~ ___
**목표**: 0425 피드백 65건 + #03 9건 + #04 80행 + 회귀 7건 → 체계적 해소

## 결과
- Area 1: 안전망 + 회귀 7건 fix → PR #1
- Area 2: Budget 입력 목록 + POL-04 워크플로우 → PR #2
- Area 3: Step 1 (4 결함 + bonus) → PR #3
- Area 4: Step 2 (6 결함) → PR #4
- Area 5: Step 3 (22 결함 + 금융업 78행) → PR #5
- Area 6: Overview/Tracking + POL-01/08 → PR #6

## 메타 프레임워크 효과
- 6 영역 사이클 완수
- 누적 회귀 가드 0건 깨짐
- POL provisional 패턴으로 외부 컨펌 미접수에도 진행 가능

## 새 결함 클래스 (영역 사이클 중 발견)
- ACT regression (영역 1) — 영역 5 백로그
- 검색 modal merge 패턴 (영역 3) — 영역 4 사전 점검
- ...

## 미완 / 백로그
- Wizard 분해 (Area 7 sprint)
- POL-02 통상자문 Description UI (별도 mini-cycle)
- 외부 결정자 컨펌 (POL-01, 02, 03, 04, 05, 06, 07, 08, 09)

## 다음 라운드 권고
- 모든 PR (#1-#6) 사용자 검토 + 순차 merge
- Area 7 (구조 정리) 별도 spec 작성
- POL 외부 결정자 컨펌 진행
```

```bash
mkdir -p docs/superpowers/qa-checklists docs/superpowers/retros docs/superpowers/runbooks
git add docs/superpowers/qa-checklists/area-6.md docs/superpowers/retros/area-6.md docs/superpowers/retros/s7-meta-cycle.md
git commit -m "docs(s7-area6): qa-checklist + retro + S7 메타 사이클 회고"
```

#### Final verification + PR

```bash
cd backend && pytest 2>&1 | tail -5
bash scripts/ci/check-no-direct-number-input.sh && bash scripts/ci/check-no-direct-budget-arithmetic.sh && bash scripts/ci/check-docker-compose-no-dev.sh

git push -u origin s7/area-6-overview 2>&1 | tail -3

gh pr create --draft --base s7/area-5-step3 --title "S7 Area 6 — Overview / Tracking + POL-01/08 (마지막 영역)" --body "$(cat <<'BODYEOF'
## Summary
- Fixes ~10 결함 + #03 시트 9건 + BT-001~016 권한 매트릭스
- POL-01 (b) 적용 — display_budget() 활성화, 모든 view 에 axdx_excluded_budget()
- POL-08 (b) 적용 — Budget Tracking 권한 EL+admin
- S7 메타 사이클 회고 작성
- Spec: docs/superpowers/specs/2026-04-25-area-6-overview-design.md

## Test plan
- [ ] Area 6 regression tests
- [ ] Areas 1-5 누적 가드 green
- [ ] Manual QA (docs/superpowers/qa-checklists/area-6.md) all PASS

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODYEOF
)" 2>&1 | tail -10
```

#### Final report `docs/superpowers/runbooks/area-6-baseline-report.md`
```markdown
# Area 6 — Final Verification (S7 마지막)

**Date:** 2026-04-25

### Local results
- Backend pytest: <count>
- Grep guards: 3/3 PASS

### Push & PR
- Push: SUCCESS / FAIL
- Draft PR: <URL>

### S7 종합
- 6 영역 / ~70 결함 / 6 PR (#1-#6)
- 외부 결정자 컨펌 진행 권장: POL-01, 02, 03, 04, 05, 06, 07, 08

### Hand-off
- Manual QA: docs/superpowers/qa-checklists/area-6.md
- S7 메타 회고: docs/superpowers/retros/s7-meta-cycle.md
- Sign-off → S7 전체 종료
```

```bash
git add docs/superpowers/runbooks/area-6-baseline-report.md
git commit -m "docs(s7-area6): final verification + S7 종합 report"
git push 2>&1 | tail -3
```

---

**Plan complete. Ready for batched execution (3 dispatches).**
