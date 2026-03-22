"""Azure SQL Server 연결 관리 (커넥션 풀링)."""
import threading
from contextlib import contextmanager
from typing import Generator

from app.core.config import settings

# ── 커넥션 풀 (thread-safe) ─────────────────────────
_pool_lock = threading.Lock()
_pool: list = []
_MAX_POOL = 3


def _create_connection():
    """새 pymssql 연결 생성."""
    try:
        import pymssql
    except ImportError:
        raise RuntimeError(
            "pymssql is not available. Install with: pip install pymssql"
        )
    return pymssql.connect(
        server=settings.AZURE_SQL_HOST,
        user=settings.AZURE_SQL_USER,
        password=settings.AZURE_SQL_PASSWORD,
        database=settings.AZURE_SQL_DB,
        login_timeout=5,
        timeout=15,
    )


@contextmanager
def get_azure_connection() -> Generator:
    """풀에서 연결을 꺼내고, 사용 후 반환."""
    conn = None
    with _pool_lock:
        if _pool:
            conn = _pool.pop()

    # 풀에서 꺼낸 연결이 살아있는지 확인
    if conn is not None:
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.fetchone()
            cursor.close()
        except Exception:
            try:
                conn.close()
            except Exception:
                pass
            conn = None

    if conn is None:
        conn = _create_connection()

    try:
        yield conn
    except Exception:
        # 오류 시 연결 폐기
        try:
            conn.close()
        except Exception:
            pass
        raise
    else:
        # 정상 종료 시 풀에 반환
        with _pool_lock:
            if len(_pool) < _MAX_POOL:
                _pool.append(conn)
            else:
                conn.close()
