# Connector Fact-Shape Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape `apps/connectors` `UnifiedFact` into a flat superset carrying all 17 metric fields the AI-layer brain consumes, add semantic per-platform capability sets, propagate currency with an FX-conversion seam (shipped inert), and bound the Shopify assets scan so `get_assets` stops timing out.

**Architecture:** Purely additive, connector-only (no `apps/ai-layer` edits, no deploy). The 3 normalizers map their sources onto one flat `UnifiedFact` using the exact `CampaignDayFact` titles; non-measured metrics stay `0.0` and are disambiguated by exported capability-set constants. Currency travels from each normalizer via `platform_extra["currency"]`, is surfaced by the funnel onto `ConnectorStatus.currency`, and reconciled into `UnifiedSnapshot.currency` + `Blended`; a `RateProvider` seam allows future on-demand FX with zero reshaping.

**Tech Stack:** Python 3.11+, pydantic v2, httpx (lazy), pytest. Tests run $0 via `conftest.FakeHttp`/`FakeConnector` (no network, no editable install — `conftest.py` puts the package on `sys.path`).

## Global Constraints

- **Connector isolation (load-bearing):** `connectors/*` imports NOTHING from `apps/ai-layer`, `rnd`, or `apps/api`. One-way dependency only. Verified in Task 10.
- **Brain is not None-safe:** every `UnifiedFact` numeric MUST default to `0.0` (float) or `0`, NEVER `None`. A metric a platform does not measure is `0.0`, never `None`.
- **No dropped data:** every metric the brain reads is a first-class field; `platform_extra` holds only true residue (currency transport + platform-unique keys).
- **Derived metrics are STORED** (parity with `CampaignDayFact`), not computed-on-read.
- **`impressions` and `clicks` are `float`** (parity — all 20 `CampaignDayFact` fields are float).
- **Commits:** plain conventional-commit messages. Do NOT add any AI/agent attribution or co-author trailer.
- **Test command (from repo root, connector deps installed):** `cd apps/connectors && python -m pytest tests -q`. Single test: `... python -m pytest tests/test_x.py::test_name -v`.
- **Capability-set membership (semantic — derived counts as measured):**
  - `META_METRICS` = all 17 metric fields.
  - `GOOGLE_METRICS` = all 17 EXCEPT `{reach, frequency, add_to_cart, checkout}` (= 13).
  - `SHOPIFY_METRICS` = `{revenue, conversions}` (= 2).
- The 17 metric fields, in order: `spend, impressions, reach, frequency, clicks, ctr, cpc, link_clicks, link_ctr, cost_per_link_click, cpm, add_to_cart, checkout, conversions, revenue, roas, cpa`.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `connectors/contract.py` | `UnifiedFact` superset; `Blended`/`ConnectorStatus`/`UnifiedSnapshot` currency fields | 1 |
| `connectors/capabilities.py` (new) | `METRIC_FIELDS`, `META/GOOGLE/SHOPIFY_METRICS`, `measures()` | 2 |
| `connectors/fx.py` (new) | `RateProvider` protocol (the FX seam) | 3 |
| `connectors/config.py` | inert FX `Settings` knobs + `CONNECTOR_FX_*` env reads | 3 |
| `connectors/__init__.py` | export capability sets; thread `rate_provider`/`target_currency` into `get_snapshot` | 2, 8 |
| `connectors/meta/normalize.py` | promote demoted/dropped Meta fields to first-class | 4 |
| `connectors/shopify/normalize.py` | first-class fields + `platform_extra["currency"]`; `ORDER_FIELDS` += currency | 5 |
| `connectors/shopify/client.py` | bound `fetch_assets` order scan by window (#35) | 6 |
| `connectors/google/normalize.py` | map onto superset + derived + currency | 7 |
| `connectors/google/client.py` | select `customer.currency_code`; add to row dict | 7 |
| `connectors/funnel.py` | currency reconciliation + FX; surface `ConnectorStatus.currency`; set `snapshot.currency` | 8 |
| `apps/connectors/.env.example` | document `CONNECTOR_FX_*` | 3 |
| `tests/test_*.py` | per-task tests (new + updated) | all |

---

## Task 1: Contract reshape — `UnifiedFact` superset + currency fields

**Files:**
- Modify: `apps/connectors/connectors/contract.py:44-101`
- Test: `apps/connectors/tests/test_contract.py`

**Interfaces:**
- Produces: `UnifiedFact` with the 17 metric fields (all `float`, default `0.0`) + identity; `ConnectorStatus.currency: str | None = None`; `Blended.currency: str = ""`, `Blended.currency_mismatch: bool = False`; `UnifiedSnapshot.currency: str = ""`.

- [ ] **Step 1: Write the failing test** — append to `apps/connectors/tests/test_contract.py`:

```python
def test_unified_fact_is_flat_superset_all_float_non_null():
    from connectors.capabilities import METRIC_FIELDS  # defined in Task 2; import-safe once present
    f = UnifiedFact(platform="meta", account_id="a1", entity_id="c1", date="2026-06-01")
    # every metric field exists, defaults to 0.0, and is a float (never None/int)
    for name in ("spend", "impressions", "reach", "frequency", "clicks", "ctr", "cpc",
                 "link_clicks", "link_ctr", "cost_per_link_click", "cpm",
                 "add_to_cart", "checkout", "conversions", "revenue", "roas", "cpa"):
        val = getattr(f, name)
        assert val == 0.0 and isinstance(val, float), name


def test_currency_fields_present_with_defaults():
    assert ConnectorStatus(platform="meta", state="ok").currency is None
    b = Blended()
    assert b.currency == "" and b.currency_mismatch is False
    snap = UnifiedSnapshot(brand_id="x", since="2026-06-01", until="2026-06-02")
    assert snap.currency == ""
```

> Note: the first test imports `connectors.capabilities` (Task 2). If running Task 1 in isolation before Task 2, drop that import line — it is not otherwise used here. It documents the field list is the single source of truth.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/connectors && python -m pytest tests/test_contract.py::test_unified_fact_is_flat_superset_all_float_non_null -v`
Expected: FAIL — `AttributeError`/validation error (fields `reach`, `ctr`, … not on `UnifiedFact`).

- [ ] **Step 3: Replace the `UnifiedFact` class** (`contract.py:44-57`) with the flat superset:

```python
class UnifiedFact(BaseModel):
    """One platform × entity × day row — a flat superset preserving CampaignDayFact titles.
    Every numeric is a non-null float (the brain is not None-safe); metrics a platform does not
    measure are 0.0 and disambiguated by the capability sets (see connectors.capabilities).
    Only true residue (currency transport, platform-unique keys) lives in platform_extra."""
    # identity
    platform: Platform
    account_id: str
    entity_id: str
    entity_name: str = ""
    date: str                           # ISO YYYY-MM-DD
    # delivery
    spend: float = 0.0
    impressions: float = 0.0            # float for parity with CampaignDayFact
    reach: float = 0.0                  # Meta only
    frequency: float = 0.0              # Meta only
    # all-clicks (secondary)
    clicks: float = 0.0                 # float for parity
    ctr: float = 0.0
    cpc: float = 0.0
    # link-clicks (headline traffic)
    link_clicks: float = 0.0
    link_ctr: float = 0.0
    cost_per_link_click: float = 0.0
    # efficiency
    cpm: float = 0.0
    # funnel
    add_to_cart: float = 0.0            # Meta pixel; Shopify/Google N/A
    checkout: float = 0.0               # Meta pixel; Shopify/Google N/A
    conversions: float = 0.0            # Meta purchases / Shopify orders / Google conversions
    revenue: float = 0.0
    # derived (STORED — parity with CampaignDayFact)
    roas: float = 0.0                   # revenue / spend (DERIVED, never a reported field)
    cpa: float = 0.0                    # spend / conversions
    # residue only
    platform_extra: dict = Field(default_factory=dict)
```

- [ ] **Step 4: Add `currency` to `ConnectorStatus`** (`contract.py`, in the `ConnectorStatus` class body, after `elapsed_ms: int = 0`):

```python
    currency: str | None = None         # account currency this connector reported (funnel-surfaced)
```

- [ ] **Step 5: Add currency fields to `Blended`** (in the `Blended` class body, after `revenue_gap_pct`):

```python
    currency: str = ""                  # currency the blended figures are expressed in
    currency_mismatch: bool = False     # True if platforms disagreed and no FX was applied
```

- [ ] **Step 6: Change the `UnifiedSnapshot.currency` default** from `"USD"` to `""`:

```python
    currency: str = ""                  # set by the funnel from the connectors' reported currencies
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd apps/connectors && python -m pytest tests/test_contract.py -v`
Expected: PASS (all, including the pre-existing round-trip/helper tests). Remove the `from connectors.capabilities import METRIC_FIELDS` line if Task 2 is not yet done.

- [ ] **Step 8: Commit**

```bash
git add apps/connectors/connectors/contract.py apps/connectors/tests/test_contract.py
git commit -m "feat(connectors): UnifiedFact flat superset + currency fields"
```

---

## Task 2: Capability sets module + package export

**Files:**
- Create: `apps/connectors/connectors/capabilities.py`
- Modify: `apps/connectors/connectors/__init__.py:12-26`
- Test: `apps/connectors/tests/test_capability_sets.py` (new)

**Interfaces:**
- Produces: `connectors.capabilities.METRIC_FIELDS: tuple[str, ...]`; `META_METRICS`, `GOOGLE_METRICS`, `SHOPIFY_METRICS: frozenset[str]`; `CAPABILITIES: dict[str, frozenset[str]]`; `measures(platform: str, field: str) -> bool`. Re-exported from `connectors`.

- [ ] **Step 1: Write the failing test** — create `apps/connectors/tests/test_capability_sets.py`:

```python
from connectors import META_METRICS, GOOGLE_METRICS, SHOPIFY_METRICS
from connectors.capabilities import METRIC_FIELDS, measures


def test_meta_measures_everything():
    assert META_METRICS == frozenset(METRIC_FIELDS)
    assert len(METRIC_FIELDS) == 17


def test_google_excludes_only_truly_absent_fields():
    assert GOOGLE_METRICS == META_METRICS - {"reach", "frequency", "add_to_cart", "checkout"}
    assert "ctr" in GOOGLE_METRICS and "roas" in GOOGLE_METRICS   # derived counts as measured
    assert "reach" not in GOOGLE_METRICS


def test_shopify_measures_only_revenue_and_conversions():
    assert SHOPIFY_METRICS == frozenset({"revenue", "conversions"})


def test_measures_helper():
    assert measures("shopify", "revenue") is True
    assert measures("shopify", "spend") is False
    assert measures("google", "reach") is False
    assert measures("meta", "add_to_cart") is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/connectors && python -m pytest tests/test_capability_sets.py -v`
Expected: FAIL — `ImportError` (`capabilities` module / `META_METRICS` export absent).

- [ ] **Step 3: Create `apps/connectors/connectors/capabilities.py`:**

```python
"""Per-platform capability sets — the single source of truth for "does this platform measure
this metric?". Semantic: a DERIVED metric counts as measured; only truly-absent metrics are N/A.
A field at 0.0 is a real zero only when it is in that platform's set.

Exported from the package so a future ai-layer import uses this, not a hardcoded copy."""
from __future__ import annotations

METRIC_FIELDS = (
    "spend", "impressions", "reach", "frequency", "clicks", "ctr", "cpc",
    "link_clicks", "link_ctr", "cost_per_link_click", "cpm",
    "add_to_cart", "checkout", "conversions", "revenue", "roas", "cpa",
)  # 17 metric fields — order mirrors UnifiedFact / CampaignDayFact

META_METRICS = frozenset(METRIC_FIELDS)                                    # Meta measures/derives all
GOOGLE_METRICS = META_METRICS - {"reach", "frequency", "add_to_cart", "checkout"}
SHOPIFY_METRICS = frozenset({"revenue", "conversions"})                    # orders + revenue only

CAPABILITIES: dict[str, frozenset[str]] = {
    "meta": META_METRICS, "google": GOOGLE_METRICS, "shopify": SHOPIFY_METRICS,
}


def measures(platform: str, field: str) -> bool:
    """True if `platform` actually measures/derives `field` (vs. an N/A 0.0)."""
    return field in CAPABILITIES.get(platform, frozenset())
```

- [ ] **Step 4: Export from `__init__.py`** — add the import after the `from .contract import (...)` block (`__init__.py:20`):

```python
from .capabilities import (  # noqa: E402
    CAPABILITIES,
    GOOGLE_METRICS,
    META_METRICS,
    SHOPIFY_METRICS,
    measures,
)
```

and extend `__all__` (`__init__.py:22-26`) to include them:

```python
__all__ = [
    "get_snapshot", "get_assets",
    "BrandRef", "DateWindow", "UnifiedSnapshot", "UnifiedFact",
    "AssetRecord", "Blended", "ConnectorStatus",
    "META_METRICS", "GOOGLE_METRICS", "SHOPIFY_METRICS", "CAPABILITIES", "measures",
]
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/connectors && python -m pytest tests/test_capability_sets.py -v`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/connectors/connectors/capabilities.py apps/connectors/connectors/__init__.py apps/connectors/tests/test_capability_sets.py
git commit -m "feat(connectors): semantic per-platform capability sets"
```

---

## Task 3: FX config scaffolding + `RateProvider` seam (inert)

**Files:**
- Create: `apps/connectors/connectors/fx.py`
- Modify: `apps/connectors/connectors/config.py:45-55` (Settings), `:87-93` (get_settings)
- Modify: `apps/connectors/.env.example` (append FX block)
- Test: `apps/connectors/tests/test_fx_config.py` (new)

**Interfaces:**
- Produces: `connectors.fx.RateProvider` (Protocol with `rate(base: str, quote: str) -> float`); `Settings.fx_enabled: bool`, `Settings.fx_target_currency: str | None`, `Settings.fx_cache_ttl_hours: int`, `Settings.fx_source: str`, `Settings.fx_rate_url: str | None`; `get_settings()` reads `CONNECTOR_FX_*`.

- [ ] **Step 1: Write the failing test** — create `apps/connectors/tests/test_fx_config.py`:

```python
from connectors.config import Settings, get_settings
from connectors.fx import RateProvider


def test_fx_settings_default_inert():
    s = Settings()
    assert s.fx_enabled is False
    assert s.fx_target_currency is None
    assert s.fx_cache_ttl_hours == 24
    assert s.fx_source == "frankfurter"
    assert s.fx_rate_url is None


def test_fx_settings_read_from_env(monkeypatch):
    monkeypatch.setenv("CONNECTOR_FX_ENABLED", "true")
    monkeypatch.setenv("CONNECTOR_FX_TARGET_CURRENCY", "USD")
    monkeypatch.setenv("CONNECTOR_FX_CACHE_TTL_HOURS", "12")
    monkeypatch.setenv("CONNECTOR_FX_SOURCE", "ecb")
    monkeypatch.setenv("CONNECTOR_FX_RATE_URL", "https://example.test/rates")
    s = get_settings()
    assert s.fx_enabled is True
    assert s.fx_target_currency == "USD"
    assert s.fx_cache_ttl_hours == 12
    assert s.fx_source == "ecb"
    assert s.fx_rate_url == "https://example.test/rates"


def test_rate_provider_is_a_runtime_checkable_protocol():
    class FixedRate:
        def rate(self, base, quote):
            return 80.0
    assert isinstance(FixedRate(), RateProvider)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/connectors && python -m pytest tests/test_fx_config.py -v`
Expected: FAIL — `ImportError` (`connectors.fx` absent) / `AttributeError` (`Settings.fx_enabled`).

- [ ] **Step 3: Create `apps/connectors/connectors/fx.py`:**

```python
"""FX-conversion seam (shipped inert). The connector stays isolated/stateless/no-DB, so it ships
ONLY this protocol + no default provider. A caching RateProvider is implemented caller-side
(ai-layer) and injected via get_snapshot(rate_provider=...). See the spec's FX provider design
(daily fetch -> 24h Neon cache -> on-demand convert; Frankfurter/ECB source)."""
from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class RateProvider(Protocol):
    def rate(self, base: str, quote: str) -> float:
        """Units of `quote` per 1 unit of `base` for the current day. Raises if unavailable."""
        ...
```

- [ ] **Step 4: Add FX knobs to `Settings`** (`config.py`, append inside the `Settings` class after `asset_host_allowlist`):

```python
    # FX conversion (inert scaffolding — no provider is built/injected by default; see fx.py)
    fx_enabled: bool = False
    fx_target_currency: str | None = None
    fx_cache_ttl_hours: int = 24
    fx_source: str = "frankfurter"
    fx_rate_url: str | None = None
```

- [ ] **Step 5: Read the FX env vars in `get_settings()`** (`config.py:87-93`) — extend the body before `return s`:

```python
def get_settings() -> Settings:
    s = Settings()
    if (t := _env("CONNECTOR_TIMEOUT_S")):
        s.timeout_s = float(t)
    if (d := _env("CONNECTOR_ASSET_DIR")):
        s.asset_dir = Path(d)
    if (e := _env("CONNECTOR_FX_ENABLED")):
        s.fx_enabled = e.lower() in ("1", "true", "yes", "on")
    if (c := _env("CONNECTOR_FX_TARGET_CURRENCY")):
        s.fx_target_currency = c
    if (ttl := _env("CONNECTOR_FX_CACHE_TTL_HOURS")):
        s.fx_cache_ttl_hours = int(ttl)
    if (src := _env("CONNECTOR_FX_SOURCE")):
        s.fx_source = src
    if (u := _env("CONNECTOR_FX_RATE_URL")):
        s.fx_rate_url = u
    return s
```

- [ ] **Step 6: Document env vars** — append to `apps/connectors/.env.example`:

```bash

# --- FX conversion (optional; inert by default — see connectors/fx.py) ---
# When a caching RateProvider is injected caller-side, these drive blended-ROAS currency
# normalization. Phase 0 ships the seam only; nothing converts unless a provider is supplied.
# CONNECTOR_FX_ENABLED=false
# CONNECTOR_FX_TARGET_CURRENCY=USD
# CONNECTOR_FX_CACHE_TTL_HOURS=24
# CONNECTOR_FX_SOURCE=frankfurter
# CONNECTOR_FX_RATE_URL=
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd apps/connectors && python -m pytest tests/test_fx_config.py -v`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add apps/connectors/connectors/fx.py apps/connectors/connectors/config.py apps/connectors/.env.example apps/connectors/tests/test_fx_config.py
git commit -m "feat(connectors): inert FX config scaffolding + RateProvider seam"
```

---

## Task 4: Meta normalizer — promote all fields to first-class

**Files:**
- Modify: `apps/connectors/connectors/meta/normalize.py:43-73`
- Test: `apps/connectors/tests/test_meta.py:14-27` (update) + new all-fields test

**Interfaces:**
- Consumes: `UnifiedFact` superset (Task 1).
- Produces: `row_to_fact(raw: dict, account_id: str) -> UnifiedFact` populating all 17 metric fields; `platform_extra == {"currency": <account_currency>}` only.

- [ ] **Step 1: Update the two stale assertions + add an all-fields test** in `apps/connectors/tests/test_meta.py`.

Replace the last two asserts of `test_row_to_fact_uses_pixel_purchase_and_derived_roas` (`test_meta.py:26-27`):

```python
    assert f.roas == 4.0            # 400/100 derived, now first-class
    assert f.link_clicks == 40      # inline link clicks, now first-class
    assert f.platform_extra == {} or set(f.platform_extra) <= {"currency"}  # residue only
```

Add a new test:

```python
def test_row_to_fact_populates_all_metric_fields_and_derives_missing():
    raw = {
        "campaign_id": "c1", "campaign_name": "Promo", "date_start": "2026-06-01",
        "account_currency": "INR",
        "spend": "100", "impressions": "1000", "reach": "800", "clicks": "50",
        "inline_link_clicks": "40",
        # ctr/cpc/link_ctr/cost_per_link_click/cpm/frequency omitted -> derived
        "actions": [{"action_type": "offsite_conversion.fb_pixel_purchase", "value": "5"},
                    {"action_type": "add_to_cart", "value": "20"},
                    {"action_type": "initiate_checkout", "value": "12"}],
        "action_values": [{"action_type": "offsite_conversion.fb_pixel_purchase", "value": "400"}],
    }
    f = row_to_fact(raw, "act_123")
    assert isinstance(f.impressions, float) and f.impressions == 1000.0
    assert isinstance(f.clicks, float) and f.clicks == 50.0
    assert f.reach == 800.0
    assert round(f.ctr, 2) == 5.0                 # 50/1000*100
    assert round(f.cpc, 2) == 2.0                 # 100/50
    assert round(f.link_ctr, 2) == 4.0            # 40/1000*100
    assert round(f.cost_per_link_click, 2) == 2.5  # 100/40
    assert round(f.cpm, 2) == 100.0               # 100/1000*1000
    assert round(f.frequency, 2) == 1.25          # 1000/800
    assert f.add_to_cart == 20.0 and f.checkout == 12.0
    assert f.conversions == 5.0 and f.revenue == 400.0
    assert round(f.roas, 2) == 4.0 and round(f.cpa, 2) == 20.0
    assert f.platform_extra == {"currency": "INR"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/connectors && python -m pytest tests/test_meta.py::test_row_to_fact_populates_all_metric_fields_and_derives_missing -v`
Expected: FAIL — fields like `reach`, `ctr`, `cpm` still land in `platform_extra`, not on the fact.

- [ ] **Step 3: Replace `row_to_fact`** (`meta/normalize.py:43-73`) with:

```python
def row_to_fact(raw: dict, account_id: str) -> UnifiedFact:
    spend = _f(raw.get("spend"))
    impressions = _f(raw.get("impressions"))
    reach = _f(raw.get("reach"))
    clicks = _f(raw.get("clicks"))
    link_clicks = _f(raw.get("inline_link_clicks")) \
        or _action_value(raw.get("actions"), LINK_CLICK_ACTION_TYPES)
    purchases = _action_value(raw.get("actions"), PURCHASE_ACTION_TYPES)
    revenue = _action_value(raw.get("action_values"), PURCHASE_ACTION_TYPES)
    # Prefer platform-reported derived metrics; fall back to derivation (never None).
    ctr = _f(raw.get("ctr")) or (clicks / impressions * 100 if impressions else 0.0)
    cpc = _f(raw.get("cpc")) or (spend / clicks if clicks else 0.0)
    link_ctr = _f(raw.get("inline_link_click_ctr")) or (link_clicks / impressions * 100 if impressions else 0.0)
    cost_per_link_click = _f(raw.get("cost_per_inline_link_click")) or (spend / link_clicks if link_clicks else 0.0)
    cpm = _f(raw.get("cpm")) or (spend / impressions * 1000 if impressions else 0.0)
    frequency = _f(raw.get("frequency")) or (impressions / reach if reach else 0.0)
    return UnifiedFact(
        platform="meta",
        account_id=account_id,
        entity_id=str(raw.get("campaign_id", "")),
        entity_name=raw.get("campaign_name", raw.get("campaign_id", "unknown")),
        date=raw.get("date_start", ""),
        spend=spend, impressions=impressions, reach=reach, frequency=frequency,
        clicks=clicks, ctr=ctr, cpc=cpc,
        link_clicks=link_clicks, link_ctr=link_ctr, cost_per_link_click=cost_per_link_click,
        cpm=cpm,
        add_to_cart=_action_value(raw.get("actions"), ATC_ACTION_TYPES),
        checkout=_action_value(raw.get("actions"), CHECKOUT_ACTION_TYPES),
        conversions=purchases, revenue=revenue,
        roas=(revenue / spend if spend else 0.0),        # DERIVED, never the reported field
        cpa=(spend / purchases if purchases else 0.0),
        platform_extra={"currency": raw.get("account_currency")},
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/connectors && python -m pytest tests/test_meta.py -v`
Expected: PASS (all — updated + new + the pagination/asset tests unchanged).

- [ ] **Step 5: Commit**

```bash
git add apps/connectors/connectors/meta/normalize.py apps/connectors/tests/test_meta.py
git commit -m "feat(connectors): promote all Meta metrics to first-class UnifiedFact fields"
```

---

## Task 5: Shopify normalizer — first-class fields + currency capture

**Files:**
- Modify: `apps/connectors/connectors/shopify/normalize.py:10` (ORDER_FIELDS), `:21-36` (orders_to_daily_facts)
- Test: `apps/connectors/tests/test_shopify.py` (add a currency test)

**Interfaces:**
- Consumes: `UnifiedFact` superset (Task 1).
- Produces: `orders_to_daily_facts(orders, domain) -> list[UnifiedFact]` with `platform_extra == {"orders": <cnt>, "currency": <shop currency or None>}`; `ORDER_FIELDS` includes `currency`.

- [ ] **Step 1: Write the failing test** — append to `apps/connectors/tests/test_shopify.py`:

```python
def test_orders_to_daily_facts_captures_currency_in_platform_extra():
    orders = [
        {"created_at": "2026-06-01T10:00:00Z", "current_total_price": "100", "currency": "INR"},
        {"created_at": "2026-06-01T12:00:00Z", "total_price": "50", "currency": "INR"},
    ]
    facts = orders_to_daily_facts(orders, "acme.myshopify.com")
    assert facts[0].platform_extra["currency"] == "INR"
    assert facts[0].platform_extra["orders"] == 2
    assert facts[0].revenue == 150 and facts[0].conversions == 2


def test_order_fields_requests_currency():
    from connectors.shopify.normalize import ORDER_FIELDS
    assert "currency" in ORDER_FIELDS
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/connectors && python -m pytest tests/test_shopify.py::test_orders_to_daily_facts_captures_currency_in_platform_extra -v`
Expected: FAIL — `KeyError: 'currency'` (platform_extra has only `orders`).

- [ ] **Step 3: Add `currency` to `ORDER_FIELDS`** (`shopify/normalize.py:10`):

```python
ORDER_FIELDS = "id,created_at,total_price,current_total_price,financial_status,currency"
```

- [ ] **Step 4: Rewrite `orders_to_daily_facts`** (`shopify/normalize.py:21-36`) to capture currency:

```python
def orders_to_daily_facts(orders, domain: str) -> list[UnifiedFact]:
    by_day: dict[str, list] = {}     # date -> [revenue, count]
    currency = None                  # shop currency — first order that carries it
    for o in orders:
        d = (o.get("created_at") or "")[:10]
        if not d:
            continue
        if currency is None:
            currency = o.get("currency")
        rev = _f(o.get("current_total_price") or o.get("total_price"))
        agg = by_day.setdefault(d, [0.0, 0])
        agg[0] += rev
        agg[1] += 1
    return [
        UnifiedFact(platform="shopify", account_id=domain, entity_id="orders",
                    entity_name="Shopify orders", date=d, revenue=rev, conversions=cnt,
                    platform_extra={"orders": cnt, "currency": currency})
        for d, (rev, cnt) in sorted(by_day.items())
    ]
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/connectors && python -m pytest tests/test_shopify.py -v`
Expected: PASS (all — the existing `test_orders_to_daily_facts_groups_revenue_by_day` still passes; its orders lack a `currency` key so `platform_extra["currency"]` is `None`, which it does not assert on).

- [ ] **Step 6: Commit**

```bash
git add apps/connectors/connectors/shopify/normalize.py apps/connectors/tests/test_shopify.py
git commit -m "feat(connectors): capture Shopify shop currency into UnifiedFact"
```

---

## Task 6: Shopify assets-timeout fix (#35) — bound the order scan

**Files:**
- Modify: `apps/connectors/connectors/shopify/client.py:56-60` (`fetch_assets`) + imports
- Test: `apps/connectors/tests/test_shopify.py` (add a window-bound test)

**Interfaces:**
- Consumes: `DateWindow` (contract), `nz.ORDER_LINE_FIELDS`.
- Produces: `ShopifyConnector.fetch_assets` queries `orders.json` with `created_at_min`/`created_at_max` bounding a recent window; `ASSETS_WINDOW_DAYS = 30` module constant.

- [ ] **Step 1: Write the failing test** — append to `apps/connectors/tests/test_shopify.py`:

```python
def test_fetch_assets_bounds_the_order_scan_by_window():
    http = FakeHttp(json_map={"orders.json": {"orders": []}})
    conn = ShopifyConnector(CREDS, Settings(), http=http)
    asyncio.run(conn.fetch_assets(None, top_n=3))
    orders_calls = [c for c in http.calls if "orders.json" in c[1]]
    assert orders_calls, "assets path must query orders.json"
    params = orders_calls[0][2] or {}
    assert "created_at_min" in params and "created_at_max" in params  # scan is date-bounded (#35)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/connectors && python -m pytest tests/test_shopify.py::test_fetch_assets_bounds_the_order_scan_by_window -v`
Expected: FAIL — `assert "created_at_min" in params` fails (the current call sends only `status/limit/fields`, an unbounded scan).

- [ ] **Step 3: Import `DateWindow` + add the window constant** in `shopify/client.py`. The contract import at `:11` already includes `DateWindow` — confirm it is present:

```python
from ..contract import AssetRecord, ConnectorStatus, DateWindow, UnifiedFact
```

Add a module constant after `_NEXT_LINK` (`:14`):

```python
ASSETS_WINDOW_DAYS = 30   # bound the winning-products scan so get_assets can't hang (#35)
```

- [ ] **Step 4: Bound the order query in `fetch_assets`** (`shopify/client.py:56-60`) — replace the `orders = await self._paginate(...)` call:

```python
    async def fetch_assets(self, account_id: str | None, top_n: int) -> list[AssetRecord]:
        # Winning products = top revenue from RECENT order line items; bounded so it can't hang.
        win = DateWindow.last_n_days(ASSETS_WINDOW_DAYS)
        orders = await self._paginate("orders.json", {
            "status": "any", "limit": 250, "fields": nz.ORDER_LINE_FIELDS,
            "created_at_min": f"{win.since}T00:00:00Z",
            "created_at_max": f"{win.until}T23:59:59Z",
        }, key="orders")
```

(The remainder of `fetch_assets` — `out_dir`, the `aggregate_products` loop, and the `AssetRecord` build — is unchanged.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/connectors && python -m pytest tests/test_shopify.py -v`
Expected: PASS (all — the existing `test_fetch_assets_downloads_top_product_image` still passes; `FakeHttp` matches by URL substring and ignores the new params).

- [ ] **Step 6: Commit**

```bash
git add apps/connectors/connectors/shopify/client.py apps/connectors/tests/test_shopify.py
git commit -m "fix(connectors): bound Shopify assets order scan by window (#35)"
```

---

## Task 7: Google normalizer + client — superset mapping + currency

**Files:**
- Modify: `apps/connectors/connectors/google/normalize.py:8-38`
- Modify: `apps/connectors/connectors/google/client.py:43-59` (GAQL select + row dict)
- Test: `apps/connectors/tests/test_google_degradation.py` (add a mapping test)

**Interfaces:**
- Consumes: `UnifiedFact` superset (Task 1).
- Produces: `rows_to_facts(rows, customer_id) -> list[UnifiedFact]` populating `GOOGLE_METRICS` fields (derived filled) + `platform_extra == {"cost_micros": ..., "currency": <currency_code or None>}`; client `_search_blocking` row dict includes `"currency_code"`; `GAQL_CAMPAIGN_DAILY` selects `customer.currency_code`.

- [ ] **Step 1: Write the failing test** — append to `apps/connectors/tests/test_google_degradation.py`:

```python
def test_google_rows_map_onto_superset_with_derived_and_currency():
    rows = [{"campaign_id": 7, "campaign_name": "Search", "date": "2026-06-01",
             "currency_code": "USD", "cost_micros": 10_000_000, "impressions": 1000,
             "clicks": 50, "conversions": 5, "conversions_value": 250}]
    from connectors.google.normalize import rows_to_facts
    f = rows_to_facts(rows, "123")[0]
    assert f.spend == 10.0 and f.impressions == 1000.0 and f.clicks == 50.0
    assert round(f.ctr, 2) == 5.0 and round(f.cpc, 2) == 0.2 and round(f.cpm, 2) == 10.0
    assert f.link_clicks == 50.0 and round(f.link_ctr, 2) == 5.0   # link ≈ all clicks for Google
    assert f.conversions == 5.0 and f.revenue == 250.0
    assert round(f.roas, 2) == 25.0 and round(f.cpa, 2) == 2.0
    assert f.reach == 0.0 and f.frequency == 0.0 and f.add_to_cart == 0.0  # N/A stays 0.0
    assert f.platform_extra["currency"] == "USD"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/connectors && python -m pytest tests/test_google_degradation.py::test_google_rows_map_onto_superset_with_derived_and_currency -v`
Expected: FAIL — `ctr/cpm/link_clicks` are `0.0` (current normalizer only sets core fields) and `platform_extra["currency"]` is missing.

- [ ] **Step 3: Rewrite `rows_to_facts` + GAQL** (`google/normalize.py:8-38`):

```python
# Daily campaign performance. cost is micros; revenue = conversions_value; currency from customer.
GAQL_CAMPAIGN_DAILY = (
    "SELECT campaign.id, campaign.name, segments.date, customer.currency_code, "
    "metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, "
    "metrics.conversions_value "
    "FROM campaign WHERE segments.date BETWEEN '{since}' AND '{until}'"
)


def _f(v, default: float = 0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def rows_to_facts(rows, customer_id: str) -> list[UnifiedFact]:
    out = []
    for r in rows:
        spend = _f(r.get("cost_micros")) / 1_000_000.0
        impressions = _f(r.get("impressions"))
        clicks = _f(r.get("clicks"))
        conversions = _f(r.get("conversions"))
        revenue = _f(r.get("conversions_value"))
        ctr = clicks / impressions * 100 if impressions else 0.0
        cpc = spend / clicks if clicks else 0.0
        cpm = spend / impressions * 1000 if impressions else 0.0
        out.append(UnifiedFact(
            platform="google",
            account_id=customer_id,
            entity_id=str(r.get("campaign_id", "")),
            entity_name=r.get("campaign_name", ""),
            date=r.get("date", ""),
            spend=spend, impressions=impressions, clicks=clicks,
            ctr=ctr, cpc=cpc,
            link_clicks=clicks, link_ctr=ctr, cost_per_link_click=cpc,  # Google: link ≈ all clicks
            cpm=cpm,
            conversions=conversions, revenue=revenue,
            roas=(revenue / spend if spend else 0.0),
            cpa=(spend / conversions if conversions else 0.0),
            platform_extra={"cost_micros": r.get("cost_micros"),
                            "currency": r.get("currency_code")},
        ))
    return out
```

- [ ] **Step 4: Add `currency_code` to the client row dict** (`google/client.py:48-58`) — inside `_search_blocking`, add the field to the appended dict:

```python
                rows.append({
                    "campaign_id": r.campaign.id,
                    "campaign_name": r.campaign.name,
                    "date": r.segments.date,
                    "currency_code": r.customer.currency_code,
                    "cost_micros": r.metrics.cost_micros,
                    "impressions": r.metrics.impressions,
                    "clicks": r.metrics.clicks,
                    "conversions": r.metrics.conversions,
                    "conversions_value": r.metrics.conversions_value,
                })
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/connectors && python -m pytest tests/test_google_degradation.py -v`
Expected: PASS (all — the existing `test_google_maps_rows_when_token_works` still passes; its rows omit `currency_code` so `platform_extra["currency"]` is `None`, which it does not assert).

- [ ] **Step 6: Commit**

```bash
git add apps/connectors/connectors/google/normalize.py apps/connectors/connectors/google/client.py apps/connectors/tests/test_google_degradation.py
git commit -m "feat(connectors): map Google rows onto UnifiedFact superset + currency"
```

---

## Task 8: Funnel currency reconciliation + FX seam wiring

**Files:**
- Modify: `apps/connectors/connectors/funnel.py:29-43` (blend helpers), `:104-130` (`run`)
- Modify: `apps/connectors/connectors/__init__.py:29-35` (`get_snapshot` signature)
- Test: `apps/connectors/tests/test_currency.py` (new); `tests/test_funnel.py` stays green

**Interfaces:**
- Consumes: `UnifiedFact.platform_extra["currency"]` (Tasks 4/5/7); `fx.RateProvider`; `Settings.fx_target_currency`.
- Produces: `funnel.compute_blended(facts) -> Blended` (unchanged behavior); `funnel.reconcile_blended(facts, currencies, *, rate_provider=None, target_currency=None, fx_target=None) -> tuple[Blended, str]`; `funnel.run(..., *, rate_provider=None, target_currency=None, ...)`; `get_snapshot(brand, window, platforms=None, *, rate_provider=None, target_currency=None)`.

- [ ] **Step 1: Write the failing test** — create `apps/connectors/tests/test_currency.py`:

```python
import asyncio

from conftest import FakeConnector

from connectors.contract import BrandRef, DateWindow, UnifiedFact
from connectors.funnel import run

BRAND = BrandRef(brand_id="acme")
WINDOW = DateWindow(since="2026-06-01", until="2026-06-30")


def _fact(platform, currency, *, spend=0.0, revenue=0.0):
    return UnifiedFact(platform=platform, account_id="a1", entity_id="e1", date="2026-06-01",
                       spend=spend, revenue=revenue, platform_extra={"currency": currency})


def test_single_currency_sets_snapshot_currency_no_mismatch():
    conns = [FakeConnector("meta", facts=[_fact("meta", "USD", spend=100, revenue=300)]),
             FakeConnector("shopify", facts=[_fact("shopify", "USD", revenue=400)])]
    snap = asyncio.run(run(BRAND, WINDOW, _connectors=conns))
    assert snap.currency == "USD"
    assert snap.blended.currency == "USD"
    assert snap.blended.currency_mismatch is False
    assert snap.status_for("meta").currency == "USD"


def test_currency_mismatch_without_provider_is_flagged():
    conns = [FakeConnector("meta", facts=[_fact("meta", "USD", spend=100)]),
             FakeConnector("shopify", facts=[_fact("shopify", "INR", revenue=8000)])]
    snap = asyncio.run(run(BRAND, WINDOW, _connectors=conns))
    assert snap.currency == "MIXED"
    assert snap.blended.currency_mismatch is True


def test_currency_mismatch_with_provider_converts_and_clears_flag():
    conns = [FakeConnector("meta", facts=[_fact("meta", "USD", spend=100)]),
             FakeConnector("shopify", facts=[_fact("shopify", "INR", revenue=8000)])]

    class FixedRate:   # 1 USD = 80 INR
        def rate(self, base, quote):
            return 80.0 if (base, quote) == ("USD", "INR") else 1.0

    snap = asyncio.run(run(BRAND, WINDOW, _connectors=conns,
                           rate_provider=FixedRate(), target_currency="INR"))
    assert snap.currency == "INR"
    assert snap.blended.currency_mismatch is False
    assert snap.blended.spend == 8000.0                     # 100 USD -> 8000 INR
    assert round(snap.blended.blended_roas, 4) == 1.0       # 8000 INR revenue / 8000 INR spend
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/connectors && python -m pytest tests/test_currency.py -v`
Expected: FAIL — `run()` has no `rate_provider` kwarg / `snap.currency` is `""` and `blended.currency_mismatch` is unset.

- [ ] **Step 3: Refactor the blend math + add reconciliation** in `funnel.py`. Add the `fx`/`capabilities` imports are NOT needed; add near the top the `RateProvider` type is only used as a duck-typed param. Replace `compute_blended` (`funnel.py:29-43`) with the helper + a thin wrapper + the reconciler:

```python
def _blend_from_sums(meta_spend: float, google_spend: float,
                     meta_rev: float, shop_rev: float) -> Blended:
    ad_spend = meta_spend + google_spend
    truth_rev = shop_rev if shop_rev > 0 else meta_rev
    return Blended(
        spend=ad_spend,
        revenue_meta_pixel=meta_rev,
        revenue_shopify=shop_rev,
        blended_roas=(truth_rev / ad_spend) if ad_spend > 0 else 0.0,
        revenue_gap_pct=((shop_rev - meta_rev) / shop_rev * 100) if shop_rev > 0 else 0.0,
    )


def compute_blended(facts: list[UnifiedFact]) -> Blended:
    """Reconcile ad spend (Meta+Google) against revenue, preferring Shopify as the truth side.
    Currency-agnostic (single-currency assumption); reconcile_blended layers currency on top."""
    return _blend_from_sums(
        sum(f.spend for f in facts if f.platform == "meta"),
        sum(f.spend for f in facts if f.platform == "google"),
        sum(f.revenue for f in facts if f.platform == "meta"),
        sum(f.revenue for f in facts if f.platform == "shopify"),
    )


def reconcile_blended(facts, currencies, *, rate_provider=None, target_currency=None,
                      fx_target=None) -> tuple[Blended, str]:
    """Compute Blended with currency handling. Conversion (when a rate_provider is supplied)
    applies to the blended AGGREGATE only; per-platform facts keep their native currency.
    Returns (Blended, snapshot_currency)."""
    meta_spend = sum(f.spend for f in facts if f.platform == "meta")
    google_spend = sum(f.spend for f in facts if f.platform == "google")
    meta_rev = sum(f.revenue for f in facts if f.platform == "meta")
    shop_rev = sum(f.revenue for f in facts if f.platform == "shopify")

    # Currencies that actually contribute a nonzero figure to the blend.
    contrib: dict[str, str | None] = {}
    if meta_spend or meta_rev:
        contrib["meta"] = currencies.get("meta")
    if google_spend:
        contrib["google"] = currencies.get("google")
    if shop_rev:
        contrib["shopify"] = currencies.get("shopify")
    distinct = {c for c in contrib.values() if c}

    if len(distinct) <= 1:
        common = next(iter(distinct), "")
        b = _blend_from_sums(meta_spend, google_spend, meta_rev, shop_rev)
        b.currency = common
        return b, common

    # Mismatch.
    if rate_provider is not None:
        target = target_currency or fx_target or contrib.get("shopify") or next(iter(distinct))

        def conv(amount: float, base: str | None) -> float:
            if not amount or not base or base == target:
                return amount
            return amount * rate_provider.rate(base, target)

        b = _blend_from_sums(
            conv(meta_spend, contrib.get("meta")),
            conv(google_spend, contrib.get("google")),
            conv(meta_rev, contrib.get("meta")),
            conv(shop_rev, contrib.get("shopify")),
        )
        b.currency = target
        return b, target

    b = _blend_from_sums(meta_spend, google_spend, meta_rev, shop_rev)
    b.currency = "MIXED"
    b.currency_mismatch = True
    return b, "MIXED"


def _currency_from_facts(facts) -> str | None:
    for f in facts:
        c = f.platform_extra.get("currency")
        if c:
            return str(c)
    return None
```

- [ ] **Step 4: Thread currency + FX through `run`** (`funnel.py:104-130`) — update the signature and body:

```python
async def run(brand: BrandRef, window: DateWindow, platforms=None, *,
              rate_provider=None, target_currency=None,
              _connectors=None, _settings: Settings | None = None) -> UnifiedSnapshot:
    settings = _settings or get_settings()
    resolved = _resolve(platforms, settings, _connectors)

    statuses: list[ConnectorStatus] = []
    tasks, task_platforms = [], []
    for platform, conn in resolved:
        if conn is None:
            statuses.append(ConnectorStatus(platform=platform, state="skipped",
                                            detail="no credentials"))
            continue
        tasks.append(_guard(platform, conn.fetch_facts(_account_for(platform, brand), window),
                            settings))
        task_platforms.append(platform)

    facts: list[UnifiedFact] = []
    for (result, status), platform in zip(await asyncio.gather(*tasks), task_platforms):
        if result:
            facts.extend(result)
            status.fact_count = len(result)
            status.currency = _currency_from_facts(result)   # surface reported currency
        statuses.append(status)

    currencies = {s.platform: s.currency for s in statuses}
    blended, snap_currency = reconcile_blended(
        facts, currencies, rate_provider=rate_provider,
        target_currency=target_currency, fx_target=settings.fx_target_currency,
    )
    return UnifiedSnapshot(
        brand_id=brand.brand_id, since=window.since, until=window.until,
        currency=snap_currency, facts=facts, blended=blended, statuses=statuses,
    )
```

- [ ] **Step 5: Thread the kwargs through the facade** (`__init__.py:29-35`) — update `get_snapshot`:

```python
def get_snapshot(brand: BrandRef, window: DateWindow,
                 platforms: list[str] | None = None, *,
                 rate_provider=None, target_currency: str | None = None) -> UnifiedSnapshot:
    """Sync facade: fetch + merge all enabled platforms into one UnifiedSnapshot.
    Pass a RateProvider (see connectors.fx) to normalize blended figures across currencies."""
    import asyncio

    from . import funnel
    return asyncio.run(funnel.run(brand, window, platforms,
                                  rate_provider=rate_provider, target_currency=target_currency))
```

- [ ] **Step 6: Run the currency + funnel tests to verify all pass**

Run: `cd apps/connectors && python -m pytest tests/test_currency.py tests/test_funnel.py -v`
Expected: PASS — new currency tests pass; every existing `test_funnel.py` test still passes (`compute_blended(facts)` behavior unchanged; `run()` now also sets currency, which those tests don't assert against).

- [ ] **Step 7: Commit**

```bash
git add apps/connectors/connectors/funnel.py apps/connectors/connectors/__init__.py apps/connectors/tests/test_currency.py
git commit -m "feat(connectors): currency reconciliation + FX seam in the funnel"
```

---

## Task 9: Brain-compat smoke test

**Files:**
- Test: `apps/connectors/tests/test_brain_compat.py` (new)

**Interfaces:**
- Consumes: `UnifiedFact` superset. Proves a `chat.build_context`-style format over every field raises no `TypeError` (the brain is not None-safe). No production code changes — this is a guard test.

- [ ] **Step 1: Write the test** — create `apps/connectors/tests/test_brain_compat.py`:

```python
"""Guard: the ai-layer brain formats fields directly (int(reach), f'{cpc:.2f}', ...) and is NOT
None-safe. A default UnifiedFact must survive that formatting with no TypeError. We replicate the
formatting here (isolation: the connector must not import ai-layer)."""
from connectors.contract import UnifiedFact


def test_default_unified_fact_survives_brain_style_formatting():
    f = UnifiedFact(platform="shopify", account_id="a1", entity_id="orders", date="2026-06-01")
    # Mirror chat.build_context's direct int()/:.2f formatting over every consumed field.
    line = (
        f"reach={int(f.reach)} freq={f.frequency:.2f} clicks={int(f.clicks)} "
        f"link_clicks={int(f.link_clicks)} link_ctr={f.link_ctr:.2f} cpc={f.cpc:.2f} "
        f"cost_per_link_click={f.cost_per_link_click:.2f} cpm={f.cpm:.2f} "
        f"atc={int(f.add_to_cart)} checkout={int(f.checkout)} purchases={int(f.conversions)} "
        f"revenue={f.revenue:.2f} roas={f.roas:.2f} cpa={f.cpa:.2f} ctr={f.ctr:.2f} "
        f"impressions={int(f.impressions)} spend={f.spend:.2f}"
    )
    assert "reach=0" in line and "roas=0.00" in line   # formatted, no TypeError
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd apps/connectors && python -m pytest tests/test_brain_compat.py -v`
Expected: PASS (this validates Task 1's non-null float defaults; if any field were `None`/absent it would raise here).

- [ ] **Step 3: Commit**

```bash
git add apps/connectors/tests/test_brain_compat.py
git commit -m "test(connectors): brain-compat smoke over all UnifiedFact fields"
```

---

## Task 10: Full-suite green + isolation verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole connector suite**

Run: `cd apps/connectors && python -m pytest tests -q`
Expected: PASS — all tests across `test_base, test_contract, test_capability_sets, test_fx_config, test_meta, test_shopify, test_google_degradation, test_funnel, test_currency, test_brain_compat`. Zero network (FakeHttp).

- [ ] **Step 2: Verify one-way isolation (no ai-layer/rnd/api imports)**

Run: `grep -rnE "import (apps\.ai_layer|ai_layer|rnd|apps\.api)|from (apps\.ai_layer|ai_layer|rnd|apps\.api)" apps/connectors/connectors`
Expected: no output (exit 1). If anything prints, remove that import — it breaks the isolation constraint.

- [ ] **Step 3: (Optional, needs live `.env`) Shopify re-smoke**

Run the existing smoke helper against the live store to confirm currency now reads the real currency (INR) on the status/snapshot and `get_assets` returns within the window (no 30s hang):
`cd apps/connectors && python /tmp/claude-1000/-home-anantdluffy-workspace-Cosmisk/54ae9620-bece-4e06-879f-3b5874650912/scratchpad/smoke_shopify.py` (or re-create an equivalent probe).
Expected: `get_snapshot(['shopify'])` shows a non-empty `currency`; `get_assets(['shopify'])` completes quickly. Skip if no live token is loaded.

- [ ] **Step 4: Final commit (if any verification tweaks were needed)**

```bash
git add -A apps/connectors
git commit -m "test(connectors): full-suite green + isolation check for fact-shape redesign"
```

---

## Self-Review notes (author)

- **Spec coverage:** §5 schema → T1; §6 capability sets → T2; §8 currency + FX seam → T3 (config/seam) + T8 (reconcile); FX config scaffolding → T3; §7 per-platform mapping → T4 (Meta) / T5,T7 (Shopify/Google) / T7 (Google currency); §9 assets timeout → T6; §10 tests → each task + T9 brain-compat; §11 verification → T10. All sections mapped.
- **Type consistency:** `reconcile_blended` / `compute_blended` / `_blend_from_sums` / `_currency_from_facts` names are used identically across T8 and its test; `rate(base, quote)` matches T3's protocol and T8's `conv`. `impressions`/`clicks` are `float` in T1 and asserted `float` in T4/T7.
- **No placeholders:** every code step contains complete code; every run step has an exact command + expected result.
