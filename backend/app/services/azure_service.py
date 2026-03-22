"""Azure SQL 직접 쿼리 서비스 (캐싱 포함, 성능 최적화)."""
import time
import logging
import threading
from collections import defaultdict
from typing import Optional

from sqlalchemy.orm import Session

from app.models.budget import ActivityBudgetMapping

logger = logging.getLogger(__name__)

# ── 캐시 설정 ──────────────────────────────────────
_CACHE_TTL = 900  # 15분
_cache: dict[str, tuple[float, object]] = {}
_fetch_lock = threading.Lock()  # Azure fetch 중복 방지


def _get_cached(key: str):
    """TTL 기반 캐시 조회."""
    if key in _cache:
        ts, data = _cache[key]
        if time.time() - ts < _CACHE_TTL:
            return data
        del _cache[key]
    return None


def _set_cached(key: str, data):
    _cache[key] = (time.time(), data)


def clear_cache():
    """전체 캐시 초기화."""
    global _mapping_cache, _mapping_index_cache
    _cache.clear()
    _mapping_cache = None
    _mapping_index_cache = None


def get_cache_status() -> dict:
    """캐시 상태 반환."""
    now = time.time()
    entries = []
    for key, (ts, data) in _cache.items():
        age = now - ts
        row_count = len(data) if isinstance(data, list) else "N/A"
        entries.append({
            "key": key,
            "age_seconds": round(age, 1),
            "ttl_remaining": round(max(0, _CACHE_TTL - age), 1),
            "rows": row_count,
        })
    return {"total_entries": len(_cache), "ttl_seconds": _CACHE_TTL, "entries": entries}


# ── Azure SQL 쿼리 ─────────────────────────────────

def _fetch_all_tms_rows() -> list[dict]:
    """Azure에서 전체 TMS 데이터 조회 (SQL 레벨 집계 + 캐시).

    모든 프로젝트를 한번에 가져와서 캐시. 이후 project_codes로 필터.
    Lock으로 동시 요청 시 중복 fetch 방지.
    """
    cache_key = "tms::all"
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached

    with _fetch_lock:
        # 락 획득 후 다시 확인 (다른 스레드가 이미 채웠을 수 있음)
        cached = _get_cached(cache_key)
        if cached is not None:
            return cached

        t0 = time.time()
        try:
            from app.db.azure_session import get_azure_connection

            with get_azure_connection() as conn:
                cursor = conn.cursor(as_dict=True)
                cursor.execute("""
                    SELECT EMPNO, PRJTCD,
                           FIRST_ACTIVITY_CODE, FIRST_ACTIVITY_NAME,
                           SECOND_ACTIVITY_CODE, SECOND_ACTIVITY_NAME,
                           THIRD_ACTIVITY_CODE, THIRD_ACTIVITY_NAME,
                           SUM(USE_TIME) AS USE_TIME
                    FROM BI_STAFFREPORT_TMS_V
                    WHERE INPUTDATE >= '2025-04-01'
                    GROUP BY EMPNO, PRJTCD,
                             FIRST_ACTIVITY_CODE, FIRST_ACTIVITY_NAME,
                             SECOND_ACTIVITY_CODE, SECOND_ACTIVITY_NAME,
                             THIRD_ACTIVITY_CODE, THIRD_ACTIVITY_NAME
                    HAVING SUM(USE_TIME) > 0
                """)
                rows = cursor.fetchall()
        except Exception as e:
            logger.warning(f"Azure SQL query failed ({time.time()-t0:.1f}s): {e}")
            return []

        # 정규화
        result = []
        for row in rows:
            use_time = float(row.get("USE_TIME") or 0)
            if use_time == 0:
                continue
            result.append({
                "empno": row.get("EMPNO", ""),
                "project_code": row.get("PRJTCD", ""),
                "use_time": use_time,
                "activity_code_1": row.get("FIRST_ACTIVITY_CODE", ""),
                "activity_name_1": row.get("FIRST_ACTIVITY_NAME", ""),
                "activity_code_2": row.get("SECOND_ACTIVITY_CODE", ""),
                "activity_name_2": row.get("SECOND_ACTIVITY_NAME", ""),
                "activity_code_3": row.get("THIRD_ACTIVITY_CODE", ""),
                "activity_name_3": row.get("THIRD_ACTIVITY_NAME", ""),
            })

        elapsed = time.time() - t0
        logger.info(f"Azure TMS fetch: {len(result)} rows in {elapsed:.2f}s (all projects, aggregated)")

        _set_cached(cache_key, result)
        return result


def _fetch_tms_rows(project_codes: list[str]) -> list[dict]:
    """프로젝트별 TMS 데이터 반환 (전체 캐시에서 필터)."""
    if not project_codes:
        return []

    all_rows = _fetch_all_tms_rows()
    pc_set = set(project_codes)
    return [r for r in all_rows if r["project_code"] in pc_set]


# ── Activity → Budget Unit 매핑 (인덱스 최적화) ────

_mapping_cache: Optional[tuple[float, list]] = None
_mapping_index_cache: Optional[tuple[float, dict]] = None


def _get_activity_budget_mapping(db: Session) -> list[dict]:
    """PostgreSQL activity_budget_mapping 테이블 로드 (캐시)."""
    global _mapping_cache
    if _mapping_cache:
        ts, data = _mapping_cache
        if time.time() - ts < _CACHE_TTL:
            return data

    rows = db.query(ActivityBudgetMapping).all()
    result = []
    for r in rows:
        result.append({
            "ac1": r.activity_code_1 or "",
            "ac2": r.activity_code_2 or "",
            "ac3": r.activity_code_3 or "",
            "budget_unit": r.budget_unit or "",
            "budget_category": r.budget_category or "",
        })
    _mapping_cache = (time.time(), result)
    return result


def _build_mapping_index(mapping: list[dict]) -> dict:
    """매핑 리스트를 해시 인덱스로 변환 — O(1) 조회용.

    인덱스 키: (ac1, ac2, ac3) → (budget_unit, budget_category)
    우선순위: 3레벨 > 2레벨 > 1레벨
    """
    global _mapping_index_cache
    if _mapping_index_cache:
        ts, idx = _mapping_index_cache
        if time.time() - ts < _CACHE_TTL:
            return idx

    index: dict[tuple, tuple] = {}
    for m in mapping:
        ac1, ac2, ac3 = m["ac1"], m["ac2"], m["ac3"]
        val = (m["budget_unit"], m["budget_category"])
        # 모든 가능한 키 조합 저장 (구체적 → 일반 순으로 나중에 덮어쓰기)
        if ac1 and not ac2 and not ac3:
            key = (ac1, "", "")
            if key not in index:
                index[key] = val
        if ac1 and ac2 and not ac3:
            key = (ac1, ac2, "")
            if key not in index:
                index[key] = val
        if ac1 and ac2 and ac3:
            key = (ac1, ac2, ac3)
            if key not in index:
                index[key] = val

    _mapping_index_cache = (time.time(), index)
    return index


def _resolve_budget_unit_fast(ac1: str, ac2: str, ac3: str, index: dict) -> tuple[str, str]:
    """해시 인덱스 기반 O(1) 매핑 조회.

    우선순위: (ac1,ac2,ac3) > (ac1,ac2,"") > (ac1,"","")
    """
    result = index.get((ac1, ac2, ac3))
    if result:
        return result
    result = index.get((ac1, ac2, ""))
    if result:
        return result
    result = index.get((ac1, "", ""))
    if result:
        return result
    return ("", "")


def _resolve_budget_unit(row: dict, mapping: list[dict]) -> tuple[str, str]:
    """activity_code 3레벨 → (budget_unit, budget_category) 매핑 (레거시)."""
    ac1 = row.get("activity_code_1", "")
    ac2 = row.get("activity_code_2", "")
    ac3 = row.get("activity_code_3", "")

    best_match = ("", "")
    best_level = 0

    for m in mapping:
        level = 0
        if m["ac1"] and m["ac1"] == ac1:
            level = 1
        else:
            continue
        if m["ac2"] and m["ac2"] == ac2:
            level = 2
        elif m["ac2"]:
            continue
        if m["ac3"] and m["ac3"] == ac3:
            level = 3
        elif m["ac3"]:
            continue
        if level > best_level:
            best_level = level
            best_match = (m["budget_unit"], m["budget_category"])

    return best_match


# ── 통합 집계 (Overview 페이지용, 단일 패스) ──────

def get_overview_actuals(
    project_codes: list[str],
    db: Session,
    role_empnos: Optional[list[str]] = None,
    staff_empnos: Optional[list[str]] = None,
) -> dict:
    """Overview에 필요한 모든 actual 집계를 단일 패스로 수행.

    Returns:
        {
            "by_project": {project_code: total},
            "by_unit": {budget_unit: total},
            "by_category": {budget_category: total},
            "by_project_empno": {(project_code, empno): total},  # role_empnos 필터
            "by_empno": {empno: total},  # staff_empnos 필터
        }
    """
    rows = _fetch_tms_rows(project_codes)
    mapping = _get_activity_budget_mapping(db)
    index = _build_mapping_index(mapping)

    by_project: dict[str, float] = defaultdict(float)
    by_unit: dict[str, float] = defaultdict(float)
    by_category: dict[str, float] = defaultdict(float)
    by_project_empno: dict[tuple[str, str], float] = defaultdict(float)
    by_empno: dict[str, float] = defaultdict(float)

    role_set = set(role_empnos) if role_empnos else None
    staff_set = set(staff_empnos) if staff_empnos else None

    for r in rows:
        pc = r["project_code"]
        emp = r["empno"]
        t = r["use_time"]

        by_project[pc] += t

        unit, cat = _resolve_budget_unit_fast(
            r.get("activity_code_1", ""),
            r.get("activity_code_2", ""),
            r.get("activity_code_3", ""),
            index,
        )
        by_unit[unit] += t
        by_category[cat or "기타"] += t

        if role_set and emp in role_set:
            by_project_empno[(pc, emp)] += t

        if staff_set and emp in staff_set:
            by_empno[emp] += t

    return {
        "by_project": dict(by_project),
        "by_unit": dict(by_unit),
        "by_category": dict(by_category),
        "by_project_empno": dict(by_project_empno),
        "by_empno": dict(by_empno),
    }


# ── Public 집계 함수 (개별 페이지용) ─────────────

def get_actual_by_project(project_codes: list[str]) -> dict[str, float]:
    """프로젝트별 total_use_time."""
    rows = _fetch_tms_rows(project_codes)
    result: dict[str, float] = defaultdict(float)
    for r in rows:
        result[r["project_code"]] += r["use_time"]
    return dict(result)


def get_actual_by_unit(project_codes: list[str], db: Session) -> dict[str, float]:
    """budget_unit별 total_use_time."""
    rows = _fetch_tms_rows(project_codes)
    mapping = _get_activity_budget_mapping(db)
    index = _build_mapping_index(mapping)
    result: dict[str, float] = defaultdict(float)
    for r in rows:
        unit, _ = _resolve_budget_unit_fast(
            r.get("activity_code_1", ""),
            r.get("activity_code_2", ""),
            r.get("activity_code_3", ""),
            index,
        )
        result[unit] += r["use_time"]
    return dict(result)


def get_actual_by_category(project_codes: list[str], db: Session) -> dict[str, float]:
    """budget_category별 total_use_time."""
    rows = _fetch_tms_rows(project_codes)
    mapping = _get_activity_budget_mapping(db)
    index = _build_mapping_index(mapping)
    result: dict[str, float] = defaultdict(float)
    for r in rows:
        _, cat = _resolve_budget_unit_fast(
            r.get("activity_code_1", ""),
            r.get("activity_code_2", ""),
            r.get("activity_code_3", ""),
            index,
        )
        result[cat or "기타"] += r["use_time"]
    return dict(result)


def get_actual_by_project_and_empno(
    project_codes: list[str], empnos: Optional[list[str]] = None
) -> dict[tuple[str, str], float]:
    """(project_code, empno)별 total_use_time."""
    rows = _fetch_tms_rows(project_codes)
    empno_set = set(empnos) if empnos else None
    result: dict[tuple[str, str], float] = defaultdict(float)
    for r in rows:
        if empno_set and r["empno"] not in empno_set:
            continue
        result[(r["project_code"], r["empno"])] += r["use_time"]
    return dict(result)


def get_actual_by_empno(
    empnos: list[str], project_codes: list[str]
) -> dict[str, float]:
    """empno별 total_use_time."""
    rows = _fetch_tms_rows(project_codes)
    empno_set = set(empnos)
    result: dict[str, float] = defaultdict(float)
    for r in rows:
        if r["empno"] in empno_set:
            result[r["empno"]] += r["use_time"]
    return dict(result)


def get_actual_by_unit_and_empno(
    project_codes: list[str], db: Session
) -> dict[tuple[str, str], float]:
    """(budget_unit, empno)별 total_use_time — projects 상세용."""
    rows = _fetch_tms_rows(project_codes)
    mapping = _get_activity_budget_mapping(db)
    index = _build_mapping_index(mapping)
    result: dict[tuple[str, str], float] = defaultdict(float)
    for r in rows:
        unit, _ = _resolve_budget_unit_fast(
            r.get("activity_code_1", ""),
            r.get("activity_code_2", ""),
            r.get("activity_code_3", ""),
            index,
        )
        result[(unit, r["empno"])] += r["use_time"]
    return dict(result)


def get_actual_by_empno_project_unit(
    empno: str, project_codes: list[str], db: Session
) -> dict[tuple[str, str], float]:
    """(project_code, budget_unit)별 total_use_time — assignment 상세용."""
    rows = _fetch_tms_rows(project_codes)
    mapping = _get_activity_budget_mapping(db)
    index = _build_mapping_index(mapping)
    result: dict[tuple[str, str], float] = defaultdict(float)
    for r in rows:
        if r["empno"] != empno:
            continue
        unit, _ = _resolve_budget_unit_fast(
            r.get("activity_code_1", ""),
            r.get("activity_code_2", ""),
            r.get("activity_code_3", ""),
            index,
        )
        result[(r["project_code"], unit)] += r["use_time"]
    return dict(result)


def _fetch_tms_raw_rows(project_codes: list[str]) -> list[dict]:
    """Azure에서 TMS 원시 데이터 조회 (비집계, export용)."""
    if not project_codes:
        return []

    cache_key = f"tms_raw::{','.join(sorted(project_codes))}"
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached

    t0 = time.time()
    try:
        from app.db.azure_session import get_azure_connection
        placeholders = ",".join([f"'{pc}'" for pc in project_codes])

        with get_azure_connection() as conn:
            cursor = conn.cursor(as_dict=True)
            cursor.execute(f"""
                SELECT EMPNO, INPUTDATE, PRJTCD, USE_TIME,
                       FIRST_ACTIVITY_CODE, FIRST_ACTIVITY_NAME,
                       SECOND_ACTIVITY_CODE, SECOND_ACTIVITY_NAME,
                       THIRD_ACTIVITY_CODE, THIRD_ACTIVITY_NAME
                FROM BI_STAFFREPORT_TMS_V
                WHERE PRJTCD IN ({placeholders})
                  AND INPUTDATE >= '2025-04-01'
            """)
            rows = cursor.fetchall()
    except Exception as e:
        logger.warning(f"Azure SQL raw query failed ({time.time()-t0:.1f}s): {e}")
        return []

    result = []
    for row in rows:
        use_time = float(row.get("USE_TIME") or 0)
        if use_time == 0:
            continue
        result.append({
            "empno": row.get("EMPNO", ""),
            "project_code": row.get("PRJTCD", ""),
            "use_time": use_time,
            "activity_code_1": row.get("FIRST_ACTIVITY_CODE", ""),
            "activity_code_2": row.get("SECOND_ACTIVITY_CODE", ""),
            "activity_code_3": row.get("THIRD_ACTIVITY_CODE", ""),
            "activity_name_1": row.get("FIRST_ACTIVITY_NAME", ""),
            "activity_name_2": row.get("SECOND_ACTIVITY_NAME", ""),
            "activity_name_3": row.get("THIRD_ACTIVITY_NAME", ""),
            "input_date": row.get("INPUTDATE", ""),
        })

    logger.info(f"Azure TMS raw fetch: {len(result)} rows in {time.time()-t0:.2f}s")
    _set_cached(cache_key, result)
    return result


def get_actual_raw_rows(
    project_codes: list[str], db: Session
) -> list[dict]:
    """export용 전체 행 (budget_unit 매핑 포함)."""
    rows = _fetch_tms_raw_rows(project_codes)
    mapping = _get_activity_budget_mapping(db)
    index = _build_mapping_index(mapping)
    result = []
    for r in rows:
        unit, cat = _resolve_budget_unit_fast(
            r.get("activity_code_1", ""),
            r.get("activity_code_2", ""),
            r.get("activity_code_3", ""),
            index,
        )
        result.append({
            **r,
            "budget_unit": unit,
            "budget_category": cat,
        })
    return result


# ── 직원/팀 직접 조회 ─────────────────────────────

def get_employees() -> list[dict]:
    """Azure에서 직원 목록 직접 조회."""
    cache_key = "employees"
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached

    from app.db.azure_session import get_azure_connection

    with get_azure_connection() as conn:
        cursor = conn.cursor(as_dict=True)
        cursor.execute("""
            SELECT EMPNO, EMPNM, CM_NM, GRADCD, GRADNM,
                   TL_EMPNO, LOS, ORG_CD, ORG_NM, PWC_ID, EMP_STAT
            FROM BI_STAFFREPORT_EMP_V
        """)
        rows = cursor.fetchall()

    result = [
        {
            "empno": r.get("EMPNO", ""),
            "name": r.get("EMPNM", ""),
            "department": r.get("CM_NM", ""),
            "grade_code": r.get("GRADCD", ""),
            "grade_name": r.get("GRADNM", ""),
            "org_code": r.get("ORG_CD", ""),
            "org_name": r.get("ORG_NM", ""),
            "email": r.get("PWC_ID", ""),
        }
        for r in rows
    ]
    _set_cached(cache_key, result)
    return result


def get_teams() -> list[dict]:
    """Azure에서 팀 목록 직접 조회."""
    cache_key = "teams"
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached

    from app.db.azure_session import get_azure_connection

    with get_azure_connection() as conn:
        cursor = conn.cursor(as_dict=True)
        cursor.execute("SELECT TEAMCD, TEAMNM FROM BI_STAFFREPORT_TEAM_V")
        rows = cursor.fetchall()

    result = [
        {"team_code": r.get("TEAMCD", ""), "team_name": r.get("TEAMNM", "")}
        for r in rows
    ]
    _set_cached(cache_key, result)
    return result
