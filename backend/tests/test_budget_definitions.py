"""Unit tests for budget_definitions — single source of truth for Budget semantics."""
import pytest
from types import SimpleNamespace


def make_project(**overrides):
    """Lightweight project stub (avoids DB)."""
    defaults = dict(
        contract_hours=500.0,
        axdx_hours=77.0,
        qrp_hours=10.0,
        rm_hours=5.0,
        el_hours=20.0,
        pm_hours=55.0,
        ra_elpm_hours=8.0,
        et_controllable_budget=348.0,
        fulcrum_hours=20.0,
        ra_staff_hours=15.0,
        specialist_hours=10.0,
        travel_hours=5.0,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def test_total_contract_hours_returns_field_value():
    from app.services.budget_definitions import total_contract_hours
    p = make_project(contract_hours=500.0)
    assert total_contract_hours(p) == 500.0


def test_total_contract_hours_handles_none():
    from app.services.budget_definitions import total_contract_hours
    p = make_project(contract_hours=None)
    assert total_contract_hours(p) == 0.0


def test_axdx_excluded_budget_subtracts_axdx():
    from app.services.budget_definitions import axdx_excluded_budget
    p = make_project(contract_hours=500.0, axdx_hours=77.0)
    assert axdx_excluded_budget(p) == 423.0


def test_axdx_excluded_budget_handles_zero_axdx():
    from app.services.budget_definitions import axdx_excluded_budget
    p = make_project(contract_hours=500.0, axdx_hours=0.0)
    assert axdx_excluded_budget(p) == 500.0


def test_staff_controllable_budget_uses_field():
    from app.services.budget_definitions import staff_controllable_budget
    p = make_project(et_controllable_budget=348.0)
    assert staff_controllable_budget(p) == 348.0


def test_display_budget_pol01_b_activated():
    """POL-01 (b) 활성화 후 display_budget은 axdx_excluded_budget() 반환 (영역 6)."""
    from app.services.budget_definitions import display_budget
    p = make_project(contract_hours=500.0, axdx_hours=77.0)
    assert display_budget(p, view="overview_kpi_total_contract") == 423.0
