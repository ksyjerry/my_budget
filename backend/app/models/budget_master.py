from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Text
from sqlalchemy.sql import func

from app.db.base import Base


class BudgetUnitMaster(Base):
    __tablename__ = "budget_unit_master"

    id = Column(Integer, primary_key=True, autoincrement=True)
    category = Column(String(100), nullable=False)
    unit_name = Column(String(200), nullable=False)
    sort_order = Column(Integer, default=0)
    is_financial = Column(Boolean, default=False)


class PeerStatistics(Base):
    __tablename__ = "peer_statistics"

    id = Column(Integer, primary_key=True, autoincrement=True)
    stat_group = Column(String(10), nullable=False, index=True)
    budget_unit = Column(String(200), nullable=False)
    avg_ratio = Column(Float, default=0)


class PeerGroupMapping(Base):
    __tablename__ = "peer_group_mapping"

    id = Column(Integer, primary_key=True, autoincrement=True)
    industry = Column(String(100))
    asset_size = Column(String(200))
    listing_status = Column(String(100))
    consolidated = Column(String(50))
    internal_control = Column(String(100))
    stat_group = Column(String(10), nullable=False)


class ProjectMember(Base):
    """프로젝트 ET 구성원."""
    __tablename__ = "project_members"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_code = Column(String(20), nullable=False, index=True)
    role = Column(String(50))  # FLDT 구성원, 지원 ET 구성원
    name = Column(String(100))
    empno = Column(String(20))
    grade = Column(String(20), default="")
    activity_mapping = Column(String(100))
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())


class PartnerAccessConfig(Base):
    """파트너별 데이터 접근 범위 설정."""
    __tablename__ = "partner_access_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    empno = Column(String(20), nullable=False, unique=True, index=True)
    emp_name = Column(String(100))
    scope = Column(String(20), nullable=False, default="self")  # self | departments | all
    departments = Column(Text, default="")  # comma-separated department names (for scope=departments)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class BudgetChangeLog(Base):
    __tablename__ = "budget_change_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_code = Column(String(20), nullable=False, index=True)
    changed_by_empno = Column(String(6))
    changed_by_name = Column(String(100))
    changed_at = Column(DateTime, server_default=func.now())
    change_type = Column(String(20))  # create, update, upload
    change_summary = Column(Text)
