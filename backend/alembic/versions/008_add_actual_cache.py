"""Add actual_cache table for tracking endpoint actuals (POL-08)

Revision ID: 008_add_actual_cache
Revises: 007_step3_schema_extensions
Create Date: 2026-04-30

azure_service._save_pg_actual_cache / tracking endpoints 가 actual_cache 테이블에
TMS actuals 저장/조회. 기존 migration 들에 누락되어 fresh CI/Docker DB 에서
'relation "actual_cache" does not exist' 에러. Idempotent 추가.
"""
from alembic import op
import sqlalchemy as sa


revision = "008_add_actual_cache"
down_revision = "007_step3_schema_extensions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if insp.has_table("actual_cache"):
        return
    op.create_table(
        "actual_cache",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("project_code", sa.String(20), nullable=False, index=True),
        sa.Column("empno", sa.String(20), nullable=False, index=True),
        sa.Column("activity_code_1", sa.String(20)),
        sa.Column("activity_name_1", sa.String(200)),
        sa.Column("activity_code_2", sa.String(20)),
        sa.Column("activity_name_2", sa.String(200)),
        sa.Column("activity_code_3", sa.String(20)),
        sa.Column("activity_name_3", sa.String(200)),
        sa.Column("use_time", sa.Float, server_default="0"),
    )
    op.create_index("actual_cache_pc_emp_idx", "actual_cache", ["project_code", "empno"])


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if insp.has_table("actual_cache"):
        op.drop_index("actual_cache_pc_emp_idx", table_name="actual_cache")
        op.drop_table("actual_cache")
