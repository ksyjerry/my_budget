"""Server-side session management for cookie-based auth."""
import secrets
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session as DBSessionType

from app.models.session import Session as DBSession

SESSION_COOKIE_NAME = "mybudget_session"
SESSION_DURATION = timedelta(hours=8)
TOUCH_DEBOUNCE = timedelta(minutes=1)


def create_session(
    db: DBSessionType,
    *,
    empno: str,
    role: str,
    scope: str = "self",
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> str:
    """Create a new session row. Returns the session_id."""
    sid = secrets.token_urlsafe(32)
    now = datetime.utcnow()
    row = DBSession(
        session_id=sid,
        empno=empno,
        role=role,
        scope=scope,
        created_at=now,
        expires_at=now + SESSION_DURATION,
        last_seen_at=now,
        ip=ip,
        user_agent=user_agent,
    )
    db.add(row)
    db.commit()
    return sid


def get_session(db: DBSessionType, session_id: str) -> Optional[DBSession]:
    """Return the session if it is valid (not revoked, not expired)."""
    if not session_id:
        return None
    row = db.query(DBSession).filter(DBSession.session_id == session_id).first()
    if row is None:
        return None
    if row.revoked_at is not None:
        return None
    if row.expires_at <= datetime.utcnow():
        return None
    return row


def revoke_session(db: DBSessionType, session_id: str) -> None:
    """Mark the session as revoked."""
    db.query(DBSession).filter(DBSession.session_id == session_id).update(
        {"revoked_at": datetime.utcnow()}
    )
    db.commit()


def revoke_all_sessions_for_empno(db: DBSessionType, empno: str) -> int:
    """Revoke every active session for the given empno. Returns # revoked."""
    n = db.query(DBSession).filter(
        DBSession.empno == empno,
        DBSession.revoked_at.is_(None),
    ).update({"revoked_at": datetime.utcnow()})
    db.commit()
    return n


def touch_session(db: DBSessionType, session_id: str) -> None:
    """Update last_seen_at, but no more often than TOUCH_DEBOUNCE."""
    now = datetime.utcnow()
    row = db.query(DBSession).filter(DBSession.session_id == session_id).first()
    if row is None or row.revoked_at is not None:
        return
    if now - row.last_seen_at < TOUCH_DEBOUNCE:
        return
    row.last_seen_at = now
    db.commit()


def cleanup_expired_sessions(db: DBSessionType, *, older_than_days: int = 30) -> int:
    """Delete rows where expires_at is older than N days ago. Returns # deleted."""
    cutoff = datetime.utcnow() - timedelta(days=older_than_days)
    n = db.query(DBSession).filter(DBSession.expires_at < cutoff).delete()
    db.commit()
    return n
