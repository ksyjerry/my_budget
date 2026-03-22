"""initial_schema

Revision ID: 001
Revises:
Create Date: 2026-03-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---------- employees ----------
    op.create_table(
        "employees",
        sa.Column("empno", sa.String(6), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("department", sa.String(100)),
        sa.Column("grade_code", sa.String(3)),
        sa.Column("grade_name", sa.String(50)),
        sa.Column("team_leader_empno", sa.String(6)),
        sa.Column("los", sa.String(100)),
        sa.Column("org_code", sa.String(10)),
        sa.Column("org_name", sa.String(100)),
        sa.Column("email", sa.String(100)),
        sa.Column("emp_status", sa.String(20)),
        sa.Column("synced_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ---------- teams ----------
    op.create_table(
        "teams",
        sa.Column("team_code", sa.String(3), primary_key=True),
        sa.Column("team_name", sa.String(100), nullable=False),
        sa.Column("synced_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ---------- grades ----------
    op.create_table(
        "grades",
        sa.Column("grade_code", sa.String(3), primary_key=True),
        sa.Column("grade_name", sa.String(50), nullable=False),
        sa.Column("synced_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ---------- clients ----------
    op.create_table(
        "clients",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("client_code", sa.String(20), unique=True, nullable=False, index=True),
        sa.Column("client_name", sa.String(200)),
        sa.Column("industry", sa.String(100)),
        sa.Column("asset_size", sa.String(200)),
        sa.Column("listing_status", sa.String(100)),
        sa.Column("business_report", sa.String(100)),
        sa.Column("gaap", sa.String(50)),
        sa.Column("consolidated", sa.String(50)),
        sa.Column("subsidiary_count", sa.String(50)),
        sa.Column("internal_control", sa.String(100)),
        sa.Column("initial_audit", sa.String(50)),
        sa.Column("group_code", sa.String(10)),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ---------- projects ----------
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("project_code", sa.String(20), unique=True, nullable=False, index=True),
        sa.Column("project_name", sa.String(300)),
        sa.Column("client_id", sa.Integer, sa.ForeignKey("clients.id")),
        sa.Column("el_empno", sa.String(6)),
        sa.Column("el_name", sa.String(100)),
        sa.Column("pm_empno", sa.String(6)),
        sa.Column("pm_name", sa.String(100)),
        sa.Column("qrp_empno", sa.String(6)),
        sa.Column("qrp_name", sa.String(100)),
        sa.Column("department", sa.String(100)),
        sa.Column("contract_hours", sa.Float, default=0),
        sa.Column("axdx_hours", sa.Float, default=0),
        sa.Column("qrp_hours", sa.Float, default=0),
        sa.Column("rm_hours", sa.Float, default=0),
        sa.Column("el_hours", sa.Float, default=0),
        sa.Column("pm_hours", sa.Float, default=0),
        sa.Column("ra_elpm_hours", sa.Float, default=0),
        sa.Column("et_controllable_budget", sa.Float, default=0),
        sa.Column("fulcrum_hours", sa.Float, default=0),
        sa.Column("ra_staff_hours", sa.Float, default=0),
        sa.Column("specialist_hours", sa.Float, default=0),
        sa.Column("travel_hours", sa.Float, default=0),
        sa.Column("total_budget_hours", sa.Float, default=0),
        sa.Column("template_status", sa.String(50)),
        sa.Column("fiscal_start", sa.Date),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ---------- budget_details ----------
    op.create_table(
        "budget_details",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("project_code", sa.String(20), sa.ForeignKey("projects.project_code"), nullable=False, index=True),
        sa.Column("budget_category", sa.String(100)),
        sa.Column("budget_unit", sa.String(200)),
        sa.Column("empno", sa.String(20), index=True),
        sa.Column("emp_name", sa.String(100)),
        sa.Column("grade", sa.String(50)),
        sa.Column("department", sa.String(100)),
        sa.Column("year_month", sa.String(7), index=True),
        sa.Column("budget_hours", sa.Float, default=0),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_budget_lookup", "budget_details", ["project_code", "empno", "budget_unit", "year_month"])

    # ---------- activity_budget_mapping ----------
    op.create_table(
        "activity_budget_mapping",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("activity_code_1", sa.String(10)),
        sa.Column("activity_name_1", sa.String(100)),
        sa.Column("activity_code_2", sa.String(10)),
        sa.Column("activity_name_2", sa.String(100)),
        sa.Column("activity_code_3", sa.String(10)),
        sa.Column("activity_name_3", sa.String(100)),
        sa.Column("budget_unit", sa.String(200)),
        sa.Column("budget_category", sa.String(100)),
    )

    # ---------- actual_details ----------
    op.create_table(
        "actual_details",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("project_code", sa.String(20), nullable=False, index=True),
        sa.Column("empno", sa.String(6), nullable=False, index=True),
        sa.Column("input_date", sa.Date, nullable=False),
        sa.Column("year_month", sa.String(7), index=True),
        sa.Column("use_time", sa.Float, default=0),
        sa.Column("activity_code_1", sa.String(10)),
        sa.Column("activity_name_1", sa.String(100)),
        sa.Column("activity_code_2", sa.String(10)),
        sa.Column("activity_name_2", sa.String(100)),
        sa.Column("activity_code_3", sa.String(10)),
        sa.Column("activity_name_3", sa.String(100)),
        sa.Column("budget_unit", sa.String(200)),
        sa.Column("synced_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_actual_lookup", "actual_details", ["project_code", "empno", "budget_unit", "year_month"])

    # ---------- budget_unit_master ----------
    op.create_table(
        "budget_unit_master",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("unit_name", sa.String(200), nullable=False),
        sa.Column("sort_order", sa.Integer, default=0),
        sa.Column("is_financial", sa.Boolean, default=False),
    )

    # ---------- peer_statistics ----------
    op.create_table(
        "peer_statistics",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("stat_group", sa.String(10), nullable=False, index=True),
        sa.Column("budget_unit", sa.String(200), nullable=False),
        sa.Column("avg_ratio", sa.Float, default=0),
    )

    # ---------- peer_group_mapping ----------
    op.create_table(
        "peer_group_mapping",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("industry", sa.String(100)),
        sa.Column("asset_size", sa.String(200)),
        sa.Column("listing_status", sa.String(100)),
        sa.Column("consolidated", sa.String(50)),
        sa.Column("internal_control", sa.String(100)),
        sa.Column("stat_group", sa.String(10), nullable=False),
    )

    # ---------- project_members ----------
    op.create_table(
        "project_members",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("project_code", sa.String(20), nullable=False, index=True),
        sa.Column("role", sa.String(50)),
        sa.Column("name", sa.String(100)),
        sa.Column("empno", sa.String(20)),
        sa.Column("activity_mapping", sa.String(100)),
        sa.Column("sort_order", sa.Integer, default=0),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ---------- budget_change_log ----------
    op.create_table(
        "budget_change_log",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("project_code", sa.String(20), nullable=False, index=True),
        sa.Column("changed_by_empno", sa.String(6)),
        sa.Column("changed_by_name", sa.String(100)),
        sa.Column("changed_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("change_type", sa.String(20)),
        sa.Column("change_summary", sa.Text),
    )


def downgrade() -> None:
    op.drop_table("budget_change_log")
    op.drop_table("project_members")
    op.drop_table("peer_group_mapping")
    op.drop_table("peer_statistics")
    op.drop_table("budget_unit_master")
    op.drop_index("ix_actual_lookup", table_name="actual_details")
    op.drop_table("actual_details")
    op.drop_table("activity_budget_mapping")
    op.drop_index("ix_budget_lookup", table_name="budget_details")
    op.drop_table("budget_details")
    op.drop_table("projects")
    op.drop_table("clients")
    op.drop_table("grades")
    op.drop_table("teams")
    op.drop_table("employees")
