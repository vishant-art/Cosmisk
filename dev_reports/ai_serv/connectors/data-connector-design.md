# Data Connector — Design (Meta · Google Ads · Shopify → unified funnel)

> Design for a connector system: **three independent per-platform connector modules**
> (Meta, Google Ads, Shopify) each owning its own auth/fetch/normalize, **funnelling into a
> single aggregator module** that exposes common connection routes to the AI layer.
> Includes the **Python-vs-TypeScript** tradeoff (real-life performance + security) and the
> **performance bottlenecks** of this fan-in shape. Companion to
> `data-connector-architecture-decision.md`. Branch `feat/data-connectors`. 2026-06-26.

---

## 1. Goal

One entry point that returns a **unified, typed multi-platform snapshot** (ad spend +
conversions from Meta & Google, revenue truth from Shopify) **plus the media assets** of
winning creatives, so the Python AI layer can compute **blended ROAS / revenue-gap / true
CPA** and do cross-platform creative analysis — none of which is possible today (Python sees
Meta only).

---

## 2. Architecture — independent connectors → single funnel → common routes

```
   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
   │ MetaConnector│  │GoogleConnector│ │ShopifyConnector│   each module is self-contained:
   │  auth/fetch  │  │  auth/fetch  │  │  auth/fetch  │     • resolve credentials
   │  normalize   │  │  normalize   │  │  normalize   │     • paginate + rate-limit (own policy)
   │  assets      │  │  assets      │  │  assets      │     • map raw → UnifiedFact[]
   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     • download assets (+stats)
          │ UnifiedFact[]   │ UnifiedFact[]   │ UnifiedFact[]
          └────────────────┬┴─────────────────┘
                           ▼
                ┌──────────────────────┐   the SINGLE funnel module:
                │   Aggregator / Funnel │   • bounded-parallel orchestration (not serial)
                │   (orchestrator)      │   • partial-failure tolerance (allSettled)
                │   merge → blend → emit│   • merge by date/entity → blended metrics
                └──────────┬───────────┘   • unify cost + asset manifest
                           ▼
                ┌──────────────────────┐   common connection routes (one surface):
                │   Common Routes /     │   get_snapshot(brand, window, platforms)
                │   Unified Contract    │   get_assets(brand, winners)
                └──────────┬───────────┘   → typed UnifiedSnapshot
                           ▼
              brain / chat / creative pipeline (AI layer)
```

### The connector contract (every platform implements the same interface)

```
class Connector(Protocol):
    platform: str                                  # "meta" | "google" | "shopify"
    def health(self) -> HealthStatus: ...          # token valid? scopes? api reachable?
    async def fetch_facts(self, acct, window) -> list[UnifiedFact]: ...
    async def fetch_assets(self, winners) -> list[AssetRecord]: ...
```

- **Isolation:** each connector hides its API version, pagination, quirks, and rate-limit
  policy behind this interface. The funnel never sees a raw Meta/Google/Shopify payload.
- **Substitutable:** adding TikTok later = one new module, zero funnel changes.
- **Independently testable:** mock the network seam per connector (the existing
  `meta_creatives._api`/`_download` seam is the pattern to copy).

### The funnel module (the one place that knows about "all platforms")
Responsibilities, and *only* these:
1. Resolve which platforms a brand has + their credentials.
2. Run the connectors **concurrently with a per-connector concurrency cap**, tolerate partial
   failure (a dead Google token must not kill the Meta+Shopify result).
3. Merge per-day/per-entity into one `UnifiedSnapshot`; compute **blended metrics**
   (Meta+Google spend vs Shopify revenue → true blended ROAS, pixel-vs-Shopify gap).
4. Emit one cost ledger row set + one asset manifest.

### Unified contract (extends the existing `CampaignDayFact`)
```
UnifiedFact   = { platform, account_id, entity_id, entity_name, date,
                  spend, impressions, clicks, conversions, revenue,        # common core
                  platform_extra: dict }                                   # platform-specific
UnifiedSnapshot = { brand_id, window, currency, facts: UnifiedFact[],
                    blended: {spend, revenue_meta_pixel, revenue_shopify,
                              blended_roas, revenue_gap_pct}, assets: AssetRecord[] }
AssetRecord   = { platform, entity_id, kind, local_path, durable_ref, stats: UnifiedFact }
```

---

## 3. Python vs TypeScript — the real-life tradeoff

The workload is **I/O-bound** (HTTP to 3 SaaS APIs + asset downloads), with a **modest CPU
tail** (normalization, date/entity joins, blended-ROAS math). That single fact drives most of
the analysis: raw language speed barely matters; *concurrency model, existing infrastructure,
and where the secrets live* matter a lot.

| Dimension | **TypeScript** (build connectors in `apps/api`) | **Python** (build connectors in the AI layer) |
|---|---|---|
| **Already exists** | ✅ all 3 ingestions, OAuth **refresh**, encrypted token store, Shopify rate-limit wait | ❌ Meta only; Shopify/Google = from scratch |
| **Concurrency (I/O)** | ✅ event loop, `Promise.allSettled` natural | ⚠️ prod uses **sync `requests`** today → need `httpx.AsyncClient`/`asyncio` or a thread pool |
| **CPU tail (merge/blend)** | ⚠️ manual loops | ✅ pandas/vectorized; the AI layer already lives here |
| **Distance to consumer** | ⚠️ cross-language seam to reach the Python brain | ✅ in-process with brain/chat/creative |
| **Secrets footprint** | ✅ one runtime holds tokens + the AES key | ❌ a 2nd runtime needs the decrypt key → larger blast radius |
| **Duplication risk** | ✅ single ingestion owner | ❌ if TS keeps ingesting → 2 stacks, 2× the per-account rate-limit burn |
| **API-version drift** | one place | a 2nd place to keep current (already real: Meta v21 TS vs v23 PY) |

### Performance, in practice
- **Neither language is the bottleneck — the external APIs are.** Meta BUC, Google ops/day,
  Shopify's leaky bucket cap throughput long before CPU does. A connector that respects limits
  in *either* language outperforms a naive `Promise.all`/`gather` in the other that trips 429s.
- **TS edge:** Node's async I/O is the default; concurrent fan-out is idiomatic and the
  existing services already do paginated fetches.
- **Python caveat:** today's sync `requests` means concurrent multi-account/multi-platform
  fetch needs deliberate async (`httpx`) or a bounded `ThreadPoolExecutor` — otherwise the
  funnel silently serializes (exactly the bug the current TS audit has, see §4).
- **Python edge:** the merge/blend/aggregate step (join 3 platforms by date+entity, compute
  blended ROAS) is cleaner and faster in pandas, and runs *in* the AI process — no
  serialization across a language boundary.

### Security, in real-life run
- **OAuth refresh tokens are the crown jewels.** Building connectors in Python means either
  (a) re-implementing the refresh flow + porting `token-crypto` (AES-256-GCM) → a *second*
  place secrets live and can leak, or (b) Python reads Neon's encrypted token tables, which
  means the **AES key now lives in two runtimes** — doubling the key's blast radius. TS keeps
  it in one process.
- **Existing crypto is OK but not hardened:** `token-crypto.ts` uses AES-256-GCM (good) but a
  **single static key**, **zero-padded to 32 bytes** if short (`Buffer.alloc(32)` copy), with
  **no rotation / KMS / per-tenant key**. Whoever owns connectors should fix this regardless
  of language (load a full-entropy key from a secrets manager; support rotation).
- **Asset download = SSRF surface.** Connectors download arbitrary CDN URLs returned by the
  APIs. Enforce a **host allowlist** (`*.fbcdn.net`, `cdn.shopify.com`, `*.googleusercontent.com`),
  **size cap + timeout**, and **no redirects to private ranges**. Equally easy to get wrong in
  both languages — make it a shared connector rule.
- **Shopify carries PII** (orders, customers). Minimize: pull aggregates, **don't persist raw
  customer records**, scope the token to read-only, honor data-retention.
- **Token scope minimization:** `ads_read` (not write), Shopify read scopes only, Google
  read-only. **Never log tokens or signed URLs.**
- **Per-tenant isolation:** the funnel runs many brands; one mis-scoped call leaks across
  tenants. Every connector call must be bound to exactly one brand's credentials — enforce in
  the funnel, test it.

### Bottom line on language
- **Lowest-risk for ingestion:** **TS** — it already owns the APIs, OAuth refresh, and the one
  copy of the secrets. Don't rebuild that.
- **Best for the analysis/merge + asset stage:** **Python** — in-process with the AI layer,
  pandas for blending.
- This is exactly the **Hybrid** split from the decision doc: **TS connectors ingest →
  Python funnel merges/blends + downloads assets.** Going *fully* Python is defensible only if
  the goal is a self-contained Python service with no shared DB (accept the duplication + the
  second secrets footprint). Going *fully* TS strands the AI layer behind a language seam.

---

## 4. Performance bottlenecks of THIS (fan-in) design — and mitigations

1. **The funnel as a serialization point.** The current audit `await`s the 3 platforms
   **one after another** (`audit/index.ts:72/88/111`) → latency = *sum*. The new funnel must
   fan out **concurrently** (`Promise.allSettled` / `asyncio.gather`) → latency ≈ *slowest one*.
   This is the single biggest win available.
2. **Slowest-connector-dominates.** A large Meta account paginating, or a slow Google GAQL,
   stalls the whole snapshot. Mitigate with **per-connector timeouts**, **partial results**
   (return what's ready, mark the rest degraded), and a **last-good cache/store** fallback.
3. **Per-platform rate limits are the real ceiling** (not CPU):
   - **Meta** — Business-Use-Case, **per ad account**; read `X-Business-Use-Case-Usage`, back
     off near 100%. Use field-expansion + batched `adimages?hashes=[...]`.
   - **Shopify** — **leaky bucket** (REST ~2 req/s, burst 40) or GraphQL cost points; the
     existing client only waits 1s when close — needs proper bucket-aware throttling.
   - **Google** — ops/day + per-minute on the developer token; batch GAQL, avoid N small
     queries.
   → Throttle **per connector independently**, never with one global limiter. A naive parallel
   fan-out across many brands trips 429s fastest.
4. **Asset download fan-out.** Bandwidth-heavy, many files, **URLs expire on receipt**.
   Mitigate: bounded download pool (e.g. 4–8 concurrent), stream to disk/object storage,
   **dedup by hash**, download immediately, keep durable `hash`/`permalink`.
5. **Pagination memory.** Large accounts load thousands of rows into memory. Stream/batch;
   cap `max_rows`; aggregate incrementally rather than holding all raw rows.
6. **Token-refresh stampede.** Concurrent calls hitting an expired token all trigger refresh.
   Use **single-flight** refresh (one refresh, others await) + short token cache.
7. **Double ingestion (cross-stack).** If TS *and* Python both ingest the same accounts, every
   per-account rate-limit ceiling is consumed twice → throttling each other. One ingestion
   owner per platform (the §3 Hybrid point).
8. **Merge/blend cost.** Joining 3 platforms by date+entity is fine in pandas, but guard
   against accidental N×M joins on mismatched keys; normalize entity keys at the connector.

**Design implications baked into the contract:**
- The funnel returns a **`UnifiedSnapshot` with per-connector status** (`ok | degraded | failed`)
  so a partial result is first-class, not an exception.
- Each connector declares its **rate-limit policy** and **asset host allowlist** as part of
  its module — the funnel enforces concurrency caps from those declarations.

---

## 5. Recommendation (summary)

- **Shape:** keep the three connectors fully independent behind one `Connector` interface;
  the funnel does **bounded-parallel, partial-tolerant** orchestration + merge/blend +
  unified asset manifest. This is sound regardless of language.
- **Language:** **Hybrid** — TS owns the *ingestion* connectors (stable APIs, OAuth, single
  secrets footprint); the Python funnel owns *merge/blend + asset download* (in-process with
  the AI layer, pandas). Full-Python only if a self-contained, no-shared-DB Python service is
  an explicit goal — at the cost of duplicated ingestion and a second secrets footprint.
- **Fix regardless of choice:** parallelize the fan-out (today it's serial), add real
  per-platform rate-limiting/backoff (today near-absent), harden token-key management
  (rotation/KMS), and enforce an asset-download host allowlist.
```
