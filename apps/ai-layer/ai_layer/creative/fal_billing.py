"""Actual fal spend + live balance, via the admin key (FAL_ADMIN_KEY).

`ledger.py` ESTIMATES cost before a call, because fal returns no cost inline. This module
reads fal's ACTUAL charges after the fact (fal Platform API) so estimates can be reconciled
against the invoice, a run's real cost can be written next to its estimate, and a run can
refuse to start when the balance cannot cover the planned clips.

Two-key split by design: FAL_KEY renders, FAL_ADMIN_KEY reads billing. The render path never
carries admin scope. Everything here NO-OPS gracefully (returns None / [] / a disabled guard)
when FAL_ADMIN_KEY is unset, so it is safe to call unconditionally.

Endpoints (fal Platform API, verified 2026-07 against a live account):
  GET /v1/account/billing?expand=credits     -> {credits:{current_balance, currency}}
  GET /v1/models/billing-events              -> per-request {request_id, endpoint_id,
                                                timestamp, output_units, unit_price,
                                                cost_estimate_nano_usd}
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

_BASE = "https://api.fal.ai"
_ACTUALS_FILE = "fal_actuals.json"     # this module's own output; excluded from run_window

# Observed, not derived: every Seedance 2.0 clip (t2v/i2v) at our render settings bills
# 87.3 "1000-token" units at $0.014, i.e. $1.2222. ledger.video_cost's a-priori formula
# lands at ~$1.2096 (~1% low) because fal counts ~909 tokens/frame where the formula counts
# 900. Use THIS figure for the pre-run balance guard, so a run is never told it can afford a
# clip it cannot. See reconcile() for the estimate-vs-actual proof.
SEEDANCE_CLIP_USD = round(87.3 * 0.014, 6)     # 1.2222


class FalBillingUnavailable(RuntimeError):
    """FAL_ADMIN_KEY is not set, so actual billing cannot be read."""


def _admin_key() -> str | None:
    return (os.environ.get("FAL_ADMIN_KEY") or "").strip() or None


def available() -> bool:
    """True when the admin key is present and billing calls can be made."""
    return _admin_key() is not None


def _http_get(url: str, key: str) -> dict:
    """Single GET returning parsed JSON. Isolated for tests to monkeypatch."""
    req = urllib.request.Request(url, headers={"Authorization": f"Key {key}"})
    with urllib.request.urlopen(req, timeout=60) as r:      # noqa: S310 -- fixed https host
        return json.loads(r.read().decode())


def _get(path: str, **params) -> dict:
    key = _admin_key()
    if not key:
        raise FalBillingUnavailable("FAL_ADMIN_KEY not set")
    q = {k: v for k, v in params.items() if v is not None}
    url = f"{_BASE}{path}" + (("?" + urllib.parse.urlencode(q)) if q else "")
    return _http_get(url, key)


# --- reads --------------------------------------------------------------------

def balance() -> float | None:
    """Current credit balance in USD (negative = overdrawn), or None if unavailable."""
    if not available():
        return None
    body = _get("/v1/account/billing", expand="credits")
    return (body.get("credits") or {}).get("current_balance")


def events(start: str, end: str | None = None) -> list[dict]:
    """Every per-request billing event in [start, end), following pagination.

    `start`/`end` are ISO-8601 UTC strings (e.g. '2026-07-11T00:00:00Z')."""
    if not available():
        return []
    out: list[dict] = []
    cursor, pages = None, 0
    while True:
        # fal's billing-events filters on `start`/`end` (NOT start_time/end_time, which the
        # endpoint silently ignores -- verified against a live account 2026-07).
        body = _get("/v1/models/billing-events", start=start, end=end,
                    cursor=cursor, page_size=200)
        out.extend(body.get("billing_events") or [])
        cursor = body.get("next_cursor")
        pages += 1
        if not (body.get("has_more") and cursor) or pages > 100:
            break
    return out


def _event_usd(e: dict) -> float:
    return round(e.get("cost_estimate_nano_usd", 0) / 1e9, 6)


def spend_by_endpoint(start: str, end: str | None = None) -> dict[str, dict]:
    """{endpoint_id: {'count': n, 'usd': total}} of ACTUAL charges in the window."""
    agg: dict[str, dict] = defaultdict(lambda: {"count": 0, "usd": 0.0})
    for e in events(start, end):
        row = agg[e["endpoint_id"]]
        row["count"] += 1
        row["usd"] = round(row["usd"] + _event_usd(e), 6)
    return dict(agg)


def actual_total(start: str, end: str | None = None) -> float:
    """Total ACTUAL USD charged by fal in the window."""
    return round(sum(v["usd"] for v in spend_by_endpoint(start, end).values()), 6)


# --- balance guard ------------------------------------------------------------

def affordable(n_clips: int, *, per_clip: float = SEEDANCE_CLIP_USD,
               overhead: float = 0.30) -> dict:
    """Can the live balance cover `n_clips` Seedance renders plus a fixed overhead margin?

    Returns {'enabled', 'ok', 'balance', 'needed', 'shortfall'}. When billing is
    unavailable the guard is DISABLED (ok=True) rather than blocking a run: absence of an
    admin key must not brick rendering. Callers decide whether to warn or halt on ok=False.
    """
    needed = round(n_clips * per_clip + overhead, 6)
    if not available():
        return {"enabled": False, "ok": True, "balance": None,
                "needed": needed, "shortfall": 0.0}
    bal = balance() or 0.0
    ok = bal >= needed
    return {"enabled": True, "ok": ok, "balance": round(bal, 6), "needed": needed,
            "shortfall": 0.0 if ok else round(needed - bal, 6)}


# --- per-run actuals + reconciliation -----------------------------------------

def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def run_window(run_dir, *, pad_before=120, pad_after=300) -> tuple[str, str] | None:
    """The UTC [start, end] spanning a run's artifacts (by mtime), padded for billing lag.

    Padding matters because fal records a billing event slightly after the call returns and
    an artifact's mtime is when we WROTE it, not when fal billed it."""
    run_dir = Path(run_dir)
    mtimes = [p.stat().st_mtime for p in run_dir.rglob("*")
              if p.is_file() and p.name != _ACTUALS_FILE]   # ignore our own output (mtime=now)
    if not mtimes:
        return None
    start = datetime.fromtimestamp(min(mtimes), timezone.utc) - timedelta(seconds=pad_before)
    end = datetime.fromtimestamp(max(mtimes), timezone.utc) + timedelta(seconds=pad_after)
    return _iso(start), _iso(end)


def _estimate_total(run_dir) -> float:
    """Sum a run's ledger.jsonl ESTIMATE rows (excluding the finalize TOTAL row)."""
    led = Path(run_dir) / "ledger.jsonl"
    if not led.exists():
        return 0.0
    tot = 0.0
    for line in led.read_text("utf-8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        if row.get("op") == "TOTAL":
            continue
        tot += row.get("cost_usd", 0.0)
    return round(tot, 6)


def reconcile(run_dir) -> dict | None:
    """Compare a run's ESTIMATE (ledger.jsonl) to fal's ACTUAL charges in the run window.

    Returns {estimate, actual, delta, pct, window, by_endpoint} or None if unavailable.
    Caveat: the window is time-based, so if two runs overlap in wall-clock the actuals can
    bleed together. Sequential runs (the norm here) are clean."""
    if not available():
        return None
    win = run_window(run_dir)
    if win is None:
        return None
    start, end = win
    by_ep = spend_by_endpoint(start, end)
    actual = round(sum(v["usd"] for v in by_ep.values()), 6)
    estimate = _estimate_total(run_dir)
    delta = round(actual - estimate, 6)
    pct = round(delta / actual * 100, 2) if actual else 0.0
    return {"estimate": estimate, "actual": actual, "delta": delta, "pct": pct,
            "window": [start, end], "by_endpoint": by_ep}


def write_run_actuals(run_dir) -> dict | None:
    """Fetch fal's ACTUAL charges for a run's window and write fal_actuals.json into it.

    This is the authoritative cost record: estimates are what we guessed, this is the
    invoice. Returns the payload, or None if billing is unavailable."""
    rec = reconcile(run_dir)
    if rec is None:
        return None
    payload = {"actual_usd": rec["actual"], "estimate_usd": rec["estimate"],
               "delta_usd": rec["delta"], "delta_pct": rec["pct"],
               "window_utc": rec["window"], "by_endpoint": rec["by_endpoint"],
               "balance_after_usd": balance()}
    (Path(run_dir) / "fal_actuals.json").write_text(json.dumps(payload, indent=2),
                                                    encoding="utf-8")
    return payload


# --- CLI ----------------------------------------------------------------------

def _main(argv: list[str]) -> int:
    import argparse
    from ai_layer.creative import config  # noqa: F401 -- side effect: loads .env so FAL_ADMIN_KEY is in the env
    ap = argparse.ArgumentParser(prog="fal_billing", description="fal actual spend + balance")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("balance")
    rp = sub.add_parser("report")
    rp.add_argument("--days", type=int, default=7)
    ac = sub.add_parser("actuals")
    ac.add_argument("run_dir")
    gp = sub.add_parser("guard")
    gp.add_argument("n_clips", type=int)
    args = ap.parse_args(argv)

    if not available():
        print("FAL_ADMIN_KEY not set -> billing unavailable (add it to .env)")
        return 2

    if args.cmd == "balance":
        print(f"balance: ${balance():.4f} USD")
    elif args.cmd == "report":
        end = datetime.now(timezone.utc)
        start = end - timedelta(days=args.days)
        by = spend_by_endpoint(_iso(start), _iso(end))
        print(f"actual spend, last {args.days}d:")
        total = 0.0
        for ep, v in sorted(by.items(), key=lambda x: -x[1]["usd"]):
            print(f"  {ep:44} {v['count']:>4}  ${v['usd']:.4f}")
            total += v["usd"]
        print(f"  {'TOTAL':44} {'':>4}  ${total:.4f}")
        print(f"balance now: ${balance():.4f}")
    elif args.cmd == "actuals":
        rec = write_run_actuals(args.run_dir)
        print(json.dumps(rec, indent=2) if rec else "unavailable")
    elif args.cmd == "guard":
        g = affordable(args.n_clips)
        print(json.dumps(g, indent=2))
        return 0 if g["ok"] else 1
    return 0


if __name__ == "__main__":
    import sys
    raise SystemExit(_main(sys.argv[1:]))
