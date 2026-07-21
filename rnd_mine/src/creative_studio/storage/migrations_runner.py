from __future__ import annotations
import asyncio
import re
from pathlib import Path
from creative_studio.storage import db

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"
_FILENAME_RE = re.compile(r"^(\d+)_.*\.sql$")
_SCHEMA_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")

def _migration_files() -> list[tuple[int, Path]]:
    files = []
    for path in MIGRATIONS_DIR.glob("*.sql"):
        m = _FILENAME_RE.match(path.name)
        if not m:
            continue
        files.append((int(m.group(1)), path))
    return sorted(files, key=lambda item: item[0])

async def _run_migrations_async(dsn: str, schema: str = "creative_studio") -> list[int]:
    if not _SCHEMA_RE.match(schema):
        raise ValueError(f"invalid schema name: {schema!r}")
    conn = await db.connect(dsn)
    try:
        # Bootstrap: schema + version-tracking table must exist before we can
        # read/write applied versions.
        await conn.execute(
            f"CREATE SCHEMA IF NOT EXISTS {schema}; "
            f"CREATE TABLE IF NOT EXISTS {schema}.schema_migrations ("
            f"    version int primary key, "
            f"    applied_at timestamptz not null default now()"
            f");"
        )
        applied_rows = await conn.fetch(f"SELECT version FROM {schema}.schema_migrations")
        applied = {row["version"] for row in applied_rows}

        newly_applied: list[int] = []
        for version, path in _migration_files():
            if version in applied:
                continue
            sql = path.read_text(encoding="utf-8").replace("{{schema}}", schema)
            async with conn.transaction():
                await conn.execute(sql)
                await conn.execute(
                    f"INSERT INTO {schema}.schema_migrations (version) VALUES ($1)", version
                )
            newly_applied.append(version)
        return newly_applied
    finally:
        await conn.close()

def run_migrations(dsn: str, schema: str = "creative_studio") -> list[int]:
    return asyncio.run(_run_migrations_async(dsn, schema))
