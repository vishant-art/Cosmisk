"""Alembic env for the ai_layer schema. CRITICAL: the include hooks restrict
autogenerate to `ai_layer` so it NEVER emits DROP for public/drizzle (TS) tables."""
from __future__ import annotations

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool, text

# make `import ai_layer` resolve when alembic runs from apps/ai-layer
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai_layer import config as _cfg  # noqa: E402,F401  (loads repo-root .env)
from ai_layer.db.engine import SCHEMA, to_psycopg3  # noqa: E402
from ai_layer.db.migrate import include_name, include_object  # noqa: E402
from ai_layer.db.models import Base  # noqa: E402

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _url() -> str:
    # DDL uses the DIRECT (unpooled) endpoint.
    return to_psycopg3(os.environ["MIGRATION_DATABASE_URL"])


def run_migrations_offline() -> None:
    context.configure(
        url=_url(), target_metadata=target_metadata, literal_binds=True,
        include_schemas=True, version_table_schema=SCHEMA,
        include_name=include_name, include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    cfg = config.get_section(config.config_ini_section) or {}
    cfg["sqlalchemy.url"] = _url()
    connectable = engine_from_config(cfg, prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as connection:
        # the schema must exist before Alembic creates its version table in it
        connection.execute(text(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}"))
        connection.commit()
        context.configure(
            connection=connection, target_metadata=target_metadata,
            include_schemas=True, version_table_schema=SCHEMA,
            include_name=include_name, include_object=include_object,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
