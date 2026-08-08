# `new/creative_v2` — Diff Review, Defect Register & Integration Note

**Date:** 2026-08-04 · **Status:** 🔵 ACTIVE
**Reviewed:** `origin/new/creative_v2` @ `17d8ea8` vs `improve/creative` @ `e6c20a3`
**Merge base:** `56db2f1` (2026-07-20) · **Divergence:** 97 ahead / 56 behind · **Tree delta:** 231 files, +35,902 / −13,160
**Method:** 9 parallel finder passes over the full diff + one independent adversarial verifier per candidate location. 38 candidates raised, 38 adjudicated: **28 in-scope defects**, 4 out-of-scope (`rnd_mine/`), 3 refuted, 3 collapsed as duplicates.

---

## SCOPE DECISION (2026-08-04)

> **`rnd_mine/` is split out of this plan. It is NOT to be merged, pushed, or updated.**
>
> `rnd_mine/` (~123 new files, the from-scratch v2 Creative Studio) shares zero files with `apps/`.
> Its four findings are recorded in [§7](#7-out-of-scope--rnd_mine) for completeness and are
> **excluded from every gate, sequence and recommendation** in this document. Nothing in the
> integration plan below depends on, blocks, or is blocked by `rnd_mine/`.
>
> Consequence: the "supersede-or-not" question against `apps/` Creative Studio stays open and is
> no longer coupled to shipping the ai-layer work.

**In scope for integration: `apps/ai-layer/` (36 modified + 17 new), plus the `apps/web` / `apps/api` deltas.**

---

## TL;DR

The ai-layer work on `creative_v2` is real and ahead of us: a Neon-backed fetch cache with
settled/trailing-7d semantics, a 37-month monthly history tier, an ad-level tool suite, chunked
adaptive Meta fetching, competitor discovery + Apify scrape, and a tool-calling `/chat`. **The
architecture is sound.** The defects sit *at* the seams, not in the design — which is what makes
them fixable without a redesign.

28 in-scope defects in five clusters:

| Cluster | Count | Character | Gate |
|---|---|---|---|
| **A — Cache integrity** | 3 | Silent, permanent data loss. Write-once-wrong: corruption outlives the fix. | 🔴 merge |
| **B — Analytics correctness** | 4 | Guards deleted in the `statements()`→`analyze()` rewrite. Ships confident wrong numbers to founders. | 🔴 merge |
| **C — Multi-tenancy** | 2 | `brand_id` threaded almost everywhere; the gaps produce cross-tenant wrong data, not just a cache miss. | 🟠 deploy |
| **D — Request path** | 7 | CLI-shaped code mounted on HTTP handlers. Timeouts + rate-budget exhaustion. | 🟠 deploy |
| **E — Efficiency / storage** | 5 | Write amplification, unbounded reads, serial I/O. | 🟢 follow-up |
| **F — Billing exposure** | 2 | Uncapped double-billing; cost under-recorded against the cap. | 🔴 merge (F1) |
| **G — Duplication / compat** | 5 | Drift risk + one possible client break. | 🟢 follow-up |

**Four defects produce wrong output or lose data and must not merge unfixed: A1, A2, B1, B2.**
**One billing defect must not deploy unfixed: F1.**

---

## 0. DECISIONS (2026-08-04, user triage)

| ID | Decision | Note |
|---|---|---|
| **A1** | ✅ Option **A** — thread `skipped` out of `fetch_envelope`, mark only `span − skipped` | Option **C** (status column) **logged as deferred**, not built |
| **A2** | ✅ Option **A** — `ad_id` in `_key()` at ad level | Option **C** (PK migration) **logged as deferred**. Purge is a scheduled op — see J3 |
| **A3** | ✅ Option **A** — surface `skipped` in the ingest response | Ships with A1 as **one commit** |
| **B1** | ⛔ **SKIPPED — intentional.** Recent-only gating is by design | Do not re-raise |
| **B2** | ✅ **Null out after the flag** — in `analyze()`, compute `flag = _flag(pct)` first, then null `pct` entries where `prior == 0` | **Revised 2026-08-04 (rev 2).** Supersedes both option A and option B — see below |
| **B3** | ✅ Rec — explicit "insufficient history — N days, need 14" statement | |
| **C1** | ✅ Options **1 + 4** — point fix **plus** a route-introspection guard test | Multi-tenancy work deferred; these two are not |
| **C2** | ✅ Rec — **fail closed now**, delete `_shopify_context()` later via the connector | Connector-side prerequisites: `dev_reports/connector_improvements/` |
| **D1** | ✅ Rec — one app-wide `@app.exception_handler(MetaError)` | |
| **D4/D5** | ✅ History tier fetches **6 months** by itself; deeper **on demand**, never eagerly in-request | Connector-side equivalent logged as **R3a** in `connector_improvements/` |
| **E3** | ✅ Flip `keep_raw` default to **`False`** | Parameter kept (not deleted) — see the analysis below |
| **G3** | ✅ **RESOLVED — no change needed** | `apps/api/src/services/ai-layer-client.ts:118` sends `source: opts.source ?? 'store'` explicitly and always sends `X-Meta-Token`. The `schemas.py:70` default flip never reaches the only real client |

### E3 — why the raw payloads are never consumed (verified 2026-08-04)

Exhaustive grep across `apps/` and `rnd_mine/`: `_raw_by_competitor` has **four references in
`apps/ai-layer`, all writes** — `apify_ads.py:213` (the `keep_raw` param), `:241` (collect), `:256-257`
(attach to `record`). **Zero reads.** `aggregate()` (pipeline.py:127) reads only
`ads_record.get("ads_by_competitor", {})`.

**The scrape is on-demand, but the read is not — that asymmetry is the whole defect.** The scrape runs
once per refresh; `stored_block` → `_repo.load_competitor_intel` → `dict(row.ads_json)` runs inside
`_chat_messages` on **every `/chat` request** (api.py:222) and on every `GET /competitors/{id}`
(api.py:332/343), deserializing the entire JSONB column including the raw. Written once, deserialized
every chat turn, forever.

**What is lost by dropping it:** `normalize_ad` already extracts ~20 scalars per ad (archive id, page
name, platforms, dates, `active_days`, format flags, primary text, title, caption, CTA text/type, link
url, `card_texts` capped at 6). The raw additionally carries the full `snapshot` — `videoHdUrl`,
`videoSdUrl`, image URLs, page metadata, uncapped cards. Only two plausible future consumers exist:
competitor creative **imagery**, and re-normalizing without re-scraping. If imagery is wanted, pull
the media URLs into `normalize_ad` (bounded, a few fields) rather than warehousing the payload;
re-normalization is weak, since ad-archive data is time-sensitive anyway.

**Decision: flip the default to `False`, keep the parameter** — a scrape-time debugging escape hatch,
off by default. (Deleting the parameter outright was considered and not taken.)

**Live status:** the *scrape* is unreachable (no `/competitors` proxy route, no public domain), but
the *read* is live for any account that already has competitor data from a CLI run
(`chat.py:689` calls `pipeline.build` on the CLI path).

### Deferred on deployment topology — NOT fixed

**F1, F2, C2 and E4** are all behind `/competitors/*`, which has no `apps/api` proxy route, and
ai-layer has **no public domain** (confirmed with the user 2026-08-04). They are deferred because of
**deployment shape, not code**: every one of them goes live the day ai-layer gets a domain. Treat
"ai-layer gains a public domain" as the trigger to re-gate this group as a unit.

### B2 — `None`-safety assurance (verified 2026-08-04)

`_pct_change` has exactly one caller: `_deltas` (brain.py:129). **[Corrected 2026-08-08: true of
`_pct_change` the name, but the same zero-prior sentinel was re-implemented twice as `_pct`
(`history.py:115`, `ad_tools.py:163`) — caller count was the wrong question. Both siblings now
return `None` outright (no flag path there needs the sentinel); pinned by tests.]** Every consumer of the resulting
dict already has a `None` branch — `_causes` (`is not None` on every branch), `_flag` (same),
`_direction` (`if pct is None: return "n/a"`), and brain.py:249, which reads
`abs(pct["roas"]) if pct["roas"] is not None else 0.0`. **That last guard was written for a case the
`100.0` makes unreachable** — evidence `None` was always the intended contract.

`pct` is not typed by any pydantic model (`InsightsResponse` types only `statements` and `cards`), so
`None` serializes to `null` with no validation error, and **no `apps/web` consumer reads it** (the
`pct: number` hits in `creative-engine.model.ts` are generation-progress; `pctChange` in the agency
component is a different model).

**So option A is technically safe — but it changes behaviour beyond the defect:** with `None`,
`_flag()` short-circuits on `r is not None`, so a zero-prior campaign loses its SCALING flag entirely.
That is part of what B1 would have done, and B1 is intentional.

**Option B was then chosen — and is not implementable.** Keeping `100.0` internally and rendering
"new" at the display layer fails because **`_pct_change(2.0, 1.0)` returns exactly `100.0`**, byte-
identical to the zero-prior sentinel. No renderer can distinguish a fabricated 100 from a campaign
that genuinely doubled without also being passed `prior`. Caught in the rev-2 ponytail review.

**DECISION (rev 2): null out after the flag.** In `analyze()`:

```python
flag = _flag(pct)                                   # computed on the sentinel — SCALING survives
pct  = {k: (None if pa[k] == 0 else v) for k, v in pct.items()}   # fake figure dies everywhere
```

~2 lines. Preserves the SCALING flag for zero-prior campaigns (required, since B1 is intentional),
kills the fabricated figure everywhere **including `_causes`**, and needs **zero renderer edits** —
`_sign(None)` and `_direction`'s `"n/a"` path already exist, as the consumer table above shows.
Strictly better than both A and B.

### Options struck by the ponytail audit — do not re-propose

`A3-C` (HTTP 207 / partial status) · `B3-A` (short-span fallback period) · `C2-A` (per-brand Shopify
credentials built in ai-layer — connectors owns this as I10) · `D3-B/C` (known-empty set; windowed
memoize) · `D4/D5-C` (threadpool + deadline + partial results) · `D7-B/C` (cron; 24h rate-limit
state) · `E3-C` (strip raw to `normalize_ad` fields — reproduces `ads_by_competitor`) · `E4-B` (async
httpx refactor) · `G4-B` (follow `next` — reintroduces the 403 the cursor rewrite fixed).

**Downgraded to "only if the cheap version proves insufficient":** `E2-B` (dirty set — `executemany`
first) · `F1-C` (migration + `Retry-After` — advisory lock first) · `G2-A` (dict-native
`meta_transform` — one fixture test first) · `D4/D5-A` (warming contract — cap the constant first).

**Consolidated:** A1+A3 = one commit · D4+D5 = one change, two constants · **F2 takes option B**
(move `_usage_extra`/`_record_cost` into `cost_ledger`; option A imports a private helper across
modules, which is the pattern that caused the defect).

---

## 1. Cluster A — Cache integrity 🔴

### A1 · `apps/ai-layer/ai_layer/fetch_cache.py:85` — skipped days cached as permanent zeros
**CONFIRMED.** `fetch_cached()` calls `mark_insight_fetched()` for every date in `span`, regardless of
which dates actually returned data. `_fetch_window_adaptive` soft-fails: a day Meta keeps rejecting is
appended to `skipped` and dropped. Once that date passes the 7-day `FINAL_LAG` floor it satisfies
`d < floor`, lands in `final`, and is **never re-fetched**. A permanent hole, read downstream as genuine
zero spend.

> This is the worst defect in the diff, and it gets worse with time: bad rows written during any
> pre-fix run outlive the fix. Whatever else happens, fix this before the branch touches real data.

| Option | Approach | Trade-off |
|---|---|---|
| **A (rec.)** | Thread `skipped` out of `fetch_envelope` (it is already built and already sits in `meta["skipped"]`) and mark only `span − skipped`. | Shortest correct diff — the data already exists, it is just not consulted. Signature change through one call layer. Unmarked days heal on the next ingest. |
| B | Derive fetched dates from the dates present in `new_rows`. | **Tempting and wrong.** A day with no ads legitimately returns no rows; it would never be marked fetched and would be re-pulled forever — you would trade A1 for D3. |
| C | Add a `status` column (`ok` \| `failed`) to `insight_fetch_log` so the settled-floor logic can retry failures. | Most correct; failed days self-heal instead of merely being retried. Needs a migration. |

**Recommendation:** A now; C if you want failures to self-heal rather than depend on a later ingest
covering the same span. **Either way, purge affected rows** — see A2's purge note, same operation.

### A2 · `apps/ai-layer/ai_layer/fetch_cache.py:21` — cache key omits `ad_id`
**CONFIRMED.** `_key()` returns `campaign_id|adset_name|ad_name`. The same diff added `ad_id` to
`meta_live.FIELDS` *precisely because* `ad_name` is not unique — `meta_transform.py:92` documents it as
`ad_name: human label (NOT unique -- repeats across adsets)`. Two ads sharing a name inside one adset
collapse: `replace_insight_span` dedupes with `dedup[(date_iso, row_key)]` (last wins) and the table PK
is `(brand_id, account_id, level, date, row_key)`. `ad_tools._by_ad` then groups by the now-unique
`ad_id` and reports one ad where there were two — the other ad's spend and purchases vanish.

| Option | Approach | Trade-off |
|---|---|---|
| **A (rec.)** | `_key()` includes `ad_id` when `level == "ad"` (`row.get("ad_id") or ad_name` fallback). | Campaign-level keys unchanged, so campaign cache stays valid. Existing ad-level rows are keyed the old way and become unreachable — must be purged. |
| B | Key on `ad_id` alone for ad level, `campaign_id` for campaign level. | Cleanest semantics; changes adset-level behaviour too, which nothing currently asks for. |
| C | Add `ad_id` as a real PK column via migration. | Most explicit; migration + backfill for a cache that is rebuildable anyway. |

**Recommendation:** A, plus a one-time `DELETE FROM insight_rows WHERE level='ad'`. It is a 183-day
cache — cheap to rebuild in principle, **but** the rebuild is a Meta refetch storm and the app is on
`development_access` tier. Run the purge into a low window, or stage it per-account.

### A3 · `apps/ai-layer/ai_layer/store.py:35` — `/ingest` returns 200 after silently dropping days
**CONFIRMED.** `ingest` now routes day-shaped presets through `fetch_dataset_range`, whose
`_fetch_window_adaptive` swallows Meta failures into `skipped`. The old `fetch_dataset` path propagated
Graph errors. A transient 500 across a week now yields HTTP 200, a `rows_upserted` count, and a
`since`/`until` spanning the full 30 days — the caller has no signal a week is missing.

| Option | Approach | Trade-off |
|---|---|---|
| **A (rec.)** | Return `skipped` in the ingest response body and log a warning. | Honest, non-breaking, caller decides. Combined with A1 the days stay unmarked and heal on the next run. |
| B | Fail the request when `skipped` is non-empty. | Strict, but one bad day fails a 30-day ingest — hostile to a cron. |
| C | Partial-success status (`status: "partial"` or HTTP 207). | Clearest contract; every existing client needs to learn the new shape. |

**Recommendation:** A. It is the difference between a silent hole and a visible one, which is all this
defect is really about.

---

## 2. Cluster B — Analytics correctness 🔴

> All four are regressions introduced by the `statements()` → `analyze()` rewrite. B1 and B2 violate the
> CLAUDE.md quality gate directly: they are **specific, causal, actionable — and wrong**, which is the
> most expensive failure mode this product has.

### B1 · `apps/ai-layer/ai_layer/brain.py:246` — prior-window guards deleted
**CONFIRMED.** Lines 244–247 are the only per-campaign gates in `analyze()`, and both read `ra` — the
**recent** window. The old engine additionally required `w0_purch >= MIN_WINDOW_PURCHASES`,
`w1_purch >= MIN_WINDOW_PURCHASES` for scaling, `material.r0 > 0`, and `w0_spend >= floor*0.3`. Those
are gone, so FATIGUE/SCALING can fire off a statistically meaningless baseline.

Concretely: 400 INR / 1 purchase last week (ROAS 0.4× from noise), 20,000 INR / 8 purchases this week
→ `_deltas` reports roas +400%, `_flag` returns SCALING, and `/insights` ships *"'Summer Retarget' is
heating up (WoW): ROAS 0.40x → 2.10x (+400%) — a candidate for more budget."* The founder scales
budget on a baseline of one conversion.

| Option | Approach | Trade-off |
|---|---|---|
| A | Restore the prior-window guards verbatim from the old engine. | Straight revert of a deletion — lowest risk. Loses the new engine's ability to say anything at all about genuinely new campaigns. |
| B | Keep recent-only gating for *whether* a campaign appears, but suppress the **delta** when the prior window is thin — render "new / insufficient baseline" instead of a percentage. | Keeps new-campaign visibility, kills the false precision. This is what "specific or silent" actually asks for. |
| **A+B (rec.)** | Prior-window guard on the **flag** (no SCALING/FATIGUE off noise) + B's treatment of the **rendered delta**. | Two small changes in one function. Correct on both axes. |
| C | Emit a `confidence` field and let the UI decide. | Pushes an editorial decision into the client, contradicting "reject, don't log". Also every client must implement it or the bad number ships anyway. |

**Recommendation:** A+B.

### B2 · `apps/ai-layer/ai_layer/brain.py:80` — `_pct_change` fabricates +100%
**CONFIRMED.** `if prior == 0: return None if recent == 0 else 100.0`. The `100.0` is a hard-coded
stand-in for an undefined ratio; it replaced an explicit `(material.r0 > 0)` divide-by-zero guard that
suppressed the comparison entirely.

The damage is amplified by the prompt: the SYSTEM prompt declares the CODE-COMPUTED ANALYSIS block
*"calculated in code and EXACT ... never recompute or contradict it"*. So a campaign with 0 prior
revenue and 2.3× ROAS renders `ROAS 0.00x -> 2.30x (rising, +100%)` and the model repeats "+100%
week-over-week" to the founder as an exact figure.

| Option | Approach | Trade-off |
|---|---|---|
| **A (rec.)** | `return None` when `prior == 0`. | **One line.** The None path already exists and is already handled — `_sign(None)` returns `""`. Nothing downstream needs to change. |
| B | Keep a sentinel, render as "new" / "from zero". | More informative; requires touching every renderer. Worth doing *after* A, as copy. |
| C | Return `math.inf`, format specially. | Same work as B with an extra footgun in any arithmetic that touches the value. |

**Recommendation:** A. This is the cheapest fix in the register and one of the two most damaging bugs.

### B3 · `apps/ai-layer/ai_layer/brain.py:216` — `span_days >= 14` silences everything
**CONFIRMED.** `analyze()` gates period construction on `span_days >= 14` (WoW) / `>= 60` (MoM),
replacing the old always-available first-third-vs-last-third trend. Below 14 days `periods` is empty,
`res["account"]` and `res["campaigns"]` are both empty, and the response loses the Trend card *and*
every fatigue/scaling card. A newly connected brand with 9 days of data, or any
`?preset=last_7d` call, renders an empty insights panel with no explanation.

| Option | Approach | Trade-off |
|---|---|---|
| A | Short-span fallback period (`("Trend", span//2)` for `7 <= span < 14`). | Restores early-days output. Overlapping/short windows are statistically weak — arguably the reason the gate was added. |
| **B (rec.)** | Emit an explicit "insufficient history — N days, need 14" statement. | Empty-with-a-reason beats empty. Satisfies "actionable" (the action is *wait / connect more history*). Minimal risk. |
| C | Accept as deliberate. | Defensible on statistics, fails the quality gate on UX: a blank panel is not an answer. |

**Recommendation:** B minimum. A only if product explicitly wants day-3 output.

### B4 · `apps/ai-layer/ai_layer/brain.py:41` — dead `pct()` / `direction()`
**CONFIRMED.** No callers remain after the rewrite (`_sign`/`_direction` replaced them). Worse,
`_direction(pct: float | None)` shadows the module-level `pct` name with its parameter, so anyone
reaching for `pct()` inside that function gets a float. **Delete both.** No alternatives worth listing.

---

## 3. Cluster C — Multi-tenancy 🟠

### C1 · `apps/ai-layer/ai_layer/api.py:311` — `warm=` writes to the wrong brand partition
**CONFIRMED.** `/ingest` is the only endpoint whose signature lacks `brand: str | None = Depends(caller_brand)`.
Its siblings (`chat_endpoint`, `chat_stream_endpoint`, the competitor routes) all have it. So
`_cached_dataset(account_id, 30, tok, None)` and `build_history_block(...)` fall through
`repository._brand(None, account_id)` and write under `brand_id='act_123'`, while the follow-up `/chat`
carrying `X-Brand-Id: brand_A` reads a different partition. **The warm path cannot warm anything.**

Second, independent bug on the same lines: `if "cache" in warm` is a substring test, so
`warm=nocache` triggers cache warming and `warm=skip-history` triggers history warming.

| Option | Approach | Trade-off |
|---|---|---|
| **1 (✅ chosen)** | Point fix: add `Depends(caller_brand)` to `/ingest`, thread `brand` into both warm calls, replace the substring tests with membership over `warm.split(",")`. | 4 lines. Fixes today; prevents no recurrence. |
| 2 | Remove the fallback: `_brand` takes a required `str`, default resolved once at the edge. | Removes the silent-default class entirely. Touches ~50 `brand_id` call sites across 10 modules, and `caller_brand` cannot resolve the default alone — it never sees the path param. Contradicts #34's deliberate design. |
| 3 | Request-scoped `Depends(brand_ctx)` returning a resolved `(brand_id, account_id)`; endpoints take it or do not work. | Type-level enforcement, genuinely correct. A refactor of every endpoint signature for a problem that has occurred once. |
| **4 (✅ chosen)** | Add a test that introspects every registered route and asserts any endpoint touching brand-partitioned tables declares `caller_brand`. | ~10 lines. Catches the whole class at CI, including future endpoints, without touching the #34 design. |

**Decision: 1 + 4.** The fallback is deliberate and #34's territory — do not relitigate it here. What
is missing is not a better design but a guard that the design is followed. Options 2 and 3 are the
ones that *look* like the major design fix; both cost a broad refactor to prevent something one test
catches.

**Why the bug is invisible** (context for option 4): `repository.py:24` is
`def _brand(brand_id, account_id): return brand_id or account_id`, and `caller_brand`'s own docstring
states *"When absent, repositories default brand_id = account_id. Full per-brand credential resolution
lands with #34."* A missing brand therefore never errors — it writes to a different **valid**
partition. `/ingest` is the first endpoint to forget the dependency; nothing stops the second.

**Sequencing (J2):** the recommended D4/D5 mitigation is "cap request-path depth, get full depth via
`warm=`". That depends on `warm=` working, and today it does not. Deferring C1 into the multi-tenancy
task is fine **provided D4/D5 are not closed out on the assumption that warming covers them.**

### C2 · `apps/ai-layer/ai_layer/competitor/pipeline.py:49` — `_shopify_context()` is process-global
**CONFIRMED.** `_shopify_context()` takes no account/brand argument and reads `SHOPIFY_STORE` /
`SHOPIFY_TOKEN` from process env. Meanwhile `build()` is reachable per-tenant via
`POST /competitors/{account_id}/refresh`, which correctly threads `brand_id` into brand-partitioned
tables. Result on a two-brand deployment: Brand B's refresh sends **Brand A's catalogue** to the
discovery LLM, gets Brand A's competitors back, and persists them under Brand B's `competitor_intel`
row — where `stored_block` injects them into B's chat context.

| Option | Approach | Trade-off |
|---|---|---|
| ~~A~~ | ~~Per-brand Shopify credentials built in ai-layer.~~ | **STRUCK.** Connectors owns this as **I10** (per-brand CredentialProvider). Building a second mechanism guarantees deleting one later. |
| **B (✅ chosen)** | Fail closed: return `None` unless the account matches a single configured tenant. Discovery degrades to Meta-only context. | ~5 lines, no wrong data, unblocks multi-tenant deploy today. Single-tenant deployments keep full behaviour. |
| C | Document as single-tenant-only. | Zero code; the wrong-data path stays live and nothing enforces it. |

**Decision: B now → delete later.** Once I10 lands, remove `_shopify_context()` entirely and source
product context through the connector. Net deletion: one credential path instead of two, and a
brand-parameterized signature comes free.

**Why "just route it through the connector" is not a drop-in** (verified 2026-08-04):

1. **Separate credential paths today.** ai-layer reads `SHOPIFY_STORE` / `SHOPIFY_TOKEN`; connectors
   reads `SHOPIFY_SHOP_DOMAIN` / `SHOPIFY_ADMIN_TOKEN`. Different variable names, no shared code —
   ai-layer's competitor pipeline has a duplicate Shopify credential path that ignores the connector.
2. **Shopify is credential-bound.** `apps/connectors/CONTRACT.md` §5: *"the token IS per-store;
   `shopify_domain` alone cannot retarget. Multi-store needs the per-brand CredentialProvider
   (planned, I10)."* Meta and Google retarget fine via `BrandRef`; Shopify cannot. Routing today only
   moves the global read from `pipeline._shopify_context()` to `config.get_shopify_creds()`.
3. **`connector_source.py` excludes Shopify by design.** That module is the sanctioned single import
   point for `connectors` inside ai-layer, and it sets `EXCLUDED_PLATFORMS = {"shopify"}` because
   shop-level daily revenue as campaign rows *"would corrupt every spend-based brain statement"*.
   The exclusion is correct for the **fact** path — but `_shopify_context()` needs product types and
   sample titles, which is an **assets** concern (`get_assets`), not a fact concern. That route does
   not exist through the seam yet.

Connector-side prerequisites are tracked in **`dev_reports/connector_improvements/`**.

---

## 4. Cluster D — Request path 🟠

> One root cause, seven symptoms: `history.ensure`, `_ensure_ad_level`, `cached_rows` and
> `prune_older_than` were written for a CLI, where a 37-month backfill and an unconditional DELETE are
> fine. Mounted on an HTTP handler they are timeouts, rate-budget exhaustion and write amplification.

### D1 · `api.py:243` — `MetaError` handler covers the wrong code
**CONFIRMED.** The handler wraps `run_tool_loop` (line 252) but `_chat_messages` runs at 243, *before*
the try — and on the new default `source="cache"` that is exactly what calls
`_cached_dataset → fetch_envelope → _fetch_window_adaptive`, which re-raises `MetaError` for anything
that is not too-much-data or beyond-retention. A Meta rate-limit (`code=4` / subcode `1504039` — the
precise codes the handler at 253–257 maps to HTTP 429) escapes as an unhandled 500. `/chat/stream` has
no handler at all.

| Option | Approach | Trade-off |
|---|---|---|
| A | Move `_chat_messages` inside the try; duplicate the handler onto `/chat/stream`. | Local, obvious. Duplicated logic, and the next endpoint added forgets it again. |
| **B (rec.)** | Register a FastAPI `@app.exception_handler(MetaError)` once. | One guard where every caller routes through — covers `/chat`, `/chat/stream`, `/ingest`, `/insights` and everything added later. Smaller diff than A. Streaming responses need care: once the stream has started, the handler cannot change the status code. |

**Recommendation:** B, with the streaming caveat handled by building context *before* opening the
stream (which is where the failure occurs anyway).

### D2 · `meta_live.py:127` — unguarded `r.json()` escapes the retry ladder
**CONFIRMED.** `get_insights_paged()` calls `body = r.json()` bare inside the pagination loop. Its
sibling `meta_get()` (103–106) has exactly the guard that is missing. Meta's edge returns HTML 502/503
pages under load; `json.JSONDecodeError` is not `MetaError`, so `_fetch_window_adaptive` never sees it,
the adaptive split and single-day retry are bypassed, and the caller gets an unhandled 500.

| Option | Approach | Trade-off |
|---|---|---|
| A | `try/except ValueError` around this one call, raising `MetaError`. | Minimal. Note it must raise `MetaError`, **not** `RuntimeError` as `meta_get` does — otherwise the retry ladder still cannot classify it. |
| **B (rec.)** | Extract `_json_or_fail(r)` and use it in both `meta_get` and `get_insights_paged`. | One helper, both call sites correct, and it fixes `meta_get`'s inconsistent `RuntimeError` at the same time. The root-cause version of A. |

**Recommendation:** B.

### D3 · `history.py:166` — empty months never memoized
**CONFIRMED.** `if facts:` guards `months[ym] = rollup(facts)`, so a month with no data never becomes a
key, and line 153 recomputes `todo` purely from key presence. A 4-month-old account yields 32 empty
months out of 36, forever: **every** `/chat` on the default `source="cache"` path fires 32+ sequential
Meta Insights calls inside the request handler. On the `development_access` rate budget this is the
fastest route to throttling the account.

| Option | Approach | Trade-off |
|---|---|---|
| **A (rec.)** | `months[ym] = rollup(facts) if facts else EMPTY_ROLLUP`. | One line. **Safe because the `except Exception: continue` above already diverts failures** — reaching `if facts:` with an empty list means Meta genuinely returned nothing, so memoizing it is correct, not a cached error. |
| B | Persist a separate "known empty" set. | Same effect, extra state, extra storage shape. |
| C | Memoize empties only outside the refresh window. | Marginal benefit; the refresh window already re-pulls recent months regardless. |

**Recommendation:** A. Cheapest high-value fix after B2.

### D4 · `api.py:225` — 37-month backfill inside the HTTP request
**CONFIRMED.** `_chat_messages → build_full_context → build_history_block → history.ensure(months_back=RETENTION_MONTHS=37)`.
Cold account → `todo` is all 37 months → 37 sequential paginated Graph calls, plus a prune and a save
per month. The first `/chat` for any new account times out.

### D5 · `chat.py:391` — first ad-level tool call backfills 60 days in-request
**CONFIRMED.** Same class, different trigger. `_ensure_ad_level` clamps to `AD_TOOL_MAX_DAYS=60` and
pulls the largest, slowest Insights shape — the module's own docstring calls it *"big + slow the first
time"* — synchronously inside the tool loop, which itself runs inside the request handler. With
`TOOL_MAX_ROUNDS=6`, several rounds can each trigger another window.

**Shared options for D4 + D5:**

| Option | Approach | Trade-off |
|---|---|---|
| A | Cold account returns a "warming" response; backfill moves to a background task. | Correct long-term shape. **Changes the API contract** — clients must poll or retry. Depends on C1 being fixed first, or the warm lands in the wrong partition. |
| **B (rec.)** | Cap depth on the request path (≈6 months live for D4; first ad-level pull to ≈14 days for D5); full depth only via `/ingest?warm=history`. | Smallest change, contract preserved, latency bounded. Permanently limits how deep an uncached request can go — acceptable, since deep history is exactly what warming is for. |
| C | Run `ensure` in a threadpool with a deadline, return partial. | Keeps contract *and* depth; ties up workers and makes response content non-deterministic. |

**Recommendation:** B for both, with C1 fixed so the warm path is a real escape hatch. Revisit A once
the client can handle an async contract.

### D6 · `chat.py:522` — `cached_rows` loads the whole account, unbounded
**CONFIRMED.** `fetch_cache.cached_rows(account, level)` runs `SELECT raw FROM insight_rows` with no
date bound on **every** context build, before `history.ensure` has decided whether any month needs
work. A 6-month, 84-campaign account is ~15k JSONB blobs deserialized per request — even in the common
case where `todo` is empty and `cache_rows` is never read.

**Fix:** pass `raw_since` — already computed and already a parameter of the enclosing function. One
line. (Alternative: lazy-load inside `facts_for_month`; more code, same outcome.)

### D7 · `chat.py:544` — prune DELETEs on every read
**CONFIRMED.** `fetch_cache.prune_older_than(...)` runs unconditionally at the end of every
`build_history_block`, so every `POST /chat` issues two DELETEs (`insight_rows` +
`insight_fetch_log`) even when nothing is older than the 183-day cutoff. Under concurrent chats for one
account these contend with `replace_insight_span`'s delete-then-insert.

| Option | Approach | Trade-off |
|---|---|---|
| **A (rec.)** | Move the prune to the ingest path. | Pruning belongs with the writer. No new state. |
| B | Cron. | Cleanest separation; needs a job + an account list. |
| C | Rate-limit (prune only if last prune > 24h). | Keeps it where it is; adds state to track "last pruned". |

---

## 5. Cluster E — Efficiency / storage 🟢

| ID | Location | Defect | Options & trade-offs |
|---|---|---|---|
| **E1** | `db/repository.py:353` | `replace_insight_span` does `s.add(m.InsightRow(...))` once per row. A 30-day × 84-campaign ingest constructs ~2,520 mapped instances and flushes them individually against Neon; ad-level is an order of magnitude worse. | **Rec:** `bulk_insert_mappings` or `insert().values(list)`. No ORM events are used here, so nothing is lost. Chunk at ~5k rows for parameter limits. The surrounding delete-then-insert transaction already gives identical semantics. |
| **E2** | `db/repository.py:400` | `save_monthly_facts` executes one `pg_insert` per month, and `history.ensure` passes the **entire** `months` dict — so a warm account issues 37 statements to rewrite 2 changed rollups. | **A (rec.):** `executemany` — one-line repository change, most of the win. **B:** track a `dirty` set in `ensure` and pass only changed months — more correct, touches `ensure`. Do A now, B if it still shows. |
| **E3** | `competitor/apify_ads.py:257` | `keep_raw=True` default puts unfiltered scraper output for up to 90 ads into `competitor_intel.ads_json`. `load_competitor_intel` does `dict(row.ads_json)` on every uncached `/chat` and every `GET /competitors/{id}`, deserializing megabytes `aggregate()` never reads. | **A (rec.):** flip the default to `False` — one character, immediate. Loses scrape debuggability. **B:** separate column/table loaded on demand — keeps raw *off* the read path, needs a migration; best if the raw is genuinely wanted. **C:** strip to the fields `normalize_ad` reads before storing — middle ground, but then it is not raw. |
| **E4** | `competitor/apify_ads.py:227` | Competitors scraped strictly serially. Each `scrape_competitor` can issue two `run_scraper` calls, each `httpx.post(..., timeout=wait+20)` with `wait=300`. Worst case **6 × 2 × 320s ≈ 64 minutes** of blocking I/O in one background task. | **A (rec.):** `ThreadPoolExecutor` over competitors, bounded to 3–4. The calls are blocking `httpx`, so threads work; ~6× wall-clock for ~5 lines. Apify bills per actor run either way, so **no cost change**. **B:** async httpx + `gather` — larger refactor of a sync module. **C:** lower the 300s wait — reduces the ceiling, raises the failure rate. |
| **E5** | `api.py:180` | *PLAUSIBLE.* `_cached_dataset` calls `ml.list_accounts` only for name/currency; `fetch_envelope` already makes the same `me/adaccounts` call per contiguous missing run. Both are static per account and already stored by `upsert_dataset`. | **Rec:** read from the stored `brands`/`accounts` row, fall back to `list_accounts` on miss. **Verify first** by counting `me/adaccounts` calls in one cold chat request — on the dev-tier budget the redundancy matters more than the latency. |

---

## 6. Cluster F — Billing exposure 🔴

### F1 · `api.py:364` — `/competitors/{id}/refresh` has no dedupe 🔴
**CONFIRMED.** The endpoint returns `status: "started"` immediately and enqueues `_run()` via
`background.add_task` with **no in-flight lock, dedupe key, or throttle anywhere in `api.py`**.
`refresh=True` makes both billed legs unconditional:

- `discover.ensure()` skips its cache short-circuit → a fresh billed OpenRouter `chat.completions.create`
  every call;
- `pipeline.build()` → `apify_ads.scrape(...)` → up to `MAX_COMPETITORS=6` Apify actor runs at
  `ADS_PER_COMPETITOR=15`. **The module's own docstring prices one sweep at ~$0.50.**

A double-click or a client retry bills the account twice for identical data. Both runs then write the
same `(brand_id, account_id)` PK, so last-writer-wins can leave the stored row *thinner* than before the
refresh (if the second run had more competitors fail into `skipped`) — double the spend for a worse result.

| Option | Approach | Trade-off |
|---|---|---|
| A | In-process set of in-flight `(brand, account)` keys, cleared in a `finally`. | ~5 lines. **Breaks the moment you run more than one Railway replica** — and the deploy target is Railway. Insufficient on its own. |
| **B (rec.)** | Postgres advisory lock (`pg_advisory_lock`) around the refresh. | Correct across replicas, no migration (session-scoped), Postgres is already a hard dependency. Silently no-ops the second call — the client is not told why. |
| C | `refresh_started_at` column; reject with 429 + `Retry-After` if within N minutes. | Client learns what happened, which is better UX and better for retry logic. Needs a migration. |

**Recommendation:** B for correctness now; C if you want the client informed — they compose (B for the
race, C for the cooldown).

### F2 · `competitor/discover.py:107` — discovery cost under-recorded
**CONFIRMED.** `discover()` reads `getattr(usage, "model_extra", {}).get("cost")` only.
`chat._usage_extra` (chat.py:345) checks `getattr(usage, key)` **first** and falls back to
`model_extra`; `chat._record_cost` additionally reads `cost_details.cache_discount`. When the OpenAI SDK
surfaces `cost` as a real attribute, discover's lookup returns `None` and `cost_ledger.record` silently
falls back to the static per-token estimate — so the billed discovery leg is logged **at an invented
price**, and prompt-cache discounts never reach the ledger the cap is enforced against.

| Option | Approach | Trade-off |
|---|---|---|
| A | Import and call `chat._usage_extra` from `discover`. | Two lines. Reaches across modules for a private helper — the thing that produced this defect in the first place. |
| **B (rec.)** | Move `_usage_extra` + `_record_cost` into `cost_ledger`; `chat` and `discover` both call it. | One guard where all callers route through. Trivial import-graph change, and `cost_ledger` is where cost logic belongs. |

**Recommendation:** B. Any future billed leg then gets correct accounting by default.

> **Note.** `rnd_mine`'s `PlannerLLM` is a third, larger billing exposure (direct OpenRouter calls, no
> gateway, no ledger, up to 3 billed completions per planning step — a direct CLAUDE.md rule-1
> violation). It is **out of scope** per the scope decision; recorded in §7 as a blocker for any future
> reconsideration of that tree.

---

## 7. Out of scope — `rnd_mine/`

> **Not to be merged, pushed, or updated.** Listed for completeness only. None of these gate anything below.

| Location | Defect | Note |
|---|---|---|
| `src/creative_studio/planning/llm.py:80` | `PlannerLLM.complete_json` POSTs directly to OpenRouter with its own client and `Authorization` header — no gateway, no cost/token recording. Retries up to `1 + max_retries`, so one planning step can bill three unledgered completions. | **Direct CLAUDE.md ARCHITECTURE RULE 1 violation.** Hard blocker if `rnd_mine` is ever reconsidered. |
| `src/creative_studio/generation/workers.py:200` | `compose` runs synchronous boto3 R2 get/put directly on the event loop while the ffmpeg work beside it is correctly offloaded with `asyncio.to_thread`. Freezes every sibling coroutine under `_generation_stage`'s `gather`. | Fix is `asyncio.to_thread` on the transfers — the pattern is already in the same function. |
| `src/creative_studio/generation/adapters/base.py:75` | `FalAdapter.__init__` writes `os.environ["FAL_KEY"]` as a construction side effect. `fal_client` reads it at call time, so constructing a second adapter re-authenticates an in-flight `submit()` on the first. | Pass the key explicitly, or set once at process start. |
| `cli/chat/ad_tools.py` (tree) | `rnd_mine/cli/chat/` is a fork of the productionized `apps/ai-layer/ai_layer/` chat modules: `ad_tools.py` byte-identical (306 lines), six sibling pairs differing only in the storage seam — **~2,900 duplicated lines**. | Moot for the merge under the scope decision, but it is the clearest evidence the two trees have already diverged. |

---

## 8. Cluster G — Duplication & compatibility 🟢

| ID | Location | Defect | Options & trade-offs |
|---|---|---|---|
| **G1** | `store.py:31` | The `preset_days → since/until → fetch_dataset_range else fetch_dataset` dispatch is copy-pasted verbatim into `api._fetch_live` (api.py:105–110). A change to the `until = today - 1` convention applied to one copy makes `/ingest` and `/insights?source=live` return different windows for the same preset. | **Rec:** extract `meta_live.fetch_dataset_for_preset(token, account, preset, level)`. Six lines → one call, twice. |
| **G2** | `chat.py:191` | `chat._daily_totals` / `_campaign_summary` are a **third** live implementation of `meta_transform.daily_totals` / `campaign_summary` (pandas versions live at `api.py:150`, `brain.py:427-428`, `creative/campaign_select.py:30`); `rnd_mine/cli/chat/chat.py:564/581` is a fourth. All must encode the rule the chat docstring states — *"ratios recomputed from the sums (never averaged, which would be wrong)"*. | The dict versions exist deliberately (the "pandas-free context" commit), so this is not gratuitous. **A:** make `meta_transform` dict-native and have the pandas path call it — the real fix, touches three call sites. **B (rec. now):** one shared fixture test asserting both produce identical output — cheap insurance against exactly the drift that matters. Do A when pandas is dropped. |
| **G3** | `schemas.py:70` | *PLAUSIBLE.* `ChatRequest.source` default flips `"store"` → `"cache"`. `"cache"` is absent from the legacy tuple, so a caller omitting `source` **and** sending no `X-Meta-Token` — previously served from Postgres, which needs no Meta credential — now hits `_need_token` and gets HTTP 400. | **Verify first:** does any deployed web client omit `source`? If yes → restore the `"store"` default and let callers opt into `"cache"`. If no → document the break and move on. Do not guess; this is one grep of `apps/web` away from certain. |
| **G4** | `meta_live.py:134` | *PLAUSIBLE.* Pagination breaks whenever `paging.cursors.after` is missing, dropping the old unconditional `paging.next` follow. An offset-paged response (`next` present, no `cursors`) silently truncates to the first page with `pages == 1` and no warning. | The cursor rewrite has a real justification (the docstring: Meta's `next` is minted on a newer Graph version and 403s). **A (rec.):** keep cursor-first, but `log.warning` when `next` exists without `after` — you find out from production instead of guessing. **B:** fall back to following `next` when `after` is absent — reintroduces the 403 risk the rewrite was for. **C:** verify against a captured real response for your field/breakdown combination, then pick. |

---

## 9. Refuted — do not re-raise

Three candidates were raised and killed under verification. Recorded so they are not re-litigated:

| Location | Claim | Why refuted |
|---|---|---|
| `meta_live.py:101` | "Fresh `httpx.Client` per Graph call, no connection reuse across dozens of requests." | `get_insights_paged` wraps the **entire** pagination loop in one `with httpx.Client(timeout=120) as client:`. The hot path already reuses. Only `meta_get` builds one per call, and that is a handful of metadata calls. |
| `meta_live.py:212` | "`_fetch_window_adaptive` threads `depth` through every recursive call but never reads it." | Factually true, no observable effect; the recursion is genuinely bounded by the window-halving guard in the same block. Cosmetic at most. |
| `api.py:342` | "`/competitors/{id}` reaches into `competitor_pipeline._is_stale`, a private helper." | Encapsulation/style only. No input or state produces a wrong output today; the stated failure was a hypothetical future rename. |

---

## 10. Integration & deployment note

*Shape, not a plan. Nothing here is scheduled or committed.*

### Sequencing

1. **Split the branch first.** `apps/ai-layer/` and `rnd_mine/` share no files and have completely
   different readiness. Per the scope decision, `rnd_mine/` is out — do not carry it into the merge, and
   do not let the open supersede question gate the ai-layer work.
2. **Gate to merge — the four that produce wrong output or lose data, plus the billing race:**
   **A1, A2** (cache integrity — these get *worse* with every run against real data, since bad rows
   outlive the fix), **B1, B2** (wrong recommendations to founders), **F1** (uncapped double-billing).
   All five are small, local fixes. None is a redesign. B2 in particular is one line.
3. **Gate to deploy — the request path:** **C1** first, because it is what makes the warm path
   functional, which is what makes **D4/D5**'s mitigation viable. Then **D1, D2, D3**. A cold `/chat`
   today does a 37-month sequential Meta backfill inline; on `development_access` that is both a
   timeout and a throttle event, and `history.py:166` guarantees it repeats on every request.
4. **Follow-up, not blocking:** cluster E (write amplification, unbounded reads, serial scrape),
   cluster G (duplication + compat), **B3, B4, A3, C2's option A**.

### Two questions to answer before merge, not after

Both PLAUSIBLE verdicts are one observation away from CONFIRMED or dead. Answering them is cheaper than
carrying the uncertainty through a merge:

- **G3** — does any deployed `apps/web` client POST `/chat` without `source`? One grep.
- **G4** — does Meta's Insights edge still return `next` without `cursors` for the field/breakdown
  combinations we request? One captured response.

### Standing constraints this touches

- **Meta dev-tier rate budget.** A2's purge, D3's fix and D4/D5's backfill all interact with it. Any
  cache purge is a refetch storm — stage it per-account or run it into a low window.
- **Test invariant.** `creative_v2` reports its own ai-layer suite at 624/7; our gate is default 400/9 ·
  pg 388/10 · `tsc --noEmit` baseline-only · `madge --circular` 0. Reconcile at merge, and run pg tests
  with the preflight `SELECT 1` + transient-retry before calling any single failure a regression.
- **`railway` / `railway.pub`** are still untracked private keys in the working tree, unrelated to this
  review but still ungitignored.

---

## 11. Judgment calls — read these before triaging

Three places where the obvious reading of the register is misleading:

**J1 · B2 is a one-line fix and it is one of the two most damaging bugs.**
`brain.py:80` looks like it needs a design decision about how to represent an undefined ratio. It does
not. `return None` when `prior == 0` is the whole fix — the `None` path already exists downstream and
`_sign(None)` already renders `""`. Do not bundle it with B1's larger gate rework; ship it on its own.
Best cost-to-impact ratio in the register.

**J2 · C1 must land before D4/D5, not alongside them.**
The natural mitigation for "37-month backfill inside the request" is "push it to the warm path" — and
the warm path is already built. But `/ingest` is missing `Depends(caller_brand)`, so warming writes to
a different brand partition than chat reads: **it cannot warm anything today.** Fixing D4/D5 by
deferring to `warm=` silently does nothing until C1 is in. Sequence C1 first or the deploy gate does
not actually clear.

**J3 · A2's fix carries a rate-budget cost that the fix itself does not show.**
Correcting `_key()` re-keys ad-level rows, so existing ones become unreachable and must be purged. The
purge is trivial; the **rebuild is a Meta refetch storm on a `development_access`-tier app**. Treat
`DELETE FROM insight_rows WHERE level='ad'` as a scheduled operation — staged per-account or run into a
low window — not as a step in the code change. See [[meta-dev-tier-rate-budget]] constraints.

---

## Appendix — defect index

| ID | Location | Verdict | Gate |
|---|---|---|---|
| A1 | `fetch_cache.py:85` | CONFIRMED | 🔴 merge |
| A2 | `fetch_cache.py:21` | CONFIRMED | 🔴 merge |
| A3 | `store.py:35` | CONFIRMED | 🟢 follow-up |
| B1 | `brain.py:246` | CONFIRMED | 🔴 merge |
| B2 | `brain.py:80` | CONFIRMED | 🔴 merge |
| B3 | `brain.py:216` | CONFIRMED | 🟢 follow-up |
| B4 | `brain.py:41` | CONFIRMED | 🟢 follow-up |
| C1 | `api.py:311` | CONFIRMED | 🟠 deploy |
| C2 | `competitor/pipeline.py:49` | CONFIRMED | 🟠 deploy |
| D1 | `api.py:243` | CONFIRMED | 🟠 deploy |
| D2 | `meta_live.py:127` | CONFIRMED | 🟠 deploy |
| D3 | `history.py:166` | CONFIRMED | 🟠 deploy |
| D4 | `api.py:225` | CONFIRMED | 🟠 deploy |
| D5 | `chat.py:391` | CONFIRMED | 🟠 deploy |
| D6 | `chat.py:522` | CONFIRMED | 🟢 follow-up |
| D7 | `chat.py:544` | CONFIRMED | 🟢 follow-up |
| E1 | `db/repository.py:353` | CONFIRMED | 🟢 follow-up |
| E2 | `db/repository.py:400` | CONFIRMED | 🟢 follow-up |
| E3 | `competitor/apify_ads.py:257` | CONFIRMED | 🟢 follow-up |
| E4 | `competitor/apify_ads.py:227` | CONFIRMED | 🟢 follow-up |
| E5 | `api.py:180` | PLAUSIBLE | 🟢 follow-up |
| F1 | `api.py:364` | CONFIRMED | 🔴 merge |
| F2 | `competitor/discover.py:107` | CONFIRMED | 🟠 deploy |
| G1 | `store.py:31` | CONFIRMED | 🟢 follow-up |
| G2 | `chat.py:191` | CONFIRMED | 🟢 follow-up |
| G3 | `schemas.py:70` | PLAUSIBLE | ❓ verify |
| G4 | `meta_live.py:134` | PLAUSIBLE | ❓ verify |
| H1 | `history.py:169` | PLAUSIBLE | 🟢 follow-up |

*H1 — `attach_deltas` mutates each rollup with a derived `mom` block before `save()` persists it.
`history.load()` returns stored rollups without recomputing, and `chat.py:537` uses exactly that path in
the `KeyboardInterrupt` fallback — rendering MoM percentages derived from a month since rebuilt with
different numbers. Computing `mom` at render time removes the class entirely.*

**28 in-scope · 4 out-of-scope (`rnd_mine/`, excluded) · 3 refuted.**
