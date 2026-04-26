"""Regression #65 #93 #94 — Overview 데이터 완전성."""
import pytest


def test_qrp_tms_lookup_uses_qrp_empno():
    pytest.skip("requires Azure SQL mock — manual test on staging")


def test_overview_includes_unbudgeted_employees():
    pytest.skip("requires TMS data + budget seed — manual test on staging")


def test_employee_name_fallback_for_unknown_empno():
    """타 LoS 인원 fallback 표시 — frontend display logic. E2E로 보장."""
    pytest.skip("frontend display logic — covered by E2E")
