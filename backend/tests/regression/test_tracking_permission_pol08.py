"""POL-08 (b) — Budget Tracking endpoints는 partner_access_config 등록된 EL+admin만 접근.

실제 endpoint: /api/v1/tracking/projects (partner_access_config 기반 인가).
- admin (160553): partner_access_config scope=all → 200 (현재 접근 가능)
- elpm (170661): partner_access_config 등록 → 200 (현재 접근 가능)
- staff (320915): partner_access_config 없음 → 403
- anon: 인증 없음 → 401

POL-08 (b) 목표: staff 이하는 반드시 403, anon은 401.
admin/elpm의 tracking 접근은 partner_access_config 설정으로 제어.
"""
import pytest


@pytest.mark.parametrize("path,persona,expected", [
    # tracking endpoints — partner_access_config 기반 인가
    ("/api/v1/tracking/projects", "admin", 200),   # admin has partner_access_config scope=all
    ("/api/v1/tracking/projects", "elpm", 200),    # elpm has partner_access_config in test DB
    ("/api/v1/tracking/projects", "staff", 403),   # staff has no partner_access_config
    ("/api/v1/tracking/projects", "anon", 401),
    # filter-options: 동일 guard
    ("/api/v1/tracking/filter-options", "anon", 401),
    ("/api/v1/tracking/filter-options", "staff", 403),
])
def test_tracking_pol08_permission(client, admin_cookie, elpm_cookie, staff_cookie, path, persona, expected):
    cookies = {"admin": admin_cookie, "elpm": elpm_cookie, "staff": staff_cookie, "anon": None}[persona]
    resp = client.get(path, cookies=cookies)
    if expected in (200, 201):
        assert resp.status_code not in (401, 403), (
            f"{persona} expected allow on {path}, got {resp.status_code}: {resp.text[:200]}"
        )
    else:
        assert resp.status_code == expected, (
            f"{persona} expected {expected} on {path}, got {resp.status_code}: {resp.text[:200]}"
        )
