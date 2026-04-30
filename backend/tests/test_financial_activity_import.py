"""금융업 80행이 시드되었는지 검증.

CI fresh DB 에서는 import_financial_activities() 가 자동 실행되지 않으므로 시드 없으면 skip.
로컬 dev / staging / prod 환경 (시드 적용된 DB) 에서는 50행 이상 검증.
"""
import pytest
from sqlalchemy import text


def test_financial_activities_imported(db):
    count = db.execute(text("""
        SELECT COUNT(*) FROM service_task_master
        WHERE budget_unit LIKE '(금융)%' OR budget_unit LIKE '%대출채권%' OR budget_unit LIKE '%보험계약%' OR budget_unit LIKE '%KICS%'
    """)).scalar()
    if count == 0:
        pytest.skip("금융업 시드 미적용 (CI fresh DB) — manual import_financial_activities() 필요")
    assert count >= 50, f"금융업 시드 부족: {count}건. import_financial_activities() 실행 필요"
