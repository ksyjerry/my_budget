"""Unit tests for app.core.sessions."""
from datetime import datetime, timedelta
import pytest

from app.core.sessions import (
    SESSION_COOKIE_NAME,
    SESSION_DURATION,
    TOUCH_DEBOUNCE,
    create_session,
    get_session,
    revoke_session,
    revoke_all_sessions_for_empno,
    touch_session,
    cleanup_expired_sessions,
)
from app.db.session import SessionLocal


TEST_EMPNO = "T99999"  # 6-char dummy empno (VARCHAR(6) constraint)


@pytest.fixture
def db():
    s = SessionLocal()
    from app.models.session import Session as DBSession
    from app.models.employee import Employee
    # FK 의존성: 테스트용 직원 행을 먼저 보장
    existing = s.query(Employee).filter(Employee.empno == TEST_EMPNO).first()
    if existing is None:
        s.add(Employee(empno=TEST_EMPNO, name="테스트더미", emp_status="재직"))
        s.commit()
    s.query(DBSession).filter(DBSession.empno == TEST_EMPNO).delete()
    s.commit()
    yield s
    s.query(DBSession).filter(DBSession.empno == TEST_EMPNO).delete()
    s.commit()
    # 테스트 직원 행은 남겨도 무해 (다음 테스트 재사용 가능)
    s.close()


def test_session_cookie_constants():
    assert SESSION_COOKIE_NAME == "mybudget_session"
    assert SESSION_DURATION == timedelta(hours=8)
    assert TOUCH_DEBOUNCE == timedelta(minutes=1)


def test_create_session_returns_valid_id(db):
    sid = create_session(
        db,
        empno=TEST_EMPNO,
        role="elpm",
        scope="self",
        ip="127.0.0.1",
        user_agent="pytest",
    )
    assert isinstance(sid, str)
    assert len(sid) >= 32  # secrets.token_urlsafe(32) -> ~43 chars


def test_get_session_returns_active_session(db):
    sid = create_session(db, empno=TEST_EMPNO, role="elpm", scope="self")
    s = get_session(db, sid)
    assert s is not None
    assert s.empno == TEST_EMPNO
    assert s.role == "elpm"
    assert s.revoked_at is None


def test_get_session_returns_none_for_bogus_id(db):
    assert get_session(db, "does-not-exist") is None


def test_revoked_session_returns_none(db):
    sid = create_session(db, empno=TEST_EMPNO, role="elpm", scope="self")
    revoke_session(db, sid)
    assert get_session(db, sid) is None


def test_expired_session_returns_none(db):
    from app.models.session import Session as DBSession
    sid = create_session(db, empno=TEST_EMPNO, role="elpm", scope="self")
    # 강제로 만료 처리
    db.query(DBSession).filter(DBSession.session_id == sid).update(
        {"expires_at": datetime.utcnow() - timedelta(minutes=1)}
    )
    db.commit()
    assert get_session(db, sid) is None


def test_touch_session_updates_last_seen(db):
    sid = create_session(db, empno=TEST_EMPNO, role="elpm", scope="self")
    before = get_session(db, sid).last_seen_at
    # last_seen_at 을 강제로 과거로 설정
    from app.models.session import Session as DBSession
    db.query(DBSession).filter(DBSession.session_id == sid).update(
        {"last_seen_at": datetime.utcnow() - timedelta(minutes=5)}
    )
    db.commit()
    touch_session(db, sid)
    after = get_session(db, sid).last_seen_at
    assert after > before - timedelta(seconds=1)


def test_touch_session_debounce_skips_recent_writes(db):
    """touch_session 은 last_seen_at 이 TOUCH_DEBOUNCE 안쪽이면 write 를 건너뛴다."""
    from app.models.session import Session as DBSession
    sid = create_session(db, empno=TEST_EMPNO, role="elpm", scope="self")
    # last_seen_at 을 30초 전(debounce 1분 안쪽)으로 되돌림
    thirty_sec_ago = datetime.utcnow() - timedelta(seconds=30)
    db.query(DBSession).filter(DBSession.session_id == sid).update(
        {"last_seen_at": thirty_sec_ago}
    )
    db.commit()
    touch_session(db, sid)
    # 갱신되지 않았어야 한다 — 값이 그대로 유지
    row = db.query(DBSession).filter(DBSession.session_id == sid).first()
    assert abs((row.last_seen_at - thirty_sec_ago).total_seconds()) < 1


def test_revoke_all_sessions_for_empno_revokes_every_active_session(db):
    sid1 = create_session(db, empno=TEST_EMPNO, role="elpm", scope="self")
    sid2 = create_session(db, empno=TEST_EMPNO, role="elpm", scope="self")
    n = revoke_all_sessions_for_empno(db, TEST_EMPNO)
    assert n == 2
    assert get_session(db, sid1) is None
    assert get_session(db, sid2) is None


def test_revoke_all_sessions_for_empno_ignores_already_revoked(db):
    sid1 = create_session(db, empno=TEST_EMPNO, role="elpm", scope="self")
    revoke_session(db, sid1)
    # 재호출 시 이미 revoke 된 것은 카운트에 포함되지 않아야 함
    n = revoke_all_sessions_for_empno(db, TEST_EMPNO)
    assert n == 0


def test_cleanup_expired_sessions_removes_old_expired_rows(db):
    from app.models.session import Session as DBSession
    sid = create_session(db, empno=TEST_EMPNO, role="elpm", scope="self")
    # 31일 전에 만료된 것으로 위조
    db.query(DBSession).filter(DBSession.session_id == sid).update(
        {"expires_at": datetime.utcnow() - timedelta(days=31)}
    )
    db.commit()
    deleted = cleanup_expired_sessions(db, older_than_days=30)
    assert deleted >= 1
    # 실제로 행이 지워졌어야 함
    assert db.query(DBSession).filter(DBSession.session_id == sid).first() is None


def test_cleanup_expired_sessions_keeps_recent_rows(db):
    from app.models.session import Session as DBSession
    sid = create_session(db, empno=TEST_EMPNO, role="elpm", scope="self")
    # 정상 세션(미만료) 는 지워지면 안 됨
    cleanup_expired_sessions(db, older_than_days=30)
    assert db.query(DBSession).filter(DBSession.session_id == sid).first() is not None
