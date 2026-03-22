from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class BudgetDetail(Base):
    __tablename__ = "budget_details"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_code = Column(String(20), ForeignKey("projects.project_code"), nullable=False, index=True)
    budget_category = Column(String(100))  # 대분류: 자산, 부채 및 자본, 수익/비용 등
    budget_unit = Column(String(200))      # Budget 관리단위: 매출채권-일반 등
    empno = Column(String(20), index=True)
    emp_name = Column(String(100))
    grade = Column(String(50))
    department = Column(String(100))
    year_month = Column(String(7), index=True)  # 2026-01
    budget_hours = Column(Float, default=0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    project = relationship("Project", back_populates="budget_details")

    __table_args__ = (
        Index("ix_budget_lookup", "project_code", "empno", "budget_unit", "year_month"),
    )


class ActivityBudgetMapping(Base):
    __tablename__ = "activity_budget_mapping"

    id = Column(Integer, primary_key=True, autoincrement=True)
    activity_code_1 = Column(String(10))
    activity_name_1 = Column(String(100))
    activity_code_2 = Column(String(10))
    activity_name_2 = Column(String(100))
    activity_code_3 = Column(String(10))
    activity_name_3 = Column(String(100))
    budget_unit = Column(String(200))
    budget_category = Column(String(100))
