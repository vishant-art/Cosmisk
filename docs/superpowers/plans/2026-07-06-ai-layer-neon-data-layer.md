# AI-layer Neon Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the ai-layer's facts store and LLM cost ledger from local files onto shared Neon Postgres behind a SQLAlchemy 2.0 + Alembic ORM layer, making the service stateless and brand-keyed (multi-tenant), and add durable `creative_jobs` + `brand_config` tables.

**Architecture:** A new `apps/ai-layer/ai_layer/db/` subpackage (engine, models, repository) owns all Postgres access in a dedicated `ai_layer` schema. `store.py` and `cost_ledger.py` become thin shims delegating to `repository` with their public signatures unchanged, so `api.py`/`chat.py` callers barely change. Alembic manages the schema; tests run against a Neon `test` branch with per-test transactional rollback.

**Tech Stack:** SQLAlchemy 2.0 (sync), psycopg3 (`postgresql+psycopg://`), Alembic 1.13, Neon Postgres 17, pytest.

**Design spec:** `docs/superpowers/specs/2026-07-06-ai-layer-neon-data-layer-design.md` (read it first).

## Global Constraints

- **Driver:** psycopg3 only; rewrite URLs to `postgresql+psycopg://`. Deps (exact floors): `sqlalchemy>=2.0`, `psycopg[binary]>=3.2`, `alembic>=1.13`.
- **Namespace:** dedicated `ai_layer` Postgres schema; `Base.metadata = MetaData(schema="ai_layer")`. NEVER touch `public`/`drizzle`.
- **Env split:** runtime = `DATABASE_URL` (pooled PgBouncer, `connect_args={"prepare_threshold": None}`); DDL = `MIGRATION_DATABASE_URL` (direct). Both mandatory — **no SQLite fallback**.
- **Migrations manual** (`alembic upgrade head` / `python -m ai_layer.db.migrate`) — NEVER on container boot.
- **Tenant key:** `brand_id`; repository defaults `brand_id = account_id`. Every facts/cost read filters by the resolved tenant.
- **Preserve exactly:** the public signatures of `store.init/upsert_dataset/load_dataset/ingest` and `cost_ledger.record/total_usd/cost_usd`; the `PRICING` dict; the `IngestResult` keys `{account_id, rows_upserted, since, until}`.
- **`load_dataset` contract-fidelity:** `source="store"`, `level="campaign"`; `date` returned as ISO string; `since`/`until` = `min`/`max` of returned facts (empty→`None`); `account_name` fallback `account_id`, `currency` fallback `"INR"`; `ORDER BY campaign_name, date`; empty account → `Dataset(facts=())`, never raises.
- **`record_cost`** is log-and-continue (never raises) and returns the call's own cost.
- **Robustness:** engine `pool_pre_ping=True`, `pool_recycle=300`, `pool_size=5`, `max_overflow=5`, lazy-created.
- **Isolation:** only files under `ai_layer/db/` (+ `alembic/`) import sqlalchemy/psycopg/alembic. Connectors suite (**47 tests**) stays green and untouched.
- **The 20 `CampaignDayFact` fields** (declaration order): `campaign_id, campaign_name, date, spend, impressions, reach, frequency, clicks, ctr, cpc, link_clicks, link_ctr, cost_per_link_click, cpm, add_to_cart, checkout, purchases, revenue, roas, cpa`. The 3 text/dim = `campaign_id, campaign_name, date`; the other 17 are floats.
- **Run tests** from `apps/ai-layer` with the repo venv: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests -q`.
- **No `git push`** at any point. Commits only. No AI attribution in commit messages.
- **Execution DB:** the user-provisioned Neon `test` branch, via `DATABASE_URL`/`MIGRATION_DATABASE_URL` already in the repo-root `.env`. **Before any DDL (Task 3), verify the target is the test branch, not prod** (Task 0).

---

### Task 0: Preflight — confirm the DB target and deps

**Files:** none (verification only).

- [ ] **Step 1: Confirm the two URLs resolve and point at the intended (test) branch**

Run (never prints secret values):
```bash
cd /home/anantdluffy/workspace/Cosmisk && .venv/bin/python - <<'PY'
import re
from pathlib import Path
env={}
for l in Path(".env").read_text().splitlines():
    if "=" in l and not l.strip().startswith("#"):
        k,v=l.split("=",1); env[k.strip()]=v.strip().strip('"').strip("'")
for k in ("DATABASE_URL","MIGRATION_DATABASE_URL"):
    m=re.search(r"@([^/:?]+)", env.get(k,"")); print(k,"host=",m.group(1) if m else "MISSING")
PY
```
Expected: both present. **Stop and ask the user** if the host is the known prod endpoint `ep-little-rain-akekou1s*` rather than the test branch they created.

- [ ] **Step 2: Confirm deps installed in the venv**

Run: `/home/anantdluffy/workspace/Cosmisk/.venv/bin/pip list | grep -iE 'sqlalchemy|psycopg|alembic'`
Expected: `SQLAlchemy 2.x`, `psycopg 3.x` + `psycopg-binary`, `alembic 1.x` (installed in this session; if missing, `pip install 'sqlalchemy>=2.0' 'psycopg[binary]>=3.2' 'alembic>=1.13'`).

---

### Task 1: Engine + Session factory (`db/engine.py`)

**Files:**
- Create: `apps/ai-layer/ai_layer/db/__init__.py` (empty)
- Create: `apps/ai-layer/ai_layer/db/engine.py`
- Test: `apps/ai-layer/tests/test_db_engine.py`

**Interfaces:**
- Produces: `SCHEMA="ai_layer"`, `to_psycopg3(url:str)->str`, `get_engine()->Engine`, `get_session()->Session`, `preflight(retries:int=3, delay:float=1.5)->bool`, `reset_engine()->None`.

- [ ] **Step 1: Write the failing test**
```python
# apps/ai-layer/tests/test_db_engine.py
from ai_layer.db import engine


def test_to_psycopg3_rewrites_scheme():
    assert engine.to_psycopg3("postgresql://u:p@h/db").startswith("postgresql+psycopg://")
    assert engine.to_psycopg3("postgres://u:p@h/db").startswith("postgresql+psycopg://")
    # already-qualified is left alone
    assert engine.to_psycopg3("postgresql+psycopg://x") == "postgresql+psycopg://x"


def test_to_psycopg3_requires_url():
    import pytest
    with pytest.raises(RuntimeError):
        engine.to_psycopg3("")


def test_preflight_ok_against_test_branch():
    engine.reset_engine()
    assert engine.preflight() is True
```

- [ ] **Step 2: Run to verify it fails**
Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_db_engine.py -q`
Expected: FAIL (`ModuleNotFoundError: ai_layer.db`).

- [ ] **Step 3: Implement**
```python
# apps/ai-layer/ai_layer/db/engine.py
"""SQLAlchemy engine + Session factory for the `ai_layer` Neon schema.

Runtime uses the pooled DATABASE_URL (PgBouncer) with prepared statements OFF;
migrations use the direct MIGRATION_DATABASE_URL. No SQLite fallback."""
from __future__ import annotations

import os
import time

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

SCHEMA = "ai_layer"


def to_psycopg3(url: str) -> str:
    if not url:
        raise RuntimeError("DATABASE_URL is required (ai-layer has no SQLite fallback)")
    if url.startswith("postgresql+"):
        return url
    return url.replace("postgres://", "postgresql+psycopg://", 1).replace(
        "postgresql://", "postgresql+psycopg://", 1)


_engine: Engine | None = None
_Session: sessionmaker | None = None


def get_engine() -> Engine:
    global _engine, _Session
    if _engine is None:
        url = to_psycopg3(os.environ.get("DATABASE_URL", ""))
        _engine = create_engine(
            url,
            pool_pre_ping=True,   # Neon scale-to-zero kills idle conns
            pool_recycle=300,
            pool_size=5,
            max_overflow=5,
            connect_args={
                "prepare_threshold": None,               # PgBouncer transaction pooling
                "options": f"-csearch_path={SCHEMA}",
            },
        )
        _Session = sessionmaker(bind=_engine, expire_on_commit=False)
    return _engine


def get_session() -> Session:
    get_engine()
    assert _Session is not None
    return _Session()


def preflight(retries: int = 3, delay: float = 1.5) -> bool:
    eng = get_engine()
    last: Exception | None = None
    for i in range(1, retries + 1):
        try:
            with eng.connect() as c:
                c.execute(text("SELECT 1"))
            return True
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(delay * i)
    raise RuntimeError(f"Neon preflight failed after {retries} tries: {last}")


def reset_engine() -> None:
    """Dispose the cached engine so a later call re-reads DATABASE_URL (tests)."""
    global _engine, _Session
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _Session = None
```
Also create empty `apps/ai-layer/ai_layer/db/__init__.py`.

- [ ] **Step 4: Run to verify it passes**
Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_db_engine.py -q`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/ai-layer/ai_layer/db/__init__.py apps/ai-layer/ai_layer/db/engine.py apps/ai-layer/tests/test_db_engine.py
git commit -m "feat(ai-layer): Neon SQLAlchemy engine + preflight (db/engine.py)"
```

---

### Task 2: ORM models + drift guard (`db/models.py`)

**Files:**
- Create: `apps/ai-layer/ai_layer/db/models.py`
- Test: `apps/ai-layer/tests/test_db_models.py`

**Interfaces:**
- Produces: `Base`, `Brand`, `Account`, `Fact`, `CostLedgerEntry`, `BrandConfig`, `CreativeJob`; module constant `FACT_METRIC_COLS` (the 20 CampaignDayFact field names).

- [ ] **Step 1: Write the failing test**
```python
# apps/ai-layer/tests/test_db_models.py
from dataclasses import fields

from ai_layer import meta_transform as mt
from ai_layer.db import models as m


def test_schema_is_ai_layer():
    assert m.Base.metadata.schema == "ai_layer"


def test_fact_columns_match_campaigndayfact():
    """Drift guard: Fact's metric/dim columns == the 20 CampaignDayFact fields."""
    tenant = {"brand_id", "platform", "account_id", "updated_at"}
    model_cols = {c.name for c in m.Fact.__table__.columns} - tenant
    dataclass_fields = {f.name for f in fields(mt.CampaignDayFact)}
    assert model_cols == dataclass_fields


def test_fact_primary_key():
    pk = {c.name for c in m.Fact.__table__.primary_key.columns}
    assert pk == {"brand_id", "platform", "account_id", "campaign_id", "date"}


def test_tables_present():
    names = set(m.Base.metadata.tables)  # schema-qualified
    assert {"ai_layer.brands", "ai_layer.accounts", "ai_layer.facts",
            "ai_layer.cost_ledger", "ai_layer.brand_config",
            "ai_layer.creative_jobs"} <= names
```

- [ ] **Step 2: Run to verify it fails**
Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_db_models.py -q`
Expected: FAIL (`ModuleNotFoundError`).

- [ ] **Step 3: Implement**
```python
# apps/ai-layer/ai_layer/db/models.py
"""ORM models for the `ai_layer` schema. All tables are brand_id-keyed."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import (BigInteger, Date, DateTime, Double, ForeignKey, Index,
                        Integer, MetaData, Text, func)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from ai_layer.db.engine import SCHEMA

# The 17 float metric columns (the 3 dim cols campaign_id/campaign_name/date are separate).
FACT_METRIC_COLS = [
    "spend", "impressions", "reach", "frequency", "clicks", "ctr", "cpc",
    "link_clicks", "link_ctr", "cost_per_link_click", "cpm",
    "add_to_cart", "checkout", "purchases", "revenue", "roas", "cpa",
]


class Base(DeclarativeBase):
    metadata = MetaData(schema=SCHEMA)


class Brand(Base):
    __tablename__ = "brands"
    brand_id: Mapped[str] = mapped_column(Text, primary_key=True)
    brand_name: Mapped[str | None] = mapped_column(Text)
    meta_account_id: Mapped[str | None] = mapped_column(Text)
    google_customer_id: Mapped[str | None] = mapped_column(Text)
    shopify_domain: Mapped[str | None] = mapped_column(Text)
    currency: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Account(Base):
    __tablename__ = "accounts"
    brand_id: Mapped[str] = mapped_column(Text, primary_key=True)
    platform: Mapped[str] = mapped_column(Text, primary_key=True)
    account_id: Mapped[str] = mapped_column(Text, primary_key=True)
    account_name: Mapped[str | None] = mapped_column(Text)
    currency: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Fact(Base):
    __tablename__ = "facts"
    __table_args__ = (Index("ix_facts_brand_date", "brand_id", "date"),)
    brand_id: Mapped[str] = mapped_column(Text, primary_key=True)
    platform: Mapped[str] = mapped_column(Text, primary_key=True)
    account_id: Mapped[str] = mapped_column(Text, primary_key=True)
    campaign_id: Mapped[str] = mapped_column(Text, primary_key=True)
    date: Mapped[dt.date] = mapped_column(Date, primary_key=True)
    campaign_name: Mapped[str] = mapped_column(Text, default="")
    spend: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    impressions: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    reach: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    frequency: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    clicks: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    ctr: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    cpc: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    link_clicks: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    link_ctr: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    cost_per_link_click: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    cpm: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    add_to_cart: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    checkout: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    purchases: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    revenue: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    roas: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    cpa: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CostLedgerEntry(Base):
    __tablename__ = "cost_ledger"
    __table_args__ = (Index("ix_cost_brand_created", "brand_id", "created_at"),)
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    brand_id: Mapped[str | None] = mapped_column(Text)
    account_id: Mapped[str | None] = mapped_column(Text)
    model: Mapped[str] = mapped_column(Text)
    op: Mapped[str] = mapped_column(Text)
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Double, default=0.0)
    priced: Mapped[str] = mapped_column(Text)
    cache_discount_usd: Mapped[float | None] = mapped_column(Double)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BrandConfig(Base):
    __tablename__ = "brand_config"
    brand_id: Mapped[str] = mapped_column(Text, ForeignKey("brands.brand_id"), primary_key=True)
    brand_kit_json: Mapped[dict | None] = mapped_column(JSONB)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CreativeJob(Base):
    __tablename__ = "creative_jobs"
    __table_args__ = (Index("ix_jobs_brand_created", "brand_id", "created_at"),)
    job_id: Mapped[str] = mapped_column(Text, primary_key=True)
    brand_id: Mapped[str | None] = mapped_column(Text, ForeignKey("brands.brand_id"))  # NULLABLE (brief mode)
    account_id: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str | None] = mapped_column(Text)
    stage: Mapped[str | None] = mapped_column(Text)
    request_json: Mapped[dict | None] = mapped_column(JSONB)
    brand_kit_json: Mapped[dict | None] = mapped_column(JSONB)
    assets_json: Mapped[list | None] = mapped_column(JSONB)
    video_json: Mapped[dict | None] = mapped_column(JSONB)
    winners_json: Mapped[list | None] = mapped_column(JSONB)
    rejected_json: Mapped[list | None] = mapped_column(JSONB)
    progress_json: Mapped[list | None] = mapped_column(JSONB)
    ledger_json: Mapped[dict | None] = mapped_column(JSONB)
    cost_usd: Mapped[float] = mapped_column(Double, default=0.0)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
```

- [ ] **Step 4: Run to verify it passes**
Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_db_models.py -q`
Expected: PASS (4 tests). If `test_fact_columns_match_campaigndayfact` fails, a metric column name is wrong — fix to match `CampaignDayFact`.

- [ ] **Step 5: Commit**
```bash
git add apps/ai-layer/ai_layer/db/models.py apps/ai-layer/tests/test_db_models.py
git commit -m "feat(ai-layer): ORM models for ai_layer schema + drift guard"
```

---

### Task 3: Alembic migration (schema-safe autogenerate) + migrate entrypoint

**Files:**
- Create: `apps/ai-layer/alembic.ini`, `apps/ai-layer/alembic/env.py`, `apps/ai-layer/alembic/script.py.mako`, `apps/ai-layer/alembic/versions/0001_initial.py`
- Create: `apps/ai-layer/ai_layer/db/migrate.py`
- Test: `apps/ai-layer/tests/test_db_migration.py`

**Interfaces:**
- Produces: `ai_layer.db.migrate.upgrade_head()`; a runnable `python -m ai_layer.db.migrate`.

- [ ] **Step 1: Write the failing test (the schema-filter is the critical safety net)**
```python
# apps/ai-layer/tests/test_db_migration.py
import importlib.util
from pathlib import Path

ENV = Path(__file__).resolve().parents[1] / "alembic" / "env.py"


def _load_env_module():
    spec = importlib.util.spec_from_file_location("alembic_env_under_test", ENV)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_include_name_only_ai_layer():
    env = _load_env_module()
    assert env.include_name("public", "schema", {}) is False
    assert env.include_name("drizzle", "schema", {}) is False
    assert env.include_name("ai_layer", "schema", {}) is True
    assert env.include_name("facts", "table", {"schema": "ai_layer"}) is True


def test_include_object_rejects_non_ai_layer_tables():
    env = _load_env_module()

    class T:  # minimal stand-in for a reflected Table
        def __init__(self, schema): self.schema = schema
    assert env.include_object(T("public"), "users", "table", True, None) is False
    assert env.include_object(T("ai_layer"), "facts", "table", False, None) is True
```

- [ ] **Step 2: Run to verify it fails**
Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_db_migration.py -q`
Expected: FAIL (env.py does not exist).

- [ ] **Step 3: Create the Alembic scaffolding**

`apps/ai-layer/alembic.ini` (minimal — URL comes from env.py):
```ini
[alembic]
script_location = alembic
prepend_sys_path = .
version_path_separator = os

[loggers]
keys = root
[handlers]
keys = console
[formatters]
keys = generic
[logger_root]
level = WARN
handlers = console
qualname =
[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic
[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
```

`apps/ai-layer/alembic/env.py`:
```python
"""Alembic env for the ai_layer schema. CRITICAL: the include hooks restrict
autogenerate to `ai_layer` so it NEVER emits DROP for public/drizzle (TS) tables."""
from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# make `import ai_layer` resolve when alembic runs from apps/ai-layer
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai_layer import config as _cfg  # noqa: F401  (loads repo-root .env)
from ai_layer.db.engine import SCHEMA, to_psycopg3
from ai_layer.db.models import Base

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _url() -> str:
    # DDL uses the DIRECT (unpooled) endpoint.
    return to_psycopg3(os.environ["MIGRATION_DATABASE_URL"])


def include_name(name, type_, parent_names):
    if type_ == "schema":
        return name == SCHEMA
    return True


def include_object(obj, name, type_, reflected, compare_to):
    if type_ == "table":
        return getattr(obj, "schema", None) == SCHEMA
    return True


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
```

`apps/ai-layer/alembic/script.py.mako` (standard Alembic template):
```mako
"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}
"""
from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

revision = ${repr(up_revision)}
down_revision = ${repr(down_revision)}
branch_labels = ${repr(branch_labels)}
depends_on = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
```

- [ ] **Step 4: Autogenerate the initial revision, then hand-edit it**

Run:
```bash
cd apps/ai-layer && ../../.venv/bin/python -m alembic revision --autogenerate -m "initial ai_layer schema" --rev-id 0001
```
Open the generated `alembic/versions/0001_initial.py` and verify **every** `op.create_table`/`op.create_index` carries `schema='ai_layer'` and there are **no** `op.drop_table` calls (proves the include filter works). Then make two manual edits:
- As the FIRST line of `upgrade()`: `op.execute("CREATE SCHEMA IF NOT EXISTS ai_layer")`
- As the ONLY line of `downgrade()`: `op.execute("DROP SCHEMA IF EXISTS ai_layer CASCADE")` (delete the autogenerated per-table drops).

Guard check (must print nothing):
```bash
grep -n "schema='public'\|schema=\"public\"\|drizzle" apps/ai-layer/alembic/versions/0001_initial.py || echo "CLEAN"
```
Expected: `CLEAN`.

- [ ] **Step 5: Create the migrate entrypoint**
```python
# apps/ai-layer/ai_layer/db/migrate.py
"""Apply Alembic migrations. Run: `python -m ai_layer.db.migrate` (uses
MIGRATION_DATABASE_URL). NOT invoked on container boot — deploy/demo runs it once."""
from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config


def upgrade_head() -> None:
    root = Path(__file__).resolve().parents[2]  # apps/ai-layer
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("script_location", str(root / "alembic"))
    command.upgrade(cfg, "head")


if __name__ == "__main__":
    upgrade_head()
    print("ai_layer migrations applied (head).")
```

- [ ] **Step 6: Apply to the test branch and verify tables + public untouched**
```bash
cd apps/ai-layer && ../../.venv/bin/python -m ai_layer.db.migrate
../../.venv/bin/python - <<'PY'
import os, re, psycopg
from pathlib import Path
env={}
for l in Path("../../.env").read_text().splitlines():
    if "=" in l and not l.strip().startswith("#"):
        k,v=l.split("=",1); env[k.strip()]=v.strip().strip('"').strip("'")
with psycopg.connect(env["MIGRATION_DATABASE_URL"]) as c, c.cursor() as cur:
    cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='ai_layer' ORDER BY 1")
    print("ai_layer:", [r[0] for r in cur.fetchall()])
    cur.execute("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
    print("public tables:", cur.fetchone()[0])
PY
```
Expected: `ai_layer:` lists `accounts, alembic_version, brand_config, brands, cost_ledger, creative_jobs, facts`; `public tables:` unchanged (80 on a branch copied from prod).

- [ ] **Step 7: Run the unit test to verify it passes**
Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_db_migration.py -q`
Expected: PASS.

- [ ] **Step 8: Commit**
```bash
git add apps/ai-layer/alembic.ini apps/ai-layer/alembic/ apps/ai-layer/ai_layer/db/migrate.py apps/ai-layer/tests/test_db_migration.py
git commit -m "feat(ai-layer): Alembic migration for ai_layer schema (schema-scoped autogenerate)"
```

---

### Task 4: DB test harness (`conftest.py` fixtures)

**Files:**
- Modify: `apps/ai-layer/tests/conftest.py`
- Test: `apps/ai-layer/tests/test_db_harness.py`

**Interfaces:**
- Produces: pytest fixtures `db_session` (per-test, transaction rolled back at teardown) and an autouse `_migrate_once` (session-scoped: preflight + `upgrade_head` once). Repository/shim code calls `engine.get_session()`, which the harness binds to the rolled-back transaction so tests never persist.

Design note: bind `sessionmaker` to a single connection+transaction per test and monkeypatch `engine.get_session` to return sessions joined to it (SQLAlchemy "join an external transaction" pattern via `join_transaction_mode="create_savepoint"`), so every `engine.get_session()` in repository code participates and rolls back. Repository code MUST call `engine.get_session()` module-qualified (Task 5 note) for the patch to bind. FastAPI's `TestClient` runs sync endpoints in an anyio threadpool, so the endpoint executes in a different thread than the test — the monkeypatched `engine.get_session` is a process-global module attribute so it is visible there, and requests are sequential (the test blocks on the response) so the single bound connection is never used concurrently. If a "connection used in two threads" error ever appears, switch the harness to a `scoped_session`.

- [ ] **Step 1: Write the failing test**
```python
# apps/ai-layer/tests/test_db_harness.py
from sqlalchemy import select

from ai_layer.db import models as m


def test_rows_do_not_leak_between_tests_write(db_session):
    db_session.add(m.Brand(brand_id="harness_probe", brand_name="x"))
    db_session.flush()
    assert db_session.execute(
        select(m.Brand).where(m.Brand.brand_id == "harness_probe")).scalar_one()


def test_rows_do_not_leak_between_tests_check(db_session):
    # the previous test's write was rolled back
    assert db_session.execute(
        select(m.Brand).where(m.Brand.brand_id == "harness_probe")).scalar_one_or_none() is None
```

- [ ] **Step 2: Run to verify it fails**
Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_db_harness.py -q`
Expected: FAIL (`fixture 'db_session' not found`).

- [ ] **Step 3: Implement — extend `conftest.py`** (keep the existing `sys.path` line)
```python
# apps/ai-layer/tests/conftest.py  (append below the existing sys.path insert)
import pytest
from sqlalchemy import event

from ai_layer.db import engine as db_engine


@pytest.fixture(scope="session", autouse=True)
def _migrate_once():
    """Point the engine at the test branch (env already set), verify reachability,
    and apply migrations once for the whole test session."""
    db_engine.reset_engine()
    db_engine.preflight()
    from ai_layer.db.migrate import upgrade_head
    upgrade_head()
    yield
    db_engine.reset_engine()


@pytest.fixture
def db_session(monkeypatch):
    """A Session bound to a transaction that is rolled back at teardown. Every
    engine.get_session() during the test joins this transaction (SAVEPOINT restart)."""
    eng = db_engine.get_engine()
    conn = eng.connect()
    trans = conn.begin()
    Session = __import__("sqlalchemy.orm", fromlist=["sessionmaker"]).sessionmaker(
        bind=conn, expire_on_commit=False, join_transaction_mode="create_savepoint")
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
```

- [ ] **Step 4: Run to verify it passes**
Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_db_harness.py -q`
Expected: PASS (2 tests) — proving isolation + rollback.

- [ ] **Step 5: Commit**
```bash
git add apps/ai-layer/tests/conftest.py apps/ai-layer/tests/test_db_harness.py
git commit -m "test(ai-layer): Neon test-branch harness (migrate-once + per-test rollback)"
```

---

### Task 5: Repository — facts (`db/repository.py`)

**Files:**
- Create: `apps/ai-layer/ai_layer/db/repository.py`
- Test: `apps/ai-layer/tests/test_repository_facts.py`

**Interfaces:**
- Consumes: `models`, `engine.get_session`, `mt.CampaignDayFact`/`mt.Dataset`.
- Produces: `upsert_dataset(ds, brand_id=None)->int`, `load_dataset(account_id, since=None, until=None, brand_id=None)->mt.Dataset`.

- [ ] **Step 1: Write the failing test**
```python
# apps/ai-layer/tests/test_repository_facts.py
from ai_layer import meta_transform as mt
from ai_layer.db import repository as repo


def _ds(rows, account_id="act_1", name="Acme", currency="INR"):
    return mt.normalize({"meta": {"account_id": account_id, "account_name": name,
                                  "currency": currency}, "data": rows})


def _raw(name, date, spend, purch, rev):
    return dict(campaign_id=name, campaign_name=name, date_start=date, date_stop=date,
                spend=str(spend), impressions="1000", reach="800", frequency="1.5",
                clicks="50", ctr="5", cpc="2", cpm="100", inline_link_clicks="40",
                actions=[{"action_type": "offsite_conversion.fb_pixel_purchase", "value": str(purch)}],
                action_values=[{"action_type": "offsite_conversion.fb_pixel_purchase", "value": str(rev)}],
                purchase_roas=[])


def test_roundtrip(db_session):
    n = repo.upsert_dataset(_ds([_raw("A", "2026-05-01", 100, 2, 300),
                                 _raw("B", "2026-05-01", 50, 1, 100)]))
    assert n == 2
    back = repo.load_dataset("act_1")
    assert len(back) == 2 and back.account_name == "Acme" and back.currency == "INR"
    assert back.source == "store" and back.level == "campaign"
    df = back.to_dataframe()
    assert df.spend.sum() == 150 and df.revenue.sum() == 400


def test_upsert_overwrites_not_duplicates(db_session):
    repo.upsert_dataset(_ds([_raw("A", "2026-05-01", 100, 2, 300)]))
    repo.upsert_dataset(_ds([_raw("A", "2026-05-01", 100, 5, 999)]))
    back = repo.load_dataset("act_1")
    assert len(back) == 1 and back.to_dataframe().revenue.sum() == 999


def test_since_until_derived_and_date_is_iso(db_session):
    repo.upsert_dataset(_ds([_raw("A", "2026-05-01", 1, 0, 0),
                             _raw("A", "2026-05-03", 1, 0, 0)]))
    back = repo.load_dataset("act_1")
    assert back.since == "2026-05-01" and back.until == "2026-05-03"
    assert all(isinstance(f.date, str) for f in back.facts)


def test_empty_account_returns_empty_dataset(db_session):
    back = repo.load_dataset("act_missing")
    assert len(back) == 0 and back.facts == ()
    assert back.since is None and back.currency == "INR" and back.account_name == "act_missing"
```

- [ ] **Step 2: Run to verify it fails**
Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_repository_facts.py -q`
Expected: FAIL (`ModuleNotFoundError: ai_layer.db.repository`).

- [ ] **Step 3: Implement**
```python
# apps/ai-layer/ai_layer/db/repository.py
"""Postgres repository backing store.py + cost_ledger.py. All access goes through
engine.get_session(). brand_id defaults to account_id (single-tenant shortcut)."""
from __future__ import annotations

import datetime as dt
import logging
from dataclasses import fields

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from ai_layer import meta_transform as mt
from ai_layer.db import engine, models as m

log = logging.getLogger("ai_layer.db.repository")

# NOTE: call engine.get_session() module-qualified (NOT `from ... import get_session`)
# so the test harness's monkeypatch of engine.get_session takes effect here.

_FACT_COLS = [f.name for f in fields(mt.CampaignDayFact)]          # 20, incl. date (str)
_FACT_UPDATE = [c for c in _FACT_COLS if c not in ("campaign_id", "date")]


def _brand(brand_id: str | None, account_id: str) -> str:
    return brand_id or account_id


def upsert_dataset(ds: mt.Dataset, brand_id: str | None = None) -> int:
    bid = _brand(brand_id, ds.account_id)
    with engine.get_session() as s:
        s.execute(pg_insert(m.Brand).values(
            brand_id=bid, brand_name=ds.account_name,
            meta_account_id=ds.account_id, currency=ds.currency
        ).on_conflict_do_update(
            index_elements=[m.Brand.brand_id],
            set_={"brand_name": ds.account_name, "currency": ds.currency, "updated_at": func.now()}))
        s.execute(pg_insert(m.Account).values(
            brand_id=bid, platform="meta", account_id=ds.account_id,
            account_name=ds.account_name, currency=ds.currency
        ).on_conflict_do_update(
            index_elements=[m.Account.brand_id, m.Account.platform, m.Account.account_id],
            set_={"account_name": ds.account_name, "currency": ds.currency, "updated_at": func.now()}))
        rows = []
        for f in ds.facts:
            d = {k: getattr(f, k) for k in _FACT_COLS}
            d["date"] = dt.date.fromisoformat(d["date"])
            d.update(brand_id=bid, platform="meta", account_id=ds.account_id)
            rows.append(d)
        if rows:
            stmt = pg_insert(m.Fact).values(rows)
            set_ = {c: getattr(stmt.excluded, c) for c in _FACT_UPDATE}
            set_["updated_at"] = func.now()
            stmt = stmt.on_conflict_do_update(
                index_elements=[m.Fact.brand_id, m.Fact.platform, m.Fact.account_id,
                                m.Fact.campaign_id, m.Fact.date],
                set_=set_)
            s.execute(stmt)
        s.commit()
    return len(ds.facts)


def load_dataset(account_id: str, since: str | None = None,
                 until: str | None = None, brand_id: str | None = None) -> mt.Dataset:
    bid = _brand(brand_id, account_id)
    with engine.get_session() as s:
        acc = s.execute(select(m.Account).where(
            m.Account.brand_id == bid, m.Account.platform == "meta",
            m.Account.account_id == account_id)).scalar_one_or_none()
        q = select(m.Fact).where(m.Fact.brand_id == bid, m.Fact.account_id == account_id)
        if since:
            q = q.where(m.Fact.date >= dt.date.fromisoformat(since))
        if until:
            q = q.where(m.Fact.date <= dt.date.fromisoformat(until))
        q = q.order_by(m.Fact.campaign_name, m.Fact.date)
        rows = list(s.execute(q).scalars().all())
    facts = tuple(
        mt.CampaignDayFact(**{**{k: getattr(r, k) for k in _FACT_COLS if k != "date"},
                              "date": r.date.isoformat()})
        for r in rows)
    dates = [f.date for f in facts]
    return mt.Dataset(
        account_id=account_id,
        account_name=acc.account_name if acc else account_id,
        currency=(acc.currency if acc else None) or "INR",
        since=min(dates) if dates else None,
        until=max(dates) if dates else None,
        level="campaign", source="store", facts=facts)
```

- [ ] **Step 4: Run to verify it passes**
Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_repository_facts.py -q`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/ai-layer/ai_layer/db/repository.py apps/ai-layer/tests/test_repository_facts.py
git commit -m "feat(ai-layer): repository facts upsert/load (batched, contract-faithful)"
```

---

### Task 6: Repository — cost ledger (guarded, scoped)

**Files:**
- Modify: `apps/ai-layer/ai_layer/db/repository.py`
- Test: `apps/ai-layer/tests/test_repository_cost.py`

**Interfaces:**
- Consumes: `cost_ledger.cost_usd` (lazy import, avoids cycle).
- Produces: `record_cost(model, prompt_tokens, completion_tokens, op="chat", account=None, cost_usd_actual=None, cache_discount_usd=None, brand_id=None)->float`; `total_usd(account=None, brand_id=None)->float`.

- [ ] **Step 1: Write the failing test**
```python
# apps/ai-layer/tests/test_repository_cost.py
import pytest

from ai_layer.db import repository as repo


def test_estimate_used_when_no_actual(db_session):
    c = repo.record_cost("google/gemini-2.5-flash", 1_000_000, 0, account="act_1")
    assert c == pytest.approx(0.30)
    assert repo.total_usd(account="act_1") == pytest.approx(0.30)


def test_actual_cost_recorded_and_scoped(db_session):
    repo.record_cost("google/gemini-2.5-flash", 0, 0, account="a", cost_usd_actual=0.01)
    repo.record_cost("google/gemini-2.5-flash", 0, 0, account="b", cost_usd_actual=0.05)
    assert repo.total_usd(account="a") == pytest.approx(0.01)   # scoped, no cross-tenant sum
    assert repo.total_usd(account="b") == pytest.approx(0.05)


def test_record_cost_never_raises_on_write_failure(db_session, monkeypatch):
    from ai_layer.db import engine as db_engine

    def boom():
        raise RuntimeError("db down")
    monkeypatch.setattr(db_engine, "get_session", boom)
    # must NOT raise, must still return the computed cost
    c = repo.record_cost("google/gemini-2.5-flash", 1_000_000, 0, account="x")
    assert c == pytest.approx(0.30)
```

- [ ] **Step 2: Run to verify it fails**
Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_repository_cost.py -q`
Expected: FAIL (`AttributeError: module ... has no attribute 'record_cost'`).

- [ ] **Step 3: Implement — append to `repository.py`**
```python
def record_cost(model: str, prompt_tokens: int, completion_tokens: int,
                op: str = "chat", account: str | None = None,
                cost_usd_actual: float | None = None,
                cache_discount_usd: float | None = None,
                brand_id: str | None = None) -> float:
    from ai_layer.cost_ledger import cost_usd as _estimate  # lazy: avoids import cycle
    pt, ct = int(prompt_tokens or 0), int(completion_tokens or 0)
    if cost_usd_actual is not None:
        c, priced = float(cost_usd_actual), "openrouter"
    else:
        c, priced = _estimate(model, pt, ct), "estimated"
    try:
        with engine.get_session() as s:
            s.add(m.CostLedgerEntry(
                brand_id=brand_id or account, account_id=account, model=model, op=op,
                prompt_tokens=pt, completion_tokens=ct, cost_usd=round(c, 6), priced=priced,
                cache_discount_usd=(round(float(cache_discount_usd), 6)
                                    if cache_discount_usd is not None else None)))
            s.commit()
    except Exception:  # noqa: BLE001 -- cost accounting must never fail the primary op
        log.exception("cost_ledger write failed (continuing)")
    return c


def total_usd(account: str | None = None, brand_id: str | None = None) -> float:
    with engine.get_session() as s:
        q = select(func.coalesce(func.sum(m.CostLedgerEntry.cost_usd), 0.0))
        if brand_id is not None:
            q = q.where(m.CostLedgerEntry.brand_id == brand_id)
        if account is not None:
            q = q.where(m.CostLedgerEntry.account_id == account)
        return round(float(s.execute(q).scalar_one()), 6)
```

- [ ] **Step 4: Run to verify it passes**
Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_repository_cost.py -q`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/ai-layer/ai_layer/db/repository.py apps/ai-layer/tests/test_repository_cost.py
git commit -m "feat(ai-layer): repository cost ledger (guarded record_cost + scoped total_usd)"
```

---

### Task 7: Repository — brand_config + creative_jobs seam

**Files:**
- Modify: `apps/ai-layer/ai_layer/db/repository.py`
- Test: `apps/ai-layer/tests/test_repository_creative.py`

**Interfaces:**
- Produces: `get_brand_config(brand_id)->dict|None`, `upsert_brand_config(brand_id, brand_kit)->None`, `save_job(job:dict, brand_id=None)->None`, `load_job(job_id, brand_id=None)->dict|None`, `list_jobs(brand_id, limit=50)->list[dict]`.
- Job dict shape mirrors `_JOBS` (service.py:136): `{job_id, status, stage, progress, run_id, assets, video, brand_kit, winners, cost_usd, rejected, error}` plus optional `account_id`, `request`, `ledger`.

- [ ] **Step 1: Write the failing test**
```python
# apps/ai-layer/tests/test_repository_creative.py
from ai_layer.db import repository as repo


def test_brand_config_roundtrip(db_session):
    repo.upsert_dataset  # ensure module import
    kit = {"brand_name": "Acme", "palette": [{"role": "primary", "hex": "#112233"}]}
    repo.upsert_brand_config("act_1", kit)
    assert repo.get_brand_config("act_1") == kit
    repo.upsert_brand_config("act_1", {"brand_name": "Acme2"})
    assert repo.get_brand_config("act_1")["brand_name"] == "Acme2"
    assert repo.get_brand_config("nope") is None


def test_save_and_load_job_account_mode(db_session):
    job = {"job_id": "j1", "status": "complete", "stage": "Done", "progress": ["a", "b"],
           "run_id": "j1", "assets": [{"fmt": "1:1", "url": "/x.png"}], "video": None,
           "brand_kit": {"brand_name": "Acme"}, "winners": [], "cost_usd": 1.23,
           "rejected": [], "error": None, "account_id": "act_1"}
    repo.save_job(job)  # brand_id defaults to account_id
    back = repo.load_job("j1")
    assert back["status"] == "complete" and back["cost_usd"] == 1.23
    assert back["assets"] == [{"fmt": "1:1", "url": "/x.png"}]
    assert back["brand_kit"] == {"brand_name": "Acme"}
    # brand-scoped read
    assert repo.load_job("j1", brand_id="act_1")["job_id"] == "j1"
    assert repo.load_job("j1", brand_id="other") is None


def test_save_job_brief_mode_nullable_brand(db_session):
    repo.save_job({"job_id": "brief1", "status": "queued", "progress": [],
                   "assets": [], "winners": [], "rejected": [], "cost_usd": 0.0})
    assert repo.load_job("brief1")["status"] == "queued"  # no brand_id, no crash
```

- [ ] **Step 2: Run to verify it fails**
Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_repository_creative.py -q`
Expected: FAIL (`AttributeError: ... 'upsert_brand_config'`).

- [ ] **Step 3: Implement — append to `repository.py`**
```python
def get_brand_config(brand_id: str) -> dict | None:
    with engine.get_session() as s:
        row = s.get(m.BrandConfig, brand_id)
        return dict(row.brand_kit_json) if row and row.brand_kit_json else None


def upsert_brand_config(brand_id: str, brand_kit: dict) -> None:
    with engine.get_session() as s:
        s.execute(pg_insert(m.BrandConfig).values(brand_id=brand_id, brand_kit_json=brand_kit)
                  .on_conflict_do_update(index_elements=[m.BrandConfig.brand_id],
                                         set_={"brand_kit_json": brand_kit, "updated_at": func.now()}))
        s.commit()


# _JOBS dict key  ->  creative_jobs column
_JOB_MAP = {"progress": "progress_json", "assets": "assets_json", "video": "video_json",
            "brand_kit": "brand_kit_json", "winners": "winners_json",
            "rejected": "rejected_json", "request": "request_json", "ledger": "ledger_json"}
_JOB_DIRECT = ("status", "stage", "cost_usd", "error", "account_id")


def _job_to_columns(job: dict, brand_id: str | None) -> dict:
    bid = brand_id or job.get("brand_id") or job.get("account_id")
    cols: dict = {"job_id": job["job_id"], "brand_id": bid}
    for k in _JOB_DIRECT:
        if k in job:
            cols[k] = job[k]
    for src, col in _JOB_MAP.items():
        if src in job:
            cols[col] = job[src]
    return cols


def _columns_to_job(row: m.CreativeJob) -> dict:
    out = {"job_id": row.job_id, "status": row.status, "stage": row.stage,
           "run_id": row.job_id, "cost_usd": row.cost_usd, "error": row.error,
           "account_id": row.account_id, "brand_id": row.brand_id,
           "progress": row.progress_json or [], "assets": row.assets_json or [],
           "video": row.video_json, "brand_kit": row.brand_kit_json,
           "winners": row.winners_json or [], "rejected": row.rejected_json or [],
           "request": row.request_json, "ledger": row.ledger_json}
    return out


def save_job(job: dict, brand_id: str | None = None) -> None:
    cols = _job_to_columns(job, brand_id)
    upd = {k: v for k, v in cols.items() if k != "job_id"}
    upd["updated_at"] = func.now()
    with engine.get_session() as s:
        s.execute(pg_insert(m.CreativeJob).values(**cols)
                  .on_conflict_do_update(index_elements=[m.CreativeJob.job_id], set_=upd))
        s.commit()


def load_job(job_id: str, brand_id: str | None = None) -> dict | None:
    with engine.get_session() as s:
        row = s.get(m.CreativeJob, job_id)
        if row is None or (brand_id is not None and row.brand_id != brand_id):
            return None
        return _columns_to_job(row)


def list_jobs(brand_id: str, limit: int = 50) -> list[dict]:
    with engine.get_session() as s:
        rows = s.execute(select(m.CreativeJob)
                         .where(m.CreativeJob.brand_id == brand_id)
                         .order_by(m.CreativeJob.created_at.desc()).limit(limit)).scalars().all()
        return [_columns_to_job(r) for r in rows]
```

- [ ] **Step 4: Run to verify it passes**
Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_repository_creative.py -q`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/ai-layer/ai_layer/db/repository.py apps/ai-layer/tests/test_repository_creative.py
git commit -m "feat(ai-layer): repository brand_config + creative_jobs seam (save/load_job)"
```

---

### Task 8: Rewire `store.py` + `cost_ledger.py` as thin shims

**Files:**
- Modify: `apps/ai-layer/ai_layer/store.py`
- Modify: `apps/ai-layer/ai_layer/cost_ledger.py`
- Modify: `apps/ai-layer/tests/test_store.py`, `apps/ai-layer/tests/test_cost_ledger.py`

**Interfaces:**
- `store.init()` no-op (schema owned by Alembic); `store.upsert_dataset(ds)->int`, `store.load_dataset(...)->mt.Dataset`, `store.ingest(...)->dict` delegate to `repository`.
- `cost_ledger.record(...)->float`, `cost_ledger.total_usd(account=None)->float` delegate; `cost_usd`/`PRICING` stay.

- [ ] **Step 1: Update the existing behavioral tests to use the DB harness**

In `apps/ai-layer/tests/test_store.py`, replace the `temp_db` autouse fixture with the harness — change:
```python
@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "STORE_DB_PATH", tmp_path / "store.sqlite")
    yield
```
to:
```python
@pytest.fixture(autouse=True)
def _use_db(db_session):
    yield
```
(remove the now-unused `config` import if it is unused). Do the same in `apps/ai-layer/tests/test_cost_ledger.py`, replacing the `temp_ledger` fixture with `_use_db(db_session)`, and change `_entries()` to read rows from the DB:
```python
def _entries():
    from sqlalchemy import select
    from ai_layer.db import models as m, engine
    with engine.get_session() as s:
        return [{"model": r.model, "op": r.op, "account": r.account_id,
                 "cost_usd": r.cost_usd, "priced": r.priced,
                 "cache_discount_usd": r.cache_discount_usd}
                for r in s.execute(select(m.CostLedgerEntry)).scalars().all()]
```
(the `cache_discount_usd` assertion in `test_actual_cost_recorded_verbatim` still holds: the column is populated).

- [ ] **Step 2: Run to verify they fail (shims not wired yet)**
Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_store.py tests/test_cost_ledger.py -q`
Expected: FAIL (store/cost_ledger still hit SQLite/JSONL, not the harness DB).

- [ ] **Step 3: Rewire `store.py`** — replace the SQLite internals (keep the module docstring updated to say Neon):
```python
"""Facts store — thin shim delegating to the Neon repository (ai_layer schema).
Public signatures unchanged; SQLite is retired (see the #29 design spec)."""
from __future__ import annotations

from ai_layer import meta_live as ml
from ai_layer import meta_transform as mt
from ai_layer.db import repository as _repo


def init() -> None:
    """No-op: the schema is owned by Alembic (python -m ai_layer.db.migrate)."""


def upsert_dataset(ds: mt.Dataset) -> int:
    return _repo.upsert_dataset(ds)


def load_dataset(account_id: str, since: str | None = None, until: str | None = None) -> mt.Dataset:
    return _repo.load_dataset(account_id, since=since, until=until)


def ingest(token: str, account: str, preset: str = "last_30d", level: str = "campaign") -> dict:
    ds = ml.fetch_dataset(token, account=account, preset=preset, level=level)
    n = upsert_dataset(ds)
    return {"account_id": account, "rows_upserted": n, "since": ds.since, "until": ds.until}
```

- [ ] **Step 4: Rewire `cost_ledger.py`** — keep `PRICING` + `cost_usd`, delegate `record`/`total_usd`:
```python
"""Python-side LLM cost ledger — thin shim over the Neon repository. `PRICING` +
`cost_usd` stay here (the estimate source); record/total delegate to the DB."""
from __future__ import annotations

PRICING: dict[str, tuple[float, float]] = {
    "google/gemini-2.5-flash":      (0.30, 2.50),
    "google/gemini-2.5-flash-lite": (0.10, 0.40),
    "openai/gpt-5-nano":            (0.05, 0.40),
    "openai/gpt-5-mini":            (0.25, 2.00),
    "anthropic/claude-haiku-4.5":   (1.00, 5.00),
}


def cost_usd(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    pin, pout = PRICING.get(model, (0.0, 0.0))
    return prompt_tokens / 1e6 * pin + completion_tokens / 1e6 * pout


def record(model: str, prompt_tokens: int, completion_tokens: int,
           op: str = "chat", account: str | None = None,
           cost_usd_actual: float | None = None,
           cache_discount_usd: float | None = None) -> float:
    from ai_layer.db import repository as _repo  # lazy: avoids import cycle
    return _repo.record_cost(model, prompt_tokens, completion_tokens, op=op, account=account,
                             cost_usd_actual=cost_usd_actual, cache_discount_usd=cache_discount_usd)


def total_usd(account: str | None = None) -> float:
    from ai_layer.db import repository as _repo
    return _repo.total_usd(account=account)
```

- [ ] **Step 5: Run to verify they pass**
Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_store.py tests/test_cost_ledger.py -q`
Expected: PASS (all existing store + cost_ledger tests, now against Neon).

- [ ] **Step 6: Commit**
```bash
git add apps/ai-layer/ai_layer/store.py apps/ai-layer/ai_layer/cost_ledger.py apps/ai-layer/tests/test_store.py apps/ai-layer/tests/test_cost_ledger.py
git commit -m "refactor(ai-layer): store.py + cost_ledger.py delegate to Neon repository"
```

---

### Task 9: API — /cost scoping, per-call cost from return value, X-Brand-Id threading

**Files:**
- Modify: `apps/ai-layer/ai_layer/chat.py` (`_record_cost`, `complete`, `raw_complete`, REPL `main`)
- Modify: `apps/ai-layer/ai_layer/api.py` (`caller_brand` dep, `_dataset`, chat/complete/ingest/cost/blended routes)
- Modify: `apps/ai-layer/tests/test_api.py` (harness + cost-return + /cost scoping)

**Interfaces:**
- `chat.complete(client, messages, stream=False, account=None) -> tuple[str, float]` (text, cost).
- `chat.raw_complete(...) -> tuple[str, float]`.
- `_record_cost(usage, account=None, op="chat") -> float` (returns cost, 0.0 if no usage).
- New FastAPI dep `caller_brand(x_brand_id: str | None = Header(None)) -> str | None`.

- [ ] **Step 1: Write the failing tests**
```python
# add to apps/ai-layer/tests/test_api.py
def test_cost_endpoint_requires_scope(client, monkeypatch):
    from ai_layer import config
    monkeypatch.setattr(config, "AI_LAYER_API_KEY", None)
    r = client.get("/cost")            # no account_id
    assert r.status_code == 400
    r2 = client.get("/cost?account_id=act_1")
    assert r2.status_code == 200


def test_chat_cost_from_return_not_delta(client, monkeypatch):
    from ai_layer import config, chat, meta_transform as mt
    from ai_layer.db import repository as repo
    monkeypatch.setattr(config, "AI_LAYER_API_KEY", None)
    monkeypatch.setattr(config, "OPENROUTER_API_KEY", "test-key")
    # seed one stored fact so _dataset uses the store (avoids the live-fetch branch)
    ds = mt.normalize({"meta": {"account_id": "act_1", "account_name": "Acme", "currency": "INR"},
                       "data": [dict(campaign_id="A", campaign_name="A", date_start="2026-05-01",
                                     date_stop="2026-05-01", spend="10", impressions="1", reach="1",
                                     frequency="1", clicks="1", ctr="1", cpc="1", cpm="1",
                                     inline_link_clicks="1", actions=[], action_values=[], purchase_roas=[])]})
    repo.upsert_dataset(ds)
    monkeypatch.setattr(chat, "complete", lambda *a, **k: ("canned", 0.0042))
    # a concurrent ledger write must NOT inflate this call's reported cost
    repo.record_cost("google/gemini-2.5-flash", 0, 0, account="act_1", cost_usd_actual=9.99)
    r = client.post("/chat", json={"account_id": "act_1", "message": "hi"})
    assert r.status_code == 200 and r.json()["cost_usd"] == 0.0042
```
Also: `test_api.py`'s autouse fixture becomes the `db_session` harness (like Task 8 — replace the `temp_db`/`STORE_DB_PATH` monkeypatch with `_use_db(db_session)`); tests that need stored facts seed via `repo.upsert_dataset(...)` (the existing `ds` builder in the file). **Update the existing `test_cost_endpoint`** to pass `?account_id=act_1` (a bare `GET /cost` now returns 400 by design).

- [ ] **Step 2: Run to verify they fail**
Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_api.py -q -k "cost"`
Expected: FAIL (`/cost` returns 200 without scope; chat cost uses delta).

- [ ] **Step 3: Update `chat.py`** — make `_record_cost` return the cost and `complete`/`raw_complete` return `(text, cost)`:
```python
# _record_cost: return the cost (0.0 when no usage)
def _record_cost(usage, account=None, op="chat") -> float:
    if not usage:
        return 0.0
    real = _usage_extra(usage, "cost")
    details = _usage_extra(usage, "cost_details")
    discount = None
    if isinstance(details, dict):
        discount = details.get("cache_discount")
    elif details is not None:
        discount = getattr(details, "cache_discount", None)
    return cost_ledger.record(
        MODEL, getattr(usage, "prompt_tokens", 0), getattr(usage, "completion_tokens", 0),
        op=op, account=account,
        cost_usd_actual=float(real) if real is not None else None,
        cache_discount_usd=float(discount) if discount is not None else None)
```
In `complete(...)`, change the two returns to `return resp.choices[0].message.content, _record_cost(getattr(resp, "usage", None), account)` for the non-stream branch, and for the stream branch capture `cost = _record_cost(usage, account)` then `return "".join(out), cost`. In `raw_complete(...)`, `cost = _record_cost(getattr(resp, "usage", None), account, op=op); return (resp.choices[0].message.content or ""), cost` (and `return "", 0.0` on the empty-choices guard). In the REPL `main()`, update the `complete(...)` call site to unpack `answer, _ = complete(...)`. (`stream_answer` is unchanged — it still records internally.)

- [ ] **Step 4: Update `api.py`**
- Add the brand dep near `caller_token`:
```python
from fastapi import Header
def caller_brand(x_brand_id: str | None = Header(default=None)) -> str | None:
    return x_brand_id
```
- `chat_endpoint`: replace the delta block with
```python
    answer, cost = chat.complete(client, messages, stream=False, account=req.account_id)
```
(delete the `before = ...` and `cost = round(... - before, 6)` lines).
- `complete_endpoint`: replace with
```python
    text, cost = chat.raw_complete(client, messages, max_tokens=req.max_tokens,
                                   temperature=req.temperature, account=req.account, op=req.operation)
```
- `cost` endpoint: require a scope (OQ3):
```python
@app.get("/cost", response_model=CostResponse, dependencies=[Depends(require_api_key)])
def cost(account_id: str | None = Query(None), brand: str | None = Depends(caller_brand)):
    if account_id is None and brand is None:
        raise HTTPException(status_code=400, detail="account_id (or X-Brand-Id) required")
    return CostResponse(account_id=account_id,
                        total_usd=cost_ledger.total_usd(account=account_id))
```
- Thread `brand` into ingest/insights so a real brand can be supplied without breaking the default: add `brand: str | None = Depends(caller_brand)` to `insights`, `ingest`, `chat_endpoint`, `chat_stream_endpoint`, `blended`; pass it down where the shim/repository accepts `brand_id` (for this task, `store.ingest`/`load_dataset` keep their signatures, so brand threading beyond `/cost` is a no-op default — leave a `# brand_id threading lands with #34` comment at those call sites rather than widening the shim signatures now).

- [ ] **Step 5: Run to verify they pass**
Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_api.py -q`
Expected: PASS (all API tests, incl. the two new ones).

- [ ] **Step 6: Commit**
```bash
git add apps/ai-layer/ai_layer/chat.py apps/ai-layer/ai_layer/api.py apps/ai-layer/tests/test_api.py
git commit -m "feat(ai-layer): /cost scoping + per-call cost via return value + X-Brand-Id dep"
```

---

### Task 10: Connector snapshot cache key gains `brand_id` (OQ5)

**Files:**
- Modify: `apps/ai-layer/ai_layer/connector_source.py` (the `get_cached_snapshot` key ~line 112 + `BrandRef` build ~124-127)
- Test: `apps/ai-layer/tests/test_connector_source.py`

**Interfaces:**
- `get_cached_snapshot(account_id, preset="last_30d", platforms=None, refresh=False, brand_id=None)` — the cache key gains `brand_id` as its first element; `BrandRef` is built with `brand_id or account_id`.

Current code (connector_source.py:106-135): `key = (account_id, preset, tuple(platforms or ()))` and `BrandRef(brand_id=account_id, meta_account_id=...)`.

- [ ] **Step 1: Write the failing test**
```python
# add to apps/ai-layer/tests/test_connector_source.py
def test_cache_key_includes_brand(monkeypatch):
    from ai_layer import connector_source as cs
    cs._cache_clear()
    calls = []

    def fake_get_snapshot(brand, window, platforms):
        calls.append(brand.brand_id)
        return object()   # snapshot is returned opaquely

    monkeypatch.setattr(cs, "get_snapshot", fake_get_snapshot)
    cs.get_cached_snapshot("act_1", "last_30d", None, brand_id="brandA")
    cs.get_cached_snapshot("act_1", "last_30d", None, brand_id="brandB")   # different brand -> refetch
    cs.get_cached_snapshot("act_1", "last_30d", None, brand_id="brandA")   # same brand -> cache hit
    assert calls == ["brandA", "brandB"]
    assert cs.get_cached_snapshot("act_1", "last_30d", None, brand_id="brandA")  # still returns
```

- [ ] **Step 2: Run to verify it fails**
Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_connector_source.py -q -k brand`
Expected: FAIL (`get_cached_snapshot() got an unexpected keyword argument 'brand_id'`).

- [ ] **Step 3: Implement** — edit `get_cached_snapshot` (connector_source.py:106-127):
  - Signature: add `brand_id: str | None = None` (last param).
  - Change the key line to: `bid = brand_id or account_id` then `key = (bid, account_id, preset, tuple(platforms or ()))`.
  - Change the `BrandRef(...)` build to `brand_id=bid` (keep the `meta_account_id` line as-is).
  All existing callers omit `brand_id`, so `bid` defaults to `account_id` and the key/behavior are unchanged for them (just a longer tuple). Keep the single-flight lock keyed on the same `key`.

- [ ] **Step 4: Run to verify it passes**
Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_connector_source.py -q`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit**
```bash
git add apps/ai-layer/ai_layer/connector_source.py apps/ai-layer/tests/test_connector_source.py
git commit -m "feat(ai-layer): thread brand_id into the connector snapshot cache key"
```

---

### Task 11: Packaging, docs, and full verification

**Files:**
- Modify: `apps/ai-layer/pyproject.toml`, `apps/ai-layer/Dockerfile`, `.env.example`, `apps/ai-layer/README.md`, `temp_docs/ai-eng-adapter-notes.md`

- [ ] **Step 1: Add deps + package the new subpackage**

In `apps/ai-layer/pyproject.toml`, add to `dependencies`: `"sqlalchemy>=2.0"`, `"psycopg[binary]>=3.2"`, `"alembic>=1.13"`. In `[tool.setuptools]`, change `packages = ["ai_layer", "ai_layer.creative"]` to also include `"ai_layer.db"`. (Alembic scripts ship as data — confirm they are in the image if migrations run in-container, or run migrations from the repo checkout; document which.)

- [ ] **Step 2: Docs/config**
- `apps/ai-layer/Dockerfile`: update the env comment block to list `DATABASE_URL` + `MIGRATION_DATABASE_URL` as **required** and drop `AI_LAYER_STORE_PATH` (SQLite retired).
- `.env.example`: add `DATABASE_URL=` and `MIGRATION_DATABASE_URL=` with a comment (pooled vs direct).
- `apps/ai-layer/README.md`: add a "Database" section — `python -m ai_layer.db.migrate` applies the schema; never on boot; env split.
- `temp_docs/ai-eng-adapter-notes.md`: note facts+ledger are now Neon; `brand_config` + `creative_jobs` tables exist with the `save_job(job, brand_id=None)` / `load_job(job_id, brand_id=None)` seam for his `_JOBS` wiring; `creative_jobs.brand_id` is nullable (brief mode).

- [ ] **Step 3: Full suite + isolation checks**

Run:
```bash
cd apps/ai-layer && ../../.venv/bin/python -m pytest tests -q
cd ../connectors && ../../.venv/bin/python -m pytest tests -q
```
Expected: ai-layer suite green on the test branch (file-store tests now DB tests + new db tests); connectors **47 passed**.

Isolation grep (only db/ imports the DB libs):
```bash
cd /home/anantdluffy/workspace/Cosmisk
grep -rlnE "import (sqlalchemy|psycopg|alembic)" apps/ai-layer/ai_layer | grep -v "/db/" || echo "ISOLATED (only db/)"
```
Expected: `ISOLATED (only db/)`.

- [ ] **Step 4: End-to-end container proof (durability, no volume)**

Build + run the #30 image against the test branch (no local volume), then confirm persistence across a restart:
```bash
cd /home/anantdluffy/workspace/Cosmisk
docker build -f apps/ai-layer/Dockerfile -t cosmisk-ai-layer:neon .
# run migrations once, then boot; ingest a row; restart; confirm it persists and no sqlite/jsonl on disk
```
(Exact `docker run` with `-e DATABASE_URL -e MIGRATION_DATABASE_URL` per the spec's Verification §3. This step is the demo dress-rehearsal — coordinate the actual run with the maintainer since it hits live Meta + the test branch.)

- [ ] **Step 5: Commit**
```bash
git add apps/ai-layer/pyproject.toml apps/ai-layer/Dockerfile .env.example apps/ai-layer/README.md temp_docs/ai-eng-adapter-notes.md
git commit -m "build(ai-layer): Neon deps + packaging + docs for the data layer"
```

---

## Post-plan

- Task #47 (guarded record_cost) is satisfied by Task 6. Task #48 (dispose duplicate TS modules) is NOT part of this plan.
- Do not `git push`; report "ready to push" when the suite is green and await explicit permission.
- Update `cosmisk-wiki/current/sprint.md` at session end.
