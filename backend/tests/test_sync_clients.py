"""sync_clients() 유닛 테스트 — Azure 쿼리는 mock."""
from datetime import datetime
from unittest.mock import patch, MagicMock

import pytest
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.project import Client
from app.services.sync_service import sync_clients


@pytest.fixture
def db():
    s = SessionLocal()
    # 테스트에서 만든 AZUNIT* 접두사 데이터만 정리
    s.query(Client).filter(Client.client_code.like("AZUNIT%")).delete(synchronize_session=False)
    s.commit()
    yield s
    s.query(Client).filter(Client.client_code.like("AZUNIT%")).delete(synchronize_session=False)
    s.commit()
    s.close()


def _mock_azure(rows):
    """sync_clients 내부의 _get_azure() 를 mock 하는 헬퍼."""
    mock_cursor = MagicMock()
    mock_cursor.fetchall.return_value = rows
    mock_conn = MagicMock()
    mock_conn.cursor.return_value = mock_cursor
    cm = MagicMock()
    cm.__enter__.return_value = mock_conn
    cm.__exit__.return_value = False
    return cm


def test_insert_new_client(db: Session):
    """Azure 에만 있는 새 client_code → INSERT + synced_at 설정, 상세필드 NULL."""
    fake_cm = _mock_azure([
        {"CLIENT_CODE": "AZUNIT01", "CLIENT_NAME": "테스트산업", "SHORT_NAME": "테스트"},
    ])
    with patch("app.services.sync_service._get_azure", return_value=fake_cm):
        count = sync_clients(db)
    assert count == 1
    c = db.query(Client).filter_by(client_code="AZUNIT01").first()
    assert c is not None
    assert c.client_name == "테스트산업"
    assert c.synced_at is not None
    assert c.industry is None  # 상세필드는 NULL


def test_update_preserves_user_detail(db: Session):
    """Postgres 에 상세정보가 이미 있는 client_code → 이름/synced_at 만 갱신, industry 보존."""
    existing = Client(
        client_code="AZUNIT02",
        client_name="구이름",
        industry="제조업",
        asset_size="1조 이상",
        synced_at=None,
    )
    db.add(existing)
    db.commit()

    fake_cm = _mock_azure([
        {"CLIENT_CODE": "AZUNIT02", "CLIENT_NAME": "새이름", "SHORT_NAME": ""},
    ])
    with patch("app.services.sync_service._get_azure", return_value=fake_cm):
        sync_clients(db)

    db.refresh(existing)
    assert existing.client_name == "새이름"
    assert existing.synced_at is not None
    assert existing.industry == "제조업"  # 보존
    assert existing.asset_size == "1조 이상"  # 보존


def test_empty_client_code_skipped(db: Session):
    """CLIENT_CODE 가 빈 문자열인 row 는 스킵."""
    fake_cm = _mock_azure([
        {"CLIENT_CODE": "", "CLIENT_NAME": "빈코드", "SHORT_NAME": ""},
        {"CLIENT_CODE": "AZUNIT03", "CLIENT_NAME": "정상", "SHORT_NAME": ""},
    ])
    with patch("app.services.sync_service._get_azure", return_value=fake_cm):
        count = sync_clients(db)
    assert count == 1
    assert db.query(Client).filter_by(client_code="AZUNIT03").first() is not None


def test_shortname_fallback(db: Session):
    """CLIENT_NAME 이 None 이면 SHORT_NAME 사용."""
    fake_cm = _mock_azure([
        {"CLIENT_CODE": "AZUNIT04", "CLIENT_NAME": None, "SHORT_NAME": "약칭"},
    ])
    with patch("app.services.sync_service._get_azure", return_value=fake_cm):
        sync_clients(db)
    c = db.query(Client).filter_by(client_code="AZUNIT04").first()
    assert c.client_name == "약칭"
