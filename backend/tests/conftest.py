"""Shared fixtures for tests."""
import os
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db.session import SessionLocal
from app.core.sessions import SESSION_COOKIE_NAME, create_session
from app.models.session import Session as DBSession
from app.models.employee import Employee


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


@pytest.fixture(scope="session")
def db():
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture(scope="session", autouse=True)
def _seed_test_employees():
    """Seed Employee + PartnerAccessConfig rows for fixture empnos.

    - Employee: sessions FK constraint
    - PartnerAccessConfig: tracking endpoints require partner row (POL-08)
    Idempotent: skip if already present."""
    from app.models.budget_master import PartnerAccessConfig
    s = SessionLocal()
    try:
        seeds = [
            ("170661", "최성우"),
            ("320915", "지해나"),
            ("160553", "관리자"),
        ]
        for empno, name in seeds:
            if s.query(Employee).filter(Employee.empno == empno).first() is None:
                s.add(Employee(empno=empno, name=name, emp_status="재직"))
        # Partner access for elpm/admin (Staff 320915 는 partner 가 아님 → seed 안 함)
        partner_seeds = [
            ("170661", "최성우", "self"),
            ("160553", "관리자", "all"),
        ]
        for empno, name, scope in partner_seeds:
            if s.query(PartnerAccessConfig).filter(PartnerAccessConfig.empno == empno).first() is None:
                s.add(PartnerAccessConfig(empno=empno, emp_name=name, scope=scope))
        s.commit()
    finally:
        s.close()
    yield


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


@pytest.fixture(scope="function")
def elpm_cookie():
    """Session cookie for EL/PM user (최성우 170661).

    Function-scoped so the session is always valid — auth tests delete sessions
    for this empno as part of their isolation cleanup, so session scope would
    leave subsequent tests with a revoked/deleted session ID.
    """
    sid = _ensure_session("170661", "elpm")
    return {SESSION_COOKIE_NAME: sid}


@pytest.fixture(scope="function")
def staff_cookie():
    """Session cookie for Staff user (지해나 320915)."""
    sid = _ensure_session("320915", "staff")
    return {SESSION_COOKIE_NAME: sid}


@pytest.fixture(scope="function")
def admin_cookie():
    """Session cookie for admin. ADMIN_EMPNO env overrides; fallback 160553."""
    empno = os.environ.get("ADMIN_EMPNO", "160553")
    sid = _ensure_session(empno, "admin", scope="all")
    return {SESSION_COOKIE_NAME: sid}
