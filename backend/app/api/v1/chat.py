"""AI Chat 엔드포인트 — 2-Step LLM 패턴."""

import json
import logging
import os
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import require_login, get_user_project_codes
from app.services.llm_client import GenAIClient
from app.services.llm_skills import execute_skill
from app.services.llm_prompts import build_step1_prompt, build_step3_prompt

logger = logging.getLogger(__name__)
router = APIRouter()

# GenAI 클라이언트 (싱글턴)
_client: GenAIClient | None = None


def _get_client() -> GenAIClient:
    global _client
    if _client is None:
        from dotenv import load_dotenv
        load_dotenv()
        base_url = os.getenv("GENAI_BASE_URL", "")
        api_key = os.getenv("PwC_LLM_API_KEY", "")
        model = os.getenv("PwC_LLM_MODEL", "bedrock.anthropic.claude-sonnet-4-6")
        if not base_url or not api_key:
            raise HTTPException(status_code=500, detail="GenAI Gateway 설정이 없습니다.")
        _client = GenAIClient(base_url=base_url, api_key=api_key, model=model)
    return _client


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    answer: str
    skills_used: list[str] = []
    elapsed_ms: int = 0


@router.post("/chat", response_model=ChatResponse)
async def chat(
    req: ChatRequest,
    user: dict = Depends(require_login),
    db: Session = Depends(get_db),
):

    t0 = time.time()
    client = _get_client()
    empno = user["empno"]
    name = user["name"]
    role = user.get("role", "Staff")

    # 사용자의 접근 가능한 프로젝트 코드
    allowed_codes = get_user_project_codes(db, empno)

    # ─── Step 1: 질문 분석 → skill 선택 ───
    step1_prompt = build_step1_prompt(role, name, empno)

    try:
        plan = await client.complete_json(
            system_prompt=step1_prompt,
            user_prompt=req.message,
            temperature=0.1,
            max_tokens=1024,
        )
    except Exception as e:
        logger.error(f"Step 1 LLM error: {e}")
        raise HTTPException(status_code=502, detail="AI 질문 분석에 실패했습니다.")

    # ─── Step 2: Skill 실행 ───
    skills_used = []
    skill_results = []

    # 직접 답변 (skill 불필요)
    if plan.get("skill") == "none":
        return ChatResponse(
            answer=plan.get("direct_answer", "질문을 이해하지 못했습니다."),
            elapsed_ms=int((time.time() - t0) * 1000),
        )

    # 단일 skill
    if "skill" in plan and plan["skill"] != "none":
        skill_name = plan["skill"]
        params = plan.get("params", {})
        result = execute_skill(skill_name, params, db, empno, role, allowed_codes)
        skills_used.append(skill_name)
        skill_results.append({"skill": skill_name, "result": result})

    # 복수 skills
    if "skills" in plan:
        for s in plan["skills"]:
            skill_name = s.get("skill", "")
            params = s.get("params", {})
            result = execute_skill(skill_name, params, db, empno, role, allowed_codes)
            skills_used.append(skill_name)
            skill_results.append({"skill": skill_name, "result": result})

    # 에러만 반환된 경우
    if all("error" in sr["result"] for sr in skill_results):
        errors = [sr["result"]["error"] for sr in skill_results]
        return ChatResponse(
            answer=errors[0],
            skills_used=skills_used,
            elapsed_ms=int((time.time() - t0) * 1000),
        )

    # ─── Step 3: 결과 기반 답변 생성 ───
    step3_prompt = build_step3_prompt(role, name)
    data_text = json.dumps(skill_results, ensure_ascii=False, default=str)
    # 컨텍스트가 너무 크면 자르기
    if len(data_text) > 12000:
        data_text = data_text[:12000] + "\n... (데이터 일부 생략)"

    user_prompt = f"사용자 질문: {req.message}\n\n조회된 데이터:\n{data_text}"

    try:
        answer = await client.complete(
            system_prompt=step3_prompt,
            user_prompt=user_prompt,
            temperature=0.2,
            max_tokens=4096,
        )
    except Exception as e:
        logger.error(f"Step 3 LLM error: {e}")
        raise HTTPException(status_code=502, detail="AI 답변 생성에 실패했습니다.")

    elapsed = int((time.time() - t0) * 1000)
    logger.info(f"Chat completed: skills={skills_used}, elapsed={elapsed}ms")

    return ChatResponse(
        answer=answer,
        skills_used=skills_used,
        elapsed_ms=elapsed,
    )
