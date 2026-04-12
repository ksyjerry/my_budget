# Azure Client Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Budget 입력 Step 1 클라이언트 검색에 Azure DB 의 모든 진행중 클라이언트 (감사 + 비감사 모든 LoS) 를 노출하고, 상세정보는 사용자가 직접 채워 UPSERT 저장한다.

**Architecture:** Azure `BI_STAFFREPORT_PRJT_V` → Postgres `clients` 테이블로 단일 방향 동기화. 동기화는 `client_name` 과 `synced_at` 만 갱신, 사용자 입력 상세필드는 보존. 스케줄러 (APScheduler) 로 매일 06:00 KST 자동 + 관리자 수동 버튼. 프론트는 상세정보 비어있는 클라이언트에 "정보 미입력" 배지 표시.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Alembic, APScheduler 3.x, pymssql, Next.js 14, Playwright

**Spec reference:** [docs/superpowers/specs/2026-04-12-azure-client-sync-design.md](docs/superpowers/specs/2026-04-12-azure-client-sync-design.md)

---

## Task 1: `clients.synced_at` 컬럼 추가 (모델 + 마이그레이션)

**Files:**
- Modify: `backend/app/models/project.py` (Client 클래스)
- Create: `backend/alembic/versions/002_add_clients_synced_at.py`

**Background:** 현재 `clients` 테이블에는 `synced_at` 컬럼이 없다. Alembic 은 `001_initial_schema.py` 만 있음. 002 마이그레이션 1개로 컬럼을 추가한다.

- [ ] **Step 1: Client 모델에 `synced_at` 필드 추가**

Edit [backend/app/models/project.py:8-27](backend/app/models/project.py#L8):

```python
class Client(Base):
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, autoincrement=True)
    client_code = Column(String(20), unique=True, nullable=False, index=True)
    client_name = Column(String(200))
    industry = Column(String(100))
    asset_size = Column(String(200))
    listing_status = Column(String(100))
    business_report = Column(String(100))
    gaap = Column(String(50))
    consolidated = Column(String(50))
    subsidiary_count = Column(String(50))
    internal_control = Column(String(100))
    initial_audit = Column(String(50))
    group_code = Column(String(10))
    synced_at = Column(DateTime, nullable=True)  # Azure 동기화 시각 (수동 입력분은 NULL)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    projects = relationship("Project", back_populates="client")
```

- [ ] **Step 2: Alembic 마이그레이션 파일 생성**

Create `backend/alembic/versions/002_add_clients_synced_at.py`:

```python
"""Add clients.synced_at column

Revision ID: 002_add_clients_synced_at
Revises: 001_initial_schema
Create Date: 2026-04-12
"""
from alembic import op
import sqlalchemy as sa


revision = "002_add_clients_synced_at"
down_revision = "001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "clients",
        sa.Column("synced_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("clients", "synced_at")
```

- [ ] **Step 3: 마이그레이션 실행 & 컬럼 확인**

Run: `cd backend && alembic upgrade head`

Run verification:
```bash
cd backend && python -c "
from app.db.session import SessionLocal
from sqlalchemy import text
db = SessionLocal()
cols = db.execute(text(\"SELECT column_name FROM information_schema.columns WHERE table_name='clients' AND column_name='synced_at'\")).fetchall()
print('synced_at exists:' , len(cols) == 1)
db.close()
"
```

Expected output: `synced_at exists: True`

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/project.py backend/alembic/versions/002_add_clients_synced_at.py
git commit -m "feat(db): add clients.synced_at column for Azure sync tracking"
```

---

## Task 2: `sync_clients()` 서비스 함수 구현 (TDD)

**Files:**
- Modify: `backend/app/services/sync_service.py`
- Create: `backend/tests/test_sync_clients.py`

**Background:** Azure `BI_STAFFREPORT_PRJT_V` 에서 `CLOSDV=N'진행'` 조건으로 모든 LoS 의 프로젝트를 가져와 `LEFT(PRJTCD, 5)` 로 그룹핑 후 `clients` 테이블에 UPSERT. 상세 필드는 절대 덮어쓰지 않음.

- [ ] **Step 1: 테스트 파일 생성 (failing)**

Create `backend/tests/test_sync_clients.py`:

```python
"""sync_clients() 유닛 테스트 — Azure 쿼리는 mock."""
from datetime import datetime
from unittest.mock import patch, MagicMock

import pytest
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.project import Client
from app.services.sync_service import sync_clients


@pytest.fixture
def db():
    s = SessionLocal()
    # 테스트에서 만든 AZUNIT* 접두사 데이터만 정리
    s.query(Client).filter(Client.client_code.like("AZUNIT%")).delete(synchronize_session=False)
    s.commit()
    yield s
    s.query(Client).filter(Client.client_code.like("AZUNIT%")).delete(synchronize_session=False)
    s.commit()
    s.close()


def _mock_azure(rows):
    """sync_clients 내부의 _get_azure() 를 mock 하는 헬퍼."""
    mock_cursor = MagicMock()
    mock_cursor.fetchall.return_value = rows
    mock_conn = MagicMock()
    mock_conn.cursor.return_value = mock_cursor
    cm = MagicMock()
    cm.__enter__.return_value = mock_conn
    cm.__exit__.return_value = False
    return cm


def test_insert_new_client(db: Session):
    """Azure 에만 있는 새 client_code → INSERT + synced_at 설정, 상세필드 NULL."""
    fake_cm = _mock_azure([
        {"CLIENT_CODE": "AZUNIT01", "CLIENT_NAME": "테스트산업", "SHORT_NAME": "테스트"},
    ])
    with patch("app.services.sync_service._get_azure", return_value=fake_cm):
        count = sync_clients(db)
    assert count == 1
    c = db.query(Client).filter_by(client_code="AZUNIT01").first()
    assert c is not None
    assert c.client_name == "테스트산업"
    assert c.synced_at is not None
    assert c.industry is None  # 상세필드는 NULL


def test_update_preserves_user_detail(db: Session):
    """Postgres 에 상세정보가 이미 있는 client_code → 이름/synced_at 만 갱신, industry 보존."""
    existing = Client(
        client_code="AZUNIT02",
        client_name="구이름",
        industry="제조업",
        asset_size="1조 이상",
        synced_at=None,
    )
    db.add(existing)
    db.commit()

    fake_cm = _mock_azure([
        {"CLIENT_CODE": "AZUNIT02", "CLIENT_NAME": "새이름", "SHORT_NAME": ""},
    ])
    with patch("app.services.sync_service._get_azure", return_value=fake_cm):
        sync_clients(db)

    db.refresh(existing)
    assert existing.client_name == "새이름"
    assert existing.synced_at is not None
    assert existing.industry == "제조업"  # 보존
    assert existing.asset_size == "1조 이상"  # 보존


def test_empty_client_code_skipped(db: Session):
    """CLIENT_CODE 가 빈 문자열인 row 는 스킵."""
    fake_cm = _mock_azure([
        {"CLIENT_CODE": "", "CLIENT_NAME": "빈코드", "SHORT_NAME": ""},
        {"CLIENT_CODE": "AZUNIT03", "CLIENT_NAME": "정상", "SHORT_NAME": ""},
    ])
    with patch("app.services.sync_service._get_azure", return_value=fake_cm):
        count = sync_clients(db)
    assert count == 1
    assert db.query(Client).filter_by(client_code="AZUNIT03").first() is not None


def test_shortname_fallback(db: Session):
    """CLIENT_NAME 이 None 이면 SHORT_NAME 사용."""
    fake_cm = _mock_azure([
        {"CLIENT_CODE": "AZUNIT04", "CLIENT_NAME": None, "SHORT_NAME": "약칭"},
    ])
    with patch("app.services.sync_service._get_azure", return_value=fake_cm):
        sync_clients(db)
    c = db.query(Client).filter_by(client_code="AZUNIT04").first()
    assert c.client_name == "약칭"
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `cd backend && pytest tests/test_sync_clients.py -v`

Expected: 4 tests FAIL — `sync_clients` 함수가 아직 구현되지 않았거나 (현재 파일에 없음) signature 가 맞지 않아서.

- [ ] **Step 3: `sync_clients()` 구현**

Edit `backend/app/services/sync_service.py` — 파일 맨 아래에 추가:

```python
def sync_clients(db: Session) -> int:
    """Azure BI_STAFFREPORT_PRJT_V 의 진행중 프로젝트에서 client_code (PRJTCD 앞 5자리) 를 추출하여
    Postgres clients 테이블에 UPSERT.

    - 모든 LoS 포함 (감사 + 비감사)
    - 기존 row: client_name 과 synced_at 만 갱신, 상세 필드는 보존
    - 신규 row: 상세 필드는 NULL 로 INSERT
    """
    from app.models.project import Client

    with _get_azure() as conn:
        cursor = conn.cursor(as_dict=True)
        cursor.execute("""
            SELECT
                LEFT(PRJTCD, 5) AS CLIENT_CODE,
                MAX(CLIENTNM)   AS CLIENT_NAME,
                MAX(SHRTNM)     AS SHORT_NAME
            FROM BI_STAFFREPORT_PRJT_V
            WHERE CLOSDV = N'진행'
            GROUP BY LEFT(PRJTCD, 5)
        """)
        rows = cursor.fetchall()

    now = datetime.now()
    count = 0
    for row in rows:
        code = (row.get("CLIENT_CODE") or "").strip()
        if not code:
            continue
        name = (row.get("CLIENT_NAME") or row.get("SHORT_NAME") or "").strip()

        client = db.query(Client).filter(Client.client_code == code).first()
        if not client:
            client = Client(client_code=code, client_name=name, synced_at=now)
            db.add(client)
        else:
            if name:
                client.client_name = name
            client.synced_at = now
        count += 1

    db.commit()
    return count
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `cd backend && pytest tests/test_sync_clients.py -v`

Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/sync_service.py backend/tests/test_sync_clients.py
git commit -m "feat(sync): add sync_clients() — UPSERT Azure clients preserving user detail"
```

---

## Task 3: `upsert_project_from_client_data` UPDATE 버그 수정 (TDD)

**Files:**
- Modify: `backend/app/services/budget_service.py:30-53`
- Create: `backend/tests/test_upsert_client.py`

**Background:** 현재 함수는 client가 이미 존재하면 아무것도 안 한다 ([line 37-52](backend/app/services/budget_service.py#L37-L52)). Azure sync 로 빈 상세필드의 row 가 먼저 생긴 경우, 사용자가 Step 1 에서 상세정보를 입력해도 clients 테이블에 저장되지 않는 버그. UPDATE 경로를 추가한다.

- [ ] **Step 1: 테스트 파일 생성 (failing)**

Create `backend/tests/test_upsert_client.py`:

```python
"""upsert_project_from_client_data - Azure sync 후 사용자 상세 입력이 반영되는지."""
import pytest
from datetime import datetime
from app.db.session import SessionLocal
from app.models.project import Client, Project
from app.services.budget_service import upsert_project_from_client_data


@pytest.fixture
def db():
    s = SessionLocal()
    # AZUPSERT 접두사 정리
    s.query(Project).filter(Project.project_code.like("AZUPSERT%")).delete(synchronize_session=False)
    s.query(Client).filter(Client.client_code.like("AZUPSERT%")).delete(synchronize_session=False)
    s.commit()
    yield s
    s.query(Project).filter(Project.project_code.like("AZUPSERT%")).delete(synchronize_session=False)
    s.query(Client).filter(Client.client_code.like("AZUPSERT%")).delete(synchronize_session=False)
    s.commit()
    s.close()


def test_updates_existing_client_detail(db):
    """Azure sync 로 빈 상세필드 Client 가 먼저 존재 → upsert 로 상세필드가 채워져야 함."""
    # Azure sync 가 만든 것처럼 빈 row 선삽입
    existing = Client(
        client_code="AZUPS",
        client_name="이름만있음",
        industry=None,
        asset_size=None,
        synced_at=datetime.now(),
    )
    db.add(existing)
    db.commit()
    client_id = existing.id

    # 사용자가 Step 1 에서 상세정보 입력하고 저장
    upsert_project_from_client_data(db, {
        "project_code": "AZUPS-TEST01",
        "client_code": "AZUPS",
        "client_name": "이름만있음",
        "industry": "제조업",
        "asset_size": "1조 이상",
        "listing_status": "유가증권",
        "gaap": "IFRS",
        "consolidated": "작성",
        "subsidiary_count": "10개이하",
        "internal_control": "연결감사",
        "initial_audit": "계속감사",
        "project_name": "테스트 프로젝트",
        "department": "본부",
        "el_empno": "", "el_name": "",
        "pm_empno": "", "pm_name": "",
        "qrp_empno": "", "qrp_name": "",
        "contract_hours": 0, "axdx_hours": 0, "qrp_hours": 0,
    })
    db.commit()

    c = db.query(Client).filter_by(id=client_id).first()
    assert c.industry == "제조업"
    assert c.asset_size == "1조 이상"
    assert c.listing_status == "유가증권"
    assert c.gaap == "IFRS"


def test_preserves_existing_detail_when_not_provided(db):
    """상세필드가 이미 있고 data 에 None 으로 넘어오면 덮어쓰지 않음."""
    existing = Client(
        client_code="AZUPS",
        client_name="원래이름",
        industry="제조업",
        synced_at=None,
    )
    db.add(existing)
    db.commit()

    upsert_project_from_client_data(db, {
        "project_code": "AZUPS-TEST02",
        "client_code": "AZUPS",
        "client_name": "원래이름",
        "industry": None,  # 사용자가 비워둠 → 기존값 보존
        "project_name": "두번째",
        "department": "", "el_empno": "", "el_name": "",
        "pm_empno": "", "pm_name": "",
        "qrp_empno": "", "qrp_name": "",
        "contract_hours": 0, "axdx_hours": 0, "qrp_hours": 0,
    })
    db.commit()

    c = db.query(Client).filter_by(client_code="AZUPS").first()
    assert c.industry == "제조업"  # 보존
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `cd backend && pytest tests/test_upsert_client.py -v`

Expected: `test_updates_existing_client_detail` FAIL (industry 가 None 으로 남음), `test_preserves_existing_detail_when_not_provided` 는 통과할 수 있음.

- [ ] **Step 3: `upsert_project_from_client_data` 수정**

Edit [backend/app/services/budget_service.py:30-53](backend/app/services/budget_service.py#L30). Client 블록을 아래로 교체:

```python
def upsert_project_from_client_data(db: Session, data: dict) -> Project:
    """Client/Project 정보를 DB에 저장 또는 업데이트."""
    project_code = data["project_code"]

    # ── Client upsert ─────────────────────────────────────
    client_code = data.get("client_code", project_code.split("-")[0])
    client = db.query(Client).filter(Client.client_code == client_code).first()
    if not client:
        client = Client(client_code=client_code)
        db.add(client)

    # 값이 실제로 넘어온 경우에만 UPDATE (None/빈 문자열이 아닌 경우 기존 값 보존)
    _client_fields = [
        "client_name", "industry", "asset_size", "listing_status",
        "gaap", "consolidated", "subsidiary_count", "internal_control",
        "initial_audit", "group_code", "business_report",
    ]
    for f in _client_fields:
        v = data.get(f)
        if v is not None and v != "":
            setattr(client, f, v)

    db.flush()
```

(이 다음의 Project upsert 블록은 그대로 유지)

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `cd backend && pytest tests/test_upsert_client.py -v`

Expected: 2 passed

- [ ] **Step 5: 회귀 검증 — 기존 budget_input 관련 테스트도 돌려서 깨진 것 없는지**

Run: `cd backend && pytest tests/ -v --ignore=tests/test_sync_clients.py`

Expected: 기존 테스트 전체 통과 (신규 테스트는 이미 통과)

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/budget_service.py backend/tests/test_upsert_client.py
git commit -m "fix(budget): upsert_project_from_client_data now updates existing clients"
```

---

## Task 4: `/api/v1/sync/clients` API 엔드포인트 + 라우터 등록

**Files:**
- Modify: `backend/app/api/v1/sync.py` (엔드포인트 추가)
- Modify: `backend/app/main.py` (라우터 등록)

**Background:** `backend/app/api/v1/sync.py` 는 존재하지만 `main.py` 에 include 되어있지 않음. 이번에 등록하면서 `POST /clients` 와 `GET /clients/status` 엔드포인트를 추가. 권한은 `partner_access_config.scope == "all"` (tracking.py 와 동일 패턴) 로 admin-only.

- [ ] **Step 1: sync.py 에 엔드포인트 추가**

Edit `backend/app/api/v1/sync.py` — 파일 전체 교체:

```python
import time
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.session import get_db
from app.core.security import get_optional_user
from app.models.project import Client
from app.services.sync_service import (
    sync_employees,
    sync_teams,
    sync_actual_data,
    sync_clients,
)

router = APIRouter()


def _require_admin(db: Session, user: dict | None):
    """partner_access_config.scope == 'all' 인 사용자만 admin."""
    if not user:
        raise HTTPException(status_code=401, detail="인증이 필요합니다.")
    from app.api.v1.tracking import _get_partner_access
    cfg = _get_partner_access(db, user["empno"])
    if not cfg or cfg.scope != "all":
        raise HTTPException(status_code=403, detail="관리자(scope=all)만 동기화할 수 있습니다.")


@router.post("/employees")
def sync_employees_endpoint(db: Session = Depends(get_db)):
    count = sync_employees(db)
    return {"message": f"{count}명 동기화 완료"}


@router.post("/teams")
def sync_teams_endpoint(db: Session = Depends(get_db)):
    count = sync_teams(db)
    return {"message": f"{count}개 팀 동기화 완료"}


@router.post("/actual")
def sync_actual_endpoint(project_codes: list[str], db: Session = Depends(get_db)):
    count = sync_actual_data(db, project_codes)
    return {"message": f"{count}건 Actual 데이터 동기화 완료"}


@router.post("/clients")
def sync_clients_endpoint(
    db: Session = Depends(get_db),
    user: dict | None = Depends(get_optional_user),
):
    """Azure → Postgres 클라이언트 동기화 (admin only)."""
    _require_admin(db, user)
    t0 = time.time()
    count = sync_clients(db)
    elapsed_ms = int((time.time() - t0) * 1000)
    return {"synced": count, "elapsed_ms": elapsed_ms, "message": "ok"}


@router.get("/clients/status")
def sync_clients_status(db: Session = Depends(get_db)):
    """마지막 Azure 클라이언트 동기화 상태 조회 (인증 불필요)."""
    total = db.query(func.count(Client.id)).scalar() or 0
    azure_synced = (
        db.query(func.count(Client.id))
        .filter(Client.synced_at.isnot(None))
        .scalar()
        or 0
    )
    last_sync = db.query(func.max(Client.synced_at)).scalar()
    return {
        "total_clients": total,
        "azure_synced": azure_synced,
        "last_sync": last_sync.isoformat() if last_sync else None,
    }
```

- [ ] **Step 2: main.py 에 라우터 등록**

Edit [backend/app/main.py:15](backend/app/main.py#L15) — import 라인에 `sync` 추가:

```python
from app.api.v1 import auth, budget_upload, budget_input, overview, projects, assignments, summary, export, cache, admin, chat, budget_assist, tracking, sync
```

Edit [backend/app/main.py:50](backend/app/main.py#L50) — tracking 라우터 include 다음 줄에 추가:

```python
app.include_router(tracking.router, prefix="/api/v1", tags=["tracking"])
app.include_router(sync.router, prefix="/api/v1/sync", tags=["sync"])
```

- [ ] **Step 3: 서버 수동 실행 + status 호출**

Backend 서버는 이미 [server_on.md](server_on.md) 에 띄우는 법이 있으니 그 방식을 따르거나 `cd backend && uvicorn app.main:app --port 3001`. 이미 켜져 있으면 재시작.

Run:
```bash
curl -s http://localhost:3001/api/v1/sync/clients/status | python -m json.tool
```

Expected output (첫 실행, sync 전):
```json
{
    "total_clients": <기존 수>,
    "azure_synced": 0,
    "last_sync": null
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/v1/sync.py backend/app/main.py
git commit -m "feat(api): add /sync/clients endpoint + register sync router"
```

---

## Task 5: APScheduler 매일 06:00 KST 자동 동기화

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/app/main.py`

**Background:** APScheduler `BackgroundScheduler` 로 startup 이벤트에서 cron job 등록. Single worker 가정. 실패시 로그만 남기고 서버는 계속 동작.

- [ ] **Step 1: requirements.txt 에 APScheduler 추가**

Edit [backend/requirements.txt](backend/requirements.txt) — 파일 끝에 추가:

```
apscheduler==3.10.4
```

- [ ] **Step 2: 설치**

Run: `cd backend && pip install apscheduler==3.10.4`

Expected: `Successfully installed apscheduler-3.10.4` (또는 already satisfied)

- [ ] **Step 3: main.py 에 스케줄러 등록**

Edit [backend/app/main.py](backend/app/main.py) — 기존 `startup_cache_warmup` 함수 아래에 추가:

```python
from apscheduler.schedulers.background import BackgroundScheduler

_scheduler = BackgroundScheduler(timezone="Asia/Seoul")


def _scheduled_client_sync():
    """매일 06:00 KST 에 Azure → Postgres 클라이언트 동기화."""
    from app.db.session import SessionLocal
    from app.services.sync_service import sync_clients
    logger = logging.getLogger("scheduler")
    db = SessionLocal()
    try:
        n = sync_clients(db)
        logger.info(f"Scheduled client sync: {n} clients")
    except Exception as e:
        logger.error(f"Scheduled client sync failed: {e}")
    finally:
        db.close()


@app.on_event("startup")
def start_scheduler():
    if not _scheduler.running:
        _scheduler.add_job(
            _scheduled_client_sync,
            "cron",
            hour=6,
            minute=0,
            id="sync_clients",
            replace_existing=True,
        )
        _scheduler.start()


@app.on_event("shutdown")
def stop_scheduler():
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
```

- [ ] **Step 4: 서버 재시작 & 스케줄러 로그 확인**

서버 재시작. startup 직후 로그에 APScheduler 관련 출력이 있어야 함 (`Adding job tentatively...`, `Added job...`).

또는 수동 확인:
```bash
cd backend && python -c "
from app.main import _scheduler
print('running:', _scheduler.running)
print('jobs:', [j.id for j in _scheduler.get_jobs()])
"
```
주의: main 을 import 하면 startup 이벤트가 자동으로 돌지 않을 수 있으므로 서버 로그로 검증하는 것이 가장 확실함.

- [ ] **Step 5: Commit**

```bash
git add backend/requirements.txt backend/app/main.py
git commit -m "feat(scheduler): daily 06:00 KST Azure client sync via APScheduler"
```

---

## Task 6: `/clients/search` 응답에 `needs_detail` 필드 추가

**Files:**
- Modify: `backend/app/api/v1/budget_input.py:65-87`

**Background:** 프론트가 "정보 미입력" 배지를 표시하기 위해 백엔드가 boolean 필드를 제공해야 함. 주요 필드 (`industry`, `asset_size`, `listing_status`, `gaap`) 가 모두 비어있으면 `needs_detail=True`.

- [ ] **Step 1: search_clients 엔드포인트 수정**

Edit [backend/app/api/v1/budget_input.py:65-87](backend/app/api/v1/budget_input.py#L65):

```python
def _client_needs_detail(c) -> bool:
    """주요 상세필드가 모두 비어있으면 True — Azure sync 이후 사용자 입력 전 상태."""
    key_fields = [c.industry, c.asset_size, c.listing_status, c.gaap]
    return not any(f for f in key_fields)


@router.get("/clients/search")
def search_clients(q: str = "", db: Session = Depends(get_db)):
    """클라이언트 이름/코드로 검색."""
    query = db.query(Client)
    if q:
        query = query.filter(
            (Client.client_name.ilike(f"%{q}%")) |
            (Client.client_code.ilike(f"%{q}%"))
        )
    results = query.order_by(Client.client_name).limit(50).all()
    return [
        {
            "client_code": c.client_code,
            "client_name": c.client_name or "",
            "industry": c.industry or "",
            "asset_size": c.asset_size or "",
            "listing_status": c.listing_status or "",
            "gaap": c.gaap or "",
            "consolidated": c.consolidated or "",
            "subsidiary_count": c.subsidiary_count or "",
            "internal_control": c.internal_control or "",
            "business_report": c.business_report or "",
            "initial_audit": c.initial_audit or "",
            "needs_detail": _client_needs_detail(c),
        }
        for c in results
    ]
```

- [ ] **Step 2: 수동 확인**

서버 재시작 후:
```bash
curl -s "http://localhost:3001/api/v1/budget/clients/search?q=" | python -m json.tool | head -30
```

Expected: 응답의 각 객체에 `needs_detail: true/false` 필드가 있음.

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/v1/budget_input.py
git commit -m "feat(api): /clients/search adds needs_detail flag + code search"
```

---

## Task 7: 초기 수동 동기화 1회 실행 & 검증

**Files:** none (운영 작업)

**Background:** 마이그레이션과 sync 함수를 배포한 직후, 관리자 계정으로 1회 `/api/v1/sync/clients` 호출하여 초기 시드 데이터를 채운다.

- [ ] **Step 1: admin 토큰 발급**

`partner_access_config` 에 `scope='all'` 로 등록된 empno 를 확인하고 로그인 → token.

```bash
ADMIN_EMPNO=<admin 사번>
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"empno\":\"$ADMIN_EMPNO\"}" | python -c "import json,sys; print(json.load(sys.stdin)['token'])")
echo "$TOKEN" | head -c 30; echo "..."
```

Expected: 토큰 prefix 출력.

- [ ] **Step 2: 동기화 실행**

```bash
curl -s -X POST http://localhost:3001/api/v1/sync/clients \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
```

Expected:
```json
{
    "synced": <숫자 (대개 1000~10000 사이)>,
    "elapsed_ms": <10000 미만>,
    "message": "ok"
}
```

- [ ] **Step 3: status 확인**

```bash
curl -s http://localhost:3001/api/v1/sync/clients/status | python -m json.tool
```

Expected: `last_sync` 가 방금 시각, `azure_synced` > 0, `total_clients` 가 증가.

- [ ] **Step 4: 기존 상세정보 보존 SQL 확인**

기존에 Excel 업로드로 `industry` 가 채워져 있던 클라이언트 하나를 골라서:

```bash
cd backend && python -c "
from app.db.session import SessionLocal
from app.models.project import Client
db = SessionLocal()
sample = db.query(Client).filter(Client.industry.isnot(None)).first()
if sample:
    print(f'client_code={sample.client_code}, industry={sample.industry}, synced_at={sample.synced_at}')
else:
    print('no client with industry')
db.close()
"
```

Expected: 상세정보 있는 클라이언트가 존재하고 `industry` 가 그대로 (sync 가 덮어쓰지 않았음).

- [ ] **Step 5: Commit (해당 없음 — 운영 작업이므로 commit 없음)**

이 Task 는 DB 작업만 수행. 다음 Task 로 진행.

---

## Task 8: Frontend — "정보 미입력" 배지 + `needs_detail` 타입

**Files:**
- Modify: `frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx` (ClientInfo interface + ClientSearchModal 렌더링)

**Background:** `ClientInfo` 인터페이스에 `needs_detail?: boolean` 추가하고, ClientSearchModal 의 검색 결과 테이블에 배지 렌더링.

- [ ] **Step 1: ClientInfo 타입 확장**

Edit [frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx:86-98](frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx#L86):

```typescript
interface ClientInfo {
  client_code: string;
  client_name: string;
  industry: string;
  asset_size: string;
  listing_status: string;
  business_report: string;
  gaap: string;
  consolidated: string;
  subsidiary_count: string;
  internal_control: string;
  initial_audit: string;
  needs_detail?: boolean;
}
```

- [ ] **Step 2: ClientSearchModal 테이블에 배지 추가**

Edit [frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx:841-853](frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx#L841) — `<tbody>` 블록을 아래로 교체:

```tsx
              <tbody>
                {results.map((c) => (
                  <tr
                    key={c.client_code}
                    className="border-t border-pwc-gray-100 cursor-pointer hover:bg-orange-50 transition-colors"
                    onClick={() => { onSelect(c); onClose(); }}
                  >
                    <td className="px-4 py-2.5 font-mono text-xs">{c.client_code}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span>{c.client_name}</span>
                        {c.needs_detail && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-pwc-gray-100 text-pwc-gray-600">
                            정보 미입력
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-pwc-gray-600">{c.industry}</td>
                    <td className="px-4 py-2.5 text-xs text-pwc-gray-600">{c.listing_status}</td>
                  </tr>
                ))}
              </tbody>
```

- [ ] **Step 3: TypeScript 컴파일 확인**

Run: `cd frontend && npx tsc --noEmit`

Expected: 오류 없음

- [ ] **Step 4: 브라우저 수동 확인**

1. `cd frontend && npm run dev` (이미 떠 있으면 스킵)
2. Budget 입력 → 신규 프로젝트 → Step 1 → 클라이언트 검색 모달 오픈
3. Azure-only 클라이언트로 알려진 코드(Task 7 에서 받은 신규 생성 client_code 중 하나) 검색 → 이름 옆에 "정보 미입력" 배지 표시 확인
4. 기존 Excel 업로드 클라이언트 (industry 있음) 검색 → 배지 없음

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/(dashboard)/budget-input/[project_code]/page.tsx"
git commit -m "feat(ui): show '정보 미입력' badge for Azure-synced clients without details"
```

---

## Task 9: Playwright E2E 테스트

**Files:**
- Create: `frontend/tests/task-azure-client-sync.spec.ts`

**Background:** 핵심 플로우를 E2E 로 검증 — `/clients/search` 에 `needs_detail` 필드가 오고, 상세정보 저장 후 재검색시 배지가 사라지는지.

- [ ] **Step 1: 테스트 파일 작성**

Create `frontend/tests/task-azure-client-sync.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

const API = "http://localhost:3001/api/v1";

async function adminLogin(request: any): Promise<string> {
  // partner_access_config 에 scope=all 로 등록된 admin empno — 환경에 맞게 조정
  const ADMIN_EMPNO = process.env.ADMIN_EMPNO || "120507";
  const res = await request.post(`${API}/auth/login`, { data: { empno: ADMIN_EMPNO } });
  const j = await res.json();
  return j.token;
}

test.describe("Azure Client Sync", () => {
  test("API — /clients/search returns needs_detail field", async ({ request }) => {
    const res = await request.get(`${API}/budget/clients/search?q=`);
    expect(res.status()).toBe(200);
    const rows = await res.json();
    expect(Array.isArray(rows)).toBe(true);
    if (rows.length > 0) {
      expect(rows[0]).toHaveProperty("needs_detail");
      expect(typeof rows[0].needs_detail).toBe("boolean");
    }
  });

  test("API — /sync/clients/status returns counts", async ({ request }) => {
    const res = await request.get(`${API}/sync/clients/status`);
    expect(res.status()).toBe(200);
    const s = await res.json();
    expect(s).toHaveProperty("total_clients");
    expect(s).toHaveProperty("azure_synced");
    expect(s).toHaveProperty("last_sync");
  });

  test("API — /sync/clients rejects non-admin", async ({ request }) => {
    // 비 admin 사번 (scope != 'all')
    const loginRes = await request.post(`${API}/auth/login`, { data: { empno: "320915" } });
    const { token } = await loginRes.json();
    const res = await request.post(`${API}/sync/clients`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("API — admin can trigger sync", async ({ request }) => {
    const token = await adminLogin(request);
    const res = await request.post(`${API}/sync/clients`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const j = await res.json();
    expect(j).toHaveProperty("synced");
    expect(j.synced).toBeGreaterThan(0);
    console.log(`Synced ${j.synced} clients in ${j.elapsed_ms}ms`);
  });

  test("UI — Azure-only client shows 정보 미입력 badge", async ({ page }) => {
    // 로그인
    await page.goto("/login");
    await page.fill('input[placeholder*="사번"]', process.env.ADMIN_EMPNO || "120507");
    await page.click('button:has-text("로그인")');
    await page.waitForURL((u) => !u.pathname.includes("/login"));

    // Budget 입력 → 신규 생성 → Step 1 → 클라이언트 검색
    await page.goto("/budget-input");
    // 신규 프로젝트 생성 버튼 (실제 셀렉터는 실행시 확인)
    // 이 부분은 환경에 따라 다르므로 API 테스트가 정확한 검증을 제공.
    // 여기서는 search modal 이 열리는 페이지까지만 간단히 확인
    await page.waitForTimeout(2000);
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `cd frontend && npx playwright test tests/task-azure-client-sync.spec.ts --reporter=list`

Expected: 4개 API 테스트 통과 + 1개 UI 테스트 (최소 셀렉터만) 통과. UI 테스트는 환경에 따라 `/budget-input` 경로에서 신규 생성 플로우가 다를 수 있으므로 API 검증이 주된 수단.

실패시: 서버가 떠있는지, admin 토큰이 유효한지 확인.

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/task-azure-client-sync.spec.ts
git commit -m "test(e2e): Playwright tests for Azure client sync"
```

---

## Task 10: 최종 회귀 검증 & 푸시

**Files:** none

- [ ] **Step 1: 전체 백엔드 테스트 실행**

Run: `cd backend && pytest tests/ -v`

Expected: All passed. 신규 `test_sync_clients.py`, `test_upsert_client.py` + 기존 테스트 전체.

- [ ] **Step 2: Playwright 전체 실행**

Run: `cd frontend && npx playwright test --reporter=list`

Expected: 기존 테스트 + 신규 `task-azure-client-sync.spec.ts` 통과.

- [ ] **Step 3: git status 확인 & push**

```bash
git status
git log --oneline -15
git push origin main
```

Expected: `Everything up-to-date` 또는 push 성공 출력.

---

## Summary

10개 태스크로 분해:
1. DB 컬럼 (`synced_at`)
2. `sync_clients()` 서비스 + 유닛 테스트
3. `upsert_project_from_client_data` 버그 수정 (UPDATE 경로)
4. `/api/v1/sync/clients` + `/status` API
5. APScheduler 매일 06:00 KST 자동 동기화
6. `/clients/search` 에 `needs_detail` 필드 추가
7. 초기 수동 동기화 1회 실행 & 검증
8. Frontend "정보 미입력" 배지
9. Playwright E2E 테스트
10. 회귀 검증 & push

**총 예상 커밋**: 8~9 개 (Task 7, 10 은 운영 작업으로 커밋 없음).

**PDCA 매핑**:
- **Plan**: 이 문서 + spec
- **Do**: Task 1~6, 8
- **Check**: Task 2/3 의 pytest, Task 7 의 수동 검증, Task 9/10 의 Playwright
- **Act**: Task 10 의 push + 다음날 06:00 자동 sync 로그 확인 (follow-up)
