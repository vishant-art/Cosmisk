"""Facts store — thin shim delegating to the Neon repository (ai_layer schema).

Public signatures are unchanged; SQLite is retired (see the #29 design spec). The
trailing-window UPSERT semantics now live in `db.repository` against Postgres."""
from __future__ import annotations

from ai_layer import meta_live as ml
from ai_layer import meta_transform as mt
from ai_layer.db import repository as _repo


def init() -> None:
    """No-op: the schema is owned by Alembic (`python -m ai_layer.db.migrate`)."""


def upsert_dataset(ds: mt.Dataset) -> int:
    return _repo.upsert_dataset(ds)


def load_dataset(account_id: str, since: str | None = None, until: str | None = None) -> mt.Dataset:
    return _repo.load_dataset(account_id, since=since, until=until)


def ingest(token: str, account: str, preset: str = "last_30d", level: str = "campaign") -> dict:
    ds = ml.fetch_dataset(token, account=account, preset=preset, level=level)
    n = upsert_dataset(ds)
    return {"account_id": account, "rows_upserted": n, "since": ds.since, "until": ds.until}
