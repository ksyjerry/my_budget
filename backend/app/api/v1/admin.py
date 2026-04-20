"""관리자 페이지 API — 파트너 접근 범위 관리."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.db.session import get_db
from app.models.budget_master import PartnerAccessConfig
from app.api.deps import require_admin

router = APIRouter()


class ScopeUpdate(BaseModel):
    scope: str  # "self" | "departments" | "all"
    departments: Optional[str] = ""  # comma-separated


@router.get("/partners")
def list_partners(
    user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """파트너(EL/PM) 목록 + 현재 scope 설정. Azure 캐시 + PostgreSQL 병합."""

    from app.models.project import Project
    from app.services import azure_service

    partner_map: dict[str, dict] = {}

    # PostgreSQL projects
    els = db.query(
        Project.el_empno, Project.el_name, Project.department
    ).filter(Project.el_empno.isnot(None), Project.el_empno != "").all()
    for el_empno, el_name, dept in els:
        if el_empno not in partner_map:
            partner_map[el_empno] = {
                "empno": el_empno,
                "name": el_name or el_empno,
                "departments": set(),
            }
        if dept:
            partner_map[el_empno]["departments"].add(dept)

    # Azure 캐시 병합
    azure_projects = azure_service.search_azure_projects("", limit=99999)
    for ap in azure_projects:
        empno = ap.get("el_empno", "")
        if not empno:
            continue
        if empno not in partner_map:
            partner_map[empno] = {
                "empno": empno,
                "name": ap.get("el_name") or empno,
                "departments": set(),
            }
        dept = ap.get("department", "")
        if dept:
            partner_map[empno]["departments"].add(dept)

    # 현재 scope 설정 조회
    configs = {
        c.empno: c
        for c in db.query(PartnerAccessConfig).all()
    }

    result = []
    for empno, info in sorted(partner_map.items(), key=lambda x: x[1]["name"]):
        cfg = configs.get(empno)
        result.append({
            "empno": empno,
            "name": info["name"],
            "departments": sorted(info["departments"]),
            "scope": cfg.scope if cfg else "self",
            "scope_departments": cfg.departments if cfg else "",
        })

    return result


@router.get("/partners/{empno}")
def get_partner_config(
    empno: str,
    user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    cfg = db.query(PartnerAccessConfig).filter(PartnerAccessConfig.empno == empno).first()
    if not cfg:
        return {"empno": empno, "scope": "self", "departments": ""}
    return {"empno": cfg.empno, "scope": cfg.scope, "departments": cfg.departments}


@router.put("/partners/{empno}")
def update_partner_config(
    empno: str,
    body: ScopeUpdate,
    user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """파트너의 접근 범위 업데이트."""
    if body.scope not in ("self", "departments", "all"):
        raise HTTPException(status_code=400, detail="scope는 self, departments, all 중 하나여야 합니다.")

    cfg = db.query(PartnerAccessConfig).filter(PartnerAccessConfig.empno == empno).first()
    if not cfg:
        # 파트너 이름 조회
        from app.models.project import Project
        prj = db.query(Project).filter(Project.el_empno == empno).first()
        cfg = PartnerAccessConfig(
            empno=empno,
            emp_name=prj.el_name if prj else empno,
            scope=body.scope,
            departments=body.departments or "",
        )
        db.add(cfg)
    else:
        cfg.scope = body.scope
        cfg.departments = body.departments or ""

    db.commit()
    return {"ok": True, "empno": empno, "scope": cfg.scope, "departments": cfg.departments}


@router.get("/departments")
def list_all_departments(
    user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """전체 본부 목록 (PostgreSQL + Azure 병합)."""

    from sqlalchemy import distinct
    from app.models.project import Project
    from app.services import azure_service

    depts = set()

    pg_depts = db.query(distinct(Project.department)).filter(
        Project.department.isnot(None), Project.department != ""
    ).all()
    depts.update(d[0] for d in pg_depts)

    azure_projects = azure_service.search_azure_projects("", limit=99999)
    for ap in azure_projects:
        dept = ap.get("department", "")
        if dept:
            depts.add(dept)

    return sorted(depts)


# ===== S0: Session / Login audit =====
from sqlalchemy import desc

from app.models.session import Session as DBSession
from app.models.session import LoginLog
from app.core.sessions import revoke_all_sessions_for_empno


@router.get("/sessions")
def list_sessions(
    empno: str | None = None,
    only_active: bool = True,
    limit: int = 100,
    user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List active sessions (admin only). Filter by empno optional."""
    q = db.query(DBSession)
    if empno:
        q = q.filter(DBSession.empno == empno)
    if only_active:
        q = q.filter(DBSession.revoked_at.is_(None))
    rows = q.order_by(desc(DBSession.created_at)).limit(limit).all()
    return [
        {
            "session_id": (r.session_id[:8] + "…") if r.session_id else None,
            "empno": r.empno,
            "role": r.role,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "expires_at": r.expires_at.isoformat() if r.expires_at else None,
            "last_seen_at": r.last_seen_at.isoformat() if r.last_seen_at else None,
            "ip": r.ip,
            "user_agent": r.user_agent,
            "revoked_at": r.revoked_at.isoformat() if r.revoked_at else None,
        }
        for r in rows
    ]


@router.delete("/sessions/by-empno/{empno}")
def revoke_all_for_user(
    empno: str,
    user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Force-revoke every active session for the given empno (admin only)."""
    n = revoke_all_sessions_for_empno(db, empno)
    return {"revoked": n}


@router.get("/login-log")
def list_login_log(
    empno: str | None = None,
    limit: int = 200,
    user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Return recent login_log rows (admin only)."""
    q = db.query(LoginLog)
    if empno:
        q = q.filter(LoginLog.empno == empno)
    rows = q.order_by(desc(LoginLog.logged_in_at)).limit(limit).all()
    return [
        {
            "id": r.id,
            "empno": r.empno,
            "logged_in_at": r.logged_in_at.isoformat() if r.logged_in_at else None,
            "success": r.success,
            "failure_reason": r.failure_reason,
            "ip": r.ip,
            "user_agent": r.user_agent,
        }
        for r in rows
    ]
