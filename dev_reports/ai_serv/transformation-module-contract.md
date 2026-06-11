# AI Layer — L1 Transformation Module & Typed Contract (`rnd/meta_transform.py`)

> Design doc for the formalized L1 layer. Status: **experiment (rnd)**. Future
> home: `apps/ai-layer`. Last updated: 2026-06-11.

## What this is

The single source of truth that turns raw Meta Ads Insights JSON into a **typed,
clean contract** every consumer reads. `brain.py`, `chat.py`, `meta_live.py`, and
the tests all go through it; **none touch raw Meta JSON**. This is the L1 ("clean
one source") layer from transformation-layer-discussion.md; cross-source
unification + blended ROAS (L2) is still future.

## The contract

```python
@dataclass(frozen=True)
class CampaignDayFact:      # one normalized (campaign x date) row
    campaign_id: str; campaign_name: str; date: str
    spend; impressions; reach; frequency
    clicks; link_clicks; ctr; cpc; cpm
    add_to_cart; checkout; purchases; revenue; roas; cpa   # all float

@dataclass(frozen=True)
class Dataset:             # account metadata + typed facts
    account_id; account_name; currency; since; until; level; source: str
    facts: tuple[CampaignDayFact, ...]
    def to_dataframe() -> pd.DataFrame   # columns == FACT_FIELDS, exactly
```

`FACT_FIELDS` is the canonical column tuple (handy for schema assertions). Facts
are **frozen** (immutable) so a consumer can't silently mutate the cleaned data.

## API

- `normalize(envelope) -> Dataset` — `{meta, data}` envelope OR a bare list.
- `load(path) -> Dataset` — read a JSON file and normalize.
- `row_to_fact(raw) -> CampaignDayFact` — flatten one row (the core of L1).
- `daily_totals(df)`, `campaign_summary(df)` — aggregates on `to_dataframe()`.

## What L1 does (and the rules it encodes)

1. **Explode nested arrays.** `actions` / `action_values` / `purchase_roas` are
   arrays keyed by `action_type`; L1 pulls the metrics out into flat columns.
2. **Canonical selection (the load-bearing rule).** The same sale appears under
   5+ keys (67 action_types on the real account). Priority, first match wins:
   `offsite_conversion.fb_pixel_purchase -> omni_purchase -> onsite_web_purchase
   -> purchase`. ATC and checkout have parallel priorities. This prevents the
   2-3x double counting the raw data would cause. **The choice is a business
   decision the team must ratify; L1 just encodes it in one place.**
3. **Safe coercion.** Every numeric is a string (or missing/null) in raw Meta;
   `_to_float` defaults to 0.0, never throws.
4. **Derivations with guards.** ROAS prefers Meta's reported `purchase_roas`, else
   `revenue/spend`; CPA = `spend/purchases` (0 if none). No div-by-zero.
5. **Tidy grain.** One row per (campaign × date); account fields live on `Dataset`.

## Tests

`test_transform.py` (offline, free) locks the contract: typed/frozen fact, exact
contract columns, pixel-vs-omni disambiguation, priority fallback, unrelated
action types ignored, missing/None/non-numeric safety, derived-vs-reported ROAS,
`normalize`/`load`, bare-list input, empty dataset, and the aggregates. All green.

## Validated against real data

Loaded the live 84-campaign / 1,176-row Pratap-sons pull (67 action_types) without
error; produced identical totals on the clean vs messy-enriched mock, confirming
the canonical selection is stable. brain.py and chat.py both consume `Dataset`
unchanged.

## Open questions / next

- **Ratify the canonical purchase policy** (pixel vs omni vs onsite vs, later,
  Shopify-actual) with the team — it silently sets every ROAS.
- Add per-row provenance (which `action_type` supplied revenue) if we want an
  audit trail.
- Carry currency as a typed unit and add conversion for cross-account rollups.
- This module is the natural first thing to port into `apps/ai-layer`; the TS
  parsing it replaces stays until then.
