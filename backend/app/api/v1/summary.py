from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from collections import defaultdict

from app.db.session import get_db
from app.models.project import Project, Client
from app.services import azure_service
from app.api.deps import get_optional_user, get_user_project_codes

router = APIRouter()


@router.get("/summary")
def get_summary(
    el_empno: Optional[str] = Query(None),
    pm_empno: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: Optional[dict] = Depends(get_optional_user),
):
    """Summary 페이지 데이터."""
    from sqlalchemy.orm import joinedload
    prj_query = db.query(Project).options(joinedload(Project.client))
    if user:
        allowed = get_user_project_codes(db, user["empno"])
        prj_query = prj_query.filter(Project.project_code.in_(allowed))
    if el_empno:
        prj_query = prj_query.filter(Project.el_empno == el_empno)
    if pm_empno:
        prj_query = prj_query.filter(Project.pm_empno == pm_empno)
    if department:
        prj_query = prj_query.filter(Project.department == department)
    projects = prj_query.all()
    project_codes = [p.project_code for p in projects]

    if not project_codes:
        return {"groups": [], "projects": []}

    # Actual by project — Azure 직접 쿼리
    actual_by_project = azure_service.get_actual_by_project(project_codes)

    # 프로젝트별 요약
    project_summary = []
    for p in sorted(projects, key=lambda x: x.contract_hours or 0, reverse=True):
        actual = float(actual_by_project.get(p.project_code, 0))
        budget = p.total_budget_hours or 0
        project_summary.append({
            "project_code": p.project_code,
            "project_name": p.project_name,
            "contract_hours": p.contract_hours or 0,
            "total_budget": budget,
            "total_actual": actual,
            "yra": round(actual / budget * 100, 1) if budget else 0,
            "axdx": p.axdx_hours or 0,
            "axdx_ratio": round(
                (p.axdx_hours or 0) / (p.contract_hours or 1) * 100, 1
            ),
            "group_code": (p.client.group_code if p.client and p.client.group_code else ""),
        })

    # 그룹별 요약
    group_map = defaultdict(lambda: {
        "contract": 0, "budget": 0, "actual": 0, "axdx": 0
    })
    for ps in project_summary:
        g = ps.get("group_code") or "N/A"
        group_map[g]["contract"] += ps["contract_hours"]
        group_map[g]["budget"] += ps["total_budget"]
        group_map[g]["actual"] += ps["total_actual"]
        group_map[g]["axdx"] += ps["axdx"]

    groups = [
        {
            "group": k,
            "contract_hours": v["contract"],
            "total_budget": v["budget"],
            "total_actual": v["actual"],
            "yra": round(v["actual"] / v["budget"] * 100, 1) if v["budget"] else 0,
            "axdx": v["axdx"],
            "axdx_ratio": round(v["axdx"] / v["contract"] * 100, 1) if v["contract"] else 0,
        }
        for k, v in sorted(group_map.items())
    ]

    return {"groups": groups, "projects": project_summary}
