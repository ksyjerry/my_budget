"""Step 3 schema extensions: subcategory_name + fiscal_end (POL-03 + POL-07)

Revision ID: 007_step3_schema_extensions
Revises: 006_template_status_enum
Create Date: 2026-04-25
"""
from alembic import op
import sqlalchemy as sa


revision = "007_step3_schema_extensions"
down_revision = "006_template_status_enum"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("service_task_master",
                  sa.Column("subcategory_name", sa.String(255), nullable=True))
    op.add_column("projects",
                  sa.Column("fiscal_end", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "fiscal_end")
    op.drop_column("service_task_master", "subcategory_name")
