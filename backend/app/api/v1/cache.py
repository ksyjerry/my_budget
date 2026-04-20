import logging

from fastapi import APIRouter, Depends

from app.services.azure_service import clear_cache, get_cache_status
from app.services import azure_service
from app.api.deps import require_admin

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/clear")
def clear_cache_endpoint(user: dict = Depends(require_admin)):
    """캐시 전체 초기화 (admin only)."""
    clear_cache()
    return {"message": "캐시가 초기화되었습니다."}


@router.get("/status")
def cache_status_endpoint():
    """캐시 상태 조회."""
    return get_cache_status()


@router.post("/warmup")
def cache_warmup_endpoint(user: dict = Depends(require_admin)):
    """전체 TMS 데이터를 미리 캐시에 로드 (admin only)."""
    rows = azure_service._fetch_all_tms_rows()
    return {"message": "캐시 워밍 완료", "rows": len(rows)}


def warmup_cache_background():
    """백그라운드에서 캐시 워밍 (서버 시작 시)."""
    try:
        rows = azure_service._fetch_all_tms_rows()
        logger.info(f"Cache warmup complete: {len(rows)} rows")
    except Exception as e:
        logger.warning(f"Cache warmup failed: {e}")
