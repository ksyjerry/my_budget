import logging
import threading

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings

# 로깅 설정 — 성능 모니터링
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
from app.api.v1 import auth, budget_upload, budget_input, budget_workflow, overview, projects, assignments, summary, export, cache, admin, chat, budget_assist, tracking, sync

app = FastAPI(title=settings.APP_NAME, version="0.1.0")


@app.on_event("startup")
def startup_cache_warmup():
    """서버 시작 시 백그라운드에서 Azure TMS 캐시 워밍."""
    thread = threading.Thread(
        target=cache.warmup_cache_background,
        daemon=True,
    )
    thread.start()

from apscheduler.schedulers.background import BackgroundScheduler

_scheduler = BackgroundScheduler(timezone="Asia/Seoul")


def _scheduled_client_sync():
    """매일 06:00 KST 에 Azure → Postgres 클라이언트 동기화."""
    from app.db.session import SessionLocal
    from app.services.sync_service import sync_clients
    logger = logging.getLogger("scheduler")
    db = SessionLocal()
    try:
        n = sync_clients(db)
        logger.info(f"Scheduled client sync: {n} clients")
    except Exception as e:
        logger.error(f"Scheduled client sync failed: {e}")
    finally:
        db.close()


def _scheduled_employee_sync():
    """매일 06:05 KST 에 Azure → Postgres 직원 동기화."""
    from app.db.session import SessionLocal
    from app.services.sync_service import sync_employees
    logger = logging.getLogger("scheduler")
    db = SessionLocal()
    try:
        n = sync_employees(db)
        logger.info(f"Scheduled employee sync: {n} employees")
    except Exception as e:
        logger.error(f"Scheduled employee sync failed: {e}")
    finally:
        db.close()


def _scheduled_session_cleanup():
    """매주 일요일 03:00 KST 에 30일 경과한 만료 세션 제거."""
    from app.db.session import SessionLocal
    from app.core.sessions import cleanup_expired_sessions
    logger = logging.getLogger("scheduler")
    db = SessionLocal()
    try:
        n = cleanup_expired_sessions(db, older_than_days=30)
        logger.info(f"Scheduled session cleanup: deleted {n} rows")
    except Exception as e:
        logger.error(f"Scheduled session cleanup failed: {e}")
    finally:
        db.close()


@app.on_event("startup")
def start_scheduler():
    if not _scheduler.running:
        _scheduler.add_job(
            _scheduled_client_sync,
            "cron",
            hour=6,
            minute=0,
            id="sync_clients",
            replace_existing=True,
        )
        _scheduler.add_job(
            _scheduled_employee_sync,
            "cron",
            hour=6,
            minute=5,
            id="sync_employees",
            replace_existing=True,
        )
        _scheduler.add_job(
            _scheduled_session_cleanup,
            "cron",
            day_of_week="sun",
            hour=3,
            id="session_cleanup",
            replace_existing=True,
        )
        _scheduler.start()


@app.on_event("shutdown")
def stop_scheduler():
    if _scheduler.running:
        _scheduler.shutdown(wait=False)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:8001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(budget_upload.router, prefix="/api/v1/budget", tags=["budget-upload"])
app.include_router(budget_input.router, prefix="/api/v1/budget", tags=["budget-input"])
app.include_router(budget_workflow.router, prefix="/api/v1/budget", tags=["budget-workflow"])
app.include_router(overview.router, prefix="/api/v1", tags=["overview"])
app.include_router(projects.router, prefix="/api/v1", tags=["projects"])
app.include_router(assignments.router, prefix="/api/v1", tags=["assignments"])
app.include_router(summary.router, prefix="/api/v1", tags=["summary"])
app.include_router(export.router, prefix="/api/v1", tags=["export"])
app.include_router(cache.router, prefix="/api/v1/cache", tags=["cache"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])
app.include_router(chat.router, prefix="/api/v1", tags=["chat"])
app.include_router(budget_assist.router, prefix="/api/v1", tags=["budget-assist"])
app.include_router(tracking.router, prefix="/api/v1", tags=["tracking"])
app.include_router(sync.router, prefix="/api/v1/sync", tags=["sync"])


@app.get("/health")
def health():
    return {"status": "ok"}
