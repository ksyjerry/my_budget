import time
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.session import get_db
from app.api.deps import require_admin, require_login
from app.models.project import Client
from app.services.sync_service import (
    sync_employees,
    sync_teams,
    sync_actual_data,
    sync_clients,
)

router = APIRouter()


@router.post("/employees")
def sync_employees_endpoint(
    user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Azure → Postgres 직원 동기화 (admin only)."""
    t0 = time.time()
    count = sync_employees(db)
    elapsed_ms = int((time.time() - t0) * 1000)
    return {"synced": count, "elapsed_ms": elapsed_ms, "message": "ok"}


@router.get("/employees/status")
def sync_employees_status(
    user: dict = Depends(require_login),
    db: Session = Depends(get_db),
):
    """마지막 Azure 직원 동기화 상태 조회 (인증 필요)."""
    from app.models.employee import Employee
    total = db.query(func.count(Employee.empno)).scalar() or 0
    last_sync = db.query(func.max(Employee.synced_at)).scalar()
    return {
        "total_employees": total,
        "last_sync": last_sync.isoformat() if last_sync else None,
    }


@router.post("/teams")
def sync_teams_endpoint(
    user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Azure → Postgres 팀 동기화 (admin only)."""
    count = sync_teams(db)
    return {"message": f"{count}개 팀 동기화 완료"}


@router.post("/actual")
def sync_actual_endpoint(
    project_codes: list[str],
    user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Azure → Postgres Actual 데이터 동기화 (admin only)."""
    count = sync_actual_data(db, project_codes)
    return {"message": f"{count}건 Actual 데이터 동기화 완료"}


@router.post("/clients")
def sync_clients_endpoint(
    user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Azure → Postgres 클라이언트 동기화 (admin only)."""
    t0 = time.time()
    count = sync_clients(db)
    elapsed_ms = int((time.time() - t0) * 1000)
    return {"synced": count, "elapsed_ms": elapsed_ms, "message": "ok"}


@router.get("/clients/status")
def sync_clients_status(
    user: dict = Depends(require_login),
    db: Session = Depends(get_db),
):
    """마지막 Azure 클라이언트 동기화 상태 조회 (인증 필요)."""
    total = db.query(func.count(Client.id)).scalar() or 0
    azure_synced = (
        db.query(func.count(Client.id))
        .filter(Client.synced_at.isnot(None))
        .scalar()
        or 0
    )
    last_sync = db.query(func.max(Client.synced_at)).scalar()
    return {
        "total_clients": total,
        "azure_synced": azure_synced,
        "last_sync": last_sync.isoformat() if last_sync else None,
    }
