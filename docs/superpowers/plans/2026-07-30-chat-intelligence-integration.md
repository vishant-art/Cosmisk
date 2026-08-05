# Chat Intelligence Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the rnd-validated Meta Ads intelligence system (`rnd_mine/cli/chat/`) the production chat inside `apps/ai-layer`: deterministic brain, chunked+cached fetching, 37-month history, competitor pipeline, ad-level tool loop — all state in Neon.

**Architecture:** In-place upgrade of the four ancestor modules (`meta_live.py`, `meta_transform.py`, `brain.py`, `chat.py`), three new top-level modules (`ad_tools.py`, `fetch_cache.py`, `history.py`), one new subpackage (`ai_layer/competitor/`), four new Neon tables (Alembic `0004`), and additive API wiring in `api.py`/`schemas.py`. Spec: `docs/superpowers/specs/2026-07-30-chat-intelligence-integration-design.md`.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy 2 + Alembic on Neon Postgres, httpx (Meta/Apify HTTP), OpenAI SDK on OpenRouter (LLM), pytest.

## Global Constraints

- **FIDELITY (spec §0):** ported logic must be **byte-comparable to its rnd source** except the five sanctioned seams: storage→Neon repository, config→`ai_layer.config`/env, LLM transport→OpenAI SDK, CLI shell, import paths. All constants, thresholds, prompts, math, caps verbatim. The complete deviation list is spec §9; anything else that differs is a bug.
- **Source of truth for copied code:** `rnd_mine/cli/chat/` at the repo root. When a step says "copy lines X–Y of `<file>`", copy them exactly, then apply only the seam edits the step shows.
- **Paths:** ai-layer package root is `apps/ai-layer/ai_layer/`; tests in `apps/ai-layer/tests/`; run everything from `apps/ai-layer/`.
- **Test gate:** `python -m pytest` (from `apps/ai-layer/`) green before every commit. DB tests use the Neon test branch via `tests/conftest.py` (`PG*` env vars) — the `db_session` fixture gives per-test rollback.
- **Commits only, never push.** End every commit message with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Model config (verbatim): `MODEL="openai/gpt-5.4-mini"`, `TEMPERATURE=0.5`, `REASONING_EFFORT="minimal"`, `MAX_TOKENS=6000`, `GRAPH_API_VERSION="v23.0"`, `ATTRIBUTION_WINDOWS=["1d_view","7d_click"]`, `CHUNK_DAYS=14`, `RAW_RETENTION_DAYS=183`, `FINAL_LAG_DAYS=7`, `RETENTION_MONTHS=37`, `AD_TOOL_MAX_DAYS=60`, `TOOL_MAX_ROUNDS=6`. rnd's dead `RETENTION_DAYS=1125` is NOT ported (spec §9.7).
- `brand_id` threads through every new store as an optional kwarg defaulting to `None`; the repository applies the existing `_brand(brand_id, account_id)` fallback.

---

### Task 1: Models + Alembic migration 0004 (four new tables)

**Files:**
- Modify: `apps/ai-layer/ai_layer/db/models.py` (append after `CreativeJob`)
- Create: `apps/ai-layer/ai_layer/migrations/versions/0004_intelligence_stores.py`
- Test: `apps/ai-layer/tests/test_db_models.py` (extend)

**Interfaces:**
- Produces ORM classes `InsightRow`, `InsightFetchLog`, `MonthlyFacts`, `CompetitorIntel` (used by Task 2 repository methods).

- [ ] **Step 1: Read the existing migration style.** Read `apps/ai-layer/ai_layer/migrations/versions/` — note the `revision`/`down_revision` ids of `0003_creative_teardowns` (use its `revision` as this migration's `down_revision`) and how tables are created (schema `ai_layer`, mirror the 0002/0003 pattern exactly).

- [ ] **Step 2: Write the failing test.** Append to `tests/test_db_models.py`:

```python
def test_intelligence_tables_exist(db_session):
    from sqlalchemy import inspect
    from ai_layer.db import engine
    insp = inspect(engine.get_engine() if hasattr(engine, "get_engine") else db_session.bind)
    tables = insp.get_table_names(schema="ai_layer")
    for t in ("insight_rows", "insight_fetch_log", "monthly_facts", "competitor_intel"):
        assert t in tables, f"missing table {t}"
```

(Mirror how existing tests in this file obtain the inspector — follow the file's own pattern if it differs; the assertion set is what matters.)

- [ ] **Step 3: Run it to verify it fails.** `python -m pytest tests/test_db_models.py -k intelligence -v` → FAIL (tables missing).

- [ ] **Step 4: Add the ORM models.** Append to `ai_layer/db/models.py`:

```python
class InsightRow(Base):
    """One raw Meta insight row (full actions arrays), any level. The fetch cache's
    row store: raw stays raw so re-normalization is free when fact logic evolves."""
    __tablename__ = "insight_rows"
    __table_args__ = (Index("ix_insight_rows_scope_date",
                            "brand_id", "account_id", "level", "date"),)
    brand_id: Mapped[str] = mapped_column(Text, primary_key=True)
    account_id: Mapped[str] = mapped_column(Text, primary_key=True)
    level: Mapped[str] = mapped_column(Text, primary_key=True)
    date: Mapped[dt.date] = mapped_column(Date, primary_key=True)
    row_key: Mapped[str] = mapped_column(Text, primary_key=True)
    raw: Mapped[dict] = mapped_column(JSONB, nullable=False)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class InsightFetchLog(Base):
    """One row per (scope, date) already fetched -- the cache's fetched_dates set."""
    __tablename__ = "insight_fetch_log"
    brand_id: Mapped[str] = mapped_column(Text, primary_key=True)
    account_id: Mapped[str] = mapped_column(Text, primary_key=True)
    level: Mapped[str] = mapped_column(Text, primary_key=True)
    date: Mapped[dt.date] = mapped_column(Date, primary_key=True)
    fetched_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class MonthlyFacts(Base):
    """One stored month rollup (exact rnd history.py shape in `rollup`, incl. mom).
    Survives past Meta's 37-month retention -- memory Meta itself no longer has."""
    __tablename__ = "monthly_facts"
    brand_id: Mapped[str] = mapped_column(Text, primary_key=True)
    account_id: Mapped[str] = mapped_column(Text, primary_key=True)
    level: Mapped[str] = mapped_column(Text, primary_key=True)
    month: Mapped[str] = mapped_column(Text, primary_key=True)     # 'YYYY-MM'
    rollup: Mapped[dict] = mapped_column(JSONB, nullable=False)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CompetitorIntel(Base):
    """Discovery + scraped-ads records for one account (discovery_json = the rnd
    discover record; ads_json = the rnd apify_ads record). Independent timestamps
    because discovery is ~permanent while ads go stale after STALE_DAYS."""
    __tablename__ = "competitor_intel"
    brand_id: Mapped[str] = mapped_column(Text, primary_key=True)
    account_id: Mapped[str] = mapped_column(Text, primary_key=True)
    discovery_json: Mapped[dict | None] = mapped_column(JSONB)
    discovered_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    ads_json: Mapped[dict | None] = mapped_column(JSONB)
    scraped_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
```

- [ ] **Step 5: Write migration `0004_intelligence_stores.py`** mirroring 0003's file structure (same imports, `schema="ai_layer"` handling). `upgrade()` creates the four tables with exactly the columns above (JSONB via `postgresql.JSONB`, PKs as listed, the one index on `insight_rows`); `downgrade()` drops them in reverse order. Set `revision = "0004"` (match the id style of 0001–0003) and `down_revision` = 0003's revision id from Step 1.

- [ ] **Step 6: Run migration + test.** `python -m ai_layer.db.migrate` (or rely on the conftest auto-migrate) then `python -m pytest tests/test_db_models.py tests/test_db_migration.py -v` → PASS.

- [ ] **Step 7: Commit.** `git add ai_layer/db/models.py ai_layer/migrations/versions/0004_intelligence_stores.py tests/test_db_models.py` → `feat(ai-layer/db): intelligence store tables (insight cache, monthly facts, competitor intel)`

---

### Task 2: Repository methods for the four stores

**Files:**
- Modify: `apps/ai-layer/ai_layer/db/repository.py` (append a new section at the end)
- Test: `apps/ai-layer/tests/test_repository_intelligence.py` (new)

**Interfaces:**
- Produces (consumed by Tasks 5, 6, 10, 11):
  - `insight_fetched_dates(account_id, level, brand_id=None) -> set[str]` (ISO dates)
  - `mark_insight_fetched(account_id, level, dates: list[str], brand_id=None) -> None`
  - `replace_insight_span(account_id, level, span_dates: list[str], rows: list[tuple[str, str, dict]], brand_id=None) -> None` — rows are `(date_iso, row_key, raw)`; deletes the span then inserts
  - `load_insight_rows(account_id, level, since=None, until=None, brand_id=None) -> list[dict]` (raw dicts, ordered by date, row_key)
  - `prune_insight_rows(account_id, level, cutoff_iso: str, brand_id=None) -> int`
  - `load_monthly_facts(account_id, level, brand_id=None) -> dict[str, dict]`
  - `save_monthly_facts(account_id, level, months: dict[str, dict], brand_id=None) -> None`
  - `load_competitor_intel(account_id, brand_id=None) -> dict | None` → `{"discovery": dict|None, "discovered_at": str|None, "ads": dict|None, "scraped_at": str|None}`
  - `save_competitor_discovery(account_id, record: dict, brand_id=None) -> None`
  - `save_competitor_ads(account_id, record: dict, brand_id=None) -> None`

- [ ] **Step 1: Write the failing tests** (`tests/test_repository_intelligence.py`):

```python
"""Repository round-trips for the intelligence stores (Task 2)."""
from ai_layer.db import repository as repo

ACC, LVL = "act_test1", "campaign"


def _raw(day, camp="c1", adset="", ad=""):
    return {"campaign_id": camp, "adset_name": adset, "ad_name": ad,
            "date_start": day, "spend": "10.0", "actions": [{"action_type": "x", "value": "1"}]}


def test_insight_span_roundtrip(db_session):
    assert repo.insight_fetched_dates(ACC, LVL) == set()
    rows = [("2026-07-01", "c1||", _raw("2026-07-01")),
            ("2026-07-02", "c1||", _raw("2026-07-02"))]
    repo.replace_insight_span(ACC, LVL, ["2026-07-01", "2026-07-02"], rows)
    repo.mark_insight_fetched(ACC, LVL, ["2026-07-01", "2026-07-02"])
    assert repo.insight_fetched_dates(ACC, LVL) == {"2026-07-01", "2026-07-02"}
    out = repo.load_insight_rows(ACC, LVL)
    assert [r["date_start"] for r in out] == ["2026-07-01", "2026-07-02"]
    assert out[0]["actions"][0]["value"] == "1"          # raw preserved verbatim


def test_replace_span_upserts_cleanly(db_session):
    repo.replace_insight_span(ACC, LVL, ["2026-07-01"],
                              [("2026-07-01", "c1||", _raw("2026-07-01"))])
    # re-fetch the same span with a revised row -> old row replaced, not duplicated
    revised = _raw("2026-07-01"); revised["spend"] = "99.0"
    repo.replace_insight_span(ACC, LVL, ["2026-07-01"],
                              [("2026-07-01", "c1||", revised)])
    out = repo.load_insight_rows(ACC, LVL)
    assert len(out) == 1 and out[0]["spend"] == "99.0"


def test_insight_range_filter_and_prune(db_session):
    for d in ("2026-01-05", "2026-06-05"):
        repo.replace_insight_span(ACC, LVL, [d], [(d, "c1||", _raw(d))])
        repo.mark_insight_fetched(ACC, LVL, [d])
    assert len(repo.load_insight_rows(ACC, LVL, since="2026-06-01")) == 1
    dropped = repo.prune_insight_rows(ACC, LVL, "2026-06-01")
    assert dropped == 1
    assert repo.insight_fetched_dates(ACC, LVL) == {"2026-06-05"}   # log pruned too


def test_monthly_facts_roundtrip(db_session):
    assert repo.load_monthly_facts(ACC, LVL) == {}
    months = {"2026-05": {"roas": 3.1, "spend": 100.0, "mom": None}}
    repo.save_monthly_facts(ACC, LVL, months)
    months["2026-06"] = {"roas": 2.9, "spend": 90.0, "mom": {"roas": -6.5}}
    repo.save_monthly_facts(ACC, LVL, months)
    out = repo.load_monthly_facts(ACC, LVL)
    assert set(out) == {"2026-05", "2026-06"} and out["2026-06"]["mom"]["roas"] == -6.5


def test_competitor_intel_roundtrip(db_session):
    assert repo.load_competitor_intel(ACC) is None
    repo.save_competitor_discovery(ACC, {"competitors": [{"name": "X"}]})
    intel = repo.load_competitor_intel(ACC)
    assert intel["discovery"]["competitors"][0]["name"] == "X"
    assert intel["ads"] is None
    repo.save_competitor_ads(ACC, {"total_ads": 3})
    intel = repo.load_competitor_intel(ACC)
    assert intel["ads"]["total_ads"] == 3 and intel["scraped_at"] is not None
```

- [ ] **Step 2: Run to verify failure.** `python -m pytest tests/test_repository_intelligence.py -v` → FAIL (`AttributeError`).

- [ ] **Step 3: Implement.** Append to `ai_layer/db/repository.py` (follow the file's existing style — `engine.get_session()` module-qualified, `pg_insert`):

```python
# --- intelligence stores (chat integration) -----------------------------------

def insight_fetched_dates(account_id: str, level: str, brand_id: str | None = None) -> set[str]:
    bid = _brand(brand_id, account_id)
    with engine.get_session() as s:
        q = select(m.InsightFetchLog.date).where(
            m.InsightFetchLog.brand_id == bid, m.InsightFetchLog.account_id == account_id,
            m.InsightFetchLog.level == level)
        return {d.isoformat() for d in s.execute(q).scalars().all()}


def mark_insight_fetched(account_id: str, level: str, dates: list[str],
                         brand_id: str | None = None) -> None:
    if not dates:
        return
    bid = _brand(brand_id, account_id)
    with engine.get_session() as s:
        for d in dates:
            s.execute(pg_insert(m.InsightFetchLog).values(
                brand_id=bid, account_id=account_id, level=level,
                date=dt.date.fromisoformat(d)
            ).on_conflict_do_update(
                index_elements=[m.InsightFetchLog.brand_id, m.InsightFetchLog.account_id,
                                m.InsightFetchLog.level, m.InsightFetchLog.date],
                set_={"fetched_at": func.now()}))
        s.commit()


def replace_insight_span(account_id: str, level: str, span_dates: list[str],
                         rows: list[tuple[str, str, dict]],
                         brand_id: str | None = None) -> None:
    """Delete all rows on the span's dates, then insert the fresh ones -- the rnd
    cache's upsert-by-span: revised recent days replace their prior values cleanly."""
    bid = _brand(brand_id, account_id)
    span = [dt.date.fromisoformat(d) for d in span_dates]
    # dedupe within the batch by (date, row_key), last wins (mirrors rnd dict upsert)
    dedup: dict[tuple, tuple] = {}
    for date_iso, row_key, raw in rows:
        dedup[(date_iso, row_key)] = (date_iso, row_key, raw)
    with engine.get_session() as s:
        from sqlalchemy import delete
        s.execute(delete(m.InsightRow).where(
            m.InsightRow.brand_id == bid, m.InsightRow.account_id == account_id,
            m.InsightRow.level == level, m.InsightRow.date.in_(span)))
        for date_iso, row_key, raw in dedup.values():
            s.add(m.InsightRow(brand_id=bid, account_id=account_id, level=level,
                               date=dt.date.fromisoformat(date_iso),
                               row_key=row_key, raw=raw))
        s.commit()


def load_insight_rows(account_id: str, level: str, since: str | None = None,
                      until: str | None = None, brand_id: str | None = None) -> list[dict]:
    bid = _brand(brand_id, account_id)
    with engine.get_session() as s:
        q = select(m.InsightRow.raw).where(
            m.InsightRow.brand_id == bid, m.InsightRow.account_id == account_id,
            m.InsightRow.level == level)
        if since:
            q = q.where(m.InsightRow.date >= dt.date.fromisoformat(since))
        if until:
            q = q.where(m.InsightRow.date <= dt.date.fromisoformat(until))
        q = q.order_by(m.InsightRow.date, m.InsightRow.row_key)
        return [dict(r) for r in s.execute(q).scalars().all()]


def prune_insight_rows(account_id: str, level: str, cutoff_iso: str,
                       brand_id: str | None = None) -> int:
    """Drop raw rows AND fetch-log entries older than cutoff (the 183-day raw
    boundary). Returns rows dropped -- the store never claims days it discarded."""
    bid = _brand(brand_id, account_id)
    cutoff = dt.date.fromisoformat(cutoff_iso)
    with engine.get_session() as s:
        from sqlalchemy import delete
        res = s.execute(delete(m.InsightRow).where(
            m.InsightRow.brand_id == bid, m.InsightRow.account_id == account_id,
            m.InsightRow.level == level, m.InsightRow.date < cutoff))
        s.execute(delete(m.InsightFetchLog).where(
            m.InsightFetchLog.brand_id == bid, m.InsightFetchLog.account_id == account_id,
            m.InsightFetchLog.level == level, m.InsightFetchLog.date < cutoff))
        s.commit()
        return int(res.rowcount or 0)


def load_monthly_facts(account_id: str, level: str, brand_id: str | None = None) -> dict[str, dict]:
    bid = _brand(brand_id, account_id)
    with engine.get_session() as s:
        q = select(m.MonthlyFacts).where(
            m.MonthlyFacts.brand_id == bid, m.MonthlyFacts.account_id == account_id,
            m.MonthlyFacts.level == level)
        return {r.month: dict(r.rollup) for r in s.execute(q).scalars().all()}


def save_monthly_facts(account_id: str, level: str, months: dict[str, dict],
                       brand_id: str | None = None) -> None:
    bid = _brand(brand_id, account_id)
    with engine.get_session() as s:
        for month, rollup in months.items():
            s.execute(pg_insert(m.MonthlyFacts).values(
                brand_id=bid, account_id=account_id, level=level,
                month=month, rollup=rollup
            ).on_conflict_do_update(
                index_elements=[m.MonthlyFacts.brand_id, m.MonthlyFacts.account_id,
                                m.MonthlyFacts.level, m.MonthlyFacts.month],
                set_={"rollup": rollup, "updated_at": func.now()}))
        s.commit()


def load_competitor_intel(account_id: str, brand_id: str | None = None) -> dict | None:
    bid = _brand(brand_id, account_id)
    with engine.get_session() as s:
        row = s.get(m.CompetitorIntel, (bid, account_id))
        if row is None:
            return None
        return {"discovery": dict(row.discovery_json) if row.discovery_json else None,
                "discovered_at": row.discovered_at.isoformat() if row.discovered_at else None,
                "ads": dict(row.ads_json) if row.ads_json else None,
                "scraped_at": row.scraped_at.isoformat() if row.scraped_at else None}


def _upsert_competitor(account_id: str, brand_id: str | None, values: dict) -> None:
    bid = _brand(brand_id, account_id)
    with engine.get_session() as s:
        upd = dict(values)
        upd["updated_at"] = func.now()
        s.execute(pg_insert(m.CompetitorIntel).values(
            brand_id=bid, account_id=account_id, **values
        ).on_conflict_do_update(
            index_elements=[m.CompetitorIntel.brand_id, m.CompetitorIntel.account_id],
            set_=upd))
        s.commit()


def save_competitor_discovery(account_id: str, record: dict, brand_id: str | None = None) -> None:
    _upsert_competitor(account_id, brand_id,
                       {"discovery_json": record, "discovered_at": func.now()})


def save_competitor_ads(account_id: str, record: dict, brand_id: str | None = None) -> None:
    _upsert_competitor(account_id, brand_id,
                       {"ads_json": record, "scraped_at": func.now()})
```

(Move the two local `from sqlalchemy import delete` imports up to the file's top-level import block as `delete` alongside `func, select`.)

- [ ] **Step 4: Run tests.** `python -m pytest tests/test_repository_intelligence.py -v` → PASS. Then the full DB group: `python -m pytest tests/test_repository_facts.py tests/test_db_models.py -v` → PASS.

- [ ] **Step 5: Commit.** `feat(ai-layer/db): repository methods for insight cache, monthly facts, competitor intel`

---

### Task 3: meta_live.py upgrade (httpx stack, cursor fix, chunked adaptive fetch)

**Files:**
- Modify: `apps/ai-layer/ai_layer/meta_live.py`
- Modify: `apps/ai-layer/pyproject.toml` (add `"httpx>=0.27"` to `[project] dependencies`; it is currently dev-only)
- Test: `apps/ai-layer/tests/test_meta_live_fetch.py` (new)

**Interfaces:**
- Produces (consumed by Tasks 5, 6, 9, 11): `MetaError(status, code, subcode, message)`, `is_too_much_data(e)`, `is_beyond_retention(e)`, `meta_get(path, params)`, `get_insights_paged(account, params, max_rows=5000) -> (rows, pages)`, `list_accounts(token)`, `fetch_month_rows(token, account, first: date, last: date, level="campaign") -> list[dict]`, `fetch_envelope(token, account, since: date, until: date, level="campaign", progress=None) -> {meta, data}` (range-based, chunked), `fetch_envelope_preset(token, account=None, preset="last_30d", level="campaign", max_rows=5000)` (the old preset envelope, renamed), `fetch_dataset(...)` unchanged signature.
- The old requests-based `get`/`get_insights_paged`/`_fail` are deleted (superseded).

- [ ] **Step 1: Write the failing tests** (`tests/test_meta_live_fetch.py`). These stub httpx at the module boundary:

```python
"""Cursor pagination + adaptive chunk fetching (Task 3). No network: httpx stubbed."""
import json
from datetime import date

import pytest

from ai_layer import meta_live as ml


class _Resp:
    def __init__(self, body, status=200):
        self._body, self.status_code, self.text = body, status, json.dumps(body)
    def json(self):
        return self._body


class _FakeClient:
    """Stands in for httpx.Client; serves scripted responses and records requests."""
    def __init__(self, script):
        self.script, self.calls = list(script), []
    def __enter__(self):
        return self
    def __exit__(self, *a):
        return False
    def get(self, url, params=None):
        self.calls.append((url, dict(params or {})))
        return self.script.pop(0)


def test_get_insights_paged_advances_after_cursor_not_next_url(monkeypatch):
    page1 = _Resp({"data": [{"x": 1}],
                   "paging": {"cursors": {"after": "AAA"},
                              "next": "https://graph.facebook.com/v25.0/SHOULD_NOT_FOLLOW"}})
    page2 = _Resp({"data": [{"x": 2}], "paging": {}})
    fake = _FakeClient([page1, page2])
    monkeypatch.setattr(ml.httpx, "Client", lambda **kw: fake)
    rows, pages = ml.get_insights_paged("act_1", {"limit": 500})
    assert [r["x"] for r in rows] == [1, 2] and pages == 2
    # second call: SAME v23.0 endpoint, original params + after cursor
    url2, params2 = fake.calls[1]
    assert "v25.0" not in url2 and url2.startswith(ml.GRAPH_BASE)
    assert params2.get("after") == "AAA" and params2.get("limit") == 500


def test_meta_error_classifiers():
    e = ml.MetaError(500, None, 99, "please reduce the amount of data")
    assert ml.is_too_much_data(e) and not ml.is_beyond_retention(e)
    e2 = ml.MetaError(400, 3018, None, "cannot be beyond 37 months")
    assert ml.is_beyond_retention(e2)


def test_adaptive_halving_and_retention_skip(monkeypatch):
    """Windows >3 days are rejected as too big; beyond-retention windows are skipped."""
    def fake_paged(account, params, max_rows=5000):
        tr = json.loads(params["time_range"])
        s, u = date.fromisoformat(tr["since"]), date.fromisoformat(tr["until"])
        if s < date(2026, 1, 3):
            raise ml.MetaError(400, 3018, None, "cannot be beyond 37 months")
        if (u - s).days > 3:
            raise ml.MetaError(500, None, 99, "please reduce the amount of data")
        return ([{"date_start": s.isoformat()}], 1)
    monkeypatch.setattr(ml, "get_insights_paged", fake_paged)
    skipped = []
    rows = ml._fetch_window_adaptive("tok", "act_1", date(2026, 1, 1), date(2026, 1, 14),
                                    "campaign", skipped)
    assert rows                       # the in-retention slices came back
    assert any("retention" in why for *_, why in skipped)
```

- [ ] **Step 2: Run to verify failure.** `python -m pytest tests/test_meta_live_fetch.py -v` → FAIL (no `MetaError`, no `httpx` attr).

- [ ] **Step 3: Rewrite the fetch stack.** In `ai_layer/meta_live.py`:
  1. Replace `import requests` with `import httpx`; add `from datetime import date, timedelta`.
  2. Replace `FIELDS` (currently `meta_live.py:42-49`) with rnd's extended list — copy `rnd_mine/cli/chat/chat.py:207-217` verbatim (adds `adset_id`, `ad_id`, video fields).
  3. Add the chunking constants after `ATTRIBUTION_WINDOWS` — copy `chat.py:223-233` but **omit `RETENTION_DAYS`** (dead) and **omit `RAW_RETENTION_DAYS`** (it lands in `chat.py`, Task 9): keep only `CHUNK_DAYS = 14` with its comment.
  4. Delete `_fail` and `get` (requests versions, `meta_live.py:56-74`) and the old `get_insights_paged` (`:77-95`). Copy in, verbatim from `rnd_mine/cli/chat/chat.py`: `MetaError` + `_meta_fail` + `is_too_much_data` + `is_beyond_retention` (`chat.py:236-264`), `meta_get` (`chat.py:267-276`, rename target of old `get` callers below), `get_insights_paged` (`chat.py:279-305`), `fetch_month_rows` (`chat.py:317-331`), `_insights_params` (`chat.py:334-343`), `_date_windows` (`chat.py:346-355`), `_fetch_window_adaptive` (`chat.py:358-388`).
  5. `list_accounts` — replace its body with the rnd version (`chat.py:308-314`, calls `meta_get`).
  6. Rename the existing preset `fetch_envelope` (`meta_live.py:127-162`) to `fetch_envelope_preset` and change its one `get_insights_paged` call site not at all (same signature). Update `fetch_dataset` to call `fetch_envelope_preset`.
  7. Add rnd's range-based `fetch_envelope` verbatim (`chat.py:391-424`).
  8. In `main()` (CLI): the two `get(...)` calls become `meta_get(...)`; the `get_insights_paged` call is signature-compatible; add `from pathlib import Path` to the imports (fixes the pre-existing `save_envelope` NameError). Wrap the `__main__` handler to also catch `MetaError` (it subclasses RuntimeError, so the existing `except RuntimeError` already covers it — no change needed, just verify).
  9. `pyproject.toml`: add `"httpx>=0.27",` to the `[project]` `dependencies` list (keep the dev extra entry; duplication is harmless).

- [ ] **Step 4: Run tests.** `python -m pytest tests/test_meta_live_fetch.py -v` → PASS. Then everything that imports meta_live: `python -m pytest tests/test_api.py tests/test_store.py -v` → PASS (preset path renamed internally only; `fetch_dataset` signature unchanged).

- [ ] **Step 5: Fidelity diff.** Compare each copied function against its rnd source region — only import context may differ:
  `git diff --no-index rnd_mine/cli/chat/chat.py apps/ai-layer/ai_layer/meta_live.py` (eyeball the copied regions; exact-match check is Task 13).

- [ ] **Step 6: Commit.** `feat(ai-layer/meta): httpx fetch stack -- cursor-fix pagination, chunked adaptive range fetch, extended fields`

---

### Task 4: meta_transform.py extension + repository column pinning

**Files:**
- Modify: `apps/ai-layer/ai_layer/meta_transform.py`
- Modify: `apps/ai-layer/ai_layer/db/repository.py:20` (one line)
- Test: `apps/ai-layer/tests/test_transform.py` (extend), `apps/ai-layer/tests/test_repository_facts.py` (extend)

**Interfaces:**
- `CampaignDayFact` gains defaulted fields: `adset_id: str = ""`, `adset_name: str = ""`, `ad_id: str = ""`, `ad_name: str = ""`, `video_3s: float = 0.0`, `thruplay: float = 0.0`, `hook_rate: float = 0.0`, `is_video: bool = False`. `FACT_FIELDS` unchanged (the stable 20 — table + dataframe contract).
- Task 9's chat core consumes these via `dataclasses.asdict`.

- [ ] **Step 1: Write the failing tests.** Append to `tests/test_transform.py`:

```python
def test_row_to_fact_video_and_ad_fields():
    from ai_layer.meta_transform import row_to_fact
    raw = {
        "campaign_id": "c1", "campaign_name": "C", "date_start": "2026-07-01",
        "adset_id": "as1", "adset_name": "AS", "ad_id": "a1", "ad_name": "A",
        "spend": "100", "impressions": "1000",
        "actions": [{"action_type": "video_view", "value": "250"},
                    {"action_type": "offsite_conversion.fb_pixel_purchase", "value": "2"}],
        "action_values": [{"action_type": "offsite_conversion.fb_pixel_purchase", "value": "500"}],
        "video_thruplay_watched_actions": [{"action_type": "video_view", "value": "80"}],
        "video_play_actions": [{"action_type": "video_view", "value": "400"}],
    }
    f = row_to_fact(raw)
    assert (f.ad_id, f.adset_id) == ("a1", "as1")
    assert f.video_3s == 250 and f.thruplay == 80
    assert abs(f.hook_rate - 25.0) < 1e-9        # 250/1000*100
    assert f.is_video is True
    assert f.roas == 5.0                          # derived 500/100, never reported field


def test_campaign_level_row_defaults():
    from ai_layer.meta_transform import row_to_fact
    f = row_to_fact({"campaign_id": "c1", "campaign_name": "C",
                     "date_start": "2026-07-01", "spend": "10", "impressions": "100"})
    assert f.ad_id == "" and f.is_video is False and f.hook_rate == 0.0
```

And to `tests/test_repository_facts.py` (proves the DB path ignores the new fields):

```python
def test_upsert_dataset_with_extended_facts(db_session):
    from ai_layer import meta_transform as mt
    from ai_layer.db import repository as repo
    f = mt.row_to_fact({"campaign_id": "c9", "campaign_name": "C9",
                        "date_start": "2026-07-01", "spend": "10", "impressions": "100",
                        "ad_id": "a1", "adset_id": "as1"})
    ds = mt.Dataset(account_id="act_ext", account_name="Ext", currency="INR",
                    since="2026-07-01", until="2026-07-01", level="campaign",
                    source="test", facts=(f,))
    assert repo.upsert_dataset(ds) == 1
    out = repo.load_dataset("act_ext")
    assert len(out) == 1 and out.facts[0].ad_id == ""   # table stores the 20 cols only
```

- [ ] **Step 2: Run to verify failure.** `python -m pytest tests/test_transform.py -k video -v` → FAIL.

- [ ] **Step 3: Implement.**
  1. `meta_transform.py` — append to `CampaignDayFact` (after `cpa: float`), all defaulted:

```python
    # --- extended fields (not in FACT_FIELDS / the facts table; adset/ad level + video) ---
    adset_id: str = ""
    adset_name: str = ""              # populated at adset/ad level
    ad_id: str = ""                   # unique ad key at ad level
    ad_name: str = ""                 # human label (NOT unique -- repeats across adsets)
    video_3s: float = 0.0             # 3-second video views (actions.video_view)
    thruplay: float = 0.0
    hook_rate: float = 0.0            # 3-sec view rate = video_3s / impressions * 100
    is_video: bool = False
```

  2. In `row_to_fact`, before the `return`, add rnd's extraction (`rnd_mine/cli/chat/chat.py:499-502`):

```python
    # video: actions.video_view = 3-second views (hook-rate numerator)
    video_3s = _action_value(raw.get("actions"), ("video_view",))
    thruplay = _action_value(raw.get("video_thruplay_watched_actions"), ("video_view",))
    video_plays = _action_value(raw.get("video_play_actions"), ("video_view",))
```

  and extend the constructor call (mirroring `chat.py:507-534` values, dataclass-style):

```python
        adset_id=str(raw.get("adset_id") or ""),
        adset_name=raw.get("adset_name") or "",
        ad_id=str(raw.get("ad_id") or ""),
        ad_name=raw.get("ad_name") or "",
        video_3s=video_3s,
        thruplay=thruplay,
        hook_rate=video_3s / impressions * 100 if impressions else 0.0,
        is_video=bool(thruplay or video_3s or video_plays),
```

  3. `repository.py:20` — pin the fact columns to the stable tuple so the new dataclass fields never leak into SQL:

```python
_FACT_COLS = list(mt.FACT_FIELDS)          # the 20 table columns, NOT the extended dataclass
```

- [ ] **Step 4: Run tests.** `python -m pytest tests/test_transform.py tests/test_repository_facts.py tests/test_store.py -v` → PASS.

- [ ] **Step 5: Commit.** `feat(ai-layer/transform): ad/adset ids and video fields on CampaignDayFact (table contract unchanged)`

---

### Task 5: fetch_cache.py (rnd cache.py on Neon)

**Files:**
- Create: `apps/ai-layer/ai_layer/fetch_cache.py`
- Test: `apps/ai-layer/tests/test_fetch_cache.py` (new)

**Interfaces:**
- Consumes: Task 2 repository methods.
- Produces (for Tasks 9, 11): `FINAL_LAG_DAYS = 7`, `fetch_cached(account, level, since: date, until: date, fetch_range, today=None, brand_id=None) -> (list[dict], stats)`, `cached_rows(account, level, brand_id=None) -> list[dict]`, `prune_older_than(account, level, cutoff: date, brand_id=None) -> int`.

- [ ] **Step 1: Write the failing tests** (`tests/test_fetch_cache.py`):

```python
"""Settled/trailing-7d rule + contiguous-run fetching on the Neon store (Task 5)."""
from datetime import date, timedelta

from ai_layer import fetch_cache

ACC, LVL = "act_fc", "campaign"


def _rows_for(lo, hi):
    out, cur = [], lo
    while cur <= hi:
        out.append({"campaign_id": "c1", "adset_name": "", "ad_name": "",
                    "date_start": cur.isoformat(), "spend": "1"})
        cur += timedelta(days=1)
    return out


def test_fetches_all_then_serves_settled_from_cache(db_session):
    today = date(2026, 7, 30)
    since, until = date(2026, 7, 1), date(2026, 7, 20)
    calls = []
    def fr(lo, hi):
        calls.append((lo, hi))
        return _rows_for(lo, hi)
    rows, stats = fetch_cache.fetch_cached(ACC, LVL, since, until, fr, today=today)
    assert len(rows) == 20 and stats["fetched_days"] == 20 and not stats["from_cache"]
    # second call: everything is settled (all dates < today-7) -> zero fetching
    calls.clear()
    rows2, stats2 = fetch_cache.fetch_cached(ACC, LVL, since, until, fr, today=today)
    assert not calls and stats2["from_cache"] and stats2["cached_days"] == 20
    assert len(rows2) == 20


def test_trailing_seven_days_always_refetched(db_session):
    today = date(2026, 7, 30)
    since, until = date(2026, 7, 15), date(2026, 7, 29)
    fetch_cache.fetch_cached(ACC, LVL, since, until, _rows_for, today=today)
    calls = []
    def fr(lo, hi):
        calls.append((lo, hi))
        return _rows_for(lo, hi)
    _, stats = fetch_cache.fetch_cached(ACC, LVL, since, until, fr, today=today)
    # floor = 2026-07-23; days 23..29 must be refetched as one contiguous run
    assert calls == [(date(2026, 7, 23), date(2026, 7, 29))]
    assert stats["fetched_days"] == 7 and stats["cached_days"] == 8


def test_settled_middle_never_refetched(db_session):
    today = date(2026, 7, 30)
    fetch_cache.fetch_cached(ACC, LVL, date(2026, 7, 5), date(2026, 7, 10),
                             _rows_for, today=today)
    calls = []
    def fr(lo, hi):
        calls.append((lo, hi))
        return _rows_for(lo, hi)
    # wider window around the cached middle -> two runs, hole-free middle skipped
    fetch_cache.fetch_cached(ACC, LVL, date(2026, 7, 1), date(2026, 7, 14), fr, today=today)
    assert calls == [(date(2026, 7, 1), date(2026, 7, 4)),
                     (date(2026, 7, 11), date(2026, 7, 14))]


def test_prune_older_than(db_session):
    today = date(2026, 7, 30)
    fetch_cache.fetch_cached(ACC, LVL, date(2026, 1, 1), date(2026, 1, 3),
                             _rows_for, today=today)
    dropped = fetch_cache.prune_older_than(ACC, LVL, date(2026, 6, 1))
    assert dropped == 3 and fetch_cache.cached_rows(ACC, LVL) == []
```

- [ ] **Step 2: Run to verify failure.** `python -m pytest tests/test_fetch_cache.py -v` → FAIL (module missing).

- [ ] **Step 3: Implement `ai_layer/fetch_cache.py`.** Port `rnd_mine/cli/chat/cache.py` keeping the module docstring (adjust the storage paragraph to name the Neon tables), `FINAL_LAG_DAYS`, `_key`, `_dates`, `_contiguous_runs` **verbatim** (`cache.py:31-34, 81-100`); replace the disk I/O with repository calls:

```python
"""Neon-backed incremental fetch cache for Meta Ads daily rows.

Same semantics as the rnd disk cache (rnd_mine/cli/chat/cache.py):
  - Data older than FINAL_LAG_DAYS is FINAL and never re-fetched.
  - The trailing FINAL_LAG_DAYS are ALWAYS re-fetched (Meta revises ~a week).
Storage: ai_layer.insight_rows + ai_layer.insight_fetch_log (db.repository).
If the store errors, degrades to a direct fetch (cache is an optimization,
never a point of failure)."""
from __future__ import annotations

import logging
from datetime import date, timedelta

from ai_layer.db import repository as _repo

log = logging.getLogger("ai_layer.fetch_cache")

FINAL_LAG_DAYS = 7   # trailing days Meta still revises -> always re-fetch


def _key(row: dict) -> str:
    """Identity of one raw Meta row within a level (dedupe / upsert key) --
    the rnd cache._key tuple, joined (date lives in its own column)."""
    return "|".join((row.get("campaign_id", ""), row.get("adset_name", ""),
                     row.get("ad_name", "")))


def _dates(lo: date, hi: date) -> list[str]:
    out, cur = [], lo
    while cur <= hi:
        out.append(cur.isoformat())
        cur += timedelta(days=1)
    return out


def _contiguous_runs(dates_sorted: list[date]) -> list[tuple[date, date]]:
    """Collapse sorted dates into maximal contiguous [lo, hi] runs, so we only
    fetch the genuinely-missing spans (never re-fetch a settled middle)."""
    runs, start, prev = [], dates_sorted[0], dates_sorted[0]
    for d in dates_sorted[1:]:
        if (d - prev).days == 1:
            prev = d
        else:
            runs.append((start, prev))
            start = prev = d
    runs.append((start, prev))
    return runs


def fetch_cached(account: str, level: str, since: date, until: date,
                 fetch_range, today: date | None = None,
                 brand_id: str | None = None) -> tuple[list[dict], dict]:
    """Return raw Meta rows for [since, until], fetching only what's missing.

    `fetch_range(lo, hi)` must fetch and return raw rows for a date span.
    Returns (rows, stats) where stats reports how much was served from cache."""
    today = today or date.today()
    floor = (today - timedelta(days=FINAL_LAG_DAYS)).isoformat()

    try:
        fetched = _repo.insight_fetched_dates(account, level, brand_id=brand_id)
    except Exception:  # noqa: BLE001 -- cache store down: degrade to a direct fetch
        log.exception("insight cache read failed; fetching directly")
        return (fetch_range(since, until) or []), \
            {"cached_days": 0, "fetched_days": (until - since).days + 1, "from_cache": False}

    needed = set(_dates(since, until))
    final = {d for d in fetched if d < floor}         # cached AND settled
    missing = sorted(needed - final)                  # missing OR still-revising

    stats = {"cached_days": len(needed & final), "fetched_days": 0, "from_cache": not missing}
    for lo, hi in (_contiguous_runs([date.fromisoformat(d) for d in missing]) if missing else []):
        new_rows = fetch_range(lo, hi) or []
        span = _dates(lo, hi)
        # drop stale rows in the re-fetched span, then insert the fresh ones so
        # revised recent days replace their prior values cleanly.
        try:
            _repo.replace_insight_span(
                account, level, span,
                [(r.get("date_start", ""), _key(r), r) for r in new_rows
                 if r.get("date_start")],
                brand_id=brand_id)
            _repo.mark_insight_fetched(account, level, span, brand_id=brand_id)
        except Exception:  # noqa: BLE001 -- store write failure never loses the fetch
            log.exception("insight cache write failed (continuing with fetched rows)")
        stats["fetched_days"] += len(span)

    try:
        return _repo.load_insight_rows(account, level, since=since.isoformat(),
                                       until=until.isoformat(), brand_id=brand_id), stats
    except Exception:  # noqa: BLE001
        log.exception("insight cache read-back failed; fetching directly")
        return (fetch_range(since, until) or []), stats


def cached_rows(account: str, level: str, brand_id: str | None = None) -> list[dict]:
    """All raw rows currently cached for this account+level (no fetch)."""
    try:
        return _repo.load_insight_rows(account, level, brand_id=brand_id)
    except Exception:  # noqa: BLE001
        log.exception("insight cache read failed")
        return []


def prune_older_than(account: str, level: str, cutoff: date,
                     brand_id: str | None = None) -> int:
    """Drop cached raw rows older than `cutoff` (the 6-month raw boundary -- older
    data lives on as monthly facts). Also forgets those fetched-dates so the store
    never claims to hold days it has discarded. Returns rows dropped."""
    try:
        return _repo.prune_insight_rows(account, level, cutoff.isoformat(), brand_id=brand_id)
    except Exception:  # noqa: BLE001
        log.exception("insight cache prune failed")
        return 0
```

- [ ] **Step 4: Run tests.** `python -m pytest tests/test_fetch_cache.py -v` → PASS.

- [ ] **Step 5: Commit.** `feat(ai-layer): Neon-backed fetch cache with settled/trailing-7d semantics`

---

### Task 6: history.py (rnd history on Neon)

**Files:**
- Create: `apps/ai-layer/ai_layer/history.py`
- Test: `apps/ai-layer/tests/test_history.py` (new)

**Interfaces:**
- Consumes: `repository.load_monthly_facts` / `save_monthly_facts` (Task 2).
- Produces (for Task 9): everything rnd `history.py` exports — `RETENTION_MONTHS=37`, `REBUILD_RECENT_MONTHS=2`, `month_bounds`, `months_range`, `rollup`, `attach_deltas`, `load(account, level, brand_id=None)`, `save(account, level, months, brand_id=None)`, `ensure(account, level, facts_for_month, today, months_back=37, progress=None, brand_id=None)`, `render_history_block(months, currency="INR", tail=24)`.

- [ ] **Step 1: Write the failing tests** (`tests/test_history.py`):

```python
"""Monthly rollups, ensure(), retention skip, rendering (Task 6)."""
from datetime import date

from ai_layer import history

ACC, LVL = "act_h", "campaign"


def _fact(day, camp="C1", spend=100.0, revenue=300.0, purchases=6):
    return {"campaign_name": camp, "date": day, "spend": spend, "revenue": revenue,
            "impressions": 1000.0, "link_clicks": 20.0, "purchases": float(purchases),
            "frequency": 1.5}


def test_months_range_excludes_partial_current_month():
    ms = history.months_range(date(2026, 7, 30), months_back=3)
    assert ms == ["2026-04", "2026-05", "2026-06"]


def test_rollup_math_and_gating():
    facts = [_fact("2026-06-01"), _fact("2026-06-02", spend=50, revenue=50)]
    r = history.rollup(facts)
    assert r["spend"] == 150.0 and r["revenue"] == 350.0
    assert abs(r["roas"] - 350.0 / 150.0) < 1e-6
    assert r["best_campaign"][0] == "C1"
    # a campaign with <5 purchases never ranks
    r2 = history.rollup([_fact("2026-06-01", purchases=2)])
    assert r2["best_campaign"] is None


def test_ensure_builds_missing_and_skips_failing_months(db_session):
    def facts_for_month(first, last):
        if first < date(2026, 5, 1):
            raise RuntimeError("beyond retention")       # one bad month never kills it
        return [_fact(first.isoformat())]
    months = history.ensure(ACC, LVL, facts_for_month, date(2026, 7, 15), months_back=4)
    assert set(months) == {"2026-05", "2026-06"}
    assert months["2026-06"]["mom"] is not None
    # second ensure: only the REBUILD_RECENT_MONTHS tail is recomputed
    calls = []
    def ffm2(first, last):
        calls.append(first.isoformat()[:7])
        return [_fact(first.isoformat())]
    history.ensure(ACC, LVL, ffm2, date(2026, 7, 15), months_back=4)
    assert calls == ["2026-05", "2026-06"]               # the refresh tail only


def test_render_block_tail(db_session):
    months = {f"2026-{m:02d}": dict(history.rollup([_fact(f"2026-{m:02d}-01")]), mom=None)
              for m in range(1, 7)}
    block = history.render_history_block(months, tail=3)
    assert "3 earlier months stored" in block and "2026-06" in block
```

- [ ] **Step 2: Run to verify failure.** `python -m pytest tests/test_history.py -v` → FAIL.

- [ ] **Step 3: Implement `ai_layer/history.py`.** Copy `rnd_mine/cli/chat/history.py` **whole**, then apply only these seam edits:
  1. Delete `import json`, `from pathlib import Path`, `HISTORY_DIR`, and the `_path` function (`history.py:130-131`).
  2. Add `from ai_layer.db import repository as _repo`.
  3. Replace `load`/`save` (`history.py:134-147`) with:

```python
def load(account: str, level: str, brand_id: str | None = None) -> dict:
    try:
        return _repo.load_monthly_facts(account, level, brand_id=brand_id)
    except Exception:  # noqa: BLE001 -- store down: behave like an empty history
        return {}


def save(account: str, level: str, months: dict, brand_id: str | None = None) -> None:
    _repo.save_monthly_facts(account, level, months, brand_id=brand_id)
```

  4. Thread `brand_id` through `ensure`: signature becomes `ensure(account, level, facts_for_month, today, months_back=RETENTION_MONTHS, progress=None, brand_id=None)`; its internal `load(...)`/`save(...)` calls pass `brand_id=brand_id`. **Everything else in `ensure` — the refresh-cutoff logic, the exception swallowing, `attach_deltas`, the `built` gate — stays byte-identical** (`history.py:152-182`).
  5. Docstring: update the Storage paragraph to name the `monthly_facts` table.

- [ ] **Step 4: Run tests.** `python -m pytest tests/test_history.py -v` → PASS.

- [ ] **Step 5: Commit.** `feat(ai-layer): 37-month monthly history tier on Neon`

---

### Task 7: ad_tools.py (verbatim port)

**Files:**
- Create: `apps/ai-layer/ai_layer/ad_tools.py`
- Test: `apps/ai-layer/tests/test_ad_tools.py` (new)

**Interfaces:**
- Produces (for Task 9): `TOOL_SCHEMAS` (6 schemas), `execute(name, args, facts, window="") -> dict`, plus the pure tools. Facts are plain dicts (Task 9 passes `asdict(row_to_fact(raw))`).

- [ ] **Step 1: Copy the module.** Copy `rnd_mine/cli/chat/ad_tools.py` → `ai_layer/ad_tools.py` **unchanged** (it is pure: no I/O, no sibling imports, stdlib only).

- [ ] **Step 2: Write the tests** (`tests/test_ad_tools.py`):

```python
"""Pure ad-level tools: grouping by ad_id, gates, fatigue verdicts (Task 7)."""
from ai_layer import ad_tools


def _f(day, ad_id, ad_name, spend=600.0, revenue=1800.0, purchases=4, adset="AS1",
       impressions=10000.0, link_clicks=200.0, freq=1.5, video_3s=0.0, thruplay=0.0):
    return {"campaign_name": "C", "adset_id": "as-" + adset, "adset_name": adset,
            "ad_id": ad_id, "ad_name": ad_name, "date": day, "spend": spend,
            "revenue": revenue, "purchases": float(purchases), "impressions": impressions,
            "link_clicks": link_clicks, "frequency": freq, "roas": revenue / spend,
            "video_3s": video_3s, "thruplay": thruplay}


def test_top_ads_groups_by_ad_id_not_name():
    facts = [_f("2026-07-01", "a1", "Same Name"), _f("2026-07-01", "a2", "Same Name")]
    out = ad_tools.top_ads(facts, metric="roas", n=5)
    assert out["ads_considered"] == 2          # same name, two distinct ads


def test_top_ads_gates_thin_ads():
    facts = [_f("2026-07-01", "a1", "Big"),
             _f("2026-07-01", "a2", "Tiny", spend=10.0, revenue=100.0, purchases=1)]
    out = ad_tools.top_ads(facts, metric="roas")
    assert [a["ad"] for a in out["ads"]] == ["Big"]


def test_video_hook_rates_ranks_by_hook_not_spend():
    facts = [_f("2026-07-01", "a1", "HighHook", spend=600, video_3s=2000, thruplay=800),
             _f("2026-07-01", "a2", "BigSpendLowHook", spend=6000, video_3s=500, thruplay=100)]
    out = ad_tools.video_hook_rates(facts)
    assert out["ads"][0]["ad"] == "HighHook"
    assert out["ads"][0]["hook_rate"] == 20.0


def test_fatigue_scan_flags_ctr_collapse_with_freq_rise():
    days = [f"2026-07-{d:02d}" for d in range(1, 9)]
    facts = []
    for i, day in enumerate(days):
        good = i < 4
        facts.append(_f(day, "a1", "Fatiguing", spend=600,
                        link_clicks=300.0 if good else 100.0,
                        freq=1.2 if good else 2.0))
    out = ad_tools.ad_fatigue_scan(facts)
    assert out["fatiguing_count"] == 1 and out["ads"][0]["ad"] == "Fatiguing"


def test_execute_dispatch_and_unknowns():
    assert "error" in ad_tools.execute("top_ads", {"metric": "roas"}, [])
    facts = [_f("2026-07-01", "a1", "A")]
    assert ad_tools.execute("nonsense", {}, facts)["error"].startswith("unknown tool")
    # placement_breakdown is deliberately NOT handled here (chat.py owns it)
    assert "error" in ad_tools.execute("placement_breakdown", {}, facts)
```

- [ ] **Step 3: Run tests.** `python -m pytest tests/test_ad_tools.py -v` → PASS (pure copy; if anything fails, the copy is wrong — fix the copy, never the logic).

- [ ] **Step 4: Fidelity check.** `git diff --no-index rnd_mine/cli/chat/ad_tools.py apps/ai-layer/ai_layer/ad_tools.py` → **empty diff**.

- [ ] **Step 5: Commit.** `feat(ai-layer): ad-level tool suite (verbatim rnd port)`

---

### Task 8: brain.py (replace engine, preserve `statements()` + charts)

**Files:**
- Modify: `apps/ai-layer/ai_layer/brain.py`
- Test: `apps/ai-layer/tests/test_brain.py` (new; if an old brain test exists, update it in place)

**Interfaces:**
- Produces: `analyze(facts: list[dict], currency="INR") -> dict` and `render_analysis_block(result, currency="INR") -> str` (rnd, verbatim — consumed by Task 9); `statements(df, currency) -> list[tuple[str, str]]` (adapter — same contract `api.py:134` already consumes, tags drawn from the existing `_PRIORITY` keys); `fmt_money`, `pct`, `direction`, `make_plots`, `main` preserved.
- Deleted: `campaign_windows` and the old statements internals; old constants `FATIGUE_DROP`, `SCALING_RISE`, `FREQ_RISE`, `MAX_FLAGS` (superseded by rnd thresholds). Keep `MIN_PURCHASES_FOR_ROAS = 10` (used by the adapter's best/worst gate).

- [ ] **Step 1: Write the failing tests** (`tests/test_brain.py`):

```python
"""Calendar WoW/MoM engine + statements adapter (Task 8)."""
from datetime import date, timedelta

import pandas as pd

from ai_layer import brain


def _facts(days=28, roas_recent=1.0, roas_prior=4.0, freq_recent=2.4, freq_prior=1.5):
    """Prior fortnight strong, recent week weak -> WoW decline + FATIGUE flag."""
    out, start = [], date(2026, 7, 1)
    for i in range(days):
        d = start + timedelta(days=i)
        recent = i >= days - 7
        spend = 1000.0
        roas = roas_recent if recent else roas_prior
        out.append({"campaign_name": "Main", "date": d.isoformat(), "spend": spend,
                    "revenue": spend * roas, "impressions": 10000.0, "link_clicks": 150.0,
                    "purchases": 10.0, "frequency": freq_recent if recent else freq_prior,
                    "cpm": 100.0, "link_ctr": 1.5, "cpa": 100.0, "roas": roas})
    return out


def test_analyze_wow_delta_and_fatigue_flag():
    res = brain.analyze(_facts())
    assert "WoW" in res["windows"]
    wow = next(a for a in res["account"] if a["period"] == "WoW")
    assert wow["pct"]["roas"] < -25            # calendar week-over-week, exact math
    camp = res["campaigns"][0]
    assert camp["flag"] == "FATIGUE" and any("fatigue" in c for c in camp["causes"])


def test_analyze_short_window_yields_no_periods():
    res = brain.analyze(_facts(days=7))
    assert res["windows"] == [] and res["account"] == []
    assert "too short" in brain.render_analysis_block(res)


def test_render_block_contains_exact_sections():
    block = brain.render_analysis_block(brain.analyze(_facts()))
    assert "ACCOUNT TREND:" in block and "CAMPAIGN SIGNALS" in block
    assert "likely:" in block                  # deterministic candidate causes


def test_statements_adapter_contract():
    df = pd.DataFrame(_facts())
    stmts = brain.statements(df, "INR")
    tags = [t for t, _ in stmts]
    assert tags[0] == "Overview"
    assert "WARN fatigue" in tags              # maps analyze() FATIGUE -> legacy tag
    known = {"Overview", "Trend", "Best campaign", "Worst campaign", "Wasted spend",
             "Budget concentration", "WARN fatigue", "UP scaling", "Bad day"}
    assert set(tags) <= known                  # never emits a tag /insights can't card
    assert all(isinstance(t, str) and isinstance(x, str) for t, x in stmts)
```

- [ ] **Step 2: Run to verify failure.** `python -m pytest tests/test_brain.py -v` → FAIL (`analyze` missing).

- [ ] **Step 3: Rebuild `brain.py`.**
  1. Keep from the current file: the module docstring's CLI usage lines, the UTF-8 `sys.stdout.reconfigure` block, `fmt_money`, `pct`, `direction`, `MIN_PURCHASES_FOR_ROAS = 10`, `MATERIAL_SPEND_PCT = 0.01` (same value both sides — keep one), `make_plots` (whole function, `brain.py:192-266`), `main` (`:269-297`, unchanged — it calls `statements(df, currency)` which survives).
  2. Delete: `campaign_windows` (`:65-89`), the old `statements` body (`:92-189`), old constants `MIN_WINDOW_PURCHASES`, `FATIGUE_DROP`, `SCALING_RISE`, `FREQ_RISE`, `MAX_FLAGS`.
  3. Copy in, **verbatim**, from `rnd_mine/cli/chat/brain.py`: the threshold block (`brain.py:25-37` — note rnd's `MIN_WINDOW_PURCHASES = 5` returns here), `_d`, `_pct_change`, `_direction`, `_aggregate`, `_split`, `_deltas`, `_causes`, `_flag`, `_worst_day`, `analyze` (`:40-232`), and `_sign`, `_acct_line`, `render_analysis_block` (`:237-293`). rnd `_direction` and the kept `direction` coexist (different names, no clash).
  4. Add the adapter (new code — this is the one non-verbatim function, its contract pinned by the test):

```python
def statements(df, currency: str = "INR") -> list[tuple[str, str]]:
    """Legacy (tag, sentence) contract for GET /insights, now driven by analyze().
    Tags stay within api._PRIORITY's vocabulary so the cards keep rendering."""
    facts = df.to_dict("records")
    for f in facts:                                # normalize dates to ISO strings
        d = f.get("date")
        f["date"] = d.isoformat()[:10] if hasattr(d, "isoformat") else str(d)[:10]
    out: list[tuple[str, str]] = []

    total_spend = sum(f["spend"] for f in facts)
    total_rev = sum(f["revenue"] for f in facts)
    blended = total_rev / total_spend if total_spend else 0.0
    days = len({f["date"] for f in facts})
    n_campaigns = len({f["campaign_name"] for f in facts})
    out.append(("Overview",
        f"Across {days} days and {n_campaigns} campaigns you spent "
        f"{fmt_money(total_spend, currency)} and generated {fmt_money(total_rev, currency)} "
        f"in attributed revenue -- a blended ROAS of {blended:.2f}x on "
        f"{int(sum(f['purchases'] for f in facts)):,} purchases."))

    res = analyze(facts, currency=currency)

    if res["account"]:
        a = res["account"][0]                      # freshest period (WoW when available)
        p, ra, pa = a["pct"], a["recent"], a["prior"]
        out.append(("Trend",
            f"{a['period']}: blended ROAS moved {pa['roas']:.2f}x -> {ra['roas']:.2f}x "
            f"({_sign(p['roas'])}, {_direction(p['roas'])}); spend {_sign(p['spend'])}, "
            f"revenue {_sign(p['revenue'])}, purchases {_sign(p['purchases'])}."))

    # best / worst / wasted / concentration: whole-window campaign totals,
    # same gates as the old statements (materiality + MIN_PURCHASES_FOR_ROAS)
    by_camp: dict[str, dict] = {}
    for f in facts:
        g = by_camp.setdefault(f["campaign_name"],
                               {"spend": 0.0, "revenue": 0.0, "purchases": 0.0})
        g["spend"] += f["spend"]; g["revenue"] += f["revenue"]; g["purchases"] += f["purchases"]
    floor = total_spend * MATERIAL_SPEND_PCT
    material = {n: g for n, g in by_camp.items() if g["spend"] >= floor}
    reliable = {n: g for n, g in material.items()
                if g["purchases"] >= MIN_PURCHASES_FOR_ROAS}
    if reliable:
        roas_of = {n: (g["revenue"] / g["spend"] if g["spend"] else 0.0)
                   for n, g in reliable.items()}
        bn, wn = max(roas_of, key=roas_of.get), min(roas_of, key=roas_of.get)
        b, w = reliable[bn], reliable[wn]
        out.append(("Best campaign",
            f"'{bn}' is the efficiency leader at {roas_of[bn]:.2f}x ROAS "
            f"({fmt_money(b['revenue'], currency)} on {fmt_money(b['spend'], currency)}, "
            f"{int(b['purchases'])} purchases)."))
        out.append(("Worst campaign",
            f"'{wn}' is the weakest converter that still has scale at "
            f"{roas_of[wn]:.2f}x ROAS -- {fmt_money(w['spend'], currency)} spent for "
            f"{fmt_money(w['revenue'], currency)} back."))
    zero = sorted((x for x in material.items() if x[1]["purchases"] == 0),
                  key=lambda x: -x[1]["spend"])
    if zero:
        names = ", ".join(f"'{n}' ({fmt_money(g['spend'], currency)})" for n, g in zero[:3])
        out.append(("Wasted spend",
            f"{len(zero)} material campaign(s) spent with ZERO attributed purchases: {names}."))
    if by_camp:
        top_n = max(by_camp, key=lambda n: by_camp[n]["spend"])
        tg = by_camp[top_n]
        share = tg["spend"] / total_spend * 100 if total_spend else 0.0
        troas = tg["revenue"] / tg["spend"] if tg["spend"] else 0.0
        out.append(("Budget concentration",
            f"'{top_n}' absorbs {share:.0f}% of spend "
            f"({fmt_money(tg['spend'], currency)}) at {troas:.2f}x ROAS."))

    for c in res["campaigns"]:                     # calendar-period flags -> legacy tags
        p = c["pct"]
        if c["flag"] == "FATIGUE":
            out.append(("WARN fatigue",
                f"'{c['campaign']}' shows fatigue ({c['period']}): ROAS "
                f"{c['prior']['roas']:.2f}x -> {c['recent']['roas']:.2f}x "
                f"({_sign(p['roas'])}) while frequency moved {_sign(p['frequency'])}."))
        elif c["flag"] == "SCALING":
            out.append(("UP scaling",
                f"'{c['campaign']}' is heating up ({c['period']}): ROAS "
                f"{c['prior']['roas']:.2f}x -> {c['recent']['roas']:.2f}x "
                f"({_sign(p['roas'])}) -- a candidate for more budget."))

    if res.get("anomaly"):
        w = res["anomaly"]
        out.append(("Bad day",
            f"{w['date']} was the worst day: ROAS {w['roas']:.2f}x, {w['dev']:.0f}% below "
            f"its ~{w['mean']:.2f}x 7-day trend."))
    return out
```

- [ ] **Step 4: Run tests.** `python -m pytest tests/test_brain.py -v` → PASS. Then `python -m pytest tests/test_api.py -v` (the `/insights` path) → PASS.

- [ ] **Step 5: Fidelity check.** The copied region (`analyze` + helpers + `render_analysis_block`) must diff clean against `rnd_mine/cli/chat/brain.py` (Task 13 verifies formally).

- [ ] **Step 6: Commit.** `feat(ai-layer/brain): calendar WoW/MoM engine with flags + causes; statements() preserved as adapter`

---

### Task 9: chat.py upgrade (config, SYSTEM, context, tool loop, history block, full-context glue)

**Files:**
- Modify: `apps/ai-layer/ai_layer/chat.py`
- Modify: `apps/ai-layer/ai_layer/cost_ledger.py` (one PRICING entry)
- Test: `apps/ai-layer/tests/test_chat.py` (update) + `apps/ai-layer/tests/test_tool_loop.py` (new)

**Interfaces:**
- Consumes: Tasks 3–8 (`ml.fetch_envelope`, `ml.fetch_month_rows`, `mt.row_to_fact`, `brain.analyze/render_analysis_block`, `fetch_cache`, `history`, `ad_tools`).
- Produces (consumed by Tasks 11, 12):
  - constants `MODEL/TEMPERATURE/REASONING_EFFORT/MAX_TOKENS/MAX_CAMPAIGNS/FULL_DATA/STREAM`, `AD_TOOL_MAX_DAYS=60`, `TOOL_MAX_ROUNDS=6`, `RAW_RETENTION_DAYS=183`, `SYSTEM`
  - `build_context(ds, max_campaigns=MAX_CAMPAIGNS, full=FULL_DATA) -> str` (pandas-free)
  - `run_tool_loop(client, messages, account, token, brand_id=None, progress=None) -> tuple[str, float, list[str]]`
  - `build_history_block(token, account, level, raw_since: date, until: date, currency, brand_id=None, progress=None) -> str`
  - `build_full_context(ds, token, account, level, since: date, until: date, brand_id=None, full=FULL_DATA, competitor_block: str | None = None, progress=None) -> str`
  - `complete` / `stream_answer` / `raw_complete` / `_record_cost` unchanged signatures.

- [ ] **Step 1: Update constants + SYSTEM + pricing.**
  1. Replace the model-config block (`chat.py:38-62`) with rnd's (`rnd_mine/cli/chat/chat.py:52-76` — comments included; drop only the "static-ad CLI" sentence if it reads oddly, keep values exactly): `MODEL="openai/gpt-5.4-mini"`, `TEMPERATURE=0.5`, `REASONING_EFFORT="minimal"`, `MAX_CAMPAIGNS=None`, `FULL_DATA=True`, `STREAM=True`, `MAX_TOKENS=6000`.
  2. Replace `SYSTEM` (`chat.py:64-102`) with rnd's verbatim (`rnd chat.py:78-134` — the v2 with ANALYSIS / HISTORIC FACTS / COMPETITOR INTEL trust instructions).
  3. `cost_ledger.py` PRICING: add `"openai/gpt-5.4-mini": (0.25, 2.00),` as the first entry.

- [ ] **Step 2: Replace `build_context` with the pandas-free rnd version.** Delete the current `build_context` (`chat.py:170-222`). Copy rnd's dict-based aggregate helpers as module-private functions — `_daily_totals` from rnd `chat.py:564-578` (`daily_totals`) and `_campaign_summary` from rnd `chat.py:581-600` (`campaign_summary`), renamed with the leading underscore — then copy rnd `build_context` (`chat.py:706-760`) changing only its two internal calls to `_campaign_summary(facts)` / `_daily_totals(facts)` and adding one line at the top to accept dataclass facts:

```python
    facts = [f if isinstance(f, dict) else asdict(f) for f in ds.facts]
```

  (add `from dataclasses import asdict` to the imports). Signature and output format stay identical to rnd.

- [ ] **Step 3: Write the failing tool-loop test** (`tests/test_tool_loop.py`):

```python
"""run_tool_loop against a scripted fake OpenAI client (Task 9). No network."""
import json

from ai_layer import chat


class _Msg:
    def __init__(self, content=None, tool_calls=None):
        self.content, self.tool_calls = content, tool_calls


class _Call:
    def __init__(self, id, name, arguments):
        self.id = id
        self.function = type("F", (), {"name": name, "arguments": arguments})()


class _FakeClient:
    """Yields scripted responses; records whether tools were offered each round."""
    def __init__(self, script):
        self._script = list(script)
        self.rounds = []
        outer = self
        class _Completions:
            def create(self, **kw):
                outer.rounds.append("tools" in kw)
                msg = outer._script.pop(0)
                usage = type("U", (), {"prompt_tokens": 10, "completion_tokens": 5,
                                       "model_extra": {"cost": 0.001}})()
                choice = type("C", (), {"message": msg})()
                return type("R", (), {"choices": [choice], "usage": usage})()
        self.chat = type("Chat", (), {"completions": _Completions()})()


def test_tool_round_then_final_answer(monkeypatch):
    monkeypatch.setattr(chat, "_ensure_ad_level",
                        lambda token, account, days, brand_id=None, progress=None:
                        ([{"ad_id": "a1", "ad_name": "A", "adset_id": "s", "adset_name": "S",
                           "campaign_name": "C", "date": "2026-07-01", "spend": 600.0,
                           "revenue": 1800.0, "purchases": 4.0, "impressions": 10000.0,
                           "link_clicks": 200.0, "frequency": 1.5, "roas": 3.0,
                           "video_3s": 0.0, "thruplay": 0.0}], "2026-07-01..2026-07-01"))
    recorded = []
    monkeypatch.setattr(chat, "_record_cost",
                        lambda usage, account=None, op="chat": recorded.append(1) or 0.001)
    client = _FakeClient([
        _Msg(tool_calls=[_Call("t1", "top_ads", json.dumps({"metric": "roas"}))]),
        _Msg(content="**Answer** grounded in tool data."),
    ])
    messages = [{"role": "system", "content": "s"}, {"role": "user", "content": "top ads?"}]
    answer, cost, tools_used = chat.run_tool_loop(client, messages, "act_1", "tok")
    assert answer.startswith("**Answer**") and tools_used == ["top_ads"]
    assert cost == 0.002 and len(recorded) == 2
    roles = [m["role"] for m in messages]
    assert roles == ["system", "user", "assistant", "tool", "assistant"]


def test_no_tools_answers_directly():
    client = _FakeClient([_Msg(content="direct")])
    answer, cost, tools_used = chat.run_tool_loop(
        client, [{"role": "user", "content": "hi"}], "act_1", "tok")
    assert answer == "direct" and tools_used == []


def test_round_cap_forces_tools_off_final(monkeypatch):
    monkeypatch.setattr(chat, "_ensure_ad_level",
                        lambda *a, **k: ([], ""))
    monkeypatch.setattr(chat, "_record_cost", lambda *a, **k: 0.0)
    looping = _Msg(tool_calls=[_Call("t", "top_ads", "{}")])
    client = _FakeClient([looping] * chat.TOOL_MAX_ROUNDS + [_Msg(content="forced")])
    answer, _, _ = chat.run_tool_loop(
        client, [{"role": "user", "content": "loop"}], "act_1", "tok")
    assert answer == "forced"
    assert client.rounds == [True] * chat.TOOL_MAX_ROUNDS + [False]  # final call: tools off
```

Run: `python -m pytest tests/test_tool_loop.py -v` → FAIL.

- [ ] **Step 4: Implement the agent loop + helpers.** Add to `chat.py` (imports: `import json`, `from datetime import date, timedelta`, `from ai_layer import ad_tools, brain, fetch_cache, history`, `from ai_layer import meta_transform as mt` already present, `from ai_layer import meta_live as ml` already present):

```python
# ---- agent loop: ad-level tools the model pulls on demand (rnd chat.py 831-956,
# transport seam: OpenAI SDK instead of raw httpx; shell seam: progress callback) ----

AD_TOOL_MAX_DAYS = 60
TOOL_MAX_ROUNDS = 6
# Raw daily rows are kept only for the last ~6 months (the recent tier). Older
# periods are summarized as monthly facts in history.py, not stored as raw rows.
RAW_RETENTION_DAYS = 183


def _ensure_ad_level(token: str, account: str, days: int,
                     brand_id: str | None = None, progress=None) -> tuple[list[dict], str]:
    """Fetch (cached) ad-level facts for the last `days`. Ad-level is big + slow
    the first time; the Neon cache (keyed separately by level) makes repeats fast.
    Returns (facts, 'since..until')."""
    if not token:
        return [], ""
    days = max(1, min(int(days or 30), AD_TOOL_MAX_DAYS))
    until = date.today() - timedelta(days=1)
    since = until - timedelta(days=days - 1)

    def _fr(lo, hi):
        return ml.fetch_envelope(token, account=account, since=lo, until=hi,
                                 level="ad")["data"]

    if progress:
        progress(f"pulling ad-level data ({days}d; first pull can take a minute) ...")
    raw, stats = fetch_cache.fetch_cached(account, "ad", since, until, _fr,
                                          brand_id=brand_id)
    facts = [asdict(mt.row_to_fact(r)) for r in raw]
    if progress:
        src = f"{stats['fetched_days']}d fetched" if stats.get("fetched_days") else "from cache"
        progress(f"ad-level: {len(facts)} rows ({src}).")
    return facts, f"{since.isoformat()}..{until.isoformat()}"


def _placement_breakdown(token: str, account: str, days: int) -> dict:
    """Meta placement breakdown (publisher_platform x platform_position) over the
    window. One aggregate row per placement -> compact, one fast call."""
    if not token:
        return {"error": "no Meta token"}
    days = max(1, min(int(days or 30), AD_TOOL_MAX_DAYS))
    until = date.today() - timedelta(days=1)
    since = until - timedelta(days=days - 1)
    params = {
        "access_token": token, "level": "account",
        "fields": "spend,impressions,inline_link_clicks,actions,action_values",
        "breakdowns": "publisher_platform,platform_position",
        "time_range": json.dumps({"since": since.isoformat(), "until": until.isoformat()}),
        "limit": 200,
    }
    rows, _ = ml.get_insights_paged(account, params, max_rows=1000)
    out = []
    for r in rows:
        spend = mt._to_float(r.get("spend"))
        if spend <= 0:
            continue
        imp = mt._to_float(r.get("impressions"))
        lc = mt._to_float(r.get("inline_link_clicks"))
        purch = mt._action_value(r.get("actions"), mt.PURCHASE_ACTION_TYPES)
        rev = mt._action_value(r.get("action_values"), mt.PURCHASE_ACTION_TYPES)
        out.append({
            "placement": f"{r.get('publisher_platform')}/{r.get('platform_position')}",
            "spend": round(spend), "revenue": round(rev),
            "roas": round(rev / spend, 2) if spend else 0.0,
            "purchases": int(purch), "link_ctr": round(lc / imp * 100, 2) if imp else 0.0,
        })
    out.sort(key=lambda x: x["spend"], reverse=True)
    return {"window": f"{since.isoformat()}..{until.isoformat()}", "placements": out}


def run_tool_loop(client, messages: list, account: str | None, token: str | None,
                  brand_id: str | None = None, progress=None) -> tuple[str, float, list[str]]:
    """Model turn with ad-level tools available (rnd run_tool_loop, SDK transport).
    Appends the exchange to `messages` in place (same as rnd); returns
    (answer, total_cost, tools_used)."""
    total_cost = 0.0
    tools_used: list[str] = []
    ad_cache: dict[int, tuple[list[dict], str]] = {}
    extra = {"reasoning": {"effort": REASONING_EFFORT}} if REASONING_EFFORT else {}

    def _ads(days):
        d = max(1, min(int(days or 30), AD_TOOL_MAX_DAYS))
        if d not in ad_cache:
            ad_cache[d] = _ensure_ad_level(token, account, d, brand_id=brand_id,
                                           progress=progress)
        return ad_cache[d]

    def _call(with_tools: bool):
        kwargs = dict(model=MODEL, temperature=TEMPERATURE, max_tokens=MAX_TOKENS,
                      messages=messages, extra_body=extra)
        if with_tools:
            kwargs["tools"] = ad_tools.TOOL_SCHEMAS
            kwargs["tool_choice"] = "auto"
        resp = client.chat.completions.create(**kwargs)
        return resp.choices[0].message, _record_cost(getattr(resp, "usage", None), account)

    for _ in range(TOOL_MAX_ROUNDS):
        msg, cost = _call(with_tools=True)
        total_cost += cost
        tcs = getattr(msg, "tool_calls", None)
        if not tcs:
            content = msg.content or ""
            messages.append({"role": "assistant", "content": content})
            return content, total_cost, tools_used
        # keep the assistant's tool-call message, then answer each call
        messages.append({"role": "assistant", "content": msg.content,
                         "tool_calls": [{"id": tc.id, "type": "function",
                                         "function": {"name": tc.function.name,
                                                      "arguments": tc.function.arguments}}
                                        for tc in tcs]})
        for tc in tcs:
            name = tc.function.name or ""
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            tools_used.append(name)
            if progress:
                progress(f"[tool] {name}({', '.join(f'{k}={v}' for k, v in args.items())})")
            if name == "placement_breakdown":
                result = _placement_breakdown(token, account, args.get("days", 30))
            else:
                facts, win = _ads(args.get("days", 30))
                result = ad_tools.execute(name, args, facts, win)
            messages.append({"role": "tool", "tool_call_id": tc.id,
                             "content": json.dumps(result, ensure_ascii=False)})

    # too many tool rounds: force a final text answer with tools off
    msg, cost = _call(with_tools=False)
    total_cost += cost
    content = msg.content or "(unable to complete after several tool calls)"
    messages.append({"role": "assistant", "content": content})
    return content, total_cost, tools_used
```

- [ ] **Step 5: Add the history block + full-context glue.**

```python
def build_history_block(token: str, account: str, level: str, raw_since: date,
                        until: date, currency: str, brand_id: str | None = None,
                        progress=None) -> str:
    """Build/refresh monthly historic facts, prune raw beyond 6 months, render
    (rnd chat.py 963-997; storage seam only)."""
    cache_rows = fetch_cache.cached_rows(account, level, brand_id=brand_id)

    def facts_for_month(first: date, last: date):
        if first >= raw_since and last <= until:      # fully inside the raw window
            fs, ls = first.isoformat(), last.isoformat()
            cached = [r for r in cache_rows if fs <= r.get("date_start", "") <= ls]
            if cached:
                return [asdict(mt.row_to_fact(r)) for r in cached]
        return [asdict(mt.row_to_fact(r))
                for r in ml.fetch_month_rows(token, account, first, last, level)]

    def hprog(i, total, ym):
        if progress:
            progress(f"historic monthly facts: {i}/{total}  {ym}")

    months = history.ensure(account, level, facts_for_month, date.today(),
                            progress=hprog, brand_id=brand_id)
    fetch_cache.prune_older_than(account, level,
                                 date.today() - timedelta(days=RAW_RETENTION_DAYS),
                                 brand_id=brand_id)
    return history.render_history_block(months, currency=currency)


def build_full_context(ds, token: str | None, account: str, level: str,
                       since: date, until: date, brand_id: str | None = None,
                       full: bool = FULL_DATA, competitor_block: str | None = None,
                       progress=None) -> str:
    """Assemble the complete context exactly as the rnd CLI does (rnd chat.py
    1120-1129): snapshot + analysis + history + competitor, same headers."""
    context = build_context(ds, full=full)
    facts = [f if isinstance(f, dict) else asdict(f) for f in ds.facts]
    analysis = brain.analyze(facts, currency=ds.currency)
    analysis_block = brain.render_analysis_block(analysis, currency=ds.currency)

    history_block = ""
    if token:
        try:
            history_block = build_history_block(token, account, level, since, until,
                                                ds.currency, brand_id=brand_id,
                                                progress=progress)
        except Exception:  # noqa: BLE001 -- history is additive, never fatal
            history_block = ""

    full_context = (context
                    + "\n\n=== CODE-COMPUTED ANALYSIS (exact deltas, trends & flags -- "
                      "trust these, do not recompute) ===\n" + analysis_block)
    if history_block:
        full_context += ("\n\n=== HISTORIC FACTS (monthly rollups, code-computed & exact -- "
                         "trust these) ===\n" + history_block)
    if competitor_block:
        full_context += ("\n\n=== COMPETITOR INTEL (competitors' live ads, scraped + "
                         "code-aggregated; counts are exact, use for competitive strategy) ===\n"
                         + competitor_block)
    return full_context
```

- [ ] **Step 6: Update `tests/test_chat.py`** — fix any assertions pinning the old model config (gemini / 1.5 / 1500) to the new constants, and add:

```python
def test_system_prompt_has_trust_blocks():
    from ai_layer import chat
    for marker in ("CODE-COMPUTED ANALYSIS", "HISTORIC FACTS", "COMPETITOR INTEL"):
        assert marker in chat.SYSTEM
    assert chat.MODEL == "openai/gpt-5.4-mini" and chat.TEMPERATURE == 0.5
    assert chat.MAX_TOKENS == 6000 and chat.REASONING_EFFORT == "minimal"


def test_build_context_pandas_free_output_shape():
    from ai_layer import chat, meta_transform as mt
    ds = mt.normalize({"meta": {"account_id": "a", "account_name": "N", "currency": "INR",
                                "date_range": {"since": "2026-07-01", "until": "2026-07-01"},
                                "level": "campaign", "source": "test"},
                       "data": [{"campaign_id": "c1", "campaign_name": "C",
                                 "date_start": "2026-07-01", "spend": "100",
                                 "impressions": "1000"}]})
    ctx = chat.build_context(ds, full=True)
    assert "PER-CAMPAIGN TOTALS" in ctx and "FULL PER-CAMPAIGN DAILY ROWS" in ctx
```

- [ ] **Step 7: Run tests.** `python -m pytest tests/test_tool_loop.py tests/test_chat.py -v` → PASS. Full suite: `python -m pytest` → PASS.

- [ ] **Step 8: Commit.** `feat(ai-layer/chat): gpt-5.4-mini config, SYSTEM v2, pandas-free context, ad-level tool loop, history + full-context glue`

---

### Task 10: competitor/ subpackage (discover, apify_ads, pipeline)

**Files:**
- Create: `apps/ai-layer/ai_layer/competitor/__init__.py` (empty)
- Create: `apps/ai-layer/ai_layer/competitor/discover.py`
- Create: `apps/ai-layer/ai_layer/competitor/apify_ads.py`
- Create: `apps/ai-layer/ai_layer/competitor/pipeline.py`
- Modify: `apps/ai-layer/ai_layer/config.py` (add `APIFY_TOKEN`), `apps/ai-layer/.env.example` + root `.env.example` (document `APIFY_TOKEN=`), `apps/ai-layer/pyproject.toml` (add `"ai_layer.competitor"` to the setuptools `packages` list)
- Test: `apps/ai-layer/tests/test_competitor.py` (new)

**Interfaces:**
- Consumes: Task 2 competitor repo methods; `config.OPENROUTER_API_KEY/OPENROUTER_BASE_URL/APIFY_TOKEN`; env `SHOPIFY_STORE/SHOPIFY_TOKEN/SHOPIFY_API_VERSION`.
- Produces (for Task 11/12):
  - `discover.ensure(key, brand, refresh=False, brand_id=None, **ctx) -> dict` (LLM discovery, cached in Neon), `discover.render_block(record)`
  - `apify_ads.scrape(key, discovered, max_competitors=6, ads_per=15, country="ALL", keep_raw=True, progress=None, brand_id=None) -> dict`, `apify_ads.load_ads(key, brand_id=None)`
  - `pipeline.auto_context(ds) -> dict`, `pipeline.aggregate(ads_record, top_hooks=8) -> dict`, `pipeline.render_block(...)`, `pipeline.build(account, ds, refresh=False, ..., brand_id=None, progress=None) -> (block, meta)`, `pipeline.stored_block(account, brand_id=None) -> str`
- Seams applied (and nothing else): env dict → `config`/`os.getenv`; disk JSON → repository; raw-httpx LLM call → OpenAI SDK; `SystemExit` → `RuntimeError` (so `pipeline.build`'s best-effort `except Exception` actually catches failures in a server); CLI `main()`/`_ask` entry points dropped.

- [ ] **Step 1: Write the failing tests** (`tests/test_competitor.py`):

```python
"""Competitor pipeline: aggregates, staleness, storage round-trip (Task 10). No network."""
from ai_layer.competitor import apify_ads, discover, pipeline


def _ad(competitor, days=10.0, cta="SHOP_NOW", text="Flat 50% off silk kurtas",
        video=False, active=True):
    return {"competitor": competitor, "active": active, "active_days": days,
            "cta_type": cta, "primary_text": text, "title": None, "caption": None,
            "card_texts": [], "is_carousel": False, "has_video": video}


def test_aggregate_counts_offers_formats_and_proven_creatives():
    record = {"ads_by_competitor": {
        "A": [_ad("A", days=200.0), _ad("A", days=5.0, text="New drop", cta="LEARN_MORE")],
        "B": [_ad("B", days=90.0, video=True, text="{{product.name}}")],   # template skipped
    }}
    agg = pipeline.aggregate(record)
    assert agg["total_ads"] == 3
    assert agg["offer_pct"] == 33                 # 1 of 3 has an offer phrase
    assert dict(agg["format_mix"])["video"] == 1
    hooks = [h["snippet"] for h in agg["top_hooks"]]
    assert "Flat 50% off silk kurtas" in hooks and all("{{" not in h for h in hooks)
    assert agg["top_hooks"][0]["days"] == 200.0   # longest-running first


def test_name_similarity_resolution():
    assert apify_ads._similar("Manyavar", "Manyavar Official") == 1.0
    assert apify_ads._similar("Manyavar", "Amazon Fashion") < apify_ads.NAME_MATCH
    items = [{"pageName": "Manyavar"}, {"pageName": "Manyavar"}, {"pageName": "Amazon"}]
    assert apify_ads._dominant_page(items) == ("Manyavar", 2)
    kept = apify_ads._filter_to_brand(items, "Manyavar")
    assert len(kept) == 2 and all(i["pageName"] == "Manyavar" for i in kept)


def test_discovery_storage_roundtrip(db_session):
    rec = {"brand": {"name": "X"}, "competitors": [{"name": "Rival"}]}
    discover.save("act_c1", rec)
    assert discover.load("act_c1")["competitors"][0]["name"] == "Rival"
    # ensure() returns the stored record without an LLM call when present
    assert discover.ensure("act_c1", "X")["competitors"][0]["name"] == "Rival"


def test_stored_block_and_staleness(db_session):
    discover.save("act_c2", {"brand_understanding": "sells kurtas",
                             "competitors": [{"name": "R", "tier": "direct",
                                              "confidence": "high", "facebook": "r"}]})
    block = pipeline.stored_block("act_c2")
    assert "R" in block                            # discovery-only block renders
    assert pipeline._is_stale(None) is True
    assert pipeline._is_stale({"scraped_at": "2020-01-01T00:00:00"}) is True


def test_geo_and_context_helpers():
    assert pipeline._country_code("India, US") == "IN"
    assert pipeline._geo_hint(["PS_IND_Sale", "PS_IND_Reels", "US_x"]) .startswith("India")
```

- [ ] **Step 2: Run to verify failure.** `python -m pytest tests/test_competitor.py -v` → FAIL.

- [ ] **Step 3: Port `discover.py`.** Copy `rnd_mine/cli/chat/discover.py`, then:
  1. Delete `find_root_env`/`load_env` (`:62-78`), `_ask`/`main` (`:196-225`), `import httpx`, `DISCOVERY_DIR`, `_path`.
  2. Add imports: `from openai import OpenAI`, `from ai_layer import config, cost_ledger`, `from ai_layer.db import repository as _repo`.
  3. `load`/`save` become repo-backed:

```python
def load(key: str, brand_id: str | None = None) -> dict | None:
    intel = _repo.load_competitor_intel(key, brand_id=brand_id)
    return intel["discovery"] if intel else None


def save(key: str, record: dict, brand_id: str | None = None) -> None:
    _repo.save_competitor_discovery(key, record, brand_id=brand_id)
```

  4. `discover(...)` keeps its prompt (`SYSTEM`, `_describe`), `DISCOVERY_MODEL`, temp 0.4, JSON mode, 2 attempts, and record shape **verbatim**; only the transport changes:

```python
def discover(brand: str, website: str | None = None, category: str | None = None,
             geo: str | None = None, notes: str | None = None,
             n: int = DEFAULT_N, account: str | None = None) -> tuple[dict, float]:
    """One live OpenRouter call. Returns (record, cost_usd). Raises on API/JSON error."""
    if not config.OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY not set")
    client = OpenAI(api_key=config.OPENROUTER_API_KEY, base_url=config.OPENROUTER_BASE_URL)
    user = _describe(brand, website, category, geo, notes)

    last_err = ""
    for attempt in (1, 2):
        resp = client.chat.completions.create(
            model=DISCOVERY_MODEL, temperature=0.4,
            response_format={"type": "json_object"},
            messages=[{"role": "system", "content": SYSTEM},
                      {"role": "user", "content": user}])
        content = resp.choices[0].message.content or ""
        usage = getattr(resp, "usage", None)
        real = getattr(usage, "model_extra", {}).get("cost") if usage is not None else None
        cost = cost_ledger.record(
            DISCOVERY_MODEL,
            getattr(usage, "prompt_tokens", 0) or 0,
            getattr(usage, "completion_tokens", 0) or 0,
            op="discover", account=account,
            cost_usd_actual=float(real) if real is not None else None)
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError as exc:
            last_err = str(exc)
            user = _describe(brand, website, category, geo, notes) + \
                f"\n\nYour previous reply was not valid JSON ({exc}). Return ONLY corrected JSON."
            continue
        competitors = parsed.get("competitors", []) or []
        record = {
            "brand": {"name": brand, "website": website, "category": category, "geo": geo},
            "brand_understanding": parsed.get("brand_understanding", ""),
            "discovered_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "model": DISCOVERY_MODEL,
            "competitors": competitors[:n],
        }
        return record, cost
    raise RuntimeError(f"discovery: model did not return valid JSON after 2 attempts ({last_err})")
```

  5. `ensure(key, brand, refresh=False, brand_id=None, **ctx)` — same logic as rnd (`:165-176`), passing `account=key` into `discover` and `brand_id` into `load`/`save`.

- [ ] **Step 4: Port `apify_ads.py`.** Copy `rnd_mine/cli/chat/apify_ads.py`, then:
  1. Delete `import discover`, `ADS_DIR`, `_path`, `main()` (`:276-296`); keep `httpx`.
  2. `load_ads`/`save_ads` become repo-backed (`load_competitor_intel(...)["ads"]` / `save_competitor_ads`), signatures gaining `brand_id=None`.
  3. `scrape(env, key, ...)` → `scrape(key, discovered, ..., brand_id=None)`: replace `env.get("APIFY_TOKEN")` with `config.APIFY_TOKEN` (import `from ai_layer import config`) and `SystemExit` with `RuntimeError`. **Everything else — `_page_url`, `_keyword_url`, `run_scraper`, `_norm`, `_similar`, `_dominant_page`, `_filter_to_brand`, `scrape_competitor`, `_text`, `_run_days`, `normalize_ad`, all caps — verbatim.**

- [ ] **Step 5: Port `pipeline.py`.** Copy `rnd_mine/cli/chat/competitor.py`, then:
  1. Imports become `from ai_layer.competitor import apify_ads, discover` (+ `import os`, `from ai_layer import config`, `from ai_layer.db import repository as _repo`).
  2. Config seam: `_shopify_context(env)` → `_shopify_context()` reading `os.getenv("SHOPIFY_STORE")` / `os.getenv("SHOPIFY_TOKEN")` / `os.getenv("SHOPIFY_API_VERSION", "2024-07")`; `auto_context(env, ds)` → `auto_context(ds)`; `build(env, account, ds, ...)` → `build(account, ds, refresh=False, max_competitors=..., ads_per=..., progress=None, brand_id=None)` with the `env.get("APIFY_TOKEN")` gate → `config.APIFY_TOKEN`. **`aggregate`, `render_block`, `_is_stale`, `_country_code`, `_geo_hint`, the regexes, `STALE_DAYS` — verbatim.**
  3. `ds.facts` access: `auto_context` reads `f["campaign_name"]` — accept dataclasses too: first line `facts = [f if isinstance(f, dict) else __import__("dataclasses").asdict(f) for f in ds.facts]`… write it cleanly:

```python
from dataclasses import asdict
# inside auto_context:
    facts = [f if isinstance(f, dict) else asdict(f) for f in ds.facts]
    names = [f["campaign_name"] for f in facts]
```

  (and the spend loop iterates `facts`).
  4. Add the API-path helper (new, small — the spec's "never scrape inline" rule):

```python
def stored_block(account: str, brand_id: str | None = None) -> str:
    """Render competitor intel from what's already stored -- no discovery, no
    scraping, no cost. Empty string when nothing is stored (block omitted)."""
    intel = _repo.load_competitor_intel(account, brand_id=brand_id)
    if not intel or not intel.get("discovery"):
        return ""
    ads_record = intel.get("ads") or {"ads_by_competitor": {}}
    agg = aggregate(ads_record)
    return render_block(intel["discovery"], ads_record, agg)
```

  5. `build` stores through the ported `discover.ensure` / `apify_ads.scrape` (which now persist to Neon) — its orchestration body stays line-for-line otherwise, including the `_is_stale` gate and `meta` dict.
  6. `config.py`: add `APIFY_TOKEN = os.getenv("APIFY_TOKEN", "")` following the file's existing pattern (read the file first and match it). `.env.example` files: add `APIFY_TOKEN=` with a one-line comment. `pyproject.toml` packages list: add `"ai_layer.competitor"`.

- [ ] **Step 6: Run tests.** `python -m pytest tests/test_competitor.py -v` → PASS. Full suite green.

- [ ] **Step 7: Commit.** `feat(ai-layer/competitor): discovery + Apify scrape + code aggregates on Neon (rnd port)`

---

### Task 11: API wiring (schemas, /chat tool loop, /competitors, /ingest warm)

**Files:**
- Modify: `apps/ai-layer/ai_layer/schemas.py`, `apps/ai-layer/ai_layer/api.py`
- Test: `apps/ai-layer/tests/test_api.py` (extend)

**Interfaces:**
- Consumes: `chat.build_full_context`, `chat.run_tool_loop`, `fetch_cache.fetch_cached`, `ml.fetch_envelope`, `competitor.pipeline`, Task 2 repo methods.
- Produces: `ChatRequest.days: int = 30`, `ChatRequest.source` default `"cache"`; `ChatResponse.tools_used: list[str] = []`; `GET /competitors/{account_id}`, `POST /competitors/{account_id}/refresh`; `/ingest` `warm` param.

- [ ] **Step 1: Write the failing tests.** Append to `tests/test_api.py` (mirror the file's existing TestClient/monkeypatch fixtures):

```python
def test_chat_default_source_runs_tool_loop(client, monkeypatch):
    from ai_layer import api as api_mod, chat, meta_transform as mt

    ds = mt.normalize({"meta": {"account_id": "act_1", "account_name": "N",
                                "currency": "INR",
                                "date_range": {"since": "2026-07-01", "until": "2026-07-28"},
                                "level": "campaign", "source": "live+cache"},
                       "data": [{"campaign_id": "c", "campaign_name": "C",
                                 "date_start": "2026-07-01", "spend": "10",
                                 "impressions": "100"}]})
    monkeypatch.setattr(api_mod, "_cached_dataset",
                        lambda account_id, days, token, brand: (ds, None))
    monkeypatch.setattr(chat, "build_full_context",
                        lambda *a, **k: "CTX")
    monkeypatch.setattr(chat, "run_tool_loop",
                        lambda client_, messages, account, token, brand_id=None, progress=None:
                        ("**answer**", 0.01, ["top_ads"]))
    r = client.post("/chat", json={"account_id": "act_1", "message": "top ads?"},
                    headers={"X-Meta-Token": "tok"})
    assert r.status_code == 200
    body = r.json()
    assert body["answer"] == "**answer**" and body["tools_used"] == ["top_ads"]


def test_chat_source_store_keeps_legacy_path(client, monkeypatch):
    from ai_layer import api as api_mod, chat
    called = {}
    monkeypatch.setattr(chat, "complete",
                        lambda c, m, stream=False, account=None:
                        called.setdefault("complete", True) or ("legacy", 0.0))
    # reuse the file's existing store-seeding pattern for act_1 here
    r = client.post("/chat", json={"account_id": "act_1", "message": "hi",
                                   "source": "store"})
    assert r.status_code in (200, 404)     # 404 only if the store fixture is empty
    if r.status_code == 200:
        assert called.get("complete") and r.json()["tools_used"] == []


def test_competitors_get_404_before_refresh(client):
    assert client.get("/competitors/act_none").status_code == 404


def test_competitors_get_serves_stored_intel(client, db_session):
    from ai_layer.competitor import discover
    discover.save("act_ci", {"brand_understanding": "kurtas",
                             "competitors": [{"name": "R"}]})
    r = client.get("/competitors/act_ci")
    assert r.status_code == 200
    body = r.json()
    assert body["discovered"] == 1 and "R" in body["block"]
```

Run: `python -m pytest tests/test_api.py -k "chat_default or chat_source or competitors" -v` → FAIL.

- [ ] **Step 2: schemas.py.** In `ChatRequest`: change `source: str = "store"` to `source: str = "cache"  # cache (default) | store | live-legacy compat | connectors` and add `days: int = 30` (with a comment: the raw window; any timeline works, floored at ~183d server-side). In `ChatResponse`: add `tools_used: list[str] = []`. Add:

```python
class CompetitorIntelResponse(BaseModel):
    account_id: str
    discovered: int
    scraped_ads: int
    scraped_at: Optional[str] = None
    stale: bool
    block: str


class CompetitorRefreshResponse(BaseModel):
    account_id: str
    status: str                      # started
```

- [ ] **Step 3: api.py.** Import the new pieces (`from ai_layer import fetch_cache`, `from ai_layer.competitor import pipeline as competitor_pipeline`, `from ai_layer.db import repository as _repo`, `from datetime import date, timedelta`, `BackgroundTasks` from fastapi, plus `CompetitorIntelResponse, CompetitorRefreshResponse` from schemas). Then:

  1. Add the cache-backed dataset builder:

```python
def _cached_dataset(account_id: str, days: int, token: str, brand: str | None):
    """Cache-backed range fetch -> Dataset (the new default /chat source)."""
    days = max(1, int(days or 30))
    until = date.today() - timedelta(days=1)
    since = until - timedelta(days=days - 1)
    raw_floor = date.today() - timedelta(days=chat.RAW_RETENTION_DAYS)
    if since < raw_floor:
        since = raw_floor                      # older periods live in HISTORIC FACTS

    def _fr(lo, hi):
        return ml.fetch_envelope(token, account=account_id, since=lo, until=hi,
                                 level="campaign")["data"]

    rows, _stats = fetch_cache.fetch_cached(account_id, "campaign", since, until,
                                            _fr, brand_id=brand)
    accts = {f"act_{a['account_id']}": a for a in ml.list_accounts(token)}
    am = accts.get(account_id, {})
    dates = [r.get("date_start") for r in rows if r.get("date_start")]
    ds = mt.normalize({
        "meta": {"account_id": account_id, "account_name": am.get("name", "?"),
                 "currency": am.get("currency", "INR"), "level": "campaign",
                 "source": "live+cache",
                 "date_range": {"since": min(dates) if dates else since.isoformat(),
                                "until": max(dates) if dates else until.isoformat()}},
        "data": rows,
    })
    return ds, (since, until)
```

  2. Rework `_chat_messages(req, token, brand)` (add the `brand` param; both endpoints pass `brand: str | None = Depends(caller_brand)`):

```python
def _chat_messages(req: ChatRequest, token: str | None, brand: str | None):
    mode = "full" if req.full else req.context_mode
    if mode not in ("summary", "full"):
        mode = "summary"
    session_id = req.session_id or context_cache.new_session_id()
    cache_mode = f"{mode}:{req.source}:{req.days}"      # days/source-aware session key
    context = context_cache.get(session_id, req.account_id, cache_mode)
    cached = context is not None
    if not cached:
        if req.source in ("store", "connectors", "live"):
            ds = _dataset(req.account_id, req.source, token, "last_30d")
            if len(ds) == 0:
                raise HTTPException(status_code=404, detail="no data for this account")
            context = chat.build_context(ds, full=(mode == "full"))   # legacy behavior
        else:
            ds, (since, until) = _cached_dataset(req.account_id, req.days,
                                                 _need_token(token), brand)
            if len(ds) == 0:
                raise HTTPException(status_code=404, detail="no data for this account")
            comp_block = competitor_pipeline.stored_block(req.account_id, brand_id=brand)
            context = chat.build_full_context(ds, token, req.account_id, "campaign",
                                              since, until, brand_id=brand,
                                              full=(mode == "full"),
                                              competitor_block=comp_block or None)
        context_cache.put(session_id, req.account_id, cache_mode, context)
    messages = [{"role": "system", "content": chat.SYSTEM.format(context=context)}]
    messages += (req.history or [])
    messages.append({"role": "user", "content": req.message})
    return messages, session_id, mode, cached
```

  3. `chat_endpoint`: pass `brand`, and branch the answer path:

```python
    messages, session_id, mode, cached = _chat_messages(req, token, brand)
    client = OpenAI(api_key=config.OPENROUTER_API_KEY, base_url=config.OPENROUTER_BASE_URL)
    if req.source in ("store", "connectors", "live"):
        answer, cost = chat.complete(client, messages, stream=False, account=req.account_id)
        tools_used: list[str] = []
    else:
        answer, cost, tools_used = chat.run_tool_loop(client, messages, req.account_id,
                                                      token, brand_id=brand)
    cost = round(cost, 6)
    return ChatResponse(account_id=req.account_id, answer=answer, model=chat.MODEL,
                        cost_usd=cost, session_id=session_id, context_mode=mode,
                        cached=cached, tools_used=tools_used)
```

  4. `chat_stream_endpoint`: only change the `_chat_messages` call to pass `brand` (streaming stays toolless — spec §9.6).
  5. Competitor endpoints (after `/cost`):

```python
@app.get("/competitors/{account_id}", response_model=CompetitorIntelResponse,
         dependencies=[Depends(require_api_key)])
def competitors_get(account_id: str, brand: str | None = Depends(caller_brand)):
    intel = _repo.load_competitor_intel(account_id, brand_id=brand)
    if not intel or not intel.get("discovery"):
        raise HTTPException(status_code=404,
                            detail="no competitor intel stored; POST /competitors/{id}/refresh")
    ads = intel.get("ads") or {}
    return CompetitorIntelResponse(
        account_id=account_id,
        discovered=len(intel["discovery"].get("competitors", [])),
        scraped_ads=int(ads.get("total_ads", 0)),
        scraped_at=intel.get("scraped_at"),
        stale=competitor_pipeline._is_stale(ads or None),
        block=competitor_pipeline.stored_block(account_id, brand_id=brand))


@app.post("/competitors/{account_id}/refresh", response_model=CompetitorRefreshResponse,
          dependencies=[Depends(require_api_key)])
def competitors_refresh(account_id: str, background: BackgroundTasks,
                        token: str | None = Depends(caller_token),
                        brand: str | None = Depends(caller_brand)):
    ds = store.load_dataset(account_id)
    if len(ds) == 0 and token:
        ds = ml.fetch_dataset(token, account=account_id, preset="last_30d")
    if len(ds) == 0:
        raise HTTPException(status_code=404, detail="no account data to build context from")

    def _run():
        try:
            competitor_pipeline.build(account_id, ds, refresh=True, brand_id=brand)
        except Exception:  # noqa: BLE001 -- background best-effort
            import logging
            logging.getLogger("ai_layer.api").exception("competitor refresh failed")

    background.add_task(_run)
    return CompetitorRefreshResponse(account_id=account_id, status="started")
```

  6. `ingest` endpoint: add `warm: str | None = Query(None)`; after the store ingest, if `warm` contains `"cache"` run `_cached_dataset(account_id, 30, _need_token(token), None)`, and if it contains `"history"` run `chat.build_history_block(_need_token(token), account_id, "campaign", date.today() - timedelta(days=30), date.today() - timedelta(days=1), "INR")` (both incremental + idempotent), then return the existing `IngestResult`.

- [ ] **Step 4: Run tests.** `python -m pytest tests/test_api.py -v` → PASS. Full suite green.

- [ ] **Step 5: Commit.** `feat(ai-layer/api): tool-loop /chat with cache-backed context, /competitors endpoints, ingest warm`

---

### Task 12: CLI rewire + capability driver

**Files:**
- Modify: `apps/ai-layer/ai_layer/chat.py` (`main()` only)
- Create: `apps/ai-layer/tools/chat_capability_run.py`
- Test: manual (live) — the pytest suite must simply stay green.

**Interfaces:**
- Consumes: everything from Tasks 9–11.
- Produces: `python -m ai_layer.chat` runs the full pipeline (cache fetch → full context incl. competitor refresh → tool-loop REPL); `python tools/chat_capability_run.py` writes `tools/chat_capability_results.md`.

- [ ] **Step 1: Rewire `chat.main()`.** Keep argparse (shell seam) with flags `--data`, `--account`, `--days` (int, default 30 — replaces `--preset`), `--level` (default campaign), `--full/--no-full`, `--refresh-competitors` (store_true). Body mirrors rnd `main()` (`rnd chat.py:1004-1163`) with the seams:
  - env checks via `config.OPENROUTER_API_KEY` / `config.META_ACCESS_TOKEN`;
  - fetch: compute `until = date.today() - timedelta(days=1)`, `since = until - timedelta(days=args.days - 1)`, floor at `RAW_RETENTION_DAYS` with the same printed note; `fetch_cache.fetch_cached(account, args.level, since, until, _fetch_range)` where `_fetch_range` wraps `ml.fetch_envelope(..., progress=_progress)` and prints skipped windows — print the same cache-stats lines as rnd (`from_cache` / `cached_days`/`fetched_days`);
  - context: `competitor_block, cmeta = competitor_pipeline.build(account, ds, refresh=args.refresh_competitors, progress=...)` inside try/except (best-effort, prints the skip reason) — the CLI is the one surface allowed to scrape inline; then `chat.build_full_context(ds, token, account, args.level, since, until, full=args.full, competitor_block=competitor_block or None, progress=print)`;
  - REPL: per turn `run_tool_loop(client, messages, account, token, progress=lambda s: print(f"  {s}", flush=True))`, printing the returned answer, rolling back `messages` to the pre-turn length on exception (rnd `chat.py:1152-1160`); exit prints `cost_ledger.total_usd()`.

- [ ] **Step 2: Create `tools/chat_capability_run.py`** — the rnd `test_suite.py` adapted to drive the app in-process (creative-tools pattern; see `tools/creative_api_liverun.py` for the TestClient setup):
  - Copy `TEST_CASES` **verbatim** from `rnd_mine/cli/chat/test_suite.py:37-103` (all 26).
  - `ACCOUNT = "act_1738503939658460"`, `DAYS = 30`, `OUT = Path(__file__).parent / "chat_capability_results.md"`.
  - Body: `from fastapi.testclient import TestClient; from ai_layer.api import app`; for each `(cat, q)`: `client.post("/chat", json={"account_id": ACCOUNT, "message": q, "days": DAYS}, headers=...)`, collect `answer`, `cost_usd`, `tools_used`; write the same markdown structure as the rnd suite (header with model/config/account, `## <category>` sections, per-question cost, total cost at the end, plus a `tools: [...]` line per answer).
  - Guard: refuse to run unless `META_ACCESS_TOKEN` and `OPENROUTER_API_KEY` are set; print the expected cost (~$0.35) and require `--yes` to proceed (frugality rule).
  - This script is NOT collected by pytest (it lives in `tools/`, name doesn't match `test_*.py` inside `tests/`).

- [ ] **Step 3: Run the offline gate.** `python -m pytest` → green.

- [ ] **Step 4: Commit.** `feat(ai-layer/chat): CLI on the full pipeline + capability-run driver`

---

### Task 13: Fidelity verification + final suite + live validation

**Files:**
- No new code (verification only; fixes go to the module they belong to).

- [ ] **Step 1: Fidelity diffs (spec §0 deliverable).** For each pair, diff and confirm ONLY sanctioned-seam differences (imports, storage calls, config reads, SDK transport, progress callbacks, brand_id kwargs):

```bash
git diff --no-index rnd_mine/cli/chat/ad_tools.py apps/ai-layer/ai_layer/ad_tools.py   # MUST be empty
git diff --no-index rnd_mine/cli/chat/cache.py    apps/ai-layer/ai_layer/fetch_cache.py
git diff --no-index rnd_mine/cli/chat/history.py  apps/ai-layer/ai_layer/history.py
git diff --no-index rnd_mine/cli/chat/brain.py    apps/ai-layer/ai_layer/brain.py
git diff --no-index rnd_mine/cli/chat/discover.py apps/ai-layer/ai_layer/competitor/discover.py
git diff --no-index rnd_mine/cli/chat/apify_ads.py apps/ai-layer/ai_layer/competitor/apify_ads.py
git diff --no-index rnd_mine/cli/chat/competitor.py apps/ai-layer/ai_layer/competitor/pipeline.py
```

  For `chat.py`/`meta_live.py`/`meta_transform.py` (merged files), verify region-by-region against the rnd line ranges given in Tasks 3, 4, 9: `SYSTEM` string byte-identical; `get_insights_paged`, `_fetch_window_adaptive`, `_date_windows`, `fetch_month_rows`, `row_to_fact` value logic, `build_context` output format, tool-loop round structure identical. Any unsanctioned difference: fix the ai-layer side to match rnd, never the reverse.

- [ ] **Step 2: Constants audit.** Grep the ported modules and confirm every Global-Constraints value plus: `NOISE_PCT=10.0`, `FATIGUE_ROAS_DROP=25.0`, `FATIGUE_FREQ_RISE=10.0`, `SCALING_ROAS_RISE=25.0`, `CTR_DROP=20.0`, `CPM_SPIKE=30.0`, `ANOMALY_DEV=20.0`, `MAX_CAMPAIGN_FINDINGS=8`, `MATERIAL_SPEND_PCT=0.01`, `MIN_WINDOW_PURCHASES=5`, `_MIN_SPEND=500.0`, `_MIN_PURCHASES=3`, `MAX_COMPETITORS=6`, `ADS_PER_COMPETITOR=15`, `MIN_PAGE_ADS=3`, `NAME_MATCH=0.6`, `STALE_DAYS=7`, `DISCOVERY_MODEL="openai/gpt-5.4-mini"`, `DEFAULT_N=12`.

- [ ] **Step 3: Full offline suite.** `python -m pytest` from `apps/ai-layer/` → all green. Fix anything red before proceeding.

- [ ] **Step 4: Live smoke (needs lemon's go — costs real money).** STOP and confirm with the user before this step. Then: `python -m ai_layer.chat --account act_1738503939658460 --days 30` (one question: "top 5 ads by ROAS?" — verifies Meta fetch, cache write, history, tool loop end-to-end), followed by `python tools/chat_capability_run.py --yes` (~$0.35) and a manual diff of `tools/chat_capability_results.md` against `rnd_mine/cli/chat/test_results_4.md` for answer-quality parity.

- [ ] **Step 5: Final commit.** Any remaining fixes + `chore(ai-layer): fidelity verification pass for chat intelligence integration`

---

## Self-Review (run after drafting — completed)

- **Spec coverage:** §2 model/config → Task 9; §3 module map → Tasks 3–10, 12; §4 details → Tasks 3 (meta_live), 4 (transform), 8 (brain), 9 (chat), 5 (fetch_cache), 6 (history), 10 (competitor), 9 (cost pricing); §5 data model → Tasks 1–2; §6 API → Task 11; §7 flow → Tasks 9+11; §8 error handling → degradation paths in Tasks 5 (cache fallback), 9 (history best-effort, tool errors as `{"error":...}`, round cap), 10 (SystemExit→RuntimeError so best-effort catches hold), 11 (background refresh, never-inline scraping); §9 deviations → encoded exactly where they apply; §10 testing → per-task TDD + Task 13; §11 out-of-scope → nothing here builds it.
- **Placeholder scan:** no TBDs; every code step shows code or an exact copy source + exact seam edits.
- **Type consistency:** `run_tool_loop(client, messages, account, token, brand_id=None, progress=None) -> (str, float, list[str])` consistent across Tasks 9/11/12; `fetch_cached(..., today=None, brand_id=None)` across 5/9/11; repository names identical in Tasks 2/5/6/10/11; `build_full_context(ds, token, account, level, since, until, brand_id, full, competitor_block, progress)` across 9/11/12; `stored_block(account, brand_id=None)` across 10/11.
