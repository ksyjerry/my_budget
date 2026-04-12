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
    db: Session = Depends(get_db),
    user: Optional[dict] = Depends(get_optional_user),
):
    """Partner의 프로젝트별 Budget Amount vs Actual Amount 추적."""
    if not user:
        raise HTTPException(status_code=401, detail="인증이 필요합니다.")

    cfg = _get_partner_access(db, user["empno"])
    if not cfg:
        raise HTTPException(status_code=403, detail="Partner 권한이 필요합니다.")

    allowed_codes = _get_allowed_project_codes(db, user)
    if not allowed_codes:
        return {"kpi": {}, "projects": []}

    # Azure TBA에서 최신 월 데이터 조회
    latest_map = azure_service.get_tba_latest_by_projects(allowed_codes)

    # 프로젝트 정보 join
    projects = db.query(Project).filter(Project.project_code.in_(allowed_codes)).all()
    proj_map = {p.project_code: p for p in projects}

    rows = []
    total_revenue = 0.0
    total_budget_hours = 0.0
    total_actual_hours = 0.0
    total_std_cost = 0.0
    total_em = 0.0

    for pc in allowed_codes:
        tba = latest_map.get(pc)
        proj = proj_map.get(pc)
        if not proj:
            continue
        if not tba:
            # TBA 데이터 없음 — 빈 값으로 표시
            rows.append({
                "project_code": pc,
                "project_name": proj.project_name or "",
                "el_name": proj.el_name or "",
                "pm_name": proj.pm_name or "",
                "year_month": "",
                "revenue": 0,
                "budget_hours": 0,
                "actual_hours": 0,
                "std_cost": 0,
                "em": 0,
                "progress_hours": 0,
                "progress_cost": 0,
            })
            continue

        rev = tba["revenue"]
        bh = tba["budget_hours"]
        ah = tba["actual_hours"]
        sc = tba["std_cost"]
        em = tba["em"]

        rows.append({
            "project_code": pc,
            "project_name": proj.project_name or "",
            "el_name": proj.el_name or "",
            "pm_name": proj.pm_name or "",
            "year_month": tba["year_month"],
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

    # Revenue 기준 내림차순
    rows.sort(key=lambda x: -x["revenue"])

    return {
        "kpi": {
            "total_revenue": total_revenue,
            "total_budget_hours": total_budget_hours,
            "total_actual_hours": total_actual_hours,
            "total_std_cost": total_std_cost,
            "total_em": total_em,
            "em_margin": round(total_em / total_revenue * 100, 1) if total_revenue else 0,
            "project_count": len(rows),
        },
        "projects": rows,
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
