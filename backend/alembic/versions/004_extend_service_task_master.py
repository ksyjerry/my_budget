"""Extend service_task_master for non-audit activity import

Revision ID: 004_extend_service_task_master
Revises: 003_add_sessions_and_login_log
Create Date: 2026-04-21

Note:
  On fresh DBs the `service_task_master` table does not exist (001 omitted
  it; local dev created it via Base.metadata.create_all). If the table is
  missing when this migration runs, delegate creation to 005 and skip here.
  The guards make this migration idempotent on existing DBs too — if it
  was already applied before those guards existed, the column/index checks
  simply no-op.
"""
from alembic import op
import sqlalchemy as sa


revision = "004_extend_service_task_master"
down_revision = "003_add_sessions_and_login_log"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)

    if not insp.has_table("service_task_master"):
        # Fresh DB — 005_add_missing_tables will CREATE the table with all columns.
        return

    cols = {c["name"] for c in insp.get_columns("service_task_master")}
    if "activity_subcategory" not in cols:
        op.add_column("service_task_master", sa.Column("activity_subcategory", sa.String(200)))
    if "activity_detail" not in cols:
        op.add_column("service_task_master", sa.Column("activity_detail", sa.String(300)))
    if "budget_unit" not in cols:
        op.add_column("service_task_master", sa.Column("budget_unit", sa.String(200)))
    if "role" not in cols:
        op.add_column("service_task_master", sa.Column("role", sa.String(100)))
    if "source_file" not in cols:
        op.add_column("service_task_master", sa.Column("source_file", sa.String(200)))

    existing_indexes = {i["name"] for i in insp.get_indexes("service_task_master")}
    if "service_task_master_svc_cat_idx" not in existing_indexes:
        op.create_index(
            "service_task_master_svc_cat_idx",
            "service_task_master",
            ["service_type", "task_category"],
        )


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if not insp.has_table("service_task_master"):
        return

    existing_indexes = {i["name"] for i in insp.get_indexes("service_task_master")}
    if "service_task_master_svc_cat_idx" in existing_indexes:
        op.drop_index("service_task_master_svc_cat_idx", table_name="service_task_master")

    cols = {c["name"] for c in insp.get_columns("service_task_master")}
    for col in ("source_file", "role", "budget_unit", "activity_detail", "activity_subcategory"):
        if col in cols:
            op.drop_column("service_task_master", col)
