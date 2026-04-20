"""Integration tests for /api/v1/auth endpoints (cookie-based)."""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.sessions import SESSION_COOKIE_NAME
from app.db.session import SessionLocal
from app.models.session import Session as DBSession
from app.models.session import LoginLog


EL_EMPNO = "170661"  # 최성우 — EL/PM
STAFF_EMPNO = "320915"  # 지해나 — Staff
BOGUS_EMPNO = "ZZZZZZ"


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def _cleanup_sessions():
    db = SessionLocal()
    try:
        for e in (EL_EMPNO, STAFF_EMPNO, BOGUS_EMPNO):
            db.query(DBSession).filter(DBSession.empno == e).delete()
        db.query(LoginLog).filter(LoginLog.empno.in_([EL_EMPNO, STAFF_EMPNO, BOGUS_EMPNO])).delete()
        db.commit()
    finally:
        db.close()


def test_login_success_sets_cookie(client):
    r = client.post("/api/v1/auth/login", json={"empno": EL_EMPNO})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["empno"] == EL_EMPNO
    assert body["role"] in ("elpm", "staff", "admin")
    assert "token" not in body
    cookies = r.cookies
    assert SESSION_COOKIE_NAME in cookies
    set_cookie = r.headers.get("set-cookie", "").lower()
    assert "httponly" in set_cookie
    assert "samesite=lax" in set_cookie
    # Test 환경은 http 이므로 secure 속성이 붙어 있으면 안 됨
    assert "secure" not in set_cookie


def test_login_unknown_empno_returns_401_and_logs_failure(client):
    r = client.post("/api/v1/auth/login", json={"empno": BOGUS_EMPNO})
    assert r.status_code == 401
    db = SessionLocal()
    try:
        log = db.query(LoginLog).filter(LoginLog.empno == BOGUS_EMPNO).first()
        assert log is not None
        assert log.success is False
        assert log.failure_reason == "not_found"
    finally:
        db.close()


def test_login_staff_empno_returns_staff_role(client):
    r = client.post("/api/v1/auth/login", json={"empno": STAFF_EMPNO})
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "staff"


def test_me_returns_user_with_valid_cookie(client):
    client.post("/api/v1/auth/login", json={"empno": EL_EMPNO})
    r = client.get("/api/v1/auth/me")
    assert r.status_code == 200
    assert r.json()["empno"] == EL_EMPNO


def test_me_returns_401_without_cookie(client):
    client.cookies.clear()
    r = client.get("/api/v1/auth/me")
    assert r.status_code == 401


def test_logout_clears_cookie_and_revokes_session(client):
    client.post("/api/v1/auth/login", json={"empno": EL_EMPNO})
    sid = client.cookies.get(SESSION_COOKIE_NAME)
    assert sid, "login should have set a session cookie"

    r = client.post("/api/v1/auth/logout")
    assert r.status_code == 200
    # 쿠키가 클라이언트 쪽에서도 비워졌는지
    assert SESSION_COOKIE_NAME not in client.cookies

    # 쿠키 탈취 재사용 방지 — 원래 sid 를 다시 주입해도 서버가 거부해야 한다
    client.cookies.set(SESSION_COOKIE_NAME, sid)
    r2 = client.get("/api/v1/auth/me")
    assert r2.status_code == 401
    client.cookies.clear()
