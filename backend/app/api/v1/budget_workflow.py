"""POL-04 standard workflow endpoints — submit / approve / unlock."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_elpm
from app.models.project import Project
from app.services.workflow import transition_status, WorkflowError

router = APIRouter()


def _project_or_404(db: Session, code: str) -> Project:
    p = db.query(Project).filter(Project.project_code == code).first()
    if not p:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다")
    return p


def _change(
    db: Session,
    user: dict,
    project_code: str,
    target_status: str,
):
    p = _project_or_404(db, project_code)
    try:
        transition_status(
            p,
            target_status=target_status,
            actor_empno=user["empno"],
            actor_role=user["role"],
        )
    except WorkflowError as e:
        raise HTTPException(status_code=409, detail=str(e))
    db.commit()
    return {"project_code": project_code, "template_status": p.template_status}


@router.post("/projects/{project_code}/submit")
def submit_project(
    project_code: str,
    db: Session = Depends(get_db),
    user: dict = Depends(require_elpm),
):
    """PM submits draft → 작성완료."""
    return _change(db, user, project_code, "작성완료")


@router.post("/projects/{project_code}/approve")
def approve_project(
    project_code: str,
    db: Session = Depends(get_db),
    user: dict = Depends(require_elpm),
):
    """EL approves → 승인완료."""
    return _change(db, user, project_code, "승인완료")


@router.post("/projects/{project_code}/unlock")
def unlock_project(
    project_code: str,
    db: Session = Depends(get_db),
    user: dict = Depends(require_elpm),
):
    """EL unlocks 승인완료 → 작성중."""
    return _change(db, user, project_code, "작성중")
