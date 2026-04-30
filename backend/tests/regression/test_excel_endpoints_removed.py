"""S8 — Excel endpoints 모두 제거됨 검증 (404 반환)."""
import pytest


REMOVED_ENDPOINTS = [
    ("POST", "/api/v1/budget/upload"),
    ("GET",  "/api/v1/budget/projects/AREA8-X/template/export"),
    ("POST", "/api/v1/budget/projects/AREA8-X/template/upload"),
    ("GET",  "/api/v1/budget/projects/AREA8-X/members/export"),
    ("POST", "/api/v1/budget/projects/AREA8-X/members/upload"),
    ("GET",  "/api/v1/budget/template/blank-export"),
    ("GET",  "/api/v1/export/overview"),
    ("GET",  "/api/v1/export/staff-time"),
    ("GET",  "/api/v1/export/elpm-qrp-time"),
    ("GET",  "/api/v1/export/engagement-time"),
    ("GET",  "/api/v1/export/project"),
    ("GET",  "/api/v1/export/summary"),
]


@pytest.mark.parametrize("method,path", REMOVED_ENDPOINTS)
def test_excel_endpoint_returns_404(client, elpm_cookie, method, path):
    resp = client.request(method, path, cookies=elpm_cookie)
    assert resp.status_code == 404, (
        f"{method} {path} should be removed (404), got {resp.status_code}"
    )
