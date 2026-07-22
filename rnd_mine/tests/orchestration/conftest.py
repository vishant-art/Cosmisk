from __future__ import annotations
import os
import secrets
import pytest_asyncio
from creative_studio.config import asyncpg_dsn, get_settings
from creative_studio.storage import db
from creative_studio.storage.migrations_runner import _run_migrations_async

def _resolve_migration_dsn() -> str:
    # See tests/storage/test_migrations.py: MIGRATION_DATABASE_URL normally lives in
    # the repo-root .env (read internally by pydantic-settings), not os.environ,
    # but a real shell-exported var (e.g. CI) should count too.
    try:
        return get_settings().migration_database_url
    except Exception:
        return os.environ.get("MIGRATION_DATABASE_URL", "")

@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def repo_pool():
    dsn = asyncpg_dsn(_resolve_migration_dsn())
    schema = f"creative_studio_test_{secrets.token_hex(4)}"
    pool = None
    try:
        await _run_migrations_async(dsn, schema)
        pool = await db.create_pool(dsn)
        yield pool, schema
    finally:
        if pool is not None:
            await pool.close()
        conn = await db.connect(dsn)
        try:
            await conn.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
        finally:
            await conn.close()
