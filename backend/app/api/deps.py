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
    """Return project_codes where user is EL, PM, or a member.
    파트너(EL/PM)의 경우 PartnerAccessConfig scope에 따라 범위 확장."""
    from app.models.budget_master import ProjectMember, PartnerAccessConfig

    # 파트너 접근 범위 설정 확인
    cfg = db.query(PartnerAccessConfig).filter(PartnerAccessConfig.empno == empno).first()

    if cfg and cfg.scope == "all":
        # 전체 프로젝트 접근
        all_codes = db.query(Project.project_code).all()
        return [p.project_code for p in all_codes]

    if cfg and cfg.scope == "departments" and cfg.departments:
        # 특정 본부 프로젝트 접근
        dept_list = [d.strip() for d in cfg.departments.split(",") if d.strip()]
        dept_projects = db.query(Project.project_code).filter(
            Project.department.in_(dept_list)
        ).all()
        codes = {p.project_code for p in dept_projects}

        # 본인 EL/PM인 프로젝트도 포함
        el_pm = db.query(Project.project_code).filter(
            or_(Project.el_empno == empno, Project.pm_empno == empno)
        ).all()
        codes.update(p.project_code for p in el_pm)

        return list(codes)

    # 기본: 본인 EL/PM/구성원인 프로젝트만
    el_pm = db.query(Project.project_code).filter(
        or_(Project.el_empno == empno, Project.pm_empno == empno)
    ).all()
    codes = {p.project_code for p in el_pm}

    member = db.query(ProjectMember.project_code).filter(
        ProjectMember.empno == empno
    ).distinct().all()
    codes.update(m.project_code for m in member)

    return list(codes)
