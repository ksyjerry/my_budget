"""Add missing tables: service_task_master (guard), partner_access_config, tba_cache

Revision ID: 005_add_missing_tables
Revises: 004_extend_service_task_master
Create Date: 2026-04-22

Background:
  Migration 001 omitted 3 tables that later code depends on:
  - service_task_master (S1 extension in 004 ALTER-only; CREATE missing)
  - partner_access_config (Partner access scope; required by /tracking/*)
  - tba_cache (Budget Tracking cache; referenced via raw SQL only)

  Local dev DBs were created via Base.metadata.create_all(), so these
  tables exist. Fresh deploys fail because 004 ALTERs a non-existent
  table. This migration uses has_table/has_column guards so it's safe
  on both fresh and existing DBs.
"""
from alembic import op
import sqlalchemy as sa


revision = "005_add_missing_tables"
down_revision = "004_extend_service_task_master"
branch_labels = None
depends_on = None


def _has_column(insp, table: str, column: str) -> bool:
    try:
        cols = {c["name"] for c in insp.get_columns(table)}
    except Exception:
        return False
    return column in cols


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)

    # ---------- projects.service_type (model declared, migration missing) ----------
    if insp.has_table("projects") and not _has_column(insp, "projects", "service_type"):
        op.add_column(
            "projects",
            sa.Column("service_type", sa.String(20), nullable=False, server_default="AUDIT"),
        )

    # ---------- service_task_master ----------
    if not insp.has_table("service_task_master"):
        op.create_table(
            "service_task_master",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column("service_type", sa.String(20), nullable=False, index=True),
            sa.Column("task_category", sa.String(100)),
            sa.Column("task_name", sa.String(200), nullable=False),
            sa.Column("budget_unit_type", sa.String(50)),
            sa.Column("sort_order", sa.Integer, server_default="0"),
            sa.Column("description", sa.String(500)),
            sa.Column("activity_subcategory", sa.String(200)),
            sa.Column("activity_detail", sa.String(300)),
            sa.Column("budget_unit", sa.String(200)),
            sa.Column("role", sa.String(100)),
            sa.Column("source_file", sa.String(200)),
        )
        existing_indexes = set()
    else:
        existing_indexes = {i["name"] for i in insp.get_indexes("service_task_master")}

    if "service_task_master_svc_cat_idx" not in existing_indexes:
        op.create_index(
            "service_task_master_svc_cat_idx",
            "service_task_master",
            ["service_type", "task_category"],
        )

    # ---------- partner_access_config ----------
    if not insp.has_table("partner_access_config"):
        op.create_table(
            "partner_access_config",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column("empno", sa.String(20), nullable=False, unique=True),
            sa.Column("emp_name", sa.String(100)),
            sa.Column("scope", sa.String(20), nullable=False, server_default="self"),
            sa.Column("departments", sa.Text, server_default=""),
            sa.Column(
                "updated_at",
                sa.DateTime,
                server_default=sa.func.now(),
                onupdate=sa.func.now(),
            ),
        )
        op.create_index(
            "ix_partner_access_config_empno",
            "partner_access_config",
            ["empno"],
        )

    # ---------- tba_cache ----------
    if not insp.has_table("tba_cache"):
        op.create_table(
            "tba_cache",
            sa.Column("project_code", sa.String(20), primary_key=True),
            sa.Column("year_month", sa.String(6), primary_key=True),  # "YYYYMM"
            sa.Column("yearly", sa.String(20)),
            sa.Column("revenue", sa.Float, server_default="0"),
            sa.Column("budget_hours", sa.Float, server_default="0"),
            sa.Column("actual_hours", sa.Float, server_default="0"),
            sa.Column("std_cost", sa.Float, server_default="0"),
            sa.Column("em", sa.Float, server_default="0"),
            sa.Column(
                "synced_at",
                sa.DateTime,
                server_default=sa.func.now(),
                onupdate=sa.func.now(),
            ),
        )
        op.create_index("tba_cache_pc_idx", "tba_cache", ["project_code"])


def downgrade() -> None:
    op.drop_index("tba_cache_pc_idx", table_name="tba_cache")
    op.drop_table("tba_cache")
    op.drop_index("ix_partner_access_config_empno", table_name="partner_access_config")
    op.drop_table("partner_access_config")
    # service_task_master was created in 005 ONLY if missing; safest to not drop
    # since 004 assumes it exists (created via legacy create_all on local DBs).
