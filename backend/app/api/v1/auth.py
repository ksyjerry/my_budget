"""Cookie-based authentication endpoints (empno-only)."""
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.db.session import get_db
from app.models.project import Project
from app.models.budget import BudgetDetail
from app.models.budget_master import ProjectMember, PartnerAccessConfig
from app.models.employee import Employee
from app.models.session import LoginLog
from app.core.sessions import (
    SESSION_COOKIE_NAME,
    create_session,
    get_session,
    revoke_session,
)

router = APIRouter()


class LoginRequest(BaseModel):
    empno: str


class UserResponse(BaseModel):
    empno: str
    name: str
    role: str   # 'elpm' | 'staff' | 'admin'
    department: str | None = None


def _compute_role_and_scope(db: Session, empno: str) -> tuple[str, str]:
    """Return (role, scope) for the given empno.

    Role precedence:
    1. ``PartnerAccessConfig.scope == 'all'`` → ``admin``
    2. EL or PM in ``projects`` table → ``elpm`` (scope inherited from PartnerAccessConfig if any)
    3. EL or PM in Azure project cache → ``elpm``, scope='self'
    4. Member in ``project_members`` → ``staff``
    5. Historical row in ``budget_details`` → ``staff``
    6. Default → ``staff``

    Known limitation: a partner whose ``PartnerAccessConfig.scope`` is
    ``'departments'`` but who is NOT listed as EL/PM on any current project
    falls through to ``staff`` / ``self``, silently dropping the configured
    department scope. This combination is not expected in practice (partners
    are almost always EL/PM on at least one engagement). If product wants to
    support it, promote to ``elpm`` whenever any non-``all`` PartnerAccessConfig
    row exists — deferred until that requirement is confirmed.
    """
    cfg = db.query(PartnerAccessConfig).filter(PartnerAccessConfig.empno == empno).first()
    if cfg and cfg.scope == "all":
        return "admin", "all"

    elpm = db.query(Project).filter(
        or_(Project.el_empno == empno, Project.pm_empno == empno)
    ).first()
    if elpm:
        return "elpm", (cfg.scope if cfg else "self")

    # Azure SQL 에만 EL/PM 이 있을 수도 있으므로 cache 도 확인
    try:
        from app.services import azure_service
        azure_projects = azure_service.search_azure_projects("", limit=99999)
        for ap in azure_projects:
            if ap.get("el_empno") == empno or ap.get("pm_empno") == empno:
                return "elpm", "self"
    except Exception:
        pass

    member = db.query(ProjectMember).filter(ProjectMember.empno == empno).first()
    if member:
        return "staff", "self"
    bd = db.query(BudgetDetail).filter(BudgetDetail.empno == empno).first()
    if bd:
        return "staff", "self"

    return "staff", "self"  # 기본 — 본인 데이터만 보게 됨


def _resolve_name(db: Session, empno: str) -> tuple[str, str | None]:
    """Return (name, department)."""
    emp = db.query(Employee).filter(Employee.empno == empno).first()
    if emp and emp.emp_status and emp.emp_status.strip() in ("재직", "ACTIVE"):
        return emp.name, emp.department
    # 직원 마스터에 없으면 프로젝트에서 이름 추론
    p = db.query(Project).filter(
        or_(Project.el_empno == empno, Project.pm_empno == empno)
    ).first()
    if p:
        nm = p.el_name if p.el_empno == empno else p.pm_name
        return (nm or empno), None
    m = db.query(ProjectMember).filter(ProjectMember.empno == empno).first()
    if m and m.name:
        return m.name, None
    bd = db.query(BudgetDetail).filter(BudgetDetail.empno == empno).first()
    if bd and bd.emp_name:
        return bd.emp_name, None
    return empno, None


def _log_login(
    db: Session, *, empno: str | None, success: bool, reason: str | None, request: Request
) -> None:
    db.add(LoginLog(
        empno=empno,
        success=success,
        failure_reason=reason,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent", "")[:500],
    ))
    db.commit()


def _is_secure_request(request: Request) -> bool:
    return request.url.scheme == "https"


@router.post("/login", response_model=UserResponse)
def login(
    req: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    empno = req.empno.strip()
    if not empno:
        _log_login(db, empno=None, success=False, reason="empty", request=request)
        raise HTTPException(status_code=401, detail="사번을 입력해주세요.")

    emp = db.query(Employee).filter(Employee.empno == empno).first()
    if emp is not None and emp.emp_status and emp.emp_status.strip() not in ("재직", "ACTIVE"):
        _log_login(db, empno=empno, success=False, reason="inactive", request=request)
        raise HTTPException(status_code=401, detail="퇴사 처리된 사번입니다.")

    role, scope = _compute_role_and_scope(db, empno)
    if role == "staff":
        has_trace = (
            emp is not None
            or db.query(ProjectMember).filter(ProjectMember.empno == empno).first() is not None
            or db.query(BudgetDetail).filter(BudgetDetail.empno == empno).first() is not None
        )
        if not has_trace:
            _log_login(db, empno=empno, success=False, reason="not_found", request=request)
            raise HTTPException(status_code=401, detail="등록되지 않은 사번입니다.")

    name, department = _resolve_name(db, empno)

    sid = create_session(
        db,
        empno=empno,
        role=role,
        scope=scope,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent", "")[:500],
    )
    _log_login(db, empno=empno, success=True, reason=None, request=request)

    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=sid,
        httponly=True,
        secure=_is_secure_request(request),
        samesite="lax",
        path="/",
        # Max-Age 미설정 → 브라우저 세션 쿠키
    )
    return UserResponse(empno=empno, name=name, role=role, department=department)


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    sid = request.cookies.get(SESSION_COOKIE_NAME)
    if sid:
        revoke_session(db, sid)
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        secure=_is_secure_request(request),
        samesite="lax",
        httponly=True,
    )
    return {"ok": True}


@router.get("/me", response_model=UserResponse)
def me(request: Request, db: Session = Depends(get_db)):
    # 주의: Task 5 에서 get_current_user 를 쿠키 기반으로 교체하면 이 로컬 로직은
    # get_current_user dependency 로 대체된다. 그 때까지는 인라인으로 처리.
    sid = request.cookies.get(SESSION_COOKIE_NAME)
    s = get_session(db, sid) if sid else None
    if s is None:
        raise HTTPException(status_code=401, detail="세션이 만료되었거나 유효하지 않습니다.")
    name, department = _resolve_name(db, s.empno)
    return UserResponse(empno=s.empno, name=name, role=s.role, department=department)
