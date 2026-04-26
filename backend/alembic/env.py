from logging.config import fileConfig
import os
from pathlib import Path
from sqlalchemy import engine_from_config, pool
from alembic import context

from app.db.base import Base
from app.models.employee import Employee, Team, Grade
from app.models.project import Client, Project
from app.models.budget import BudgetDetail, ActivityBudgetMapping
from app.models.actual import ActualDetail
from app.models.budget_master import (
    BudgetUnitMaster, PeerStatistics, PeerGroupMapping,
    ProjectMember, BudgetChangeLog,
)

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Override sqlalchemy.url from .env file DATABASE_URL if present
_env_file = Path(__file__).parent.parent / ".env"
if _env_file.exists():
    for line in _env_file.read_text().splitlines():
        if line.startswith("DATABASE_URL="):
            config.set_main_option("sqlalchemy.url", line.split("=", 1)[1].strip())
            break

target_metadata = Base.metadata


def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
