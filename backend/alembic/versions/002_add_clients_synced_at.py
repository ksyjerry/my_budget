"""Add clients.synced_at column

Revision ID: 002_add_clients_synced_at
Revises: 001
Create Date: 2026-04-12
"""
from alembic import op
import sqlalchemy as sa


revision = "002_add_clients_synced_at"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "clients",
        sa.Column("synced_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("clients", "synced_at")
