from sqlalchemy import Column, String, Integer, Float, DateTime, Date, Index
from sqlalchemy.sql import func

from app.db.base import Base


class ActualDetail(Base):
    __tablename__ = "actual_details"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_code = Column(String(20), nullable=False, index=True)
    empno = Column(String(6), nullable=False, index=True)
    input_date = Column(Date, nullable=False)
    year_month = Column(String(7), index=True)
    use_time = Column(Float, default=0)
    activity_code_1 = Column(String(10))
    activity_name_1 = Column(String(100))
    activity_code_2 = Column(String(10))
    activity_name_2 = Column(String(100))
    activity_code_3 = Column(String(10))
    activity_name_3 = Column(String(100))
    budget_unit = Column(String(200))  # 매핑된 Budget 관리단위
    synced_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("ix_actual_lookup", "project_code", "empno", "budget_unit", "year_month"),
    )
