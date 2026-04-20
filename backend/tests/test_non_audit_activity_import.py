"""Integration tests for import_non_audit_activities into ServiceTaskMaster."""
from pathlib import Path

import pytest

from app.db.session import SessionLocal
from app.models.project import ServiceTaskMaster
from app.services.non_audit_activity_import import (
    import_non_audit_activities,
)


FIXTURE_PATH = Path(__file__).resolve().parents[2] / "files" / "비감사 Activity 표준화_260420.xlsx"


@pytest.fixture(scope="module")
def db():
    s = SessionLocal()
    yield s
    s.close()


def _non_audit_codes() -> set[str]:
    return {"AC", "IC", "ESG", "VAL", "TRADE", "ACT", "ETC"}


def test_import_truncates_and_reseeds(db):
    if not FIXTURE_PATH.exists():
        pytest.skip(f"Fixture not found at {FIXTURE_PATH}")
    result = import_non_audit_activities(db, str(FIXTURE_PATH), truncate=True)
    assert result["inserted"] > 100
    by = result["by_service_type"]
    assert set(by.keys()) == _non_audit_codes()
    for code, n in by.items():
        assert n > 0, f"{code} is empty"


def test_audit_rows_not_touched(db):
    if not FIXTURE_PATH.exists():
        pytest.skip(f"Fixture not found at {FIXTURE_PATH}")
    before = db.query(ServiceTaskMaster).filter(ServiceTaskMaster.service_type == "AUDIT").count()
    import_non_audit_activities(db, str(FIXTURE_PATH), truncate=True)
    after = db.query(ServiceTaskMaster).filter(ServiceTaskMaster.service_type == "AUDIT").count()
    assert after == before


def test_non_audit_row_has_expected_fields(db):
    if not FIXTURE_PATH.exists():
        pytest.skip(f"Fixture not found at {FIXTURE_PATH}")
    import_non_audit_activities(db, str(FIXTURE_PATH), truncate=True)
    esg = db.query(ServiceTaskMaster).filter(ServiceTaskMaster.service_type == "ESG").first()
    assert esg is not None
    assert esg.task_category
    assert esg.activity_detail
    assert esg.source_file
