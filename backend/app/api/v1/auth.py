"""Authentication endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.db.session import get_db
from app.models.project import Project
from app.models.budget import BudgetDetail
from app.models.budget_master import ProjectMember
from app.core.security import create_token

router = APIRouter()


class LoginRequest(BaseModel):
    empno: str


class LoginResponse(BaseModel):
    token: str
    empno: str
    name: str
    role: str  # "EL/PM" or "Staff"


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    # 1) PostgreSQL: EL 또는 PM인지 확인
    project = db.query(Project).filter(
        or_(Project.el_empno == req.empno, Project.pm_empno == req.empno)
    ).first()

    if project:
        name = project.el_name if project.el_empno == req.empno else project.pm_name
        token = create_token(req.empno, name or req.empno, role="EL/PM")
        return LoginResponse(token=token, empno=req.empno, name=name or req.empno, role="EL/PM")

    # 2) Azure SQL 캐시: Budget 미등록 프로젝트의 EL/PM도 로그인 허용
    from app.services import azure_service
    azure_projects = azure_service.search_azure_projects("", limit=99999)
    for ap in azure_projects:
        if ap.get("el_empno") == req.empno:
            name = ap.get("el_name") or req.empno
            token = create_token(req.empno, name, role="EL/PM")
            return LoginResponse(token=token, empno=req.empno, name=name, role="EL/PM")
        if ap.get("pm_empno") == req.empno:
            name = ap.get("pm_name") or req.empno
            token = create_token(req.empno, name, role="EL/PM")
            return LoginResponse(token=token, empno=req.empno, name=name, role="EL/PM")

    # 3) Staff(구성원)인지 확인 — project_members 또는 budget_details
    member = db.query(ProjectMember).filter(ProjectMember.empno == req.empno).first()
    if member:
        token = create_token(req.empno, member.name or req.empno)
        return LoginResponse(token=token, empno=req.empno, name=member.name or req.empno, role="Staff")

    budget = db.query(BudgetDetail).filter(BudgetDetail.empno == req.empno).first()
    if budget:
        token = create_token(req.empno, budget.emp_name or req.empno)
        return LoginResponse(token=token, empno=req.empno, name=budget.emp_name or req.empno, role="Staff")

    raise HTTPException(
        status_code=401,
        detail="해당 사번으로 등록된 프로젝트가 없습니다.",
    )
