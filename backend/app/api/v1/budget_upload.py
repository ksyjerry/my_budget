from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session
import tempfile
import os

from app.db.session import get_db
from app.services.excel_parser import parse_budget_template, parse_budget_db_file
from app.services.budget_service import upsert_project_from_client_data, bulk_insert_budget_details

router = APIRouter()


@router.post("/upload")
async def upload_budget_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Budget Excel 파일 업로드 및 파싱."""
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Excel 파일만 업로드 가능합니다.")

    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # 통합 Budget DB 파일 여부 판별
        if "Budget_데이터" in file.filename or "budget_data" in file.filename.lower():
            return _process_budget_db(tmp_path, db)
        else:
            return _process_single_budget(tmp_path, db)
    finally:
        os.unlink(tmp_path)


def _process_single_budget(file_path: str, db: Session):
    """개별 프로젝트 Budget 파일 처리."""
    parsed = parse_budget_template(file_path)
    client_info = parsed["client_info"]
    project_info = parsed["project_info"]

    merged = {**client_info, **project_info}
    project = upsert_project_from_client_data(db, merged)
    bulk_insert_budget_details(db, project.project_code, parsed["budget_details"])
    db.commit()

    return {
        "message": f"프로젝트 '{project.project_name}' Budget 업로드 완료",
        "project_code": project.project_code,
        "detail_count": len(parsed["budget_details"]),
    }


def _process_budget_db(file_path: str, db: Session):
    """통합 Budget DB 파일 처리."""
    parsed = parse_budget_db_file(file_path)

    project_count = 0
    # Client기본정보 시트 → projects
    for client_data in parsed["clients"]:
        upsert_project_from_client_data(db, client_data)
        project_count += 1

    # Project기본정보 시트 → Client기본정보에 없는 프로젝트 추가 등록
    for proj_data in parsed.get("projects", []):
        upsert_project_from_client_data(db, proj_data)
        project_count += 1

    # 개인별 Budget 데이터를 프로젝트별로 그룹핑하여 삽입
    from collections import defaultdict
    by_project = defaultdict(list)
    for d in parsed["budget_details"]:
        by_project[d["project_code"]].append(d)

    detail_count = 0
    for prj_code, details in by_project.items():
        bulk_insert_budget_details(db, prj_code, details)
        detail_count += len(details)

    db.commit()

    return {
        "message": f"통합 Budget DB 업로드 완료",
        "project_count": project_count,
        "detail_count": detail_count,
    }
