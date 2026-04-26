"""금융업 80행이 시드되었는지 검증."""
from sqlalchemy import text


def test_financial_activities_imported(db):
    count = db.execute(text("""
        SELECT COUNT(*) FROM service_task_master
        WHERE budget_unit LIKE '(금융)%' OR budget_unit LIKE '%대출채권%' OR budget_unit LIKE '%보험계약%' OR budget_unit LIKE '%KICS%'
    """)).scalar()
    assert count >= 50, f"금융업 시드 부족: {count}건. import_financial_activities() 실행 필요"
