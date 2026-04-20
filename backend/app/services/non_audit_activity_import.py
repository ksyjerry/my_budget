"""Parse '비감사 Activity 표준화' Excel file into rows ready for ServiceTaskMaster insert."""
from pathlib import Path
from typing import Optional

import openpyxl


SERVICE_TYPE_SHEET_MAP = {
    "Activity 표준화_회계자문": "AC",
    "Activity 표준화_내부통제": "IC",
    "Activity 표준화_ESG": "ESG",
    "Activity 표준화_Valuation": "VAL",
    "Activity 표준화_통상자문": "TRADE",
    "Activity 표준화_보험계리": "ACT",
    "Activity 표준화_기타비감사": "ETC",
}


def _find_header_row(ws) -> Optional[int]:
    """Find the first row containing the '대분류' keyword — returns row number (1-based)."""
    for idx, row in enumerate(ws.iter_rows(min_row=1, max_row=min(ws.max_row, 10), values_only=True), start=1):
        for cell in row:
            if cell and "대분류" in str(cell):
                return idx
    return None


def _column_map(header_row: tuple) -> dict[str, int]:
    """Return {canonical_key: column_index} by matching Korean labels."""
    mapping = {}
    for col_idx, cell in enumerate(header_row):
        if not cell:
            continue
        text = str(cell).strip()
        if "대분류" in text:
            mapping["category"] = col_idx
        elif "중분류" in text:
            mapping["subcategory"] = col_idx
        elif "소분류" in text:
            mapping["detail"] = col_idx
        elif "Budget 관리단위" in text or text == "Budget 관리단위":
            mapping["budget_unit"] = col_idx
        elif text == "비고":
            mapping["role"] = col_idx
    return mapping


def _stripped(v) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip().replace("\u200b", "")
    return s or None


def parse_non_audit_activities(path: str) -> list[dict]:
    """Return a flat list of dicts ready for ServiceTaskMaster insert."""
    wb = openpyxl.load_workbook(path, data_only=True)
    source_file = Path(path).name
    results: list[dict] = []
    for sheet_name, service_type in SERVICE_TYPE_SHEET_MAP.items():
        if sheet_name not in wb.sheetnames:
            continue
        ws = wb[sheet_name]
        header_idx = _find_header_row(ws)
        if not header_idx:
            continue
        header_row = next(ws.iter_rows(min_row=header_idx, max_row=header_idx, values_only=True))
        cols = _column_map(header_row)
        if "category" not in cols or "detail" not in cols:
            continue
        order = 0
        for row in ws.iter_rows(min_row=header_idx + 1, values_only=True):
            category = _stripped(row[cols["category"]]) if cols["category"] < len(row) else None
            subcategory = _stripped(row[cols.get("subcategory", -1)]) if "subcategory" in cols and cols["subcategory"] < len(row) else None
            detail = _stripped(row[cols["detail"]]) if cols["detail"] < len(row) else None
            budget_unit = _stripped(row[cols.get("budget_unit", -1)]) if "budget_unit" in cols and cols["budget_unit"] < len(row) else None
            role = _stripped(row[cols.get("role", -1)]) if "role" in cols and cols["role"] < len(row) else None
            if not category and not detail:
                continue
            order += 1
            results.append({
                "service_type": service_type,
                "task_category": category,
                "activity_subcategory": subcategory,
                "activity_detail": detail,
                "task_name": detail or category or "",
                "budget_unit": budget_unit,
                "role": role,
                "sort_order": order,
                "source_file": source_file,
            })
    wb.close()
    return results


from sqlalchemy.orm import Session as DBSessionType

from app.models.project import ServiceTaskMaster


def import_non_audit_activities(
    db: DBSessionType,
    path: str,
    *,
    truncate: bool = True,
) -> dict:
    """Parse Excel and replace ServiceTaskMaster rows for the 7 non-audit services.

    Returns {"inserted": int, "by_service_type": {code: count, ...}, "source_file": str}.

    AUDIT rows are never touched — only non-audit codes are truncated/re-inserted.
    """
    rows = parse_non_audit_activities(path)
    non_audit_codes = set(SERVICE_TYPE_SHEET_MAP.values())
    if truncate:
        db.query(ServiceTaskMaster).filter(
            ServiceTaskMaster.service_type.in_(non_audit_codes)
        ).delete(synchronize_session=False)
        db.commit()
    by_service_type: dict[str, int] = {code: 0 for code in non_audit_codes}
    for r in rows:
        db.add(ServiceTaskMaster(
            service_type=r["service_type"],
            task_category=r["task_category"],
            task_name=r["task_name"],
            activity_subcategory=r["activity_subcategory"],
            activity_detail=r["activity_detail"],
            budget_unit=r["budget_unit"],
            role=r["role"],
            sort_order=r["sort_order"],
            source_file=r["source_file"],
        ))
        by_service_type[r["service_type"]] += 1
    db.commit()
    return {
        "inserted": sum(by_service_type.values()),
        "by_service_type": by_service_type,
        "source_file": rows[0]["source_file"] if rows else None,
    }
