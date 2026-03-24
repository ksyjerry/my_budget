from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from collections import defaultdict

from app.db.session import get_db
from app.models.project import Project
from app.models.budget import BudgetDetail
from app.services import azure_service
from app.api.deps import get_optional_user, get_user_project_codes

router = APIRouter()


@router.get("/assignments")
def list_assignments(
    el_empno: Optional[str] = Query(None),
    pm_empno: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    project_code: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: Optional[dict] = Depends(get_optional_user),
):
    """인원 목록 (Budget에 배정된 인원)."""
    query = db.query(
        BudgetDetail.empno,
        BudgetDetail.emp_name,
        BudgetDetail.department,
        BudgetDetail.grade,
        func.sum(BudgetDetail.budget_hours).label("total_budget"),
    ).group_by(
        BudgetDetail.empno,
        BudgetDetail.emp_name,
        BudgetDetail.department,
        BudgetDetail.grade,
    )

    # Scope to user's engagements
    if user:
        allowed = get_user_project_codes(db, user["empno"])
        query = query.filter(BudgetDetail.project_code.in_(allowed))

    if project_code:
        query = query.filter(BudgetDetail.project_code == project_code)

    if pm_empno:
        pm_project_codes = [
            p.project_code for p in
            db.query(Project.project_code).filter(Project.pm_empno == pm_empno).all()
        ]
        if pm_project_codes:
            query = query.filter(BudgetDetail.project_code.in_(pm_project_codes))
        else:
            return []

    if el_empno:
        el_project_codes = [
            p.project_code for p in
            db.query(Project.project_code).filter(Project.el_empno == el_empno).all()
        ]
        if el_project_codes:
            query = query.filter(BudgetDetail.project_code.in_(el_project_codes))
        else:
            return []

    if department:
        query = query.filter(BudgetDetail.department == department)

    # 지원 구성원 카테고리 제외 (실제 인원 아님)
    NON_PERSON = {"Fulcrum", "RA", "Specialist", "TBD"}
    query = query.filter(~BudgetDetail.empno.in_(NON_PERSON))

    results = query.order_by(func.sum(BudgetDetail.budget_hours).desc()).all()

    return [
        {
            "empno": r.empno,
            "emp_name": r.emp_name,
            "department": r.department,
            "grade": azure_service.shorten_grade(r.grade or ""),
            "total_budget": float(r.total_budget),
        }
        for r in results
    ]


@router.get("/assignments/{empno}")
def get_assignment_detail(
    empno: str,
    el_empno: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """인원별 상세."""
    emp_info = (
        db.query(BudgetDetail.emp_name, BudgetDetail.department, BudgetDetail.grade)
        .filter(BudgetDetail.empno == empno)
        .first()
    )

    # 프로젝트별 Budget
    budget_by_project = (
        db.query(
            BudgetDetail.project_code,
            BudgetDetail.budget_unit,
            BudgetDetail.budget_category,
            func.sum(BudgetDetail.budget_hours).label("budget"),
        )
        .filter(BudgetDetail.empno == empno)
        .group_by(BudgetDetail.project_code, BudgetDetail.budget_unit, BudgetDetail.budget_category)
        .all()
    )

    detail_project_codes = list({r.project_code for r in budget_by_project})

    # Actual — Azure 직접 쿼리
    actual_map = azure_service.get_actual_by_empno_project_unit(
        empno, detail_project_codes, db
    ) if detail_project_codes else {}

    # Actual by project (project-level summary)
    actual_prj_map: dict[str, float] = defaultdict(float)
    for (pc, _unit), val in actual_map.items():
        actual_prj_map[pc] += val

    # Get project info
    project_info_map = {}
    if detail_project_codes:
        project_rows = (
            db.query(Project)
            .filter(Project.project_code.in_(detail_project_codes))
            .all()
        )
        project_info_map = {p.project_code: p for p in project_rows}

    # Build project-level summary
    prj_budget_totals: dict[str, float] = defaultdict(float)
    for r in budget_by_project:
        prj_budget_totals[r.project_code] += float(r.budget)

    projects_summary = []
    for pc in detail_project_codes:
        prj = project_info_map.get(pc)
        b = prj_budget_totals.get(pc, 0)
        a = actual_prj_map.get(pc, 0)
        projects_summary.append({
            "project_code": pc,
            "project_name": prj.project_name if prj else "",
            "el_name": prj.el_name if prj else "",
            "pm_name": prj.pm_name if prj else "",
            "budget": b,
            "actual": a,
            "remaining": b - a,
            "progress": round(a / b * 100, 1) if b else 0,
        })

    return {
        "empno": empno,
        "emp_name": emp_info.emp_name if emp_info else "",
        "department": emp_info.department if emp_info else "",
        "grade": azure_service.shorten_grade(emp_info.grade) if emp_info else "",
        "projects": projects_summary,
        "details": _build_details(budget_by_project, actual_map, project_info_map),
    }


def _build_details(budget_by_project, actual_map, project_info_map):
    """Budget 행 + actual만 있는 행을 병합하여 상세 리스트 생성."""
    # Budget이 있는 행
    seen = set()
    details = []
    for r in budget_by_project:
        key = (r.project_code, r.budget_unit)
        seen.add(key)
        b = float(r.budget)
        a = actual_map.get(key, 0)
        details.append({
            "project_code": r.project_code,
            "project_name": project_info_map[r.project_code].project_name
                if r.project_code in project_info_map else "",
            "budget_unit": r.budget_unit,
            "budget_category": r.budget_category or "",
            "budget": b,
            "actual": a,
            "remaining": b - a,
            "progress": round(a / b * 100, 1) if b else 0,
        })

    # Actual만 있고 Budget이 없는 행 추가
    for (pc, unit), a in actual_map.items():
        if (pc, unit) in seen or a == 0:
            continue
        details.append({
            "project_code": pc,
            "project_name": project_info_map[pc].project_name
                if pc in project_info_map else "",
            "budget_unit": unit,
            "budget_category": "",
            "budget": 0,
            "actual": a,
            "remaining": -a,
            "progress": 0,
        })

    return details
