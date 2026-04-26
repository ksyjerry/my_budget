"""Budget 데이터 CRUD 서비스."""
import time
import logging
from sqlalchemy.orm import Session
from sqlalchemy import func
from collections import defaultdict

from app.models.project import Client, Project
from app.models.budget import BudgetDetail
from app.services import azure_service
from app.services.budget_category_map import get_category
from app.services.budget_definitions import display_budget, axdx_excluded_budget

logger = logging.getLogger(__name__)

CATEGORY_ORDER = {
    "분반기 검토": 1,
    "계획단계": 2,
    "재무제표 수준 위험": 3,
    "자산": 4,
    "부채 및 자본": 5,
    "수익/비용": 6,
    "종결단계": 7,
    "연결": 8,
    "내부통제": 9,
    "IT 감사-RA": 10,
    "(미배정)": 99,
}


def upsert_project_from_client_data(db: Session, data: dict) -> Project:
    """Client/Project 정보를 DB에 저장 또는 업데이트."""
    project_code = data["project_code"]

    # ── Client upsert ─────────────────────────────────────
    client_code = data.get("client_code", project_code.split("-")[0])
    client = db.query(Client).filter(Client.client_code == client_code).first()
    if not client:
        client = Client(client_code=client_code)
        db.add(client)

    # 값이 실제로 넘어온 경우에만 UPDATE (None/빈 문자열이 아닌 경우 기존 값 보존)
    _client_fields = [
        "client_name", "industry", "asset_size", "listing_status",
        "gaap", "consolidated", "subsidiary_count", "internal_control",
        "initial_audit", "group_code", "business_report",
    ]
    for f in _client_fields:
        v = data.get(f)
        if v is not None and v != "":
            setattr(client, f, v)

    db.flush()

    # Project upsert
    project = db.query(Project).filter(Project.project_code == project_code).first()
    if not project:
        project = Project(project_code=project_code, client_id=client.id)
        db.add(project)

    project.project_name = data.get("project_name", "")
    project.department = data.get("department", "")
    project.el_empno = data.get("el_empno", "")
    project.el_name = data.get("el_name", "")
    project.pm_empno = data.get("pm_empno", "")
    project.pm_name = data.get("pm_name", "")
    project.qrp_empno = data.get("qrp_empno", "")
    project.qrp_name = data.get("qrp_name", "")
    project.contract_hours = data.get("contract_hours", 0)
    project.axdx_hours = data.get("axdx_hours", 0)
    project.qrp_hours = data.get("qrp_hours", 0)
    project.rm_hours = data.get("rm_hours", 0)
    project.el_hours = data.get("el_hours", 0)
    project.pm_hours = data.get("pm_hours", 0)
    project.ra_elpm_hours = data.get("ra_elpm_hours", 0)
    project.et_controllable_budget = data.get("et_controllable_budget", 0)
    project.fulcrum_hours = data.get("fulcrum_hours", 0)
    project.ra_staff_hours = data.get("ra_staff_hours", 0)
    project.specialist_hours = data.get("specialist_hours", 0)
    project.travel_hours = data.get("travel_hours", 0)
    project.total_budget_hours = data.get("total_budget_hours", 0)
    _status = data.get("template_status") or None
    if _status not in ("작성중", "작성완료", "승인완료"):
        _status = None  # NULL is allowed; empty string violates CHECK constraint
    project.template_status = _status
    if data.get("service_type"):
        project.service_type = data["service_type"]

    # fiscal_start / fiscal_end (#118: 시작 자동+끝 수동, 미입력 시 fiscal_start+12개월)
    _fs = data.get("fiscal_start")
    if _fs:
        import datetime as _dt
        try:
            parts = str(_fs).split("-")
            project.fiscal_start = _dt.date(int(parts[0]), int(parts[1]), 1)
        except (IndexError, ValueError):
            pass

    _fe = data.get("fiscal_end")
    if _fe:
        import datetime as _dt
        try:
            parts = str(_fe).split("-")
            project.fiscal_end = _dt.date(int(parts[0]), int(parts[1]), 1)
        except (IndexError, ValueError):
            pass
    elif project.fiscal_start and not project.fiscal_end:
        # Default: fiscal_start + 11 months (i.e., 12-month range ending at start+11)
        import datetime as _dt
        fs = project.fiscal_start
        end_month_offset = fs.month + 11
        end_year = fs.year + (end_month_offset - 1) // 12
        end_month = ((end_month_offset - 1) % 12) + 1
        project.fiscal_end = _dt.date(end_year, end_month, 1)

    db.flush()
    return project


def bulk_insert_budget_details(db: Session, project_code: str, details: list[dict]):
    """Budget 상세 데이터 일괄 삽입 (기존 데이터 삭제 후 재삽입)."""
    # FK 체크: 프로젝트가 존재하지 않으면 스킵
    exists = db.query(Project).filter(Project.project_code == project_code).first()
    if not exists:
        return
    db.query(BudgetDetail).filter(BudgetDetail.project_code == project_code).delete()

    for d in details:
        if d.get("budget_hours", 0) == 0:
            continue
        unit = d.get("budget_unit", "")
        category = d.get("budget_category", "") or get_category(unit)
        bd = BudgetDetail(
            project_code=project_code,
            budget_category=category,
            budget_unit=d.get("budget_unit", ""),
            empno=d.get("empno", ""),
            emp_name=d.get("emp_name", ""),
            grade=d.get("grade", ""),
            department=d.get("department", d.get("staff_department", "")),
            year_month=d.get("year_month", ""),
            budget_hours=d.get("budget_hours", 0),
        )
        db.add(bd)
    db.flush()


def get_overview_data(db: Session, el_empno: str = None, pm_empno: str = None,
                      department: str = None, project_code: str = None,
                      budget_category: str = None,
                      cumulative: bool = True, allowed_project_codes: list = None,
                      service_type: str = None):
    """Overview 페이지 데이터 조회 (최적화)."""
    t_start = time.time()

    # ① 프로젝트 필터
    prj_query = db.query(Project)
    if allowed_project_codes is not None:
        prj_query = prj_query.filter(Project.project_code.in_(allowed_project_codes))
    if el_empno:
        prj_query = prj_query.filter(Project.el_empno == el_empno)
    if pm_empno:
        prj_query = prj_query.filter(Project.pm_empno == pm_empno)
    if department:
        prj_query = prj_query.filter(Project.department == department)
    if project_code:
        prj_query = prj_query.filter(Project.project_code == project_code)
    if service_type:
        prj_query = prj_query.filter(Project.service_type == service_type)
    projects = prj_query.all()
    project_codes = [p.project_code for p in projects]

    if not project_codes:
        return {
            "kpi": {}, "projects": [], "budget_by_category": [],
            "actual_by_category": [], "budget_by_unit": [],
            "elpm_qrp_time": [], "staff_time": [],
        }

    t_projects = time.time()

    # ② PostgreSQL: 단일 쿼리로 budget 원시 행 조회 → Python에서 집계
    budget_q = (
        db.query(
            BudgetDetail.project_code,
            BudgetDetail.budget_category,
            BudgetDetail.budget_unit,
            BudgetDetail.empno,
            BudgetDetail.emp_name,
            BudgetDetail.department,
            BudgetDetail.grade,
            func.sum(BudgetDetail.budget_hours).label("budget"),
        )
        .filter(BudgetDetail.project_code.in_(project_codes))
    )
    if budget_category:
        budget_q = budget_q.filter(BudgetDetail.budget_category == budget_category)
    budget_rows = (
        budget_q.group_by(
            BudgetDetail.project_code,
            BudgetDetail.budget_category,
            BudgetDetail.budget_unit,
            BudgetDetail.empno,
            BudgetDetail.emp_name,
            BudgetDetail.department,
            BudgetDetail.grade,
        )
        .all()
    )

    t_budget = time.time()

    # budget_category 필터 시, budget이 있는 프로젝트로 scope 축소
    if budget_category:
        codes_with_budget = {r.project_code for r in budget_rows}
        projects = [p for p in projects if p.project_code in codes_with_budget]
        project_codes = [p.project_code for p in projects]

    # Python에서 다차원 집계
    budget_by_project: dict[str, float] = defaultdict(float)
    budget_by_category: dict[str, float] = defaultdict(float)
    budget_by_unit: dict[str, float] = defaultdict(float)
    unit_category_map: dict[str, str] = {}
    staff_budget: dict[str, dict] = {}  # empno → {info + budget}

    for r in budget_rows:
        hrs = float(r.budget or 0)
        budget_by_project[r.project_code] += hrs
        if r.budget_category:
            budget_by_category[r.budget_category] += hrs
        if r.budget_unit:
            budget_by_unit[r.budget_unit] += hrs
            unit_category_map[r.budget_unit] = r.budget_category or "기타"

        if r.empno:
            if r.empno not in staff_budget:
                staff_budget[r.empno] = {
                    "empno": r.empno,
                    "emp_name": r.emp_name,
                    "department": r.department,
                    "grade": r.grade,
                    "budget": 0.0,
                }
            staff_budget[r.empno]["budget"] += hrs

    # KPI
    total_contract = sum(p.contract_hours or 0 for p in projects)
    total_axdx = sum(p.axdx_hours or 0 for p in projects)
    total_staff_budget = sum(budget_by_project.values())

    # 작성여부: 모든 프로젝트가 "작성완료"이면 "작성완료", 하나라도 아니면 "작성중"
    statuses = [p.template_status or "" for p in projects]
    if not statuses:
        template_status_summary = "-"
    elif all(s == "작성완료" for s in statuses):
        template_status_summary = "작성완료"
    else:
        template_status_summary = "작성중"

    # ③ Role 매핑 (EL/PM/QRP)
    role_mappings = []
    for p in projects:
        for role, empno_field, hours_field in [
            ("EL", p.el_empno, p.el_hours),
            ("PM", p.pm_empno, p.pm_hours),
            ("QRP", p.qrp_empno, p.qrp_hours),
        ]:
            emp = empno_field or ""
            budget_hrs = hours_field or 0
            if budget_hrs:
                role_mappings.append({
                    "project_code": p.project_code,
                    "project_name": p.project_name,
                    "role": role,
                    "empno": emp,
                    "budget": float(budget_hrs),
                })

    role_empnos = list({rm["empno"] for rm in role_mappings if rm["empno"]}) or None

    # #25: Budget 없는 staff 의 TMS 시간도 포함 — TMS 에서 본 empno ∪ budget empno, role 제외
    budgeted_empnos = set(staff_budget.keys()) if staff_budget else set()
    tms_empnos = set(azure_service.get_project_empnos(project_codes))
    role_set_for_exclusion = set(role_empnos or [])
    staff_empnos = sorted((budgeted_empnos | tms_empnos) - role_set_for_exclusion) or None

    # ④ Azure: 단일 패스로 모든 actual 집계
    actuals = azure_service.get_overview_actuals(
        project_codes, db,
        role_empnos=role_empnos,
        staff_empnos=staff_empnos,
    )

    t_azure = time.time()

    actual_map = actuals["by_project"]
    actual_unit_map = actuals["by_unit"]
    actual_cat_map = actuals["by_category"]
    role_actual_map = actuals["by_project_empno"]
    staff_actual_map = actuals["by_empno"]

    total_actual = sum(actual_map.values())

    # ⑤ 결과 조립
    actual_by_category = [
        {"category": cat, "hours": hours}
        for cat, hours in sorted(actual_cat_map.items())
    ]

    elpm_qrp_time = []
    for rm in role_mappings:
        actual = role_actual_map.get((rm["project_code"], rm["empno"]), 0)
        elpm_qrp_time.append({
            "project_code": rm["project_code"],
            "project_name": rm["project_name"],
            "role": rm["role"],
            "budget": rm["budget"],
            "actual": actual,
            "progress": round(actual / rm["budget"] * 100, 1) if rm["budget"] else 0,
        })

    # Staff time — Azure 직원 마스터에서 본부/직급 보정
    try:
        emp_list = azure_service.get_employees()
        emp_lookup = {e["empno"]: e for e in emp_list}
    except Exception:
        emp_lookup = {}

    staff_list = sorted(staff_budget.values(), key=lambda x: x["budget"], reverse=True)
    staff_time = []
    for s in staff_list:
        b = s["budget"]
        a = staff_actual_map.get(s["empno"], 0)
        azure_emp = emp_lookup.get(s["empno"])
        dept = (azure_emp["department"] if azure_emp else None) or s.get("department") or ""
        grade = s.get("grade") or ""
        if azure_emp and not grade:
            grade = azure_emp.get("grade_name", "")
        staff_time.append({
            **s,
            "department": dept,
            "grade": grade,
            "actual": a,
            "progress": round(a / b * 100, 1) if b else 0,
        })

    t_end = time.time()
    logger.info(
        f"get_overview_data: total={t_end-t_start:.2f}s "
        f"(projects={t_projects-t_start:.3f}s, "
        f"budget_pg={t_budget-t_projects:.3f}s, "
        f"azure={t_azure-t_budget:.3f}s, "
        f"assemble={t_end-t_azure:.3f}s)"
    )

    return {
        "kpi": {
            "contract_hours": total_contract,
            "axdx_hours": total_axdx,
            "axdx_ratio": round(total_axdx / total_contract * 100, 1) if total_contract else 0,
            "staff_budget": total_staff_budget,
            "actual_hours": total_actual,
            "progress": round(total_actual / total_contract * 100, 1) if total_contract else 0,
            "template_status": template_status_summary,
        },
        "projects": [
            {
                "project_code": p.project_code,
                "project_name": p.project_name,
                "el_name": p.el_name,
                "pm_name": p.pm_name,
                "template_status": p.template_status or "",
                # POL-01 (b): display_budget = contract_hours − axdx_hours
                "budget": display_budget(p, view="overview_project_table_budget"),
                "contract_hours": float(p.contract_hours or 0),
                "actual": float(actual_map.get(p.project_code, 0)),
                # real_progress: actual / display_budget (AX/DX 제외 기준)
                "real_progress": round(
                    float(actual_map.get(p.project_code, 0)) /
                    display_budget(p, view="overview_project_table_budget") * 100, 1
                ) if axdx_excluded_budget(p) > 0 else 0,
                # progress: actual / contract_hours (전통적 KPI 기준)
                "progress": round(
                    float(actual_map.get(p.project_code, 0)) /
                    float(p.contract_hours or 1) * 100, 1
                ) if (p.contract_hours or 0) > 0 else 0,
            }
            for p in projects
        ],
        "budget_by_category": [
            {"category": cat, "hours": hrs}
            for cat, hrs in sorted(budget_by_category.items(), key=lambda x: x[1], reverse=True)
        ],
        "actual_by_category": actual_by_category,
        "budget_by_unit": sorted(
            [
                {
                    "unit": unit,
                    "category": unit_category_map.get(unit, "기타"),
                    "budget": budget,
                    "actual": actual_unit_map.get(unit, 0),
                    "progress": round(
                        actual_unit_map.get(unit, 0) / budget * 100, 1
                    ) if budget else 0,
                }
                for unit, budget in budget_by_unit.items()
            ] + [
                {
                    "unit": unit,
                    "category": "기타",
                    "budget": 0,
                    "actual": actual,
                    "progress": 0,
                }
                for unit, actual in actual_unit_map.items()
                if unit not in budget_by_unit and actual > 0
            ],
            key=lambda x: (CATEGORY_ORDER.get(x["category"], 50), -x["budget"]),
        ),
        "elpm_qrp_time": elpm_qrp_time,
        "staff_time": staff_time,
    }
