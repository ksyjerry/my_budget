"""Shared dependencies for API endpoints."""
from fastapi import Header, HTTPException
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.security import decode_token
from app.models.project import Project


def get_current_user(authorization: str = Header(...)) -> dict:
    """Extract user info from Bearer token. Raises 401 if invalid."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    token = authorization[7:]
    try:
        return decode_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def get_optional_user(authorization: Optional[str] = Header(None)) -> Optional[dict]:
    """Extract user info if token is provided, otherwise return None."""
    if not authorization:
        return None
    if not authorization.startswith("Bearer "):
        return None
    token = authorization[7:]
    try:
        return decode_token(token)
    except Exception:
        return None


def get_user_project_codes(db: Session, empno: str) -> list[str]:
    """Return project_codes where user is EL or PM."""
    projects = db.query(Project.project_code).filter(
        or_(Project.el_empno == empno, Project.pm_empno == empno)
    ).all()
    return [p.project_code for p in projects]
