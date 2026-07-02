# AI-Layer Connector Adapter Seam (#27) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the ai-layer consume cross-platform connector data (Meta + Google) through its existing dataset seam as an opt-in `source="connectors"`, with zero change to default behavior.

**Architecture:** One new pure-adapter module `ai_layer/connector_source.py` (UnifiedSnapshot → `mt.Dataset`), plus a single lazy-import branch in `api.py::_dataset`. Everything downstream (brain, chat, charts) is untouched — the adapter output is shape-identical to a Meta dataset. Spec: `docs/superpowers/specs/2026-07-02-ai-layer-connector-adapter-design.md`; upstream interface: `apps/connectors/CONTRACT.md` v1.0.

**Tech Stack:** Python 3.12, pydantic (connector contract), dataclasses (`mt.CampaignDayFact`/`mt.Dataset`), FastAPI + TestClient, pytest.

## Global Constraints

- Branch: `feat/ai-layer-adapter`. Never commit `CLAUDE.md` or `.env.test`; never print `.env` secret values.
- Commit messages: plain conventional commits, **no AI attribution of any kind** (no Co-Authored-By trailers, no tool mentions).
- Run tests from `apps/ai-layer` with the repo venv: `../../.venv/bin/python -m pytest tests -q`. Baseline before this plan: **157 passed, 7 skipped**. Connector suite baseline (from `apps/connectors`): **47 passed**.
- No module-level import of `connectors` anywhere under `ai_layer/` **except** inside `connector_source.py` itself (which is only ever lazy-imported by `api.py`).
- Default `source` stays `"store"`; existing route behavior must be byte-identical.
- No writes to the SQLite store from the connectors path. No new endpoints (that is #28).
- Platform tagging is uniform for ALL platforms including meta: `campaign_id="{platform}:{entity_id}"`, `campaign_name="[{platform}] {entity_name}"`.
- Shopify facts are excluded via `EXCLUDED_PLATFORMS = {"shopify"}` (one constant).

## File Structure

- Create: `apps/ai-layer/ai_layer/connector_source.py` — the whole adapter (mapping + fetch).
- Create: `apps/ai-layer/tests/test_connector_source.py` — all tests for this plan (unit + API-level).
- Modify: `apps/ai-layer/ai_layer/api.py:77-84` — `_connector_dataset` helper + one branch in `_dataset`.

---

### Task 1: Fact mapping core (`snapshot_to_dataset` — rows)

**Files:**
- Create: `apps/ai-layer/ai_layer/connector_source.py`
- Test: `apps/ai-layer/tests/test_connector_source.py`

**Interfaces:**
- Consumes: `connectors.contract.UnifiedFact/UnifiedSnapshot/Blended/ConnectorStatus` (pydantic, all metrics default `0.0`); `ai_layer.meta_transform.CampaignDayFact/Dataset` (frozen dataclasses).
- Produces: `snapshot_to_dataset(snapshot: UnifiedSnapshot, account_id: str) -> mt.Dataset` and module constants `EXCLUDED_PLATFORMS`, `_COPY_FIELDS` — Tasks 2–4 rely on these exact names.

- [ ] **Step 1: Write the failing tests**

Create `apps/ai-layer/tests/test_connector_source.py`:

```python
"""Tests for the connector adapter seam (#27): UnifiedSnapshot -> mt.Dataset.

Offline only -- snapshots are handcrafted; no network, no credentials.
Requires the cosmisk-connectors package (installed editable in the repo venv).
"""
from __future__ import annotations

from connectors.contract import (Blended, ConnectorStatus, UnifiedFact,
                                 UnifiedSnapshot)

from ai_layer import connector_source as cs
from ai_layer import meta_transform as mt


def fact(platform="meta", **kw):
    base = dict(platform=platform, account_id="a1", entity_id="c1",
                entity_name="Camp", date="2026-06-01")
    base.update(kw)
    return UnifiedFact(**base)


def snap(facts, currency="INR", mismatch=False, ok=("meta",)):
    return UnifiedSnapshot(
        brand_id="acme", since="2026-06-01", until="2026-06-30",
        currency=currency, facts=list(facts),
        blended=Blended(currency=currency, currency_mismatch=mismatch),
        statuses=[ConnectorStatus(platform=p, state="ok") for p in ok])


# ---- Task 1: row mapping ----

def test_identity_is_tagged_uniformly_for_all_platforms():
    ds = cs.snapshot_to_dataset(
        snap([fact("meta", entity_id="7", entity_name="Prospecting"),
              fact("google", entity_id="123", entity_name="S_IN_Search")],
             ok=("meta", "google")),
        "acme")
    ids = {f.campaign_id for f in ds.facts}
    names = {f.campaign_name for f in ds.facts}
    assert ids == {"meta:7", "google:123"}
    assert names == {"[meta] Prospecting", "[google] S_IN_Search"}


def test_conversions_map_to_purchases_and_metrics_copy_by_name():
    f = fact("google", spend=10.0, impressions=1000.0, clicks=50.0, ctr=5.0,
             cpc=0.2, cpm=10.0, link_clicks=50.0, link_ctr=5.0,
             cost_per_link_click=0.2, conversions=5.0, revenue=250.0,
             roas=25.0, cpa=2.0)
    row = cs.snapshot_to_dataset(snap([f], ok=("google",)), "acme").facts[0]
    assert isinstance(row, mt.CampaignDayFact)
    assert row.purchases == 5.0                      # conversions -> purchases
    assert row.date == "2026-06-01"
    assert (row.spend, row.impressions, row.clicks) == (10.0, 1000.0, 50.0)
    assert (row.ctr, row.cpc, row.cpm) == (5.0, 0.2, 10.0)
    assert (row.link_clicks, row.link_ctr, row.cost_per_link_click) == (50.0, 5.0, 0.2)
    assert (row.revenue, row.roas, row.cpa) == (250.0, 25.0, 2.0)
    assert (row.reach, row.frequency, row.add_to_cart, row.checkout) == (0.0, 0.0, 0.0, 0.0)


def test_shopify_facts_are_excluded_from_the_dataset():
    ds = cs.snapshot_to_dataset(
        snap([fact("meta"), fact("shopify", entity_id="day", conversions=30.0,
                                 revenue=90000.0)],
             ok=("meta", "shopify")),
        "acme")
    assert len(ds.facts) == 1 and ds.facts[0].campaign_id == "meta:c1"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_connector_source.py -q`
Expected: FAIL — `ImportError: cannot import name 'connector_source'` (module does not exist).

- [ ] **Step 3: Write the implementation**

Create `apps/ai-layer/ai_layer/connector_source.py`:

```python
"""Connector-source adapter (#27): UnifiedSnapshot -> the ai-layer Dataset contract.

Feeds cross-platform connector facts (Meta + Google) through the existing
CampaignDayFact pipeline as the opt-in `source="connectors"`. Binding upstream
interface: apps/connectors/CONTRACT.md (v1.0, section 2 mapping table); design:
docs/superpowers/specs/2026-07-02-ai-layer-connector-adapter-design.md.

Shopify facts are shop-level daily revenue, not campaigns -- as campaign rows
they would corrupt every spend-based brain statement, so they are excluded here;
Shopify truth surfaces via snapshot.blended (the #28 route).

This module is the ONLY place in ai_layer allowed to import `connectors`, and it
is only ever lazy-imported (api.py returns 503 when the package is absent).
"""
from __future__ import annotations

from connectors import BrandRef, DateWindow, get_snapshot
from connectors.contract import UnifiedFact, UnifiedSnapshot

from ai_layer import meta_transform as mt

EXCLUDED_PLATFORMS = {"shopify"}   # shop-level rows, not campaigns (see docstring)

# CampaignDayFact fields that copy from UnifiedFact under the same name
# (identity + date + purchases are mapped explicitly).
_COPY_FIELDS = ("spend", "impressions", "reach", "frequency", "clicks", "ctr",
                "cpc", "link_clicks", "link_ctr", "cost_per_link_click", "cpm",
                "add_to_cart", "checkout", "revenue", "roas", "cpa")


def _to_fact(f: UnifiedFact) -> mt.CampaignDayFact:
    metrics = {name: getattr(f, name) for name in _COPY_FIELDS}
    return mt.CampaignDayFact(
        campaign_id=f"{f.platform}:{f.entity_id}",
        campaign_name=f"[{f.platform}] {f.entity_name}",
        date=f.date,
        purchases=f.conversions,
        **metrics,
    )


def snapshot_to_dataset(snapshot: UnifiedSnapshot, account_id: str) -> mt.Dataset:
    """Pure mapping -- no I/O. Metadata rules are covered in Task 2."""
    facts = tuple(_to_fact(f) for f in snapshot.facts
                  if f.platform not in EXCLUDED_PLATFORMS)
    return mt.Dataset(account_id=account_id, account_name=account_id,
                      currency=snapshot.currency, since=snapshot.since,
                      until=snapshot.until, level="campaign",
                      source="connectors", facts=facts)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_connector_source.py -q`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/ai-layer/ai_layer/connector_source.py apps/ai-layer/tests/test_connector_source.py
git commit -m "feat(ai-layer): connector adapter core — UnifiedFact rows to CampaignDayFact"
```

---

### Task 2: Dataset metadata — platform status, currency, MIXED caveat, empty snapshot

**Files:**
- Modify: `apps/ai-layer/ai_layer/connector_source.py` (the `snapshot_to_dataset` return)
- Test: `apps/ai-layer/tests/test_connector_source.py` (append)

**Interfaces:**
- Consumes: Task 1's `snapshot_to_dataset`, test helpers `fact()`/`snap()`.
- Produces: final metadata contract — `account_name = "{account_id} [connectors: {p1+p2}]"` with optional `"; currency MIXED"` suffix; `currency` passthrough (may be `"MIXED"`). Task 4's endpoint test relies on `source == "connectors"`.

- [ ] **Step 1: Write the failing tests** (append to `tests/test_connector_source.py`)

```python
# ---- Task 2: dataset metadata ----

def test_metadata_carries_window_currency_and_platform_status():
    ds = cs.snapshot_to_dataset(snap([fact()], ok=("meta", "google")), "acme")
    assert ds.account_id == "acme"
    assert ds.account_name == "acme [connectors: meta+google]"
    assert ds.currency == "INR"
    assert (ds.since, ds.until) == ("2026-06-01", "2026-06-30")
    assert ds.level == "campaign" and ds.source == "connectors"


def test_currency_mismatch_is_labeled_never_silent():
    ds = cs.snapshot_to_dataset(
        snap([fact()], currency="MIXED", mismatch=True), "acme")
    assert ds.currency == "MIXED"
    assert ds.account_name.endswith("; currency MIXED")


def test_all_platforms_down_yields_empty_dataset_not_an_error():
    ds = cs.snapshot_to_dataset(snap([], ok=()), "acme")
    assert len(ds) == 0
    assert ds.account_name == "acme [connectors: none]"
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_connector_source.py -q`
Expected: 3 passed (Task 1), 3 failed — `account_name` is currently just `account_id`.

- [ ] **Step 3: Implement — replace the return of `snapshot_to_dataset`**

In `apps/ai-layer/ai_layer/connector_source.py`, replace the body of `snapshot_to_dataset` (keep the signature and the facts line) with:

```python
def snapshot_to_dataset(snapshot: UnifiedSnapshot, account_id: str) -> mt.Dataset:
    """Pure mapping -- no I/O. Platform status and currency caveats ride
    account_name (the one metadata string chat puts in front of the LLM)."""
    facts = tuple(_to_fact(f) for f in snapshot.facts
                  if f.platform not in EXCLUDED_PLATFORMS)
    name = f"{account_id} [connectors: {'+'.join(snapshot.ok_platforms) or 'none'}]"
    if snapshot.blended.currency_mismatch:
        name += "; currency MIXED"
    return mt.Dataset(account_id=account_id, account_name=name,
                      currency=snapshot.currency, since=snapshot.since,
                      until=snapshot.until, level="campaign",
                      source="connectors", facts=facts)
```

- [ ] **Step 4: Run the file's tests — all pass**

Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_connector_source.py -q`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/ai-layer/ai_layer/connector_source.py apps/ai-layer/tests/test_connector_source.py
git commit -m "feat(ai-layer): adapter metadata — platform status suffix + MIXED currency caveat"
```

---

### Task 3: `fetch_connector_dataset` — preset window + BrandRef rule

**Files:**
- Modify: `apps/ai-layer/ai_layer/connector_source.py` (append)
- Test: `apps/ai-layer/tests/test_connector_source.py` (append)

**Interfaces:**
- Consumes: `connectors.get_snapshot(brand, window, platforms)` (already imported), `DateWindow.last_n_days(n)`, `BrandRef(brand_id=..., meta_account_id=...)`.
- Produces: `fetch_connector_dataset(account_id: str, preset: str = "last_30d", platforms: list[str] | None = None) -> mt.Dataset` — Task 4's api branch calls exactly this.

- [ ] **Step 1: Write the failing tests** (append to `tests/test_connector_source.py`)

```python
# ---- Task 3: fetch_connector_dataset ----

def test_fetch_maps_preset_to_window_and_act_ids_to_meta_account(monkeypatch):
    seen = {}

    def fake_get_snapshot(brand, window, platforms=None):
        seen.update(brand=brand, window=window, platforms=platforms)
        return snap([fact()])

    monkeypatch.setattr(cs, "get_snapshot", fake_get_snapshot)

    ds = cs.fetch_connector_dataset("act_123", preset="last_7d")
    assert len(ds) == 1 and ds.account_id == "act_123"
    assert seen["brand"].brand_id == "act_123"
    assert seen["brand"].meta_account_id == "act_123"      # act_ rule
    assert seen["platforms"] is None
    from datetime import date
    w = seen["window"]
    span = (date.fromisoformat(w.until) - date.fromisoformat(w.since)).days
    assert span == 6                                       # last_7d inclusive window

    cs.fetch_connector_dataset("pratapsons", preset="nonsense")
    assert seen["brand"].meta_account_id is None           # brand handle -> env fallback
    w = seen["window"]
    span = (date.fromisoformat(w.until) - date.fromisoformat(w.since)).days
    assert span == 29                                      # unknown preset -> 30d
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_connector_source.py -q`
Expected: 6 passed, 1 failed — `AttributeError: ... has no attribute 'fetch_connector_dataset'`.

Note: if the inclusive-window assertion fails with 7/30 instead of 6/29, check `DateWindow.last_n_days` in `apps/connectors/connectors/contract.py:24` and fix the expected span to match its actual convention — do not change the connector.

- [ ] **Step 3: Implement** (append to `connector_source.py`)

```python
_PRESET_DAYS = {"last_7d": 7, "last_30d": 30, "last_90d": 90}


def fetch_connector_dataset(account_id: str, preset: str = "last_30d",
                            platforms: list[str] | None = None) -> mt.Dataset:
    """Pull a cross-platform snapshot and adapt it. First call can take up to
    ~120s on large accounts (CONTRACT.md section 6) -- ingest-grade, not
    interactive-grade; chat reuses the session context cache across turns."""
    window = DateWindow.last_n_days(_PRESET_DAYS.get(preset, 30))
    brand = BrandRef(
        brand_id=account_id,
        meta_account_id=account_id if account_id.startswith("act_") else None,
    )
    return snapshot_to_dataset(get_snapshot(brand, window, platforms), account_id)
```

- [ ] **Step 4: Run the file's tests — all pass**

Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_connector_source.py -q`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/ai-layer/ai_layer/connector_source.py apps/ai-layer/tests/test_connector_source.py
git commit -m "feat(ai-layer): fetch_connector_dataset — preset window + BrandRef act_ rule"
```

---

### Task 4: The api.py seam — `source="connectors"` branch with lazy import

**Files:**
- Modify: `apps/ai-layer/ai_layer/api.py:77-84` (`_dataset` + new `_connector_dataset` helper directly above it)
- Test: `apps/ai-layer/tests/test_connector_source.py` (append)

**Interfaces:**
- Consumes: Task 3's `fetch_connector_dataset(account_id, preset)`; existing `HTTPException`, `mt.Dataset`.
- Produces: `GET /insights/{id}?source=connectors` and `POST /chat {source:"connectors"}` working end-to-end; 503 when the `connectors` package is absent; empty snapshot → existing 404.

- [ ] **Step 1: Write the failing tests** (append to `tests/test_connector_source.py`)

```python
# ---- Task 4: the api seam ----
import sys

import pytest
from fastapi.testclient import TestClient

from ai_layer import api


@pytest.fixture
def client():
    return TestClient(api.app)


def _dataset_for_api():
    return cs.snapshot_to_dataset(
        snap([fact(spend=100.0, conversions=10.0, revenue=800.0, roas=8.0)]),
        "acme")


def test_insights_source_connectors_end_to_end(client, monkeypatch):
    monkeypatch.setattr(cs, "fetch_connector_dataset",
                        lambda account_id, preset="last_30d", platforms=None:
                        _dataset_for_api())
    r = client.get("/insights/acme?source=connectors")
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "connectors"
    assert body["account_name"] == "acme [connectors: meta]"
    assert body["totals"]["spend"] == 100.0 and body["totals"]["purchases"] == 10


def test_empty_connector_snapshot_hits_existing_404(client, monkeypatch):
    monkeypatch.setattr(cs, "fetch_connector_dataset",
                        lambda account_id, preset="last_30d", platforms=None:
                        cs.snapshot_to_dataset(snap([], ok=()), "acme"))
    assert client.get("/insights/acme?source=connectors").status_code == 404


def test_missing_connectors_package_yields_503_with_hint(client, monkeypatch):
    # sys.modules[name] = None makes `from ai_layer import connector_source`
    # raise ImportError -- simulates the package being absent in the image.
    monkeypatch.setitem(sys.modules, "ai_layer.connector_source", None)
    r = client.get("/insights/acme?source=connectors")
    assert r.status_code == 503
    assert "connectors package" in r.json()["detail"]


def test_default_source_untouched(client, monkeypatch, tmp_path):
    # No connectors involvement on the default path: empty store falls through to
    # the live branch, which 400s without a token. Hermetic: temp store + no env token.
    from ai_layer import config
    monkeypatch.setattr(config, "STORE_DB_PATH", tmp_path / "store.sqlite")
    monkeypatch.setattr(config, "META_ACCESS_TOKEN", None)
    r = client.get("/insights/act_none")
    assert r.status_code == 400
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_connector_source.py -q`
Expected: `test_insights_source_connectors_end_to_end`, `test_empty_connector_snapshot_hits_existing_404`, and `test_missing_connectors_package_yields_503_with_hint` FAIL (the connectors source falls through to the live-fetch branch → 400, not the expected codes). `test_default_source_untouched` already passes (it exercises existing behavior).

- [ ] **Step 3: Implement — edit `apps/ai-layer/ai_layer/api.py`**

Replace the existing `_dataset` function (lines 77–84) with:

```python
def _connector_dataset(account_id: str, preset: str) -> mt.Dataset:
    """Lazy import: the cosmisk-connectors package is optional until the image
    bundles it (build-context change); absent -> a clean 503, never an ImportError
    at module load."""
    try:
        from ai_layer import connector_source
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="connectors package not installed — pip install -e apps/connectors",
        ) from exc
    return connector_source.fetch_connector_dataset(account_id, preset)


def _dataset(account_id: str, source: str, token: str | None, preset: str) -> mt.Dataset:
    """source='store' reads the accumulated store (falls back to live if empty);
    source='live' always fetches fresh; source='connectors' adapts the
    cross-platform connector snapshot (opt-in, no store writes)."""
    if source == "connectors":
        return _connector_dataset(account_id, preset)
    if source == "store":
        ds = store.load_dataset(account_id)
        if len(ds) > 0:
            return ds
    return ml.fetch_dataset(_need_token(token), account=account_id, preset=preset)
```

Note: the monkeypatched-`cs.fetch_connector_dataset` tests work because `_connector_dataset` resolves `connector_source.fetch_connector_dataset` at call time (module attribute lookup), not at import time.

- [ ] **Step 4: Run the file's tests — all pass**

Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests/test_connector_source.py -q`
Expected: 11 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/ai-layer/ai_layer/api.py apps/ai-layer/tests/test_connector_source.py
git commit -m "feat(ai-layer): opt-in source=connectors branch in _dataset (lazy import, 503 hint)"
```

---

### Task 5: Full regression + push

**Files:**
- No new files — verification only.

**Interfaces:**
- Consumes: everything above.
- Produces: green suites, pushed branch.

- [ ] **Step 1: Full ai-layer suite**

Run: `cd apps/ai-layer && ../../.venv/bin/python -m pytest tests -q`
Expected: **168 passed, 7 skipped** (157 baseline + 11 new). Zero failures; if any pre-existing test broke, stop and investigate — the default path must be byte-identical.

- [ ] **Step 2: Connector suite untouched**

Run: `cd apps/connectors && ../../.venv/bin/python -m pytest tests -q`
Expected: **47 passed** (this plan must not modify `apps/connectors`).

- [ ] **Step 3: Isolation check**

Run: `grep -rn "import connectors\|from connectors" apps/ai-layer/ai_layer --include="*.py" | grep -v connector_source.py`
Expected: no output (only `connector_source.py` may import the package; `api.py` imports `ai_layer.connector_source`, not `connectors`).

- [ ] **Step 4: Push**

```bash
git push origin feat/ai-layer-adapter
```

- [ ] **Step 5: Report**

State the final counts and that `source=connectors` is live behind the opt-in param, ready for #28.
