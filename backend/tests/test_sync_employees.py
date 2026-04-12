"""sync_employees() 유닛 테스트 — Azure 쿼리는 mock."""
from datetime import datetime
from unittest.mock import patch, MagicMock

import pytest
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.employee import Employee
from app.services.sync_service import sync_employees


@pytest.fixture
def db():
    s = SessionLocal()
    # 999 접두사로 테스트 데이터 격리
    s.query(Employee).filter(Employee.empno.like("999%")).delete(synchronize_session=False)
    s.commit()
    yield s
    s.query(Employee).filter(Employee.empno.like("999%")).delete(synchronize_session=False)
    s.commit()
    s.close()


def _mock_azure(rows):
    mock_cursor = MagicMock()
    mock_cursor.fetchall.return_value = rows
    mock_conn = MagicMock()
    mock_conn.cursor.return_value = mock_cursor
    cm = MagicMock()
    cm.__enter__.return_value = mock_conn
    cm.__exit__.return_value = False
    return cm


def test_insert_new_employee(db: Session):
    """Azure 에만 있는 새 empno → INSERT."""
    fake_cm = _mock_azure([
        {
            "EMPNO": "999001", "EMPNM": "테스트직원", "CM_NM": "테스트본부",
            "GRADCD": "SA", "GRADNM": "Senior Associate",
            "TL_EMPNO": "123456", "LOS": "Assurance", "ORG_CD": "T01",
            "ORG_NM": "조직", "PWC_ID": "test@pwc.com", "EMP_STAT": "재직",
        },
    ])
    with patch("app.services.sync_service._get_azure", return_value=fake_cm):
        count = sync_employees(db)
    assert count == 1
    e = db.query(Employee).filter_by(empno="999001").first()
    assert e is not None
    assert e.name == "테스트직원"
    assert e.grade_code == "SA"
    assert e.grade_name == "Senior Associate"
    assert e.department == "테스트본부"
    assert e.los == "Assurance"
    assert e.synced_at is not None


def test_update_existing_employee(db: Session):
    """기존 row 의 name/grade/department 를 Azure 값으로 덮어쓴다."""
    existing = Employee(
        empno="999002",
        name="구이름",
        grade_code="A",
        grade_name="Associate",
        department="옛본부",
    )
    db.add(existing)
    db.commit()

    fake_cm = _mock_azure([
        {
            "EMPNO": "999002", "EMPNM": "새이름", "CM_NM": "새본부",
            "GRADCD": "SA", "GRADNM": "Senior Associate",
            "TL_EMPNO": "234567", "LOS": "Assurance", "ORG_CD": "T02",
            "ORG_NM": "새조직", "PWC_ID": "new@pwc.com", "EMP_STAT": "재직",
        },
    ])
    with patch("app.services.sync_service._get_azure", return_value=fake_cm):
        sync_employees(db)

    db.refresh(existing)
    assert existing.name == "새이름"
    assert existing.grade_code == "SA"
    assert existing.grade_name == "Senior Associate"
    assert existing.department == "새본부"
    assert existing.los == "Assurance"
