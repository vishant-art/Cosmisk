"""Flat-file incremental fetch cache for Meta Ads daily rows.

Meta's daily Insights pulls are slow (~40s per 14-day window on a big account),
so we persist raw rows to disk and only fetch what's missing. Two rules keep the
cache correct:

  - Data older than FINAL_LAG_DAYS is treated as FINAL and never re-fetched.
  - The trailing FINAL_LAG_DAYS are ALWAYS re-fetched, because Meta keeps
    revising recent attribution for about a week.

Storage is intentionally plain (matches the standalone style):
  cache/<account>__<level>.jsonl        one raw Meta row per line
  cache/<account>__<level>.meta.json    the set of dates already fetched
(both are gitignored). This same store is what Phase 2's tiering will build on.
"""
from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

CACHE_DIR = Path(__file__).resolve().parent / "cache"
FINAL_LAG_DAYS = 7   # trailing days Meta still revises -> always re-fetch


def _paths(account: str, level: str) -> tuple[Path, Path]:
    stem = f"{account}__{level}"
    return CACHE_DIR / f"{stem}.jsonl", CACHE_DIR / f"{stem}.meta.json"


def _key(row: dict) -> tuple:
    """Identity of one raw Meta row within a level (dedupe / upsert key)."""
    return (row.get("campaign_id", ""), row.get("adset_name", ""),
            row.get("ad_name", ""), row.get("date_start", ""))


def _load_rows(account: str, level: str) -> dict[tuple, dict]:
    rows_path, _ = _paths(account, level)
    if not rows_path.is_file():
        return {}
    out: dict[tuple, dict] = {}
    for line in rows_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            continue
        out[_key(r)] = r
    return out


def _load_fetched(account: str, level: str) -> set[str]:
    _, meta_path = _paths(account, level)
    if not meta_path.is_file():
        return set()
    try:
        return set(json.loads(meta_path.read_text(encoding="utf-8")).get("fetched_dates", []))
    except (json.JSONDecodeError, OSError):
        return set()


def _save_rows(account: str, level: str, rows: dict[tuple, dict]) -> None:
    rows_path, _ = _paths(account, level)
    CACHE_DIR.mkdir(exist_ok=True)
    ordered = sorted(rows.values(), key=lambda r: (r.get("date_start", ""),
                                                   r.get("campaign_id", "")))
    with rows_path.open("w", encoding="utf-8") as fh:
        for r in ordered:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")


def _save_fetched(account: str, level: str, fetched: set[str]) -> None:
    _, meta_path = _paths(account, level)
    CACHE_DIR.mkdir(exist_ok=True)
    meta_path.write_text(json.dumps({"fetched_dates": sorted(fetched)}, indent=0),
                         encoding="utf-8")


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
                 fetch_range, today: date | None = None) -> tuple[list[dict], dict]:
    """Return raw Meta rows for [since, until], fetching only what's missing.

    `fetch_range(lo, until)` must fetch and return raw rows for a date span.
    Returns (rows, stats) where stats reports how much was served from cache."""
    today = today or date.today()
    floor = (today - timedelta(days=FINAL_LAG_DAYS)).isoformat()

    rows = _load_rows(account, level)
    fetched = _load_fetched(account, level)
    needed = set(_dates(since, until))
    final = {d for d in fetched if d < floor}         # cached AND settled
    missing = sorted(needed - final)                  # missing OR still-revising

    stats = {"cached_days": len(needed & final), "fetched_days": 0, "from_cache": not missing}
    if missing:
        for lo, hi in _contiguous_runs([date.fromisoformat(d) for d in missing]):
            new_rows = fetch_range(lo, hi) or []
            # drop stale rows in the re-fetched span, then upsert the fresh ones so
            # revised recent days replace their prior values cleanly.
            span = set(_dates(lo, hi))
            rows = {k: r for k, r in rows.items() if r.get("date_start", "") not in span}
            for r in new_rows:
                rows[_key(r)] = r
            fetched |= span
            stats["fetched_days"] += len(span)
        _save_rows(account, level, rows)
        _save_fetched(account, level, fetched)

    since_s, until_s = since.isoformat(), until.isoformat()
    out = [r for r in rows.values() if since_s <= r.get("date_start", "") <= until_s]
    return out, stats


def cached_rows(account: str, level: str) -> list[dict]:
    """All raw rows currently in the cache for this account+level (no fetch)."""
    return list(_load_rows(account, level).values())


def prune_older_than(account: str, level: str, cutoff: date) -> int:
    """Drop cached raw rows older than `cutoff` (the 6-month raw boundary -- older
    data lives on as monthly facts in history.py, not raw rows). Also forgets those
    fetched-dates so the store never claims to hold days it has discarded. Returns
    the number of rows dropped."""
    rows = _load_rows(account, level)
    if not rows:
        return 0
    cutoff_s = cutoff.isoformat()
    keep = {k: r for k, r in rows.items() if r.get("date_start", "") >= cutoff_s}
    dropped = len(rows) - len(keep)
    if dropped:
        _save_rows(account, level, keep)
        fetched = {d for d in _load_fetched(account, level) if d >= cutoff_s}
        _save_fetched(account, level, fetched)
    return dropped
