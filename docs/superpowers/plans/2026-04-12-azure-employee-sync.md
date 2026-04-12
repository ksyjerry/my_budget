# Azure Employee Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Azure `BI_STAFFREPORT_EMP_V` 재직자(모든 LoS 제외 Tax)를 Postgres `employees` 테이블로 동기화하여 Budget 입력 Step 2 구성원 검색을 Postgres 단일 조회로 단순화.

**Architecture:** Azure → Postgres 단방향 sync. `sync_employees()` 는 이미 존재 — SQL 필터만 추가. 나머지는 plumbing (admin 가드, status endpoint, scheduler, search rewrite, initial sync).

**Tech Stack:** FastAPI, SQLAlchemy, APScheduler, pymssql, Playwright

**Spec:** [docs/superpowers/specs/2026-04-12-azure-employee-sync-design.md](docs/superpowers/specs/2026-04-12-azure-employee-sync-design.md)

---

## Task 1: Tax LoS 값 확인 + `sync_employees()` 필터 업데이트

**Files:**
- Modify: `backend/app/services/sync_service.py` (`sync_employees` 함수)

**Background:** 기존 `sync_employees()` 의 SQL 에 `WHERE EMP_STAT = N'재직' AND LOS NOT IN (<Tax LoS>)` 추가. 먼저 Azure 에서 실제 LoS 값 목록을 확인해서 Tax 에 해당하는 값을 찾는다.

- [ ] **Step 1: Azure 에서 LoS distinct 값 확인**

```bash
cd backend && python -c "
from app.db.azure_session import get_azure_connection
with get_azure_connection() as conn:
    cur = conn.cursor()
    cur.execute(\"SELECT DISTINCT LOS FROM BI_STAFFREPORT_EMP_V WHERE EMP_STAT = N'재직' ORDER BY LOS\")
    for r in cur.fetchall():
        print(repr(r[0]))
"
```

Expected: LoS 의 distinct 값 리스트 출력 (예: `'Assurance'`, `'Tax'`, `'Advisory'` 또는 숫자 코드).

Based on output, identify which value(s) represent Tax LoS. Record the exact string(s).

- [ ] **Step 2: EMP_STAT distinct 확인**

```bash
cd backend && python -c "
from app.db.azure_session import get_azure_connection
with get_azure_connection() as conn:
    cur = conn.cursor()
    cur.execute('SELECT DISTINCT EMP_STAT FROM BI_STAFFREPORT_EMP_V')
    for r in cur.fetchall():
        print(repr(r[0]))
"
```

Expected: `'재직'`, `'퇴사'`, etc. Confirm the exact string for "재직".

- [ ] **Step 3: `sync_employees()` 함수 수정**

Edit [backend/app/services/sync_service.py:14](backend/app/services/sync_service.py#L14). Replace the SQL inside `sync_employees` with the filtered version.

Current:
```python
        cursor.execute("""
            SELECT EMPNO, EMPNM, CM_NM, GRADCD, GRADNM,
                   TL_EMPNO, LOS, ORG_CD, ORG_NM, PWC_ID, EMP_STAT
            FROM BI_STAFFREPORT_EMP_V
        """)
```

Replace with (use values confirmed in Steps 1-2):
```python
        # 재직자 + Tax LoS 제외 (Budget+ 는 Assurance 용)
        cursor.execute("""
            SELECT EMPNO, EMPNM, CM_NM, GRADCD, GRADNM,
                   TL_EMPNO, LOS, ORG_CD, ORG_NM, PWC_ID, EMP_STAT
            FROM BI_STAFFREPORT_EMP_V
            WHERE EMP_STAT = N'재직'
              AND (LOS IS NULL OR LOS NOT IN (N'<TAX_VALUE_1>', N'<TAX_VALUE_2>'))
        """)
```

**If only ONE Tax value exists**, use single NOT IN with one element. **If Tax LoS is coded** (e.g., `LOS='20'` for Tax), use the code instead of the name.

The rest of `sync_employees` (UPSERT loop) stays unchanged.

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/sync_service.py
git commit -m "feat(sync): sync_employees filters to Assurance-ish LoS, active only"
```

---

## Task 2: pytest for `sync_employees()` (TDD-ish, mock Azure)

**Files:**
- Create: `backend/tests/test_sync_employees.py`

**Background:** Add unit tests similar to `test_sync_clients.py`. Mock `_get_azure()` and verify insert/update behavior.

- [ ] **Step 1: Create test file**

Create `backend/tests/test_sync_employees.py`:

```python
"""sync_employees() 유닛 테스트 — Azure 쿼리는 mock."""
from datetime import datetime
from unittest.mock import patch, MagicMock

import pytest
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.employee import Employee
from app.services.sync_service import sync_employees


@pytest.fixture
def db():
    s = SessionLocal()
    s.query(Employee).filter(Employee.empno.like("999%")).delete(synchronize_session=False)
    s.commit()
    yield s
    s.query(Employee).filter(Employee.empno.like("999%")).delete(synchronize_session=False)
    s.commit()
    s.close()


def _mock_azure(rows):
    mock_cursor = MagicMock()
    mock_cursor.fetchall.return_value = rows
    mock_conn = MagicMock()
    mock_conn.cursor.return_value = mock_cursor
    cm = MagicMock()
    cm.__enter__.return_value = mock_conn
    cm.__exit__.return_value = False
    return cm


def test_insert_new_employee(db: Session):
    """Azure 에만 있는 새 empno → INSERT."""
    fake_cm = _mock_azure([
        {
            "EMPNO": "999001", "EMPNM": "테스트직원", "CM_NM": "테스트본부",
            "GRADCD": "SA", "GRADNM": "Senior Associate",
            "TL_EMPNO": "123456", "LOS": "10", "ORG_CD": "T01",
            "ORG_NM": "조직", "PWC_ID": "test@pwc.com", "EMP_STAT": "재직",
        },
    ])
    with patch("app.services.sync_service._get_azure", return_value=fake_cm):
        count = sync_employees(db)
    assert count == 1
    e = db.query(Employee).filter_by(empno="999001").first()
    assert e is not None
    assert e.name == "테스트직원"
    assert e.grade_code == "SA"
    assert e.synced_at is not None


def test_update_existing_employee(db: Session):
    """기존 row 의 name/grade 를 Azure 값으로 덮어쓴다."""
    existing = Employee(
        empno="999002",
        name="구이름",
        grade_code="A",
        grade_name="Associate",
        department="옛본부",
    )
    db.add(existing)
    db.commit()

    fake_cm = _mock_azure([
        {
            "EMPNO": "999002", "EMPNM": "새이름", "CM_NM": "새본부",
            "GRADCD": "SA", "GRADNM": "Senior Associate",
            "TL_EMPNO": "234567", "LOS": "10", "ORG_CD": "T02",
            "ORG_NM": "새조직", "PWC_ID": "new@pwc.com", "EMP_STAT": "재직",
        },
    ])
    with patch("app.services.sync_service._get_azure", return_value=fake_cm):
        sync_employees(db)

    db.refresh(existing)
    assert existing.name == "새이름"
    assert existing.grade_code == "SA"
    assert existing.department == "새본부"
```

- [ ] **Step 2: Run tests**

Run: `cd backend && pytest tests/test_sync_employees.py -v`

Expected: 2 passed (sync_employees already exists from original code, just with updated filter).

If any assertion fails, debug and fix. If upsert logic is broken, escalate.

- [ ] **Step 3: Full regression**

Run: `cd backend && pytest tests/ -v 2>&1 | tail -10`

Expected: All tests pass (14 total = 12 existing + 2 new).

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_sync_employees.py
git commit -m "test(sync): add sync_employees upsert unit tests"
```

---

## Task 3: Admin guard + status endpoint for `/sync/employees`

**Files:**
- Modify: `backend/app/api/v1/sync.py`

**Background:** Current `/sync/employees` has no admin check (anyone can trigger it). Add `_require_admin` guard and a `/status` endpoint, mirroring the clients pattern.

- [ ] **Step 1: Update sync.py**

Edit [backend/app/api/v1/sync.py](backend/app/api/v1/sync.py). Replace the `sync_employees_endpoint` function:

Current:
```python
@router.post("/employees")
def sync_employees_endpoint(db: Session = Depends(get_db)):
    count = sync_employees(db)
    return {"message": f"{count}명 동기화 완료"}
```

Replace with:
```python
@router.post("/employees")
def sync_employees_endpoint(
    db: Session = Depends(get_db),
    user: dict | None = Depends(get_optional_user),
):
    """Azure → Postgres 직원 동기화 (admin only)."""
    _require_admin(db, user)
    t0 = time.time()
    count = sync_employees(db)
    elapsed_ms = int((time.time() - t0) * 1000)
    return {"synced": count, "elapsed_ms": elapsed_ms, "message": "ok"}


@router.get("/employees/status")
def sync_employees_status(
    db: Session = Depends(get_db),
    user: dict | None = Depends(get_optional_user),
):
    """마지막 Azure 직원 동기화 상태 조회 (인증 필요)."""
    if not user:
        raise HTTPException(status_code=401, detail="인증이 필요합니다.")
    from app.models.employee import Employee
    total = db.query(func.count(Employee.empno)).scalar() or 0
    last_sync = db.query(func.max(Employee.synced_at)).scalar()
    return {
        "total_employees": total,
        "last_sync": last_sync.isoformat() if last_sync else None,
    }
```

- [ ] **Step 2: Verify imports are already present**

Check that `time`, `HTTPException`, `Depends`, `func`, `get_optional_user`, `_require_admin` are all imported in sync.py (they should be — clients endpoint already uses them).

- [ ] **Step 3: Verify via static import**

```bash
cd backend && python -c "from app.main import app; print([r.path for r in app.routes if '/sync/' in getattr(r, 'path', '')])"
```

Expected routes to include:
- `/api/v1/sync/employees` (POST)
- `/api/v1/sync/employees/status` (GET)
- plus the existing clients routes

- [ ] **Step 4: Live test the status endpoint (unauth should 401)**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/v1/sync/employees/status
```

Expected: `401`

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/sync.py
git commit -m "feat(api): /sync/employees admin guard + status endpoint"
```

---

## Task 4: APScheduler — add sync_employees daily job at 06:05 KST

**Files:**
- Modify: `backend/app/main.py`

**Background:** Add a second job to the existing scheduler that runs sync_employees at 06:05 KST (5 minutes after clients to avoid Azure load spike).

- [ ] **Step 1: Add `_scheduled_employee_sync` function**

Edit [backend/app/main.py](backend/app/main.py). Find `_scheduled_client_sync` and add this function immediately after it:

```python
def _scheduled_employee_sync():
    """매일 06:05 KST 에 Azure → Postgres 직원 동기화."""
    from app.db.session import SessionLocal
    from app.services.sync_service import sync_employees
    logger = logging.getLogger("scheduler")
    db = SessionLocal()
    try:
        n = sync_employees(db)
        logger.info(f"Scheduled employee sync: {n} employees")
    except Exception as e:
        logger.error(f"Scheduled employee sync failed: {e}")
    finally:
        db.close()
```

- [ ] **Step 2: Add job registration in `start_scheduler`**

In `start_scheduler`, after `_scheduler.add_job(_scheduled_client_sync, ...)`, add:

```python
        _scheduler.add_job(
            _scheduled_employee_sync,
            "cron",
            hour=6,
            minute=5,
            id="sync_employees",
            replace_existing=True,
        )
```

Make sure both jobs are added BEFORE `_scheduler.start()`.

- [ ] **Step 3: Verify via TestClient**

```bash
cd backend && python -c "
from fastapi.testclient import TestClient
from app.main import app, _scheduler
with TestClient(app) as client:
    jobs = _scheduler.get_jobs()
    print('jobs:', [(j.id, str(j.trigger)) for j in jobs])
"
```

Expected:
```
jobs: [('sync_clients', "cron[hour='6', minute='0']"), ('sync_employees', "cron[hour='6', minute='5']")]
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/main.py
git commit -m "feat(scheduler): daily 06:05 KST Azure employee sync"
```

---

## Task 5: Rewrite `/budget/employees/search` (Postgres-only)

**Files:**
- Modify: `backend/app/api/v1/budget_input.py` (the `search_employees` function)

**Background:** Replace the Azure-live + budget_details fallback implementation with a simple Postgres `employees` table query.

- [ ] **Step 1: Replace the function**

Edit [backend/app/api/v1/budget_input.py:100-147](backend/app/api/v1/budget_input.py#L100). Find the `@router.get("/employees/search")` decorator and replace the entire function body.

Current (approximately):
```python
@router.get("/employees/search")
def search_employees(q: str = "", db: Session = Depends(get_db)):
    """직원 이름/사번으로 검색 (Azure 직원 마스터 + budget_details 병합)."""
    if not q or len(q) < 2:
        return []

    from app.services import azure_service
    result_map: dict[str, dict] = {}
    try:
        for e in azure_service.get_employees():
            ...
    except Exception:
        pass

    from sqlalchemy import func
    bd_results = (
        db.query(BudgetDetail.empno, ...)
        ...
    )
    for r in bd_results:
        ...
    results = sorted(result_map.values(), key=lambda x: x["name"])
    return results[:30]
```

Replace with:

```python
@router.get("/employees/search")
def search_employees(q: str = "", db: Session = Depends(get_db)):
    """직원 이름/사번으로 검색 — Postgres employees 마스터 단일 조회."""
    if not q or len(q) < 2:
        return []
    from app.models.employee import Employee
    rows = (
        db.query(Employee)
        .filter(
            (Employee.name.ilike(f"%{q}%")) |
            (Employee.empno.ilike(f"%{q}%"))
        )
        .order_by(Employee.name)
        .limit(30)
        .all()
    )
    return [
        {
            "empno": e.empno,
            "name": e.name,
            "grade": e.grade_name or "",
            "department": e.department or "",
        }
        for e in rows
    ]
```

- [ ] **Step 2: Verify the `BudgetDetail` import is still needed by other functions in this file**

```bash
cd backend && grep -n "BudgetDetail" app/api/v1/budget_input.py
```

If `BudgetDetail` is no longer used anywhere in the file, remove the import. If it's still used by other functions, keep it.

- [ ] **Step 3: Static import verification**

```bash
cd backend && python -c "from app.api.v1.budget_input import search_employees; print('ok')"
```

Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/v1/budget_input.py
git commit -m "refactor(api): employees/search reads Postgres only (no Azure live)"
```

---

## Task 6: Initial manual sync

**Files:** none (operational)

**Background:** `employees` table is currently empty. Run the sync once via the admin endpoint to seed it.

- [ ] **Step 1: Get admin token**

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"empno":"160553"}' | python -c "import json,sys; print(json.load(sys.stdin)['token'])")
```

- [ ] **Step 2: Trigger sync**

```bash
curl -s -X POST http://localhost:3001/api/v1/sync/employees \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
```

Expected:
```json
{
    "synced": <수천 숫자>,
    "elapsed_ms": <5000 이하>,
    "message": "ok"
}
```

- [ ] **Step 3: Verify count via status**

```bash
curl -s -X GET http://localhost:3001/api/v1/sync/employees/status \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
```

Expected: `total_employees` > 0, `last_sync` = 방금 시각

- [ ] **Step 4: Verify a known employee is findable**

```bash
curl -s "http://localhost:3001/api/v1/budget/employees/search?q=김" | python -m json.tool | head -20
```

Expected: JSON array with at least one employee whose name contains 김.

- [ ] **Step 5: Verify Tax LoS는 없음 (spot check)**

```bash
cd backend && python -c "
from app.models import project, budget, employee
from app.db.session import SessionLocal
from app.models.employee import Employee
from sqlalchemy import func
db = SessionLocal()
# Tax LoS 값 확인 — 없어야 함
tax_count = db.query(func.count(Employee.empno)).filter(
    Employee.los.in_(['Tax', '세무'])  # Task 1 에서 확인한 값으로 대체
).scalar()
print(f'Tax LoS employees (should be 0): {tax_count}')
# 퇴사자 확인 — 없어야 함
resign = db.query(func.count(Employee.empno)).filter(Employee.emp_status != '재직').scalar()
print(f'Non-active employees (should be 0): {resign}')
db.close()
"
```

Expected: both 0.

- [ ] **Step 6: No commit (operational task)**

---

## Task 7: Playwright E2E tests

**Files:**
- Create: `frontend/tests/task-azure-employee-sync.spec.ts`

- [ ] **Step 1: Create spec file**

```typescript
import { test, expect } from "@playwright/test";

const API = "http://localhost:3001/api/v1";
const ADMIN_EMPNO = process.env.ADMIN_EMPNO || "160553";

async function adminLogin(request: any): Promise<string> {
  const res = await request.post(`${API}/auth/login`, { data: { empno: ADMIN_EMPNO } });
  const j = await res.json();
  return j.token;
}

test.describe("Azure Employee Sync", () => {
  test("API — /sync/employees/status requires auth and returns counts", async ({ request }) => {
    const unauth = await request.get(`${API}/sync/employees/status`);
    expect(unauth.status()).toBe(401);

    const token = await adminLogin(request);
    const res = await request.get(`${API}/sync/employees/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const s = await res.json();
    expect(s).toHaveProperty("total_employees");
    expect(s).toHaveProperty("last_sync");
    expect(s.total_employees).toBeGreaterThan(0);
    console.log(`Employees — total: ${s.total_employees}, last_sync: ${s.last_sync}`);
  });

  test("API — /sync/employees rejects non-admin", async ({ request }) => {
    const loginRes = await request.post(`${API}/auth/login`, { data: { empno: "320915" } });
    const { token } = await loginRes.json();
    const res = await request.post(`${API}/sync/employees`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("API — admin can trigger employee sync", async ({ request }) => {
    const token = await adminLogin(request);
    const res = await request.post(`${API}/sync/employees`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const j = await res.json();
    expect(j.synced).toBeGreaterThan(0);
    console.log(`Synced ${j.synced} employees in ${j.elapsed_ms}ms`);
  });

  test("API — /budget/employees/search returns active employees", async ({ request }) => {
    const res = await request.get(`${API}/budget/employees/search?q=김`);
    expect(res.status()).toBe(200);
    const rows = await res.json();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r).toHaveProperty("empno");
      expect(r).toHaveProperty("name");
      expect(r).toHaveProperty("grade");
      expect(r).toHaveProperty("department");
    }
  });

  test("API — /budget/employees/search returns [] for q < 2 chars", async ({ request }) => {
    const res = await request.get(`${API}/budget/employees/search?q=김`);
    // single char still works, but empty/1-char typically returns []
    const empty = await request.get(`${API}/budget/employees/search?q=`);
    expect(empty.status()).toBe(200);
    const rows = await empty.json();
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd frontend && npx playwright test tests/task-azure-employee-sync.spec.ts --reporter=list
```

Expected: 5 passed.

- [ ] **Step 3: Full suite regression**

```bash
cd frontend && npx playwright test --reporter=line 2>&1 | tail -10
```

Expected: All tests pass (existing + 5 new = 24).

- [ ] **Step 4: Commit**

```bash
git add frontend/tests/task-azure-employee-sync.spec.ts
git commit -m "test(e2e): Playwright tests for Azure employee sync"
```

---

## Task 8: Final regression + push

- [ ] **Step 1: Backend full regression**

```bash
cd backend && pytest tests/ -v 2>&1 | tail -10
```

Expected: 14 passed (12 existing + 2 new from Task 2).

- [ ] **Step 2: Frontend full Playwright**

```bash
cd frontend && npx playwright test --reporter=line 2>&1 | tail -15
```

Expected: All green.

- [ ] **Step 3: Push**

```bash
git log --oneline -12
git push origin main
```

---

## Summary

8 tasks:
1. Tax LoS 값 확인 + sync_employees SQL 필터 추가
2. pytest unit tests for sync_employees
3. Admin guard + status endpoint for /sync/employees
4. APScheduler daily 06:05 KST employee sync
5. Rewrite /budget/employees/search (Postgres-only)
6. Initial manual sync + validation
7. Playwright E2E tests
8. Final regression + push

**Expected commits**: 6~7 (Task 6 is operational, Task 8 is just push).

**PDCA mapping**:
- **Plan**: this doc + spec
- **Do**: Task 1, 3, 4, 5
- **Check**: Task 2 pytest, Task 6 manual, Task 7 Playwright, Task 8 regression
- **Act**: Task 8 push + next day 06:05 log check
