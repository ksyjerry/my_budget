# S0 — 보안 / 세션 기반 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자 피드백 #23/#34/#35/#48 대응. empno-only 로그인은 유지하되 JWT(localStorage) → httpOnly 세션 쿠키(+ 서버측 `sessions` 테이블) 로 전환하고, 모든 쓰기 API 에 서버측 권한 가드를 도입하며, 프로덕션 빌드에서 Next.js dev overlay 가 노출되지 않도록 정비한다.

**Architecture:**
- 백엔드: 신규 `sessions`/`login_log` 테이블. `/api/v1/auth/login` 은 256비트 난수 session_id 를 발급하고 httpOnly+Secure+SameSite=Lax 쿠키로 전달. 모든 요청은 `get_current_user` 미들웨어가 쿠키→세션 조회→만료/revoke 검증. 권한은 `require_login`/`require_elpm`/`require_admin` FastAPI Dependency + 리소스 단위 헬퍼 (`assert_can_modify_project`, `assert_can_delete_project`).
- 프론트엔드: `localStorage` JWT 로직 완전 제거. 모든 `fetch` 에 `credentials: "include"`. `AuthProvider` 는 `GET /api/v1/auth/me` 로 세션 유효성 확인.
- 배포: `next build && next start` 프로덕션 빌드 확정. Playwright 로 dev overlay 미노출 검증.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, APScheduler, Next.js 16, React, Playwright, pytest.

**Spec:** [docs/superpowers/specs/2026-04-21-s0-security-session-design.md](../specs/2026-04-21-s0-security-session-design.md)

---

## Task 1: Alembic migration — `sessions` + `login_log` 테이블

**Files:**
- Create: `backend/alembic/versions/003_add_sessions_and_login_log.py`

**Background:** 세션 기반 인증의 저장소. 기존 마이그레이션은 `001_initial_schema.py`, `002_add_clients_synced_at.py` — 새 revision id 는 `003`.

- [ ] **Step 1: 마이그레이션 파일 작성**

Create `backend/alembic/versions/003_add_sessions_and_login_log.py`:

```python
"""Add sessions and login_log tables for cookie-based auth

Revision ID: 003_add_sessions_and_login_log
Revises: 002_add_clients_synced_at
Create Date: 2026-04-21
"""
from alembic import op
import sqlalchemy as sa


revision = "003_add_sessions_and_login_log"
down_revision = "002_add_clients_synced_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sessions",
        sa.Column("session_id", sa.String(64), primary_key=True),
        sa.Column("empno", sa.String(20), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("scope", sa.String(20), nullable=False, server_default="self"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("ip", sa.String(64)),
        sa.Column("user_agent", sa.String(500)),
        sa.Column("revoked_at", sa.DateTime()),
    )
    op.create_index("sessions_empno_idx", "sessions", ["empno", "revoked_at"])
    op.create_index("sessions_expires_at_idx", "sessions", ["expires_at"])

    op.create_table(
        "login_log",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("empno", sa.String(20)),
        sa.Column("logged_in_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("ip", sa.String(64)),
        sa.Column("user_agent", sa.String(500)),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("failure_reason", sa.String(100)),
    )
    op.create_index("login_log_empno_time_idx", "login_log", ["empno", "logged_in_at"])


def downgrade() -> None:
    op.drop_index("login_log_empno_time_idx", table_name="login_log")
    op.drop_table("login_log")
    op.drop_index("sessions_expires_at_idx", table_name="sessions")
    op.drop_index("sessions_empno_idx", table_name="sessions")
    op.drop_table("sessions")
```

- [ ] **Step 2: 마이그레이션 실행**

```bash
cd backend && alembic upgrade head
```

Expected: `INFO  [alembic.runtime.migration] Running upgrade 002_add_clients_synced_at -> 003_add_sessions_and_login_log`

- [ ] **Step 3: Postgres 에 테이블 생성 확인**

```bash
cd backend && python -c "
from app.db.session import engine
from sqlalchemy import inspect
insp = inspect(engine)
print('sessions columns:', [c['name'] for c in insp.get_columns('sessions')])
print('login_log columns:', [c['name'] for c in insp.get_columns('login_log')])
"
```

Expected: 테이블 컬럼 목록 출력.

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/003_add_sessions_and_login_log.py
git commit -m "feat(s0): add sessions and login_log tables"
```

---

## Task 2: SQLAlchemy 모델 `Session` / `LoginLog`

**Files:**
- Create: `backend/app/models/session.py`

**Background:** ORM 모델을 파이썬 레벨에서 사용 가능하게 추가. 기존 모델 패턴은 `backend/app/models/employee.py` 를 참고.

- [ ] **Step 1: 모델 파일 작성**

Create `backend/app/models/session.py`:

```python
from sqlalchemy import Column, String, DateTime, Boolean, BigInteger, Index
from sqlalchemy.sql import func

from app.db.base import Base


class Session(Base):
    __tablename__ = "sessions"

    session_id = Column(String(64), primary_key=True)
    empno = Column(String(20), nullable=False)
    role = Column(String(20), nullable=False)
    scope = Column(String(20), nullable=False, default="self")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    expires_at = Column(DateTime, nullable=False)
    last_seen_at = Column(DateTime, nullable=False, server_default=func.now())
    ip = Column(String(64))
    user_agent = Column(String(500))
    revoked_at = Column(DateTime)


class LoginLog(Base):
    __tablename__ = "login_log"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    empno = Column(String(20))
    logged_in_at = Column(DateTime, nullable=False, server_default=func.now())
    ip = Column(String(64))
    user_agent = Column(String(500))
    success = Column(Boolean, nullable=False)
    failure_reason = Column(String(100))
```

- [ ] **Step 2: Sanity check — import**

```bash
cd backend && python -c "from app.models.session import Session, LoginLog; print(Session.__tablename__, LoginLog.__tablename__)"
```

Expected: `sessions login_log`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/models/session.py
git commit -m "feat(s0): add Session and LoginLog models"
```

---

## Task 3: 세션 핵심 모듈 `app/core/sessions.py`

**Files:**
- Create: `backend/app/core/sessions.py`
- Create: `backend/tests/test_sessions_core.py`

**Background:** 순수 CRUD 로직을 한 파일에 모아 테스트 가능한 단위로 만든다. 만료시간·쿠키명 등 상수는 모듈 상단에 정의.

- [ ] **Step 1: 실패 테스트 작성**

Create `backend/tests/test_sessions_core.py`:

```python
"""Unit tests for app.core.sessions."""
from datetime import datetime, timedelta
import pytest

from app.core.sessions import (
    SESSION_COOKIE_NAME,
    SESSION_DURATION,
    create_session,
    get_session,
    revoke_session,
    touch_session,
)
from app.db.session import SessionLocal


@pytest.fixture
def db():
    s = SessionLocal()
    # 각 테스트 격리: 기존 테스트 세션 정리
    from app.models.session import Session as DBSession
    s.query(DBSession).filter(DBSession.empno == "TEST999").delete()
    s.commit()
    yield s
    s.query(DBSession).filter(DBSession.empno == "TEST999").delete()
    s.commit()
    s.close()


def test_session_cookie_constants():
    assert SESSION_COOKIE_NAME == "mybudget_session"
    assert SESSION_DURATION == timedelta(hours=8)


def test_create_session_returns_valid_id(db):
    sid = create_session(
        db,
        empno="TEST999",
        role="elpm",
        scope="self",
        ip="127.0.0.1",
        user_agent="pytest",
    )
    assert isinstance(sid, str)
    assert len(sid) >= 32  # secrets.token_urlsafe(32) -> ~43 chars


def test_get_session_returns_active_session(db):
    sid = create_session(db, empno="TEST999", role="elpm", scope="self")
    s = get_session(db, sid)
    assert s is not None
    assert s.empno == "TEST999"
    assert s.role == "elpm"
    assert s.revoked_at is None


def test_get_session_returns_none_for_bogus_id(db):
    assert get_session(db, "does-not-exist") is None


def test_revoked_session_returns_none(db):
    sid = create_session(db, empno="TEST999", role="elpm", scope="self")
    revoke_session(db, sid)
    assert get_session(db, sid) is None


def test_expired_session_returns_none(db):
    from app.models.session import Session as DBSession
    sid = create_session(db, empno="TEST999", role="elpm", scope="self")
    # 강제로 만료 처리
    db.query(DBSession).filter(DBSession.session_id == sid).update(
        {"expires_at": datetime.utcnow() - timedelta(minutes=1)}
    )
    db.commit()
    assert get_session(db, sid) is None


def test_touch_session_updates_last_seen(db):
    sid = create_session(db, empno="TEST999", role="elpm", scope="self")
    before = get_session(db, sid).last_seen_at
    # last_seen_at 을 강제로 과거로 설정
    from app.models.session import Session as DBSession
    db.query(DBSession).filter(DBSession.session_id == sid).update(
        {"last_seen_at": datetime.utcnow() - timedelta(minutes=5)}
    )
    db.commit()
    touch_session(db, sid)
    after = get_session(db, sid).last_seen_at
    assert after > before - timedelta(seconds=1)
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd backend && pytest tests/test_sessions_core.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.core.sessions'`.

- [ ] **Step 3: `app/core/sessions.py` 구현**

Create `backend/app/core/sessions.py`:

```python
"""Server-side session management for cookie-based auth."""
import secrets
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session as DBSessionType

from app.models.session import Session as DBSession

SESSION_COOKIE_NAME = "mybudget_session"
SESSION_DURATION = timedelta(hours=8)
TOUCH_DEBOUNCE = timedelta(minutes=1)


def create_session(
    db: DBSessionType,
    *,
    empno: str,
    role: str,
    scope: str = "self",
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> str:
    """Create a new session row. Returns the session_id."""
    sid = secrets.token_urlsafe(32)
    now = datetime.utcnow()
    row = DBSession(
        session_id=sid,
        empno=empno,
        role=role,
        scope=scope,
        created_at=now,
        expires_at=now + SESSION_DURATION,
        last_seen_at=now,
        ip=ip,
        user_agent=user_agent,
    )
    db.add(row)
    db.commit()
    return sid


def get_session(db: DBSessionType, session_id: str) -> Optional[DBSession]:
    """Return the session if it is valid (not revoked, not expired)."""
    if not session_id:
        return None
    row = db.query(DBSession).filter(DBSession.session_id == session_id).first()
    if row is None:
        return None
    if row.revoked_at is not None:
        return None
    if row.expires_at <= datetime.utcnow():
        return None
    return row


def revoke_session(db: DBSessionType, session_id: str) -> None:
    """Mark the session as revoked."""
    db.query(DBSession).filter(DBSession.session_id == session_id).update(
        {"revoked_at": datetime.utcnow()}
    )
    db.commit()


def revoke_all_sessions_for_empno(db: DBSessionType, empno: str) -> int:
    """Revoke every active session for the given empno. Returns # revoked."""
    n = db.query(DBSession).filter(
        DBSession.empno == empno,
        DBSession.revoked_at.is_(None),
    ).update({"revoked_at": datetime.utcnow()})
    db.commit()
    return n


def touch_session(db: DBSessionType, session_id: str) -> None:
    """Update last_seen_at, but no more often than TOUCH_DEBOUNCE."""
    now = datetime.utcnow()
    row = db.query(DBSession).filter(DBSession.session_id == session_id).first()
    if row is None or row.revoked_at is not None:
        return
    if now - row.last_seen_at < TOUCH_DEBOUNCE:
        return
    row.last_seen_at = now
    db.commit()


def cleanup_expired_sessions(db: DBSessionType, *, older_than_days: int = 30) -> int:
    """Delete rows where expires_at is older than N days ago. Returns # deleted."""
    cutoff = datetime.utcnow() - timedelta(days=older_than_days)
    n = db.query(DBSession).filter(DBSession.expires_at < cutoff).delete()
    db.commit()
    return n
```

- [ ] **Step 4: 테스트 재실행 — 전부 통과 확인**

```bash
cd backend && pytest tests/test_sessions_core.py -v
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/sessions.py backend/tests/test_sessions_core.py
git commit -m "feat(s0): add core sessions module with create/get/revoke/touch"
```

---

## Task 4: 새 `/auth/login`, `/auth/logout`, `/auth/me` 엔드포인트

**Files:**
- Modify: `backend/app/api/v1/auth.py`
- Create: `backend/tests/test_auth_endpoints.py`

**Background:** 기존 `auth.py` 는 JWT 발급/반환. 쿠키 기반으로 완전 교체. **admin 판정은 `PartnerAccessConfig.scope == "all"` 로 한다** (spec 5절).

- [ ] **Step 1: 실패 테스트 작성**

Create `backend/tests/test_auth_endpoints.py`:

```python
"""Integration tests for /api/v1/auth endpoints (cookie-based)."""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.sessions import SESSION_COOKIE_NAME
from app.db.session import SessionLocal
from app.models.session import Session as DBSession
from app.models.session import LoginLog


EL_EMPNO = "170661"  # 최성우 — 기존 conftest 에서 쓰던 EL/PM
STAFF_EMPNO = "320915"  # 지해나 — 기존 conftest 에서 쓰던 Staff
BOGUS_EMPNO = "ZZZZZZ"


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def _cleanup_sessions():
    db = SessionLocal()
    for e in (EL_EMPNO, STAFF_EMPNO, BOGUS_EMPNO):
        db.query(DBSession).filter(DBSession.empno == e).delete()
    db.query(LoginLog).filter(LoginLog.empno.in_([EL_EMPNO, STAFF_EMPNO, BOGUS_EMPNO])).delete()
    db.commit()
    db.close()


def test_login_success_sets_cookie(client):
    r = client.post("/api/v1/auth/login", json={"empno": EL_EMPNO})
    assert r.status_code == 200
    body = r.json()
    assert body["empno"] == EL_EMPNO
    assert body["role"] in ("elpm", "staff", "admin")
    # token 필드는 더 이상 존재하지 않음
    assert "token" not in body
    # Set-Cookie 헤더 확인
    cookies = r.cookies
    assert SESSION_COOKIE_NAME in cookies
    # httpOnly flag 는 response.headers 에서 직접 확인
    set_cookie = r.headers.get("set-cookie", "")
    assert "HttpOnly" in set_cookie
    assert "SameSite=lax" in set_cookie.lower() or "samesite=lax" in set_cookie.lower()


def test_login_unknown_empno_returns_401_and_logs_failure(client):
    r = client.post("/api/v1/auth/login", json={"empno": BOGUS_EMPNO})
    assert r.status_code == 401
    # login_log 에 실패 기록
    db = SessionLocal()
    try:
        log = db.query(LoginLog).filter(LoginLog.empno == BOGUS_EMPNO).first()
        assert log is not None
        assert log.success is False
    finally:
        db.close()


def test_login_staff_empno_returns_staff_role(client):
    r = client.post("/api/v1/auth/login", json={"empno": STAFF_EMPNO})
    assert r.status_code == 200
    assert r.json()["role"] == "staff"


def test_me_returns_user_with_valid_cookie(client):
    client.post("/api/v1/auth/login", json={"empno": EL_EMPNO})
    r = client.get("/api/v1/auth/me")
    assert r.status_code == 200
    body = r.json()
    assert body["empno"] == EL_EMPNO


def test_me_returns_401_without_cookie(client):
    client.cookies.clear()
    r = client.get("/api/v1/auth/me")
    assert r.status_code == 401


def test_logout_clears_cookie_and_revokes_session(client):
    client.post("/api/v1/auth/login", json={"empno": EL_EMPNO})
    r = client.post("/api/v1/auth/logout")
    assert r.status_code == 200
    # 이후 /me 는 401
    r2 = client.get("/api/v1/auth/me")
    assert r2.status_code == 401
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd backend && pytest tests/test_auth_endpoints.py -v
```

Expected: 테스트들이 실패 (기존 /login 은 token 을 반환해서 `assert "token" not in body` 에서 실패).

- [ ] **Step 3: `auth.py` 를 쿠키 기반으로 재작성**

Replace entire contents of `backend/app/api/v1/auth.py`:

```python
"""Cookie-based authentication endpoints (empno-only)."""
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.db.session import get_db
from app.models.project import Project
from app.models.budget import BudgetDetail
from app.models.budget_master import ProjectMember, PartnerAccessConfig
from app.models.employee import Employee
from app.models.session import LoginLog
from app.core.sessions import (
    SESSION_COOKIE_NAME,
    SESSION_DURATION,
    create_session,
    revoke_session,
)

router = APIRouter()


class LoginRequest(BaseModel):
    empno: str


class UserResponse(BaseModel):
    empno: str
    name: str
    role: str   # 'elpm' | 'staff' | 'admin'
    department: str | None = None


def _compute_role_and_scope(db: Session, empno: str) -> tuple[str, str]:
    """Return (role, scope) for the given empno."""
    cfg = db.query(PartnerAccessConfig).filter(PartnerAccessConfig.empno == empno).first()
    if cfg and cfg.scope == "all":
        return "admin", "all"

    elpm = db.query(Project).filter(
        or_(Project.el_empno == empno, Project.pm_empno == empno)
    ).first()
    if elpm:
        return "elpm", (cfg.scope if cfg else "self")

    # Azure SQL 에만 EL/PM 이 있을 수도 있으므로 cache 도 확인
    from app.services import azure_service
    try:
        azure_projects = azure_service.search_azure_projects("", limit=99999)
        for ap in azure_projects:
            if ap.get("el_empno") == empno or ap.get("pm_empno") == empno:
                return "elpm", "self"
    except Exception:
        pass

    member = db.query(ProjectMember).filter(ProjectMember.empno == empno).first()
    if member:
        return "staff", "self"
    bd = db.query(BudgetDetail).filter(BudgetDetail.empno == empno).first()
    if bd:
        return "staff", "self"

    return "staff", "self"  # 기본 — 본인 데이터만 보게 됨


def _resolve_name(db: Session, empno: str) -> tuple[str, str | None]:
    """Return (name, department)."""
    emp = db.query(Employee).filter(Employee.empno == empno).first()
    if emp and emp.emp_status and emp.emp_status.strip() in ("재직", "ACTIVE"):
        return emp.name, emp.department
    # 직원 마스터에 없으면 프로젝트에서 이름 추론
    p = db.query(Project).filter(
        or_(Project.el_empno == empno, Project.pm_empno == empno)
    ).first()
    if p:
        nm = p.el_name if p.el_empno == empno else p.pm_name
        return (nm or empno), None
    m = db.query(ProjectMember).filter(ProjectMember.empno == empno).first()
    if m and m.name:
        return m.name, None
    bd = db.query(BudgetDetail).filter(BudgetDetail.empno == empno).first()
    if bd and bd.emp_name:
        return bd.emp_name, None
    return empno, None


def _log_login(
    db: Session, *, empno: str | None, success: bool, reason: str | None, request: Request
) -> None:
    db.add(LoginLog(
        empno=empno,
        success=success,
        failure_reason=reason,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent", "")[:500],
    ))
    db.commit()


def _is_secure_request(request: Request) -> bool:
    return request.url.scheme == "https"


@router.post("/login", response_model=UserResponse)
def login(
    req: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    empno = req.empno.strip()
    if not empno:
        _log_login(db, empno=None, success=False, reason="empty", request=request)
        raise HTTPException(status_code=401, detail="사번을 입력해주세요.")

    # 직원 마스터에서 재직자 확인 — 없으면 EL/PM/멤버 매칭 허용 (backward-compat)
    emp = db.query(Employee).filter(Employee.empno == empno).first()
    if emp is not None and emp.emp_status and emp.emp_status.strip() not in ("재직", "ACTIVE"):
        _log_login(db, empno=empno, success=False, reason="inactive", request=request)
        raise HTTPException(status_code=401, detail="퇴사 처리된 사번입니다.")

    role, scope = _compute_role_and_scope(db, empno)
    if role == "staff":
        # staff 중에서도 실제로 DB 에 흔적이 없으면 거부
        has_trace = (
            emp is not None
            or db.query(ProjectMember).filter(ProjectMember.empno == empno).first() is not None
            or db.query(BudgetDetail).filter(BudgetDetail.empno == empno).first() is not None
        )
        if not has_trace:
            _log_login(db, empno=empno, success=False, reason="not_found", request=request)
            raise HTTPException(status_code=401, detail="등록되지 않은 사번입니다.")

    name, department = _resolve_name(db, empno)

    sid = create_session(
        db,
        empno=empno,
        role=role,
        scope=scope,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent", "")[:500],
    )
    _log_login(db, empno=empno, success=True, reason=None, request=request)

    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=sid,
        httponly=True,
        secure=_is_secure_request(request),
        samesite="lax",
        path="/",
        # Max-Age 미설정 → 브라우저 세션 쿠키
    )
    return UserResponse(empno=empno, name=name, role=role, department=department)


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    sid = request.cookies.get(SESSION_COOKIE_NAME)
    if sid:
        revoke_session(db, sid)
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        secure=_is_secure_request(request),
        samesite="lax",
        httponly=True,
    )
    return {"ok": True}


@router.get("/me", response_model=UserResponse)
def me(request: Request, db: Session = Depends(get_db)):
    from app.api.deps import get_current_user
    user = get_current_user(request=request, db=db)
    name, department = _resolve_name(db, user["empno"])
    return UserResponse(empno=user["empno"], name=name, role=user["role"], department=department)
```

- [ ] **Step 4: (Task 5 에서 `get_current_user` 구현하므로 테스트는 아직 일부 실패 가능)**

여기서는 `/login` 과 `/logout` 테스트만 돌려 확인:

```bash
cd backend && pytest tests/test_auth_endpoints.py::test_login_success_sets_cookie tests/test_auth_endpoints.py::test_login_unknown_empno_returns_401_and_logs_failure tests/test_auth_endpoints.py::test_login_staff_empno_returns_staff_role -v
```

Expected: 3 tests pass. `test_me_*` 와 `test_logout_*` 는 Task 5 완료 후 통과.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/auth.py backend/tests/test_auth_endpoints.py
git commit -m "feat(s0): rewrite /auth endpoints with cookie-based sessions"
```

---

## Task 5: `get_current_user` 의존성을 쿠키 기반으로 교체 + 권한 가드 추가

**Files:**
- Modify: `backend/app/api/deps.py`
- Create: `backend/tests/test_deps_auth.py`

**Background:** 기존 `deps.py` 의 `get_current_user` 는 `Authorization` 헤더 기반. 쿠키 기반으로 교체하고, 권한 가드 `require_elpm`, `require_admin` 과 리소스 헬퍼 2개를 한 파일에 추가한다.

- [ ] **Step 1: 실패 테스트 작성**

Create `backend/tests/test_deps_auth.py`:

```python
"""Tests for cookie-based get_current_user and permission helpers."""
import pytest
from fastapi import HTTPException
from unittest.mock import MagicMock
from starlette.requests import Request

from app.api.deps import (
    get_current_user,
    require_elpm,
    require_admin,
    assert_can_modify_project,
    assert_can_delete_project,
)
from app.core.sessions import SESSION_COOKIE_NAME, create_session
from app.db.session import SessionLocal
from app.models.session import Session as DBSession


@pytest.fixture
def db():
    s = SessionLocal()
    s.query(DBSession).filter(DBSession.empno.in_(["E1", "E2", "A1"])).delete()
    s.commit()
    yield s
    s.query(DBSession).filter(DBSession.empno.in_(["E1", "E2", "A1"])).delete()
    s.commit()
    s.close()


def _fake_request(cookie_value: str | None) -> Request:
    scope = {"type": "http", "headers": [], "cookies": {}}
    if cookie_value:
        scope["headers"] = [(b"cookie", f"{SESSION_COOKIE_NAME}={cookie_value}".encode())]
    return Request(scope)


def test_get_current_user_without_cookie_raises_401(db):
    req = _fake_request(None)
    with pytest.raises(HTTPException) as ex:
        get_current_user(request=req, db=db)
    assert ex.value.status_code == 401


def test_get_current_user_with_valid_cookie_returns_user(db):
    sid = create_session(db, empno="E1", role="elpm", scope="self")
    req = _fake_request(sid)
    u = get_current_user(request=req, db=db)
    assert u["empno"] == "E1"
    assert u["role"] == "elpm"


def test_require_elpm_denies_staff(db):
    sid = create_session(db, empno="E1", role="staff", scope="self")
    req = _fake_request(sid)
    u = get_current_user(request=req, db=db)
    with pytest.raises(HTTPException) as ex:
        require_elpm(u)
    assert ex.value.status_code == 403


def test_require_elpm_allows_elpm(db):
    sid = create_session(db, empno="E1", role="elpm", scope="self")
    req = _fake_request(sid)
    u = get_current_user(request=req, db=db)
    out = require_elpm(u)
    assert out["empno"] == "E1"


def test_require_admin_denies_elpm(db):
    sid = create_session(db, empno="E1", role="elpm", scope="self")
    req = _fake_request(sid)
    u = get_current_user(request=req, db=db)
    with pytest.raises(HTTPException) as ex:
        require_admin(u)
    assert ex.value.status_code == 403


def test_assert_can_modify_project_allows_el(db):
    # 실제 DB 에 projects 가 있어야 하므로 MagicMock 활용
    fake_db = MagicMock()
    fake_project = MagicMock(el_empno="E1", pm_empno="E2")
    fake_db.query.return_value.filter_by.return_value.first.return_value = fake_project
    user = {"empno": "E1", "role": "elpm"}
    assert_can_modify_project(fake_db, user, "PJ")  # 예외 없음


def test_assert_can_modify_project_denies_other(db):
    fake_db = MagicMock()
    fake_project = MagicMock(el_empno="E1", pm_empno="E2")
    fake_db.query.return_value.filter_by.return_value.first.return_value = fake_project
    user = {"empno": "X9", "role": "elpm"}
    with pytest.raises(HTTPException) as ex:
        assert_can_modify_project(fake_db, user, "PJ")
    assert ex.value.status_code == 403


def test_assert_can_modify_project_allows_admin(db):
    fake_db = MagicMock()
    fake_db.query.return_value.filter_by.return_value.first.return_value = MagicMock(
        el_empno="E1", pm_empno="E2"
    )
    user = {"empno": "A1", "role": "admin"}
    assert_can_modify_project(fake_db, user, "PJ")


def test_assert_can_delete_project_only_el(db):
    fake_db = MagicMock()
    fake_db.query.return_value.filter_by.return_value.first.return_value = MagicMock(
        el_empno="E1", pm_empno="E2"
    )
    # PM 은 삭제 불가
    with pytest.raises(HTTPException):
        assert_can_delete_project(fake_db, {"empno": "E2", "role": "elpm"}, "PJ")
    # EL 은 허용
    assert_can_delete_project(fake_db, {"empno": "E1", "role": "elpm"}, "PJ")
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd backend && pytest tests/test_deps_auth.py -v
```

Expected: `ImportError` (require_elpm 등 아직 없음) 또는 기존 `get_current_user` 가 `Header` 를 요구해 실패.

- [ ] **Step 3: `deps.py` 재작성**

Replace entire contents of `backend/app/api/deps.py`:

```python
"""Shared dependencies for API endpoints (cookie-based auth)."""
from fastapi import Depends, HTTPException, Request
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.sessions import (
    SESSION_COOKIE_NAME,
    get_session,
    touch_session,
)
from app.db.session import get_db
from app.models.project import Project


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    """Return current user from session cookie. Raises 401 if invalid."""
    sid = request.cookies.get(SESSION_COOKIE_NAME)
    s = get_session(db, sid) if sid else None
    if s is None:
        raise HTTPException(status_code=401, detail="세션이 만료되었거나 유효하지 않습니다.")
    touch_session(db, sid)
    return {
        "empno": s.empno,
        "role": s.role,   # 'elpm' | 'staff' | 'admin'
        "scope": s.scope,
    }


def get_optional_user(
    request: Request,
    db: Session = Depends(get_db),
) -> Optional[dict]:
    try:
        return get_current_user(request=request, db=db)
    except HTTPException:
        return None


def require_login(user: dict = Depends(get_current_user)) -> dict:
    return user


def require_elpm(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] not in ("elpm", "admin"):
        raise HTTPException(status_code=403, detail="EL/PM 권한이 필요합니다.")
    return user


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다.")
    return user


def assert_can_modify_project(db: Session, user: dict, project_code: str) -> None:
    """Raise 403 if user cannot modify this project."""
    if user["role"] == "admin":
        return
    p = db.query(Project).filter_by(project_code=project_code).first()
    if p is None:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")
    if user["empno"] not in (p.el_empno, p.pm_empno):
        raise HTTPException(status_code=403, detail="해당 프로젝트를 수정할 권한이 없습니다.")


def assert_can_delete_project(db: Session, user: dict, project_code: str) -> None:
    """Raise 403 if user cannot delete. Only EL or admin."""
    if user["role"] == "admin":
        return
    p = db.query(Project).filter_by(project_code=project_code).first()
    if p is None:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")
    if user["empno"] != p.el_empno:
        raise HTTPException(status_code=403, detail="프로젝트 삭제는 EL 만 가능합니다.")


def get_user_project_codes(db: Session, empno: str) -> list[str]:
    """(Existing helper) Return project_codes where user is EL/PM or a member."""
    from app.models.budget_master import ProjectMember, PartnerAccessConfig

    cfg = db.query(PartnerAccessConfig).filter(PartnerAccessConfig.empno == empno).first()

    if cfg and cfg.scope == "all":
        all_codes = db.query(Project.project_code).all()
        return [p.project_code for p in all_codes]

    if cfg and cfg.scope == "departments" and cfg.departments:
        dept_list = [d.strip() for d in cfg.departments.split(",") if d.strip()]
        dept_projects = db.query(Project.project_code).filter(
            Project.department.in_(dept_list)
        ).all()
        codes = {p.project_code for p in dept_projects}
        el_pm = db.query(Project.project_code).filter(
            or_(Project.el_empno == empno, Project.pm_empno == empno)
        ).all()
        codes.update(p.project_code for p in el_pm)
        return list(codes)

    el_pm = db.query(Project.project_code).filter(
        or_(Project.el_empno == empno, Project.pm_empno == empno)
    ).all()
    codes = {p.project_code for p in el_pm}

    member = db.query(ProjectMember.project_code).filter(
        ProjectMember.empno == empno
    ).distinct().all()
    codes.update(m.project_code for m in member)

    return list(codes)
```

- [ ] **Step 4: 테스트 실행 — 전부 통과**

```bash
cd backend && pytest tests/test_deps_auth.py tests/test_auth_endpoints.py -v
```

Expected: 모든 테스트 통과 (deps: 8개, auth: 6개).

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/deps.py backend/tests/test_deps_auth.py
git commit -m "feat(s0): cookie-based get_current_user + role/resource guards"
```

---

## Task 6: 기존 `conftest.py` 쿠키 기반으로 업데이트

**Files:**
- Modify: `backend/tests/conftest.py`

**Background:** 기존 `elpm_token`/`staff_token` 픽스처는 JWT 발급 — 이제 쿠키 기반이므로 **`session_cookie` 픽스처로 대체**. 이 단계에서 기존 테스트들(test_sync_employees, test_upsert_client 등)이 토큰을 사용하는지 확인 후 필요한 곳만 업데이트.

- [ ] **Step 1: 기존 테스트에서 `elpm_token`/`staff_token` 사용처 확인**

```bash
cd backend && grep -rn "elpm_token\|staff_token\|auth_header" tests/ | head -40
```

Expected: 사용처 리스트. 각 파일을 나중에 업데이트해야 할 대상으로 기록.

- [ ] **Step 2: `conftest.py` 재작성**

Replace entire contents of `backend/tests/conftest.py`:

```python
"""Shared fixtures for tests."""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.session import SessionLocal
from app.core.sessions import SESSION_COOKIE_NAME, create_session
from app.models.session import Session as DBSession


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


@pytest.fixture(scope="session")
def db():
    session = SessionLocal()
    yield session
    session.close()


def _ensure_session(empno: str, role: str) -> str:
    """Create a fresh session for the given empno and return its cookie value."""
    s = SessionLocal()
    try:
        s.query(DBSession).filter(DBSession.empno == empno, DBSession.revoked_at.is_(None)).update(
            {"revoked_at": __import__("datetime").datetime.utcnow()}
        )
        s.commit()
        return create_session(s, empno=empno, role=role, scope="self")
    finally:
        s.close()


@pytest.fixture(scope="session")
def elpm_cookie():
    """Session cookie for EL/PM user (최성우 170661)."""
    sid = _ensure_session("170661", "elpm")
    return {SESSION_COOKIE_NAME: sid}


@pytest.fixture(scope="session")
def staff_cookie():
    """Session cookie for Staff user (지해나 320915)."""
    sid = _ensure_session("320915", "staff")
    return {SESSION_COOKIE_NAME: sid}


@pytest.fixture(scope="session")
def admin_cookie():
    """Session cookie for admin user (from PartnerAccessConfig scope=all).
    ADMIN_EMPNO env var overrides — fallback 160553 matches Playwright tests."""
    import os
    empno = os.environ.get("ADMIN_EMPNO", "160553")
    sid = _ensure_session(empno, "admin")
    return {SESSION_COOKIE_NAME: sid}


def cookie_kwargs(cookie: dict) -> dict:
    """Helper: pass {"cookies": cookie} into TestClient requests."""
    return {"cookies": cookie}
```

- [ ] **Step 3: 기존 테스트 파일 업데이트 (Step 1 에서 찾은 파일 대상)**

각 파일에서 `auth_header(elpm_token)` → `cookies=elpm_cookie`, `auth_header(staff_token)` → `cookies=staff_cookie`. 예시:

Before:
```python
res = client.get("/api/v1/sync/employees/status", headers=auth_header(elpm_token))
```

After:
```python
res = client.get("/api/v1/sync/employees/status", cookies=elpm_cookie)
```

대상 파일 (Step 1 결과에 따라 조정):
- `backend/tests/test_sync_employees.py`
- `backend/tests/test_sync_clients.py`
- `backend/tests/test_upsert_client.py`
- `backend/tests/test_task6_budget_actual.py`

각 파일의 fixture 파라미터 (`elpm_token` → `elpm_cookie`) 와 호출부를 일괄 치환.

- [ ] **Step 4: 전체 pytest 실행해 회귀 없는지 확인**

```bash
cd backend && pytest -x
```

Expected: 모든 테스트 통과 (또는 Azure 의존 테스트는 스킵/실패 허용 — 기존 동작과 동일하게).

- [ ] **Step 5: Commit**

```bash
git add backend/tests/
git commit -m "test(s0): migrate conftest + existing tests to cookie-based auth"
```

---

## Task 7: 쓰기 엔드포인트에 권한 가드 적용

**Files:**
- Modify: `backend/app/api/v1/budget_input.py`
- Modify: `backend/app/api/v1/budget_upload.py`
- Modify: `backend/app/api/v1/sync.py`
- Modify: `backend/app/api/v1/admin.py`
- Modify: `backend/app/api/v1/projects.py` (쓰기 엔드포인트 있으면)

**Background:** spec 7절 표 기준으로 각 엔드포인트에 `require_elpm` / `require_admin` / `assert_can_modify_project` / `assert_can_delete_project` 적용. 기존 `get_current_user` 는 그대로 호출 가능 (dep.py 에서 쿠키로 교체됨).

- [ ] **Step 1: 쓰기 엔드포인트 목록 뽑기**

```bash
cd backend && grep -rn "@router\.\(post\|put\|delete\|patch\)" app/api/v1/ | head -80
```

Expected: 모든 쓰기 엔드포인트 리스트. 각 줄에 대해 권한 요구사항 기록.

- [ ] **Step 2: `budget_input.py` 업데이트**

각 POST/PUT/DELETE 엔드포인트에서 `user = Depends(get_current_user)` 를 `user = Depends(require_elpm)` 로 변경하고, 프로젝트별 엔드포인트는 함수 본문 초입에 권한 체크 추가:

예시 패턴 — 기존:
```python
@router.put("/projects/{project_code}")
def update_project(project_code: str, ..., user = Depends(get_current_user), db = Depends(get_db)):
    ...
```

변경:
```python
from app.api.deps import require_elpm, assert_can_modify_project
from app.api.deps import assert_can_delete_project

@router.put("/projects/{project_code}")
def update_project(
    project_code: str, ...,
    user = Depends(require_elpm),
    db = Depends(get_db),
):
    assert_can_modify_project(db, user, project_code)
    ...
```

새 프로젝트 생성(POST `/projects`) 은 `require_elpm` + "user.empno 가 body 의 el_empno 또는 pm_empno 와 일치해야 함" 검증 추가 (admin 제외):

```python
@router.post("/projects")
def create_project(body: ..., user = Depends(require_elpm), db = Depends(get_db)):
    if user["role"] != "admin":
        if user["empno"] not in (body.el_empno, body.pm_empno):
            raise HTTPException(
                status_code=403,
                detail="본인이 EL 또는 PM 인 프로젝트만 생성할 수 있습니다.",
            )
    ...
```

구체 endpoint 매핑 (spec 7절):
- `POST /budget/projects` → `require_elpm` + 생성자 EL/PM 일치 체크
- `PUT /budget/projects/{project_code}` → `require_elpm` + `assert_can_modify_project`
- `DELETE /budget/projects/{project_code}` → `require_elpm` + `assert_can_delete_project`
- `POST /budget/projects/{project_code}/members` → `require_elpm` + `assert_can_modify_project`
- `PUT /budget/projects/{project_code}/members` → `require_elpm` + `assert_can_modify_project`
- `PUT /budget/projects/{project_code}/template` → `require_elpm` + `assert_can_modify_project`

- [ ] **Step 3: `budget_upload.py` 업데이트**

```python
from app.api.deps import require_elpm
# Excel 업로드 (POST /budget/upload):
@router.post("/upload", ...)
def upload_budget(..., user = Depends(require_elpm), db = Depends(get_db)):
    ...
```

- [ ] **Step 4: `sync.py` / `admin.py` 의 쓰기 엔드포인트 — `require_admin` 적용**

```python
from app.api.deps import require_admin
@router.post("/employees")
def sync_employees_endpoint(..., user = Depends(require_admin), ...):
    ...
```

기존 `admin.py` 안에서 이미 scope=all 체크를 수동으로 하던 부분은 `require_admin` 으로 일괄 교체.

- [ ] **Step 5: 권한 회귀 테스트 — 수동 확인**

```bash
cd backend && pytest tests/test_auth_endpoints.py tests/test_deps_auth.py tests/test_sync_employees.py -v
```

Expected: 모두 통과 (test_sync_employees 의 non-admin 거부 테스트가 이제 403 로 실제 차단).

- [ ] **Step 6: Staff 계정이 budget-input 생성 차단되는지 통합 테스트 추가**

Add to `backend/tests/test_auth_endpoints.py`:

```python
def test_staff_cannot_create_project(client):
    client.post("/api/v1/auth/login", json={"empno": STAFF_EMPNO})
    r = client.post("/api/v1/budget/projects", json={
        "project_code": "TEST_S0_PJ_1",
        "project_name": "스태프 거부 테스트",
        "el_empno": EL_EMPNO,
        "pm_empno": EL_EMPNO,
        "contract_hours": 100,
    })
    # 403 가 기대값. body 검증 실패 시 422 가 먼저 나올 수 있지만,
    # require_elpm dependency 는 body 검증 전에 평가되어야 하므로 401/403 여야 한다.
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code} ({r.text})"
```

실행:
```bash
cd backend && pytest tests/test_auth_endpoints.py::test_staff_cannot_create_project -v
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/v1/ backend/tests/test_auth_endpoints.py
git commit -m "feat(s0): require EL/PM or admin for all write endpoints"
```

---

## Task 8: 관리자용 세션 관리 API

**Files:**
- Modify: `backend/app/api/v1/admin.py`

**Background:** spec 9절 — 관리자가 세션 revoke / 감사 로그 조회 할 수 있게 한다.

- [ ] **Step 1: 엔드포인트 4개 추가**

Edit `backend/app/api/v1/admin.py` — 파일 하단에 추가 (기존 router 를 재사용):

```python
# ===== Session / Login Audit (S0) =====
from app.models.session import Session as DBSession
from app.models.session import LoginLog
from app.core.sessions import revoke_session, revoke_all_sessions_for_empno
from app.api.deps import require_admin
from sqlalchemy import desc


@router.get("/sessions")
def list_sessions(
    empno: str | None = None,
    only_active: bool = True,
    limit: int = 100,
    user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(DBSession)
    if empno:
        q = q.filter(DBSession.empno == empno)
    if only_active:
        q = q.filter(DBSession.revoked_at.is_(None))
    rows = q.order_by(desc(DBSession.created_at)).limit(limit).all()
    return [
        {
            "session_id": r.session_id[:8] + "…",
            "empno": r.empno,
            "role": r.role,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "expires_at": r.expires_at.isoformat() if r.expires_at else None,
            "last_seen_at": r.last_seen_at.isoformat() if r.last_seen_at else None,
            "ip": r.ip,
            "user_agent": r.user_agent,
            "revoked_at": r.revoked_at.isoformat() if r.revoked_at else None,
        }
        for r in rows
    ]


@router.delete("/sessions/by-empno/{empno}")
def revoke_all_for_user(
    empno: str,
    user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    n = revoke_all_sessions_for_empno(db, empno)
    return {"revoked": n}


@router.get("/login-log")
def list_login_log(
    empno: str | None = None,
    limit: int = 200,
    user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(LoginLog)
    if empno:
        q = q.filter(LoginLog.empno == empno)
    rows = q.order_by(desc(LoginLog.logged_in_at)).limit(limit).all()
    return [
        {
            "id": r.id,
            "empno": r.empno,
            "logged_in_at": r.logged_in_at.isoformat() if r.logged_in_at else None,
            "success": r.success,
            "failure_reason": r.failure_reason,
            "ip": r.ip,
            "user_agent": r.user_agent,
        }
        for r in rows
    ]
```

(`Depends`, `get_db`, `Session` 은 파일 상단에 이미 import 되어 있을 것 — 없으면 추가.)

- [ ] **Step 2: Sanity check — TestClient 로 200 응답 확인**

```bash
cd backend && python -c "
from fastapi.testclient import TestClient
from app.main import app
from app.core.sessions import SESSION_COOKIE_NAME, create_session
from app.db.session import SessionLocal

db = SessionLocal()
import os
sid = create_session(db, empno=os.environ.get('ADMIN_EMPNO','160553'), role='admin', scope='all')
db.close()

c = TestClient(app)
r = c.get('/api/v1/admin/sessions', cookies={SESSION_COOKIE_NAME: sid})
print(r.status_code, len(r.json()))
r2 = c.get('/api/v1/admin/login-log', cookies={SESSION_COOKIE_NAME: sid})
print(r2.status_code, len(r2.json()))
"
```

Expected: `200 <n>` 두 줄.

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/v1/admin.py
git commit -m "feat(s0): admin endpoints for session list/revoke and login audit"
```

---

## Task 9: 만료 세션 정리 크론 추가

**Files:**
- Modify: `backend/app/main.py`

**Background:** 30일 이상 된 만료 세션을 주 1회 삭제. APScheduler 는 이미 사용 중.

- [ ] **Step 1: main.py 에 job 추가**

Edit `backend/app/main.py` — 기존 `start_scheduler()` 내부, `_scheduled_employee_sync` add_job 바로 아래에 추가:

```python
def _scheduled_session_cleanup():
    """매주 일요일 03:00 KST 에 30일 경과한 만료 세션 제거."""
    from app.db.session import SessionLocal
    from app.core.sessions import cleanup_expired_sessions
    logger = logging.getLogger("scheduler")
    db = SessionLocal()
    try:
        n = cleanup_expired_sessions(db, older_than_days=30)
        logger.info(f"Scheduled session cleanup: deleted {n} rows")
    except Exception as e:
        logger.error(f"Scheduled session cleanup failed: {e}")
    finally:
        db.close()
```

그리고 기존 `start_scheduler()` 안에 다음 add_job 추가:

```python
        _scheduler.add_job(
            _scheduled_session_cleanup,
            "cron",
            day_of_week="sun",
            hour=3,
            id="session_cleanup",
            replace_existing=True,
        )
```

- [ ] **Step 2: Sanity check — cleanup 함수 단위 실행 성공**

```bash
cd backend && python -c "
from app.db.session import SessionLocal
from app.core.sessions import cleanup_expired_sessions
s = SessionLocal()
print('deleted:', cleanup_expired_sessions(s, older_than_days=30))
s.close()
"
```

Expected: `deleted: <int>` (0 또는 양수).

- [ ] **Step 3: Commit**

```bash
git add backend/app/main.py
git commit -m "chore(s0): weekly cleanup of expired sessions (>30d)"
```

---

## Task 10: Frontend — `lib/auth.tsx` 쿠키 기반으로 재작성

**Files:**
- Modify: `frontend/src/lib/auth.tsx`

**Background:** `localStorage` 토큰 제거. `credentials: "include"` 전제. 서버 `/auth/me` 로 현재 사용자 정보 확인. `getAuthHeaders` / `getStoredToken` 은 삭제 (더 이상 필요 없음).

- [ ] **Step 1: 파일 재작성**

Replace entire contents of `frontend/src/lib/auth.tsx`:

```tsx
"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export type UserRole = "elpm" | "staff" | "admin";

interface AuthUser {
  empno: string;
  name: string;
  role: UserRole;
  department: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (empno: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  loading: true,
  login: async () => { throw new Error("not ready"); },
  logout: async () => {},
  refresh: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/me`, {
        credentials: "include",
      });
      if (!res.ok) {
        setUser(null);
        return;
      }
      const data = (await res.json()) as AuthUser;
      setUser(data);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const login = useCallback(async (empno: string): Promise<AuthUser> => {
    const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ empno }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || "로그인에 실패했습니다.");
    }
    const data = (await res.json()) as AuthUser;
    setUser(data);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/v1/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      /* ignore */
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        login,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
```

- [ ] **Step 2: TypeScript 컴파일 확인**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -40
```

Expected: `getStoredToken` / `getAuthHeaders` 를 임포트하던 파일들에서 에러 발생 — 다음 Task 들에서 수정.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/auth.tsx
git commit -m "feat(s0): rewrite AuthProvider for cookie-based session"
```

---

## Task 11: Frontend — `lib/api.ts` 를 credentials: include 기반으로 재작성

**Files:**
- Modify: `frontend/src/lib/api.ts`

**Background:** `Authorization: Bearer` 헤더 제거. 401 리다이렉트는 유지하되 `localStorage.removeItem` 호출 제거.

- [ ] **Step 1: 파일 재작성**

Replace entire contents of `frontend/src/lib/api.ts`:

```ts
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

function redirectToLogin() {
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
}

export async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (res.status === 401) {
    redirectToLogin();
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return res.json();
}

export async function uploadFile(path: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });
  if (res.status === 401) {
    redirectToLogin();
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`Upload Error: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2: tsc 재실행하여 다음 위치 확인**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "getStoredToken|getAuthHeaders|auth_user|Bearer" | head
```

Expected: `getStoredToken` / `getAuthHeaders` / `auth_user` / `Bearer` 를 사용 중인 파일 목록.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(s0): fetchAPI uses credentials:include, no Bearer header"
```

---

## Task 12: Frontend — `Header.tsx`, `login/page.tsx`, 기타 localStorage 사용 제거

**Files:**
- Modify: `frontend/src/components/layout/Header.tsx`
- Modify: `frontend/src/app/login/page.tsx`
- Modify: 기타 `localStorage.*auth_user*` 사용 파일 전체

**Background:** `getStoredToken` / `localStorage.getItem("auth_user")` / `Authorization: Bearer` 수동 삽입 전부 제거.

- [ ] **Step 1: 사용처 목록**

```bash
cd frontend && grep -rn "auth_user\|getStoredToken\|Authorization.*Bearer\|Authorization:.*token" src/ --include="*.tsx" --include="*.ts" | head -60
```

Expected: 파일 목록.

- [ ] **Step 2: `Header.tsx` — `ProjectDetailsDropdown` 의 localStorage 제거**

Edit `frontend/src/components/layout/Header.tsx:144-163` (checkAccess 함수):

Before (134-163 부근):
```tsx
  useEffect(() => {
    const checkAccess = async () => {
      try {
        const stored = localStorage.getItem("auth_user");
        const token = stored ? JSON.parse(stored).token : "";
        if (!token) return;
        const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        const res = await fetch(`${apiBase}/api/v1/tracking/access`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setHasPartnerAccess(data.has_access === true);
        }
      } catch {
        /* ignore */
      }
    };
    checkAccess();
  }, []);
```

After:
```tsx
  useEffect(() => {
    const checkAccess = async () => {
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        const res = await fetch(`${apiBase}/api/v1/tracking/access`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setHasPartnerAccess(data.has_access === true);
        }
      } catch {
        /* ignore */
      }
    };
    checkAccess();
  }, []);
```

또한 `Header.tsx:266` 의 `isStaff` 판정을 새 role 이름에 맞게 변경:

Before:
```tsx
const isStaff = user?.role === "Staff";
```

After:
```tsx
const isStaff = user?.role === "staff";
```

- [ ] **Step 3: `handleLogout` 을 async 로 변환**

`Header.tsx:268-271`:

Before:
```tsx
  const handleLogout = () => {
    logout();
    router.replace("/login");
  };
```

After:
```tsx
  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };
```

- [ ] **Step 4: `login/page.tsx` — localStorage 제거 + role 판정 변경**

Replace entire contents of `frontend/src/app/login/page.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const [empno, setEmpno] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { user, login, isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && isAuthenticated && user) {
      router.replace(user.role === "staff" ? "/overview-person" : "/");
    }
  }, [loading, isAuthenticated, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empno.trim()) {
      setError("사번을 입력해주세요.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const u = await login(empno.trim());
      router.replace(u.role === "staff" ? "/overview-person" : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F3F3F3]">
      <div className="w-full max-w-[440px] bg-white rounded-xl shadow-sm border border-pwc-gray-100/60 p-10">
        <div className="flex justify-center mb-5">
          <Image
            src="/pwc-logo.png"
            alt="PwC"
            width={72}
            height={40}
            style={{ width: "auto", height: "auto" }}
            className="object-contain"
          />
        </div>

        <h1 className="text-2xl font-bold text-center text-pwc-black mb-1">
          My Budget+
        </h1>
        <p className="text-sm text-pwc-gray-600 text-center mb-8">
          사번을 입력하여 서비스를 이용하세요.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-pwc-black mb-2">
              사번
            </label>
            <input
              type="text"
              placeholder="사번을 입력하세요"
              value={empno}
              onChange={(e) => setEmpno(e.target.value)}
              className="w-full px-4 py-3.5 border border-pwc-gray-200 rounded-lg bg-pwc-gray-50 text-pwc-gray-900 text-sm placeholder-pwc-gray-600 focus:outline-none focus:border-pwc-orange focus:bg-white transition-colors"
              autoFocus
            />
          </div>

          {error && (
            <div className="text-sm text-pwc-red bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 bg-pwc-orange text-white font-semibold rounded-lg hover:bg-[#B83D02] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {submitting ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Step 1 에서 찾은 나머지 파일 업데이트**

Step 1 의 grep 결과에 대해 각 매치를 아래 규칙으로 일괄 치환:

| 기존 패턴 | 변경 |
|---|---|
| `const stored = localStorage.getItem("auth_user");` / `JSON.parse(stored).token` / 관련 로직 | **블록 전체 삭제** 후 `fetch(..., { credentials: "include" })` 로 직접 호출하거나 `fetchAPI()` 사용 |
| `localStorage.removeItem("auth_user");` | **삭제** (로그아웃은 `useAuth().logout()` 가 처리) |
| `headers: { Authorization: \`Bearer ${token}\` }` | `credentials: "include"` (헤더에서 Authorization 제거) |
| `user?.role === "Staff"` | `user?.role === "staff"` |
| `user?.role === "EL/PM"` | `user?.role === "elpm"` |
| `import { getStoredToken } from "@/lib/auth";` | **import 라인 삭제** + 해당 토큰 사용부도 제거 |

추가 예상 수정 파일 (grep 결과에 있으면):
- `frontend/src/app/(dashboard)/layout.tsx` — 전역 인증 가드
- `frontend/src/app/(dashboard)/budget-input/**` — 업로드 hook
- `frontend/src/app/(dashboard)/admin/**` — admin 페이지
- `frontend/src/app/(dashboard)/appendix/page.tsx` — 다운로드 버튼
- `frontend/src/components/**` — 필터/차트에서 직접 fetch 하는 컴포넌트

각 파일 수정 후 `npx tsc --noEmit` 이 통과해야 다음 Step 으로 이동.

- [ ] **Step 6: TypeScript 컴파일 — 에러 0 확인**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 출력 없음(성공).

- [ ] **Step 7: `npm run build` — 프로덕션 빌드 성공 확인**

```bash
cd frontend && npm run build
```

Expected: 빌드 성공.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/
git commit -m "feat(s0): remove localStorage/Bearer; all fetches use credentials:include"
```

---

## Task 13: CORS 설정 확인 — 쿠키 송수신 가능해야 함

**Files:**
- Modify: `backend/app/core/config.py`
- Modify: `backend/app/main.py`

**Background:** `allow_credentials=True` 는 이미 설정됨. 다만 `allow_origins` 가 와일드카드면 쿠키를 못 싣는다 — 정확한 origin 지정 확인.

- [ ] **Step 1: 현재 CORS 설정 검토**

Read `backend/app/main.py:92-99` — 이미:
```python
allow_origins=[settings.FRONTEND_URL, "http://localhost:8001"],
allow_credentials=True,
```

`settings.FRONTEND_URL` 기본값은 `http://localhost:8001`. `FRONTEND_URL` 환경변수에 실제 배포 URL(`http://10.137.206.166`) 이 들어있는지 `.env` 확인.

```bash
cd backend && grep -E "^FRONTEND_URL" .env 2>/dev/null || echo "FRONTEND_URL not in .env"
```

- [ ] **Step 2: 배포 URL 포함 — 누락 시 추가**

If missing, append to `backend/.env`:

```
FRONTEND_URL=http://10.137.206.166
```

(실제 프로덕션 URL 을 user 에게 확인하고 정확한 값으로 교체. scheme/port 모두 포함.)

- [ ] **Step 3: 로컬에서 쿠키 동작 확인**

```bash
cd backend && uvicorn app.main:app --reload --port 3001 &
sleep 3
curl -i -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{"empno":"170661"}'
```

Expected response header 에 `Set-Cookie: mybudget_session=...; HttpOnly; SameSite=lax; Path=/` 포함.

- [ ] **Step 4: Commit (환경파일은 보통 gitignore 처리 — 변경 없으면 스킵)**

```bash
git status backend/.env backend/app/core/config.py
```

변경 사항 있으면:

```bash
git add backend/app/core/config.py
git commit -m "chore(s0): CORS origin verified for cookie-based auth"
```

없으면 이 커밋 스킵.

---

## Task 14: 기존 JWT 코드 삭제

**Files:**
- Modify: `backend/app/core/security.py`

**Background:** `create_token` / `decode_token` 은 더 이상 쓰이지 않음. 전체 grep 으로 확인한 뒤 삭제.

- [ ] **Step 1: 사용처 재확인**

```bash
cd backend && grep -rn "create_token\|decode_token" app/ tests/ 2>/dev/null
```

Expected: 모든 참조가 삭제됐으면 결과 없음. 남은 것 있으면 먼저 정리.

- [ ] **Step 2: `security.py` 비우기**

Replace entire contents of `backend/app/core/security.py`:

```python
"""(Retired) JWT-based auth was replaced by cookie-based sessions.

This module is intentionally left empty. See app.core.sessions for the
current session logic and app.api.deps for auth dependencies.

When Azure AD SSO is added, the token validation helper can live here.
"""
```

- [ ] **Step 3: import 누락 없는지 확인**

```bash
cd backend && python -c "from app.main import app; print('ok')"
```

Expected: `ok`.

- [ ] **Step 4: 프론트엔드 `getStoredToken` 제거 확인**

```bash
cd frontend && grep -rn "getStoredToken" src/
```

Expected: 결과 없음. 있으면 삭제.

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/security.py
git commit -m "chore(s0): retire JWT code — sessions module now owns auth"
```

---

## Task 15: Playwright E2E — 로그인 / 세션 / 권한 / 프로덕션 오버레이

**Files:**
- Create: `frontend/tests/task-auth-login.spec.ts`
- Create: `frontend/tests/task-auth-session.spec.ts`
- Create: `frontend/tests/task-auth-authorization.spec.ts`
- Create: `frontend/tests/task-auth-prod-overlay.spec.ts`

**Background:** 기존 `task-azure-employee-sync.spec.ts` 패턴을 따른다. `request.post("/auth/login")` 후 쿠키 자동 보관, 이후 `request.get(...)` 은 같은 context 로 재사용.

- [ ] **Step 1: `task-auth-login.spec.ts` 작성**

Create `frontend/tests/task-auth-login.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

const API = "http://localhost:3001/api/v1";
const EL = process.env.EL_EMPNO || "170661";
const STAFF = process.env.STAFF_EMPNO || "320915";

test.describe("S0 — Auth Login", () => {
  test("valid empno returns user and sets httpOnly cookie", async ({ request }) => {
    const res = await request.post(`${API}/auth/login`, { data: { empno: EL } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.empno).toBe(EL);
    expect(body.role).toMatch(/^(elpm|admin|staff)$/);
    const setCookie = res.headers()["set-cookie"] || "";
    expect(setCookie).toContain("mybudget_session=");
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
    // token 필드는 응답에 없어야 함
    expect(body.token).toBeUndefined();
  });

  test("unknown empno returns 401", async ({ request }) => {
    const res = await request.post(`${API}/auth/login`, { data: { empno: "ZZZZZZ" } });
    expect(res.status()).toBe(401);
  });

  test("staff empno returns role=staff", async ({ request }) => {
    const res = await request.post(`${API}/auth/login`, { data: { empno: STAFF } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("staff");
  });

  test("GET /auth/me returns current user after login", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const me = await request.get(`${API}/auth/me`);
    expect(me.status()).toBe(200);
    const body = await me.json();
    expect(body.empno).toBe(EL);
  });
});
```

- [ ] **Step 2: `task-auth-session.spec.ts` 작성**

Create `frontend/tests/task-auth-session.spec.ts`:

```ts
import { test, expect, request as pwRequest } from "@playwright/test";

const API = "http://localhost:3001/api/v1";
const EL = process.env.EL_EMPNO || "170661";

test.describe("S0 — Auth Session", () => {
  test("GET /auth/me without cookie is 401", async ({ playwright }) => {
    const ctx = await playwright.request.newContext();
    const res = await ctx.get(`${API}/auth/me`);
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test("logout revokes session and /auth/me becomes 401", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: EL } });
    const meOk = await request.get(`${API}/auth/me`);
    expect(meOk.status()).toBe(200);
    const logout = await request.post(`${API}/auth/logout`);
    expect(logout.status()).toBe(200);
    const meAfter = await request.get(`${API}/auth/me`);
    expect(meAfter.status()).toBe(401);
  });

  test("different request context has isolated cookie jar", async ({ playwright }) => {
    const ctxA = await playwright.request.newContext();
    const ctxB = await playwright.request.newContext();
    await ctxA.post(`${API}/auth/login`, { data: { empno: EL } });
    const meA = await ctxA.get(`${API}/auth/me`);
    expect(meA.status()).toBe(200);
    // ctxB 는 로그인 안 했으므로 401
    const meB = await ctxB.get(`${API}/auth/me`);
    expect(meB.status()).toBe(401);
    await ctxA.dispose();
    await ctxB.dispose();
  });
});
```

- [ ] **Step 3: `task-auth-authorization.spec.ts` 작성**

Create `frontend/tests/task-auth-authorization.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

const API = "http://localhost:3001/api/v1";
const EL = process.env.EL_EMPNO || "170661";
const STAFF = process.env.STAFF_EMPNO || "320915";

test.describe("S0 — Auth Authorization", () => {
  test("staff cannot POST /budget/projects", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: STAFF } });
    const r = await request.post(`${API}/budget/projects`, {
      data: {
        project_code: "S0_TEST_PJ_STAFF",
        project_name: "Staff 거부",
        el_empno: EL,
        pm_empno: EL,
        contract_hours: 100,
      },
    });
    expect(r.status()).toBe(403);
  });

  test("staff cannot sync employees", async ({ request }) => {
    await request.post(`${API}/auth/login`, { data: { empno: STAFF } });
    const r = await request.post(`${API}/sync/employees`);
    expect([401, 403]).toContain(r.status());
  });

  test("unauthenticated request is 401", async ({ playwright }) => {
    const ctx = await playwright.request.newContext();
    const r = await ctx.post(`${API}/budget/projects`, { data: {} });
    expect(r.status()).toBe(401);
    await ctx.dispose();
  });
});
```

- [ ] **Step 4: `task-auth-prod-overlay.spec.ts` 작성**

Create `frontend/tests/task-auth-prod-overlay.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:8001";
const EL = process.env.EL_EMPNO || "170661";

test.describe("S0 — Production Build", () => {
  test("no Next.js dev overlay buttons on production page", async ({ page }) => {
    // 로그인
    await page.goto(`${FRONTEND}/login`);
    await page.fill('input[placeholder="사번을 입력하세요"]', EL);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(overview-person)?\/?$/);

    // Next dev overlay 는 data-nextjs-* 어트리뷰트나 <nextjs-portal> 웹 컴포넌트로 렌더됨
    // 프로덕션 빌드에서는 이 요소들이 아예 없어야 한다.
    await expect(page.locator("nextjs-portal")).toHaveCount(0);
    await expect(page.locator("[data-nextjs-toast]")).toHaveCount(0);
    await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  });
});
```

**Note:** 이 테스트는 `npm run start` 로 띄운 프로덕션 빌드 대상일 때 의미가 있다. CI/로컬에서 `npm run dev` 로 띄워 돌리면 오버레이가 존재해서 실패하는 게 정상 — `test.skip(DEV_MODE)` 가드는 붙이지 않고, "이 테스트는 반드시 prod 환경에서만 돌린다" 를 README 에 명시.

- [ ] **Step 5: 개별 실행 — 기본 4개 통과 확인**

사전 조건: backend `uvicorn` 3001 + frontend dev/prod 8001 띄워져 있어야 함.

```bash
cd frontend && npx playwright test task-auth-login task-auth-session task-auth-authorization --reporter=line
```

Expected: 모두 통과.

프로덕션 오버레이 테스트:
```bash
# 별도 터미널에서 프론트를 prod 빌드로 재기동 후:
cd frontend && npx playwright test task-auth-prod-overlay --reporter=line
```

Expected: 통과 (프로덕션 빌드라면).

- [ ] **Step 6: Commit**

```bash
git add frontend/tests/task-auth-*.spec.ts
git commit -m "test(s0): Playwright for login/session/authorization/prod-overlay"
```

---

## Task 16: 배포 파이프라인 확인 — `next start` 적용 (#35)

**Files:**
- Inspect & potentially modify: `frontend/package.json`, `Dockerfile`, `docker-compose.yml`, systemd unit, or PM2 config (whichever is used)

**Background:** #35 근본 원인은 `next dev` 로 프로덕션에 배포되었을 가능성. 실제 배포 방식을 확인해 `next build && next start` 로 교체.

- [ ] **Step 1: 현재 배포 방식 파악**

```bash
ls -la Dockerfile docker-compose.yml 2>/dev/null
cat frontend/package.json | grep -A 10 '"scripts"'
ls server_on.md 2>/dev/null && cat server_on.md
```

Expected: 현 배포 스크립트/방식 이해. (이 레포에는 `server_on.md` 가 있음.)

- [ ] **Step 2: 배포 스크립트에서 `next dev` 사용 여부 점검**

If any deployment command uses `npm run dev` / `next dev`, replace with:

```bash
cd frontend && npm ci && npm run build && npm run start -- --port 8001
```

그리고 `NODE_ENV=production` 환경변수 명시.

구체 변경 위치는 Step 1 에서 파악한 배포 방식에 따라:
- **systemd unit**: `ExecStart=` 라인 수정
- **docker-compose**: `command:` 필드 수정
- **PM2**: `ecosystem.config.js` 의 `script` 와 `args`

- [ ] **Step 3: 프로덕션 빌드 수동 검증**

```bash
cd frontend && NODE_ENV=production npm run build && NODE_ENV=production npm run start -- --port 8001 &
sleep 8
curl -s http://localhost:8001/login | grep -i "nextjs-portal\|data-nextjs-toast" | wc -l
kill %1 2>/dev/null
```

Expected: `0` (프로덕션 빌드에는 dev overlay 없음).

- [ ] **Step 4: Task 15 의 `task-auth-prod-overlay.spec.ts` 를 프로덕션 빌드에서 재실행**

```bash
cd frontend && npx playwright test task-auth-prod-overlay --reporter=line
```

Expected: 통과.

- [ ] **Step 5: Commit (배포 파일 변경 있는 경우만)**

```bash
git status
git add <changed deployment files>
git commit -m "chore(s0): ensure production deploy runs next start (#35)"
```

변경 없으면 스킵.

---

## Task 17: 수동 확인 — 실제 피드백 시나리오 재현

**Files:** 없음 (수동 검증 단계)

**Background:** spec 15절 성공 기준. 실제 배포 환경에서 검증.

- [ ] **Step 1: #34 재현 확인**

  1. 로그인
  2. 브라우저/컴퓨터 재시작
  3. 같은 URL 재방문 → **로그인 화면이 떠야 함** (자동 로그인 X)

- [ ] **Step 2: #48 세션 공유 확인**

  1. Chrome 에서 계정 A 로 로그인
  2. Edge 에서 같은 URL 열기 → **로그인 화면이 떠야 함** (다른 계정으로 자동 로그인 되지 않음)

- [ ] **Step 3: #48 권한 우회 확인**

  1. Staff 계정 (서보경 등) 로그인
  2. 주소창에 `/budget-input/new` 직접 입력
  3. → **접근 차단** 또는 403/401 페이지 (신규 프로젝트 폼이 보이면 실패)

- [ ] **Step 4: #35 Dev overlay 확인**

  프로덕션 URL 에서 DevTools Elements 탭 → `nextjs-portal` 등 검색 → **0건** 이어야 함.

- [ ] **Step 5: 감사 로그 조회 (관리자)**

  ```
  GET /api/v1/admin/login-log
  ```
  → 최근 로그인 기록(Step 1~3 에서 발생한 성공·실패) 가 보여야 함.

- [ ] **Step 6: PR 준비**

  ```bash
  git log --oneline main..HEAD
  ```

  결과 리뷰 후 PR 생성 (사용자 요청 시).

---

## 완료 기준 체크리스트

- [ ] Task 1~16 모든 단계 완료 (pytest + Playwright + tsc + build 통과)
- [ ] spec 15절 "성공 기준" 5개 항목 전부 충족
- [ ] 피드백 #23 / #34 / #35 / #48 각각에 대한 매핑 검증 완료
- [ ] 로컬 + 프로덕션 빌드 둘 다에서 로그인/로그아웃/권한 차단 동작
- [ ] PR 작성 준비 (요청 시)
