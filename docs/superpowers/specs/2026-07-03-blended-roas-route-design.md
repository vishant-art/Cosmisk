# Blended-ROAS Route + Snapshot Cache (#28) — Design

**Date:** 2026-07-03 · **Branch:** `feat/ai-layer-adapter` · **Status:** approved

## Goal

Expose the connector's blended truth (`snapshot.blended` — Meta+Google spend vs Shopify
revenue) as an additive ai-layer endpoint, and add the shared snapshot cache that makes
repetitive/concurrent connector requests safe (50-repeat assessment: uncached, 50 requests ≈
64 min of wall clock and ~500 Meta API calls in a burst — the exact pattern that trips Meta
throttling). Builds directly on #27's `connector_source.py`.

## Decisions (locked with user)

1. **Route shape:** `GET /blended/{account_id}` — new endpoint mirroring `/insights/{id}`
   conventions. Nothing existing changes.
2. **Assets endpoint: NOT built.** `get_assets` exposure is documented as an open question
   for the AI engineer in `temp_docs/ai-eng-adapter-notes.md`.
3. **Caching: TTL 1 hour + single-flight**, kept after an effort assessment (~50 lines
   mirroring the existing `context_cache.py` pattern; protects the Meta account that was
   already security-killed once after an API burst). Rationale for 1h: Meta finalizes
   insight numbers over ~24h and revises for days under attribution windows; Google Ads
   metrics land with ~3h lag and conversions back-fill for days — hourly refresh outpaces
   the sources' own guarantees. Env-tunable for demos.
4. **Freshness is visible, never silent:** responses carry `fetched_at`; `refresh=true`
   bypasses the cache.

## 1. Endpoint

```
GET /blended/{account_id}?preset=last_30d&refresh=false
```

- API-key gated (`Depends(require_api_key)`), like every data route.
- `preset`: `last_7d | last_30d | last_90d` (unknown → 30d, same as #27).
- Response model `BlendedResponse` (new, `schemas.py` house style):

```python
class PlatformStatus(BaseModel):
    platform: str
    state: str                       # ok | degraded | skipped | failed
    detail: Optional[str] = None
    fact_count: int
    elapsed_ms: int
    currency: Optional[str] = None

class BlendedBlock(BaseModel):
    spend: float
    revenue_meta_pixel: float
    revenue_shopify: float
    blended_roas: float
    revenue_gap_pct: float
    currency: str
    currency_mismatch: bool

class BlendedResponse(BaseModel):
    account_id: str
    window: dict[str, Optional[str]]     # {"since": ..., "until": ...}
    fetched_at: str                      # ISO UTC — when the snapshot was pulled
    blended: BlendedBlock
    statuses: list[PlatformStatus]
    ok_platforms: list[str]
```

- Raw contract numbers + the mismatch flag; the consumer decides rendering (CONTRACT §3:
  never present a MIXED blended ROAS as a plain number).
- **404** when no platform contributed (`ok_platforms` empty AND zero facts/blended all-zero
  with no ok statuses) — concretely: `if not snapshot.ok_platforms: 404`, matching the
  `/insights` "no data" convention.
- **503** when the connectors package is absent — reuse `api._connector_dataset`'s lazy-import
  pattern (the route lazy-imports `connector_source` the same way).

## 2. The cache (in `connector_source.py`, shared by all consumers)

New function `get_cached_snapshot(account_id, preset, platforms=None, refresh=False)
-> tuple[UnifiedSnapshot, str]` (snapshot, fetched_at ISO):

- Module-level store mirroring `context_cache.py`: dict + `threading.Lock`, TTL eviction,
  max 100 entries (evict oldest on overflow).
- Key: `(account_id, preset, tuple(platforms or ()))` — customer-unique by construction.
  **Written invariant: when per-brand credentials (I10) land, the credential identity MUST
  join the key.** Single-tenant `.env` creds make `account_id` sufficient today.
- TTL: `CONNECTOR_CACHE_TTL_S` env var, default **3600**.
- **Single-flight:** one `threading.Lock` per key; concurrent callers for the same key block
  on the fetching thread and share its result (a 50-request burst = one platform sweep).
  Implementation: per-key lock dict guarded by the store lock; fetch happens while holding
  the key lock; double-check the store after acquiring it.
- `refresh=True` skips the freshness check but still takes the key lock (no duplicate
  concurrent refreshes) and repopulates the entry.
- Failure snapshots (all skipped/failed) ARE cached — they are honest state; `refresh=true`
  is the recovery path and statuses make degradation visible.
- `fetch_connector_dataset` (#27) is refactored to call `get_cached_snapshot` internally, so
  `/insights?source=connectors` and `/chat` share the same entries as `/blended`. Its public
  signature is unchanged.
- Test seam: the underlying fetch stays monkeypatchable (`cs.get_snapshot`), and a
  `_cache_clear()` helper resets state between tests.

## 3. Error handling

| condition | behavior |
|---|---|
| connectors package absent | 503 with install hint (same as #27) |
| no platform contributed | 404 "no data" (checked via `snapshot.ok_platforms`) |
| partial failure / MIXED currency | 200 with statuses + `currency_mismatch` flag — visible, not fatal |
| concurrent burst | single-flight: one fetch, rest share |
| stale-but-cached | `fetched_at` in response; `refresh=true` to force |
| lock wait bound | the 120s per-connector deadline bounds any fetch, hence any wait |

## 4. Testing (offline, monkeypatched `cs.get_snapshot` + fake clock)

1. Cache: miss→fetch, hit→no second fetch, expiry→refetch (monkeypatched `time.time`),
   `refresh=True` bypass, key isolation between two account_ids, `_cache_clear`.
2. Single-flight: two threads request the same key; fetch-counter == 1; both get the result.
3. Route: happy path (all fields incl. `fetched_at`, `ok_platforms`), 404 when nothing
   contributed, 503 when package missing (reuse #27's sys.modules sentinel + delattr
   technique), MIXED passthrough (`currency_mismatch=True` visible in body).
4. Regression: ai-layer suite (168 baseline + new) green; 47 connector tests untouched;
   `/insights` + `/chat` behavior unchanged (they now go through the cache — covered by the
   existing 11 #27 tests passing unmodified except where they count fetches).

## 5. AI-engineer notes update (`temp_docs/ai-eng-adapter-notes.md`)

Append a #28 section covering everything that affects the ai-layer:
- The `/blended` contract + `fetched_at` semantics + `refresh` param.
- The shared 1h snapshot cache: his `source="connectors"` calls hit the same entries; how to
  bypass; `CONNECTOR_CACHE_TTL_S`.
- Single-flight behavior under concurrency.
- The I10 cache-key invariant (credential identity must join the key in multi-tenant).
- **Open question left to him: exposing `get_assets`** (connector side live-validated;
  endpoint shape options; `durable_ref` vs `local_path` storage caveats per CONTRACT §4).
- 50-repeat findings on his surfaces: creative `/generate` has no idempotency/dedup guard
  (50 clicks = 50 real fal bills) and unbounded in-memory `_JOBS`.

## 6. Out of scope

Assets endpoint · FX conversion (`rate_provider` stays unwired) · scheduled ingest / Neon
warm (Phase-1 storage package) · TS/web consumption of `/blended` · store writes.
