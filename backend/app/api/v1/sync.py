from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional

from app.db.session import get_db
from app.services.sync_service import sync_employees, sync_teams, sync_actual_data

router = APIRouter()


@router.post("/employees")
def sync_employees_endpoint(db: Session = Depends(get_db)):
    count = sync_employees(db)
    return {"message": f"{count}명 동기화 완료"}


@router.post("/teams")
def sync_teams_endpoint(db: Session = Depends(get_db)):
    count = sync_teams(db)
    return {"message": f"{count}개 팀 동기화 완료"}


@router.post("/actual")
def sync_actual_endpoint(
    project_codes: list[str],
    db: Session = Depends(get_db),
):
    count = sync_actual_data(db, project_codes)
    return {"message": f"{count}건 Actual 데이터 동기화 완료"}
