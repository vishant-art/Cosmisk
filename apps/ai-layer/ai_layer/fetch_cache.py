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
    fetched_fresh: list[dict] = []   # kept in memory so a failed cache write never loses them
    write_failed = False
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
        except Exception:  # noqa: BLE001 -- store write failure never loses the fetch;
            # the fresh rows are kept in memory below and returned unpersisted.
            log.exception("insight cache write failed (continuing with fetched rows)")
            write_failed = True
            fetched_fresh.extend(r for r in new_rows if r.get("date_start"))
        stats["fetched_days"] += len(span)

    try:
        rows = _repo.load_insight_rows(account, level, since=since.isoformat(),
                                       until=until.isoformat(), brand_id=brand_id)
    except Exception:  # noqa: BLE001
        log.exception("insight cache read-back failed; fetching directly")
        return (fetch_range(since, until) or []), stats
    if write_failed and fetched_fresh:
        # merge unpersisted fresh rows over the read-back (dedupe by (date, key); fresh wins)
        merged = {(r.get("date_start", ""), _key(r)): r for r in rows}
        for r in fetched_fresh:
            merged[(r.get("date_start", ""), _key(r))] = r
        since_s, until_s = since.isoformat(), until.isoformat()
        rows = sorted((r for r in merged.values()
                       if since_s <= r.get("date_start", "") <= until_s),
                      key=lambda r: (r.get("date_start", ""), _key(r)))
    return rows, stats


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
