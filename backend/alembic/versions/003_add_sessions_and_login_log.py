"""Add sessions and login_log tables for cookie-based auth

Revision ID: 003_add_sessions_and_login_log
Revises: 002_add_clients_synced_at
Create Date: 2026-04-21
"""
from alembic import op
import sqlalchemy as sa


revision = "003_add_sessions_and_login_log"
down_revision = "002_add_clients_synced_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sessions",
        sa.Column("session_id", sa.String(64), primary_key=True),
        sa.Column("empno", sa.String(6), sa.ForeignKey("employees.empno"), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("scope", sa.String(20), nullable=False, server_default="self"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("ip", sa.String(64)),
        sa.Column("user_agent", sa.String(500)),
        sa.Column("revoked_at", sa.DateTime()),
    )
    op.create_index("sessions_empno_idx", "sessions", ["empno", "revoked_at"])
    op.create_index("sessions_expires_at_idx", "sessions", ["expires_at"])

    op.create_table(
        "login_log",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("empno", sa.String(20)),
        sa.Column("logged_in_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("ip", sa.String(64)),
        sa.Column("user_agent", sa.String(500)),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("failure_reason", sa.String(100)),
    )
    op.create_index("login_log_empno_time_idx", "login_log", ["empno", "logged_in_at"])


def downgrade() -> None:
    op.drop_index("login_log_empno_time_idx", table_name="login_log")
    op.drop_table("login_log")
    op.drop_index("sessions_expires_at_idx", table_name="sessions")
    op.drop_index("sessions_empno_idx", table_name="sessions")
    op.drop_table("sessions")
