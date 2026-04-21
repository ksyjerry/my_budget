"""Tests for overview aggregation bug fixes (#24, #25, #26)."""
from unittest.mock import patch

import pytest


@pytest.fixture
def tms_fixture():
    """TMS rows where empno E1 appears once — shared between role_set and staff_set."""
    return [
        {
            "project_code": "P1", "empno": "E1", "use_time": 10.0,
            "activity_code_1": "", "activity_code_2": "", "activity_code_3": "",
        },
        {
            "project_code": "P1", "empno": "E2", "use_time": 5.0,
            "activity_code_1": "", "activity_code_2": "", "activity_code_3": "",
        },
    ]


def test_pm_actual_not_double_counted_when_empno_in_both_sets(tms_fixture, db):
    """#26 — E1 이 role_set 과 staff_set 양쪽에 있어도 by_project_empno[(P1, E1)] == 10 (not 20)."""
    from app.services import azure_service
    with patch.object(azure_service, "_fetch_tms_rows", return_value=tms_fixture):
        result = azure_service.get_overview_actuals(
            project_codes=["P1"],
            db=db,
            role_empnos=["E1", "E2"],
            staff_empnos=["E1"],
        )
    assert result["by_project_empno"][("P1", "E1")] == 10.0
    assert result["by_project_empno"][("P1", "E2")] == 5.0
    assert result["by_empno"]["E1"] == 10.0
    assert "E2" not in result["by_empno"]


def test_total_actual_matches_sum_of_by_project(tms_fixture, db):
    """집계 consistency — total Actual = sum(by_project.values())."""
    from app.services import azure_service
    with patch.object(azure_service, "_fetch_tms_rows", return_value=tms_fixture):
        result = azure_service.get_overview_actuals(
            project_codes=["P1"],
            db=db,
            role_empnos=["E1"],
            staff_empnos=[],
        )
    total_from_by_project = sum(result["by_project"].values())
    assert total_from_by_project == 15.0
