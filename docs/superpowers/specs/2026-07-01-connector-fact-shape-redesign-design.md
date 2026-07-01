# Connector Fact-Shape Redesign — Design Spec

**Date:** 2026-07-01
**Status:** Approved approach (A); flag mechanism is an open question for the AI engineer.
**Scope:** Redesign `apps/connectors` `UnifiedFact` so every metric the AI layer consumes is a
first-class field with its proper title, instead of being dropped or demoted to `platform_extra`.
This is a prerequisite for wiring the connectors into the ai-layer brain/chat.

---

## 1. Problem

The ai-layer brain (`brain.py`), chat context builder (`chat.py`), and API totals (`api.py`)
consume **all 20** fields of `CampaignDayFact` (`apps/ai-layer/ai_layer/meta_transform.py:65-86`).
Verified by codebase traversal (code-review-graph + grep), the heaviest consumers:

- `chat.build_context` (`chat.py:207-217`) serializes the **full** per-day row into the LLM
  context: `reach, frequency, clicks, link_clicks, link_ctr, cpc, cost_per_link_click, cpm,
  add_to_cart, checkout, purchases, revenue, roas, cpa`.
- `brain.statements` computes on `spend, revenue, purchases, roas, frequency`.
- `api` builds `Totals`/`blended_roas` from `spend, revenue, roas, purchases`.

The connector's current `UnifiedFact` (`connectors/contract.py`) has only a generic core
(`spend, impressions, clicks, conversions, revenue` + `platform_extra`). Against the consumed set
it therefore:

- **Drops 4 fields entirely** — `ctr, cpc, link_ctr, cost_per_link_click` are not even present in
  `platform_extra` (`connectors/meta/normalize.py:row_to_fact`).
- **Demotes 8 fields** to `platform_extra` — `reach, frequency, link_clicks, cpm, add_to_cart,
  checkout, roas, cpa`.

Feeding that into the brain would silently degrade insight/chat quality (missing metrics) and
force the AI side to reach into an untyped dict. **No ingested data point may be discarded.**

## 2. Hard constraint discovered: the brain is not None-safe

`chat.build_context` formats fields directly: `int(r.reach)`, `r.frequency:.2f`, `r.cpc:.2f`,
`r.cost_per_link_click:.2f` (`chat.py:214-216`). A `None` in any field raises `TypeError`.
`CampaignDayFact` fields are bare `float`/`int` (no `Optional`) and `row_to_fact` defaults every
field to `0.0`. **Therefore unified-fact fields must remain non-null numerics.** A metric a
platform does not measure must be `0.0`, never `None`.

Consequence: `0.0` becomes ambiguous — "true zero" vs "not measured." That ambiguity is resolved
by an **applicability flag** (Section 5, open question OQ1), not by nulling the value.

## 3. Chosen approach — A: Flat semantic superset + capability map

One flat `UnifiedFact` carrying **all** metrics as first-class non-null floats, using the **exact
`CampaignDayFact` titles** for Meta-origin fields (so the brain reads `fact.link_clicks` etc.
unchanged), named **semantically** so Google and Shopify map their equivalents into the same
fields. Metrics a platform does not measure are `0.0` and marked via a per-platform capability
descriptor (the flag).

Rejected alternatives:
- **B — per-fact `na_fields` list:** same flat shape but each row enumerates its N/A fields;
  bloats every row with static, platform-derivable information.
- **C — massive redesign** (semantic metric model with optionality/provenance/units + a None-safe
  brain rewrite + unify the duplicated `CampaignDayFact`): cleanest long-term, but a large AI-side
  change unsuited to the demo timeline. Logged as future work (see OPEN_ISSUES).

## 4. Schema

```python
class UnifiedFact(BaseModel):
    # identity
    platform: Platform            # "meta" | "shopify" | "google"
    account_id: str
    entity_id: str
    entity_name: str = ""
    date: str                     # ISO YYYY-MM-DD

    # delivery
    spend: float = 0.0
    impressions: int = 0
    reach: float = 0.0            # Meta only (else 0.0 + N/A flag)
    frequency: float = 0.0        # Meta only

    # all-clicks (secondary)
    clicks: int = 0
    ctr: float = 0.0
    cpc: float = 0.0

    # link-clicks (headline traffic)
    link_clicks: float = 0.0
    link_ctr: float = 0.0
    cost_per_link_click: float = 0.0

    # efficiency
    cpm: float = 0.0

    # funnel
    add_to_cart: float = 0.0      # Meta/Shopify; Google N/A
    checkout: float = 0.0         # Meta/Shopify; Google N/A
    conversions: float = 0.0      # purchases (Meta) / orders (Shopify) / conversions (Google)
    revenue: float = 0.0

    # derived (stored, matching CampaignDayFact — see OQ3)
    roas: float = 0.0             # revenue / spend (DERIVED, never the reported field)
    cpa: float = 0.0              # spend / conversions

    # residue: only metrics with no cross-platform meaning
    platform_extra: dict = Field(default_factory=dict)
```

`Blended`, `ConnectorStatus`, `AssetRecord`, `UnifiedSnapshot` are unchanged. `AssetRecord.stats`
now carries the richer `UnifiedFact` for free.

## 5. Per-platform mapping

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
| add_to_cart | pixel ATC actions | N/A → 0.0 | line-item ATC if available else 0.0 |
| checkout | pixel checkout actions | N/A → 0.0 | checkouts if available else 0.0 |
| conversions | pixel purchases | `metrics.conversions` | order count |
| revenue | pixel purchase value | `conversions_value` | order revenue (the TRUTH side) |
| roas | revenue/spend | revenue/spend | N/A (no ad spend) → 0.0 |
| cpa | spend/conversions | spend/conversions | N/A → 0.0 |

**The applicability flag (OQ1):** any cell marked "N/A → 0.0" must be distinguishable from a real
0.0 so cross-platform comparators/aggregations don't average a non-measured field. See OPEN_ISSUES
OQ1 for the two mechanisms (static capability sets vs per-fact `na_fields`) and the recommendation.

## 6. What does NOT change

- The ai-layer's existing Meta brain path (`CampaignDayFact` / `meta_live` / `store`) is untouched.
  The connector feeds an **additive** cross-channel surface (see the merge/PR plan); it does not
  replace `CampaignDayFact`.
- `Blended` math, `funnel.py` fault-isolation, `base.Http` rate-limit/SSRF, asset download.
- Single-tenant `.env` credential sourcing (multi-tenant is separate future work).

## 7. Testing

- `tests/test_contract.py` — assert all fields present, defaults are `0.0`/`0`, no `Optional`.
- `tests/test_meta.py` — a Meta row populates all 20 fields (incl. the previously-dropped
  ctr/cpc/link_ctr/cost_per_link_click); nothing lands in `platform_extra` except true residue.
- `tests/test_google_degradation.py` / `test_shopify.py` — N/A fields are `0.0` and correctly
  flagged; populated fields match source.
- Brain-compat smoke: build a `UnifiedFact`, confirm a `chat.build_context`-style format string
  over all fields raises no `TypeError`.

## 8. Open questions

Tracked with options + recommendations in
`dev_reports/ai_serv/connectors/DEVIATIONS_FROM_AI_ANALY.md` (§ Open Questions):
OQ1 applicability flag · OQ2 `conversions` vs `purchases` naming · OQ3 derived stored vs computed ·
OQ4 dedup `CampaignDayFact`.
