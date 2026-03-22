import time
import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional

from app.db.session import get_db
from app.models.project import Project
from app.services.budget_service import get_overview_data
from app.api.deps import get_optional_user, get_user_project_codes

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/overview")
def get_overview(
    el_empno: Optional[str] = Query(None),
    pm_empno: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    project_code: Optional[str] = Query(None),
    budget_category: Optional[str] = Query(None),
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
        cumulative=cumulative,
        allowed_project_codes=allowed_codes,
    )

    logger.info(f"GET /overview total: {time.time()-t0:.2f}s")
    return result


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
    }
