"""Tests for /employees/search active-only filter (#39)."""
import pytest

from app.db.session import SessionLocal
from app.models.employee import Employee


@pytest.fixture(autouse=True)
def _seed_employees():
    s = SessionLocal()
    try:
        if s.query(Employee).filter(Employee.empno == "S4AC1").first() is None:
            s.add(Employee(empno="S4AC1", name="재직테스트", emp_status="재직"))
        if s.query(Employee).filter(Employee.empno == "S4IN1").first() is None:
            s.add(Employee(empno="S4IN1", name="퇴사테스트", emp_status="퇴사"))
        s.commit()
    finally:
        s.close()
    yield


def test_search_returns_emp_status_field(client, elpm_cookie):
    r = client.get("/api/v1/budget/employees/search?q=재직", cookies=elpm_cookie)
    assert r.status_code == 200
    rows = r.json()
    if rows:
        assert "emp_status" in rows[0]


def test_search_excludes_inactive_by_default(client, elpm_cookie):
    r = client.get("/api/v1/budget/employees/search?q=S4IN1", cookies=elpm_cookie)
    assert r.status_code == 200
    rows = r.json()
    assert all(row.get("emp_status", "") == "재직" for row in rows)


def test_search_includes_active_employee(client, elpm_cookie):
    r = client.get("/api/v1/budget/employees/search?q=S4AC1", cookies=elpm_cookie)
    assert r.status_code == 200
    rows = r.json()
    matching = [r for r in rows if r["empno"] == "S4AC1"]
    assert len(matching) == 1
    assert matching[0]["emp_status"] == "재직"
