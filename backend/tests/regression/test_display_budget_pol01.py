"""POL-01 (b) — display_budget 가 모든 view에서 axdx_excluded_budget() 반환."""
from types import SimpleNamespace


def test_display_budget_overview_kpi_total_contract():
    from app.services.budget_definitions import display_budget
    p = SimpleNamespace(contract_hours=500.0, axdx_hours=77.0)
    assert display_budget(p, view="overview_kpi_total_contract") == 423.0


def test_display_budget_overview_project_table():
    from app.services.budget_definitions import display_budget
    p = SimpleNamespace(contract_hours=500.0, axdx_hours=77.0)
    assert display_budget(p, view="overview_project_table_budget") == 423.0


def test_display_budget_tracking():
    from app.services.budget_definitions import display_budget
    p = SimpleNamespace(contract_hours=500.0, axdx_hours=77.0)
    assert display_budget(p, view="tracking_budget_hour") == 423.0


def test_display_budget_summary():
    from app.services.budget_definitions import display_budget
    p = SimpleNamespace(contract_hours=500.0, axdx_hours=77.0)
    assert display_budget(p, view="summary_project_budget") == 423.0


def test_display_budget_zero_axdx():
    from app.services.budget_definitions import display_budget
    p = SimpleNamespace(contract_hours=500.0, axdx_hours=0.0)
    assert display_budget(p, view="overview_kpi_total_contract") == 500.0
