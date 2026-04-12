import time
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.session import get_db
from app.api.deps import get_optional_user
from app.models.project import Client
from app.services.sync_service import (
    sync_employees,
    sync_teams,
    sync_actual_data,
    sync_clients,
)

router = APIRouter()


def _require_admin(db: Session, user: dict | None):
    """partner_access_config.scope == 'all' 인 사용자만 admin."""
    if not user:
        raise HTTPException(status_code=401, detail="인증이 필요합니다.")
    from app.api.v1.tracking import _get_partner_access
    cfg = _get_partner_access(db, user["empno"])
    if not cfg or cfg.scope != "all":
        raise HTTPException(status_code=403, detail="관리자(scope=all)만 동기화할 수 있습니다.")


@router.post("/employees")
def sync_employees_endpoint(db: Session = Depends(get_db)):
    count = sync_employees(db)
    return {"message": f"{count}명 동기화 완료"}


@router.post("/teams")
def sync_teams_endpoint(db: Session = Depends(get_db)):
    count = sync_teams(db)
    return {"message": f"{count}개 팀 동기화 완료"}


@router.post("/actual")
def sync_actual_endpoint(project_codes: list[str], db: Session = Depends(get_db)):
    count = sync_actual_data(db, project_codes)
    return {"message": f"{count}건 Actual 데이터 동기화 완료"}


@router.post("/clients")
def sync_clients_endpoint(
    db: Session = Depends(get_db),
    user: dict | None = Depends(get_optional_user),
):
    """Azure → Postgres 클라이언트 동기화 (admin only)."""
    _require_admin(db, user)
    t0 = time.time()
    count = sync_clients(db)
    elapsed_ms = int((time.time() - t0) * 1000)
    return {"synced": count, "elapsed_ms": elapsed_ms, "message": "ok"}


@router.get("/clients/status")
def sync_clients_status(db: Session = Depends(get_db)):
    """마지막 Azure 클라이언트 동기화 상태 조회 (인증 불필요)."""
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
