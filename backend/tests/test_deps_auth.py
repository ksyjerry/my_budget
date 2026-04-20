"""Tests for cookie-based get_current_user and permission helpers."""
import pytest
from fastapi import HTTPException
from unittest.mock import MagicMock
from starlette.requests import Request

from app.api.deps import (
    get_current_user,
    get_optional_user,
    require_login,
    require_elpm,
    require_admin,
    assert_can_modify_project,
    assert_can_delete_project,
)
from app.core.sessions import SESSION_COOKIE_NAME, create_session
from app.db.session import SessionLocal
from app.models.session import Session as DBSession


TEST_EMPNO = "T99999"  # FK-compatible 6-char empno (existing throwaway employee row)


@pytest.fixture
def db():
    s = SessionLocal()
    from app.models.employee import Employee
    if s.query(Employee).filter(Employee.empno == TEST_EMPNO).first() is None:
        s.add(Employee(empno=TEST_EMPNO, name="테스트더미", emp_status="재직"))
        s.commit()
    s.query(DBSession).filter(DBSession.empno == TEST_EMPNO).delete()
    s.commit()
    yield s
    s.query(DBSession).filter(DBSession.empno == TEST_EMPNO).delete()
    s.commit()
    s.close()


def _fake_request(cookie_value: str | None) -> Request:
    headers = []
    if cookie_value:
        headers = [(b"cookie", f"{SESSION_COOKIE_NAME}={cookie_value}".encode())]
    scope = {"type": "http", "headers": headers}
    return Request(scope)


def test_get_current_user_without_cookie_raises_401(db):
    req = _fake_request(None)
    with pytest.raises(HTTPException) as ex:
        get_current_user(request=req, db=db)
    assert ex.value.status_code == 401


def test_get_current_user_with_valid_cookie_returns_user(db):
    sid = create_session(db, empno=TEST_EMPNO, role="elpm", scope="self")
    req = _fake_request(sid)
    u = get_current_user(request=req, db=db)
    assert u["empno"] == TEST_EMPNO
    assert u["role"] == "elpm"


def test_require_elpm_denies_staff(db):
    sid = create_session(db, empno=TEST_EMPNO, role="staff", scope="self")
    req = _fake_request(sid)
    u = get_current_user(request=req, db=db)
    with pytest.raises(HTTPException) as ex:
        require_elpm(u)
    assert ex.value.status_code == 403


def test_require_elpm_allows_elpm(db):
    sid = create_session(db, empno=TEST_EMPNO, role="elpm", scope="self")
    req = _fake_request(sid)
    u = get_current_user(request=req, db=db)
    out = require_elpm(u)
    assert out["empno"] == TEST_EMPNO


def test_require_elpm_allows_admin(db):
    sid = create_session(db, empno=TEST_EMPNO, role="admin", scope="all")
    req = _fake_request(sid)
    u = get_current_user(request=req, db=db)
    out = require_elpm(u)
    assert out["empno"] == TEST_EMPNO


def test_require_admin_denies_elpm(db):
    sid = create_session(db, empno=TEST_EMPNO, role="elpm", scope="self")
    req = _fake_request(sid)
    u = get_current_user(request=req, db=db)
    with pytest.raises(HTTPException) as ex:
        require_admin(u)
    assert ex.value.status_code == 403


def test_assert_can_modify_project_allows_el():
    fake_db = MagicMock()
    fake_project = MagicMock(el_empno="E1", pm_empno="E2")
    fake_db.query.return_value.filter_by.return_value.first.return_value = fake_project
    user = {"empno": "E1", "role": "elpm"}
    assert_can_modify_project(fake_db, user, "PJ")  # 예외 없음


def test_assert_can_modify_project_allows_pm():
    fake_db = MagicMock()
    fake_project = MagicMock(el_empno="E1", pm_empno="E2")
    fake_db.query.return_value.filter_by.return_value.first.return_value = fake_project
    user = {"empno": "E2", "role": "elpm"}
    assert_can_modify_project(fake_db, user, "PJ")


def test_assert_can_modify_project_denies_other():
    fake_db = MagicMock()
    fake_project = MagicMock(el_empno="E1", pm_empno="E2")
    fake_db.query.return_value.filter_by.return_value.first.return_value = fake_project
    user = {"empno": "X9", "role": "elpm"}
    with pytest.raises(HTTPException) as ex:
        assert_can_modify_project(fake_db, user, "PJ")
    assert ex.value.status_code == 403


def test_assert_can_modify_project_allows_admin():
    fake_db = MagicMock()
    fake_db.query.return_value.filter_by.return_value.first.return_value = MagicMock(
        el_empno="E1", pm_empno="E2"
    )
    user = {"empno": "A1", "role": "admin"}
    assert_can_modify_project(fake_db, user, "PJ")  # admin 은 무조건 통과


def test_assert_can_modify_project_404_when_project_missing():
    fake_db = MagicMock()
    fake_db.query.return_value.filter_by.return_value.first.return_value = None
    user = {"empno": "E1", "role": "elpm"}
    with pytest.raises(HTTPException) as ex:
        assert_can_modify_project(fake_db, user, "MISSING")
    assert ex.value.status_code == 404


def test_assert_can_delete_project_only_el():
    fake_db = MagicMock()
    fake_db.query.return_value.filter_by.return_value.first.return_value = MagicMock(
        el_empno="E1", pm_empno="E2"
    )
    # PM 은 삭제 불가
    with pytest.raises(HTTPException):
        assert_can_delete_project(fake_db, {"empno": "E2", "role": "elpm"}, "PJ")
    # EL 은 허용
    assert_can_delete_project(fake_db, {"empno": "E1", "role": "elpm"}, "PJ")


def test_assert_can_delete_project_allows_admin():
    fake_db = MagicMock()
    fake_db.query.return_value.filter_by.return_value.first.return_value = MagicMock(
        el_empno="E1", pm_empno="E2"
    )
    user = {"empno": "A1", "role": "admin"}
    assert_can_delete_project(fake_db, user, "PJ")


def test_get_current_user_with_invalid_sid_raises_401(db):
    """sid 쿠키는 있지만 세션 행이 존재하지 않는 경우에도 401."""
    req = _fake_request("garbage_not_a_real_sid")
    with pytest.raises(HTTPException) as ex:
        get_current_user(request=req, db=db)
    assert ex.value.status_code == 401


def test_get_optional_user_returns_user_when_cookie_valid(db):
    sid = create_session(db, empno=TEST_EMPNO, role="elpm", scope="self")
    req = _fake_request(sid)
    u = get_optional_user(request=req, db=db)
    assert u is not None
    assert u["empno"] == TEST_EMPNO


def test_get_optional_user_returns_none_when_no_cookie(db):
    req = _fake_request(None)
    u = get_optional_user(request=req, db=db)
    assert u is None


def test_get_optional_user_returns_none_when_cookie_invalid(db):
    req = _fake_request("garbage_not_a_real_sid")
    u = get_optional_user(request=req, db=db)
    assert u is None


def test_require_login_returns_user_dict(db):
    sid = create_session(db, empno=TEST_EMPNO, role="staff", scope="self")
    req = _fake_request(sid)
    u = get_current_user(request=req, db=db)
    out = require_login(u)
    assert out["empno"] == TEST_EMPNO
    assert out["role"] == "staff"
