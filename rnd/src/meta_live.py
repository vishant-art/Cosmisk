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
import os
import sys
from pathlib import Path

import pandas as pd
import requests
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent))
import meta_transform as mt  # noqa: E402

# Windows consoles default to cp1252 and choke on non-ASCII; force UTF-8 output.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

# Bump if Meta deprecates the version. v23.0 is current/non-deprecated as of 2026.
GRAPH_API_VERSION = "v23.0"
BASE = f"https://graph.facebook.com/{GRAPH_API_VERSION}"

# Production field set. Note link-click fields (inline_link_clicks / _ctr /
# cost_per_inline_link_click) requested ALONGSIDE the all-clicks ones, plus
# account_currency. purchase_roas/website_purchase_roas pulled for cross-check
# only; the transform DERIVES ROAS.
FIELDS = [
    "campaign_id", "campaign_name", "adset_name", "ad_name", "account_currency",
    "spend", "impressions", "reach", "frequency",
    "clicks", "ctr", "cpc",
    "inline_link_clicks", "inline_link_click_ctr", "cost_per_inline_link_click",
    "cpm", "actions", "action_values", "purchase_roas", "website_purchase_roas",
    "date_start", "date_stop",
]

# Default attribution window. Do NOT request 7d_view / 28d_view: removed Jan 2026,
# they return empty (not an error) and silently drop view-through conversions.
ATTRIBUTION_WINDOWS = ["1d_view", "7d_click"]


def _fail(status, body):
    e = body.get("error", {}) if isinstance(body, dict) else {}
    print(f"\n[x] Meta API error ({status}): {e.get('message')}")
    print(f"    type={e.get('type')} code={e.get('code')} "
          f"subcode={e.get('error_subcode')} fbtrace_id={e.get('fbtrace_id')}")
    sys.exit(1)


def get(path, params):
    r = requests.get(f"{BASE}/{path}", params=params, timeout=60)
    try:
        body = r.json()
    except ValueError:
        print(f"\n[x] Non-JSON response ({r.status_code}): {r.text[:300]}")
        sys.exit(1)
    if isinstance(body, dict) and "error" in body:
        _fail(r.status_code, body)
    return body


def get_insights_paged(account, params, max_rows=5000):
    """Fetch insights following cursor pagination. Real daily pulls across many
    campaigns easily exceed one page, so a single page would silently truncate."""
    rows = []
    url = f"{BASE}/{account}/insights"
    p = dict(params)
    pages = 0
    while True:
        r = requests.get(url, params=p, timeout=120)
        body = r.json()
        if isinstance(body, dict) and "error" in body:
            _fail(r.status_code, body)
        rows.extend(body.get("data", []))
        pages += 1
        nxt = body.get("paging", {}).get("next")
        if not nxt or len(rows) >= max_rows:
            break
        url, p = nxt, {}  # the `next` URL already carries all params + cursor
    return rows[:max_rows], pages


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


def main():
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    token = os.getenv("META_ACCESS_TOKEN")
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

    me = get("me", {"access_token": token, "fields": "id,name"})
    print(f"Token belongs to: {me.get('name')} (id {me.get('id')})")

    accts = get("me/adaccounts", {
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
    main()
