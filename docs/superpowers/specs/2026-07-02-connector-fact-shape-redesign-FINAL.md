# Connector Fact-Shape Redesign — FINAL Design Spec

**Date:** 2026-07-02
**Status:** FINAL — all open questions resolved; ready for implementation planning.
**Supersedes:** `docs/superpowers/specs/2026-07-01-connector-fact-shape-redesign-design.md`
(that draft left OQ1–4 open and showed `impressions`/`clicks` as `int`; both are now resolved).
**Scope:** Phase 0, **connector-only**. Reshape `apps/connectors` `UnifiedFact` into a flat
superset so every metric the AI layer consumes is a first-class, correctly-titled field; add
per-platform capability sets, currency propagation + an FX-conversion seam, and fix the Shopify
assets-timeout (#35). No `apps/ai-layer` edits, no deploy changes.

---

## 1. Scope & non-goals

**In scope (this spec / one connector PR):**
- `contract.py` — `UnifiedFact` flat 20-field superset; `Blended`/`ConnectorStatus`/`UnifiedSnapshot`
  currency additions; a `RateProvider` protocol (FX seam).
- The 3 normalizers (`meta`, `shopify`, `google`) mapping their sources onto the superset.
- Capability-set constants exported from the package.
- Currency propagation (capture per-platform account currency; reconcile; flag mismatch).
- `#35` — bound the Shopify `fetch_assets` order scan so `get_assets` stops hanging at 30s.
- Tests + a live Shopify re-smoke.

**Explicitly NOT in scope (separate tasks):**
- ai-layer adapter seam `UnifiedFact→CampaignDayFact` incl. the `purchases = fact.conversions`
  alias (**#27** — the ai-layer owner's seam).
- Bundling the connector into the ai-layer image / packaging so the brain can `import` the
  capability sets (**#30**, Phase 1).
- Shopify auth-code-grant token flow (**#34** — helper already exists; ops, not fact-shape).
- Any real FX rate source (this spec ships only the seam + no-op default; see §8).

The ai-layer's existing Meta path (`CampaignDayFact` / `meta_live` / `store`) is **untouched**. The
connector feeds an **additive** cross-channel surface via `get_snapshot`/`get_assets`.

## 2. Problem (recap)

The ai-layer brain/chat/api consume **all 20** fields of `CampaignDayFact`
(`apps/ai-layer/ai_layer/meta_transform.py:64-86`). The current connector `UnifiedFact`
(`connectors/contract.py:44-57`) carries only a generic core and therefore **drops 4** fields
(`ctr, cpc, link_ctr, cost_per_link_click`) and **demotes 8** to `platform_extra`
(`reach, frequency, link_clicks, cpm, add_to_cart, checkout, roas, cpa` — see
`connectors/meta/normalize.py:62-72`). Feeding that into the brain silently degrades insight/chat
quality. **No ingested data point may be discarded.**

## 3. Hard constraint: the brain is not None-safe

`chat.build_context` formats fields directly (`int(r.reach)`, `r.frequency:.2f`, `r.cpc:.2f`,
`r.cost_per_link_click:.2f`). A `None` raises `TypeError`. `CampaignDayFact` fields are bare
`float` (no `Optional`); `row_to_fact` defaults every field to `0.0`. **Therefore every
`UnifiedFact` numeric must be a non-null number** — a metric a platform does not measure is `0.0`,
never `None`. That makes `0.0` ambiguous ("true zero" vs "not measured"); the ambiguity is resolved
by the **capability sets** (§5), not by nulling.

## 4. Chosen approach — A: flat semantic superset + capability map

One flat `UnifiedFact` carrying all metrics as first-class non-null floats, using the **exact
`CampaignDayFact` titles** for Meta-origin fields (brain reads `fact.link_clicks` etc. unchanged),
named **semantically** so Google/Shopify map equivalents into the same fields. Non-measured metrics
are `0.0` and identified via per-platform capability sets.

Rejected: **B** (per-row `na_fields` list — bloats every row with platform-static data);
**C** (full semantic/optional/provenance model + None-safe brain rewrite + dedup `CampaignDayFact`
— cleanest long-term, too large for the demo; logged as `OPEN_ISSUES` I7).

## 5. Schema (final)

```python
Platform = Literal["meta", "shopify", "google"]

class UnifiedFact(BaseModel):
    # identity
    platform: Platform
    account_id: str
    entity_id: str
    entity_name: str = ""
    date: str                         # ISO YYYY-MM-DD

    # delivery
    spend: float = 0.0
    impressions: float = 0.0          # was int — now float (parity w/ CampaignDayFact)
    reach: float = 0.0                # Meta only
    frequency: float = 0.0            # Meta only

    # all-clicks (secondary)
    clicks: float = 0.0               # was int — now float
    ctr: float = 0.0
    cpc: float = 0.0

    # link-clicks (headline traffic)
    link_clicks: float = 0.0
    link_ctr: float = 0.0
    cost_per_link_click: float = 0.0

    # efficiency
    cpm: float = 0.0

    # funnel
    add_to_cart: float = 0.0          # Meta (pixel); Shopify/Google N/A
    checkout: float = 0.0             # Meta (pixel); Shopify/Google N/A
    conversions: float = 0.0          # Meta purchases / Shopify orders / Google conversions
    revenue: float = 0.0

    # derived (STORED, matching CampaignDayFact — OQ3)
    roas: float = 0.0                 # revenue / spend (DERIVED, never a reported field)
    cpa: float = 0.0                  # spend / conversions

    # residue: only metrics with no cross-platform meaning
    platform_extra: dict = Field(default_factory=dict)
```

**Resolved type change (locked):** `impressions` and `clicks` move `int → float` for parity —
`CampaignDayFact` holds all 20 metrics as `float`.

**Currency additions:**

```python
class ConnectorStatus(BaseModel):
    ...
    currency: str | None = None        # NEW: the account currency this connector reported

class Blended(BaseModel):
    ...
    currency: str = ""                 # NEW: currency the blended figures are expressed in
    currency_mismatch: bool = False    # NEW: True if platforms disagreed and no FX applied

class UnifiedSnapshot(BaseModel):
    ...
    currency: str = ""                 # default now "" (set by the funnel), not hardcoded "USD"
```

`AssetRecord.stats` carries the richer `UnifiedFact` for free (no shape change).

## 6. Capability sets (semantic) — exported constants

Applicability is a property of the **platform**, not the row (OQ1 → static sets). Exported from
`connectors/__init__.py` as the single source of truth (a later ai-layer packaging step, #30, lets
the brain import these instead of hardcoding a copy):

```python
_METRIC_FIELDS = (
    "spend","impressions","reach","frequency","clicks","ctr","cpc",
    "link_clicks","link_ctr","cost_per_link_click","cpm",
    "add_to_cart","checkout","conversions","revenue","roas","cpa",
)                                                     # 17 metric fields

META_METRICS    = frozenset(_METRIC_FIELDS)           # Meta measures/derives everything
GOOGLE_METRICS  = META_METRICS - {"reach","frequency","add_to_cart","checkout"}
SHOPIFY_METRICS = frozenset({"revenue","conversions"})
```

**Semantic rule (locked):** a *derived* metric counts as measured. Google's `ctr/cpc/cpm/link_ctr/
roas/cpa` are derived from raw fields and `link_clicks ≈ clicks`, so they are in `GOOGLE_METRICS`;
only truly-absent fields (`reach/frequency/add_to_cart/checkout`) are N/A. Shopify measures only
`revenue` + order-count `conversions`; all ad-delivery metrics are genuinely N/A. A field at `0.0`
is a *real* zero only if it is in that platform's set.

## 7. Per-platform mapping

| Field | Meta source | Google source | Shopify source |
|---|---|---|---|
| spend | `spend` | `cost_micros / 1e6` | N/A → 0.0 |
| impressions | `impressions` | `metrics.impressions` | N/A → 0.0 |
| reach | `reach` | N/A → 0.0 | N/A → 0.0 |
| frequency | `frequency` or impr/reach | N/A → 0.0 | N/A → 0.0 |
| clicks | `clicks` | `metrics.clicks` | N/A → 0.0 |
| ctr | `ctr` or clicks/impr | clicks/impr | N/A → 0.0 |
| cpc | `cpc` or spend/clicks | spend/clicks | N/A → 0.0 |
| link_clicks | `inline_link_clicks` | `metrics.clicks` (≈) | N/A → 0.0 |
| link_ctr | `inline_link_click_ctr` | derive | N/A → 0.0 |
| cost_per_link_click | `cost_per_inline_link_click` | derive | N/A → 0.0 |
| cpm | `cpm` or spend/impr·1000 | derive | N/A → 0.0 |
| add_to_cart | pixel ATC actions | N/A → 0.0 | N/A → 0.0 |
| checkout | pixel checkout actions | N/A → 0.0 | N/A → 0.0 |
| conversions | pixel purchases | `metrics.conversions` | order count |
| revenue | pixel purchase value | `conversions_value` | order revenue (TRUTH side) |
| roas | revenue/spend | revenue/spend | N/A → 0.0 |
| cpa | spend/conversions | spend/conversions | N/A → 0.0 |

Meta residue in `platform_extra` shrinks to genuinely Meta-unique metrics only (currency moves to
`ConnectorStatus.currency`; the standard metrics move to first-class fields).

## 8. Currency propagation + FX seam

**Why:** the snapshot previously hardcoded `currency="USD"`, but a live Shopify store reports its
own currency (INR observed). Blended ROAS = Shopify revenue ÷ (Meta+Google spend); if platforms
differ in currency, an un-flagged blended figure is silently wrong.

**Capture.** Each connector reads its account currency during fetch and the funnel records it on
`ConnectorStatus.currency`:
- Meta — `account_currency` (already requested in `INSIGHT_FIELDS`).
- Shopify — `shop.json` `currency` (one call), fallback to an order's `currency` field.
- Google — `customer.currency_code` (GAQL).

**Reconcile (funnel).** Over the ok-platforms whose figures feed `Blended` (Meta/Google spend,
Shopify revenue):
- All currencies equal → `snapshot.currency = Blended.currency =` that currency; `currency_mismatch
  = False`; blended computed normally.
- They differ and **no** `rate_provider` → `snapshot.currency = "MIXED"`,
  `Blended.currency_mismatch = True`. Blended is still computed on raw sums but is **flagged
  unreliable** (never silently trusted, never hidden).
- They differ and a `rate_provider` **is** supplied → convert each platform's `spend`/`revenue`
  into `target_currency` before the blended math; `snapshot.currency = target_currency`;
  `currency_mismatch = False`.

**FX seam (the provision — ships as no-op).**

```python
class RateProvider(Protocol):
    def rate(self, base: str, quote: str) -> float:
        """Units of `quote` per 1 unit of `base` for the current day. Raises if unavailable."""
```

`get_snapshot(brand, window, platforms=None, rate_provider=None, target_currency=None)`:
`rate_provider=None` (default) → no conversion, mismatch → flag. When provided → conversion path
above; `target_currency` defaults to the revenue (Shopify) currency, since blended ROAS is
revenue-denominated. Phase 0 ships the protocol + the `None` default only.

### FX provider design (future work — documented, not built now)

When FX is demanded, implement a **caching `RateProvider` on the caller side (ai-layer), injected
into `get_snapshot`** — never inside the connector (the connector stays isolated/stateless/no-DB by
design). Pattern:

- **Daily fetch → 24h cache → convert on demand.** FX moves little intraday; a daily reference rate
  is cheaper *and* keeps blended ROAS stable between reads of the same day.
- **Store: reuse Neon (recommended)** — a `fx_rates(base, quote, rate, fetched_at)` table; a daily
  cron (existing cron mechanism) UPSERTs; on-demand reads check `fetched_at` age for the 24h TTL.
  Neon is already the only DB in the stack, so this adds **no new infra**. **Redis is the
  alternative** (native `SETEX 86400`, cross-instance) — justified only if Redis is already run for
  something larger; not worth a standing service for a handful of daily rates otherwise.
- **Source:** a free daily-reference feed — ECB via **Frankfurter** (`frankfurter.app`, no API key,
  one call/day) fits "1 fetch/day."

## 9. #35 — Shopify assets timeout

`shopify/client.py:fetch_assets` currently paginates orders **unbounded** (no window, `max_pages`
cap only) → `get_assets` hangs and trips the 30s deadline. Fix: pass the `DateWindow` into the
order query (`created_at_min`/`created_at_max`, as `fetch_facts` already does) and keep the
`max_pages` safety cap. `get_assets` returns within the window; `AssetRecord.stats` carries the
richer `UnifiedFact`.

## 10. Testing

- `tests/test_contract.py` — all 17 metric fields + identity present, defaults `0.0`, **no
  `Optional`**; `impressions`/`clicks` are `float`; new currency fields exist with correct defaults.
- `tests/test_meta.py` — a Meta row populates all 17 metric fields (the full `CampaignDayFact`
  metric set, incl. the previously-dropped `ctr/cpc/link_ctr/cost_per_link_click`); `platform_extra`
  holds only true residue.
- `tests/test_shopify.py` / `tests/test_google_degradation.py` — N/A fields are `0.0` and match the
  capability set (`SHOPIFY_METRICS`/`GOOGLE_METRICS`); populated fields match source.
- `tests/test_capability_sets.py` — membership matches the semantic rule (Google derived-in,
  reach/frequency/atc/checkout-out; Shopify = {revenue, conversions}).
- `tests/test_currency.py` — single-currency pass-through; mismatch → `currency_mismatch=True` +
  `snapshot.currency="MIXED"`; injected `RateProvider` converts and clears the flag.
- `tests/test_assets_window.py` — the Shopify assets scan is date-bounded (asserts the query
  carries the window; no unbounded pagination).
- Brain-compat smoke — build a `UnifiedFact`, run a `chat.build_context`-style format over every
  field, assert no `TypeError`.

## 11. Verification

- `cd apps/connectors && python -m pytest tests` — all green.
- Isolation: `grep -rn "import" apps/connectors/connectors` shows no imports from `apps/ai-layer`,
  `rnd`, or `apps/api`.
- Live re-smoke (Shopify creds in `.env`): `get_snapshot(['shopify'])` now reports the real store
  currency (INR) on the status/snapshot, and `get_assets(['shopify'])` returns **within the window**
  (no 30s hang).

## 12. Resolved decisions (log)

| # | Decision | Resolution |
|---|---|---|
| OQ1 | Applicability flag | **Static capability sets**, exported (`META/GOOGLE/SHOPIFY_METRICS`) |
| OQ2 | `conversions` vs `purchases` | Keep `conversions`; alias in the ai-layer adapter (**#27**) |
| OQ3 | Derived fields stored vs computed | **Store** (parity with `CampaignDayFact`) |
| OQ4 | Dedup `CampaignDayFact` | **Defer** to Approach C (`OPEN_ISSUES` I7) |
| — | Capability semantics | **Semantic** — derived counts as measured; only truly-absent = N/A |
| — | `impressions`/`clicks` type | **`float`** (parity) |
| — | Currency on mismatch | Propagate + **flag** (`currency_mismatch`), no FX in Phase 0 |
| — | FX provider (future) | Daily fetch → 24h **Neon** cache → on-demand convert; Redis = alt |
| — | #35 assets timeout | **Folded** into this spec |
