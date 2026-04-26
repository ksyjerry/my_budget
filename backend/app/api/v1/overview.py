import time
import logging
from collections import defaultdict

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func
from typing import Optional

from app.db.session import get_db
from app.models.project import Project
from app.models.budget import BudgetDetail
from app.services.budget_service import get_overview_data
from app.services import azure_service
from app.api.deps import get_optional_user, get_user_project_codes
from app.services.budget_service import CATEGORY_ORDER

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/overview")
def get_overview(
    el_empno: Optional[str] = Query(None),
    pm_empno: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    project_code: Optional[str] = Query(None),
    budget_category: Optional[str] = Query(None),
    service_type: Optional[str] = Query(None),
    cumulative: bool = Query(True),
    db: Session = Depends(get_db),
    user: Optional[dict] = Depends(get_optional_user),
):
    t0 = time.time()

    # Scope to user's engagements if authenticated
    allowed_codes = None
    if user:
        allowed_codes = get_user_project_codes(db, user["empno"])

    result = get_overview_data(
        db,
        el_empno=el_empno,
        pm_empno=pm_empno,
        department=department,
        project_code=project_code,
        budget_category=budget_category,
        service_type=service_type,
        cumulative=cumulative,
        allowed_project_codes=allowed_codes,
    )

    logger.info(f"GET /overview total: {time.time()-t0:.2f}s")
    return result


@router.get("/overview-person")
def get_person_overview(
    project_code: Optional[str] = Query(None),
    budget_category: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: Optional[dict] = Depends(get_optional_user),
):
    """인별 Overview — 로그인 사용자의 Staff 시간 기준."""
    t0 = time.time()

    if not user:
        return {"projects": [], "budget_by_category": [], "budget_by_unit": [],
                "kpi": {"budget_total": 0, "actual_total": 0, "progress": 0}}

    empno = user["empno"]

    # 1) 이 사용자가 배정된 프로젝트별 budget
    budget_query = db.query(
        BudgetDetail.project_code,
        BudgetDetail.budget_category,
        BudgetDetail.budget_unit,
        sa_func.sum(BudgetDetail.budget_hours).label("budget"),
    ).filter(BudgetDetail.empno == empno)

    if project_code:
        budget_query = budget_query.filter(BudgetDetail.project_code == project_code)
    if budget_category:
        budget_query = budget_query.filter(BudgetDetail.budget_category == budget_category)

    budget_rows = budget_query.group_by(
        BudgetDetail.project_code, BudgetDetail.budget_category, BudgetDetail.budget_unit
    ).all()

    # 프로젝트별 budget 합계
    project_budgets: dict[str, float] = defaultdict(float)
    category_budgets: dict[str, float] = defaultdict(float)
    unit_budgets: dict[str, float] = defaultdict(float)
    unit_category_map: dict[str, str] = {}
    for r in budget_rows:
        project_budgets[r.project_code] += float(r.budget)
        category_budgets[r.budget_category or "기타"] += float(r.budget)
        unit_budgets[r.budget_unit or "기타"] += float(r.budget)
        if r.budget_unit:
            unit_category_map[r.budget_unit] = r.budget_category or "기타"

    all_project_codes = list(project_budgets.keys())

    # 2) Actual — Azure TMS에서 해당 empno의 시간
    actual_by_project: dict[str, float] = defaultdict(float)
    actual_by_category: dict[str, float] = defaultdict(float)
    actual_by_unit: dict[str, float] = defaultdict(float)

    if all_project_codes:
        actual_detail = azure_service.get_actual_by_empno_project_unit(
            empno, all_project_codes, db
        )
        for (pc, unit), hours in actual_detail.items():
            actual_by_project[pc] += hours
            actual_by_unit[unit] += hours

        for (pc, unit), hours in actual_detail.items():
            cat = unit_category_map.get(unit, "기타")
            actual_by_category[cat] += hours

    # 3) 프로젝트 정보
    project_info = {}
    if all_project_codes:
        for p in db.query(Project).filter(Project.project_code.in_(all_project_codes)).all():
            project_info[p.project_code] = p

    # 4) Build response
    projects = []
    for pc in sorted(all_project_codes, key=lambda c: project_budgets[c], reverse=True):
        prj = project_info.get(pc)
        b = project_budgets[pc]
        a = actual_by_project.get(pc, 0)
        projects.append({
            "project_code": pc,
            "project_name": prj.project_name if prj else pc,
            "el_name": prj.el_name if prj else "",
            "pm_name": prj.pm_name if prj else "",
            "budget": b,
            "actual": a,
            "progress": round(a / b * 100, 1) if b else 0,
        })

    budget_by_category = [
        {"name": cat, "value": budget, "actual": actual_by_category.get(cat, 0)}
        for cat, budget in sorted(category_budgets.items(), key=lambda x: -x[1])
    ]

    budget_by_unit = sorted(
        [
            {"unit": unit, "category": unit_category_map.get(unit, "기타"),
             "budget": budget, "actual": actual_by_unit.get(unit, 0),
             "progress": round(actual_by_unit.get(unit, 0) / budget * 100, 1) if budget else 0}
            for unit, budget in unit_budgets.items()
        ] + [
            {"unit": unit, "category": "기타",
             "budget": 0, "actual": actual, "progress": 0}
            for unit, actual in actual_by_unit.items()
            if unit not in unit_budgets and actual > 0
        ],
        key=lambda x: (CATEGORY_ORDER.get(x["category"], 50), -x["budget"]),
    )

    total_budget = sum(project_budgets.values())
    total_actual = sum(actual_by_project.values())

    logger.info(f"GET /overview-person total: {time.time()-t0:.2f}s")

    return {
        "kpi": {
            "budget_total": total_budget,
            "actual_total": total_actual,
            "progress": round(total_actual / total_budget * 100, 1) if total_budget else 0,
        },
        "projects": projects,
        "budget_by_category": budget_by_category,
        "budget_by_unit": budget_by_unit,
    }


@router.get("/filter-options")
def get_filter_options(
    db: Session = Depends(get_db),
    user: Optional[dict] = Depends(get_optional_user),
):
    """Get distinct values for filter dropdowns."""
    query = db.query(Project)

    # Scope to user's engagements if authenticated
    if user:
        allowed_codes = get_user_project_codes(db, user["empno"])
        query = query.filter(Project.project_code.in_(allowed_codes))

    all_projects = query.all()

    # Extract unique values
    projects_list = []
    els_set = {}
    pms_set = {}
    depts_set = set()

    for p in all_projects:
        projects_list.append(
            {"value": p.project_code, "label": f"[{p.project_code}] {p.project_name}"}
        )
        if p.el_empno:
            els_set[p.el_empno] = p.el_name or p.el_empno
        if p.pm_empno:
            pms_set[p.pm_empno] = p.pm_name or p.pm_empno
        if p.department:
            depts_set.add(p.department)

    # #50 service_type options — DB 실사용 값만 노출
    # #77: display_category 추가 ("감사" | "비감사") — 프론트에서 그룹 필터링 지원
    from app.api.v1.budget_input import SERVICE_TYPES
    name_by_code = {s["code"]: s["name"] for s in SERVICE_TYPES}
    used_codes = sorted({p.service_type for p in all_projects if p.service_type})
    service_types_list = [
        {
            "value": c,
            "label": name_by_code.get(c, c),
            "display_category": "감사" if c == "AUDIT" else "비감사",
        }
        for c in used_codes
    ]

    return {
        "projects": projects_list,
        "els": [
            {"value": empno, "label": f"{name}({empno})"}
            for empno, name in els_set.items()
        ],
        "pms": [
            {"value": empno, "label": f"{name}({empno})"}
            for empno, name in pms_set.items()
        ],
        "departments": [
            {"value": d, "label": d}
            for d in sorted(depts_set)
        ],
        "service_types": service_types_list,
    }
