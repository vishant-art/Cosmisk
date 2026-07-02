# AI-Layer Connector Adapter Seam (#27) — Design

**Date:** 2026-07-02 · **Branch:** `feat/ai-layer-adapter` · **Status:** approved

## Goal

Make the ai-layer able to consume cross-platform connector data (Meta + Google ad facts via
`connectors.get_snapshot`) through its existing dataset seam, as an opt-in `source="connectors"`,
with zero change to default behavior. This is the "adapter + ready-to-flip connection" scope the
user chose (mix of pure-adapter and live-source approaches). Binding upstream interface:
`apps/connectors/CONTRACT.md` (v1.0, §2 adapter mapping, §5 BrandRef, §6 ops).

## Decisions (locked with user)

1. **Scope:** adapter module + a `source="connectors"` branch in `api.py::_dataset`. Default
   `source` stays `"store"`. No new endpoints (#28), no store writes, no packaging (#30), no
   durable storage (#29).
2. **Platform identity — tag names, keep schema.** `CampaignDayFact` gains no field. Instead:
   `campaign_id = f"{platform}:{entity_id}"`, `campaign_name = f"[{platform}] {entity_name}"`,
   **uniformly for all platforms including meta**, so a connectors-sourced dataset is never
   ambiguous against a store-sourced one.
3. **Shopify facts excluded from the Dataset.** Shopify UnifiedFacts are shop-level daily
   revenue, not campaigns; as CampaignDayFact rows they would corrupt every spend-based brain
   statement (best/worst campaign, budget concentration, fatigue). Shopify truth surfaces via
   `snapshot.blended` in #28. The exclusion is one constant (`EXCLUDED_PLATFORMS = {"shopify"}`)
   and the trade-off is documented for the AI engineer in `temp_docs/ai-eng-adapter-notes.md`.

## Architecture

```
GET /insights/{id}?source=connectors      POST /chat {source:"connectors"}
                └───────────────┬─────────────────┘
                    _dataset(account_id, source, token, preset)     [api.py, one new branch]
                                │ source == "connectors"  (lazy import; 503 if absent)
                                ▼
                ai_layer/connector_source.py                        [NEW]
                    fetch_connector_dataset(account_id, preset, platforms=None)
                                │ BrandRef + DateWindow → connectors.get_snapshot()
                                ▼
                    snapshot_to_dataset(snapshot, account_id) → mt.Dataset
                                ▼
                existing brain / chat / chart pipeline (unchanged)
```

Everything downstream of `_dataset` is untouched: the adapter's output is shape-identical to a
Meta dataset.

## Component: `ai_layer/connector_source.py`

### `snapshot_to_dataset(snapshot, account_id) -> mt.Dataset` (pure, no I/O)

- Per `UnifiedFact` (skipping `EXCLUDED_PLATFORMS`):
  - `campaign_id = f"{fact.platform}:{fact.entity_id}"`
  - `campaign_name = f"[{fact.platform}] {fact.entity_name}"`
  - `purchases = fact.conversions`
  - remaining 16 metrics copy by identical name (`spend, impressions, reach, frequency, clicks,
    ctr, cpc, link_clicks, link_ctr, cost_per_link_click, cpm, add_to_cart, checkout, revenue,
    roas, cpa`) — all already non-null floats per CONTRACT §2's 0.0 rule.
  - `date = fact.date` (already ISO).
- Dataset metadata:
  - `account_id` = the requested `account_id` (route key / brand handle).
  - `account_name = f"{account_id} [connectors: {'+'.join(snapshot.ok_platforms) or 'none'}]"`;
    if `snapshot.blended.currency_mismatch`, append `"; currency MIXED"`. This is the one
    metadata string chat already places in front of the LLM — platform status and currency
    caveats ride it instead of a schema change.
  - `currency = snapshot.currency` (may be `"MIXED"`; never silently relabeled).
  - `since = snapshot.since`, `until = snapshot.until`, `level = "campaign"`,
    `source = "connectors"`.

### `fetch_connector_dataset(account_id, preset, platforms=None) -> mt.Dataset`

- Preset map: `{"last_7d": 7, "last_30d": 30, "last_90d": 90}` → `DateWindow.last_n_days(n)`;
  unknown preset → 30.
- BrandRef: `BrandRef(brand_id=account_id, meta_account_id=account_id if
  account_id.startswith("act_") else None)` — existing Meta-keyed callers retarget correctly;
  any other handle rides the single-tenant `.env` fallback (CONTRACT §5).
- Calls `get_snapshot(brand, window, platforms)` then `snapshot_to_dataset`. `get_snapshot`
  never raises for platform failures (CONTRACT §1); an all-failed/skipped snapshot yields an
  empty Dataset.

## Integration: `api.py`

At the top of `_dataset()`:

```python
if source == "connectors":
    return _connector_dataset(account_id, preset)
```

`_connector_dataset` lazy-imports `ai_layer.connector_source`; on `ImportError` raise
`HTTPException(503, "connectors package not installed — pip install -e apps/connectors")`.
No module-level import of `connectors` anywhere in the ai-layer, so the current
`apps/ai-layer`-context image stays buildable until #30 widens the build context.

## Error handling & operational behavior

| condition | behavior |
|---|---|
| `connectors` package absent | HTTP 503 with install hint (lazy import) |
| all platforms failed/skipped | empty Dataset → existing 404 "no data" path |
| partial platform failure | facts from survivors; status visible in `account_name` suffix |
| currency mismatch | `currency="MIXED"` + `account_name` caveat; never silent |
| latency | first call up to ~120s (CONTRACT §6); chat reuses the session context cache; `/insights?source=connectors` is ingest-grade, not interactive-grade. No new caching (YAGNI — #28 may add TTL caching if the demo needs it) |
| persistence | none — connector facts are NOT written to the SQLite store; accumulation is a Phase-1 storage decision |

## Testing

New `apps/ai-layer/tests/test_connector_source.py` (dev venv has both packages installed):

1. Mapping: tagging of `campaign_id`/`campaign_name`, `conversions→purchases`, metric-by-name
   copy, date passthrough.
2. Shopify exclusion (facts filtered; a snapshot with only shopify facts → empty Dataset).
3. Currency propagation incl. MIXED + `account_name` caveat; ok_platforms suffix.
4. Preset→window mapping and the `act_` BrandRef rule (monkeypatched `get_snapshot` capture).
5. API-level: `/insights?source=connectors` end-to-end with monkeypatched
   `fetch_connector_dataset` (no network); missing-package → 503 (simulated import failure).
6. Regression: full ai-layer suite green; 47 connector tests green; default-source behavior
   unchanged.

## Deliverables

- `apps/ai-layer/ai_layer/connector_source.py` + `apps/ai-layer/tests/test_connector_source.py`
- The `_dataset` branch + `_connector_dataset` helper in `apps/ai-layer/ai_layer/api.py`
- `temp_docs/ai-eng-adapter-notes.md` (untracked; `temp_docs/` gitignored) — Shopify-rows
  decision + catalogued ai-layer-side observations for the AI engineer
- `.gitignore`: add `temp_docs/`

## Out of scope

Blended-ROAS endpoint (#28) · image bundling / pyproject dependency (#30) · durable storage
(#29) · store ingest of connector facts · FX rate provider wiring.
