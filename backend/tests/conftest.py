"""Shared fixtures for tests."""
import os
from datetime import datetime

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


def _ensure_session(empno: str, role: str, scope: str = "self") -> str:
    """Revoke any prior active session for empno and create a fresh one.
    Returns the session_id.

    Assumes an Employee row exists for empno (FK constraint on sessions.empno).
    """
    s = SessionLocal()
    try:
        s.query(DBSession).filter(
            DBSession.empno == empno, DBSession.revoked_at.is_(None)
        ).update({"revoked_at": datetime.utcnow()})
        s.commit()
        return create_session(s, empno=empno, role=role, scope=scope)
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
    """Session cookie for admin. ADMIN_EMPNO env overrides; fallback 160553."""
    empno = os.environ.get("ADMIN_EMPNO", "160553")
    sid = _ensure_session(empno, "admin", scope="all")
    return {SESSION_COOKIE_NAME: sid}
