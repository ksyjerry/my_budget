"""Budget 입력 AI 어시스턴트 — 추천 및 검증."""

import json
import logging
import os
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func

from app.db.session import get_db
from app.api.deps import get_optional_user
from app.models.project import Project
from app.models.budget import BudgetDetail

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Request/Response Models ───

class SuggestRequest(BaseModel):
    project_code: str
    et_controllable: float
    enabled_units: list[dict]  # [{"category": "자산", "unit_name": "매출채권-일반"}, ...]
    members: list[dict]  # [{"empno": "...", "name": "...", "grade": "SA"}, ...]
    client_info: dict = {}  # industry, asset_size, etc.


class SuggestResponse(BaseModel):
    suggestions: list[dict]  # [{"category", "unit_name", "hours", "reason"}, ...]
    summary: str
    reference_projects: list[dict] = []


class ValidateRequest(BaseModel):
    project_code: str
    et_controllable: float
    rows: list[dict]  # current templateRows
    client_info: dict = {}


class ValidateResponse(BaseModel):
    feedback: list[dict]  # [{"type": "warning"|"info"|"ok", "message": "...", "unit"?: "..."}, ...]
    summary: str


# ─── Helper: 유사 프로젝트 실적 조회 ───

def _get_reference_data(db: Session, project_code: str, client_info: dict) -> dict:
    """동일 EL/본부의 기존 프로젝트 배분 비율을 참고 데이터로 조회."""
    project = db.query(Project).filter(Project.project_code == project_code).first()
    if not project:
        return {"reference_projects": [], "avg_ratios": {}}

    # 동일 EL의 다른 프로젝트 (budget 있는 것만)
    ref_projects = (
        db.query(Project)
        .filter(
            Project.el_empno == project.el_empno,
            Project.project_code != project_code,
        )
        .all()
    )

    if not ref_projects:
        # EL 없으면 동일 본부
        ref_projects = (
            db.query(Project)
            .filter(
                Project.department == project.department,
                Project.project_code != project_code,
            )
            .limit(10)
            .all()
        )

    ref_codes = [p.project_code for p in ref_projects]
    if not ref_codes:
        return {"reference_projects": [], "avg_ratios": {}}

    # 관리단위별 budget 비율 평균
    rows = (
        db.query(
            BudgetDetail.project_code,
            BudgetDetail.budget_category,
            BudgetDetail.budget_unit,
            sa_func.sum(BudgetDetail.budget_hours).label("hours"),
        )
        .filter(BudgetDetail.project_code.in_(ref_codes))
        .group_by(BudgetDetail.project_code, BudgetDetail.budget_category, BudgetDetail.budget_unit)
        .all()
    )

    # 프로젝트별 총 budget
    proj_totals: dict[str, float] = defaultdict(float)
    unit_hours: dict[str, list[float]] = defaultdict(list)  # unit → [ratio1, ratio2, ...]

    for r in rows:
        proj_totals[r.project_code] += float(r.hours or 0)

    for r in rows:
        total = proj_totals.get(r.project_code, 0)
        if total > 0:
            ratio = float(r.hours or 0) / total
            key = f"{r.budget_category}|{r.budget_unit}"
            unit_hours[key].append(ratio)

    avg_ratios = {}
    for key, ratios in unit_hours.items():
        cat, unit = key.split("|", 1)
        avg_ratios[key] = {
            "category": cat,
            "unit": unit,
            "avg_ratio": round(sum(ratios) / len(ratios), 4),
            "count": len(ratios),
        }

    ref_info = [
        {
            "project_code": p.project_code,
            "project_name": p.project_name,
            "total_budget": proj_totals.get(p.project_code, 0),
        }
        for p in ref_projects
        if proj_totals.get(p.project_code, 0) > 0
    ]

    return {"reference_projects": ref_info[:5], "avg_ratios": avg_ratios}


# ─── GenAI Client ───

def _get_client():
    from app.services.llm_client import GenAIClient
    from dotenv import load_dotenv
    load_dotenv()
    base_url = os.getenv("GENAI_BASE_URL", "")
    api_key = os.getenv("PwC_LLM_API_KEY", "")
    model = os.getenv("PwC_LLM_MODEL", "bedrock.anthropic.claude-sonnet-4-6")
    if not base_url or not api_key:
        raise HTTPException(status_code=500, detail="GenAI Gateway 설정이 없습니다.")
    return GenAIClient(base_url=base_url, api_key=api_key, model=model)


# ─── Suggest Endpoint ───

@router.post("/budget-assist/suggest", response_model=SuggestResponse)
async def suggest_budget(
    req: SuggestRequest,
    db: Session = Depends(get_db),
    user: dict | None = Depends(get_optional_user),
):
    if not user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")

    t0 = time.time()
    client = _get_client()
    ref_data = _get_reference_data(db, req.project_code, req.client_info)

    units_list = "\n".join(
        f"- [{u['category']}] {u['unit_name']}"
        for u in req.enabled_units
    )
    members_list = "\n".join(
        f"- {m.get('name', '')} ({m.get('grade', '')})"
        for m in req.members
    )
    ref_ratios = json.dumps(
        [
            {"category": v["category"], "unit": v["unit"], "avg_ratio_pct": round(v["avg_ratio"] * 100, 1)}
            for v in ref_data["avg_ratios"].values()
        ],
        ensure_ascii=False,
    )

    system_prompt = """너는 PwC Assurance 감사 Budget 배분 전문가이다.

프로젝트 정보와 유사 프로젝트 실적을 참고하여, 관리단위별 Budget 시간 배분을 추천하라.

## 규칙
1. 추천 시간의 합계가 반드시 ET controllable budget과 정확히 일치해야 한다
2. 유사 프로젝트의 비율을 참고하되, 프로젝트 특성에 맞게 조정
3. 각 관리단위에 최소 1시간 이상 배정 (해당 항목인 경우)
4. 대분류별 비중이 합리적인지 확인
5. 초도감사인 경우 계획단계 비중을 높게
6. 금융업은 대출채권/유가증권 등 금융 특화 항목 비중 높게

응답은 반드시 JSON으로:
{
  "suggestions": [
    {"category": "대분류", "unit_name": "관리단위", "hours": 숫자, "reason": "배정 근거"}
  ],
  "summary": "전체 배분 요약 설명"
}"""

    user_prompt = f"""## 프로젝트 정보
- ET Controllable Budget: {req.et_controllable}시간
- 산업: {req.client_info.get('industry', '미상')}
- 자산규모: {req.client_info.get('asset_size', '미상')}
- 상장여부: {req.client_info.get('listing_status', '미상')}
- 감사유형: {req.client_info.get('initial_audit', '미상')}
- 내부통제: {req.client_info.get('internal_control', '미상')}

## 배정 대상 관리단위 (enabled)
{units_list}

## 구성원
{members_list}

## 유사 프로젝트 평균 비율 (참고)
{ref_ratios}

위 정보를 바탕으로 ET Controllable Budget {req.et_controllable}시간을 관리단위별로 배분하라."""

    try:
        result = await client.complete_json(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.2,
            max_tokens=8192,
        )
    except Exception as e:
        logger.error(f"Budget suggest LLM error: {e}")
        raise HTTPException(status_code=502, detail="AI 추천 생성에 실패했습니다.")

    elapsed = int((time.time() - t0) * 1000)
    logger.info(f"Budget suggest completed: {elapsed}ms")

    return SuggestResponse(
        suggestions=result.get("suggestions", []),
        summary=result.get("summary", ""),
        reference_projects=ref_data["reference_projects"],
    )


# ─── Validate Endpoint ───

@router.post("/budget-assist/validate", response_model=ValidateResponse)
async def validate_budget(
    req: ValidateRequest,
    db: Session = Depends(get_db),
    user: dict | None = Depends(get_optional_user),
):
    if not user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")

    t0 = time.time()
    client = _get_client()
    ref_data = _get_reference_data(db, req.project_code, req.client_info)

    # 현재 입력값 요약
    total_hours = sum(
        sum(r.get("months", {}).values()) for r in req.rows if r.get("enabled", True)
    )
    unit_summary = defaultdict(float)
    for r in req.rows:
        if r.get("enabled", True):
            unit_summary[f"{r.get('budget_category', '')}|{r.get('budget_unit', '')}"] += sum(
                r.get("months", {}).values()
            )

    current_data = json.dumps(
        [
            {"category": k.split("|")[0], "unit": k.split("|")[1], "hours": round(v, 1),
             "ratio_pct": round(v / total_hours * 100, 1) if total_hours > 0 else 0}
            for k, v in sorted(unit_summary.items())
        ],
        ensure_ascii=False,
    )

    ref_ratios = json.dumps(
        [
            {"category": v["category"], "unit": v["unit"], "avg_ratio_pct": round(v["avg_ratio"] * 100, 1)}
            for v in ref_data["avg_ratios"].values()
        ],
        ensure_ascii=False,
    )

    system_prompt = """너는 PwC Assurance 감사 Budget 검증 전문가이다.

현재 입력된 Budget 배분을 유사 프로젝트 실적과 비교하여 피드백을 제공하라.

## 검증 항목
1. 총 배분시간이 ET controllable budget과 일치하는지
2. 대분류별 비중이 유사회사 대비 적정한지 (±10% 이상 차이 시 경고)
3. 특정 관리단위가 과다/과소 배정되지 않았는지
4. 누락된 주요 관리단위가 없는지
5. 월별 배분이 극단적으로 편중되지 않았는지

응답은 반드시 JSON으로:
{
  "feedback": [
    {"type": "warning|info|ok", "message": "피드백 내용", "unit": "관련 관리단위(선택)"}
  ],
  "summary": "전체 검증 결과 요약"
}"""

    user_prompt = f"""## 프로젝트 정보
- ET Controllable Budget: {req.et_controllable}시간
- 산업: {req.client_info.get('industry', '미상')}
- 초도/계속: {req.client_info.get('initial_audit', '미상')}

## 현재 입력된 배분 (총 {total_hours}시간)
{current_data}

## 유사 프로젝트 평균 비율 (참고)
{ref_ratios}

위 배분을 검증하고 피드백을 제공하라."""

    try:
        result = await client.complete_json(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.2,
            max_tokens=4096,
        )
    except Exception as e:
        logger.error(f"Budget validate LLM error: {e}")
        raise HTTPException(status_code=502, detail="AI 검증에 실패했습니다.")

    elapsed = int((time.time() - t0) * 1000)
    logger.info(f"Budget validate completed: {elapsed}ms")

    return ValidateResponse(
        feedback=result.get("feedback", []),
        summary=result.get("summary", ""),
    )
