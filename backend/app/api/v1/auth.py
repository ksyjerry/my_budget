"""Authentication endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.db.session import get_db
from app.models.project import Project
from app.core.security import create_token

router = APIRouter()


class LoginRequest(BaseModel):
    empno: str


class LoginResponse(BaseModel):
    token: str
    empno: str
    name: str


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    # Find engagements where this empno is EL or PM
    project = db.query(Project).filter(
        or_(Project.el_empno == req.empno, Project.pm_empno == req.empno)
    ).first()

    if not project:
        raise HTTPException(
            status_code=401,
            detail="해당 사번으로 등록된 Engagement가 없습니다.",
        )

    # Resolve name (prefer EL name, fall back to PM name)
    if project.el_empno == req.empno:
        name = project.el_name or req.empno
    else:
        name = project.pm_name or req.empno

    token = create_token(req.empno, name)
    return LoginResponse(token=token, empno=req.empno, name=name)
