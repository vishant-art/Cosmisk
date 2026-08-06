"""Test config for the ai-layer.

- Adds the app dir to sys.path so `import ai_layer` resolves without an editable install.
- Repoints DATABASE_URL/MIGRATION_DATABASE_URL at the Neon TEST BRANCH (built from the
  PG*/PG*_POOL vars in the repo-root .env) for the whole session, so no test ever touches
  the prod database. `_migrate_once` applies the schema once; `db_session` gives per-test
  transactional rollback (every engine.get_session() joins the rolled-back transaction).
"""
import os
import sys
from pathlib import Path
from urllib.parse import quote

import pytest
from sqlalchemy.orm import sessionmaker

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
def _migrate_once():
    """Point the engine at the TEST BRANCH (built from PG*), verify reachability, and apply
    migrations once for the whole session. Prod URLs are restored on teardown."""
    from ai_layer.db import engine as db_engine
    saved = {k: os.environ.get(k) for k in ("DATABASE_URL", "MIGRATION_DATABASE_URL")}
    os.environ["DATABASE_URL"] = _testbranch_url(pooled=True)
    os.environ["MIGRATION_DATABASE_URL"] = _testbranch_url(pooled=False)
    db_engine.reset_engine()
    db_engine.preflight()
    from ai_layer.db.migrate import upgrade_head
    upgrade_head()
    yield
    db_engine.reset_engine()
    for k, v in saved.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v


@pytest.fixture
def db_session(monkeypatch):
    """A Session bound to a transaction rolled back at teardown. Every engine.get_session()
    during the test joins this transaction via SAVEPOINT, so nothing persists."""
    from ai_layer.db import engine as db_engine
    eng = db_engine.get_engine()
    conn = eng.connect()
    trans = conn.begin()
    Session = sessionmaker(bind=conn, expire_on_commit=False,
                           join_transaction_mode="create_savepoint")
    sess = Session()

    def _get_session():
        return Session()

    monkeypatch.setattr(db_engine, "get_session", _get_session)
    try:
        yield sess
    finally:
        sess.close()
        trans.rollback()
        conn.close()


@pytest.fixture(autouse=True)
def _clear_accounts_memo():
    """meta_live memoizes list_accounts for 5 minutes in a module-level dict, so
    without this one test's mocked accounts can be served to the next."""
    from ai_layer import meta_live
    meta_live._accounts_memo.clear()
    yield
    meta_live._accounts_memo.clear()
