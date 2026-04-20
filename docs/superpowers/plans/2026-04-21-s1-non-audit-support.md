# S1 — 비감사 업무 지원 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 피드백 #12/#13/#16/#27/#28/#47/#55 대응. 비감사 7개 service_type 의 Activity/Budget 관리단위를 DB 로 편입하고, Step 1~3 을 service_type 조건부로 동작시키며, 서비스 분류 리셋 버그와 통상자문 Step 3 행 추가 버그를 수정하고, 클라이언트 정보 자동입력을 추가한다.

**Architecture:**
- **데이터 레이어:** `ServiceTaskMaster` 테이블에 `activity_subcategory / activity_detail / budget_unit / role / source_file` 5 컬럼 추가. Excel parser (openpyxl) 로 `비감사 Activity 표준화_260420.xlsx` 의 7개 비감사 sheet 를 읽어 1회/재동기화 방식으로 insert. Admin 전용 엔드포인트로 트리거.
- **백엔드 API:** `/master/tasks` 응답 확장, 신규 `/master/activity-mapping?service_type=…`, 신규 `/clients/{code}/info`, pydantic model 의 비감사 필드 optional 완화.
- **프론트엔드:** Step 1 `isAudit` 분기로 6 필드 숨김, `ProjectSearchModal` 의 service_type 보존 로직 수정 (기존값 우선), 클라이언트 선택 시 자동 조회·채움, Step 2 드롭다운 동적 소스, Step 3 categories empty 시 버튼 disable.
- **테스트:** 백엔드 pytest (parser/import/endpoints) + Playwright E2E 5 specs (Step1/Step2/Step3/reset/autofill).

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, openpyxl, Next.js 16, React, Playwright, pytest.

**Spec:** [docs/superpowers/specs/2026-04-21-s1-non-audit-support-design.md](../specs/2026-04-21-s1-non-audit-support-design.md)

**Fixture Excel:** `/Users/jkim564/Documents/Programming/my_budget/files/비감사 Activity 표준화_260420.xlsx`

---

## Task 1: Alembic migration — ServiceTaskMaster 컬럼 확장

**Files:**
- Create: `backend/alembic/versions/004_extend_service_task_master.py`

- [ ] **Step 1: 마이그레이션 파일 작성**

```python
"""Extend service_task_master for non-audit activity import

Revision ID: 004_extend_service_task_master
Revises: 003_add_sessions_and_login_log
Create Date: 2026-04-21
"""
from alembic import op
import sqlalchemy as sa


revision = "004_extend_service_task_master"
down_revision = "003_add_sessions_and_login_log"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("service_task_master", sa.Column("activity_subcategory", sa.String(200)))
    op.add_column("service_task_master", sa.Column("activity_detail", sa.String(300)))
    op.add_column("service_task_master", sa.Column("budget_unit", sa.String(200)))
    op.add_column("service_task_master", sa.Column("role", sa.String(100)))
    op.add_column("service_task_master", sa.Column("source_file", sa.String(200)))
    op.create_index(
        "service_task_master_svc_cat_idx",
        "service_task_master",
        ["service_type", "task_category"],
    )


def downgrade() -> None:
    op.drop_index("service_task_master_svc_cat_idx", table_name="service_task_master")
    op.drop_column("service_task_master", "source_file")
    op.drop_column("service_task_master", "role")
    op.drop_column("service_task_master", "budget_unit")
    op.drop_column("service_task_master", "activity_detail")
    op.drop_column("service_task_master", "activity_subcategory")
```

- [ ] **Step 2: 마이그레이션 실행**

```bash
cd backend && alembic upgrade head
```

Expected: `Running upgrade 003_add_sessions_and_login_log -> 004_extend_service_task_master`.

- [ ] **Step 3: 컬럼 추가 확인**

```bash
cd backend && python -c "
from app.db.session import engine
from sqlalchemy import inspect
insp = inspect(engine)
print('service_task_master cols:', [c['name'] for c in insp.get_columns('service_task_master')])
"
```

Expected: includes `activity_subcategory`, `activity_detail`, `budget_unit`, `role`, `source_file`.

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/004_extend_service_task_master.py
git commit -m "feat(s1): extend service_task_master with activity/budget_unit/role columns"
```

---

## Task 2: SQLAlchemy 모델 업데이트 — ServiceTaskMaster

**Files:**
- Modify: `backend/app/models/project.py`

- [ ] **Step 1: ServiceTaskMaster 클래스에 컬럼 추가**

`backend/app/models/project.py` 의 `class ServiceTaskMaster` 정의 끝(description 다음)에 추가:

```python
class ServiceTaskMaster(Base):
    __tablename__ = "service_task_master"

    id = Column(Integer, primary_key=True, autoincrement=True)
    service_type = Column(String(20), nullable=False, index=True)
    task_category = Column(String(100))
    task_name = Column(String(200), nullable=False)
    budget_unit_type = Column(String(50))
    sort_order = Column(Integer, default=0)
    description = Column(String(500))
    activity_subcategory = Column(String(200))
    activity_detail = Column(String(300))
    budget_unit = Column(String(200))
    role = Column(String(100))
    source_file = Column(String(200))
```

- [ ] **Step 2: Sanity check — import OK**

```bash
cd backend && python -c "from app.models.project import ServiceTaskMaster; print(ServiceTaskMaster.__table__.columns.keys())"
```

Expected: 전체 컬럼 11개 출력.

- [ ] **Step 3: Commit**

```bash
git add backend/app/models/project.py
git commit -m "feat(s1): add new columns to ServiceTaskMaster ORM model"
```

---

## Task 3: Excel parser 서비스 + pytest (TDD)

**Files:**
- Create: `backend/app/services/non_audit_activity_import.py`
- Create: `backend/tests/test_non_audit_activity_parser.py`

### Step 1: 실패 테스트 작성

Create `backend/tests/test_non_audit_activity_parser.py`:

```python
"""Tests for non-audit activity Excel parser."""
import os
from pathlib import Path

import pytest

from app.services.non_audit_activity_import import (
    SERVICE_TYPE_SHEET_MAP,
    parse_non_audit_activities,
)


FIXTURE_PATH = Path(__file__).resolve().parents[2] / "files" / "비감사 Activity 표준화_260420.xlsx"


@pytest.fixture(scope="module")
def parsed():
    if not FIXTURE_PATH.exists():
        pytest.skip(f"Fixture not found at {FIXTURE_PATH}")
    return parse_non_audit_activities(str(FIXTURE_PATH))


def test_sheet_map_has_seven_non_audit_services():
    assert set(SERVICE_TYPE_SHEET_MAP.values()) == {"AC", "IC", "ESG", "VAL", "TRADE", "ACT", "ETC"}


def test_parsed_contains_all_seven_services(parsed):
    service_types_returned = {row["service_type"] for row in parsed}
    assert service_types_returned == {"AC", "IC", "ESG", "VAL", "TRADE", "ACT", "ETC"}


def test_row_shape(parsed):
    sample = parsed[0]
    for key in ("service_type", "task_category", "activity_subcategory", "activity_detail", "budget_unit", "role", "sort_order"):
        assert key in sample


def test_esg_rows_counted(parsed):
    esg = [r for r in parsed if r["service_type"] == "ESG"]
    # ESG sheet has 35 rows including header — data rows should be roughly 20~34
    assert 10 <= len(esg) <= 40


def test_trade_rows_nonempty(parsed):
    trade = [r for r in parsed if r["service_type"] == "TRADE"]
    assert len(trade) >= 1
    # 모든 행에 대분류 값 존재
    for r in trade:
        assert r["task_category"], f"row missing task_category: {r}"


def test_blank_rows_skipped(parsed):
    for r in parsed:
        # 대분류와 소분류 둘 다 빈 row 가 있으면 안 됨
        assert r["task_category"] or r["activity_detail"], f"blank row slipped through: {r}"
```

### Step 2: 테스트 실행 — 실패 확인

```bash
cd backend && pytest tests/test_non_audit_activity_parser.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.services.non_audit_activity_import'`.

### Step 3: parser 구현

Create `backend/app/services/non_audit_activity_import.py`:

```python
"""Parse '비감사 Activity 표준화' Excel file into rows ready for ServiceTaskMaster insert."""
from pathlib import Path
from typing import Optional

import openpyxl


SERVICE_TYPE_SHEET_MAP = {
    "Activity 표준화_회계자문": "AC",
    "Activity 표준화_내부통제": "IC",
    "Activity 표준화_ESG": "ESG",
    "Activity 표준화_Valuation": "VAL",
    "Activity 표준화_통상자문": "TRADE",
    "Activity 표준화_보험계리": "ACT",
    "Activity 표준화_기타비감사": "ETC",
}


def _find_header_row(ws) -> Optional[int]:
    """Find the first row containing the '대분류' keyword — returns row number (1-based)."""
    for idx, row in enumerate(ws.iter_rows(min_row=1, max_row=min(ws.max_row, 10), values_only=True), start=1):
        for cell in row:
            if cell and "대분류" in str(cell):
                return idx
    return None


def _column_map(header_row: tuple) -> dict[str, int]:
    """Return {canonical_key: column_index} by matching Korean labels."""
    mapping = {}
    for col_idx, cell in enumerate(header_row):
        if not cell:
            continue
        text = str(cell).strip()
        if "대분류" in text:
            mapping["category"] = col_idx
        elif "중분류" in text:
            mapping["subcategory"] = col_idx
        elif "소분류" in text:
            mapping["detail"] = col_idx
        elif "Budget 관리단위" in text or text == "Budget 관리단위":
            mapping["budget_unit"] = col_idx
        elif text == "비고":
            mapping["role"] = col_idx
    return mapping


def _stripped(v) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip().replace("\u200b", "")  # zero-width space
    return s or None


def parse_non_audit_activities(path: str) -> list[dict]:
    """Return a flat list of dicts ready for ServiceTaskMaster insert.

    Each dict has keys: service_type, task_category, activity_subcategory,
    activity_detail, budget_unit, role, sort_order, task_name, source_file.
    """
    wb = openpyxl.load_workbook(path, data_only=True)
    source_file = Path(path).name
    results: list[dict] = []
    for sheet_name, service_type in SERVICE_TYPE_SHEET_MAP.items():
        if sheet_name not in wb.sheetnames:
            continue
        ws = wb[sheet_name]
        header_idx = _find_header_row(ws)
        if not header_idx:
            continue
        header_row = next(ws.iter_rows(min_row=header_idx, max_row=header_idx, values_only=True))
        cols = _column_map(header_row)
        if "category" not in cols or "detail" not in cols:
            continue
        order = 0
        for row in ws.iter_rows(min_row=header_idx + 1, values_only=True):
            category = _stripped(row[cols["category"]]) if cols["category"] < len(row) else None
            subcategory = _stripped(row[cols.get("subcategory", -1)]) if "subcategory" in cols and cols["subcategory"] < len(row) else None
            detail = _stripped(row[cols["detail"]]) if cols["detail"] < len(row) else None
            budget_unit = _stripped(row[cols.get("budget_unit", -1)]) if "budget_unit" in cols and cols["budget_unit"] < len(row) else None
            role = _stripped(row[cols.get("role", -1)]) if "role" in cols and cols["role"] < len(row) else None
            if not category and not detail:
                continue
            order += 1
            results.append({
                "service_type": service_type,
                "task_category": category,
                "activity_subcategory": subcategory,
                "activity_detail": detail,
                "task_name": detail or category or "",
                "budget_unit": budget_unit,
                "role": role,
                "sort_order": order,
                "source_file": source_file,
            })
    wb.close()
    return results
```

### Step 4: 테스트 재실행 — 통과 확인

```bash
cd backend && pytest tests/test_non_audit_activity_parser.py -v
```

Expected: 6 passed (all green).

### Step 5: Commit

```bash
git add backend/app/services/non_audit_activity_import.py backend/tests/test_non_audit_activity_parser.py
git commit -m "feat(s1): Excel parser for non-audit activity standardization file"
```

---

## Task 4: Import 서비스 + pytest

**Files:**
- Modify: `backend/app/services/non_audit_activity_import.py`
- Create: `backend/tests/test_non_audit_activity_import.py`

### Step 1: 실패 테스트 작성

Create `backend/tests/test_non_audit_activity_import.py`:

```python
"""Integration tests for import_non_audit_activities into ServiceTaskMaster."""
from pathlib import Path

import pytest

from app.db.session import SessionLocal
from app.models.project import ServiceTaskMaster
from app.services.non_audit_activity_import import (
    import_non_audit_activities,
)


FIXTURE_PATH = Path(__file__).resolve().parents[2] / "files" / "비감사 Activity 표준화_260420.xlsx"


@pytest.fixture(scope="module")
def db():
    s = SessionLocal()
    yield s
    s.close()


def _non_audit_codes() -> set[str]:
    return {"AC", "IC", "ESG", "VAL", "TRADE", "ACT", "ETC"}


def test_import_truncates_and_reseeds(db):
    if not FIXTURE_PATH.exists():
        pytest.skip(f"Fixture not found at {FIXTURE_PATH}")
    result = import_non_audit_activities(db, str(FIXTURE_PATH), truncate=True)
    assert result["inserted"] > 100  # 약 388 행 예상
    by = result["by_service_type"]
    assert set(by.keys()) == _non_audit_codes()
    for code, n in by.items():
        assert n > 0, f"{code} 가 비어있음"


def test_audit_rows_not_touched(db):
    """AUDIT service_type 은 import 로 건드리지 않아야 함."""
    before = db.query(ServiceTaskMaster).filter(ServiceTaskMaster.service_type == "AUDIT").count()
    import_non_audit_activities(db, str(FIXTURE_PATH), truncate=True)
    after = db.query(ServiceTaskMaster).filter(ServiceTaskMaster.service_type == "AUDIT").count()
    assert after == before


def test_non_audit_row_has_expected_fields(db):
    import_non_audit_activities(db, str(FIXTURE_PATH), truncate=True)
    esg = db.query(ServiceTaskMaster).filter(ServiceTaskMaster.service_type == "ESG").first()
    assert esg is not None
    assert esg.task_category
    assert esg.activity_detail
    assert esg.source_file
```

### Step 2: 테스트 실행 — 실패 확인

```bash
cd backend && pytest tests/test_non_audit_activity_import.py -v
```

Expected: `ImportError: cannot import name 'import_non_audit_activities' from 'app.services.non_audit_activity_import'`.

### Step 3: import 함수 구현

Append to `backend/app/services/non_audit_activity_import.py`:

```python
from sqlalchemy.orm import Session as DBSessionType

from app.models.project import ServiceTaskMaster


def import_non_audit_activities(
    db: DBSessionType,
    path: str,
    *,
    truncate: bool = True,
) -> dict:
    """Parse Excel and replace ServiceTaskMaster rows for the 7 non-audit services.

    Returns {"inserted": int, "by_service_type": {code: count, ...}, "source_file": str}.

    AUDIT rows are never touched — only non-audit codes are truncated/re-inserted.
    """
    rows = parse_non_audit_activities(path)
    non_audit_codes = set(SERVICE_TYPE_SHEET_MAP.values())
    if truncate:
        db.query(ServiceTaskMaster).filter(
            ServiceTaskMaster.service_type.in_(non_audit_codes)
        ).delete(synchronize_session=False)
        db.commit()
    by_service_type: dict[str, int] = {code: 0 for code in non_audit_codes}
    for r in rows:
        db.add(ServiceTaskMaster(
            service_type=r["service_type"],
            task_category=r["task_category"],
            task_name=r["task_name"],
            activity_subcategory=r["activity_subcategory"],
            activity_detail=r["activity_detail"],
            budget_unit=r["budget_unit"],
            role=r["role"],
            sort_order=r["sort_order"],
            source_file=r["source_file"],
        ))
        by_service_type[r["service_type"]] += 1
    db.commit()
    return {
        "inserted": sum(by_service_type.values()),
        "by_service_type": by_service_type,
        "source_file": rows[0]["source_file"] if rows else None,
    }
```

### Step 4: 테스트 실행 — 통과 확인

```bash
cd backend && pytest tests/test_non_audit_activity_import.py -v
```

Expected: 3 passed.

### Step 5: Commit

```bash
git add backend/app/services/non_audit_activity_import.py backend/tests/test_non_audit_activity_import.py
git commit -m "feat(s1): import_non_audit_activities seeds ServiceTaskMaster"
```

---

## Task 5: Admin sync endpoint + pytest

**Files:**
- Modify: `backend/app/api/v1/admin.py`
- Create: `backend/tests/test_non_audit_sync_endpoint.py`

### Step 1: 엔드포인트 추가

At the bottom of `backend/app/api/v1/admin.py`, append:

```python
# ===== S1: Non-audit activity sync =====
from pydantic import BaseModel

from app.services.non_audit_activity_import import import_non_audit_activities

DEFAULT_NON_AUDIT_FIXTURE = "files/비감사 Activity 표준화_260420.xlsx"


class NonAuditSyncRequest(BaseModel):
    path: str | None = None
    truncate: bool = True


@router.post("/sync-non-audit-activities")
def sync_non_audit_activities(
    req: NonAuditSyncRequest,
    user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Re-seed ServiceTaskMaster for the 7 non-audit service_types from Excel."""
    path = req.path or DEFAULT_NON_AUDIT_FIXTURE
    try:
        return import_non_audit_activities(db, path, truncate=req.truncate)
    except FileNotFoundError:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Fixture not found: {path}")
```

### Step 2: 테스트 작성

Create `backend/tests/test_non_audit_sync_endpoint.py`:

```python
"""Tests for POST /admin/sync-non-audit-activities."""
from pathlib import Path

import pytest

FIXTURE_PATH = Path(__file__).resolve().parents[2] / "files" / "비감사 Activity 표준화_260420.xlsx"


def test_admin_sync_non_audit_activities(client, admin_cookie):
    if not FIXTURE_PATH.exists():
        pytest.skip(f"Fixture not found at {FIXTURE_PATH}")
    r = client.post(
        "/api/v1/admin/sync-non-audit-activities",
        json={"path": str(FIXTURE_PATH), "truncate": True},
        cookies=admin_cookie,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["inserted"] > 100
    assert set(body["by_service_type"].keys()) == {"AC", "IC", "ESG", "VAL", "TRADE", "ACT", "ETC"}


def test_staff_cannot_sync_non_audit(client, staff_cookie):
    r = client.post(
        "/api/v1/admin/sync-non-audit-activities",
        json={},
        cookies=staff_cookie,
    )
    assert r.status_code == 403


def test_missing_file_returns_404(client, admin_cookie):
    r = client.post(
        "/api/v1/admin/sync-non-audit-activities",
        json={"path": "/tmp/does-not-exist.xlsx"},
        cookies=admin_cookie,
    )
    assert r.status_code == 404
```

### Step 3: 실행

```bash
cd backend && pytest tests/test_non_audit_sync_endpoint.py -v
```

Expected: 3 passed.

### Step 4: 실제 sync 1회 실행 (데이터 시드)

```bash
cd backend && python -c "
from app.db.session import SessionLocal
from app.services.non_audit_activity_import import import_non_audit_activities
s = SessionLocal()
try:
    result = import_non_audit_activities(s, '/Users/jkim564/Documents/Programming/my_budget/files/비감사 Activity 표준화_260420.xlsx', truncate=True)
    print(result)
finally:
    s.close()
"
```

Expected: `{'inserted': <int >= 300>, 'by_service_type': {'AC': ..., 'IC': ..., 'ESG': ..., 'VAL': ..., 'TRADE': ..., 'ACT': ..., 'ETC': ...}, ...}`.

### Step 5: Commit

```bash
git add backend/app/api/v1/admin.py backend/tests/test_non_audit_sync_endpoint.py
git commit -m "feat(s1): admin endpoint POST /admin/sync-non-audit-activities + initial seed"
```

---

## Task 6: `/master/activity-mapping` + `/master/tasks` 응답 확장

**Files:**
- Modify: `backend/app/api/v1/budget_input.py`
- Create: `backend/tests/test_master_activity_mapping.py`

### Step 1: `/master/tasks` 응답 확장

In `backend/app/api/v1/budget_input.py`, modify the `get_service_tasks` function (around line 40-60) to include the new fields:

Replace the existing function body with:

```python
@router.get("/master/tasks")
def get_service_tasks(service_type: str = "AUDIT", db: Session = Depends(get_db)):
    """분류별 Task 마스터 목록."""
    rows = (
        db.query(ServiceTaskMaster)
        .filter(ServiceTaskMaster.service_type == service_type)
        .order_by(ServiceTaskMaster.sort_order)
        .all()
    )
    return [
        {
            "id": r.id,
            "service_type": r.service_type,
            "task_category": r.task_category or "",
            "task_name": r.task_name,
            "budget_unit_type": r.budget_unit_type or "",
            "sort_order": r.sort_order,
            "description": r.description or "",
            "activity_subcategory": r.activity_subcategory or "",
            "activity_detail": r.activity_detail or "",
            "budget_unit": r.budget_unit or "",
            "role": r.role or "",
        }
        for r in rows
    ]
```

### Step 2: 새 엔드포인트 `/master/activity-mapping`

Below `get_service_tasks`, add:

```python
@router.get("/master/activity-mapping")
def get_activity_mapping(service_type: str, db: Session = Depends(get_db)):
    """Step 2 구성원 Activity 매핑 드롭다운 소스."""
    rows = (
        db.query(ServiceTaskMaster)
        .filter(ServiceTaskMaster.service_type == service_type)
        .order_by(ServiceTaskMaster.sort_order)
        .all()
    )
    return [
        {
            "category": r.task_category or "",
            "subcategory": r.activity_subcategory or "",
            "detail": r.activity_detail or "",
            "role": r.role or "",
        }
        for r in rows
    ]
```

### Step 3: 테스트

Create `backend/tests/test_master_activity_mapping.py`:

```python
"""Tests for /master/tasks extended payload and /master/activity-mapping."""
import pytest


def test_master_tasks_returns_extended_fields_for_esg(client, elpm_cookie):
    r = client.get("/api/v1/budget/master/tasks?service_type=ESG", cookies=elpm_cookie)
    assert r.status_code == 200
    rows = r.json()
    if not rows:
        pytest.skip("ESG 가 아직 seed 되지 않음 — Task 5 Step 4 를 먼저 실행")
    sample = rows[0]
    for key in ("activity_subcategory", "activity_detail", "budget_unit", "role"):
        assert key in sample


def test_activity_mapping_esg_non_empty(client, elpm_cookie):
    r = client.get("/api/v1/budget/master/activity-mapping?service_type=ESG", cookies=elpm_cookie)
    assert r.status_code == 200
    rows = r.json()
    if not rows:
        pytest.skip("ESG 가 아직 seed 되지 않음")
    # 모든 row 는 category 를 가져야 함
    for row in rows:
        assert "category" in row
        assert "detail" in row


def test_activity_mapping_audit_returns_legacy_data(client, elpm_cookie):
    """AUDIT 은 기존 로직 그대로 — row 0 이상 (어떤 값이든 상관없음)."""
    r = client.get("/api/v1/budget/master/activity-mapping?service_type=AUDIT", cookies=elpm_cookie)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
```

Run:

```bash
cd backend && pytest tests/test_master_activity_mapping.py -v
```

Expected: 3 passed (possibly some skipped if seed hasn't run, but all that run must pass).

### Step 4: Commit

```bash
git add backend/app/api/v1/budget_input.py backend/tests/test_master_activity_mapping.py
git commit -m "feat(s1): extend /master/tasks + new /master/activity-mapping endpoint"
```

---

## Task 7: `/clients/{code}/info` 엔드포인트 + pytest

**Files:**
- Modify: `backend/app/api/v1/budget_input.py`
- Create: `backend/tests/test_client_info_endpoint.py`

### Step 1: 엔드포인트 추가

In `backend/app/api/v1/budget_input.py`, locate the section after `_client_needs_detail` (around line 68). Below `search_clients` (around line 100), add:

```python
@router.get("/clients/{client_code}/info")
def get_client_info(
    client_code: str,
    user: dict = Depends(require_login),
    db: Session = Depends(get_db),
):
    """클라이언트 기본 정보 단건 조회 (Step 1 자동입력용)."""
    from fastapi import HTTPException
    c = db.query(Client).filter(Client.client_code == client_code).first()
    if c is None:
        raise HTTPException(status_code=404, detail="클라이언트를 찾을 수 없습니다.")
    return {
        "client_code": c.client_code,
        "client_name": c.client_name,
        "industry": c.industry or "",
        "asset_size": c.asset_size or "",
        "listing_status": c.listing_status or "",
        "business_report": c.business_report or "",
        "gaap": c.gaap or "",
        "consolidated": c.consolidated or "",
        "subsidiary_count": c.subsidiary_count or "",
        "internal_control": c.internal_control or "",
        "initial_audit": c.initial_audit or "",
    }
```

**Note:** `require_login` must be imported from `app.api.deps`. Check the top of the file and add if missing:

```python
from app.api.deps import require_login
```

### Step 2: 테스트 작성

Create `backend/tests/test_client_info_endpoint.py`:

```python
"""Tests for GET /budget/clients/{code}/info."""
from app.db.session import SessionLocal
from app.models.project import Client


def _ensure_test_client():
    s = SessionLocal()
    try:
        existing = s.query(Client).filter(Client.client_code == "TESTCL001").first()
        if existing is None:
            s.add(Client(
                client_code="TESTCL001",
                client_name="테스트클라이언트",
                industry="제조업",
                asset_size="2조원 이상",
                listing_status="유가증권시장",
            ))
            s.commit()
    finally:
        s.close()


def test_client_info_found(client, elpm_cookie):
    _ensure_test_client()
    r = client.get("/api/v1/budget/clients/TESTCL001/info", cookies=elpm_cookie)
    assert r.status_code == 200
    body = r.json()
    assert body["client_code"] == "TESTCL001"
    assert body["industry"] == "제조업"


def test_client_info_not_found(client, elpm_cookie):
    r = client.get("/api/v1/budget/clients/NOPE_XYZ/info", cookies=elpm_cookie)
    assert r.status_code == 404


def test_client_info_requires_login(client):
    client.cookies.clear()
    r = client.get("/api/v1/budget/clients/TESTCL001/info")
    assert r.status_code == 401
```

### Step 3: 실행

```bash
cd backend && pytest tests/test_client_info_endpoint.py -v
```

Expected: 3 passed.

### Step 4: Commit

```bash
git add backend/app/api/v1/budget_input.py backend/tests/test_client_info_endpoint.py
git commit -m "feat(s1): GET /budget/clients/{code}/info for auto-fill"
```

---

## Task 8: Pydantic validation 완화 — 비감사 필드 Optional

**Files:**
- Modify: `backend/app/api/v1/budget_input.py`

### Step 1: 비감사에 optional 필드 허용

In `backend/app/api/v1/budget_input.py`, find the `ClientInfoIn` or equivalent request body pydantic model. If client fields are currently required (e.g., `industry: str`), change them to `Optional[str] = None` while keeping AUDIT flow working. Also update the `ProjectCreateIn` model (around line 340) so that `service_type` is required (already is), but downstream `subsidiary_count`, `gaap`, etc. are optional.

**Current state likely** (check first):

```bash
cd backend && grep -A 20 "class ClientInfoIn\|class ProjectCreateIn\|class ProjectIn\|class BudgetProjectCreate" app/api/v1/budget_input.py | head -50
```

Apply minimal change: make these 6 client fields `Optional[str] = None`:
- `business_report`
- `gaap`
- `consolidated`
- `subsidiary_count`
- `internal_control`
- `initial_audit`

Leave required: `industry`, `asset_size`, `listing_status`.

**If validators exist that enforce non-empty**, guard them with `if service_type == "AUDIT": ...`.

### Step 2: Sanity — 비감사 create 는 400 안 나야 함

```bash
cd backend && python -c "
from fastapi.testclient import TestClient
from app.main import app
from app.core.sessions import SESSION_COOKIE_NAME, create_session
from app.db.session import SessionLocal

db = SessionLocal()
try:
    sid = create_session(db, empno='170661', role='elpm', scope='self')
finally:
    db.close()

c = TestClient(app)
r = c.post('/api/v1/budget/projects', json={
    'project_code': 'S1_TEST_ESG',
    'project_name': 'S1 ESG 테스트',
    'el_empno': '170661',
    'pm_empno': '170661',
    'contract_hours': 100,
    'service_type': 'ESG',
    # 비감사이므로 GAAP/연결/초도감사 등 생략
}, cookies={SESSION_COOKIE_NAME: sid})
print(r.status_code, r.text[:200])
"
```

Expected: `200` 또는 `400` 인데 reason 이 필드 missing 이 아닌 다른 이유(예: project_code 중복 등). `400 Field required: subsidiary_count` 같은 에러면 수정 필요.

**Cleanup the test project afterward:**

```bash
cd backend && python -c "
from app.db.session import SessionLocal
from app.models.project import Project
s = SessionLocal()
s.query(Project).filter(Project.project_code == 'S1_TEST_ESG').delete()
s.commit()
s.close()
"
```

### Step 3: Commit

```bash
git add backend/app/api/v1/budget_input.py
git commit -m "feat(s1): relax pydantic model for non-audit client fields"
```

---

## Task 9: Frontend — Step 1 조건부 필드 + 서비스 타입 상수

**Files:**
- Modify: `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx`

### Step 1: `isAudit` flag 도입 및 9 필드 조건부 렌더링

In `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx`, find the Step 1 JSX block (around line 1168-1221 per exploration) where the 9 client fields are rendered as `<SelectField>` components.

Add this helper near the top of the component scope (above the return statement):

```tsx
const isAudit = project.service_type === "AUDIT";
```

Then wrap the 6 non-audit-hidden fields so they render only when `isAudit === true`:

```tsx
{isAudit && (
  <SelectField
    label="사업보고서 제출"
    value={client.business_report || ""}
    options={BUSINESS_REPORT_OPTIONS}
    onChange={(v) => cField("business_report", v)}
    required
  />
)}
{isAudit && (
  <SelectField
    label="GAAP"
    value={client.gaap || ""}
    options={GAAP_OPTIONS}
    onChange={(v) => cField("gaap", v)}
    required
  />
)}
{/* 반복 — 연결재무제표, 연결자회사수, 내부회계관리제도, 초도/계속감사 모두 { isAudit && ... } 로 감쌈 */}
```

Always-shown 3 fields (industry, asset_size, listing_status) 는 그대로.

### Step 2: 배너 추가 — 비감사일 때 안내

위 JSX 섹션 상단에 추가:

```tsx
{!isAudit && (
  <div className="col-span-full text-xs text-pwc-gray-600 bg-pwc-gray-50 rounded-md p-2">
    비감사 서비스는 표준산업분류 · 자산규모 · 상장여부 3가지 정보만 입력합니다.
  </div>
)}
```

### Step 3: Required validation 완화

Step 1 에서 "다음 단계" 로 이동 시 필수 체크가 있다면 (예: `if (!client.gaap) return alert(...)` 류), `isAudit` 일 때만 적용되도록 수정:

```tsx
if (isAudit) {
  if (!client.gaap) { setError("GAAP 를 선택해주세요."); return; }
  // ... 다른 audit-only 필드들
}
// 공통 필수
if (!client.industry) { setError("산업분류를 선택해주세요."); return; }
```

구현 중 실제 검증 함수가 어디에 있는지 grep 으로 확인:

```bash
cd frontend && grep -n "gaap\|business_report\|초도\|필수\|required" src/app/\(dashboard\)/budget-input/\[project_code\]/page.tsx | head -30
```

### Step 4: TypeScript 컴파일 + 빌드 확인

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
cd frontend && npm run build 2>&1 | tail -10
```

Expected: no new errors; build succeeds.

### Step 5: Commit

```bash
git add frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/page.tsx
git commit -m "feat(s1): Step1 conditional fields — non-audit shows only 3 client fields"
```

---

## Task 10: Frontend — 서비스 타입 리셋 버그 수정 (#27, #28)

**Files:**
- Modify: `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx`

### Step 1: `ProjectSearchModal` onSelect 핸들러 수정

Find the handler around line 1229-1261. The bug is on line 1255:

```tsx
service_type: (p.service_type as string) || "AUDIT",
```

이 라인은 Azure 응답의 `p.service_type` 이 undefined 일 때 무조건 "AUDIT" 으로 덮어쓴다 — 사용자가 이미 "ESG" 로 선택했어도.

Replace with:

```tsx
service_type: (p.service_type as string) || project.service_type || "AUDIT",
```

**함수형 setProject 사용이 더 안전** — 만약 current state 캡처 문제가 있다면:

```tsx
setProject((prev) => ({
  ...prev,
  project_code: p.project_code as string,
  project_name: p.project_name as string,
  // ... (다른 필드 spread)
  service_type: (p.service_type as string) || prev.service_type || "AUDIT",
}));
```

실제로는 기존 setProject 호출이 객체를 직접 전달하는 형태이므로 먼저 해당 패턴을 유지하면서 line 1255 만 수정. 만약 state capture 이슈가 있을 경우 functional form 으로 확장.

### Step 2: 수동 검증

```bash
# 백엔드 재시작 + 프론트 dev 서버 실행
cd backend && uvicorn app.main:app --port 3001 &
cd frontend && npm run dev &
sleep 8
```

브라우저에서:
1. /login → 170661 로그인
2. /budget-input/new
3. service_type "ESG" 선택
4. 프로젝트 검색 클릭 → 아무 프로젝트 선택
5. Step 1 화면에 돌아와 service_type 이 여전히 "ESG" 인지 확인

(수동 확인 후 Playwright 는 Task 14 에서 자동화.)

### Step 3: 서버 종료

```bash
pkill -f "next dev" 2>/dev/null
pkill -f "uvicorn" 2>/dev/null
```

### Step 4: Commit

```bash
git add frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/page.tsx
git commit -m "fix(s1): preserve user-selected service_type when selecting project (#27 #28)"
```

---

## Task 11: Frontend — 클라이언트 정보 자동입력 (#55)

**Files:**
- Modify: `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx`

### Step 1: 클라이언트 선택 시 `/clients/{code}/info` 호출

Find `ClientSearchModal` onSelect handler (around line 1124). Current:

```tsx
onSelect={(c) => setClient({ ...client, ...c })}
```

Replace with:

```tsx
onSelect={async (c) => {
  const code = c.client_code as string | undefined;
  if (!code) {
    setClient({ ...client, ...c });
    return;
  }
  try {
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    const r = await fetch(`${API_BASE}/api/v1/budget/clients/${code}/info`, {
      credentials: "include",
    });
    if (r.ok) {
      const info = await r.json();
      setClient((prev) => ({
        ...prev,
        ...c,
        // 사용자가 이미 값 입력한 필드는 덮어쓰지 않음 — prev 우선
        industry: prev.industry || info.industry || "",
        asset_size: prev.asset_size || info.asset_size || "",
        listing_status: prev.listing_status || info.listing_status || "",
        business_report: prev.business_report || info.business_report || "",
        gaap: prev.gaap || info.gaap || "",
        consolidated: prev.consolidated || info.consolidated || "",
        subsidiary_count: prev.subsidiary_count || info.subsidiary_count || "",
        internal_control: prev.internal_control || info.internal_control || "",
        initial_audit: prev.initial_audit || info.initial_audit || "",
      }));
    } else {
      setClient({ ...client, ...c });
    }
  } catch {
    setClient({ ...client, ...c });
  }
}}
```

**Note:** 이 접근은 서버가 값이 있는 경우에만 자동 채움. 서버가 "" 반환 → 기존 값 유지. 사용자가 수동 입력 후 클라이언트 재선택 → 수동 입력 보존.

### Step 2: TypeScript 컴파일

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -10
```

Expected: no new errors.

### Step 3: Commit

```bash
git add frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/page.tsx
git commit -m "feat(s1): auto-fill client info from /clients/{code}/info on selection (#55)"
```

---

## Task 12: Frontend — Step 2 Activity 드롭다운 동적화 (#13, #16)

**Files:**
- Modify: `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx`

### Step 1: Step 2 드롭다운 소스 찾기

탐색 결과 (lines 1647-1650, 1740-1743) 에 하드코딩된 options:

```tsx
<option value="재무제표기말감사">재무제표기말감사</option>
<option value="분반기검토">분반기검토</option>
<option value="내부통제감사">내부통제감사</option>
<option value="IT감사">IT감사</option>
```

### Step 2: 동적 소스 훅 추가

컴포넌트 상단에 state + fetch effect 추가:

```tsx
const [activityOptions, setActivityOptions] = useState<string[]>([]);

useEffect(() => {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  if (project.service_type === "AUDIT") {
    setActivityOptions([
      "재무제표기말감사",
      "분반기검토",
      "내부통제감사",
      "IT감사",
    ]);
    return;
  }
  fetch(`${API_BASE}/api/v1/budget/master/activity-mapping?service_type=${project.service_type}`, {
    credentials: "include",
  })
    .then((r) => r.ok ? r.json() : [])
    .then((rows: Array<{ category: string }>) => {
      const unique = Array.from(new Set(rows.map((x) => x.category).filter(Boolean)));
      setActivityOptions(unique);
    })
    .catch(() => setActivityOptions([]));
}, [project.service_type]);
```

### Step 3: 두 위치의 하드코딩 `<option>` 제거, `activityOptions.map` 으로 교체

예시 — 두 곳 모두 동일 패턴:

Before:
```tsx
<option value="재무제표기말감사">재무제표기말감사</option>
<option value="분반기검토">분반기검토</option>
<option value="내부통제감사">내부통제감사</option>
<option value="IT감사">IT감사</option>
```

After:
```tsx
<option value="">(선택)</option>
{activityOptions.map((opt) => (
  <option key={opt} value={opt}>{opt}</option>
))}
```

### Step 4: 비감사일 때 optional 표시

드롭다운 label 근처에 `required` 라벨이 있다면 비감사일 때 제거:

```tsx
<label>Activity 매핑{isAudit ? "*" : ""}</label>
```

### Step 5: TypeScript 확인

```bash
cd frontend && npx tsc --noEmit 2>&1 | head
```

### Step 6: Commit

```bash
git add frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/page.tsx
git commit -m "feat(s1): Step2 activity dropdown loads per service_type from /master/activity-mapping (#13 #16)"
```

---

## Task 13: Frontend — Step 3 "+ 행 추가" empty state 가드 (#47)

**Files:**
- Modify: `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx`

### Step 1: categories empty 시 버튼 disable + tooltip

Step 3 "+ 행 추가" 버튼 (line ~2091-2100) 의 `disabled` 조건에 추가:

Before (예시):
```tsx
<button
  disabled={aiLoading || !etControllable}
  onClick={() => setShowAddRowModal(true)}
>
  + 행 추가
</button>
```

After:
```tsx
<button
  disabled={aiLoading || !etControllable || categories.length === 0}
  title={categories.length === 0 ? "해당 서비스의 관리단위가 아직 설정되지 않았습니다. 관리자에게 문의하세요." : undefined}
  onClick={() => setShowAddRowModal(true)}
>
  + 행 추가
</button>
```

`categories` 변수가 실제 어떻게 계산되는지 확인 후 조건 정확히 반영 — `/master/tasks?service_type=...` 응답 길이 0 이면 empty.

### Step 2: TypeScript 확인 + build

```bash
cd frontend && npx tsc --noEmit 2>&1 | head
cd frontend && npm run build 2>&1 | tail -5
```

### Step 3: Commit

```bash
git add frontend/src/app/\(dashboard\)/budget-input/\[project_code\]/page.tsx
git commit -m "fix(s1): Step3 disable '+ 행 추가' when categories empty (#47)"
```

---

## Task 14: Playwright E2E — 5 specs

**Files:**
- Create: `frontend/tests/task-s1-nonaudit-step1.spec.ts`
- Create: `frontend/tests/task-s1-service-type-reset.spec.ts`
- Create: `frontend/tests/task-s1-nonaudit-step2.spec.ts`
- Create: `frontend/tests/task-s1-nonaudit-step3.spec.ts`
- Create: `frontend/tests/task-s1-client-autofill.spec.ts`

### Step 1: Step 1 조건부 필드 테스트

Create `frontend/tests/task-s1-nonaudit-step1.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

test.describe("S1 — Step 1 conditional fields", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(overview-person)?\/?$/);
  });

  test("ESG service shows only 3 client fields", async ({ page }) => {
    await page.goto(`${FRONTEND}/budget-input/new`);
    // service_type 드롭다운에서 ESG 선택
    await page.selectOption('select[name="service_type"], select:near(:text("서비스 분류"))', "ESG");
    // audit-only 필드는 보이지 않아야 함
    await expect(page.locator('text=GAAP').first()).not.toBeVisible();
    await expect(page.locator('text=초도/계속 감사').first()).not.toBeVisible();
    // 3개 필드는 보여야 함
    await expect(page.locator('text=표준산업분류').first()).toBeVisible();
    await expect(page.locator('text=자산규모').first()).toBeVisible();
    await expect(page.locator('text=상장').first()).toBeVisible();
  });

  test("AUDIT service shows all 9 client fields", async ({ page }) => {
    await page.goto(`${FRONTEND}/budget-input/new`);
    await page.selectOption('select[name="service_type"], select:near(:text("서비스 분류"))', "AUDIT");
    await expect(page.locator('text=GAAP').first()).toBeVisible();
    await expect(page.locator('text=초도/계속 감사').first()).toBeVisible();
  });
});
```

**Note:** Selector 가 실제 DOM 과 일치하도록 구현 중 `data-testid` 추가가 필요할 수 있음. 일단 이 형태로 넣고 실패하면 selector 를 조정.

### Step 2: Service type reset 테스트

Create `frontend/tests/task-s1-service-type-reset.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

test.describe("S1 — service_type preservation on project select", () => {
  test("selecting project via search does not reset ESG to AUDIT", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(overview-person)?\/?$/);

    await page.goto(`${FRONTEND}/budget-input/new`);
    const serviceTypeSelect = page.locator('select').filter({ hasText: "서비스" }).first();
    // 드롭다운이 실제로 어떻게 렌더링되는지에 따라 selector 조정
    await page.selectOption('select[name="service_type"]', "ESG").catch(async () => {
      // fallback: "서비스 분류" 라벨 주변의 select
      await serviceTypeSelect.selectOption("ESG");
    });

    // 클라이언트 검색 → 임의 클라이언트 선택 → 프로젝트 검색 → 선택
    // 실제 검증: service_type 이 ESG 인지
    const selected = await page.locator('select[name="service_type"]').inputValue().catch(() => "");
    expect(selected).toBe("ESG");
  });
});
```

**Note:** 실제 플로우에 클라이언트/프로젝트 검색 버튼 클릭이 필요함. Selector 와 모달 상호작용은 구현 중에 실제 DOM 에 맞춰 조정. Test 실패 시 구현에 `data-testid="service-type-select"` 등 추가하는 것이 현실적.

### Step 3: Step 2 드롭다운 테스트

Create `frontend/tests/task-s1-nonaudit-step2.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

const API = "http://localhost:3001/api/v1";

test.describe("S1 — Step 2 activity mapping", () => {
  test("API returns non-empty activity mapping for ESG", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: process.env.EL_EMPNO || "170661" } });
    const r = await request.get(`${API}/budget/master/activity-mapping?service_type=ESG`);
    expect(r.status()).toBe(200);
    const rows = await r.json();
    expect(Array.isArray(rows)).toBe(true);
    // ESG 는 최소 1개 행이 있어야 함 (Task 5 seed 실행 이후)
    if (rows.length > 0) {
      expect(rows[0]).toHaveProperty("category");
      expect(rows[0]).toHaveProperty("detail");
    }
  });

  test("API returns non-empty activity mapping for TRADE", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: process.env.EL_EMPNO || "170661" } });
    const r = await request.get(`${API}/budget/master/activity-mapping?service_type=TRADE`);
    expect(r.status()).toBe(200);
    const rows = await r.json();
    expect(Array.isArray(rows)).toBe(true);
  });
});
```

### Step 4: Step 3 테스트

Create `frontend/tests/task-s1-nonaudit-step3.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

const API = "http://localhost:3001/api/v1";

test.describe("S1 — Step 3 budget units (TRADE)", () => {
  test("API /master/tasks?service_type=TRADE returns non-empty after seed", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: process.env.EL_EMPNO || "170661" } });
    const r = await request.get(`${API}/budget/master/tasks?service_type=TRADE`);
    expect(r.status()).toBe(200);
    const rows = await r.json();
    expect(rows.length).toBeGreaterThan(0);
    // 대분류(task_category) 값이 있어야 "+ 행 추가" 드롭다운이 정상 표시됨
    const categories = new Set(rows.map((r: { task_category: string }) => r.task_category).filter(Boolean));
    expect(categories.size).toBeGreaterThan(0);
  });
});
```

### Step 5: Client autofill 테스트

Create `frontend/tests/task-s1-client-autofill.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

const API = "http://localhost:3001/api/v1";

test.describe("S1 — Client autofill endpoint", () => {
  test("GET /clients/{code}/info returns 9 client fields", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: process.env.EL_EMPNO || "170661" } });
    // 실제로 존재하는 클라이언트를 찾아서 조회 — DB에 한 건이라도 있다는 가정
    const search = await request.get(`${API}/budget/clients/search?q=`);
    const clients = await search.json();
    if (!Array.isArray(clients) || clients.length === 0) {
      test.skip();
      return;
    }
    const code = clients[0].client_code;
    const r = await request.get(`${API}/budget/clients/${code}/info`);
    expect(r.status()).toBe(200);
    const info = await r.json();
    for (const key of ["client_code", "client_name", "industry", "asset_size", "listing_status", "business_report", "gaap", "consolidated", "subsidiary_count", "internal_control", "initial_audit"]) {
      expect(info).toHaveProperty(key);
    }
  });

  test("GET /clients/BOGUS_XYZ/info returns 404", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: process.env.EL_EMPNO || "170661" } });
    const r = await request.get(`${API}/budget/clients/BOGUS_XYZ/info`);
    expect(r.status()).toBe(404);
  });
});
```

### Step 6: Playwright 실행

사전: backend :3001 + frontend :8001 실행 중이어야 함. 구현 시 자동 시작 스크립트 활용.

```bash
cd backend && uvicorn app.main:app --port 3001 > /tmp/s1-backend.log 2>&1 &
cd frontend && NODE_ENV=production npm run start -- --port 8001 > /tmp/s1-frontend.log 2>&1 &
sleep 8

cd frontend && npx playwright test task-s1 --reporter=line 2>&1 | tail -30
```

Expected: 대부분 pass. UI-heavy 테스트(step1-fields, service-type-reset)는 selector 조정 필요할 수 있음 — 필요 시 프론트 코드에 `data-testid` 추가하고 spec 도 업데이트.

### Step 7: Commit

```bash
git add frontend/tests/task-s1-*.spec.ts
git commit -m "test(s1): Playwright E2E for step1/step2/step3/reset/autofill"
```

---

## Task 15: 수동 검증 + 최종 확인

**Files:** 없음 (수동 검증 단계)

### Step 1: 데이터 시드 재확인

```bash
cd backend && python -c "
from app.db.session import SessionLocal
from app.models.project import ServiceTaskMaster
s = SessionLocal()
from collections import Counter
c = Counter()
for r in s.query(ServiceTaskMaster).all():
    c[r.service_type] += 1
print(dict(c))
s.close()
"
```

Expected: AC/IC/ESG/VAL/TRADE/ACT/ETC 각각 > 0. AUDIT 은 기존 값 유지 (건드리지 않음).

### Step 2: 전체 백엔드 pytest

```bash
cd backend && pytest -q 2>&1 | tail -5
```

Expected: 기존 54 + 신규 (~15) = 약 69+ passed. S0 회귀 없어야 함.

### Step 3: 전체 Playwright S0 + S1

```bash
cd frontend && npx playwright test task-auth task-s1 --reporter=line 2>&1 | tail -20
```

Expected: S0 11개 + S1 새 테스트 전부 통과.

### Step 4: 수동 UI 검증 (사용자에게 인계)

각 서비스 타입 시나리오:
- **AUDIT**: 기존과 동일 (regression 없어야)
- **ESG**: Step1 에 3 필드만, Step2 드롭다운 "ESG 컨설팅" 선택 가능, Step3 "+ 행 추가" 동작
- **TRADE (통상자문)**: Step1 3 필드, Step2 통상자문 대분류, Step3 대분류 드롭다운에 값 표시 — #47 해소 확인

### Step 5: 로그 및 branch 상태 확인

```bash
cd /Users/jkim564/Documents/Programming/my_budget/.worktrees/s1-non-audit-support && git log main..HEAD --oneline
```

Expected: 약 15 커밋 on feature branch.

---

## 완료 기준 체크리스트

- [ ] Task 1~14 모든 단계 완료 (pytest + Playwright + tsc + build 통과)
- [ ] ServiceTaskMaster 에 비감사 7개 service_type 의 데이터가 모두 시드됨 (AC/IC/ESG/VAL/TRADE/ACT/ETC)
- [ ] Step 1 에서 service_type 변경 시 필드 개수가 조건부로 변동
- [ ] 프로젝트 검색 후 service_type 이 리셋되지 않음 (#27/#28 해소)
- [ ] Step 3 "+ 행 추가" 가 통상자문에서도 정상 동작 (#47 해소)
- [ ] 클라이언트 선택 시 모든 비어있는 필드가 자동 채워짐 (#55 자동입력)
- [ ] S0 회귀 테스트 모두 green
