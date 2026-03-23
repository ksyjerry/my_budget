from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func as sa_func
from typing import Optional

from app.db.session import get_db
from app.models.budget import BudgetDetail
from app.models.project import Project, Client
from app.models.budget_master import ProjectMember
from app.services import azure_service
from app.services.excel_export import create_styled_excel
from app.api.deps import get_optional_user, get_user_project_codes
from sqlalchemy import or_

router = APIRouter()


def _get_filtered_projects(db: Session, project_code: Optional[str], el_empno: Optional[str],
                           allowed_codes: Optional[list[str]] = None):
    query = db.query(Project)
    if allowed_codes is not None:
        query = query.filter(Project.project_code.in_(allowed_codes))
    if project_code:
        query = query.filter(Project.project_code == project_code)
    if el_empno:
        query = query.filter(Project.el_empno == el_empno)
    return query.all()


def _get_filtered_project_codes(db: Session, project_code: Optional[str], el_empno: Optional[str],
                                allowed_codes: Optional[list[str]] = None) -> list[str]:
    return [p.project_code for p in _get_filtered_projects(db, project_code, el_empno, allowed_codes)]


def _apply_budget_scope(query, project_code: Optional[str], el_empno: Optional[str],
                        allowed_codes: Optional[list[str]], db: Session):
    """BudgetDetail 쿼리에 프로젝트 범위 필터 적용."""
    if allowed_codes is not None:
        query = query.filter(BudgetDetail.project_code.in_(allowed_codes))
    if project_code:
        query = query.filter(BudgetDetail.project_code == project_code)
    if el_empno:
        el_pcs = db.query(Project.project_code).filter(Project.el_empno == el_empno).subquery()
        query = query.filter(BudgetDetail.project_code.in_(el_pcs))
    return query


def _apply_member_scope(query, project_code: Optional[str], el_empno: Optional[str],
                        allowed_codes: Optional[list[str]], db: Session):
    """ProjectMember 쿼리에 프로젝트 범위 필터 적용."""
    if allowed_codes is not None:
        query = query.filter(ProjectMember.project_code.in_(allowed_codes))
    if project_code:
        query = query.filter(ProjectMember.project_code == project_code)
    if el_empno:
        el_pcs = db.query(Project.project_code).filter(Project.el_empno == el_empno).subquery()
        query = query.filter(ProjectMember.project_code.in_(el_pcs))
    return query


def _excel_response(output, filename: str):
    from urllib.parse import quote
    encoded = quote(f"{filename}.xlsx")
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"},
    )


@router.get("/export/{view_type}")
def export_data(
    view_type: str,
    el_empno: Optional[str] = Query(None),
    project_code: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: Optional[dict] = Depends(get_optional_user),
):
    """Excel 내보내기 (로그인 사용자 권한 범위)."""
    # 로그인된 사용자의 프로젝트만 허용
    allowed_codes = None
    if user:
        allowed_codes = get_user_project_codes(db, user["empno"])

    if view_type == "overview":
        prj_list = _get_filtered_projects(db, project_code, el_empno, allowed_codes)
        pcs = [p.project_code for p in prj_list]
        actual_map = azure_service.get_actual_by_project(pcs) if pcs else {}
        headers = ["프로젝트코드", "프로젝트명", "EL", "PM", "계약시간", "총Budget", "총Actual", "진행률"]
        col_types = ["str", "str", "str", "str", "num", "num", "num", "progress"]
        rows = []
        t_contract, t_budget, t_actual = 0, 0, 0
        for p in prj_list:
            budget_total = float(db.query(sa_func.coalesce(sa_func.sum(BudgetDetail.budget_hours), 0)).filter(
                BudgetDetail.project_code == p.project_code).scalar())
            actual_total = float(actual_map.get(p.project_code, 0))
            progress = round(actual_total / budget_total * 100, 1) if budget_total else 0
            rows.append([p.project_code, p.project_name, p.el_name, p.pm_name,
                         p.contract_hours or 0, budget_total, actual_total, progress])
            t_contract += (p.contract_hours or 0)
            t_budget += budget_total
            t_actual += actual_total
        t_progress = round(t_actual / t_budget * 100, 1) if t_budget else 0
        total_row = ["합계", "", "", "", t_contract, t_budget, t_actual, t_progress]
        return _excel_response(create_styled_excel("Overview", headers, rows, col_types, total_row), "Overview_프로젝트현황")

    elif view_type == "engagement-time":
        headers = ["프로젝트코드", "프로젝트명", "대분류", "Budget시간"]
        col_types = ["str", "str", "str", "num"]
        query = db.query(
            BudgetDetail.project_code, BudgetDetail.budget_category,
            sa_func.sum(BudgetDetail.budget_hours).label("budget_hours"),
        ).group_by(BudgetDetail.project_code, BudgetDetail.budget_category)
        query = _apply_budget_scope(query, project_code, el_empno, allowed_codes, db)
        rows = []
        for r in query.all():
            proj_name = db.query(Project.project_name).filter(Project.project_code == r.project_code).scalar()
            rows.append([r.project_code, proj_name or "", r.budget_category, float(r.budget_hours)])
        return _excel_response(create_styled_excel("활동별Budget", headers, rows, col_types), "Overview_활동별Budget")

    elif view_type == "elpm-qrp-time":
        headers = ["프로젝트코드", "프로젝트명", "EL", "PM", "QRP", "EL시간", "PM시간", "QRP시간"]
        col_types = ["str", "str", "str", "str", "str", "num", "num", "num"]
        rows = []
        for p in _get_filtered_projects(db, project_code, el_empno, allowed_codes):
            rows.append([p.project_code, p.project_name, p.el_name, p.pm_name, p.qrp_name,
                         p.el_hours or 0, p.pm_hours or 0, p.qrp_hours or 0])
        return _excel_response(create_styled_excel("ELPMQRP", headers, rows, col_types), "Overview_ELPMQRP")

    elif view_type == "staff-time":
        headers = ["사번", "이름", "직급", "부서", "Budget시간", "Actual시간", "진행률"]
        col_types = ["str", "str", "str", "str", "num", "num1", "progress"]
        budget_by_emp = db.query(
            BudgetDetail.empno, BudgetDetail.emp_name, BudgetDetail.grade, BudgetDetail.department,
            sa_func.sum(BudgetDetail.budget_hours).label("budget_hours"),
        )
        budget_by_emp = _apply_budget_scope(budget_by_emp, project_code, el_empno, allowed_codes, db)
        budget_by_emp = budget_by_emp.group_by(
            BudgetDetail.empno, BudgetDetail.emp_name, BudgetDetail.grade, BudgetDetail.department).all()
        pcs = _get_filtered_project_codes(db, project_code, el_empno, allowed_codes)
        empnos = [r.empno for r in budget_by_emp]
        actual_map = azure_service.get_actual_by_empno(empnos, pcs) if empnos and pcs else {}
        rows = []
        t_budget, t_actual = 0, 0
        for r in budget_by_emp:
            actual_total = float(actual_map.get(r.empno, 0))
            progress = round(actual_total / float(r.budget_hours) * 100, 1) if r.budget_hours else 0
            rows.append([r.empno, r.emp_name, r.grade, r.department, float(r.budget_hours), actual_total, progress])
            t_budget += float(r.budget_hours)
            t_actual += actual_total
        t_progress = round(t_actual / t_budget * 100, 1) if t_budget else 0
        total_row = ["합계", "", "", "", t_budget, t_actual, t_progress]
        return _excel_response(create_styled_excel("StaffTime", headers, rows, col_types, total_row), "Overview_StaffTime")

    elif view_type == "project":
        headers = ["프로젝트코드", "프로젝트명", "EL", "PM", "부서", "계약시간", "AXDX시간",
                    "QRP시간", "EL시간", "PM시간", "Fulcrum", "RA_Staff", "Specialist", "총Budget", "작성상태"]
        col_types = ["str", "str", "str", "str", "str", "num", "num", "num", "num", "num", "num", "num", "num", "num", "str"]
        rows = []
        for p in _get_filtered_projects(db, project_code, el_empno, allowed_codes):
            rows.append([p.project_code, p.project_name, p.el_name, p.pm_name, p.department,
                         p.contract_hours or 0, p.axdx_hours or 0, p.qrp_hours or 0,
                         p.el_hours or 0, p.pm_hours or 0, p.fulcrum_hours or 0,
                         p.ra_staff_hours or 0, p.specialist_hours or 0,
                         p.total_budget_hours or 0, p.template_status or ""])
        return _excel_response(create_styled_excel("Project기본정보", headers, rows, col_types), "Project_기본정보")

    elif view_type == "person-detail":
        headers = ["사번", "이름", "직급", "부서", "프로젝트코드", "대분류", "Budget관리단위", "연월", "Budget시간"]
        col_types = ["str", "str", "str", "str", "str", "str", "str", "str", "num1"]
        query = db.query(BudgetDetail).order_by(BudgetDetail.empno, BudgetDetail.project_code, BudgetDetail.year_month)
        query = _apply_budget_scope(query, project_code, el_empno, allowed_codes, db)
        rows = [[r.empno, r.emp_name, r.grade, r.department, r.project_code,
                 r.budget_category, r.budget_unit, r.year_month, float(r.budget_hours or 0)] for r in query.all()]
        return _excel_response(create_styled_excel("인별Detail", headers, rows, col_types), "Project_인별Detail")

    elif view_type == "budget-aggregate":
        headers = ["프로젝트코드", "대분류", "Budget관리단위", "Budget시간합계"]
        col_types = ["str", "str", "str", "num1"]
        query = db.query(
            BudgetDetail.project_code, BudgetDetail.budget_category, BudgetDetail.budget_unit,
            sa_func.sum(BudgetDetail.budget_hours).label("total_hours"),
        ).group_by(BudgetDetail.project_code, BudgetDetail.budget_category, BudgetDetail.budget_unit)
        query = _apply_budget_scope(query, project_code, el_empno, allowed_codes, db)
        rows = [[r.project_code, r.budget_category, r.budget_unit, float(r.total_hours)] for r in query.all()]
        return _excel_response(create_styled_excel("Budget집계", headers, rows, col_types), "Project_Budget집계")

    elif view_type == "budget-detail":
        headers = ["프로젝트코드", "대분류", "Budget관리단위", "사번", "이름", "직급", "부서", "연월", "Budget시간"]
        col_types = ["str", "str", "str", "str", "str", "str", "str", "str", "num1"]
        query = db.query(BudgetDetail).order_by(
            BudgetDetail.project_code, BudgetDetail.budget_category, BudgetDetail.budget_unit, BudgetDetail.year_month)
        query = _apply_budget_scope(query, project_code, el_empno, allowed_codes, db)
        rows = [[r.project_code, r.budget_category, r.budget_unit, r.empno, r.emp_name,
                 r.grade, r.department, r.year_month, float(r.budget_hours or 0)] for r in query.all()]
        return _excel_response(create_styled_excel("BudgetDetail", headers, rows, col_types), "인별_BudgetDetail")

    elif view_type == "fldt-detail":
        headers = ["프로젝트코드", "역할", "이름", "사번", "Activity매핑", "Budget시간합계"]
        col_types = ["str", "str", "str", "str", "str", "num"]
        query = db.query(ProjectMember).order_by(ProjectMember.project_code, ProjectMember.sort_order)
        query = _apply_member_scope(query, project_code, el_empno, allowed_codes, db)
        rows = []
        for m in query.all():
            bt = 0.0
            if m.empno:
                bt = float(db.query(sa_func.coalesce(sa_func.sum(BudgetDetail.budget_hours), 0)).filter(
                    BudgetDetail.project_code == m.project_code, BudgetDetail.empno == m.empno).scalar() or 0)
            rows.append([m.project_code, m.role, m.name, m.empno, m.activity_mapping, bt])
        return _excel_response(create_styled_excel("FLDT구성원", headers, rows, col_types), "인별_FLDT구성원")

    elif view_type == "summary":
        prj_list = _get_filtered_projects(db, project_code, el_empno, allowed_codes)
        pcs = [p.project_code for p in prj_list]
        actual_map = azure_service.get_actual_by_project(pcs) if pcs else {}
        headers = ["프로젝트코드", "프로젝트명", "계약시간", "총Budget", "총Actual", "YRA", "AX/DX", "AX/DX비율"]
        col_types = ["str", "str", "num", "num", "num1", "num1", "num", "progress"]
        rows = []
        t_contract, t_budget, t_actual, t_axdx = 0, 0, 0, 0
        for p in prj_list:
            budget_total = float(db.query(sa_func.coalesce(sa_func.sum(BudgetDetail.budget_hours), 0)).filter(
                BudgetDetail.project_code == p.project_code).scalar())
            actual_total = float(actual_map.get(p.project_code, 0))
            yra = budget_total - actual_total
            axdx = p.axdx_hours or 0
            axdx_ratio = round(axdx / (p.contract_hours or 1) * 100, 1)
            rows.append([p.project_code, p.project_name, p.contract_hours or 0,
                         budget_total, actual_total, yra, axdx, axdx_ratio])
            t_contract += (p.contract_hours or 0)
            t_budget += budget_total
            t_actual += actual_total
            t_axdx += axdx
        t_yra = t_budget - t_actual
        t_ratio = round(t_axdx / t_contract * 100, 1) if t_contract else 0
        total_row = ["합계", "", t_contract, t_budget, t_actual, t_yra, t_axdx, t_ratio]
        return _excel_response(create_styled_excel("Summary", headers, rows, col_types, total_row), "Summary_프로젝트별")

    elif view_type == "group-prj-summary":
        prj_list = db.query(Project).options(joinedload(Project.client)).order_by(Project.department, Project.project_code)
        if allowed_codes is not None:
            prj_list = prj_list.filter(Project.project_code.in_(allowed_codes))
        if el_empno:
            prj_list = prj_list.filter(Project.el_empno == el_empno)
        prj_list = prj_list.all()
        pcs = [p.project_code for p in prj_list]
        actual_map = azure_service.get_actual_by_project(pcs) if pcs else {}
        headers = ["Group", "부서", "프로젝트코드", "프로젝트명", "EL", "계약시간", "총Budget", "총Actual", "진행률"]
        col_types = ["str", "str", "str", "str", "str", "num", "num", "num1", "progress"]
        rows = []
        for p in prj_list:
            budget_total = float(db.query(sa_func.coalesce(sa_func.sum(BudgetDetail.budget_hours), 0)).filter(
                BudgetDetail.project_code == p.project_code).scalar())
            actual_total = float(actual_map.get(p.project_code, 0))
            progress = round(actual_total / budget_total * 100, 1) if budget_total else 0
            group = (p.client.group_code if p.client and p.client.group_code else "")
            rows.append([group, p.department, p.project_code, p.project_name, p.el_name,
                         p.contract_hours or 0, budget_total, actual_total, progress])
        return _excel_response(create_styled_excel("Group별Summary", headers, rows, col_types), "Summary_Group별")

    elif view_type == "budget":
        headers = ["프로젝트코드", "대분류", "Budget관리단위", "사번", "이름", "직급", "연월", "Budget시간"]
        col_types = ["str", "str", "str", "str", "str", "str", "str", "num1"]
        query = db.query(BudgetDetail)
        query = _apply_budget_scope(query, project_code, el_empno, allowed_codes, db)
        rows = [[r.project_code, r.budget_category, r.budget_unit, r.empno, r.emp_name,
                 r.grade, r.year_month, float(r.budget_hours or 0)] for r in query.all()]
        return _excel_response(create_styled_excel("Budget원본", headers, rows, col_types), "Raw_Budget")

    elif view_type in ("actual", "actual-detail"):
        pcs = _get_filtered_project_codes(db, project_code, el_empno, allowed_codes)
        if view_type == "actual":
            headers = ["프로젝트코드", "사번", "일자", "시간", "대분류", "중분류", "소분류", "Budget관리단위"]
            col_types = ["str", "str", "str", "num1", "str", "str", "str", "str"]
        else:
            headers = ["프로젝트코드", "사번", "일자", "시간", "대분류코드", "대분류", "중분류코드", "중분류", "소분류코드", "소분류", "Budget관리단위"]
            col_types = ["str", "str", "str", "num1", "str", "str", "str", "str", "str", "str", "str"]
        rows = []
        if pcs:
            raw = azure_service.get_actual_raw_rows(pcs, db)
            for r in raw:
                if view_type == "actual":
                    rows.append([r["project_code"], r["empno"], r["input_date"], r["use_time"],
                                 r["activity_name_1"], r["activity_name_2"], r["activity_name_3"], r["budget_unit"]])
                else:
                    rows.append([r["project_code"], r["empno"], r["input_date"], r["use_time"],
                                 r["activity_code_1"], r["activity_name_1"], r["activity_code_2"], r["activity_name_2"],
                                 r["activity_code_3"], r["activity_name_3"], r["budget_unit"]])
        filename = "Raw_Actual" if view_type == "actual" else "Raw_ActualDetail"
        return _excel_response(create_styled_excel(filename, headers, rows, col_types), filename)

    # Fallback
    return _excel_response(create_styled_excel("Empty", ["No Data"], []), "empty")
