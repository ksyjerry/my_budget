from sqlalchemy import Column, String, DateTime, Date
from sqlalchemy.sql import func

from app.db.base import Base


class Employee(Base):
    __tablename__ = "employees"

    empno = Column(String(6), primary_key=True)
    name = Column(String(100), nullable=False)
    department = Column(String(100))
    grade_code = Column(String(3))
    grade_name = Column(String(50))
    team_leader_empno = Column(String(6))
    los = Column(String(100))
    org_code = Column(String(10))
    org_name = Column(String(100))
    email = Column(String(100))
    emp_status = Column(String(20))
    synced_at = Column(DateTime, server_default=func.now())


class Team(Base):
    __tablename__ = "teams"

    team_code = Column(String(3), primary_key=True)
    team_name = Column(String(100), nullable=False)
    synced_at = Column(DateTime, server_default=func.now())


class Grade(Base):
    __tablename__ = "grades"

    grade_code = Column(String(3), primary_key=True)
    grade_name = Column(String(50), nullable=False)
    synced_at = Column(DateTime, server_default=func.now())
