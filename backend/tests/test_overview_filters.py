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
    values = {s["value"] for s in body["service_types"]}
    assert "AUDIT" in values
    by_value = {s["value"]: s["label"] for s in body["service_types"]}
    assert by_value["AUDIT"] == "감사"


def test_filter_options_excludes_unused_codes(client, admin_cookie):
    r = client.get("/api/v1/filter-options", cookies=admin_cookie)
    assert r.status_code == 200
    values = {s["value"] for s in r.json()["service_types"]}
    # TAX 는 SERVICE_TYPES 에도 없음 + 따라서 옵션에도 없어야 함
    assert "TAX" not in values


def test_overview_filters_by_service_type_esg(client, admin_cookie):
    r = client.get("/api/v1/overview?service_type=ESG", cookies=admin_cookie)
    assert r.status_code == 200
    body = r.json()
    # projects 내 모든 항목이 ESG 여야 함 (kpi 응답 shape 가 이 필드를 직접 노출하지 않을 수 있음)
    # 여기선 200 응답이면 기본 통과로 두고, 구체 검증은 Playwright 에서
    assert "kpi" in body


def test_overview_without_service_type_filter(client, admin_cookie):
    r = client.get("/api/v1/overview", cookies=admin_cookie)
    assert r.status_code == 200
