"""Regression #79 / #82 — /projects/list visibility by persona."""
import pytest
from sqlalchemy import text


@pytest.fixture(scope="function")
def list_seed(db):
    """Seed 4 projects with distinct EL/PM/status combinations."""
    db.execute(text("DELETE FROM projects WHERE project_code LIKE 'AREA2-LIST-%'"))
    db.commit()
    db.execute(text("""
        INSERT INTO projects (project_code, project_name, el_empno, pm_empno, template_status, contract_hours)
        VALUES
          ('AREA2-LIST-P1', 'P1 EL=170661 PM=170661', '170661', '170661', '작성중', 100),
          ('AREA2-LIST-P2', 'P2 EL=170661 PM=999998', '170661', '999998', '작성완료', 100),
          ('AREA2-LIST-P3', 'P3 EL=999997 PM=170661', '999997', '170661', '승인완료', 100),
          ('AREA2-LIST-P4', 'P4 EL=999996 PM=999995', '999996', '999995', '작성중', 100)
    """))
    db.commit()
    yield
    db.execute(text("DELETE FROM projects WHERE project_code LIKE 'AREA2-LIST-%'"))
    db.commit()


def _list_codes(client, cookie):
    resp = client.get("/api/v1/budget/projects/list", cookies=cookie or {})
    assert resp.status_code in (200, 401)
    if resp.status_code == 401:
        return None
    return {p["project_code"] for p in resp.json() if p["project_code"].startswith("AREA2-LIST-")}


def test_admin_sees_all(list_seed, client, admin_cookie):
    codes = _list_codes(client, admin_cookie)
    assert codes == {"AREA2-LIST-P1", "AREA2-LIST-P2", "AREA2-LIST-P3", "AREA2-LIST-P4"}


def test_elpm_sees_self_el_or_pm(list_seed, client, elpm_cookie):
    """elpm fixture is empno 170661 — EL on P1/P2, PM on P1/P3."""
    codes = _list_codes(client, elpm_cookie)
    assert codes == {"AREA2-LIST-P1", "AREA2-LIST-P2", "AREA2-LIST-P3"}


def test_staff_sees_none(list_seed, client, staff_cookie):
    """staff fixture is 320915 — neither EL nor PM on any AREA2 project."""
    codes = _list_codes(client, staff_cookie)
    assert codes == set()


def test_anon_blocked(list_seed, client):
    codes = _list_codes(client, None)
    assert codes is None or codes == set()
