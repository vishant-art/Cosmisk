"""File 2 -- live Meta Ads probe.

Uses META_ACCESS_TOKEN from the repo-root .env to call the real Graph API and
show, in the CLI, exactly what we receive: which ad accounts the token can see,
plus a real Insights pull (raw JSON of one row + the field/action_type inventory
+ a flattened table). Answers "what content are we actually getting from Meta,
and in what shape?".

With --save it writes the full pull to a {meta, data} envelope JSON that brain.py
and chat.py can consume directly (real data, same shape as mock_meta_ads.json).

    python meta_live.py                                          # first account, last_7d, campaign
    python meta_live.py --account act_123 --preset last_30d --level ad
    python meta_live.py --account act_123 --preset last_30d --save _real_sample.json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date, timedelta
from pathlib import Path

import httpx
import pandas as pd

from ai_layer import config
from ai_layer import meta_transform as mt

# Windows consoles default to cp1252 and choke on non-ASCII; force UTF-8 output.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

# Bump if Meta deprecates the version. v23.0 is current/non-deprecated as of 2026.
GRAPH_API_VERSION = "v23.0"
GRAPH_BASE = f"https://graph.facebook.com/{GRAPH_API_VERSION}"

# Production field set. Note link-click fields (inline_link_clicks / _ctr /
# cost_per_inline_link_click) requested ALONGSIDE the all-clicks ones, plus
# account_currency. purchase_roas/website_purchase_roas pulled for cross-check
# only; the transform DERIVES ROAS.
FIELDS = [
    "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name",
    "account_currency",
    "spend", "impressions", "reach", "frequency",
    "clicks", "ctr", "cpc",
    "inline_link_clicks", "inline_link_click_ctr", "cost_per_inline_link_click",
    "cpm", "actions", "action_values", "purchase_roas", "website_purchase_roas",
    # video: 3-sec views come via actions.video_view; thruplay/plays are their own fields
    "video_thruplay_watched_actions", "video_play_actions",
    "date_start", "date_stop",
]

# Default attribution window. Do NOT request 7d_view / 28d_view: removed Jan 2026,
# they return empty (not an error) and silently drop view-through conversions.
ATTRIBUTION_WINDOWS = ["1d_view", "7d_click"]

# Meta's Insights endpoint refuses a single request that asks for too much
# (campaigns x days x fields). Empirically, daily campaign-level pulls on the
# biggest account here succeed up to ~18 days and fail at ~21. We fetch in
# windows of CHUNK_DAYS and auto-halve any window that still trips the limit,
# so ANY requested timeline works regardless of account size or level.
CHUNK_DAYS = 14


class MetaError(RuntimeError):
    """Structured Graph API error so callers can branch on the failure kind
    (too-much-data -> split & retry; beyond-retention -> skip; else -> fatal)."""
    def __init__(self, status, code, subcode, message):
        self.status, self.code, self.subcode, self.message = status, code, subcode, message
        super().__init__(f"Meta API error ({status}): {message} "
                         f"[code={code} subcode={subcode}]")


def _meta_fail(status, body):
    e = body.get("error", {}) if isinstance(body, dict) else {}
    raise MetaError(status, e.get("code"), e.get("error_subcode"), e.get("message"))


def is_too_much_data(e: MetaError) -> bool:
    """True when Meta rejected the request purely for size / transient overload
    (not a data or auth problem) -- the signal to split the window and retry."""
    msg = (e.message or "").lower()
    return (
        e.status == 500
        or e.subcode in (99, 1504044)
        or "reduce the amount of data" in msg
        or "temporarily unavailable" in msg
        or "please reduce" in msg
    )


def is_beyond_retention(e: MetaError) -> bool:
    return e.code == 3018 or "cannot be beyond 37 months" in (e.message or "").lower()


def meta_get(path: str, params: dict) -> dict:
    with httpx.Client(timeout=60) as client:
        r = client.get(f"{GRAPH_BASE}/{path}", params=params)
    try:
        body = r.json()
    except ValueError:
        raise RuntimeError(f"Non-JSON response ({r.status_code}): {r.text[:300]}")
    if isinstance(body, dict) and "error" in body:
        _meta_fail(r.status_code, body)
    return body


def get_insights_paged(account: str, params: dict, max_rows: int = 5000):
    """Fetch insights following cursor pagination. Real pulls (esp. ad-level)
    exceed one page, so a single page would silently truncate.

    We advance with the `after` cursor against OUR endpoint + version, rather than
    following Meta's absolute `paging.next` URL: that next URL is minted on a newer
    Graph version (e.g. v25.0) than we requested, and following it 403s with
    '(#200) Provide valid app ID' for this token."""
    rows = []
    url = f"{GRAPH_BASE}/{account}/insights"
    p = dict(params)
    pages = 0
    with httpx.Client(timeout=120) as client:
        while True:
            r = client.get(url, params=p)
            body = r.json()
            if isinstance(body, dict) and "error" in body:
                _meta_fail(r.status_code, body)
            rows.extend(body.get("data", []))
            pages += 1
            paging = body.get("paging", {}) or {}
            after = (paging.get("cursors") or {}).get("after")
            if not paging.get("next") or not after or len(rows) >= max_rows:
                break
            p = dict(params)          # same version + params ...
            p["after"] = after        # ... just advance the cursor
    return rows[:max_rows], pages


def list_accounts(token: str) -> list[dict]:
    """All ad accounts the token can see (id, name, currency, status)."""
    return meta_get("me/adaccounts", {
        "access_token": token,
        "fields": "account_id,name,currency,account_status",
        "limit": 100,
    }).get("data", [])


def save_envelope(path, account, acct_meta, rows):
    dates = [r.get("date_start") for r in rows if r.get("date_start")]
    envelope = {
        "meta": {
            "account_id": account,
            "account_name": acct_meta.get("name", "?"),
            "currency": acct_meta.get("currency", "?"),
            "level": "campaign",
            "time_increment": 1,
            "date_range": {"since": min(dates) if dates else None,
                           "until": max(dates) if dates else None},
            "api_version": GRAPH_API_VERSION,
            "source": "live",
        },
        "data": rows,
    }
    Path(path).write_text(json.dumps(envelope, indent=2), encoding="utf-8")
    print(f"\nSaved {len(rows)} rows -> {path}")


def fetch_month_rows(token: str, account: str, first: date, last: date,
                     level: str = "campaign") -> list[dict]:
    """One monthly-aggregate pull (NO time_increment -> one row per campaign for
    the whole month). Cheap and never trips the daily size limit -- used to build
    the historic monthly facts for periods we don't keep raw daily rows for."""
    params = {
        "access_token": token,
        "level": level,
        "fields": ",".join(FIELDS),
        "action_attribution_windows": json.dumps(ATTRIBUTION_WINDOWS),
        "time_range": json.dumps({"since": first.isoformat(), "until": last.isoformat()}),
        "limit": 500,
    }
    rows, _ = get_insights_paged(account, params, max_rows=50000)
    return rows


def _insights_params(token: str, since: str, until: str, level: str) -> dict:
    return {
        "access_token": token,
        "level": level,
        "fields": ",".join(FIELDS),
        "action_attribution_windows": json.dumps(ATTRIBUTION_WINDOWS),
        "time_range": json.dumps({"since": since, "until": until}),
        "time_increment": 1,
        "limit": 500,
    }


def _date_windows(since: date, until: date, chunk_days: int) -> list[tuple[date, date]]:
    """Split [since, until] (inclusive) into consecutive windows of <= chunk_days."""
    windows = []
    cur = since
    step = timedelta(days=chunk_days - 1)
    while cur <= until:
        end = min(cur + step, until)
        windows.append((cur, end))
        cur = end + timedelta(days=1)
    return windows


def _fetch_window_adaptive(token: str, account: str, s: date, u: date, level: str,
                           skipped: list, depth: int = 0) -> list[dict]:
    """Fetch one date window; if Meta rejects it as too big, split in half and
    recurse (down to a single day) until every slice goes through. Windows that
    fall beyond the 37-month retention are recorded and skipped, not fatal."""
    try:
        rows, _ = get_insights_paged(
            account, _insights_params(token, s.isoformat(), u.isoformat(), level),
            max_rows=50000)
        return rows
    except MetaError as e:
        if is_beyond_retention(e):
            skipped.append((s, u, "beyond 37-month retention"))
            return []
        if is_too_much_data(e):
            if s < u:                                  # still splittable: halve it
                mid = s + (u - s) // 2
                left = _fetch_window_adaptive(token, account, s, mid, level, skipped, depth + 1)
                right = _fetch_window_adaptive(token, account, mid + timedelta(days=1), u,
                                               level, skipped, depth + 1)
                return left + right
            # single day still failing -> one retry (likely transient), else give up on it
            try:
                rows, _ = get_insights_paged(
                    account, _insights_params(token, s.isoformat(), u.isoformat(), level),
                    max_rows=50000)
                return rows
            except MetaError:
                skipped.append((s, u, "Meta kept rejecting a single day"))
                return []
        raise                                          # auth / param / other: fatal


def fetch_envelope_preset(token, account=None, preset="last_30d", level="campaign", max_rows=5000):
    """Pull a live paginated Insights export as a {meta, data} envelope.

    Reusable by chat.py / brain_real.py. Picks the first account if `account` is
    None. Raises RuntimeError if the token sees no ad accounts.
    """
    accts = list_accounts(token)
    if not accts:
        raise RuntimeError("No ad accounts visible to this token.")
    acct = account or f"act_{accts[0]['account_id']}"
    acct_meta = next((a for a in accts if f"act_{a['account_id']}" == acct), {})
    rows, pages = get_insights_paged(acct, {
        "access_token": token,
        "level": level,
        "fields": ",".join(FIELDS),
        "action_attribution_windows": json.dumps(ATTRIBUTION_WINDOWS),
        "date_preset": preset,
        "time_increment": 1,
        "limit": 500,
    }, max_rows=max_rows)
    dates = [r.get("date_start") for r in rows if r.get("date_start")]
    return {
        "meta": {
            "account_id": acct,
            "account_name": acct_meta.get("name", "?"),
            "currency": acct_meta.get("currency", "INR"),
            "level": level,
            "time_increment": 1,
            "date_range": {"since": min(dates) if dates else None,
                           "until": max(dates) if dates else None},
            "api_version": GRAPH_API_VERSION,
            "source": "live",
            "pages": pages,
        },
        "data": rows,
    }


def fetch_envelope(token: str, account: str, since: date, until: date,
                   level: str = "campaign", progress=None) -> dict:
    """Pull live paginated Insights over [since, until] as a {meta, data} envelope,
    fetching in CHUNK_DAYS windows with adaptive splitting so any timeline works."""
    accts = list_accounts(token)
    if not accts:
        raise RuntimeError("No ad accounts visible to this token.")
    acct_meta = next((a for a in accts if f"act_{a['account_id']}" == account), {})

    windows = _date_windows(since, until, CHUNK_DAYS)
    rows: list[dict] = []
    skipped: list = []
    for i, (s, u) in enumerate(windows, 1):
        if progress:
            progress(i, len(windows), s, u)
        rows += _fetch_window_adaptive(token, account, s, u, level, skipped)

    dates = [r.get("date_start") for r in rows if r.get("date_start")]
    return {
        "meta": {
            "account_id": account,
            "account_name": acct_meta.get("name", "?"),
            "currency": acct_meta.get("currency", "INR"),
            "level": level,
            "time_increment": 1,
            "date_range": {"since": min(dates) if dates else since.isoformat(),
                           "until": max(dates) if dates else until.isoformat()},
            "api_version": GRAPH_API_VERSION,
            "source": "live",
            "windows": len(windows),
            "skipped": [(s.isoformat(), u.isoformat(), why) for s, u, why in skipped],
        },
        "data": rows,
    }


def fetch_dataset(token, account=None, preset="last_30d", level="campaign", max_rows=5000):
    """Live pull -> typed meta_transform.Dataset (one call for consumers)."""
    return mt.normalize(fetch_envelope_preset(token, account=account, preset=preset,
                                       level=level, max_rows=max_rows))


_PRESET_DAYS_RE = re.compile(r"^last_(\d+)d$")


def preset_days(preset: str) -> int | None:
    """Days for a last_Nd preset; None when the preset isn't day-shaped."""
    m = _PRESET_DAYS_RE.match(preset or "")
    return int(m.group(1)) if m else None


def fetch_dataset_range(token, account, since, until, level="campaign"):
    """Chunked range pull -> typed Dataset (the size-safe fetch_dataset)."""
    return mt.normalize(fetch_envelope(token, account=account, since=since,
                                       until=until, level=level))


def main():
    token = config.META_ACCESS_TOKEN
    if not token:
        print("META_ACCESS_TOKEN not set in ../.env")
        sys.exit(1)

    ap = argparse.ArgumentParser()
    ap.add_argument("--account", help="act_<id>; defaults to first account on the token")
    ap.add_argument("--preset", default="last_7d", help="Meta date_preset (e.g. last_7d, last_30d)")
    ap.add_argument("--level", default="campaign", choices=["account", "campaign", "adset", "ad"])
    ap.add_argument("--max-rows", type=int, default=5000, help="cap on paginated rows")
    ap.add_argument("--save", metavar="PATH", help="write the pull to a {meta,data} envelope JSON")
    args = ap.parse_args()

    print(f"Graph API {GRAPH_API_VERSION}\n")

    me = meta_get("me", {"access_token": token, "fields": "id,name"})
    print(f"Token belongs to: {me.get('name')} (id {me.get('id')})")

    accts = meta_get("me/adaccounts", {
        "access_token": token,
        "fields": "account_id,name,currency,account_status,amount_spent",
        "limit": 100,
    }).get("data", [])
    print(f"\nAd accounts visible to this token: {len(accts)}")
    for a in accts:
        print(f"   act_{a['account_id']}  {a.get('name', '?'):28.28}  "
              f"{a.get('currency', '?'):4}  status={a.get('account_status')}")
    if not accts:
        print("No ad accounts on this token.")
        return

    account = args.account or f"act_{accts[0]['account_id']}"
    acct_meta = next((a for a in accts if f"act_{a['account_id']}" == account), {})

    print(f"\nPulling insights for {account} ({acct_meta.get('name', '?')}, "
          f"level={args.level}, {args.preset}, daily)...")
    rows, pages = get_insights_paged(account, {
        "access_token": token,
        "level": args.level,
        "fields": ",".join(FIELDS),
        "action_attribution_windows": json.dumps(ATTRIBUTION_WINDOWS),
        "date_preset": args.preset,
        "time_increment": 1,
        "limit": 500,
    }, max_rows=args.max_rows)
    print(f"Received {len(rows)} insight rows across {pages} page(s).")
    if not rows:
        print("No rows (account may have no spend in this window). Try --preset last_90d.")
        return

    print("\n--- RAW JSON of first row (the real shape we receive) ---")
    print(json.dumps(rows[0], indent=2)[:2500])

    fields_present = sorted({k for r in rows for k in r.keys()})
    action_types = sorted({a.get("action_type") for r in rows for a in r.get("actions", [])})
    value_types = sorted({a.get("action_type") for r in rows for a in r.get("action_values", [])})
    print(f"\n--- Fields present across rows ({len(fields_present)}) ---")
    print(", ".join(fields_present))
    print(f"\n--- action_types in `actions` ({len(action_types)}) ---")
    print(", ".join(t for t in action_types if t) or "(none)")
    print(f"\n--- action_types in `action_values` ({len(value_types)}) ---")
    print(", ".join(t for t in value_types if t) or "(none)")

    print("\n--- Flattened (what the brain / chat will consume) ---")
    df = mt.normalize({"data": rows}).to_dataframe()
    cols = [c for c in ["campaign_name", "date", "spend", "impressions", "clicks",
                        "ctr", "purchases", "revenue", "roas"] if c in df.columns]
    with pd.option_context("display.max_columns", None, "display.width", 200):
        print(df[cols].head(20).to_string(index=False))
    print(f"... {len(df)} total rows, {df.campaign_name.nunique()} campaigns")

    if args.save:
        save_envelope(args.save, account, acct_meta, rows)


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as e:
        print(f"\n[x] {e}")
        sys.exit(1)
