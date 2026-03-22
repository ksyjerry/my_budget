"""Budget 입력 API (3-Step Wizard)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from app.db.session import get_db
from app.models.project import Client, Project
from app.models.budget import BudgetDetail
from app.models.budget_master import (
    BudgetUnitMaster, PeerStatistics, PeerGroupMapping,
    ProjectMember, BudgetChangeLog,
)
from app.services.budget_service import upsert_project_from_client_data, bulk_insert_budget_details

router = APIRouter()


# ── Client Search ────────────────────────────────────

@router.get("/clients/search")
def search_clients(q: str = "", db: Session = Depends(get_db)):
    """클라이언트 이름으로 검색."""
    query = db.query(Client)
    if q:
        query = query.filter(Client.client_name.ilike(f"%{q}%"))
    results = query.order_by(Client.client_name).limit(50).all()
    return [
        {
            "client_code": c.client_code,
            "client_name": c.client_name,
            "industry": c.industry or "",
            "asset_size": c.asset_size or "",
            "listing_status": c.listing_status or "",
            "gaap": c.gaap or "",
            "consolidated": c.consolidated or "",
            "subsidiary_count": c.subsidiary_count or "",
            "internal_control": c.internal_control or "",
            "business_report": c.business_report or "",
            "initial_audit": c.initial_audit or "",
        }
        for c in results
    ]


@router.get("/employees/search")
def search_employees(q: str = "", db: Session = Depends(get_db)):
    """직원 이름/사번으로 검색 (budget_details 기반)."""
    from sqlalchemy import func, distinct
    query = (
        db.query(
            BudgetDetail.empno,
            BudgetDetail.emp_name,
            BudgetDetail.grade,
        )
        .filter(BudgetDetail.empno != "", BudgetDetail.emp_name != "")
        .group_by(BudgetDetail.empno, BudgetDetail.emp_name, BudgetDetail.grade)
    )
    if q:
        query = query.filter(
            (BudgetDetail.emp_name.ilike(f"%{q}%")) |
            (BudgetDetail.empno.ilike(f"%{q}%"))
        )
    results = query.order_by(BudgetDetail.emp_name).limit(30).all()
    return [
        {"empno": r.empno, "name": r.emp_name, "grade": r.grade or ""}
        for r in results
    ]


@router.get("/projects/search")
def search_projects(q: str = "", db: Session = Depends(get_db)):
    """프로젝트 코드 또는 이름으로 검색."""
    from sqlalchemy.orm import joinedload
    query = db.query(Project).outerjoin(Client, Project.client_id == Client.id)
    if q:
        query = query.filter(
            (Project.project_name.ilike(f"%{q}%")) |
            (Project.project_code.ilike(f"%{q}%"))
        )
    results = query.add_columns(Client.client_code).order_by(Project.project_name).limit(50).all()
    return [
        {
            "project_code": p.project_code,
            "project_name": p.project_name or "",
            "department": p.department or "",
            "el_name": p.el_name or "",
            "el_empno": p.el_empno or "",
            "pm_name": p.pm_name or "",
            "pm_empno": p.pm_empno or "",
            "qrp_name": p.qrp_name or "",
            "qrp_empno": p.qrp_empno or "",
            "contract_hours": float(p.contract_hours or 0),
            "axdx_hours": float(p.axdx_hours or 0),
            "qrp_hours": float(p.qrp_hours or 0),
            "rm_hours": float(p.rm_hours or 0),
            "el_hours": float(p.el_hours or 0),
            "pm_hours": float(p.pm_hours or 0),
            "ra_elpm_hours": float(p.ra_elpm_hours or 0),
            "et_controllable_budget": float(p.et_controllable_budget or 0),
            "fulcrum_hours": float(p.fulcrum_hours or 0),
            "ra_staff_hours": float(p.ra_staff_hours or 0),
            "specialist_hours": float(p.specialist_hours or 0),
            "travel_hours": float(p.travel_hours or 0),
            "total_budget_hours": float(p.total_budget_hours or 0),
            "template_status": p.template_status or "작성중",
            "client_code": client_code or "",
        }
        for p, client_code in results
    ]


# ── Schemas ──────────────────────────────────────────

class ProjectCreateRequest(BaseModel):
    project_code: str
    project_name: str
    client_code: Optional[str] = None
    client_name: Optional[str] = None
    department: Optional[str] = ""
    industry: Optional[str] = None
    asset_size: Optional[str] = None
    listing_status: Optional[str] = None
    business_report: Optional[str] = None
    gaap: Optional[str] = None
    consolidated: Optional[str] = None
    subsidiary_count: Optional[str] = None
    internal_control: Optional[str] = None
    initial_audit: Optional[str] = None
    group_code: Optional[str] = None
    el_empno: Optional[str] = ""
    el_name: Optional[str] = ""
    pm_empno: Optional[str] = ""
    pm_name: Optional[str] = ""
    qrp_empno: Optional[str] = ""
    qrp_name: Optional[str] = ""
    contract_hours: float = 0
    axdx_hours: float = 0
    qrp_hours: float = 0
    rm_hours: float = 0
    el_hours: float = 0
    pm_hours: float = 0
    ra_elpm_hours: float = 0
    et_controllable_budget: float = 0
    fulcrum_hours: float = 0
    ra_staff_hours: float = 0
    specialist_hours: float = 0
    travel_hours: float = 0
    total_budget_hours: float = 0
    template_status: Optional[str] = "작성중"
    fiscal_start: Optional[str] = None  # "2025-04"


class MemberRequest(BaseModel):
    role: str  # "FLDT 구성원" | "지원 ET 구성원"
    name: str
    empno: Optional[str] = ""
    activity_mapping: Optional[str] = "재무제표기말감사"
    sort_order: int = 0


class BudgetTemplateRow(BaseModel):
    budget_category: str
    budget_unit: str
    empno: Optional[str] = ""
    emp_name: Optional[str] = ""
    grade: Optional[str] = ""
    months: dict[str, float] = {}  # {"2025-06": 8, "2025-12": 4, ...}


class BudgetTemplateSaveRequest(BaseModel):
    rows: list[BudgetTemplateRow]
    template_status: str = "작성중"


# ── Step 1: 프로젝트 기본정보 ────────────────────────

@router.post("/projects")
def create_project(req: ProjectCreateRequest, db: Session = Depends(get_db)):
    """프로젝트 생성 (Step 1)."""
    existing = db.query(Project).filter(Project.project_code == req.project_code).first()
    if existing:
        raise HTTPException(400, f"Project '{req.project_code}' already exists. Use PUT to update.")

    data = req.model_dump()
    data["client_code"] = data.get("client_code") or data["project_code"].split("-")[0]
    project = upsert_project_from_client_data(db, data)

    BudgetChangeLog(
        project_code=req.project_code,
        change_type="create",
        change_summary=f"프로젝트 생성: {req.project_name}",
    )
    db.add(BudgetChangeLog(
        project_code=req.project_code,
        change_type="create",
        change_summary=f"프로젝트 생성: {req.project_name}",
    ))
    db.commit()

    return {"message": "프로젝트 생성 완료", "project_code": project.project_code}


@router.put("/projects/{project_code}")
def update_project(project_code: str, req: ProjectCreateRequest, db: Session = Depends(get_db)):
    """프로젝트 수정 (Step 1)."""
    data = req.model_dump()
    data["project_code"] = project_code
    data["client_code"] = data.get("client_code") or project_code.split("-")[0]
    project = upsert_project_from_client_data(db, data)

    db.add(BudgetChangeLog(
        project_code=project_code,
        change_type="update",
        change_summary="기본정보 수정",
    ))
    db.commit()

    return {"message": "프로젝트 수정 완료", "project_code": project.project_code}


@router.get("/projects/{project_code}/info")
def get_project_info(project_code: str, db: Session = Depends(get_db)):
    """프로젝트 기본정보 조회."""
    project = db.query(Project).filter(Project.project_code == project_code).first()
    if not project:
        raise HTTPException(404, "Project not found")

    client = db.query(Client).filter(Client.id == project.client_id).first()

    return {
        "project": {
            "project_code": project.project_code,
            "project_name": project.project_name,
            "department": project.department,
            "el_empno": project.el_empno,
            "el_name": project.el_name,
            "pm_empno": project.pm_empno,
            "pm_name": project.pm_name,
            "contract_hours": project.contract_hours,
            "axdx_hours": project.axdx_hours,
            "qrp_hours": project.qrp_hours,
            "rm_hours": project.rm_hours,
            "el_hours": project.el_hours,
            "pm_hours": project.pm_hours,
            "ra_elpm_hours": project.ra_elpm_hours,
            "et_controllable_budget": project.et_controllable_budget,
            "fulcrum_hours": project.fulcrum_hours,
            "ra_staff_hours": project.ra_staff_hours,
            "specialist_hours": project.specialist_hours,
            "travel_hours": project.travel_hours,
            "total_budget_hours": project.total_budget_hours,
            "template_status": project.template_status,
        },
        "client": {
            "client_code": client.client_code if client else "",
            "client_name": client.client_name if client else "",
            "industry": client.industry if client else "",
            "asset_size": client.asset_size if client else "",
            "listing_status": client.listing_status if client else "",
            "business_report": client.business_report if client else "",
            "gaap": client.gaap if client else "",
            "consolidated": client.consolidated if client else "",
            "subsidiary_count": client.subsidiary_count if client else "",
            "internal_control": client.internal_control if client else "",
            "initial_audit": client.initial_audit if client else "",
        } if client else None,
    }


# ── Step 2: 구성원 관리 ─────────────────────────────

@router.get("/projects/{project_code}/members")
def get_members(project_code: str, db: Session = Depends(get_db)):
    members = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_code == project_code)
        .order_by(ProjectMember.sort_order)
        .all()
    )
    return [
        {
            "id": m.id,
            "role": m.role,
            "name": m.name,
            "empno": m.empno,
            "activity_mapping": m.activity_mapping,
            "sort_order": m.sort_order,
        }
        for m in members
    ]


@router.put("/projects/{project_code}/members")
def save_members(
    project_code: str,
    members: list[MemberRequest],
    db: Session = Depends(get_db),
):
    """구성원 일괄 저장 (기존 삭제 후 재삽입)."""
    db.query(ProjectMember).filter(ProjectMember.project_code == project_code).delete()
    for i, m in enumerate(members):
        db.add(ProjectMember(
            project_code=project_code,
            role=m.role,
            name=m.name,
            empno=m.empno,
            activity_mapping=m.activity_mapping,
            sort_order=m.sort_order or i,
        ))
    db.commit()
    return {"message": f"{len(members)}명 구성원 저장 완료"}


# ── Step 3: Budget Template ──────────────────────────

@router.get("/projects/{project_code}/template")
def get_template(project_code: str, db: Session = Depends(get_db)):
    """Budget Template 조회."""
    details = (
        db.query(BudgetDetail)
        .filter(BudgetDetail.project_code == project_code)
        .all()
    )

    # 행 그룹핑: (category, unit, empno) → months
    from collections import defaultdict
    rows_map = defaultdict(lambda: {"months": {}, "meta": {}})
    for d in details:
        key = (d.budget_category, d.budget_unit, d.empno)
        rows_map[key]["meta"] = {
            "budget_category": d.budget_category,
            "budget_unit": d.budget_unit,
            "empno": d.empno,
            "emp_name": d.emp_name,
            "grade": d.grade,
            "department": d.department,
        }
        if d.budget_hours and d.budget_hours > 0:
            rows_map[key]["months"][d.year_month] = d.budget_hours

    rows = []
    for key, val in rows_map.items():
        total = sum(val["months"].values())
        rows.append({
            **val["meta"],
            "months": val["months"],
            "total": total,
        })

    return {"project_code": project_code, "rows": rows}


@router.put("/projects/{project_code}/template")
def save_template(
    project_code: str,
    req: BudgetTemplateSaveRequest,
    db: Session = Depends(get_db),
):
    """Budget Template 저장."""
    # budget_details로 변환
    details = []
    for row in req.rows:
        for ym, hours in row.months.items():
            if hours and hours > 0:
                details.append({
                    "budget_category": row.budget_category,
                    "budget_unit": row.budget_unit,
                    "empno": row.empno,
                    "emp_name": row.emp_name,
                    "grade": row.grade,
                    "year_month": ym,
                    "budget_hours": hours,
                })

    bulk_insert_budget_details(db, project_code, details)

    # template_status 업데이트
    project = db.query(Project).filter(Project.project_code == project_code).first()
    if project:
        project.template_status = req.template_status

    db.add(BudgetChangeLog(
        project_code=project_code,
        change_type="update",
        change_summary=f"Budget Template 저장 ({len(details)}건, 상태: {req.template_status})",
    ))
    db.commit()

    return {"message": f"Budget Template 저장 완료 ({len(details)}건)"}


# ── 마스터 데이터 ────────────────────────────────────

@router.get("/master/units")
def get_budget_units(db: Session = Depends(get_db)):
    """관리단위 마스터 목록."""
    units = db.query(BudgetUnitMaster).order_by(BudgetUnitMaster.sort_order).all()
    if not units:
        # DB에 없으면 하드코딩 기본값 반환
        return {"units": DEFAULT_BUDGET_UNITS}
    return {
        "units": [
            {"category": u.category, "unit_name": u.unit_name, "sort_order": u.sort_order}
            for u in units
        ]
    }


@router.get("/peer-group")
def get_peer_group(
    industry: str = "",
    asset_size: str = "",
    listing_status: str = "",
    consolidated: str = "",
    internal_control: str = "",
    db: Session = Depends(get_db),
):
    """유사회사 그룹 조회."""
    mapping = (
        db.query(PeerGroupMapping)
        .filter(
            PeerGroupMapping.industry == industry,
            PeerGroupMapping.asset_size == asset_size,
            PeerGroupMapping.listing_status == listing_status,
            PeerGroupMapping.consolidated == consolidated,
            PeerGroupMapping.internal_control == internal_control,
        )
        .first()
    )
    if not mapping:
        return {"stat_group": None}
    return {"stat_group": mapping.stat_group}


@router.get("/master/peer-stats")
def get_peer_stats(group: str, db: Session = Depends(get_db)):
    """유사회사 통계."""
    stats = (
        db.query(PeerStatistics)
        .filter(PeerStatistics.stat_group == group)
        .all()
    )
    return {
        "stats": {s.budget_unit: s.avg_ratio for s in stats}
    }


@router.get("/projects/{project_code}/history")
def get_change_history(project_code: str, db: Session = Depends(get_db)):
    """변경 이력."""
    logs = (
        db.query(BudgetChangeLog)
        .filter(BudgetChangeLog.project_code == project_code)
        .order_by(BudgetChangeLog.changed_at.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "changed_at": l.changed_at.isoformat() if l.changed_at else "",
            "changed_by": l.changed_by_name or l.changed_by_empno or "",
            "change_type": l.change_type,
            "change_summary": l.change_summary,
        }
        for l in logs
    ]


# ── 기본 관리단위 목록 (DB 비어있을 때 사용) ─────────

DEFAULT_BUDGET_UNITS = [
    {"category": "분반기 검토", "unit_name": "분반기 검토", "sort_order": 1},
    {"category": "계획단계", "unit_name": "계획단계", "sort_order": 10},
    {"category": "계획단계", "unit_name": "초도감사", "sort_order": 11},
    {"category": "재무제표 수준 위험", "unit_name": "부정위험", "sort_order": 20},
    {"category": "재무제표 수준 위험", "unit_name": "계속기업", "sort_order": 21},
    {"category": "재무제표 수준 위험", "unit_name": "기타(특수관계자/법률 및 규정)", "sort_order": 22},
    {"category": "자산", "unit_name": "현금및현금성자산-일반", "sort_order": 30},
    {"category": "자산", "unit_name": "현금및현금성자산-조회", "sort_order": 31},
    {"category": "자산", "unit_name": "채무 및 지분증권-일반", "sort_order": 32},
    {"category": "자산", "unit_name": "채무 및 지분증권-공정가치평가", "sort_order": 33},
    {"category": "자산", "unit_name": "파생상품", "sort_order": 34},
    {"category": "자산", "unit_name": "매출채권-일반", "sort_order": 35},
    {"category": "자산", "unit_name": "매출채권-조회", "sort_order": 36},
    {"category": "자산", "unit_name": "고객 반품, 할인 및 충당금", "sort_order": 37},
    {"category": "자산", "unit_name": "재고자산-일반", "sort_order": 38},
    {"category": "자산", "unit_name": "재고자산-실사입회및문서화", "sort_order": 39},
    {"category": "자산", "unit_name": "건설계약", "sort_order": 40},
    {"category": "자산", "unit_name": "기타자산", "sort_order": 41},
    {"category": "자산", "unit_name": "유/무형자산/투자부동산-일반", "sort_order": 42},
    {"category": "자산", "unit_name": "유/무형자산/투자부동산-취득처분", "sort_order": 43},
    {"category": "자산", "unit_name": "종속기업 등에 대한 투자자산-일반", "sort_order": 44},
    {"category": "자산", "unit_name": "종속기업 등에 대한 투자자산-손상검토", "sort_order": 45},
    {"category": "자산", "unit_name": "영업권-일반", "sort_order": 46},
    {"category": "자산", "unit_name": "영업권-PPA", "sort_order": 47},
    {"category": "자산", "unit_name": "영업권-손상검토", "sort_order": 48},
    {"category": "자산", "unit_name": "자산 - 기타", "sort_order": 49},
    {"category": "부채 및 자본", "unit_name": "매입채무-일반", "sort_order": 50},
    {"category": "부채 및 자본", "unit_name": "매입채무-조회", "sort_order": 51},
    {"category": "부채 및 자본", "unit_name": "특수관계자/내부거래", "sort_order": 52},
    {"category": "부채 및 자본", "unit_name": "기타부채 및 충당부채-일반", "sort_order": 53},
    {"category": "부채 및 자본", "unit_name": "기타부채 및 충당부채-부외부채/우발부채검토", "sort_order": 54},
    {"category": "부채 및 자본", "unit_name": "법인세", "sort_order": 55},
    {"category": "부채 및 자본", "unit_name": "차입금/복합금융상품-일반", "sort_order": 56},
    {"category": "부채 및 자본", "unit_name": "차입금/복합금융상품-공정가치평가", "sort_order": 57},
    {"category": "부채 및 자본", "unit_name": "차입금/복합금융상품-약정사항 검토", "sort_order": 58},
    {"category": "부채 및 자본", "unit_name": "이연수익", "sort_order": 59},
    {"category": "부채 및 자본", "unit_name": "리스", "sort_order": 60},
    {"category": "부채 및 자본", "unit_name": "퇴직급여/장기종업원급여", "sort_order": 61},
    {"category": "부채 및 자본", "unit_name": "부채 - 기타", "sort_order": 62},
    {"category": "부채 및 자본", "unit_name": "자본금 및 기타 자본 계정", "sort_order": 63},
    {"category": "수익/비용", "unit_name": "매출(IIFRS15/K-GAAP)-일반", "sort_order": 70},
    {"category": "수익/비용", "unit_name": "매출(IIFRS15/K-GAAP)-발생사실테스트", "sort_order": 71},
    {"category": "수익/비용", "unit_name": "매출(IIFRS15/K-GAAP)-Cut-off테스트", "sort_order": 72},
    {"category": "수익/비용", "unit_name": "기타 영업수익", "sort_order": 73},
    {"category": "수익/비용", "unit_name": "매출원가-일반", "sort_order": 74},
    {"category": "수익/비용", "unit_name": "매출원가-증빙테스트", "sort_order": 75},
    {"category": "수익/비용", "unit_name": "영업비용", "sort_order": 76},
    {"category": "수익/비용", "unit_name": "인건비", "sort_order": 77},
    {"category": "수익/비용", "unit_name": "영업외손익", "sort_order": 78},
    {"category": "수익/비용", "unit_name": "주식기준보상비용-일반", "sort_order": 79},
    {"category": "수익/비용", "unit_name": "비용 - 기타", "sort_order": 80},
    {"category": "종결단계", "unit_name": "종결단계", "sort_order": 90},
    {"category": "종결단계", "unit_name": "주석검토-별도", "sort_order": 91},
    {"category": "종결단계", "unit_name": "주석검토-연결", "sort_order": 92},
    {"category": "종결단계", "unit_name": "기말감사 - 별도CF", "sort_order": 93},
    {"category": "종결단계", "unit_name": "외국어 보고서", "sort_order": 94},
    {"category": "연결", "unit_name": "기말감사 - 연결일반", "sort_order": 100},
    {"category": "연결", "unit_name": "기말감사 - 연결GA/CA", "sort_order": 101},
    {"category": "연결", "unit_name": "기말감사 - 연결법인세", "sort_order": 102},
    {"category": "연결", "unit_name": "기말감사 - 연결CF", "sort_order": 103},
    {"category": "내부통제", "unit_name": "내부통제-계획/종결", "sort_order": 110},
    {"category": "내부통제", "unit_name": "내부회계검토", "sort_order": 111},
    {"category": "내부통제", "unit_name": "설계평가-내부통제-ELC", "sort_order": 112},
    {"category": "내부통제", "unit_name": "설계평가-내부통제-ITGC", "sort_order": 113},
    {"category": "내부통제", "unit_name": "설계평가-내부통제-재무보고(FR)", "sort_order": 114},
    {"category": "내부통제", "unit_name": "설계평가-내부통제-자금", "sort_order": 115},
    {"category": "내부통제", "unit_name": "설계평가-내부통제-매출/매출채권", "sort_order": 116},
    {"category": "내부통제", "unit_name": "설계평가-내부통제-재고/원가", "sort_order": 117},
    {"category": "내부통제", "unit_name": "설계평가-내부통제-매입/매입채무", "sort_order": 118},
    {"category": "내부통제", "unit_name": "설계평가-내부통제-급여/퇴직급여", "sort_order": 119},
    {"category": "내부통제", "unit_name": "설계평가-내부통제-유/무형자산/투자부동산", "sort_order": 120},
    {"category": "내부통제", "unit_name": "설계평가-내부통제-연결", "sort_order": 121},
    {"category": "내부통제", "unit_name": "설계평가-내부통제-기타프로세스", "sort_order": 122},
    {"category": "내부통제", "unit_name": "운영평가-내부통제-ELC", "sort_order": 130},
    {"category": "내부통제", "unit_name": "운영평가-내부통제-ITGC", "sort_order": 131},
    {"category": "내부통제", "unit_name": "운영평가-내부통제-재무보고(FR)", "sort_order": 132},
    {"category": "내부통제", "unit_name": "운영평가-내부통제-자금", "sort_order": 133},
    {"category": "내부통제", "unit_name": "운영평가-내부통제-매출/매출채권", "sort_order": 134},
    {"category": "내부통제", "unit_name": "운영평가-내부통제-재고/원가", "sort_order": 135},
    {"category": "내부통제", "unit_name": "운영평가-내부통제-매입/매입채무", "sort_order": 136},
    {"category": "내부통제", "unit_name": "운영평가-내부통제-급여/퇴직급여", "sort_order": 137},
    {"category": "내부통제", "unit_name": "운영평가-내부통제-유/무형자산/투자부동산", "sort_order": 138},
    {"category": "내부통제", "unit_name": "운영평가-내부통제-연결", "sort_order": 139},
    {"category": "내부통제", "unit_name": "운영평가-내부통제-기타프로세스", "sort_order": 140},
    {"category": "IT 감사-RA", "unit_name": "IT 감사-RA", "sort_order": 150},
]
