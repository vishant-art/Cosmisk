# `creative_v2` ai-layer — Integration Plan

**Date:** 2026-08-04 · **Rev 2** (post ponytail review) · **Status:** 🔵 APPROVED — not yet executed
**Defect register:** [`2026-08-04-creative-v2-diff-review.md`](./2026-08-04-creative-v2-diff-review.md)
**Connector requirements:** [`connector_improvements/2026-08-04-ai-layer-driven-requirements.md`](./connector_improvements/2026-08-04-ai-layer-driven-requirements.md)
**Source pin:** `origin/new/creative_v2` @ **`17d8ea8`** · **Target:** `main` @ `632abd6`

---

## 1. Branch strategy — option (b)

Take `creative_v2`'s ai-layer work onto our own branch, fix it there, one PR to `main`.

**Why not PR into `creative_v2`:** that branch carries ~123 `rnd_mine/` files under a standing
*never merge, push, or update* rule. PRing into it would be a push to a branch containing `rnd_mine`,
would leave a second PR to `main` that we don't control, and would require someone to remember to strip
`rnd_mine` at that second step. Option (b) enforces the exclusion **by construction**.

**Cost:** diverges from `dryayeet`'s branch. If work continues on `creative_v2`'s ai-layer that is a
second reconciliation. Mitigated by pinning at `17d8ea8`; user is giving `dryayeet` a heads-up.

### Merge surface — measured

`git merge-tree --write-tree origin/main origin/new/creative_v2` (trial merge, no worktree change):

| Result | Files |
|---|---|
| **CONFLICT** | `.env.example`, `dev_reports/STATUS_INDEX.md` |
| Auto-merged | `apps/ai-layer/ai_layer/api.py`, `apps/ai-layer/ai_layer/creative/service.py` |

**Two conflicts, both non-code.** Every ai-layer source file merges clean. PR #11 (`apps/web` legal
pages) touches none of the files `creative_v2` touches.

### Mechanics

```
git checkout -b integrate/ai-layer-v2 main
git merge --no-commit origin/new/creative_v2      # pinned at 17d8ea8
#   .env.example      -> union of both, ai-layer keys from creative_v2
#   STATUS_INDEX.md   -> ours (main), re-indexed at the end
git rm -r --cached rnd_mine && rm -rf rnd_mine     # exclusion, inside the merge commit
git commit
```

Then one commit per item below. **No push until the user says so.**

---

## 2. What is reachable — the gate that decides everything

`apps/api` proxies four handlers into ai-layer. Nothing else in the ai-layer API is reachable from the
product, and **ai-layer has no public domain** (confirmed 2026-08-04).

| Proxy route | → ai-layer | Defects exposed |
|---|---|---|
| `GET /ai-layer/insights` | `/insights` | B2, B3 |
| `GET /ai-layer/analytics` | `/insights/{id}?source=store` (`ai-layer-client.ts:241`) | **B2, B3** |
| `POST /ai-layer/chat` + `/chat/stream` | `/chat` | A1, A2, D1, D3, D4, D5, D6, D7 |
| `POST /ai-layer/refresh` | `/ingest` | A1, A3, D2 |

No `/competitors` route. No `warm=` passthrough. **No client sends `X-Brand-Id`** — every `brandId` in
`apps/web` is an internal Angular model field or demo data, never an HTTP header.

---

## 3. Batch 1 — Tier 1 (merge gate) 🔴

Wrong data or wrong numbers on the live path.

**A1 + A3** — `fetch_cache.py:85`, `store.py:35`. Mark only `span − skipped`; surface `skipped` in the
ingest response.
> **Real size: ~20 lines across 4 files** — not "thread one value out". `fetch_range(lo, hi)` returns
> **rows only**; `skipped` lives in the envelope meta, which all three production closures discard
> (`api.py:175-176`, `chat.py:403-404`, `chat.py:640-641` all return `["data"]`). The fix changes the
> callback contract → `fetch_cache.py` marking logic + 3 closures + the fake fetchers in
> `tests/test_fetch_cache.py`. A3 is ~3 lines (`store.py` + a `skipped` field on the ingest response),
> not +1.

**A2** — `fetch_cache.py:21`. `_key()` includes `ad_id` when `level == "ad"`
(`row.get("ad_id") or ad_name`). Campaign keys unchanged.
> **Scheduled operation, not a code step.** Old ad-level rows keep their old keys, and
> `load_insight_rows` selects by `(account, level, date range)` — so they **stay marked fetched and
> keep being served, collapsed and wrong**. `DELETE FROM insight_rows WHERE level='ad'` is required.
> The purge is trivial; the **rebuild is a Meta refetch storm on a `development_access` app** — stage
> it per-account or run it into a low window. Do not bundle it into the code commit.

**B2** — `brain.py:80` + `analyze()`. In `analyze()`, compute `flag = _flag(pct)` **first**, then null
out `pct` entries where `prior == 0`. ~2 lines, two dict-comps.
> **Why not the render-layer approach** (rejected in review): `_pct_change(2.0, 1.0)` returns exactly
> `100.0` — byte-identical to the zero-prior sentinel. No renderer can distinguish a fabricated 100
> from a genuine doubling without also being passed `prior`. Nulling after the flag is computed
> preserves SCALING for zero-prior campaigns (required, since **B1 is intentional**), kills the fake
> figure everywhere including `_causes`, and needs **zero renderer edits** — `_sign(None)` and
> `_direction`'s `"n/a"` paths already exist.

**B3** — `brain.py:216`. Explicit "insufficient history — N days, need 14" statement. ~3 lines, rides
the same `brain.py` commit as B2.
> Live on **both** `/insights` and `/analytics` (see §2). The chat path has partial mitigation via
> `render_analysis_block`'s "too short" line; the `/insights` statements path returns near-empty today.

**Targeted tests:** a span containing a skipped day leaves that day unmarked in `insight_fetch_log`;
two same-named ads in one adset produce two rows; a zero-prior campaign keeps its SCALING flag and
renders no percentage.

---

## 4. Batch 2 — Tier 2 (deploy gate) 🟠

**D3** — `history.py:166`. **~4 lines, not 1.** `built += 1` only fires inside `if facts:`, and
`if built: save(...)` gates persistence — so an `EMPTY_ROLLUP` assignment alone means an all-empty
account **never saves and the 32-call storm survives the fix**. Needs: the `EMPTY_ROLLUP` constant, the
assignment, and a save condition that counts memoized empties.
> No None-guard needed — `facts_for_month` (`chat.py:524-531`) returns a list in both branches and
> never returns `None`. The `except Exception: continue` above already diverts genuine failures, so an
> empty list here means Meta really returned nothing. **This is the dev-tier throttle fix.**

**D1** — `api.py:243`. One app-wide `@app.exception_handler(MetaError)`. Covers `/chat`,
`/chat/stream` (which has **no** handler today), `/ingest`, `/insights` and anything added later.
Build context before opening the stream — status codes cannot change mid-stream. (The failure site,
`_chat_messages` at `api.py:243`, is already pre-stream.)

**D2** — `meta_live.py:127`. Extract `_json_or_fail(r)`; use in `get_insights_paged` **and**
`meta_get`. Must raise `MetaError`, not `RuntimeError`, or the retry ladder still cannot classify it.

**D4 + D5** — `api.py:225`, `chat.py:391`. Cap request-path depth: history **6 months**, first
ad-level pull **14 days**. Deeper on demand, never eagerly in-request. One change, two constants.
> Does **not** fall back to `warm=` — C1 is unfixed and the warm path writes to a different partition.
> C1 is latent (no client sends `X-Brand-Id`), but this batch must not be closed out on the assumption
> that warming covers it.

**D6** — `chat.py:522`. Pass a `since` bound to `cached_rows`. **3 lines / 2 files** —
`cached_rows` (`fetch_cache.py:113`) has no `since` param yet; `_repo.load_insight_rows` already
accepts one, so it is a passthrough param plus the call site.

**D7** — `chat.py:544` → ingest path. Same function as D6; open it once.

**Targeted tests:** a cold-account chat completes inside the HTTP timeout; a rate-limit `MetaError`
from the context build returns 429 (not 500) on both `/chat` and `/chat/stream`.

---

## 5. Batch 3 — cleanups (11) 🟢

**B4** `brain.py:41` delete dead `pct`/`direction` (−8; `_direction`'s parameter currently shadows the
module-level `pct`) · **H1** `history.py:169` compute `mom` at render, not at save · **E1**
`repository.py:353` bulk insert instead of per-row `s.add` · **E2** `repository.py:400` `executemany` ·
**G1** `store.py:31` extract `fetch_dataset_for_preset` (−5; kills the `/ingest` vs
`/insights?source=live` drift) · **E3** `apify_ads.py:213` flip `keep_raw` default to `False`
(parameter kept as a scrape-time escape hatch) · **E5** `api.py:180` read name/currency from the stored
row.
> E5 needs no runtime measurement — the redundancy is decidable by reading: `api.py:181` calls
> `list_accounts` unconditionally per `_cached_dataset`, and `meta_live.py:287` calls it again inside
> every `fetch_envelope`. Upgraded from PLAUSIBLE to confirmed-by-inspection.

**G2** `chat.py:191` — the only item that *adds* lines (~15 of fixture test). Asserts the pandas and
dict aggregation paths agree; insurance against four-copy drift.

**G4** `meta_live.py:134` — ~2 lines, strictly additive: warn when `next` exists without `after`.
Self-answering — production resolves the PLAUSIBLE verdict within days.

Net: roughly **−10 production lines, +15 test lines**.

**Known triple-touch, accepted:** `store.py` is opened in Batch 1 (A3), Batch 2 (D7's ingest-side
prune) and Batch 3 (G1). Folding them would couple a merge-gate commit to a cleanup; the repeat is
cheap and deliberate.

---

## 6. Parked — trigger: ai-layer gains a public domain

**F1** (competitor refresh double-bills, ~$0.50/sweep) · **F2** (discovery cost logged at an invented
price) · **C2** (`_shopify_context` cross-tenant leak) · **E4** (serial scrape, worst case ~64 min).

All four sit behind `/competitors/*`: no proxy route, no public domain. Deferred on **deployment
topology, not code** — every one goes live the day ai-layer gets a domain. Re-gate as a unit on that
trigger, not individually.

**C1** parks separately with the multi-tenancy task; decided approach (options 1 + 4) is recorded in
the register's §3.

**One live item inside the parked group:** E3's *read* tax is live for any account with competitor data
from a CLI run — `stored_block` runs on every `/chat`. That is why E3 sits in Batch 3 and the rest of
the group is parked.

---

## 7. Gates

Test Invariant per CLAUDE.md before every commit. Run pg tests with the preflight `SELECT 1` +
transient-retry, and disambiguate any single pg failure by isolated rerun before calling it a
regression.

`creative_v2` reports its own ai-layer suite at **624/7** — reconcile at merge and record the
post-merge baseline.

---

## 8. Out of scope

`rnd_mine/` entirely — dropped in the merge commit, four recorded defects unaddressed by design.
The connector service — all ten requirements are forward-looking; `source="connectors"` is opt-in and
no batch here touches it.
