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
from app.api.v1 import auth, budget_upload, budget_input, overview, projects, assignments, summary, export, cache, admin

app = FastAPI(title=settings.APP_NAME, version="0.1.0")


@app.on_event("startup")
def startup_cache_warmup():
    """서버 시작 시 백그라운드에서 Azure TMS 캐시 워밍."""
    thread = threading.Thread(
        target=cache.warmup_cache_background,
        daemon=True,
    )
    thread.start()

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
app.include_router(overview.router, prefix="/api/v1", tags=["overview"])
app.include_router(projects.router, prefix="/api/v1", tags=["projects"])
app.include_router(assignments.router, prefix="/api/v1", tags=["assignments"])
app.include_router(summary.router, prefix="/api/v1", tags=["summary"])
app.include_router(export.router, prefix="/api/v1", tags=["export"])
app.include_router(cache.router, prefix="/api/v1/cache", tags=["cache"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])


@app.get("/health")
def health():
    return {"status": "ok"}
