"""Shared dependencies for API endpoints (cookie-based auth)."""
from fastapi import Depends, HTTPException, Request
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.sessions import (
    SESSION_COOKIE_NAME,
    get_session,
    touch_session,
)
from app.db.session import get_db
from app.models.project import Project


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    """Return current user from session cookie. Raises 401 if invalid."""
    sid = request.cookies.get(SESSION_COOKIE_NAME)
    s = get_session(db, sid) if sid else None
    if s is None:
        raise HTTPException(status_code=401, detail="세션이 만료되었거나 유효하지 않습니다.")
    touch_session(db, sid)
    return {
        "empno": s.empno,
        "role": s.role,   # 'elpm' | 'staff' | 'admin'
        "scope": s.scope,
    }


def get_optional_user(
    request: Request,
    db: Session = Depends(get_db),
) -> Optional[dict]:
    try:
        return get_current_user(request=request, db=db)
    except HTTPException:
        return None


def require_login(user: dict = Depends(get_current_user)) -> dict:
    return user


def require_elpm(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] not in ("elpm", "admin"):
        raise HTTPException(status_code=403, detail="EL/PM 권한이 필요합니다.")
    return user


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다.")
    return user


def assert_can_modify_project(db: Session, user: dict, project_code: str) -> None:
    """Raise 403 if user cannot modify this project."""
    if user["role"] == "admin":
        return
    p = db.query(Project).filter_by(project_code=project_code).first()
    if p is None:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")
    if user["empno"] not in (p.el_empno, p.pm_empno):
        raise HTTPException(status_code=403, detail="해당 프로젝트를 수정할 권한이 없습니다.")


def assert_can_delete_project(db: Session, user: dict, project_code: str) -> None:
    """Raise 403 if user cannot delete. Only EL or admin."""
    if user["role"] == "admin":
        return
    p = db.query(Project).filter_by(project_code=project_code).first()
    if p is None:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")
    if user["empno"] != p.el_empno:
        raise HTTPException(status_code=403, detail="프로젝트 삭제는 EL 만 가능합니다.")


def get_user_project_codes(db: Session, empno: str) -> list[str]:
    """Return project_codes where user is EL, PM, or a member.
    파트너(EL/PM)의 경우 PartnerAccessConfig scope에 따라 범위 확장."""
    from app.models.budget_master import ProjectMember, PartnerAccessConfig

    cfg = db.query(PartnerAccessConfig).filter(PartnerAccessConfig.empno == empno).first()

    if cfg and cfg.scope == "all":
        all_codes = db.query(Project.project_code).all()
        return [p.project_code for p in all_codes]

    if cfg and cfg.scope == "departments" and cfg.departments:
        dept_list = [d.strip() for d in cfg.departments.split(",") if d.strip()]
        dept_projects = db.query(Project.project_code).filter(
            Project.department.in_(dept_list)
        ).all()
        codes = {p.project_code for p in dept_projects}
        el_pm = db.query(Project.project_code).filter(
            or_(Project.el_empno == empno, Project.pm_empno == empno)
        ).all()
        codes.update(p.project_code for p in el_pm)
        return list(codes)

    el_pm = db.query(Project.project_code).filter(
        or_(Project.el_empno == empno, Project.pm_empno == empno)
    ).all()
    codes = {p.project_code for p in el_pm}

    member = db.query(ProjectMember.project_code).filter(
        ProjectMember.empno == empno
    ).distinct().all()
    codes.update(m.project_code for m in member)

    return list(codes)
