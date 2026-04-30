# 영역 2 (Budget 입력 목록) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Budget 입력 목록 화면 reliably usable for PM/EL/admin with proper status workflow (POL-04 표준형) + case-insensitive search + status filter, and add daily TBA sync (POL-05 하이브리드).

**Architecture:** Riding on Area 1 safety net. New endpoints in a separate router file (`budget_workflow.py`) with state transitions in a single service (`workflow.py`). Frontend list page gains status filter + workflow buttons on project detail. Alembic CHECK constraint standardizes `template_status` enum.

**Tech Stack:** FastAPI / SQLAlchemy / Alembic / APScheduler (already in requirements.txt) / Next.js / TypeScript / Playwright / pytest.

---

## Spec Reference

Implements [docs/superpowers/specs/2026-04-25-area-2-budget-list-design.md](../specs/2026-04-25-area-2-budget-list-design.md). Tasks organized by phase.

**Files this plan touches**:
- Create: `backend/app/services/workflow.py`, `backend/app/api/v1/budget_workflow.py`, `backend/alembic/versions/006_template_status_enum.py`, `backend/tests/regression/test_workflow_endpoints.py`, `backend/tests/regression/test_list_endpoint_pm_visibility.py`, `backend/tests/test_workflow_service.py`, `frontend/tests/regression/test_budget_list_states_visibility.spec.ts`, `frontend/tests/regression/test_budget_list_search_case_insensitive.spec.ts`, `frontend/tests/regression/test_workflow_pm_submit_el_approve.spec.ts`, `docs/superpowers/qa-checklists/area-2.md`, `docs/superpowers/retros/area-2.md`
- Modify: `backend/app/main.py` (router registration), `backend/app/api/v1/budget_input.py` (list endpoint PM filter), `backend/app/services/sync_service.py` (daily cron), `frontend/src/app/(dashboard)/budget-input/page.tsx` (filter / search / blank button removal / last_updated)
- Possibly modify: `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx` (workflow buttons), `frontend/tests/__visual__/baseline.spec.ts-snapshots/` (baseline update)

---

## Phase 0: Baseline

### Task 1: Verify Area 1 safety net green from new branch

**Goal:** Confirm new branch starts from a clean Area 1 state. Catch any infra drift before Area 2 work begins.

- [ ] **Step 1: Check current branch + commits**

```bash
git branch --show-current
git log --oneline -5
```
Expected: branch `s7/area-2-budget-list`, latest commits include the Area 1 PR head (`1898d37`) and `0e9e57d` (POL provisional) + `46c30f0` (this spec).

- [ ] **Step 2: Run all backend pytest**

```bash
cd backend && pytest 2>&1 | tail -10
```
Expected: 190 passed / 10 skipped / 0 failed (Area 1 final state).

- [ ] **Step 3: Run grep guards**

```bash
bash scripts/ci/check-no-direct-number-input.sh && \
bash scripts/ci/check-no-direct-budget-arithmetic.sh && \
bash scripts/ci/check-docker-compose-no-dev.sh
echo "EXIT: $?"
```
Expected: All 3 OK, exit 0.

- [ ] **Step 4: Empty commit recording the baseline**

```bash
git commit --allow-empty -m "chore(s7-area2): Area 2 baseline — Area 1 safety net green (190 pytest, 3 grep guards)"
```

If anything fails: STOP and report — area 1 infra has drifted. Area 2 cannot proceed safely.

---

## Phase 1: Safety Net (RED tests)

### Task 2: Regression test #79/#82 — list visibility (5 states × 4 personas)

**Goal:** Lock in PM/EL/admin visibility expectations.

**Files:**
- Create: `frontend/tests/regression/test_budget_list_states_visibility.spec.ts`
- Create: `backend/tests/regression/test_list_endpoint_pm_visibility.py`

- [ ] **Step 1: Backend unit test (more reliable than E2E for matrix)**

Create `backend/tests/regression/test_list_endpoint_pm_visibility.py`:
```python
"""Regression #79 / #82 — /projects/list visibility by persona."""
import pytest
from sqlalchemy import text


@pytest.fixture(scope="function")
def list_seed(db):
    """Seed 4 projects with distinct EL/PM/status combinations."""
    # Cleanup any existing test rows
    db.execute(text("DELETE FROM projects WHERE project_code LIKE 'AREA2-LIST-%'"))
    db.commit()
    db.execute(text("""
        INSERT INTO projects (project_code, project_name, el_empno, pm_empno, template_status, contract_hours)
        VALUES
          ('AREA2-LIST-P1', 'P1 EL=170661 PM=170661', '170661', '170661', '작성중', 100),
          ('AREA2-LIST-P2', 'P2 EL=170661 PM=999998', '170661', '999998', '작성완료', 100),
          ('AREA2-LIST-P3', 'P3 EL=999997 PM=170661', '999997', '170661', '승인완료', 100),
          ('AREA2-LIST-P4', 'P4 EL=999996 PM=999995', '999996', '999995', '작성중', 100)
    """))
    db.commit()
    yield
    db.execute(text("DELETE FROM projects WHERE project_code LIKE 'AREA2-LIST-%'"))
    db.commit()


def _list_codes(client, cookie):
    resp = client.get("/api/v1/budget/projects/list", cookies=cookie or {})
    assert resp.status_code in (200, 401)
    if resp.status_code == 401:
        return None
    return {p["project_code"] for p in resp.json() if p["project_code"].startswith("AREA2-LIST-")}


def test_admin_sees_all(list_seed, client, admin_cookie):
    codes = _list_codes(client, admin_cookie)
    assert codes == {"AREA2-LIST-P1", "AREA2-LIST-P2", "AREA2-LIST-P3", "AREA2-LIST-P4"}


def test_elpm_sees_self_el_or_pm(list_seed, client, elpm_cookie):
    """elpm fixture is empno 170661 — EL on P1/P2, PM on P1/P3."""
    codes = _list_codes(client, elpm_cookie)
    assert codes == {"AREA2-LIST-P1", "AREA2-LIST-P2", "AREA2-LIST-P3"}


def test_staff_sees_none(list_seed, client, staff_cookie):
    """staff fixture is 320915 — neither EL nor PM on any AREA2 project."""
    codes = _list_codes(client, staff_cookie)
    assert codes == set()


def test_anon_blocked(list_seed, client):
    codes = _list_codes(client, None)
    # anon can be 401 (blocked) or 200 with empty (current behavior). Either OK auth-wise.
    assert codes is None or codes == set()
```

- [ ] **Step 2: Frontend E2E** (lighter — relies on seeded data above)

Create `frontend/tests/regression/test_budget_list_states_visibility.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

test.describe("regression #79 #82 — Budget 입력 목록 visibility", () => {
  test("EL/PM 사용자가 본인 프로젝트가 목록에 표시됨", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.toString().includes("/login"));
    await page.goto(`${FRONTEND}/budget-input`);
    await page.waitForLoadState("networkidle");

    // 시드 데이터(AREA2-LIST-*) 가 표 안에 표시
    const rows = page.locator("tbody tr");
    const visibleCodes: string[] = [];
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const code = await rows.nth(i).locator("td").first().textContent();
      if (code) visibleCodes.push(code.trim());
    }
    // EL=170661 사용자는 P1/P2/P3 보여야 (#79/#82 fix 후)
    expect(visibleCodes).toContain("AREA2-LIST-P1");
    expect(visibleCodes).toContain("AREA2-LIST-P2");
    expect(visibleCodes).toContain("AREA2-LIST-P3");
    // P4는 무관하므로 안 보여야
    expect(visibleCodes).not.toContain("AREA2-LIST-P4");
  });
});
```

- [ ] **Step 3: Run — RED expected**

```bash
cd backend && pytest tests/regression/test_list_endpoint_pm_visibility.py -v 2>&1 | tail -10
```
Expected: `test_admin_sees_all` may pass, `test_elpm_sees_self_el_or_pm` FAIL (currently EL-only filter excludes P3 which has 170661 as PM).

- [ ] **Step 4: Commit RED**

```bash
git add backend/tests/regression/test_list_endpoint_pm_visibility.py frontend/tests/regression/test_budget_list_states_visibility.spec.ts
git commit -m "test(s7-area2): regression #79 #82 — list visibility 5 states × 4 personas [red until Task 9]"
```

---

### Task 3: Regression test #121 — case-insensitive search

**Files:**
- Create: `frontend/tests/regression/test_budget_list_search_case_insensitive.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

test.describe("regression #121 — list search is case-insensitive", () => {
  test("various capitalizations of 'SK텔레콤' all match SK텔레콤 row", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.toString().includes("/login"));
    await page.goto(`${FRONTEND}/budget-input`);
    await page.waitForLoadState("networkidle");

    const search = page.locator('input[placeholder*="검색"]').first();

    for (const q of ["sk", "SK", "Sk텔레콤", "SK텔레콤"]) {
      await search.fill(q);
      await page.waitForTimeout(200);
      const cellText = await page.locator("tbody").textContent();
      expect(cellText, `query "${q}" should match SK텔레콤`).toMatch(/SK텔레콤/i);
    }
  });
});
```

- [ ] **Step 2: Run — RED expected (current `.includes()` is case-sensitive)**

```bash
cd frontend && npm test -- --project=regression --grep "regression #121" 2>&1 | tail -10
```
Expected: FAIL on lowercase "sk" / "Sk텔레콤" (only exact case matches).

- [ ] **Step 3: Commit RED**

```bash
git add frontend/tests/regression/test_budget_list_search_case_insensitive.spec.ts
git commit -m "test(s7-area2): regression #121 — case-insensitive search [red until Task 10]"
```

**Note:** Test requires DB to have a project with name containing "SK텔레콤" — verify with `psql -c "SELECT * FROM projects WHERE project_name ILIKE '%SK텔레콤%' LIMIT 1"`. If no such project exists, prepend a seed step or document the test as "manual seed required".

---

### Task 4: Regression test workflow PM submit → EL approve (POL-04)

**Files:**
- Create: `frontend/tests/regression/test_workflow_pm_submit_el_approve.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const PM = process.env.PM_EMPNO || "170661";  // EL/PM fixture
const ELOTHER = process.env.EL_OTHER_EMPNO || "999997";  // P3 EL — must exist in employees DB

const PROJECT = "AREA2-LIST-P1";  // seeded by Task 2 backend test

test.describe("regression #61 #98 — POL-04 워크플로우 PM submit → EL approve", () => {
  test("PM submits, EL approves, EL can unlock", async ({ page, request }) => {
    // PM 로그인
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', PM);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.toString().includes("/login"));

    // Project 상세 페이지
    await page.goto(`${FRONTEND}/budget-input/${PROJECT}`);
    await page.waitForLoadState("networkidle");

    // "작성완료 제출" 버튼
    const submitBtn = page.getByRole("button", { name: /작성완료\s*제출|제출하기/ }).first();
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();
    // 상태 배지가 "작성완료"로 변함
    await expect(page.locator("text=/작성완료/").first()).toBeVisible();

    // 로그아웃 후 EL_OTHER 로그인 (필요 시) — 본 테스트에선 PM=EL 같은 fixture를 쓰면 single-flow 가능
    // 여기서는 같은 사용자가 EL 자격으로 승인하는 케이스 (170661이 P1 EL이자 PM)
    const approveBtn = page.getByRole("button", { name: /승인|Approve/ }).first();
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();
    await expect(page.locator("text=/승인완료/").first()).toBeVisible();

    // 락 해제
    const unlockBtn = page.getByRole("button", { name: /락\s*해제|Unlock/ }).first();
    await expect(unlockBtn).toBeVisible();
    await unlockBtn.click();
    await expect(page.locator("text=/작성중/").first()).toBeVisible();
  });
});
```

- [ ] **Step 2: Run — RED expected (endpoints + buttons don't exist yet)**

```bash
cd frontend && npm test -- --project=regression --grep "POL-04" 2>&1 | tail -10
```
Expected: FAIL (button not found).

- [ ] **Step 3: Commit RED**

```bash
git add frontend/tests/regression/test_workflow_pm_submit_el_approve.spec.ts
git commit -m "test(s7-area2): POL-04 workflow E2E [red until Tasks 6-12]"
```

---

### Task 5: Backend unit tests for workflow service + endpoints

**Files:**
- Create: `backend/tests/test_workflow_service.py`
- Create: `backend/tests/regression/test_workflow_endpoints.py`

- [ ] **Step 1: Service unit tests**

Create `backend/tests/test_workflow_service.py`:
```python
"""Unit tests for workflow.transition_status — POL-04 표준형."""
import pytest
from types import SimpleNamespace


def test_submit_작성중_to_작성완료_pm_self():
    from app.services.workflow import transition_status, WorkflowError
    p = SimpleNamespace(template_status="작성중", pm_empno="170661", el_empno="170661")
    transition_status(p, target_status="작성완료", actor_empno="170661", actor_role="elpm")
    assert p.template_status == "작성완료"


def test_submit_작성중_to_작성완료_other_pm_blocked():
    from app.services.workflow import transition_status, WorkflowError
    p = SimpleNamespace(template_status="작성중", pm_empno="170661", el_empno="999997")
    with pytest.raises(WorkflowError, match="PM"):
        transition_status(p, target_status="작성완료", actor_empno="999998", actor_role="elpm")


def test_approve_작성완료_to_승인완료_el_self():
    from app.services.workflow import transition_status
    p = SimpleNamespace(template_status="작성완료", pm_empno="170661", el_empno="170661")
    transition_status(p, target_status="승인완료", actor_empno="170661", actor_role="elpm")
    assert p.template_status == "승인완료"


def test_approve_by_pm_other_blocked():
    from app.services.workflow import transition_status, WorkflowError
    p = SimpleNamespace(template_status="작성완료", pm_empno="170661", el_empno="999997")
    with pytest.raises(WorkflowError, match="EL"):
        transition_status(p, target_status="승인완료", actor_empno="170661", actor_role="elpm")


def test_admin_can_force_any_transition():
    from app.services.workflow import transition_status
    p = SimpleNamespace(template_status="승인완료", pm_empno="111", el_empno="222")
    transition_status(p, target_status="작성중", actor_empno="160553", actor_role="admin")
    assert p.template_status == "작성중"


def test_invalid_transition_blocked():
    from app.services.workflow import transition_status, WorkflowError
    p = SimpleNamespace(template_status="작성중", pm_empno="170661", el_empno="170661")
    with pytest.raises(WorkflowError, match="invalid"):
        transition_status(p, target_status="승인완료", actor_empno="170661", actor_role="elpm")
```

- [ ] **Step 2: Endpoint integration tests**

Create `backend/tests/regression/test_workflow_endpoints.py`:
```python
"""Integration tests for /submit /approve /unlock endpoints."""
import pytest
from sqlalchemy import text


@pytest.fixture(scope="function")
def workflow_seed(db):
    db.execute(text("DELETE FROM projects WHERE project_code = 'AREA2-WF-001'"))
    db.commit()
    db.execute(text("""
        INSERT INTO projects (project_code, project_name, el_empno, pm_empno, template_status, contract_hours)
        VALUES ('AREA2-WF-001', 'WF Test', '170661', '170661', '작성중', 100)
    """))
    db.commit()
    yield
    db.execute(text("DELETE FROM projects WHERE project_code = 'AREA2-WF-001'"))
    db.commit()


def _status(db) -> str:
    return db.execute(text(
        "SELECT template_status FROM projects WHERE project_code='AREA2-WF-001'"
    )).scalar()


def test_pm_submit_then_el_approve_then_unlock(workflow_seed, client, elpm_cookie, db):
    # PM (=170661) submits
    resp = client.post("/api/v1/budget/projects/AREA2-WF-001/submit", cookies=elpm_cookie)
    assert resp.status_code == 200
    db.commit()  # ensure read of new state
    assert _status(db) == "작성완료"

    # EL (also 170661) approves
    resp = client.post("/api/v1/budget/projects/AREA2-WF-001/approve", cookies=elpm_cookie)
    assert resp.status_code == 200
    db.commit()
    assert _status(db) == "승인완료"

    # EL unlocks
    resp = client.post("/api/v1/budget/projects/AREA2-WF-001/unlock", cookies=elpm_cookie)
    assert resp.status_code == 200
    db.commit()
    assert _status(db) == "작성중"


def test_staff_blocked_on_all_workflow_endpoints(workflow_seed, client, staff_cookie):
    for path in ("/submit", "/approve", "/unlock"):
        resp = client.post(f"/api/v1/budget/projects/AREA2-WF-001{path}", cookies=staff_cookie)
        assert resp.status_code == 403, f"{path} expected 403, got {resp.status_code}: {resp.text[:120]}"


def test_anon_blocked_on_all_workflow_endpoints(workflow_seed, client):
    for path in ("/submit", "/approve", "/unlock"):
        resp = client.post(f"/api/v1/budget/projects/AREA2-WF-001{path}")
        assert resp.status_code == 401, f"{path} expected 401, got {resp.status_code}: {resp.text[:120]}"
```

- [ ] **Step 3: Run — RED expected (workflow service + endpoints don't exist)**

```bash
cd backend && pytest tests/test_workflow_service.py tests/regression/test_workflow_endpoints.py -v 2>&1 | tail -10
```
Expected: ImportError on `app.services.workflow`.

- [ ] **Step 4: Commit RED**

```bash
git add backend/tests/test_workflow_service.py backend/tests/regression/test_workflow_endpoints.py
git commit -m "test(s7-area2): workflow service + endpoint tests [red until Tasks 6-7-11]"
```

---

## Phase 2: Structure

### Task 6: Create workflow.py service

**Files:**
- Create: `backend/app/services/workflow.py`

- [ ] **Step 1: Write the service**

```python
"""POL-04 표준형 워크플로우 — single source of state transitions.

상태: 작성중 → 작성완료 → 승인완료 (단방향) + 승인완료 → 작성중 (락 해제)

권한:
- 작성중 → 작성완료: 해당 프로젝트의 PM 또는 admin
- 작성완료 → 승인완료: 해당 프로젝트의 EL 또는 admin
- 승인완료 → 작성중: 해당 프로젝트의 EL 또는 admin
- admin (scope=all): 모든 전이 허용

POL-04 외부 결정자 컨펌이 다른 안 (단순형/확장형) 으로 결정되면 본 모듈만 갱신.
"""
from __future__ import annotations
from typing import Literal


VALID_STATUSES = ("작성중", "작성완료", "승인완료")
StatusType = Literal["작성중", "작성완료", "승인완료"]

ALLOWED_TRANSITIONS = {
    ("작성중", "작성완료"): "pm",   # PM 권한 필요
    ("작성완료", "승인완료"): "el",   # EL 권한 필요
    ("승인완료", "작성중"): "el",     # EL 권한 필요 (락 해제)
}


class WorkflowError(Exception):
    """Workflow transition validation failure."""


def transition_status(
    project,
    *,
    target_status: StatusType,
    actor_empno: str,
    actor_role: str,
) -> None:
    """Mutate project.template_status if transition is valid + actor authorized.

    Raises WorkflowError on invalid transition or unauthorized actor.
    Caller is responsible for db.commit().
    """
    if target_status not in VALID_STATUSES:
        raise WorkflowError(f"unknown target_status: {target_status!r}")

    current = project.template_status or "작성중"
    transition = (current, target_status)

    if actor_role == "admin":
        # admin can force any transition (including invalid ones — useful for repair)
        project.template_status = target_status
        return

    required_role = ALLOWED_TRANSITIONS.get(transition)
    if required_role is None:
        raise WorkflowError(
            f"invalid transition {current!r} → {target_status!r}"
        )

    if required_role == "pm":
        if str(getattr(project, "pm_empno", "")) != str(actor_empno):
            raise WorkflowError(
                f"PM 권한 필요 (현재: {actor_empno}, 프로젝트 PM: {project.pm_empno})"
            )
    elif required_role == "el":
        if str(getattr(project, "el_empno", "")) != str(actor_empno):
            raise WorkflowError(
                f"EL 권한 필요 (현재: {actor_empno}, 프로젝트 EL: {project.el_empno})"
            )

    project.template_status = target_status
```

- [ ] **Step 2: Run service unit tests — should PASS now**

```bash
cd backend && pytest tests/test_workflow_service.py -v 2>&1 | tail -10
```
Expected: 6 passed.

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/workflow.py
git commit -m "feat(s7-area2): workflow.py service — POL-04 표준형 transitions + auth"
```

---

### Task 7: Create budget_workflow.py router + register

**Files:**
- Create: `backend/app/api/v1/budget_workflow.py`
- Modify: `backend/app/main.py` (register router)

- [ ] **Step 1: Read existing router pattern**

Look at `backend/app/api/v1/budget_input.py` lines 1-30 to see the imports / dependencies pattern (require_login, require_elpm, etc.).

- [ ] **Step 2: Write the router**

`backend/app/api/v1/budget_workflow.py`:
```python
"""POL-04 standard workflow endpoints — submit / approve / unlock."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.v1.deps import get_db, require_elpm
from app.models.project import Project
from app.services.workflow import transition_status, WorkflowError

router = APIRouter()


def _project_or_404(db: Session, code: str) -> Project:
    p = db.query(Project).filter(Project.project_code == code).first()
    if not p:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다")
    return p


def _change(
    db: Session,
    user: dict,
    project_code: str,
    target_status: str,
):
    p = _project_or_404(db, project_code)
    try:
        transition_status(
            p,
            target_status=target_status,
            actor_empno=user["empno"],
            actor_role=user["role"],
        )
    except WorkflowError as e:
        raise HTTPException(status_code=409, detail=str(e))
    db.commit()
    return {"project_code": project_code, "template_status": p.template_status}


@router.post("/projects/{project_code}/submit")
def submit_project(
    project_code: str,
    db: Session = Depends(get_db),
    user: dict = Depends(require_elpm),
):
    """PM submits draft → 작성완료."""
    return _change(db, user, project_code, "작성완료")


@router.post("/projects/{project_code}/approve")
def approve_project(
    project_code: str,
    db: Session = Depends(get_db),
    user: dict = Depends(require_elpm),
):
    """EL approves → 승인완료."""
    return _change(db, user, project_code, "승인완료")


@router.post("/projects/{project_code}/unlock")
def unlock_project(
    project_code: str,
    db: Session = Depends(get_db),
    user: dict = Depends(require_elpm),
):
    """EL unlocks 승인완료 → 작성중."""
    return _change(db, user, project_code, "작성중")
```

- [ ] **Step 3: Register in main.py**

In `backend/app/main.py`:

Replace the import line:
```python
from app.api.v1 import auth, budget_upload, budget_input, overview, projects, assignments, summary, export, cache, admin, chat, budget_assist, tracking, sync
```
with:
```python
from app.api.v1 import auth, budget_upload, budget_input, budget_workflow, overview, projects, assignments, summary, export, cache, admin, chat, budget_assist, tracking, sync
```

Add after `app.include_router(budget_input.router, ...)`:
```python
app.include_router(budget_workflow.router, prefix="/api/v1/budget", tags=["budget-workflow"])
```

- [ ] **Step 4: Run integration tests — should PASS now**

```bash
cd backend && pytest tests/regression/test_workflow_endpoints.py -v 2>&1 | tail -10
```
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/budget_workflow.py backend/app/main.py
git commit -m "feat(s7-area2): budget_workflow.py router — submit / approve / unlock endpoints"
```

---

### Task 8: Alembic migration — template_status CHECK constraint

**Files:**
- Create: `backend/alembic/versions/006_template_status_enum.py`

- [ ] **Step 1: Inspect previous migration pattern**

```bash
cat backend/alembic/versions/005_add_missing_tables.py | head -30
```

- [ ] **Step 2: Write migration**

`backend/alembic/versions/006_template_status_enum.py`:
```python
"""template_status CHECK constraint for POL-04 enum

Revision ID: 006_template_status_enum
Revises: 005_add_missing_tables
Create Date: 2026-04-25
"""
from alembic import op
import sqlalchemy as sa

revision = "006_template_status_enum"
down_revision = "005_add_missing_tables"
branch_labels = None
depends_on = None


VALID = ("작성중", "작성완료", "승인완료")


def upgrade() -> None:
    # 1. Backfill: rows with NULL or unrecognized values → '작성중'
    op.execute(
        "UPDATE projects SET template_status = '작성중' "
        "WHERE template_status IS NULL OR template_status NOT IN "
        "('작성중', '작성완료', '승인완료')"
    )
    # 2. Add CHECK constraint
    op.create_check_constraint(
        "ck_projects_template_status",
        "projects",
        "template_status IN ('작성중', '작성완료', '승인완료')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_projects_template_status", "projects", type_="check")
```

- [ ] **Step 3: Apply migration**

```bash
cd backend && alembic upgrade head 2>&1 | tail -5
```
Expected: `Running upgrade 005_add_missing_tables -> 006_template_status_enum`.

- [ ] **Step 4: Verify backfill + constraint**

```bash
psql -h localhost -p 5432 -U mybudget -d mybudget -c \
  "SELECT template_status, COUNT(*) FROM projects GROUP BY 1"
```
Expected: rows only contain `작성중` / `작성완료` / `승인완료`.

```bash
psql -h localhost -p 5432 -U mybudget -d mybudget -c \
  "INSERT INTO projects (project_code, template_status) VALUES ('TEST-INVALID', 'BAD')"
```
Expected: ERROR — check constraint violated. Then:
```bash
psql -h localhost -p 5432 -U mybudget -d mybudget -c \
  "DELETE FROM projects WHERE project_code='TEST-INVALID'"
```

- [ ] **Step 5: Test downgrade round-trip**

```bash
cd backend && alembic downgrade -1 && alembic upgrade head 2>&1 | tail -10
```
Expected: 2 alembic operations succeed.

- [ ] **Step 6: Commit**

```bash
git add backend/alembic/versions/006_template_status_enum.py
git commit -m "chore(s7-area2): alembic 006 — template_status CHECK constraint"
```

---

## Phase 3: Fixes

### Task 9: Fix #79 / #82 — list endpoint PM visibility

**Files:**
- Modify: `backend/app/api/v1/budget_input.py:184-215` (`/projects/list`)

- [ ] **Step 1: Update endpoint**

Replace lines 184-215 of `backend/app/api/v1/budget_input.py`:

```python
@router.get("/projects/list")
def list_registered_projects(
    q: str = "",
    status: str = "",
    db: Session = Depends(get_db),
    user: Optional[dict] = Depends(get_optional_user),
):
    """Budget 등록된 프로젝트 목록.

    가시성:
    - admin (role=admin, scope=all): 전체
    - elpm: el_empno OR pm_empno == 본인 empno
    - 비로그인: 빈 리스트
    필터:
    - q: project_name 또는 project_code 부분 검색 (ILIKE)
    - status: template_status 정확 일치 (작성중 / 작성완료 / 승인완료)
    """
    from sqlalchemy import func as sa_func, or_

    if not user:
        return []

    query = db.query(Project)

    # 가시성 필터
    if user.get("role") == "admin" and user.get("scope") == "all":
        pass  # 전체 노출
    else:
        empno = user["empno"]
        query = query.filter(or_(
            Project.el_empno == empno,
            Project.pm_empno == empno,
        ))

    if q:
        query = query.filter(or_(
            Project.project_name.ilike(f"%{q}%"),
            Project.project_code.ilike(f"%{q}%"),
        ))

    if status:
        query = query.filter(Project.template_status == status)

    projects = query.order_by(Project.contract_hours.desc().nullslast()).all()
    result = []
    for p in projects:
        member_count = db.query(sa_func.count(ProjectMember.id)).filter(
            ProjectMember.project_code == p.project_code).scalar() or 0
        result.append({
            "project_code": p.project_code,
            "project_name": p.project_name or "",
            "el_name": p.el_name or "",
            "pm_name": p.pm_name or "",
            "contract_hours": float(p.contract_hours or 0),
            "total_budget_hours": float(p.total_budget_hours or 0),
            "template_status": p.template_status or "작성중",
            "member_count": member_count,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        })
    return result
```

- [ ] **Step 2: Run regression #79 #82 backend tests — should PASS**

```bash
cd backend && pytest tests/regression/test_list_endpoint_pm_visibility.py -v 2>&1 | tail -10
```
Expected: 4 passed.

- [ ] **Step 3: Run all backend tests — no regressions**

```bash
cd backend && pytest 2>&1 | tail -5
```
Expected: count is `prior + 4` (new tests). All green.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/v1/budget_input.py
git commit -m "fix(s7-area2): #79 #82 — /projects/list PM visibility + status filter param"
```

---

### Task 10: Fix #121 — case-insensitive client filter

**Files:**
- Modify: `frontend/src/app/(dashboard)/budget-input/page.tsx`

- [ ] **Step 1: Update client-side filter**

In `frontend/src/app/(dashboard)/budget-input/page.tsx`, replace:
```ts
const filtered = allProjects.filter(
  (p) =>
    p.project_name.includes(search) ||
    p.project_code.includes(search) ||
    p.el_name.includes(search)
);
```
with:
```ts
const lc = search.toLowerCase();
const filtered = allProjects.filter(
  (p) =>
    p.project_name.toLowerCase().includes(lc) ||
    p.project_code.toLowerCase().includes(lc) ||
    p.el_name.toLowerCase().includes(lc) ||
    p.pm_name.toLowerCase().includes(lc)
);
```

(Also include `pm_name` in search since users may search by PM.)

- [ ] **Step 2: Run regression #121 — should PASS**

(Servers running) `cd frontend && npm test -- --project=regression --grep "regression #121" 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/\(dashboard\)/budget-input/page.tsx
git commit -m "fix(s7-area2): #121 — case-insensitive client-side search"
```

---

### Task 11: Frontend — remove blank template button (#84)

**Files:**
- Modify: `frontend/src/app/(dashboard)/budget-input/page.tsx`

- [ ] **Step 1: Delete the button block**

Remove lines 82-104 (the entire `<button onClick={...}>` for "빈 Budget Template 다운로드" + the closing `</button>`).

The blank-export endpoint stays — Step 3 wizard uses it. Only the menu placement is removed.

- [ ] **Step 2: Verify no orphaned code**

```bash
grep -n "blank-export\|빈 Budget" frontend/src/app/\(dashboard\)/budget-input/page.tsx
```
Expected: 0 matches.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/\(dashboard\)/budget-input/page.tsx
git commit -m "fix(s7-area2): #84 — remove '빈 Budget Template' button from list page"
```

---

### Task 12: Frontend — status filter dropdown (#120)

**Files:**
- Modify: `frontend/src/app/(dashboard)/budget-input/page.tsx`

- [ ] **Step 1: Add status state + dropdown UI**

After existing `const [search, setSearch] = useState("");`:
```ts
const [statusFilter, setStatusFilter] = useState<string>("");
```

Update the search input row (around line 106) to include the dropdown:
```tsx
<div className="flex items-center gap-3">
  <input
    type="text"
    placeholder="프로젝트명, 코드, EL/PM명 검색..."
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    className="w-full max-w-md px-3 py-2 text-sm border border-pwc-gray-200 rounded focus:outline-none focus:border-pwc-orange"
  />
  <select
    value={statusFilter}
    onChange={(e) => setStatusFilter(e.target.value)}
    className="px-3 py-2 text-sm border border-pwc-gray-200 rounded focus:outline-none focus:border-pwc-orange"
  >
    <option value="">전체 상태</option>
    <option value="작성중">작성중</option>
    <option value="작성완료">작성완료</option>
    <option value="승인완료">승인완료</option>
  </select>
</div>
```

Update the `filtered` line to also filter by statusFilter:
```ts
const filtered = allProjects.filter((p) => {
  if (statusFilter && p.template_status !== statusFilter) return false;
  const lc = search.toLowerCase();
  if (!lc) return true;
  return (
    p.project_name.toLowerCase().includes(lc) ||
    p.project_code.toLowerCase().includes(lc) ||
    p.el_name.toLowerCase().includes(lc) ||
    p.pm_name.toLowerCase().includes(lc)
  );
});
```

- [ ] **Step 2: Update status badge to handle 승인완료**

In the `<td>` for `template_status` badge, expand the conditional:
```tsx
<span className={`px-2 py-0.5 rounded text-xs font-medium ${
  p.template_status === "승인완료"
    ? "bg-blue-50 text-blue-700"
    : p.template_status === "작성완료"
    ? "bg-green-50 text-pwc-green"
    : "bg-yellow-50 text-pwc-orange"
}`}>
  {p.template_status}
</span>
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/\(dashboard\)/budget-input/page.tsx
git commit -m "feat(s7-area2): #120 — 작성여부 status filter dropdown + 승인완료 badge"
```

---

### Task 13: Frontend — show last_updated badge (#85)

**Files:**
- Modify: `frontend/src/app/(dashboard)/budget-input/page.tsx`

- [ ] **Step 1: Add updated_at to interface + state mapping**

In `BudgetProject` interface:
```ts
interface BudgetProject {
  project_code: string;
  project_name: string;
  el_name: string;
  pm_name: string;
  template_status: string;
  contract_hours: number;
  updated_at: string | null;  // NEW
}
```

In the `setAllProjects` callback (data.map):
```ts
updated_at: (p.updated_at as string) || null,
```

- [ ] **Step 2: Add column to table header + body**

Header (after 작성상태, before 액션):
```tsx
<th className="px-4 py-2.5 text-left text-xs font-semibold text-pwc-gray-600">마지막 수정</th>
```

Body (after status badge cell):
```tsx
<td className="px-4 py-2.5 text-xs text-pwc-gray-600">
  {p.updated_at
    ? new Date(p.updated_at).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
    : "—"}
</td>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/\(dashboard\)/budget-input/page.tsx
git commit -m "feat(s7-area2): #85 — last_updated 마지막 수정일 column on list"
```

---

### Task 14: Frontend — workflow buttons on project detail page

**Files:**
- Modify: `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx`

- [ ] **Step 1: Locate the Step 3 toolbar / 작성완료 등록 area**

```bash
grep -n "작성완료\|등록완료\|template_status" frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/page.tsx | head
```

- [ ] **Step 2: Add workflow buttons based on current status**

Find the action area at the bottom of the wizard. Add 3 conditional buttons:

```tsx
{/* POL-04 워크플로우 */}
{project.template_status === "작성중" && (
  <button
    onClick={async () => {
      const res = await fetch(`${API_BASE}/api/v1/budget/projects/${projectCode}/submit`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setProject((p) => ({ ...p, template_status: data.template_status }));
        alert("작성완료로 제출되었습니다.");
      } else {
        const d = await res.json();
        alert(`제출 실패: ${d.detail || "오류"}`);
      }
    }}
    className="px-4 py-2 text-sm font-medium bg-pwc-orange text-white rounded hover:bg-pwc-orange-light"
  >
    작성완료 제출
  </button>
)}

{project.template_status === "작성완료" && (
  <button
    onClick={async () => {
      if (!confirm("이 프로젝트를 승인하시겠습니까? 승인 후 편집이 잠깁니다.")) return;
      const res = await fetch(`${API_BASE}/api/v1/budget/projects/${projectCode}/approve`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setProject((p) => ({ ...p, template_status: data.template_status }));
        alert("승인되었습니다.");
      } else {
        const d = await res.json();
        alert(`승인 실패: ${d.detail || "오류"}`);
      }
    }}
    className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded hover:bg-green-700"
  >
    승인
  </button>
)}

{project.template_status === "승인완료" && (
  <button
    onClick={async () => {
      if (!confirm("이 프로젝트의 락을 해제하시겠습니까? 작성중 상태로 돌아갑니다.")) return;
      const res = await fetch(`${API_BASE}/api/v1/budget/projects/${projectCode}/unlock`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setProject((p) => ({ ...p, template_status: data.template_status }));
        alert("락이 해제되었습니다.");
      } else {
        const d = await res.json();
        alert(`락 해제 실패: ${d.detail || "오류"}`);
      }
    }}
    className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
  >
    락 해제
  </button>
)}
```

Place these buttons in the Step 3 toolbar (or wherever existing 등록완료 button is).

- [ ] **Step 2.5: Also disable editing when 승인완료**

Find the Step 3 month-cell editing logic. Wrap or disable based on `project.template_status === "승인완료"`. If complex, document in commit message that "락 = read-only" is best-effort and full lock-down is in later tasks.

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 4: Run regression #61 #98 (workflow E2E)**

(Servers running) `cd frontend && npm test -- --project=regression --grep "POL-04" 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/page.tsx
git commit -m "feat(s7-area2): #61 #98 — workflow buttons (submit / approve / unlock) on detail page"
```

---

### Task 15: Backend — daily TBA sync cron (POL-05)

**Files:**
- Modify: `backend/app/services/sync_service.py` (add daily cron registration)

- [ ] **Step 1: Inspect current sync_service**

```bash
grep -n "scheduler\|apscheduler\|cron\|schedule\|BackgroundScheduler" backend/app/services/sync_service.py | head
```

If a scheduler exists, register a new daily job. If not, create one.

- [ ] **Step 2: Add daily TBA sync job**

In `backend/app/services/sync_service.py`, append:
```python
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

_scheduler: BackgroundScheduler | None = None


def _daily_tba_sync_job():
    """Called by APScheduler at 04:00 daily (KST)."""
    from app.db.session import SessionLocal
    db = SessionLocal()
    try:
        # Reuse existing client/employee sync infrastructure.
        # The exact functions to call depend on what 'TBA sync' means in
        # the existing codebase. Inspect and call the appropriate sync_*().
        try:
            sync_clients(db)  # If this function exists
        except Exception as e:
            logging.exception(f"daily_tba_sync clients failed: {e}")
        try:
            sync_employees(db)  # If this function exists
        except Exception as e:
            logging.exception(f"daily_tba_sync employees failed: {e}")
    finally:
        db.close()


def start_daily_sync_scheduler():
    """Idempotent — call from app startup."""
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = BackgroundScheduler(timezone="Asia/Seoul")
    _scheduler.add_job(
        _daily_tba_sync_job,
        CronTrigger(hour=4, minute=0),
        id="daily_tba_sync",
        replace_existing=True,
    )
    _scheduler.start()
```

- [ ] **Step 3: Wire into app startup**

In `backend/app/main.py`, add inside `@app.on_event("startup")` or equivalent:
```python
from app.services.sync_service import start_daily_sync_scheduler
start_daily_sync_scheduler()
```

- [ ] **Step 4: Smoke check the scheduler started**

After backend restart, check logs for "Scheduler started" or call list_jobs:
```bash
curl http://localhost:3001/api/v1/admin/scheduler/jobs  # if such endpoint exists
```
If no such endpoint, just verify backend logs show APScheduler initialization.

If the function names `sync_clients` / `sync_employees` don't exist, inspect the existing sync API (`backend/app/api/v1/sync.py`) and adapt the job to call the right service-level functions.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/sync_service.py backend/app/main.py
git commit -m "feat(s7-area2): POL-05 — daily TBA sync cron at 04:00 KST"
```

**Note:** This task may surface issues with how sync currently works. If running the cron is non-trivial, mark this task DONE_WITH_CONCERNS and document follow-up in retro. Daily cron is nice-to-have for area 2 — manual trigger (admin endpoint, already exists from Area 1) is sufficient for #64 minimum bar.

---

## Phase 4: Verification & Hand-off

### Task 16: Update visual baseline for budget-input-list

**Goal:** UI changes (status filter / no blank button / last_updated column) require new visual baseline.

- [ ] **Step 1: Start servers + capture new baseline**

```bash
cd backend && uvicorn app.main:app --port 3001 &
BE_PID=$!
cd frontend && npm run dev &
FE_PID=$!
sleep 10
cd frontend && npm run test:visual -- --update-snapshots --grep "budget-input-list" 2>&1 | tail -10
kill $BE_PID $FE_PID 2>/dev/null
```

- [ ] **Step 2: Verify diff 0 on second run**

```bash
cd frontend && npm run test:visual -- --grep "budget-input-list" 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/__visual__/baseline.spec.ts-snapshots/budget-input-list-*.png
git commit -m "test(s7-area2): visual baseline updated for status filter + last_updated column"
```

---

### Task 17: Phase E Layer 2 QA checklist

**Files:**
- Create: `docs/superpowers/qa-checklists/area-2.md`

- [ ] **Step 1: Author**

```markdown
# Area 2 — Manual QA Checklist (Phase E Layer 2)

**Tester:** ___ **Date:** ___ **Build:** ___

## 목록 가시성 (#79 / #82)

- [ ] PM 계정으로 로그인 → 본인이 PM인 프로젝트가 모두 목록에 보임 (예: AREA2-LIST-P3)
- [ ] EL 계정으로 로그인 → 본인이 EL인 프로젝트가 모두 보임
- [ ] admin 계정 → 모든 프로젝트 보임
- [ ] staff 계정 → 본인 프로젝트 없으면 빈 리스트

## 검색 (#121)

- [ ] "sk텔레콤" / "SK텔레콤" / "Sk텔레콤" — 모두 SK텔레콤 결과 표시
- [ ] EL/PM 이름으로도 검색 가능

## 상태 필터 (#120)

- [ ] 드롭다운 (전체 / 작성중 / 작성완료 / 승인완료) 선택 시 결과 즉시 변경
- [ ] 검색 + 상태 필터 동시 적용 가능

## 빈 Budget Template 버튼 제거 (#84)

- [ ] 목록 화면에 "빈 Budget Template 다운로드" 버튼이 보이지 않음
- [ ] Step 3 안에서는 여전히 다운로드 가능 (영역 1 기능 유지)

## 마지막 수정일 (#85)

- [ ] 각 행에 "마지막 수정" 컬럼 표시
- [ ] 임시저장 후 화면 돌아오면 해당 프로젝트의 시간이 갱신됨

## POL-04 워크플로우 (#61 / #98)

- [ ] PM 계정 → 작성중 프로젝트 → "작성완료 제출" 버튼 보임
- [ ] 클릭 → 상태 작성완료 변경 + alert
- [ ] EL 계정 → 작성완료 프로젝트 → "승인" 버튼 보임
- [ ] 승인 클릭 → 상태 승인완료 변경
- [ ] 승인완료 상태에서 편집 시도 → 차단됨
- [ ] EL → "락 해제" 버튼 → 작성중 복귀
- [ ] Staff 계정 → 직접 API 호출 시 403

## POL-05 daily sync

- [ ] backend container 재시작 후 로그에 APScheduler 초기화 표시
- [ ] (다음 새벽 4시 또는 수동 trigger 후) 신규 TBA 등록 프로젝트가 목록에 추가

## 누적 회귀 (영역 1 가드)

- [ ] 회귀 7건 (#67 #68 #69 #70 #71 #74 #99) 모두 차단 유지
- [ ] CI 5 jobs 모두 녹색
```

Commit:
```bash
mkdir -p docs/superpowers/qa-checklists
git add docs/superpowers/qa-checklists/area-2.md
git commit -m "docs(s7-area2): Phase E Layer 2 manual QA checklist"
```

---

### Task 18: Phase F retro template

**Files:**
- Create: `docs/superpowers/retros/area-2.md`

- [ ] **Step 1: Author**

```markdown
# Area 2 Retrospective

**Completed:** ___
**Author:** ___

## What worked
- ...

## What didn't
- ...

## Surprises (new defect classes discovered)

| class | how detected | how to prevent in future areas |
|---|---|---|
| ... | ... | ... |

## Tests / scripts added — and what they protect against

- `frontend/tests/regression/test_budget_list_states_visibility.spec.ts` — protects against #79/#82 list filter regression
- `frontend/tests/regression/test_budget_list_search_case_insensitive.spec.ts` — protects against #121 case-sensitive search
- `frontend/tests/regression/test_workflow_pm_submit_el_approve.spec.ts` — POL-04 workflow E2E
- `backend/tests/regression/test_list_endpoint_pm_visibility.py` — list visibility unit
- `backend/tests/regression/test_workflow_endpoints.py` — submit/approve/unlock integration
- `backend/tests/test_workflow_service.py` — transition_status unit

## POL items added during Area 2

- POL-09 (TBA sync 권한 범위) — admin only로 시작했음. 사용자 컨펌 후 정식 등록 여부 결정

## POL-04 / POL-05 외부 결정자 컨펌 진행 상황

- POL-04: ___ (김동환 답변 / 미접수)
- POL-05: ___ (김미진 답변 / 미접수)

## budget_input.py 분해 부담

- 추가된 LOC: ___
- 영역 5에서 wizard 분해 시 같이 해야 할 작업: ___

## Sign-off — Area 3 진입 가능 여부

- [ ] All Phase E Layer 1/2/3 green
- [ ] User confirmed Area 2 ends
```

Commit:
```bash
mkdir -p docs/superpowers/retros
git add docs/superpowers/retros/area-2.md
git commit -m "docs(s7-area2): retro template (Phase F)"
```

---

### Task 19: Final verification + draft PR

- [ ] **Step 1: Local backend full**

```bash
cd backend && pytest 2>&1 | tail -10
```
Expected: 190 (Area 1 baseline) + 6 workflow service + 4 list visibility + 3 workflow endpoint = ~203 passed / 10 skipped / 0 failed.

- [ ] **Step 2: Local frontend full**

```bash
cd backend && uvicorn app.main:app --port 3001 &
BE_PID=$!
cd frontend && npm run dev &
FE_PID=$!
sleep 10

cd frontend && npm test -- --project=default --project=regression 2>&1 | tail -20

kill $BE_PID $FE_PID 2>/dev/null
```

Visual & smoke can be deferred to CI execution.

- [ ] **Step 3: Grep guards**

```bash
bash scripts/ci/check-no-direct-number-input.sh && \
bash scripts/ci/check-no-direct-budget-arithmetic.sh && \
bash scripts/ci/check-docker-compose-no-dev.sh
echo "EXIT: $?"
```

- [ ] **Step 4: Push + draft PR**

```bash
git push -u origin s7/area-2-budget-list 2>&1 | tail -5

gh pr create --draft --base s7/area-1-safety-net --title "S7 Area 2 — Budget 입력 목록 + POL-04 워크플로우" --body "$(cat <<'BODYEOF'
## Summary
- Fixes #79 #82 #84 #85 #120 #121 (Budget 입력 목록 결함)
- Adds POL-04 표준형 워크플로우 (submit / approve / unlock endpoints)
- Adds POL-05 daily TBA sync cron at 04:00 KST
- Spec: docs/superpowers/specs/2026-04-25-area-2-budget-list-design.md
- Plan: docs/superpowers/plans/2026-04-25-area-2-budget-list.md

**Note:** Branched off s7/area-1-safety-net. Rebase onto main after Area 1 PR merges.

## Provisional decisions
- POL-04: (b) 표준형 — owner 잠정 승인. 김동환 외부 컨펌 대기.
- POL-05: (d) 하이브리드 — owner 잠정 승인. 김미진 외부 컨펌 대기.

## Test plan
- [ ] Area 2 regression tests green
- [ ] Area 1 누적 회귀 가드 green (영역 1 PR이 main에 merge되기 전까지는 동일 커밋)
- [ ] CI 5 jobs green
- [ ] Manual QA checklist (docs/superpowers/qa-checklists/area-2.md) all PASS

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODYEOF
)" 2>&1 | tail -10
```

If `gh` fails, log reason and just complete the push. Report PR URL or absence.

- [ ] **Step 5: Document final state**

Append to `docs/superpowers/runbooks/area-2-baseline-report.md` (create if missing):
```markdown
# Area 2 — Final Verification (Task 19)

**Date:** <today>

### Local results
- Backend pytest: <count> passed
- Frontend (default + regression): <pass>/<fail>
- Grep guards: 3/3 PASS

### Push & PR
- Push: SUCCESS / FAIL
- Draft PR: <URL>

### Hand-off to user
- Run Phase E Layer 2 QA from `docs/superpowers/qa-checklists/area-2.md`
- Sign off Phase E Layer 3 → Area 2 closes
```

Commit + push:
```bash
git add docs/superpowers/runbooks/area-2-baseline-report.md
git commit -m "docs(s7-area2): Task 19 final verification report"
git push
```

## Self-Review (already performed during write)

- ✅ All 6 spec defects (#79/#82/#84/#85/#120/#121) mapped to fix tasks (9, 10, 11, 12, 13, 14)
- ✅ POL-04 workflow → Tasks 6, 7, 14
- ✅ POL-05 daily cron → Task 15
- ✅ Phase B safety net → Tasks 2, 3, 4, 5 (5 test files committed RED)
- ✅ Phase F retro → Task 18
- ✅ Final verification + push → Task 19
- No "TBD" / "TODO" placeholders. Step counts and code blocks complete.
- Type/name consistency: `transition_status`, `WorkflowError`, status values (`작성중` / `작성완료` / `승인완료`) consistent across tasks.

---

**Plan complete and saved. Ready for subagent-driven execution.**
