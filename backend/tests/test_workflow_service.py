"""Unit tests for workflow.transition_status — POL-04 표준형."""
import pytest
from types import SimpleNamespace


def test_submit_작성중_to_작성완료_pm_self():
    from app.services.workflow import transition_status
    p = SimpleNamespace(template_status="작성중", pm_empno="170661", el_empno="170661")
    transition_status(p, target_status="작성완료", actor_empno="170661", actor_role="elpm")
    assert p.template_status == "작성완료"


def test_submit_작성중_to_작성완료_other_pm_blocked():
    from app.services.workflow import transition_status, WorkflowError
    p = SimpleNamespace(template_status="작성중", pm_empno="170661", el_empno="999997")
    with pytest.raises(WorkflowError, match="PM"):
        transition_status(p, target_status="작성완료", actor_empno="999998", actor_role="elpm")


def test_approve_작성완료_to_승인완료_el_self():
    from app.services.workflow import transition_status
    p = SimpleNamespace(template_status="작성완료", pm_empno="170661", el_empno="170661")
    transition_status(p, target_status="승인완료", actor_empno="170661", actor_role="elpm")
    assert p.template_status == "승인완료"


def test_approve_by_pm_other_blocked():
    from app.services.workflow import transition_status, WorkflowError
    p = SimpleNamespace(template_status="작성완료", pm_empno="170661", el_empno="999997")
    with pytest.raises(WorkflowError, match="EL"):
        transition_status(p, target_status="승인완료", actor_empno="170661", actor_role="elpm")


def test_admin_can_force_any_transition():
    from app.services.workflow import transition_status
    p = SimpleNamespace(template_status="승인완료", pm_empno="111", el_empno="222")
    transition_status(p, target_status="작성중", actor_empno="160553", actor_role="admin")
    assert p.template_status == "작성중"


def test_invalid_transition_blocked():
    from app.services.workflow import transition_status, WorkflowError
    p = SimpleNamespace(template_status="작성중", pm_empno="170661", el_empno="170661")
    with pytest.raises(WorkflowError, match="invalid"):
        transition_status(p, target_status="승인완료", actor_empno="170661", actor_role="elpm")
