"""Phase 3 -- accumulating SQLite store for Meta facts.

The chatbot/brain were stateless (rolling re-pull each run). This store persists
`CampaignDayFact` rows so history ACCUMULATES, and uses **trailing-window UPSERT**:
each `ingest()` re-pulls a recent window and INSERT-OR-REPLACEs on
`(account_id, campaign_id, date)`. So:
  - new days are appended,
  - the recent (still-restating) days are overwritten with corrected numbers,
  - older days stay untouched.

SQLite, self-contained (`config.STORE_DB_PATH`), never touches the main Neon DB.
For large historical backfills the Meta async report job is still needed (a sync
90-day pull 500s); that's a documented follow-up. The daily trailing window
(<=30d) works on the sync path.
"""
from __future__ import annotations

import sqlite3
from dataclasses import asdict, fields
from datetime import datetime, timezone

from ai_layer import config
from ai_layer import meta_live as ml
from ai_layer import meta_transform as mt

_FACT_COLS = [f.name for f in fields(mt.CampaignDayFact)]   # campaign_id..cpa
_TEXT_COLS = {"campaign_id", "campaign_name", "date"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _conn() -> sqlite3.Connection:
    config.STORE_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(config.STORE_DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def init() -> None:
    cols = ", ".join(f"{n} {'TEXT' if n in _TEXT_COLS else 'REAL'}" for n in _FACT_COLS)
    with _conn() as c:
        c.execute("CREATE TABLE IF NOT EXISTS accounts("
                  "account_id TEXT PRIMARY KEY, account_name TEXT, currency TEXT, updated_at TEXT)")
        c.execute(f"CREATE TABLE IF NOT EXISTS facts("
                  f"account_id TEXT NOT NULL, {cols}, updated_at TEXT, "
                  f"PRIMARY KEY (account_id, campaign_id, date))")


def upsert_dataset(ds: mt.Dataset) -> int:
    """INSERT-OR-REPLACE every fact (trailing-window upsert). Returns rows written."""
    init()
    now = _now()
    placeholders = ",".join(["?"] * (len(_FACT_COLS) + 2))
    with _conn() as c:
        c.execute(
            "INSERT INTO accounts(account_id, account_name, currency, updated_at) "
            "VALUES(?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET "
            "account_name=excluded.account_name, currency=excluded.currency, updated_at=excluded.updated_at",
            (ds.account_id, ds.account_name, ds.currency, now))
        n = 0
        for f in ds.facts:
            d = asdict(f)
            c.execute(
                f"INSERT OR REPLACE INTO facts(account_id, {','.join(_FACT_COLS)}, updated_at) "
                f"VALUES({placeholders})",
                (ds.account_id, *[d[k] for k in _FACT_COLS], now))
            n += 1
    return n


def load_dataset(account_id: str, since: str | None = None, until: str | None = None) -> mt.Dataset:
    """Read accumulated facts back into a typed Dataset (source='store')."""
    init()
    with _conn() as c:
        acc = c.execute("SELECT * FROM accounts WHERE account_id=?", (account_id,)).fetchone()
        q, params = "SELECT * FROM facts WHERE account_id=?", [account_id]
        if since:
            q += " AND date>=?"; params.append(since)
        if until:
            q += " AND date<=?"; params.append(until)
        q += " ORDER BY campaign_name, date"
        rows = c.execute(q, params).fetchall()
    facts = tuple(mt.CampaignDayFact(**{k: r[k] for k in _FACT_COLS}) for r in rows)
    dates = [f.date for f in facts]
    return mt.Dataset(
        account_id=account_id,
        account_name=acc["account_name"] if acc else account_id,
        currency=acc["currency"] if acc else "INR",
        since=min(dates) if dates else None,
        until=max(dates) if dates else None,
        level="campaign", source="store", facts=facts)


def ingest(token: str, account: str, preset: str = "last_30d", level: str = "campaign") -> dict:
    """Live trailing-window pull -> upsert into the store. The rolling preset
    (default last_30d) restates the recent window and appends new days."""
    ds = ml.fetch_dataset(token, account=account, preset=preset, level=level)
    n = upsert_dataset(ds)
    return {"account_id": account, "rows_upserted": n, "since": ds.since, "until": ds.until}
