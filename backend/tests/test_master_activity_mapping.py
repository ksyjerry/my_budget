"""Tests for /master/tasks extended payload and /master/activity-mapping."""
import pytest


def test_master_tasks_returns_extended_fields_for_esg(client, elpm_cookie):
    r = client.get("/api/v1/budget/master/tasks?service_type=ESG", cookies=elpm_cookie)
    assert r.status_code == 200
    rows = r.json()
    if not rows:
        pytest.skip("ESG not seeded yet")
    sample = rows[0]
    for key in ("activity_subcategory", "activity_detail", "budget_unit", "role"):
        assert key in sample


def test_activity_mapping_esg_non_empty(client, elpm_cookie):
    r = client.get("/api/v1/budget/master/activity-mapping?service_type=ESG", cookies=elpm_cookie)
    assert r.status_code == 200
    rows = r.json()
    if not rows:
        pytest.skip("ESG not seeded yet")
    for row in rows:
        assert "category" in row
        assert "detail" in row


def test_activity_mapping_trade_has_categories(client, elpm_cookie):
    r = client.get("/api/v1/budget/master/activity-mapping?service_type=TRADE", cookies=elpm_cookie)
    assert r.status_code == 200
    rows = r.json()
    if not rows:
        pytest.skip("TRADE not seeded yet")
    categories = {r["category"] for r in rows if r["category"]}
    assert len(categories) > 0, "TRADE should have at least one task_category"


def test_activity_mapping_audit_returns_list(client, elpm_cookie):
    r = client.get("/api/v1/budget/master/activity-mapping?service_type=AUDIT", cookies=elpm_cookie)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
