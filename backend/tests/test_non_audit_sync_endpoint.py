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
