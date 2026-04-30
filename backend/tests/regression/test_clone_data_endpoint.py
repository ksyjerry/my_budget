"""Regression — clone-data endpoint 권한 가드 + schema."""
import pytest
from sqlalchemy import text


@pytest.fixture(scope="function")
def clone_seed(db):
    db.execute(text("DELETE FROM projects WHERE project_code = 'AREA3-CLONE-SRC'"))
    db.commit()
    db.execute(text("""
        INSERT INTO projects (project_code, project_name, el_empno, pm_empno, template_status,
                              contract_hours, axdx_hours, qrp_hours)
        VALUES ('AREA3-CLONE-SRC', 'Clone Source', '170661', '170661', '승인완료', 500, 50, 10)
    """))
    db.commit()
    yield
    db.execute(text("DELETE FROM projects WHERE project_code = 'AREA3-CLONE-SRC'"))
    db.commit()


def test_clone_data_existing_returns_full_response(clone_seed, client, elpm_cookie):
    resp = client.get("/api/v1/budget/projects/AREA3-CLONE-SRC/clone-data", cookies=elpm_cookie)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "hours" in body
    assert "members" in body
    assert "template" in body
    assert body["hours"]["contract_hours"] == 500.0
    assert body["hours"]["axdx_hours"] == 50.0


def test_clone_data_404_for_unknown_project(client, elpm_cookie):
    resp = client.get("/api/v1/budget/projects/AREA3-NONEXISTENT/clone-data", cookies=elpm_cookie)
    assert resp.status_code == 404


def test_clone_data_requires_login(clone_seed, client):
    """anon should get 401 (currently endpoint has no guard — fix in Task 3)."""
    resp = client.get("/api/v1/budget/projects/AREA3-CLONE-SRC/clone-data")
    assert resp.status_code == 401, (
        f"clone-data should require login, got {resp.status_code}"
    )
