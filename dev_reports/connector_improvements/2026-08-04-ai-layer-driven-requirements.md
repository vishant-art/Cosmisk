# Connector Service — Requirements Driven by the Updated AI Layer

**Date:** 2026-08-04 · **Status:** 🔵 ACTIVE (open requirements list)
**Trigger:** review of `origin/new/creative_v2`'s ai-layer against the connector contract.
**Binding interface reviewed:** `apps/connectors/CONTRACT.md` v1.0 (branch `feat/connector-integration`,
live-validated 2026-07-02).
**AI-layer side reviewed:** `origin/new/creative_v2` @ `17d8ea8` — `connector_source.py`,
`meta_transform.py`, `fetch_cache.py`, `history.py`, `ad_tools.py`, `competitor/pipeline.py`.
**Parent review:** [`2026-08-04-creative-v2-diff-review.md`](../2026-08-04-creative-v2-diff-review.md)

---

## What this is

`creative_v2` moved the ai-layer well past what the connector contract was designed against. The
connector seam (`connector_source.py`, the `#27`/`#28` work) still fits the **campaign-level,
single-window, single-tenant** shape it was built for. Everything the new ai-layer added on top —
ad-level analysis, a 37-month history tier, a day-granular cache with settled semantics, per-brand
partitioning, an adaptive retry ladder — has **no equivalent through the connector path**.

This is the list of what connectors must grow to carry the updated ai-layer. It is a requirements
log, not a plan: nothing here is scheduled, and none of it blocks the ai-layer merge (the connector
path is opt-in via `source="connectors"`; the Meta-direct path is unaffected).

**Ordering is by blocking-ness, not effort.**

---

## R1 · Per-brand credentials (`I10` CredentialProvider) — **blocks C2 and all multi-tenant use**

**Contract today** (§5): `BrandRef` carries `brand_id` + per-platform account ids; any id left `None`
falls back to the single-tenant `.env` value.

| platform | `BrandRef` override | |
|---|---|---|
| Meta | ✅ retargets | one token reads many `act_...` ids |
| Google | ✅ retargets | one refresh token reads every accessible account |
| **Shopify** | ⚠️ **credential-bound** | the token IS per-store; `shopify_domain` alone cannot retarget |

`funnel._make_connector()` calls `get_shopify_creds()` → `os.getenv`. The client layer is already
safe by construction (`ShopifyConnector.__init__(creds, settings, http)` takes injected credentials);
it is the **resolution** layer that is single-tenant.

**Requirement:** a per-brand `CredentialProvider` that `_make_connector` consults instead of the env
loader, for all three platforms. Meta and Google gain nothing functionally (their `BrandRef` override
already works) but gain consistency; Shopify cannot be multi-tenant without it.

**Already acknowledged connector-side:** `connector_source.py`'s snapshot-cache comment states
*"when per-brand credentials (I10) land, the credential identity MUST join this key."* That cache key
change is part of this requirement, not a separate one.

**Consumers blocked:** C2 (`competitor/pipeline._shopify_context`), and any deployment serving more
than one brand from one process.

---

## R2 · Ad-level and adset-level facts — **the largest gap**

`UnifiedFact` has a single flat entity (`entity_id`, `entity_name`) mapped to
`campaign_id`/`campaign_name`. There is **no level concept and no ad/adset hierarchy anywhere in the
contract**, and `snapshot_to_dataset()` hardcodes `level="campaign"`.

The updated ai-layer added, on `CampaignDayFact`:

```
adset_id, adset_name, ad_id, ad_name          # hierarchy
video_3s, thruplay, hook_rate, is_video       # creative-performance metrics
```

and an entire ad-level tool suite (`ad_tools.py`, `chat._ensure_ad_level`,
`fetch_cache.fetch_cached(account, "ad", ...)`) that the `/chat` tool loop calls directly. **None of
it can be fed from a connector snapshot.**

**Requirement:**
- a `level` parameter on `get_snapshot(brand, window, platforms, *, level="campaign")`, accepting at
  least `campaign` and `ad`;
- hierarchy identity on `UnifiedFact` (`parent_id` / `parent_name`, or explicit `adset_*`/`ad_*`) —
  note the ai-layer's A2 fix makes **`ad_id` the cache key at ad level**, so it must be stable and
  non-empty, not best-effort;
- video metrics in the capability sets (`video_3s`, `thruplay`, `hook_rate`) — Meta-only, so
  `measures("google", "hook_rate")` must be `False` rather than silently `0.0`.

**Scope note:** Google has no ad-level equivalent of Meta's ad/adset split, and Shopify has no ads at
all. `level="ad"` should return `skipped` for those platforms, not an error — consistent with the
existing partial-by-design rule.

---

## R3 · Arbitrary and long windows (the 37-month history tier)

**Contract today:** `get_snapshot(brand, window: DateWindow, ...)` takes one window, and
`connector_source._PRESET_DAYS` exposes only `{last_7d: 7, last_30d: 30, last_90d: 90}`.

The ai-layer's `history.ensure()` builds **37 monthly rollups** (`RETENTION_MONTHS = 37`), calling
`facts_for_month(first, last)` once per month. Through the connector path that is 37 sequential
`get_snapshot` calls, each carrying the full 120s per-connector deadline and each re-sweeping every
platform.

**Requirement, one of:**
- a batched multi-window call (`get_snapshots(brand, windows: list[DateWindow], ...)`) that sweeps
  each platform once and slices, **or**
- documented guidance that history stays Meta-direct and the connector path is current-window only.

The second is a legitimate answer — but it must be **written down**, because right now nothing stops
someone wiring `history.ensure` to the connector and quietly creating a 37×120s request.

**Related:** `_PRESET_DAYS` should accept the same `^last_(\d+)d$` shape `meta_live.preset_days`
already accepts, or the two paths keep diverging on what a valid preset is.

### R3a · On-demand deepening (decided 2026-08-04, ai-layer side)

**Decision on the ai-layer request path (parent review D4/D5):** the history tier fetches **6 months
by itself**; anything deeper is fetched **on demand**, not eagerly inside the request.

That makes "deepen a window that is already partly cached" a first-class access pattern rather than a
one-off. Through the Meta-direct path it is served by `fetch_cache`'s settled/trailing-7d semantics.
**The connector path has no equivalent** — `get_snapshot` is all-or-nothing per window, and the TTL
snapshot cache (R6) is keyed on `(brand, account, preset, platforms)`, so asking for a longer window
is a full re-sweep of every platform rather than an incremental extension.

**Requirement:** either
- an incremental/extend semantic — given an already-fetched window, fetch only the delta; **or**
- a documented statement that deepening through the connector always costs a full sweep, so the
  ai-layer knows to keep deep history on the Meta-direct path.

**Interaction with R7:** an on-demand deepening pattern means user actions can trigger unbounded
historical fetches. On `development_access` that is precisely the shape that exhausts the budget.
Whichever answer is chosen, the deepening path needs a rate-budget story, not just a caching one.

---

## R4 · Structured error classification on `ConnectorStatus`

**Contract today** (§3): connectors *"never raise for platform failures"* — a failure becomes a
`ConnectorStatus` with `state ∈ {ok, degraded, skipped, failed}` and a free-text `detail`.

The updated ai-layer's whole reliability story is built on **classifying** Meta errors:
`MetaError.code`, `is_too_much_data()` (halve the window and retry), `is_beyond_retention()` (stop),
rate-limit `code=4` / subcode `1504039` (map to HTTP 429). Defects D1 and D2 in the parent review are
both about that ladder being bypassed.

Through the connector path, all of that collapses to `state="degraded"` plus a string. The ai-layer
cannot retry intelligently, cannot map to 429, and cannot tell "too much data, split it" from "the
token is dead".

**Requirement:** a structured, machine-readable reason on `ConnectorStatus` — e.g.
`reason: "rate_limited" | "too_much_data" | "beyond_retention" | "auth" | "timeout" | "unknown"`,
plus `retryable: bool` and, where the platform provides one, `retry_after_s`. Free-text `detail`
stays for humans.

---

## R5 · Per-day coverage in the status (feeds the A1 fix)

Parent-review defect **A1**: `fetch_cached()` marks a whole span fetched even when the underlying
fetch silently dropped days, permanently caching a hole. The approved fix threads a `skipped` day list
out of `meta_live.fetch_envelope`.

If connector facts are ever cached the same way (see R6), the connector path needs the **same signal**
or it reintroduces A1 through a different door. `ConnectorStatus` currently reports `fact_count` per
platform — a count, which cannot distinguish "that day had no spend" from "that day failed".

**Requirement:** per-platform day coverage on `ConnectorStatus` — either `days_covered: list[str]` or
`days_missing: list[str]` — so the caller can mark only what it actually received.

---

## R6 · Cache-key stability guarantees (if connector facts become cacheable)

Today `source="connectors"` bypasses `fetch_cache` entirely: `api._fetch_live` →
`connector_source.fetch_connector_dataset` → an in-process TTL snapshot cache
(`CONNECTOR_CACHE_TTL_S`, default 3600s, single-flight, `_CACHE_MAX = 100`). Connector data therefore
has **no** settled/trailing-7d semantics, no `insight_rows` persistence, and does not survive a
restart.

That is a defensible scope line for now. If it changes, `fetch_cache._key()` — which the A2 fix is
about to make `campaign_id|adset_name|ad_name|ad_id` — would key connector rows too.

**Requirement (conditional):** if connector facts are to be persisted in `insight_rows`, the contract
must guarantee `entity_id` is **stable across calls and platforms** (Meta ad ids and Google criterion
ids do not share a namespace — `connector_source` already prefixes with `f"{f.platform}:{f.entity_id}"`
for `campaign_id`, and that prefixing convention would need to extend to whatever ad-level key R2
introduces).

**Decision needed first:** is the connector path meant to be cached at all, or is the TTL snapshot
cache the final answer? Everything else here depends on that.

---

## R7 · Shared Meta rate budget

There are now **two independent Meta clients** in the monorepo hitting the same app quota:

| client | rate | used by |
|---|---|---|
| `ai_layer/meta_live.py` | chunked adaptive fetch, window halving, single-day retry | `/chat`, `/ingest`, `/insights`, history tier |
| `connectors/meta/client.py` | 5 req/s, backoff on 429/5xx | `get_snapshot` / `get_assets` |

The app is on **`development_access`** tier. Neither client knows the other exists, and the ai-layer's
own `MetaWarmup` cron already consumes a meaningful share of the `ads_insights` budget.

**Requirement:** at minimum a documented statement of how the budget is split; ideally a shared
limiter or a budget-aware seam. Without it, a connector sweep and a history backfill can independently
decide they are within their own rate limit while jointly exceeding the account's.

> This one is easy to dismiss as theoretical. It is not — see the `meta-dev-tier-rate-budget` finding
> that a warm-up cron, not query size, was what actually exhausted the budget and produced a
> misleading `code=1`.

---

## R8 · Product/shop context for competitor discovery (the C2 destination)

`competitor/pipeline._shopify_context()` needs the shop's **product types + ~30 sample titles** as LLM
context for competitor discovery. That is not a fact and not quite an asset:

- `get_snapshot` excludes Shopify from facts by design (`EXCLUDED_PLATFORMS`) — correct, and should
  stay;
- `get_assets` returns `AssetRecord` (top-product **images**, with `entity_name` and a hard page cap)
  — closest existing call, but it is an image-ranking scan, not a catalogue summary.

**Requirement:** a shop-context call — e.g. `get_shop_context(brand: BrandRef) -> ShopContext` with
product types, sample titles, domain and currency — **or** an explicit documented decision that
ai-layer derives it from `get_assets(...).entity_name` and accepts the page cap.

Until R1 lands this is blocked anyway (Shopify is credential-bound), which is why the parent review's
C2 decision is "fail closed now, delete `_shopify_context()` later".

---

## R9 · FX rate provider (seam exists, unused)

**Contract today** (§3): the FX seam is defined — pass `rate_provider` + `target_currency` to
`get_snapshot` — but *"the planned provider (daily fetch → 24h Neon cache) lives caller-side in
ai-layer; `CONNECTOR_FX_*` env knobs exist but are inert until then."*

So a multi-currency account still yields `currency="MIXED"`, `currency_mismatch=True`, and the
contract's own rule: **do not show a MIXED blended ROAS to a founder.** `connector_source` honours
this by appending `"; currency MIXED"` to the account name — a string the LLM sees, not a suppression.

**Requirement:** this is an **ai-layer** obligation, not a connector change — logged here so the
inert env knobs are not mistaken for a working feature. Until the provider is built, any
`blended_roas` on a mixed-currency brand must be suppressed rather than rendered.

---

## R10 · Asset durability is the ai-layer's job (confirmed, no connector change)

**Contract** (§4): `local_path` is ephemeral (*"gone on redeploy"*), `durable_ref` is the stable
identity (Meta `image_hash`/`video_id`, Shopify product image URL), and *"the connector will not grow
a storage backend."*

**Requirement (ai-layer side):** copy `local_path` files into object storage keyed by
`(platform, durable_ref)` and persist only that pointer. Video `source_url` is time-limited and must
be re-resolved via `/{video_id}?fields=source`.

Logged here so it is not lost at the seam — it is a deploy-gate item that reads like a connector
concern and is not one.

---

## Summary

| # | Requirement | Blocks | Side |
|---|---|---|---|
| R1 | Per-brand credentials (I10) | C2; all multi-tenant use | connector |
| R2 | Ad/adset level + video metrics | the entire ad-level tool suite | connector |
| R3 | Arbitrary/long windows, or a documented "no" | 37-month history via connectors | connector |
| R3a | Incremental window deepening (6mo default + on-demand deeper) | D4/D5's decided shape on the connector path | connector |
| R4 | Structured error classification | adaptive retry, 429 mapping (D1/D2) | connector |
| R5 | Per-day coverage in status | A1-equivalent correctness on the connector path | connector |
| R6 | Cache-key stability (conditional) | persisting connector facts | contract decision |
| R7 | Shared Meta rate budget | dev-tier throttling under combined load | both |
| R8 | Shop-context call | C2's eventual deletion of `_shopify_context()` | connector |
| R9 | FX rate provider | mixed-currency blended ROAS | **ai-layer** |
| R10 | Asset durability | Phase-1 deploy gate | **ai-layer** |

**Decision needed before sequencing any of this:** R6 — *is the connector path meant to be cached and
persisted like the Meta-direct path, or is `source="connectors"` a live cross-platform view with a TTL
snapshot cache and nothing more?* R2, R3, R5 and R6 all resolve differently depending on the answer.

**None of these block the `creative_v2` ai-layer merge.** The connector path is opt-in
(`source="connectors"`) and the Meta-direct path — which is what every gate in the parent review
concerns — does not touch any of it.
