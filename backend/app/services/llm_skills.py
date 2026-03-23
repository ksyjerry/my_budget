"""LLM Chat Skills — 역할별 데이터 조회 함수."""

import logging
from collections import defaultdict
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func

from app.models.project import Project
from app.models.budget import BudgetDetail
from app.services import azure_service

logger = logging.getLogger(__name__)

# ─── Skill 메타 정보 (LLM에게 전달) ───

ELPM_SKILLS = {
    "query_projects": {
        "description": "내가 EL/PM인 프로젝트 목록 조회 (budget, actual, 진행률 포함)",
        "params": {"project_code": "프로젝트코드(선택)", "department": "본부명(선택)"},
    },
    "query_budget_by_unit": {
        "description": "특정 프로젝트의 관리단위별 budget vs actual 현황",
        "params": {"project_code": "프로젝트코드(필수)"},
    },
    "query_staff_time": {
        "description": "프로젝트 구성원별 시간 현황 조회",
        "params": {"project_code": "프로젝트코드(선택)", "emp_name": "직원이름(선택)"},
    },
    "query_overbudget": {
        "description": "budget 초과 프로젝트 또는 인원 목록",
        "params": {"threshold": "초과 기준 진행률%(기본100)"},
    },
    "query_elpm_time": {
        "description": "EL/PM/QRP 역할별 시간 현황",
        "params": {"project_code": "프로젝트코드(선택)"},
    },
}

STAFF_SKILLS = {
    "my_budget_summary": {
        "description": "내 전체 budget vs actual 요약",
        "params": {},
    },
    "my_projects": {
        "description": "내가 배정된 프로젝트 목록 및 시간 현황",
        "params": {},
    },
    "my_budget_by_unit": {
        "description": "특정 프로젝트에서 내 관리단위별 budget 현황",
        "params": {"project_code": "프로젝트코드(선택)"},
    },
}


# ─── Skill 실행 함수 ───

def execute_skill(
    skill_name: str, params: dict, db: Session,
    user_empno: str, user_role: str, allowed_project_codes: list | None,
) -> dict:
    """Skill 이름과 파라미터로 데이터 조회 실행."""

    # 권한 체크: Staff가 EL/PM 전용 skill 호출 시 거부
    if user_role == "Staff" and skill_name in ELPM_SKILLS:
        return {"error": "권한이 없습니다. 본인의 데이터만 조회 가능합니다."}

    try:
        if skill_name == "query_projects":
            return _query_projects(db, user_empno, allowed_project_codes, params)
        elif skill_name == "query_budget_by_unit":
            return _query_budget_by_unit(db, allowed_project_codes, params)
        elif skill_name == "query_staff_time":
            return _query_staff_time(db, allowed_project_codes, params)
        elif skill_name == "query_overbudget":
            return _query_overbudget(db, allowed_project_codes, params)
        elif skill_name == "query_elpm_time":
            return _query_elpm_time(db, allowed_project_codes, params)
        elif skill_name == "my_budget_summary":
            return _my_budget_summary(db, user_empno)
        elif skill_name == "my_projects":
            return _my_projects(db, user_empno)
        elif skill_name == "my_budget_by_unit":
            return _my_budget_by_unit(db, user_empno, params)
        elif skill_name == "denied":
            return {"error": params.get("reason", "권한이 없습니다.")}
        else:
            return {"error": f"알 수 없는 skill: {skill_name}"}
    except Exception as e:
        logger.error(f"Skill execution error [{skill_name}]: {e}")
        return {"error": f"데이터 조회 중 오류: {str(e)}"}


# ─── EL/PM Skills 구현 ───

def _query_projects(db: Session, user_empno: str, allowed_codes: list | None, params: dict) -> dict:
    q = db.query(Project)
    if allowed_codes is not None:
        q = q.filter(Project.project_code.in_(allowed_codes))
    if params.get("project_code"):
        q = q.filter(Project.project_code == params["project_code"])
    if params.get("department"):
        q = q.filter(Project.department == params["department"])

    projects = q.all()
    if not projects:
        return {"projects": [], "message": "조건에 맞는 프로젝트가 없습니다."}

    codes = [p.project_code for p in projects]

    # Budget 집계
    budget_map = defaultdict(float)
    budget_rows = (
        db.query(BudgetDetail.project_code, sa_func.sum(BudgetDetail.budget_hours))
        .filter(BudgetDetail.project_code.in_(codes))
        .group_by(BudgetDetail.project_code)
        .all()
    )
    for pc, hrs in budget_rows:
        budget_map[pc] = float(hrs or 0)

    # Actual 집계
    actual_map = azure_service.get_overview_actuals(codes, db).get("by_project", {})

    result = []
    for p in projects:
        b = budget_map.get(p.project_code, 0)
        a = actual_map.get(p.project_code, 0)
        result.append({
            "project_code": p.project_code,
            "project_name": p.project_name,
            "el_name": p.el_name,
            "pm_name": p.pm_name,
            "department": p.department,
            "template_status": p.template_status or "미작성",
            "budget": b,
            "actual": round(a, 2),
            "remaining": round(b - a, 2),
            "progress": round(a / b * 100, 1) if b else 0,
        })
    result.sort(key=lambda x: -x["budget"])
    return {"projects": result, "total": len(result)}


def _query_budget_by_unit(db: Session, allowed_codes: list | None, params: dict) -> dict:
    pc = params.get("project_code")
    if not pc:
        return {"error": "project_code 파라미터가 필요합니다."}
    if allowed_codes is not None and pc not in allowed_codes:
        return {"error": "해당 프로젝트에 대한 접근 권한이 없습니다."}

    rows = (
        db.query(
            BudgetDetail.budget_category,
            BudgetDetail.budget_unit,
            sa_func.sum(BudgetDetail.budget_hours),
        )
        .filter(BudgetDetail.project_code == pc)
        .group_by(BudgetDetail.budget_category, BudgetDetail.budget_unit)
        .all()
    )

    actual_data = azure_service.get_overview_actuals([pc], db)
    actual_unit_map = actual_data.get("by_unit", {})

    units = []
    for cat, unit, hrs in rows:
        b = float(hrs or 0)
        a = actual_unit_map.get(unit, 0)
        units.append({
            "category": cat or "기타",
            "unit": unit or "기타",
            "budget": b,
            "actual": round(a, 2),
            "remaining": round(b - a, 2),
            "progress": round(a / b * 100, 1) if b else 0,
        })
    units.sort(key=lambda x: (x["category"], -x["budget"]))
    return {"project_code": pc, "units": units}


def _query_staff_time(db: Session, allowed_codes: list | None, params: dict) -> dict:
    # 특정 인원 검색 시: scope 제한 없이 전체 프로젝트에서 조회
    # (EL/PM이 팀원의 전체 workload를 파악할 수 있어야 함)
    search_by_name = bool(params.get("emp_name"))

    q = db.query(
        BudgetDetail.project_code,
        BudgetDetail.empno,
        BudgetDetail.emp_name,
        BudgetDetail.department,
        BudgetDetail.grade,
        sa_func.sum(BudgetDetail.budget_hours).label("budget"),
    )
    if not search_by_name and allowed_codes is not None:
        q = q.filter(BudgetDetail.project_code.in_(allowed_codes))
    if params.get("project_code"):
        q = q.filter(BudgetDetail.project_code == params["project_code"])
    if params.get("emp_name"):
        q = q.filter(BudgetDetail.emp_name.contains(params["emp_name"]))

    rows = q.group_by(
        BudgetDetail.project_code, BudgetDetail.empno,
        BudgetDetail.emp_name, BudgetDetail.department, BudgetDetail.grade,
    ).all()

    codes = list({r.project_code for r in rows})
    empnos = list({r.empno for r in rows if r.empno})
    actual_data = azure_service.get_overview_actuals(
        codes, db, staff_empnos=empnos,
    ) if codes else {"by_empno": {}, "by_project_empno": {}}
    actual_empno = actual_data.get("by_empno", {})
    actual_pe = actual_data.get("by_project_empno", {})

    # empno별 집계 + 프로젝트별 상세
    staff_map: dict[str, dict] = {}
    project_detail: dict[str, list] = {}  # empno → [{project_code, budget, actual}]
    proj_name_map = {}

    for r in rows:
        if r.empno not in staff_map:
            staff_map[r.empno] = {
                "empno": r.empno, "name": r.emp_name,
                "department": r.department, "grade": r.grade, "budget": 0,
            }
            project_detail[r.empno] = []
        staff_map[r.empno]["budget"] += float(r.budget or 0)

        # 프로젝트별 상세
        if r.empno not in proj_name_map:
            proj_name_map[r.empno] = {}
        b = float(r.budget or 0)
        a = actual_pe.get((r.project_code, r.empno), 0)
        project_detail[r.empno].append({
            "project_code": r.project_code,
            "budget": b,
            "actual": round(a, 2),
            "remaining": round(b - a, 2),
        })

    # 프로젝트명 조회
    all_codes = list({r.project_code for r in rows})
    if all_codes:
        from app.models.project import Project as PrjModel
        prjs = db.query(PrjModel.project_code, PrjModel.project_name, PrjModel.el_name, PrjModel.pm_name).filter(
            PrjModel.project_code.in_(all_codes)
        ).all()
        pname = {p.project_code: {"name": p.project_name, "el": p.el_name, "pm": p.pm_name} for p in prjs}
        for empno, details in project_detail.items():
            for d in details:
                info = pname.get(d["project_code"], {})
                d["project_name"] = info.get("name", d["project_code"])
                d["el_name"] = info.get("el", "")
                d["pm_name"] = info.get("pm", "")

    result = []
    for s in staff_map.values():
        b = s["budget"]
        a = actual_empno.get(s["empno"], 0)
        result.append({
            **s,
            "actual": round(a, 2),
            "remaining": round(b - a, 2),
            "progress": round(a / b * 100, 1) if b else 0,
            "projects": sorted(project_detail.get(s["empno"], []), key=lambda x: -x["budget"]),
        })
    result.sort(key=lambda x: -x["budget"])
    return {"staff": result[:50], "total": len(result)}


def _query_overbudget(db: Session, allowed_codes: list | None, params: dict) -> dict:
    threshold = float(params.get("threshold", 100))
    # 프로젝트 현황 조회 후 필터
    proj_result = _query_projects(db, "", allowed_codes, {})
    projects = proj_result.get("projects", [])
    overbudget = [p for p in projects if p["progress"] > threshold]
    overbudget.sort(key=lambda x: -x["progress"])
    return {
        "threshold": threshold,
        "overbudget_projects": overbudget[:20],
        "total": len(overbudget),
    }


def _query_elpm_time(db: Session, allowed_codes: list | None, params: dict) -> dict:
    q = db.query(Project)
    if allowed_codes is not None:
        q = q.filter(Project.project_code.in_(allowed_codes))
    if params.get("project_code"):
        q = q.filter(Project.project_code == params["project_code"])
    projects = q.all()

    role_mappings = []
    for p in projects:
        for role, empno_field, hours_field in [
            ("EL", p.el_empno, p.el_hours),
            ("PM", p.pm_empno, p.pm_hours),
            ("QRP", p.qrp_empno, p.qrp_hours),
        ]:
            if hours_field:
                role_mappings.append({
                    "project_code": p.project_code,
                    "project_name": p.project_name,
                    "role": role,
                    "empno": empno_field or "",
                    "budget": float(hours_field),
                })

    codes = list({rm["project_code"] for rm in role_mappings})
    empnos = list({rm["empno"] for rm in role_mappings})
    actual_data = azure_service.get_overview_actuals(codes, db, role_empnos=empnos) if codes else {"by_project_empno": {}}
    actual_pe = actual_data.get("by_project_empno", {})

    result = []
    for rm in role_mappings:
        a = actual_pe.get((rm["project_code"], rm["empno"]), 0)
        result.append({
            **rm,
            "actual": round(a, 2),
            "progress": round(a / rm["budget"] * 100, 1) if rm["budget"] else 0,
        })
    return {"elpm_time": result}


# ─── Staff Skills 구현 ───

def _my_budget_summary(db: Session, empno: str) -> dict:
    rows = (
        db.query(
            BudgetDetail.project_code,
            sa_func.sum(BudgetDetail.budget_hours),
        )
        .filter(BudgetDetail.empno == empno)
        .group_by(BudgetDetail.project_code)
        .all()
    )
    if not rows:
        return {"budget_total": 0, "actual_total": 0, "progress": 0, "message": "배정된 budget이 없습니다."}

    codes = [r[0] for r in rows]
    budget_total = sum(float(r[1] or 0) for r in rows)

    actual_data = azure_service.get_overview_actuals(codes, db, staff_empnos=[empno])
    actual_total = actual_data.get("by_empno", {}).get(empno, 0)

    return {
        "budget_total": budget_total,
        "actual_total": round(actual_total, 2),
        "remaining": round(budget_total - actual_total, 2),
        "progress": round(actual_total / budget_total * 100, 1) if budget_total else 0,
        "project_count": len(codes),
    }


def _my_projects(db: Session, empno: str) -> dict:
    rows = (
        db.query(
            BudgetDetail.project_code,
            sa_func.sum(BudgetDetail.budget_hours),
        )
        .filter(BudgetDetail.empno == empno)
        .group_by(BudgetDetail.project_code)
        .all()
    )
    if not rows:
        return {"projects": [], "message": "배정된 프로젝트가 없습니다."}

    codes = [r[0] for r in rows]
    budget_map = {r[0]: float(r[1] or 0) for r in rows}

    projects = db.query(Project).filter(Project.project_code.in_(codes)).all()
    proj_name_map = {p.project_code: p.project_name for p in projects}

    actual_data = azure_service.get_overview_actuals(codes, db, staff_empnos=[empno])
    # per-project actual for this empno
    actual_pe = actual_data.get("by_project_empno", {})

    result = []
    for pc in codes:
        b = budget_map[pc]
        a = actual_pe.get((pc, empno), 0)
        result.append({
            "project_code": pc,
            "project_name": proj_name_map.get(pc, pc),
            "budget": b,
            "actual": round(a, 2),
            "remaining": round(b - a, 2),
            "progress": round(a / b * 100, 1) if b else 0,
        })
    result.sort(key=lambda x: -x["budget"])
    return {"projects": result}


def _my_budget_by_unit(db: Session, empno: str, params: dict) -> dict:
    q = db.query(
        BudgetDetail.project_code,
        BudgetDetail.budget_category,
        BudgetDetail.budget_unit,
        sa_func.sum(BudgetDetail.budget_hours),
    ).filter(BudgetDetail.empno == empno)

    if params.get("project_code"):
        q = q.filter(BudgetDetail.project_code == params["project_code"])

    rows = q.group_by(
        BudgetDetail.project_code, BudgetDetail.budget_category, BudgetDetail.budget_unit,
    ).all()

    units = []
    for pc, cat, unit, hrs in rows:
        units.append({
            "project_code": pc,
            "category": cat or "기타",
            "unit": unit or "기타",
            "budget": float(hrs or 0),
        })
    units.sort(key=lambda x: (x["project_code"], x["category"], -x["budget"]))
    return {"units": units}
