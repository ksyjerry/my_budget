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

    return {
        "project": {
            "project_code": project.project_code,
            "project_name": project.project_name,
            "contract_hours": project.contract_hours,
            "axdx_hours": project.axdx_hours,
            "el_hours": project.el_hours,
            "pm_hours": project.pm_hours,
            "fulcrum_hours": project.fulcrum_hours,
            "ra_staff_hours": project.ra_staff_hours,
            "specialist_hours": project.specialist_hours,
            "et_controllable_budget": project.et_controllable_budget,
            "total_budget_hours": project.total_budget_hours,
        },
        "details": [
            {
                "category": r.budget_category,
                "unit": r.budget_unit,
                "emp_name": r.emp_name,
                "empno": r.empno,
                "grade": r.grade,
                "department": r.department,
                "budget": float(r.budget),
                "actual": actual_map.get((r.budget_unit, r.empno), 0),
                "remaining": float(r.budget) - actual_map.get((r.budget_unit, r.empno), 0),
                "progress": round(
                    actual_map.get((r.budget_unit, r.empno), 0) / float(r.budget) * 100, 1
                ) if r.budget else 0,
            }
            for r in budget_details
        ],
    }
