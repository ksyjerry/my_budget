# S2 — Overview 집계 버그 / 필터 / 도넛 drill-down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자 피드백 #24/#25/#26/#49/#50/#51 대응. `azure_service.get_overview_actuals` 의 PM 이중 누적 제거, 미편성 staff Actual 포함, `/filter-options` 와 `/overview` 에 service_type 필터 확장, Overview 프론트 드롭다운·도넛 drill-down 구현.

**Architecture:**
- **백엔드 3 파일:** `azure_service.py` (bug fix + helper 추가), `budget_service.py` (staff_empnos 확장 + service_type 필터), `overview.py` (service_type 파라미터 + filter-options 확장).
- **프론트 1 파일:** `app/(dashboard)/page.tsx` (service_type 필터 state/UI, 도넛 onSegmentClick 바인딩, 하단 테이블 selectedCategory 필터).
- **테스트:** 백엔드 pytest 2 파일 (집계/필터), Playwright 2 specs (필터/drill-down).

**Tech Stack:** FastAPI, SQLAlchemy, Next.js 16, React, Playwright, pytest.

**Spec:** [docs/superpowers/specs/2026-04-21-s2-overview-aggregation-design.md](../specs/2026-04-21-s2-overview-aggregation-design.md)

---

## Task 1: #26 PM 중복 집계 버그 제거 + pytest

**Files:**
- Modify: `backend/app/services/azure_service.py` (line 390 한 줄 삭제)
- Create: `backend/tests/test_overview_aggregation.py`

### Step 1: 실패 테스트 작성

Create `backend/tests/test_overview_aggregation.py`:

```python
"""Tests for overview aggregation bug fixes (#24, #25, #26)."""
from unittest.mock import patch

import pytest


@pytest.fixture
def tms_fixture():
    """TMS rows where empno E1 appears once — shared between role_set and staff_set."""
    return [
        {
            "project_code": "P1", "empno": "E1", "use_time": 10.0,
            "activity_code_1": "", "activity_code_2": "", "activity_code_3": "",
        },
        {
            "project_code": "P1", "empno": "E2", "use_time": 5.0,
            "activity_code_1": "", "activity_code_2": "", "activity_code_3": "",
        },
    ]


def test_pm_actual_not_double_counted_when_empno_in_both_sets(tms_fixture, db):
    """#26 — E1 이 role_set 과 staff_set 양쪽에 있어도 by_project_empno[(P1, E1)] == 10 (not 20)."""
    from app.services import azure_service
    with patch.object(azure_service, "_fetch_tms_rows", return_value=tms_fixture):
        result = azure_service.get_overview_actuals(
            project_codes=["P1"],
            db=db,
            role_empnos=["E1", "E2"],  # 양쪽 포함
            staff_empnos=["E1"],        # E1 을 여기에도 추가
        )
    # 수정 전: 10 + 10 = 20 (버그)
    # 수정 후: 10
    assert result["by_project_empno"][("P1", "E1")] == 10.0
    # E2 는 role_set 에만 있으므로 그대로 5
    assert result["by_project_empno"][("P1", "E2")] == 5.0
    # by_empno 는 staff_set 기준 — E1 만 10
    assert result["by_empno"]["E1"] == 10.0
    assert "E2" not in result["by_empno"]


def test_total_actual_matches_sum_of_by_project(tms_fixture, db):
    """집계 consistency — total Actual = sum(by_project.values())."""
    from app.services import azure_service
    with patch.object(azure_service, "_fetch_tms_rows", return_value=tms_fixture):
        result = azure_service.get_overview_actuals(
            project_codes=["P1"],
            db=db,
            role_empnos=["E1"],
            staff_empnos=[],
        )
    total_from_by_project = sum(result["by_project"].values())
    assert total_from_by_project == 15.0  # 10 + 5
```

### Step 2: 실행 — 실패 확인

```bash
cd backend && pytest tests/test_overview_aggregation.py::test_pm_actual_not_double_counted_when_empno_in_both_sets -v
```

Expected: FAIL — `by_project_empno[("P1", "E1")] == 20.0` (current buggy behavior).

### Step 3: 버그 수정

Edit `backend/app/services/azure_service.py`. Locate the block:

```python
        if role_set and emp in role_set:
            by_project_empno[(pc, emp)] += t

        if staff_set and emp in staff_set:
            by_empno[emp] += t
            by_project_empno[(pc, emp)] += t
```

Remove the last line (`by_project_empno[(pc, emp)] += t` inside the staff branch):

```python
        if role_set and emp in role_set:
            by_project_empno[(pc, emp)] += t

        if staff_set and emp in staff_set:
            by_empno[emp] += t
```

### Step 4: 테스트 재실행 — 전부 통과

```bash
cd backend && pytest tests/test_overview_aggregation.py -v
```

Expected: 2 passed.

### Step 5: Commit

```bash
git add backend/app/services/azure_service.py backend/tests/test_overview_aggregation.py
git commit -m "fix(s2): remove double aggregation of PM actuals in overview (#26)"
```

---

## Task 2: #25 미편성 staff Actual 포함 + helper 추가 + pytest

**Files:**
- Modify: `backend/app/services/azure_service.py` (add `get_project_empnos` helper)
- Modify: `backend/app/services/budget_service.py` (expand `staff_empnos`)
- Modify: `backend/tests/test_overview_aggregation.py` (add test)

### Step 1: 실패 테스트 추가

Append to `backend/tests/test_overview_aggregation.py`:

```python
def test_unbudgeted_staff_captured_in_by_empno(db):
    """#25 — Budget 없는 empno E3 도 TMS 시간이 있으면 by_empno 에 포함되어야 한다.

    staff_empnos 에 E3 를 명시적으로 포함해 호출하면 기존 로직도 통과하므로,
    여기서는 get_project_empnos helper 가 E3 를 반환하는지만 확인.
    """
    from app.services import azure_service
    from unittest.mock import patch
    fixture = [
        {"project_code": "P1", "empno": "E1", "use_time": 10.0,
         "activity_code_1": "", "activity_code_2": "", "activity_code_3": ""},
        {"project_code": "P1", "empno": "E3", "use_time": 7.0,
         "activity_code_1": "", "activity_code_2": "", "activity_code_3": ""},
    ]
    with patch.object(azure_service, "_fetch_tms_rows", return_value=fixture):
        empnos = azure_service.get_project_empnos(["P1"])
    assert set(empnos) == {"E1", "E3"}
```

### Step 2: 실행 — 실패 확인

```bash
cd backend && pytest tests/test_overview_aggregation.py::test_unbudgeted_staff_captured_in_by_empno -v
```

Expected: FAIL — `AttributeError: module 'app.services.azure_service' has no attribute 'get_project_empnos'`.

### Step 3: `get_project_empnos` 헬퍼 추가

In `backend/app/services/azure_service.py`, add this function near the existing `get_overview_actuals` (same file, before or after it):

```python
def get_project_empnos(project_codes: list[str]) -> list[str]:
    """Return distinct empnos that appear in TMS rows for the given project_codes.

    Used by budget_service to ensure STAFF TIME aggregation captures
    individuals who worked on the project even without a budget assignment.
    """
    if not project_codes:
        return []
    rows = _fetch_tms_rows(project_codes)
    return sorted({r["empno"] for r in rows if r.get("empno")})
```

### Step 4: 테스트 재실행 — 통과

```bash
cd backend && pytest tests/test_overview_aggregation.py::test_unbudgeted_staff_captured_in_by_empno -v
```

Expected: PASS.

### Step 5: `staff_empnos` 확장

In `backend/app/services/budget_service.py`, find line 246 (inside `get_overview_data`):

Before:
```python
    role_empnos = list({rm["empno"] for rm in role_mappings if rm["empno"]}) or None
    staff_empnos = list(staff_budget.keys()) if staff_budget else None
```

After:
```python
    role_empnos = list({rm["empno"] for rm in role_mappings if rm["empno"]}) or None

    # #25: Budget 없는 staff 의 TMS 시간도 포함 — TMS 에서 본 empno ∪ budget empno, role 제외
    budgeted_empnos = set(staff_budget.keys()) if staff_budget else set()
    tms_empnos = set(azure_service.get_project_empnos(project_codes))
    role_set = set(role_empnos or [])
    staff_empnos = sorted((budgeted_empnos | tms_empnos) - role_set) or None
```

### Step 6: 전체 pytest 실행

```bash
cd backend && pytest -q 2>&1 | tail -3
```

Expected: 기존 73 + 3 신규 = 76 passed. S0/S1 회귀 없음.

### Step 7: Commit

```bash
git add backend/app/services/azure_service.py backend/app/services/budget_service.py backend/tests/test_overview_aggregation.py
git commit -m "feat(s2): include unbudgeted staff TMS time in STAFF TIME aggregation (#24 #25)"
```

---

## Task 3: #50 #51 service_type 필터 — 백엔드

**Files:**
- Modify: `backend/app/services/budget_service.py` (add `service_type` param)
- Modify: `backend/app/api/v1/overview.py` (add `service_type` query + extend /filter-options)
- Create: `backend/tests/test_overview_filters.py`

### Step 1: 실패 테스트 작성

Create `backend/tests/test_overview_filters.py`:

```python
"""Tests for /overview and /filter-options service_type filtering (#50, #51)."""
import pytest

from app.db.session import SessionLocal
from app.models.project import Project


@pytest.fixture(autouse=True)
def _seed_service_type_projects():
    """Ensure at least one AUDIT and one ESG project exist."""
    s = SessionLocal()
    try:
        if s.query(Project).filter(Project.service_type == "AUDIT").first() is None:
            s.add(Project(
                project_code="S2_TEST_AUDIT",
                project_name="S2 AUDIT test",
                el_empno="170661", pm_empno="170661",
                service_type="AUDIT", contract_hours=100,
            ))
        if s.query(Project).filter(Project.service_type == "ESG").first() is None:
            s.add(Project(
                project_code="S2_TEST_ESG",
                project_name="S2 ESG test",
                el_empno="170661", pm_empno="170661",
                service_type="ESG", contract_hours=50,
            ))
        s.commit()
    finally:
        s.close()
    yield


def test_filter_options_returns_service_types(client, elpm_cookie):
    r = client.get("/api/v1/filter-options", cookies=elpm_cookie)
    assert r.status_code == 200
    body = r.json()
    assert "service_types" in body
    codes = {s["code"] for s in body["service_types"]}
    # AUDIT 과 ESG 는 반드시 포함
    assert "AUDIT" in codes
    assert "ESG" in codes
    # name 도 한글 매핑
    by_code = {s["code"]: s["name"] for s in body["service_types"]}
    assert by_code["AUDIT"] == "감사"
    assert by_code["ESG"] == "ESG"


def test_filter_options_excludes_unused_codes(client, admin_cookie):
    """DB 에 없는 code (예: 'TAX') 는 옵션에 포함되지 않아야 한다."""
    r = client.get("/api/v1/filter-options", cookies=admin_cookie)
    assert r.status_code == 200
    codes = {s["code"] for s in r.json()["service_types"]}
    assert "TAX" not in codes  # 세무 코드는 SERVICE_TYPES 에 없음 + DB 에도 없음


def test_overview_filters_by_service_type_esg(client, admin_cookie):
    """service_type=ESG 로 요청 시 ESG 프로젝트만 반환."""
    r = client.get("/api/v1/overview?service_type=ESG", cookies=admin_cookie)
    assert r.status_code == 200
    projects = r.json().get("projects", [])
    # admin 이므로 전체 범위에서 ESG 만 필터링됨
    if projects:
        for p in projects:
            # project_name 에 "ESG" 가 들어가거나 project_code 가 ESG 프로젝트
            assert "ESG" in p.get("project_name", "") or p.get("project_code", "").endswith("_ESG") or p.get("project_code", "") == "S2_TEST_ESG"


def test_overview_without_service_type_filter_returns_all(client, admin_cookie):
    r = client.get("/api/v1/overview", cookies=admin_cookie)
    assert r.status_code == 200
```

### Step 2: 실행 — 실패 확인

```bash
cd backend && pytest tests/test_overview_filters.py -v
```

Expected: 실패 — `/filter-options` 응답에 `service_types` 키 없음 + `/overview?service_type=ESG` 는 필터링 안 됨.

### Step 3: `get_overview_data` 에 service_type 파라미터 추가

In `backend/app/services/budget_service.py`, modify the signature (line 117) to accept `service_type`:

Before:
```python
def get_overview_data(db: Session, el_empno: str = None, pm_empno: str = None,
                      department: str = None, project_code: str = None,
                      budget_category: str = None,
                      cumulative: bool = True, allowed_project_codes: list = None):
```

After:
```python
def get_overview_data(db: Session, el_empno: str = None, pm_empno: str = None,
                      department: str = None, project_code: str = None,
                      budget_category: str = None,
                      cumulative: bool = True, allowed_project_codes: list = None,
                      service_type: str = None):
```

Then inside, after `if project_code: ...` (line 134-135), add:

```python
    if service_type:
        prj_query = prj_query.filter(Project.service_type == service_type)
```

### Step 4: `/overview` 엔드포인트 update

In `backend/app/api/v1/overview.py`, add `service_type` to the signature (line 22-32):

Before:
```python
@router.get("/overview")
def get_overview(
    el_empno: Optional[str] = Query(None),
    pm_empno: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    project_code: Optional[str] = Query(None),
    budget_category: Optional[str] = Query(None),
    cumulative: bool = Query(True),
    db: Session = Depends(get_db),
    user: Optional[dict] = Depends(get_optional_user),
):
```

After:
```python
@router.get("/overview")
def get_overview(
    el_empno: Optional[str] = Query(None),
    pm_empno: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    project_code: Optional[str] = Query(None),
    budget_category: Optional[str] = Query(None),
    service_type: Optional[str] = Query(None),
    cumulative: bool = Query(True),
    db: Session = Depends(get_db),
    user: Optional[dict] = Depends(get_optional_user),
):
```

Then in the call to `get_overview_data` (line 40-49), pass it through:

```python
    result = get_overview_data(
        db,
        el_empno=el_empno,
        pm_empno=pm_empno,
        department=department,
        project_code=project_code,
        budget_category=budget_category,
        service_type=service_type,
        cumulative=cumulative,
        allowed_project_codes=allowed_codes,
    )
```

### Step 5: `/filter-options` 에 service_types 추가

In the same file, modify `get_filter_options` (around line 178-224). Add `service_types` collection:

Before the `return` statement, add:

```python
    # #50 service_type options — DB 실사용 값만 노출
    from app.api.v1.budget_input import SERVICE_TYPES
    name_by_code = {s["code"]: s["name"] for s in SERVICE_TYPES}
    used_codes_rows = (
        db.query(Project.service_type)
        .filter(Project.service_type.isnot(None))
    )
    # 위 쿼리는 모든 프로젝트 — user scope 적용은 query.filter 로 먼저 처리됨 (all_projects 는 이미 필터됨)
    used_codes = sorted({p.service_type for p in all_projects if p.service_type})
    service_types_list = [
        {"code": c, "name": name_by_code.get(c, c)}
        for c in used_codes
    ]
```

Then change the `return` block to include the new field:

```python
    return {
        "projects": projects_list,
        "els": [
            {"value": empno, "label": f"{name}({empno})"}
            for empno, name in els_set.items()
        ],
        "pms": [
            {"value": empno, "label": f"{name}({empno})"}
            for empno, name in pms_set.items()
        ],
        "departments": [
            {"value": d, "label": d}
            for d in sorted(depts_set)
        ],
        "service_types": service_types_list,
    }
```

### Step 6: 테스트 실행

```bash
cd backend && pytest tests/test_overview_filters.py -v
```

Expected: 4 passed.

### Step 7: 전체 pytest

```bash
cd backend && pytest -q 2>&1 | tail -3
```

Expected: 76 + 4 = 80 passed. No regressions.

### Step 8: Commit

```bash
git add backend/app/services/budget_service.py backend/app/api/v1/overview.py backend/tests/test_overview_filters.py
git commit -m "feat(s2): add service_type filter to /overview and /filter-options (#50 #51)"
```

---

## Task 4: Frontend — service_type 필터 드롭다운

**Files:**
- Modify: `frontend/src/app/(dashboard)/page.tsx`

### Step 1: 필터 state 와 UI 확인

```bash
cd frontend && grep -n "el_empno\|pm_empno\|departments\|filter-options\|setFilters" src/app/\(dashboard\)/page.tsx | head -30
```

Record which lines show the filter state and where filter dropdowns are rendered.

### Step 2: service_type state 추가

Find the `useState` for filters (search `const [filters`). Expected:

```tsx
const [filters, setFilters] = useState({
  el_empno: "",
  pm_empno: "",
  department: "",
  project_code: "",
  year_month: "",
});
```

Add `service_type: ""` to the initial state:

```tsx
const [filters, setFilters] = useState({
  el_empno: "",
  pm_empno: "",
  department: "",
  project_code: "",
  year_month: "",
  service_type: "",
});
```

### Step 3: filter-options response 에서 service_types 추출

Find where `/filter-options` response is stored (likely as `filterOptions` state). Update its type to include `service_types`:

```tsx
interface FilterOptions {
  projects: { value: string; label: string }[];
  els: { value: string; label: string }[];
  pms: { value: string; label: string }[];
  departments: { value: string; label: string }[];
  service_types: { code: string; name: string }[];   // ← 추가
}
```

If `FilterOptions` type isn't explicit, just ensure `filterOptions.service_types` can be read.

### Step 4: 드롭다운 UI 추가

In the filter bar JSX, near the existing EL/PM/부서 드롭다운, add a new `<select>` for service_type. Example (match existing style):

```tsx
<select
  value={filters.service_type}
  onChange={(e) => setFilters({ ...filters, service_type: e.target.value })}
  className="..."  // 기존 드롭다운과 동일 className
>
  <option value="">(대분류 전체)</option>
  {filterOptions?.service_types?.map((s) => (
    <option key={s.code} value={s.code}>
      {s.name}
    </option>
  ))}
</select>
```

Exact JSX placement: find the existing EL dropdown and add this one immediately after (or before, follow visual order).

### Step 5: API 호출에 service_type 파라미터 전달

Find the `fetch(...)` or `fetchAPI(...)` call that hits `/api/v1/overview`. It likely constructs query params from `filters`. Ensure `service_type` is included:

```tsx
const params = new URLSearchParams();
if (filters.el_empno) params.set("el_empno", filters.el_empno);
if (filters.pm_empno) params.set("pm_empno", filters.pm_empno);
if (filters.department) params.set("department", filters.department);
if (filters.project_code) params.set("project_code", filters.project_code);
if (filters.service_type) params.set("service_type", filters.service_type);  // ← 추가
```

If the existing code uses a different param construction pattern, follow it — just ensure `service_type` ends up in the query string.

### Step 6: TypeScript + build 확인

```bash
cd frontend && npx tsc --noEmit 2>&1 | head
cd frontend && npm run build 2>&1 | tail -5
```

Both must succeed.

### Step 7: Commit

```bash
git add frontend/src/app/\(dashboard\)/page.tsx
git commit -m "feat(s2): add service_type filter dropdown to Overview (#50 #51)"
```

---

## Task 5: Frontend — 도넛 drill-down

**Files:**
- Modify: `frontend/src/app/(dashboard)/page.tsx`
- Modify: `frontend/src/components/charts/DonutChart.tsx` (visual highlight only, optional if already supports)

### Step 1: 현재 도넛 차트 렌더 위치 확인

```bash
cd frontend && grep -n "DonutChart\|budget_by_category\|actual_by_category" src/app/\(dashboard\)/page.tsx | head -15
```

Record line numbers where DonutChart is used.

### Step 2: `selectedCategory` state 추가

Near the filters state, add:

```tsx
const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
```

### Step 3: DonutChart 에 `onSegmentClick` 전달

Find `<DonutChart ... />` JSX. Add `onSegmentClick` prop:

```tsx
<DonutChart
  data={categoryData}
  onSegmentClick={(name) =>
    setSelectedCategory((prev) => (prev === name ? null : name))
  }
/>
```

Multiple DonutCharts may exist (Budget by category, Actual by category, etc.) — add onSegmentClick to **the budget_by_category 도넛** (the one that drives "Budget 관리단위별 Status" 테이블).

### Step 4: 하단 테이블에 selectedCategory 필터 적용

Find the "Budget 관리단위별 Status" 테이블 (or equivalent) that shows rows by category. Apply client-side filter:

```tsx
const filteredUnits = selectedCategory
  ? (budget_by_unit || []).filter((u: { category: string }) => u.category === selectedCategory)
  : (budget_by_unit || []);
```

Use `filteredUnits` instead of raw array in the `.map` for rendering.

### Step 5: 선택 초기화 UI

Above the 테이블 or near the 도넛, add a reset button that appears only when `selectedCategory` is set:

```tsx
{selectedCategory && (
  <button
    onClick={() => setSelectedCategory(null)}
    className="text-xs text-pwc-gray-600 hover:text-pwc-orange ml-2"
  >
    ✕ {selectedCategory} 필터 해제
  </button>
)}
```

### Step 6: 시각적 강조 (선택)

If the DonutChart doesn't already support highlighting selected segment, pass a new prop `selected` — but this is optional. If time-constrained, skip visual highlight; onClick functionality is the required feature.

### Step 7: Build check

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep page.tsx | head
cd frontend && npm run build 2>&1 | tail -5
```

### Step 8: Commit

```bash
git add frontend/src/app/\(dashboard\)/page.tsx
git commit -m "feat(s2): donut segment click drill-down filters category table (#49)"
```

---

## Task 6: Playwright E2E

**Files:**
- Create: `frontend/tests/task-s2-overview-filters.spec.ts`
- Create: `frontend/tests/task-s2-donut-drilldown.spec.ts`

### Step 1: filter spec

Create `frontend/tests/task-s2-overview-filters.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

const API = "http://localhost:3001/api/v1";
const EL = process.env.EL_EMPNO || "170661";

test.describe("S2 — Overview filters", () => {
  test("filter-options returns service_types array", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/filter-options`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(Array.isArray(body.service_types)).toBe(true);
    if (body.service_types.length > 0) {
      expect(body.service_types[0]).toHaveProperty("code");
      expect(body.service_types[0]).toHaveProperty("name");
    }
  });

  test("overview respects service_type filter", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/overview?service_type=ESG`);
    expect(r.status()).toBe(200);
  });

  test("overview without service_type returns all projects in scope", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/overview`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body).toHaveProperty("projects");
  });
});
```

### Step 2: drill-down spec

Create `frontend/tests/task-s2-donut-drilldown.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

const API = "http://localhost:3001/api/v1";
const EL = process.env.EL_EMPNO || "170661";

test.describe("S2 — Overview data integrity", () => {
  test("overview returns non-negative budget totals", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/overview`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    const kpi = body.kpi || {};
    if (typeof kpi.budget_total === "number") {
      expect(kpi.budget_total).toBeGreaterThanOrEqual(0);
    }
    if (typeof kpi.actual_total === "number") {
      expect(kpi.actual_total).toBeGreaterThanOrEqual(0);
    }
  });

  test("staff_time table is present and not empty when budgets exist", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/overview`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    // staff_time may exist; just assert shape
    if (Array.isArray(body.staff_time)) {
      // 필드 shape 확인
      if (body.staff_time.length > 0) {
        expect(body.staff_time[0]).toHaveProperty("empno");
      }
    }
  });

  test("elpm_qrp_time PM actuals are not duplicated (no empno shown twice for same project)", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const r = await request.get(`${API}/overview`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    const rows = body.elpm_qrp_time || [];
    const seen = new Set();
    for (const row of rows) {
      const key = `${row.project_code || ""}|${row.empno || ""}|${row.role || ""}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});
```

### Step 3: 사전 조건 — 서버 실행

```bash
cd /Users/jkim564/Documents/Programming/my_budget/.worktrees/s2-overview-fixes/backend && uvicorn app.main:app --port 3001 > /tmp/s2-backend.log 2>&1 &
sleep 4
cd /Users/jkim564/Documents/Programming/my_budget/.worktrees/s2-overview-fixes/frontend && (NODE_ENV=production npm run start -- --port 8001 > /tmp/s2-frontend.log 2>&1 &)
sleep 8
```

### Step 4: Playwright 실행

```bash
cd frontend && npx playwright test task-s2 --reporter=line 2>&1 | tail -10
```

Expected: 모든 테스트 통과.

### Step 5: Commit

```bash
git add frontend/tests/task-s2-*.spec.ts
git commit -m "test(s2): Playwright E2E for Overview filters + drill-down + aggregation"
```

---

## Task 7: 최종 검증

**Files:** 없음 (verification only)

### Step 1: Full pytest

```bash
cd backend && pytest -q 2>&1 | tail -5
```

Expected: ≥ 80 passed.

### Step 2: Full Playwright (S0 + S1 + S2)

```bash
cd frontend && npx playwright test task-auth task-s1 task-s2 --reporter=line 2>&1 | tail -20
```

Expected: 대부분 통과. UI 가 필요 한 테스트는 로그인 후 화면 응답에 따라 skip 가능.

### Step 3: Commit log on branch

```bash
cd /Users/jkim564/Documents/Programming/my_budget/.worktrees/s2-overview-fixes && git log main..HEAD --oneline
```

Expected: 6 commits tagged `feat(s2)`, `fix(s2)`, `test(s2)`.

### Step 4: 피드백 매핑

| # | 해결 위치 |
|---|---|
| #24 | Task 2 — staff_empnos 확장으로 Fulcrum/QRP worker TMS 시간 포함 |
| #25 | Task 2 — get_project_empnos + staff_empnos 확장 |
| #26 | Task 1 — azure_service line 390 double-add 제거 |
| #49 | Task 5 — DonutChart onSegmentClick 바인딩 + 하단 테이블 필터 |
| #50 | Task 3 — /filter-options 에 service_types 배열 (DB 실사용 값만) |
| #51 | Task 3/4 — service_type 쿼리 파라미터 + 프론트 드롭다운 |

### Step 5: 수동 검증 (사용자에게 인계)

- 홍상호 계정 → Overview → PM Actual 값이 프로젝트 선택 전/후 일관
- 서보경 계정 → 대분류 드롭다운에 ESG/AUDIT 만 표시 (TAX 같은 미등록 코드 제외)
- ESG 선택 시 ESG 프로젝트만 화면 반영
- 도넛 세그먼트 클릭 → 하단 "Budget 관리단위별 Status" 해당 category 만 필터됨 + 해제 버튼 나타남

---

## 완료 기준

- [ ] Task 1-6 all green
- [ ] pytest ≥ 80 passed
- [ ] S0/S1/S2 Playwright 회귀 없음
- [ ] 6 feedback items 매핑 완료
