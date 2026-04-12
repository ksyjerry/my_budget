"""Budget Tracking API — Partner view for cost/revenue tracking."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from app.db.session import get_db
from app.models.project import Project
from app.models.budget_master import PartnerAccessConfig
from app.services import azure_service
from app.api.deps import get_optional_user

router = APIRouter()


def _get_partner_access(db: Session, empno: str) -> Optional[PartnerAccessConfig]:
    return db.query(PartnerAccessConfig).filter(PartnerAccessConfig.empno == empno).first()


def _get_allowed_project_codes(db: Session, user: dict) -> list[str]:
    """사용자 scope에 따라 접근 가능한 프로젝트 코드 목록."""
    cfg = _get_partner_access(db, user["empno"])
    if not cfg:
        # partner_access_config에 등록되지 않은 경우 = Partner 권한 없음
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

    - year_month: 특정 월 (YYYYMM) 기준. 미지정 시 최신 월.
    - project_code / el_empno / pm_empno / department: 추가 필터
    """
    if not user:
        raise HTTPException(status_code=401, detail="인증이 필요합니다.")

    cfg = _get_partner_access(db, user["empno"])
    if not cfg:
        raise HTTPException(status_code=403, detail="Partner 권한이 필요합니다.")

    allowed_codes = _get_allowed_project_codes(db, user)
    if not allowed_codes:
        return {"kpi": {}, "projects": [], "year_months": []}

    # 프로젝트 사전 필터 (DB 레벨)
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

    # Azure TBA 조회 — 전체 월별 데이터
    all_tba = azure_service.get_tba_by_projects(filtered_codes)

    # 사용 가능한 year_month 목록 (최신순)
    available_yms = sorted({r["year_month"] for r in all_tba}, reverse=True)

    # year_month 필터 적용
    if year_month:
        selected_tba = [r for r in all_tba if r["year_month"] == year_month]
    else:
        # 미지정 시 프로젝트별 최신월
        latest: dict[str, dict] = {}
        for r in all_tba:
            pc = r["project_code"]
            if pc not in latest or r["year_month"] > latest[pc]["year_month"]:
                latest[pc] = r
        selected_tba = list(latest.values())

    tba_map = {r["project_code"]: r for r in selected_tba}

    rows = []
    total_revenue = 0.0
    total_budget_hours = 0.0
    total_actual_hours = 0.0
    total_std_cost = 0.0
    total_em = 0.0

    for pc in filtered_codes:
        tba = tba_map.get(pc)
        proj = proj_map.get(pc)
        if not proj:
            continue

        rev = tba["revenue"] if tba else 0
        bh = tba["budget_hours"] if tba else 0
        ah = tba["actual_hours"] if tba else 0
        sc = tba["std_cost"] if tba else 0
        em = tba["em"] if tba else 0

        rows.append({
            "project_code": pc,
            "project_name": proj.project_name or "",
            "el_name": proj.el_name or "",
            "pm_name": proj.pm_name or "",
            "year_month": tba["year_month"] if tba else "",
            "revenue": rev,
            "budget_hours": bh,
            "actual_hours": ah,
            "std_cost": sc,
            "em": em,
            "progress_hours": round(ah / bh * 100, 1) if bh else 0,
            "progress_cost": round(sc / rev * 100, 1) if rev else 0,
        })

        total_revenue += rev
        total_budget_hours += bh
        total_actual_hours += ah
        total_std_cost += sc
        total_em += em

    # Revenue 기준 내림차순 (동일 시 EM 내림차순)
    rows.sort(key=lambda x: (-x["revenue"], -x["em"]))

    return {
        "kpi": {
            "total_revenue": total_revenue,
            "total_budget_hours": total_budget_hours,
            "total_actual_hours": total_actual_hours,
            "total_std_cost": total_std_cost,
            "total_em": total_em,
            "em_margin": round(total_em / total_revenue * 100, 1) if total_revenue else 0,
            "project_count": len(rows),
            "year_month": year_month or (available_yms[0] if available_yms else ""),
        },
        "projects": rows,
        "year_months": available_yms,
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

    cfg = _get_partner_access(db, user["empno"])
    if not cfg:
        raise HTTPException(status_code=403, detail="Partner 권한이 필요합니다.")

    allowed = _get_allowed_project_codes(db, user)
    if project_code not in allowed:
        raise HTTPException(status_code=403, detail="해당 프로젝트에 접근 권한이 없습니다.")

    proj = db.query(Project).filter(Project.project_code == project_code).first()
    if not proj:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")

    # Azure TBA 월별 데이터
    monthly = azure_service.get_tba_by_projects([project_code])
    monthly.sort(key=lambda r: r["year_month"])

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


@router.get("/tracking/filter-options")
def get_tracking_filter_options(
    db: Session = Depends(get_db),
    user: Optional[dict] = Depends(get_optional_user),
):
    """Tracking 페이지 필터용 EL/PM/본부/프로젝트 목록 (사용자 scope 내)."""
    if not user:
        raise HTTPException(status_code=401, detail="인증이 필요합니다.")

    cfg = _get_partner_access(db, user["empno"])
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
    cfg = _get_partner_access(db, user["empno"])
    if not cfg:
        return {"has_access": False, "reason": "Partner 권한 없음"}
    return {
        "has_access": True,
        "scope": cfg.scope,
        "empno": user["empno"],
        "name": user.get("name", ""),
    }
