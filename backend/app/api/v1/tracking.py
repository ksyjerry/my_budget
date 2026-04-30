"""Budget Tracking API — Partner view for cost/revenue tracking.

Data source: PostgreSQL tba_cache (synced from Azure BI_PARTNERREPORT_TBA_V).
Call POST /tracking/sync to refresh cache.
"""
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import Optional

from app.db.session import get_db
from app.models.project import Project
from app.models.budget_master import PartnerAccessConfig
from app.services import azure_service
from app.services.em_rate import calc_cost, calc_cost_by_code
from app.api.deps import get_optional_user, require_admin

logger = logging.getLogger(__name__)
router = APIRouter()


def _get_partner_access(
    db: Session, empno: str, user: Optional[dict] = None
) -> Optional[PartnerAccessConfig]:
    """Tracking 권한 판정 (POL-08 (b): EL + admin).

    Priority order:
      1. partner_access_config row 명시 등록 → 그 scope (all / departments / self) 사용
      2. user.role == 'admin' → 자동 scope='all' (DB row 없어도)
      3. 어떤 Project 의 el_empno 일치 → 자동 scope='self' (모든 EL 자동 access)
      4. 그 외 → None (접근 거부)

    user 인자 미제공 시 fallback 으로 partner_access_config 만 조회 (legacy).
    """
    cfg = db.query(PartnerAccessConfig).filter(PartnerAccessConfig.empno == empno).first()
    if cfg:
        return cfg

    # Implicit access — user 컨텍스트가 있을 때만 작동
    if user is None:
        return None

    # Admin role → all scope (메모리 객체, 영속 안 함)
    if user.get("role") == "admin":
        return PartnerAccessConfig(empno=empno, scope="all")

    # 어떤 프로젝트의 EL 인지 확인 → self scope
    is_el = db.query(Project.id).filter(Project.el_empno == empno).first() is not None
    if is_el:
        return PartnerAccessConfig(empno=empno, scope="self")

    return None


def _get_allowed_project_codes(db: Session, user: dict) -> list[str]:
    """사용자 scope에 따라 접근 가능한 프로젝트 코드 목록."""
    cfg = _get_partner_access(db, user["empno"], user)
    if not cfg:
        return []

    if cfg.scope == "all":
        codes = db.query(Project.project_code).all()
    elif cfg.scope == "departments":
        depts = [d.strip() for d in (cfg.departments or "").split(",") if d.strip()]
        if not depts:
            return []
        codes = db.query(Project.project_code).filter(Project.department.in_(depts)).all()
    else:  # self
        codes = db.query(Project.project_code).filter(
            (Project.el_empno == user["empno"]) | (Project.pm_empno == user["empno"])
        ).all()

    return [c[0] for c in codes]


@router.get("/tracking/projects")
def get_tracking_projects(
    year_month: Optional[str] = None,
    project_code: Optional[str] = None,
    el_empno: Optional[str] = None,
    pm_empno: Optional[str] = None,
    department: Optional[str] = None,
    db: Session = Depends(get_db),
    user: Optional[dict] = Depends(get_optional_user),
):
    """Partner의 프로젝트별 Budget Amount vs Actual Amount 추적.

    데이터 소스: PostgreSQL tba_cache (고속 조회).
    - year_month: 특정 월 (YYYYMM). 미지정 시 프로젝트별 최신 월.
    - project_code / el_empno / pm_empno / department: 추가 필터
    """
    if not user:
        raise HTTPException(status_code=401, detail="인증이 필요합니다.")

    cfg = _get_partner_access(db, user["empno"], user)
    if not cfg:
        raise HTTPException(status_code=403, detail="Partner 권한이 필요합니다.")

    allowed_codes = _get_allowed_project_codes(db, user)
    if not allowed_codes:
        return {"kpi": {}, "projects": [], "year_months": []}

    # 프로젝트 사전 필터
    proj_query = db.query(Project).filter(Project.project_code.in_(allowed_codes))
    if project_code:
        proj_query = proj_query.filter(Project.project_code == project_code)
    if el_empno:
        proj_query = proj_query.filter(Project.el_empno == el_empno)
    if pm_empno:
        proj_query = proj_query.filter(Project.pm_empno == pm_empno)
    if department:
        proj_query = proj_query.filter(Project.department == department)

    filtered_projects = proj_query.all()
    filtered_codes = [p.project_code for p in filtered_projects]
    proj_map = {p.project_code: p for p in filtered_projects}

    if not filtered_codes:
        return {"kpi": {}, "projects": [], "year_months": []}

    # 사용 가능한 year_months (캐시 전체 기준)
    ym_result = db.execute(
        text(
            "SELECT DISTINCT year_month FROM tba_cache "
            "WHERE project_code = ANY(:codes) ORDER BY year_month DESC"
        ),
        {"codes": filtered_codes},
    )
    available_yms = [r[0] for r in ym_result]

    # 대상 TBA 조회 — 특정 월 또는 프로젝트별 최신월
    if year_month:
        tba_rows = db.execute(
            text(
                "SELECT project_code, year_month, revenue, budget_hours, "
                "       actual_hours, std_cost, em "
                "FROM tba_cache "
                "WHERE project_code = ANY(:codes) AND year_month = :ym"
            ),
            {"codes": filtered_codes, "ym": year_month},
        ).fetchall()
    else:
        # DISTINCT ON으로 프로젝트별 최신 월 한 건씩
        tba_rows = db.execute(
            text(
                "SELECT DISTINCT ON (project_code) "
                "       project_code, year_month, revenue, budget_hours, "
                "       actual_hours, std_cost, em "
                "FROM tba_cache "
                "WHERE project_code = ANY(:codes) "
                "ORDER BY project_code, year_month DESC"
            ),
            {"codes": filtered_codes},
        ).fetchall()

    tba_map = {r[0]: r for r in tba_rows}

    # 기준 연월까지 누적 Budget Hour 계산 (budget_details 기반)
    # budget_details.year_month 포맷: "2026-01"
    # tba year_month 포맷: "202601"
    def _to_dashed(ym: str) -> str:
        """202601 → 2026-01"""
        if len(ym) == 6:
            return f"{ym[:4]}-{ym[4:6]}"
        return ym

    # 프로젝트별로 다른 기준 연월을 사용할 수 있으므로 한 번의 쿼리로 처리
    # 각 프로젝트의 기준 연월 수집
    project_target_ym: dict[str, str] = {}
    for pc in filtered_codes:
        tba = tba_map.get(pc)
        if tba:
            project_target_ym[pc] = _to_dashed(tba[1])  # tba[1] = year_month

    # 한 번의 쿼리로 모든 프로젝트의 누적 Budget Hour + Budget Cost 조회
    cum_budget_hours_map: dict[str, float] = {}
    cum_budget_cost_map: dict[str, float] = {}
    # 프로젝트별 최대 budget_details 월(= 전체 대비 현재까지의 비율 계산용)
    total_budget_hours_map: dict[str, float] = {}
    if project_target_ym:
        bd_rows = db.execute(
            text(
                "SELECT project_code, year_month, budget_hours, grade "
                "FROM budget_details "
                "WHERE project_code = ANY(:codes)"
            ),
            {"codes": filtered_codes},
        ).fetchall()
        for bd in bd_rows:
            pc = bd[0]
            bd_ym = bd[1] or ""
            hrs = float(bd[2] or 0)
            grade = bd[3] or ""
            target_ym = project_target_ym.get(pc)
            total_budget_hours_map[pc] = total_budget_hours_map.get(pc, 0.0) + hrs
            if target_ym and bd_ym and bd_ym <= target_ym:
                cum_budget_hours_map[pc] = cum_budget_hours_map.get(pc, 0.0) + hrs
                cum_budget_cost_map[pc] = cum_budget_cost_map.get(pc, 0.0) + calc_cost(grade, bd_ym, hrs)

    # Partner (EL/QRP) 실제 시간 제외 — actual_cache에서 조회
    partner_actual_map: dict[str, float] = {}
    partner_empnos_by_pc: dict[str, set[str]] = {}
    for pc, proj in proj_map.items():
        partners = set()
        if proj.el_empno:
            partners.add(proj.el_empno)
        if proj.qrp_empno:
            partners.add(proj.qrp_empno)
        if partners:
            partner_empnos_by_pc[pc] = partners

    if partner_empnos_by_pc:
        # 모든 partner empno 한 번에 조회
        all_partners: set[str] = set()
        for s in partner_empnos_by_pc.values():
            all_partners.update(s)
        partner_actual_rows = db.execute(
            text(
                "SELECT project_code, empno, SUM(use_time) "
                "FROM actual_cache "
                "WHERE project_code = ANY(:codes) AND empno = ANY(:emps) "
                "GROUP BY project_code, empno"
            ),
            {"codes": filtered_codes, "emps": list(all_partners)},
        ).fetchall()
        for par in partner_actual_rows:
            pc = par[0]
            emp = par[1]
            hrs = float(par[2] or 0)
            if emp in partner_empnos_by_pc.get(pc, set()):
                partner_actual_map[pc] = partner_actual_map.get(pc, 0.0) + hrs

    rows = []
    total_revenue = 0.0
    total_budget_hours = 0.0
    total_actual_hours = 0.0
    total_budget_cost = 0.0
    total_std_cost = 0.0

    for pc in filtered_codes:
        tba = tba_map.get(pc)
        proj = proj_map.get(pc)
        if not proj:
            continue

        if tba:
            _, ym, rev, _bh_tba, ah, sc, _em = tba
            rev = float(rev or 0)
            ah_all = float(ah or 0)
            sc = float(sc or 0)
            bh = cum_budget_hours_map.get(pc, float(_bh_tba or 0))
            bc = cum_budget_cost_map.get(pc, 0.0)
        else:
            ym, rev, bh, ah_all, sc, bc = "", 0, 0, 0, 0, 0

        # Actual Hour: Partner (EL/QRP) 시간 제외
        ah = max(0.0, ah_all - partner_actual_map.get(pc, 0.0))

        # Budget Cost에 Fulcrum/RA-Staff/Specialist × Manager rate 추가
        # 월별 비율로 분배 (Staff 진행률 기준)
        total_bh = total_budget_hours_map.get(pc, 0.0)
        progress_ratio = (bh / total_bh) if total_bh > 0 else 0.0
        target_ym_dashed = project_target_ym.get(pc, "")

        external_hours = (
            (proj.fulcrum_hours or 0)
            + (proj.ra_staff_hours or 0)
            + (proj.specialist_hours or 0)
        )
        # Manager rate — 기준 연월의 Busy/NonBusy로 계산
        external_cost_total = calc_cost_by_code("M", target_ym_dashed, external_hours)
        bc += external_cost_total * progress_ratio

        cost_diff = bc - sc  # Budget Cost - Actual Cost (양수 = 절감)

        rows.append({
            "project_code": pc,
            "project_name": proj.project_name or "",
            "el_name": proj.el_name or "",
            "pm_name": proj.pm_name or "",
            "year_month": ym,
            "revenue": rev,
            "budget_hours": bh,
            "actual_hours": ah,
            "budget_cost": bc,
            "std_cost": sc,
            "cost_diff": cost_diff,
            "progress_hours": round(ah / bh * 100, 1) if bh else 0,
            "progress_cost": round(sc / bc * 100, 1) if bc else 0,
        })

        total_revenue += rev
        total_budget_hours += bh
        total_actual_hours += ah
        total_budget_cost += bc
        total_std_cost += sc

    rows.sort(key=lambda x: (-x["revenue"], -x["cost_diff"]))

    # 마지막 동기화 시각
    last_sync_row = db.execute(
        text("SELECT MAX(synced_at) FROM tba_cache")
    ).fetchone()
    last_sync = last_sync_row[0].isoformat() if last_sync_row and last_sync_row[0] else None

    return {
        "kpi": {
            "total_revenue": total_revenue,
            "total_budget_hours": total_budget_hours,
            "total_actual_hours": total_actual_hours,
            "total_budget_cost": total_budget_cost,
            "total_std_cost": total_std_cost,
            "total_cost_diff": total_budget_cost - total_std_cost,
            "project_count": len(rows),
            "year_month": year_month or (available_yms[0] if available_yms else ""),
        },
        "projects": rows,
        "year_months": available_yms,
        "last_sync": last_sync,
    }


@router.get("/tracking/projects/{project_code}")
def get_tracking_project_detail(
    project_code: str,
    db: Session = Depends(get_db),
    user: Optional[dict] = Depends(get_optional_user),
):
    """특정 프로젝트의 월별 TBA 추이."""
    if not user:
        raise HTTPException(status_code=401, detail="인증이 필요합니다.")

    cfg = _get_partner_access(db, user["empno"], user)
    if not cfg:
        raise HTTPException(status_code=403, detail="Partner 권한이 필요합니다.")

    allowed = _get_allowed_project_codes(db, user)
    if project_code not in allowed:
        raise HTTPException(status_code=403, detail="해당 프로젝트에 접근 권한이 없습니다.")

    proj = db.query(Project).filter(Project.project_code == project_code).first()
    if not proj:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")

    # 로컬 캐시에서 월별 TBA 조회
    rows = db.execute(
        text(
            "SELECT year_month, yearly, revenue, budget_hours, actual_hours, std_cost, em "
            "FROM tba_cache WHERE project_code = :pc ORDER BY year_month"
        ),
        {"pc": project_code},
    ).fetchall()

    # budget_details에서 월별 budget_hours + grade → 원가 계산
    bd_rows = db.execute(
        text(
            "SELECT year_month, budget_hours, grade "
            "FROM budget_details WHERE project_code = :pc"
        ),
        {"pc": project_code},
    ).fetchall()
    bd_monthly_hours: dict[str, float] = {}
    bd_monthly_cost: dict[str, float] = {}
    for bd in bd_rows:
        ym = bd[0] or ""
        hrs = float(bd[1] or 0)
        grade = bd[2] or ""
        if not ym:
            continue
        bd_monthly_hours[ym] = bd_monthly_hours.get(ym, 0.0) + hrs
        bd_monthly_cost[ym] = bd_monthly_cost.get(ym, 0.0) + calc_cost(grade, ym, hrs)
    total_staff_hours = sum(bd_monthly_hours.values())

    # Partner (EL/QRP) 실제 시간 제외 — actual_cache에서 조회
    partner_empnos = []
    if proj.el_empno:
        partner_empnos.append(proj.el_empno)
    if proj.qrp_empno:
        partner_empnos.append(proj.qrp_empno)
    partner_actual_total = 0.0
    if partner_empnos:
        r_par = db.execute(
            text(
                "SELECT COALESCE(SUM(use_time), 0) FROM actual_cache "
                "WHERE project_code = :pc AND empno = ANY(:emps)"
            ),
            {"pc": project_code, "emps": partner_empnos},
        ).fetchone()
        partner_actual_total = float(r_par[0] or 0)

    # 외부팀 총 시간 (Manager rate 적용)
    external_hours = (
        (proj.fulcrum_hours or 0)
        + (proj.ra_staff_hours or 0)
        + (proj.specialist_hours or 0)
    )

    def _to_dashed(ym: str) -> str:
        return f"{ym[:4]}-{ym[4:6]}" if len(ym) == 6 else ym

    monthly = []
    # Actual 월별에서 Partner 시간 제외 — 단순화: 전체 Partner를 최신 월 기준으로만 적용
    # (월별로 나누려면 추가 쿼리 필요하지만 일단 생략)
    for r in rows:
        ym = r[0]
        target_dashed = _to_dashed(ym)
        cum_budget_hours = sum(v for k, v in bd_monthly_hours.items() if k and k <= target_dashed)
        cum_budget_cost = sum(v for k, v in bd_monthly_cost.items() if k and k <= target_dashed)
        # 외부팀 원가: Staff 진행률 기준으로 분배
        progress_ratio = (cum_budget_hours / total_staff_hours) if total_staff_hours > 0 else 0
        external_cost_total = calc_cost_by_code("M", ym, external_hours)
        cum_budget_cost += external_cost_total * progress_ratio

        # Partner 비율 — 단순화: 전체 Partner actual 합을 월별 actual에 비례 분배
        ah_all = float(r[4] or 0)
        # 전체 기간 기준 partner 비율
        latest_ah = float(rows[-1][4] or 0) if rows else 0
        partner_ratio = (partner_actual_total / latest_ah) if latest_ah > 0 else 0
        ah_excl_partner = max(0.0, ah_all - ah_all * partner_ratio)

        std_cost = float(r[5] or 0)
        monthly.append({
            "year_month": ym,
            "yearly": r[1] or "",
            "revenue": float(r[2] or 0),
            "budget_hours": cum_budget_hours if cum_budget_hours > 0 else float(r[3] or 0),
            "actual_hours": ah_excl_partner,
            "budget_cost": cum_budget_cost,
            "std_cost": std_cost,
            "cost_diff": cum_budget_cost - std_cost,
            "project_code": project_code,
        })

    return {
        "project": {
            "project_code": project_code,
            "project_name": proj.project_name or "",
            "el_name": proj.el_name or "",
            "pm_name": proj.pm_name or "",
            "department": proj.department or "",
        },
        "monthly": monthly,
        "latest": monthly[-1] if monthly else None,
    }


def _sync_tba_cache(db: Session) -> dict:
    """Azure BI_PARTNERREPORT_TBA_V에서 전체 프로젝트 TBA 데이터를 로컬 캐시로 동기화."""
    t0 = datetime.now()

    # 전체 프로젝트 코드
    all_codes = [c[0] for c in db.query(Project.project_code).all()]
    if not all_codes:
        return {"synced": 0, "elapsed_sec": 0, "message": "no projects"}

    # Azure 메모리 캐시 초기화 후 전체 조회 (fresh data 보장)
    azure_service._cache.clear()
    tba_rows = azure_service.get_tba_by_projects(all_codes)

    if not tba_rows:
        return {"synced": 0, "elapsed_sec": (datetime.now() - t0).total_seconds(), "message": "empty from azure"}

    # UPSERT — ON CONFLICT로 프로젝트+월 기준 갱신
    db.execute(text("DELETE FROM tba_cache"))
    synced = 0
    for r in tba_rows:
        db.execute(
            text(
                "INSERT INTO tba_cache "
                "  (project_code, year_month, yearly, revenue, budget_hours, actual_hours, std_cost, em, synced_at) "
                "VALUES (:pc, :ym, :yr, :rev, :bh, :ah, :sc, :em, NOW()) "
                "ON CONFLICT (project_code, year_month) DO UPDATE SET "
                "  yearly = EXCLUDED.yearly, "
                "  revenue = EXCLUDED.revenue, "
                "  budget_hours = EXCLUDED.budget_hours, "
                "  actual_hours = EXCLUDED.actual_hours, "
                "  std_cost = EXCLUDED.std_cost, "
                "  em = EXCLUDED.em, "
                "  synced_at = NOW()"
            ),
            {
                "pc": r["project_code"],
                "ym": r["year_month"],
                "yr": r.get("yearly", ""),
                "rev": r["revenue"],
                "bh": r["budget_hours"],
                "ah": r["actual_hours"],
                "sc": r["std_cost"],
                "em": r["em"],
            },
        )
        synced += 1

    db.commit()
    elapsed = (datetime.now() - t0).total_seconds()
    logger.info(f"TBA cache synced: {synced} rows in {elapsed:.1f}s")
    return {"synced": synced, "elapsed_sec": round(elapsed, 1), "message": "ok"}


@router.post("/tracking/sync")
def sync_tba_cache(
    user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """TBA 캐시 동기화 (Admin 전용)."""
    result = _sync_tba_cache(db)
    return result


@router.get("/tracking/filter-options")
def get_tracking_filter_options(
    db: Session = Depends(get_db),
    user: Optional[dict] = Depends(get_optional_user),
):
    """Tracking 페이지 필터용 EL/PM/본부/프로젝트 목록 (사용자 scope 내)."""
    if not user:
        raise HTTPException(status_code=401, detail="인증이 필요합니다.")

    cfg = _get_partner_access(db, user["empno"], user)
    if not cfg:
        raise HTTPException(status_code=403, detail="Partner 권한이 필요합니다.")

    allowed_codes = _get_allowed_project_codes(db, user)
    if not allowed_codes:
        return {"projects": [], "els": [], "pms": [], "departments": []}

    projects = db.query(Project).filter(Project.project_code.in_(allowed_codes)).all()

    proj_opts = sorted(
        [
            {"value": p.project_code, "label": f"{p.project_code} {p.project_name or ''}"}
            for p in projects
        ],
        key=lambda x: x["label"],
    )

    el_map: dict[str, str] = {}
    pm_map: dict[str, str] = {}
    dept_set: set[str] = set()
    for p in projects:
        if p.el_empno and p.el_name:
            el_map[p.el_empno] = p.el_name
        if p.pm_empno and p.pm_name:
            pm_map[p.pm_empno] = p.pm_name
        if p.department:
            dept_set.add(p.department)

    return {
        "projects": proj_opts,
        "els": sorted(
            [{"value": k, "label": f"{v} ({k})"} for k, v in el_map.items()],
            key=lambda x: x["label"],
        ),
        "pms": sorted(
            [{"value": k, "label": f"{v} ({k})"} for k, v in pm_map.items()],
            key=lambda x: x["label"],
        ),
        "departments": sorted([{"value": d, "label": d} for d in dept_set], key=lambda x: x["label"]),
    }


@router.get("/tracking/access")
def check_tracking_access(
    db: Session = Depends(get_db),
    user: Optional[dict] = Depends(get_optional_user),
):
    """현재 사용자가 Tracking 기능에 접근 권한이 있는지 확인."""
    if not user:
        return {"has_access": False, "reason": "로그인 필요"}
    cfg = _get_partner_access(db, user["empno"], user)
    if not cfg:
        return {"has_access": False, "reason": "Partner 권한 없음"}
    return {
        "has_access": True,
        "scope": cfg.scope,
        "empno": user["empno"],
        "name": user.get("name", ""),
    }
