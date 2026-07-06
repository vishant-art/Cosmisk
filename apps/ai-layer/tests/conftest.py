"""Test config for the ai-layer.

- Adds the app dir to sys.path so `import ai_layer` resolves without an editable install.
- Repoints DATABASE_URL/MIGRATION_DATABASE_URL at the Neon TEST BRANCH (built from the
  PG*/PG*_POOL vars in the repo-root .env) for the whole session, so no test ever touches
  the prod database. `_migrate_once` (added once models+migrate exist) applies the schema;
  `db_session` gives per-test transactional rollback.
"""
import os
import sys
from pathlib import Path
from urllib.parse import quote

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai_layer import config as _config  # noqa: E402,F401  -- loads repo-root .env into os.environ


def _testbranch_url(pooled: bool) -> str:
    """Build a psycopg3 URL for the Neon TEST BRANCH from the PG* / PG*_POOL vars."""
    sfx = "_POOL" if pooled else ""
    user = quote(os.environ[f"PGUSER{sfx}"])
    pw = quote(os.environ[f"PGPASSWORD{sfx}"])
    host = os.environ[f"PGHOST{sfx}"]
    db = os.environ[f"PGDATABASE{sfx}"]
    ssl = os.environ.get(f"PGSSLMODE{sfx}", "require")
    cb = os.environ.get(f"PGCHANNELBINDING{sfx}", "require")
    return f"postgresql+psycopg://{user}:{pw}@{host}/{db}?sslmode={ssl}&channel_binding={cb}"


@pytest.fixture(scope="session", autouse=True)
def _use_test_branch():
    """Point the engine at the TEST BRANCH for the whole session; restore prod on teardown."""
    from ai_layer.db import engine as db_engine
    saved = {k: os.environ.get(k) for k in ("DATABASE_URL", "MIGRATION_DATABASE_URL")}
    os.environ["DATABASE_URL"] = _testbranch_url(pooled=True)
    os.environ["MIGRATION_DATABASE_URL"] = _testbranch_url(pooled=False)
    db_engine.reset_engine()
    yield
    db_engine.reset_engine()
    for k, v in saved.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v
