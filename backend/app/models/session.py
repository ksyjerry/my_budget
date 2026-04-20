from sqlalchemy import Column, String, DateTime, Boolean, BigInteger, ForeignKey
from sqlalchemy.sql import func

from app.db.base import Base


class Session(Base):
    __tablename__ = "sessions"

    session_id = Column(String(64), primary_key=True)
    empno = Column(String(6), ForeignKey("employees.empno"), nullable=False)
    role = Column(String(20), nullable=False)
    scope = Column(String(20), nullable=False, default="self")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    expires_at = Column(DateTime, nullable=False)
    last_seen_at = Column(DateTime, nullable=False, server_default=func.now())
    ip = Column(String(64))
    user_agent = Column(String(500))
    revoked_at = Column(DateTime)


class LoginLog(Base):
    __tablename__ = "login_log"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    empno = Column(String(20))
    logged_in_at = Column(DateTime, nullable=False, server_default=func.now())
    ip = Column(String(64))
    user_agent = Column(String(500))
    success = Column(Boolean, nullable=False)
    failure_reason = Column(String(100))
