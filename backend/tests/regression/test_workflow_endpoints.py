"""Integration tests for /submit /approve /unlock endpoints."""
import pytest
from sqlalchemy import text


@pytest.fixture(scope="function")
def workflow_seed(db):
    db.execute(text("DELETE FROM projects WHERE project_code = 'AREA2-WF-001'"))
    db.commit()
    db.execute(text("""
        INSERT INTO projects (project_code, project_name, el_empno, pm_empno, template_status, contract_hours)
        VALUES ('AREA2-WF-001', 'WF Test', '170661', '170661', '작성중', 100)
    """))
    db.commit()
    yield
    db.execute(text("DELETE FROM projects WHERE project_code = 'AREA2-WF-001'"))
    db.commit()


def _status(db) -> str:
    return db.execute(text(
        "SELECT template_status FROM projects WHERE project_code='AREA2-WF-001'"
    )).scalar()


def test_pm_submit_then_el_approve_then_unlock(workflow_seed, client, elpm_cookie, db):
    # PM (=170661) submits
    resp = client.post("/api/v1/budget/projects/AREA2-WF-001/submit", cookies=elpm_cookie)
    assert resp.status_code == 200
    db.commit()
    assert _status(db) == "작성완료"

    # EL (also 170661) approves
    resp = client.post("/api/v1/budget/projects/AREA2-WF-001/approve", cookies=elpm_cookie)
    assert resp.status_code == 200
    db.commit()
    assert _status(db) == "승인완료"

    # EL unlocks
    resp = client.post("/api/v1/budget/projects/AREA2-WF-001/unlock", cookies=elpm_cookie)
    assert resp.status_code == 200
    db.commit()
    assert _status(db) == "작성중"


def test_staff_blocked_on_all_workflow_endpoints(workflow_seed, client, staff_cookie):
    for path in ("/submit", "/approve", "/unlock"):
        resp = client.post(f"/api/v1/budget/projects/AREA2-WF-001{path}", cookies=staff_cookie)
        assert resp.status_code == 403, f"{path} expected 403, got {resp.status_code}: {resp.text[:120]}"


def test_anon_blocked_on_all_workflow_endpoints(workflow_seed, client):
    for path in ("/submit", "/approve", "/unlock"):
        resp = client.post(f"/api/v1/budget/projects/AREA2-WF-001{path}")
        assert resp.status_code == 401, f"{path} expected 401, got {resp.status_code}: {resp.text[:120]}"
