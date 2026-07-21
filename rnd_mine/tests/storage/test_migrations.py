import os
import secrets
import pytest
from creative_studio.config import asyncpg_dsn, get_settings
from creative_studio.storage import db
from creative_studio.storage.migrations_runner import _run_migrations_async

def _resolve_migration_dsn() -> str:
    # MIGRATION_DATABASE_URL is normally supplied via the repo-root .env file
    # (read internally by pydantic-settings, not exported into os.environ),
    # but a real shell-exported var (e.g. in CI) should count too.
    try:
        return get_settings().migration_database_url
    except Exception:
        return os.environ.get("MIGRATION_DATABASE_URL", "")

pytestmark = pytest.mark.skipif(
    not _resolve_migration_dsn(),
    reason="MIGRATION_DATABASE_URL not set; skipping live Postgres migration test",
)

EXPECTED_TABLES = {
    "schema_migrations",
    "brand_contexts",
    "products",
    "campaigns",
    "creative_specs",
    "character_sheets",
    "shot_specs",
    "asset_manifests",
    "qa_reports",
    "generation_runs",
}

async def test_run_migrations_creates_expected_tables_and_is_idempotent():
    dsn = asyncpg_dsn(get_settings().migration_database_url)
    schema = f"creative_studio_test_{secrets.token_hex(4)}"

    conn = await db.connect(dsn)
    try:
        applied_first = await _run_migrations_async(dsn, schema)
        assert applied_first == [1]

        rows = await conn.fetch(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = $1",
            schema,
        )
        table_names = {row["table_name"] for row in rows}
        assert table_names == EXPECTED_TABLES

        applied_second = await _run_migrations_async(dsn, schema)
        assert applied_second == []
    finally:
        await conn.execute(f"DROP SCHEMA IF EXISTS {schema} CASCADE")
        await conn.close()
