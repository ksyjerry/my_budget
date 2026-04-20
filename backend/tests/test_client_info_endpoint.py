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
    # TestClient 는 세션 쿠키 공유가 있을 수 있음 — 명시적 clear
    from fastapi.testclient import TestClient
    from app.main import app
    fresh = TestClient(app)
    r = fresh.get("/api/v1/budget/clients/TESTCL001/info")
    assert r.status_code == 401
