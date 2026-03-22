"""Azure SQL -> PostgreSQL 동기화 서비스."""
from sqlalchemy.orm import Session
from datetime import datetime

from app.models.employee import Employee, Team, Grade
from app.models.actual import ActualDetail


def _get_azure():
    from app.db.azure_session import get_azure_connection
    return get_azure_connection()


def sync_employees(db: Session) -> int:
    """직원 마스터 동기화."""
    with _get_azure() as conn:
        cursor = conn.cursor(as_dict=True)
        cursor.execute("""
            SELECT EMPNO, EMPNM, CM_NM, GRADCD, GRADNM,
                   TL_EMPNO, LOS, ORG_CD, ORG_NM, PWC_ID, EMP_STAT
            FROM BI_STAFFREPORT_EMP_V
        """)
        rows = cursor.fetchall()

    count = 0
    for row in rows:
        emp = db.query(Employee).filter(Employee.empno == row["EMPNO"]).first()
        if not emp:
            emp = Employee(empno=row["EMPNO"])
            db.add(emp)
        emp.name = row["EMPNM"]
        emp.department = row["CM_NM"]
        emp.grade_code = row["GRADCD"]
        emp.grade_name = row["GRADNM"]
        emp.team_leader_empno = row["TL_EMPNO"]
        emp.los = row["LOS"]
        emp.org_code = row["ORG_CD"]
        emp.org_name = row["ORG_NM"]
        emp.email = row["PWC_ID"]
        emp.emp_status = row["EMP_STAT"]
        emp.synced_at = datetime.now()
        count += 1

    db.commit()
    return count


def sync_teams(db: Session) -> int:
    """팀/본부 마스터 동기화."""
    with _get_azure() as conn:
        cursor = conn.cursor(as_dict=True)
        cursor.execute("SELECT TEAMCD, TEAMNM FROM BI_STAFFREPORT_TEAM_V")
        rows = cursor.fetchall()

    count = 0
    for row in rows:
        team = db.query(Team).filter(Team.team_code == row["TEAMCD"]).first()
        if not team:
            team = Team(team_code=row["TEAMCD"])
            db.add(team)
        team.team_name = row["TEAMNM"]
        team.synced_at = datetime.now()
        count += 1

    db.commit()
    return count


def sync_actual_data(db: Session, project_codes: list[str]) -> int:
    """TMS Actual 데이터 동기화 (특정 프로젝트)."""
    if not project_codes:
        return 0

    placeholders = ",".join([f"'{pc}'" for pc in project_codes])

    with _get_azure() as conn:
        cursor = conn.cursor(as_dict=True)
        cursor.execute(f"""
            SELECT EMPNO, INPUTDATE, PRJTCD, USE_TIME,
                   FIRST_ACTIVITY_CODE, FIRST_ACTIVITY_NAME,
                   SECOND_ACTIVITY_CODE, SECOND_ACTIVITY_NAME,
                   THIRD_ACTIVITY_CODE, THIRD_ACTIVITY_NAME
            FROM BI_STAFFREPORT_TMS_V
            WHERE PRJTCD IN ({placeholders})
              AND INPUTDATE >= '2025-04-01'
        """)
        rows = cursor.fetchall()

    # 기존 데이터 삭제
    for pc in project_codes:
        db.query(ActualDetail).filter(ActualDetail.project_code == pc).delete()

    count = 0
    for row in rows:
        input_date_str = row["INPUTDATE"]
        try:
            input_date = datetime.strptime(input_date_str, "%Y-%m-%d").date()
            year_month = input_date.strftime("%Y-%m")
        except (ValueError, TypeError):
            continue

        detail = ActualDetail(
            project_code=row["PRJTCD"],
            empno=row["EMPNO"],
            input_date=input_date,
            year_month=year_month,
            use_time=float(row["USE_TIME"] or 0),
            activity_code_1=row["FIRST_ACTIVITY_CODE"],
            activity_name_1=row["FIRST_ACTIVITY_NAME"],
            activity_code_2=row["SECOND_ACTIVITY_CODE"],
            activity_name_2=row["SECOND_ACTIVITY_NAME"],
            activity_code_3=row["THIRD_ACTIVITY_CODE"],
            activity_name_3=row["THIRD_ACTIVITY_NAME"],
        )
        db.add(detail)
        count += 1

    db.commit()
    return count
