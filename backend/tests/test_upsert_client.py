"""upsert_project_from_client_data - Azure sync 후 사용자 상세 입력이 반영되는지."""
import pytest
from datetime import datetime
from app.db.session import SessionLocal
from app.models.project import Client, Project
from app.services.budget_service import upsert_project_from_client_data


@pytest.fixture
def db():
    s = SessionLocal()
    s.query(Project).filter(Project.project_code.like("AZUPS%")).delete(synchronize_session=False)
    s.query(Client).filter(Client.client_code.like("AZUPS%")).delete(synchronize_session=False)
    s.commit()
    yield s
    s.query(Project).filter(Project.project_code.like("AZUPS%")).delete(synchronize_session=False)
    s.query(Client).filter(Client.client_code.like("AZUPS%")).delete(synchronize_session=False)
    s.commit()
    s.close()


def test_updates_existing_client_detail(db):
    """Azure sync 로 빈 상세필드 Client 가 먼저 존재 → upsert 로 상세필드가 채워져야 함."""
    existing = Client(
        client_code="AZUPS",
        client_name="이름만있음",
        industry=None,
        asset_size=None,
        synced_at=datetime.now(),
    )
    db.add(existing)
    db.commit()
    client_id = existing.id

    upsert_project_from_client_data(db, {
        "project_code": "AZUPS-TEST01",
        "client_code": "AZUPS",
        "client_name": "이름만있음",
        "industry": "제조업",
        "asset_size": "1조 이상",
        "listing_status": "유가증권",
        "gaap": "IFRS",
        "consolidated": "작성",
        "subsidiary_count": "10개이하",
        "internal_control": "연결감사",
        "initial_audit": "계속감사",
        "project_name": "테스트 프로젝트",
        "department": "본부",
        "el_empno": "", "el_name": "",
        "pm_empno": "", "pm_name": "",
        "qrp_empno": "", "qrp_name": "",
        "contract_hours": 0, "axdx_hours": 0, "qrp_hours": 0,
    })
    db.commit()

    c = db.query(Client).filter_by(id=client_id).first()
    assert c.industry == "제조업"
    assert c.asset_size == "1조 이상"
    assert c.listing_status == "유가증권"
    assert c.gaap == "IFRS"


def test_preserves_existing_detail_when_not_provided(db):
    """상세필드가 이미 있고 data 에 None 으로 넘어오면 덮어쓰지 않음."""
    existing = Client(
        client_code="AZUPS",
        client_name="원래이름",
        industry="제조업",
        synced_at=None,
    )
    db.add(existing)
    db.commit()

    upsert_project_from_client_data(db, {
        "project_code": "AZUPS-TEST02",
        "client_code": "AZUPS",
        "client_name": "원래이름",
        "industry": None,  # 비어있음 → 기존값 보존
        "project_name": "두번째",
        "department": "", "el_empno": "", "el_name": "",
        "pm_empno": "", "pm_name": "",
        "qrp_empno": "", "qrp_name": "",
        "contract_hours": 0, "axdx_hours": 0, "qrp_hours": 0,
    })
    db.commit()

    c = db.query(Client).filter_by(client_code="AZUPS").first()
    assert c.industry == "제조업"  # 보존
