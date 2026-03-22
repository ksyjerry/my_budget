from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Date
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class Client(Base):
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, autoincrement=True)
    client_code = Column(String(20), unique=True, nullable=False, index=True)
    client_name = Column(String(200))
    industry = Column(String(100))
    asset_size = Column(String(200))
    listing_status = Column(String(100))
    business_report = Column(String(100))
    gaap = Column(String(50))
    consolidated = Column(String(50))
    subsidiary_count = Column(String(50))
    internal_control = Column(String(100))
    initial_audit = Column(String(50))
    group_code = Column(String(10))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    projects = relationship("Project", back_populates="client")


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_code = Column(String(20), unique=True, nullable=False, index=True)
    project_name = Column(String(300))
    client_id = Column(Integer, ForeignKey("clients.id"))
    el_empno = Column(String(6))
    el_name = Column(String(100))
    pm_empno = Column(String(6))
    pm_name = Column(String(100))
    qrp_empno = Column(String(6))
    qrp_name = Column(String(100))
    department = Column(String(100))

    # 시간 정보
    contract_hours = Column(Float, default=0)
    axdx_hours = Column(Float, default=0)
    qrp_hours = Column(Float, default=0)
    rm_hours = Column(Float, default=0)
    el_hours = Column(Float, default=0)
    pm_hours = Column(Float, default=0)
    ra_elpm_hours = Column(Float, default=0)
    et_controllable_budget = Column(Float, default=0)
    fulcrum_hours = Column(Float, default=0)
    ra_staff_hours = Column(Float, default=0)
    specialist_hours = Column(Float, default=0)
    travel_hours = Column(Float, default=0)
    total_budget_hours = Column(Float, default=0)
    template_status = Column(String(50))
    fiscal_start = Column(Date)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    client = relationship("Client", back_populates="projects")
    budget_details = relationship("BudgetDetail", back_populates="project")
