"""template_status CHECK constraint for POL-04 enum

Revision ID: 006_template_status_enum
Revises: 005_add_missing_tables
Create Date: 2026-04-25
"""
from alembic import op


revision = "006_template_status_enum"
down_revision = "005_add_missing_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Backfill: rows with NULL or unrecognized values → '작성중'
    #    Also maps legacy values: 작업전 → 작성중, 진행중 → 작성중
    op.execute(
        "UPDATE projects SET template_status = '작성중' "
        "WHERE template_status IS NULL OR template_status NOT IN "
        "('작성중', '작성완료', '승인완료')"
    )
    # 2. Add CHECK constraint
    op.create_check_constraint(
        "ck_projects_template_status",
        "projects",
        "template_status IN ('작성중', '작성완료', '승인완료')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_projects_template_status", "projects", type_="check")
