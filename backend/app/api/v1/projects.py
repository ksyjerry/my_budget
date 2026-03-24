from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional

from app.db.session import get_db
from app.models.project import Project
from app.models.budget import BudgetDetail
from app.services import azure_service
from app.api.deps import get_optional_user, get_user_project_codes

router = APIRouter()


@router.get("/projects")
def list_projects(
    el_empno: Optional[str] = Query(None),
    pm_empno: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: Optional[dict] = Depends(get_optional_user),
):
    query = db.query(Project)
    if user:
        allowed = get_user_project_codes(db, user["empno"])
        query = query.filter(Project.project_code.in_(allowed))
    if el_empno:
        query = query.filter(Project.el_empno == el_empno)
    if pm_empno:
        query = query.filter(Project.pm_empno == pm_empno)
    if department:
        query = query.filter(Project.department == department)

    projects = query.order_by(Project.contract_hours.desc()).all()

    return [
        {
            "project_code": p.project_code,
            "project_name": p.project_name,
            "el_name": p.el_name,
            "pm_name": p.pm_name,
            "department": p.department,
            "contract_hours": p.contract_hours,
            "total_budget_hours": p.total_budget_hours,
            "template_status": p.template_status,
        }
        for p in projects
    ]


@router.get("/projects/{project_code}")
def get_project_detail(
    project_code: str,
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.project_code == project_code).first()
    if not project:
        return {"error": "Project not found"}

    # Budget 상세
    budget_details = (
        db.query(
            BudgetDetail.budget_category,
            BudgetDetail.budget_unit,
            BudgetDetail.emp_name,
            BudgetDetail.empno,
            BudgetDetail.grade,
            BudgetDetail.department,
            func.sum(BudgetDetail.budget_hours).label("budget"),
        )
        .filter(BudgetDetail.project_code == project_code)
        .group_by(
            BudgetDetail.budget_category,
            BudgetDetail.budget_unit,
            BudgetDetail.emp_name,
            BudgetDetail.empno,
            BudgetDetail.grade,
            BudgetDetail.department,
        )
        .all()
    )

    # Actual 상세 — Azure 직접 쿼리
    actual_map = azure_service.get_actual_by_unit_and_empno([project_code], db)

    # Azure 직원 마스터에서 이름/본부/직급 조회 (캐시됨)
    emp_lookup: dict[str, dict] = {}
    try:
        for e in azure_service.get_employees():
            emp_lookup[e["empno"]] = e
    except Exception:
        pass

    def _emp_name(empno: str, fallback: str) -> str:
        info = emp_lookup.get(empno)
        return info["name"] if info else (fallback or empno)

    def _emp_dept(empno: str, fallback: str) -> str:
        info = emp_lookup.get(empno)
        return info["department"] if info else (fallback or "")

    def _emp_grade(empno: str, fallback: str) -> str:
        info = emp_lookup.get(empno)
        if info and info.get("grade_name"):
            return azure_service.shorten_grade(info["grade_name"])
        return azure_service.shorten_grade(fallback) if fallback else ""

    # Budget 기반 details
    details = []
    budget_keys = set()
    for r in budget_details:
        key = (r.budget_unit, r.empno)
        budget_keys.add(key)
        actual = actual_map.get(key, 0)
        budget_val = float(r.budget)
        details.append({
            "category": r.budget_category,
            "unit": r.budget_unit,
            "emp_name": _emp_name(r.empno, r.emp_name),
            "empno": r.empno,
            "grade": r.grade or _emp_grade(r.empno, ""),
            "department": _emp_dept(r.empno, r.department),
            "budget": budget_val,
            "actual": actual,
            "remaining": budget_val - actual,
            "progress": round(actual / budget_val * 100, 1) if budget_val else 0,
        })

    # Actual-only 항목 (budget에 없는 것) 추가
    for (unit, empno), actual in actual_map.items():
        if (unit, empno) in budget_keys:
            continue
        if actual == 0:
            continue
        details.append({
            "category": "(미배정)",
            "unit": unit,
            "emp_name": _emp_name(empno, empno),
            "empno": empno,
            "grade": _emp_grade(empno, ""),
            "department": _emp_dept(empno, ""),
            "budget": 0,
            "actual": actual,
            "remaining": -actual,
            "progress": 0,
        })

    return {
        "project": {
            "project_code": project.project_code,
            "project_name": project.project_name,
            "contract_hours": project.contract_hours,
            "axdx_hours": project.axdx_hours,
            "qrp_hours": project.qrp_hours,
            "rm_hours": project.rm_hours,
            "el_hours": project.el_hours,
            "pm_hours": project.pm_hours,
            "ra_elpm_hours": project.ra_elpm_hours,
            "fulcrum_hours": project.fulcrum_hours,
            "ra_staff_hours": project.ra_staff_hours,
            "specialist_hours": project.specialist_hours,
            "travel_hours": project.travel_hours,
            "et_controllable_budget": project.et_controllable_budget,
            "total_budget_hours": project.total_budget_hours,
        },
        "details": details,
    }
