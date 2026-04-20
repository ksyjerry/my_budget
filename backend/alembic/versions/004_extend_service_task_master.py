"""Extend service_task_master for non-audit activity import

Revision ID: 004_extend_service_task_master
Revises: 003_add_sessions_and_login_log
Create Date: 2026-04-21
"""
from alembic import op
import sqlalchemy as sa


revision = "004_extend_service_task_master"
down_revision = "003_add_sessions_and_login_log"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("service_task_master", sa.Column("activity_subcategory", sa.String(200)))
    op.add_column("service_task_master", sa.Column("activity_detail", sa.String(300)))
    op.add_column("service_task_master", sa.Column("budget_unit", sa.String(200)))
    op.add_column("service_task_master", sa.Column("role", sa.String(100)))
    op.add_column("service_task_master", sa.Column("source_file", sa.String(200)))
    op.create_index(
        "service_task_master_svc_cat_idx",
        "service_task_master",
        ["service_type", "task_category"],
    )


def downgrade() -> None:
    op.drop_index("service_task_master_svc_cat_idx", table_name="service_task_master")
    op.drop_column("service_task_master", "source_file")
    op.drop_column("service_task_master", "role")
    op.drop_column("service_task_master", "budget_unit")
    op.drop_column("service_task_master", "activity_detail")
    op.drop_column("service_task_master", "activity_subcategory")
