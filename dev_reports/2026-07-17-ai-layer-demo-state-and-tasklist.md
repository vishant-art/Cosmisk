# ai-layer Demo — State & Task List

> Written 2026-07-17. Branch `feat/ai-layer-adapter`. Single-tenant demo (Pratap Sons).
> **Priority: the ai-layer demo works perfectly. Everything else is deferred — see Task List.**

---

## 1. TL;DR — the demo works

Verified end-to-end on 2026-07-16 against live Meta data:

```
/insights?source=store  -> 200 in 2.1s
  Pratap sons · INR · spend 972,950 · revenue 2,917,371 · blended ROAS 3.00 · 634 purchases

/chat?source=store      -> 200 in 7.0s
  "The campaign with the worst ROAS is DSG_ABO_ROAS_REELS_IND_7/14/26 at 0.62.
   It spent 4001 for only 1 purchase, generating only 2495 in revenue."
```

Specific campaign · causal · actionable — clears the CLAUDE.md quality gate.

| Component | State |
|---|---|
| Meta OAuth (per-user) | WORKING — `anant@demo.com`, token valid to **2026-09-14** |
| `ai_layer` schema | Created (alembic `0001`), own `ai_layer` Postgres schema |
| `ai_layer.facts` | 125 rows, 25 campaigns, 2026-07-09..07-15 (`last_7d` ingest) |
| ai-chat (Python RAG) | WORKING (~7s, OpenRouter) |
| ai-layer insights | WORKING (~2.1s) |
| Neon DB | New branch `ep-flat-fire-aktc87fh`, 80 public tables, 4/4 drizzle migrations |

**The demo path is Anthropic-free.** ai-layer runs on OpenRouter; creative on FAL.

---

## 2. How to run locally (Docker is NOT available)

`./dev up` fails — Docker Desktop WSL integration is off. Run natively; everything is installed.

```bash
# ai-layer  (:8077)  — NOTE: .venv, not cos/ (only .venv has sqlalchemy)
cd apps/ai-layer && ../../.venv/bin/python -m uvicorn ai_layer.api:app --host 0.0.0.0 --port 8077 --reload

# API       (:3000)
cd apps/api && npx tsx watch src/index.ts

# web       (:4200, HTTPS self-signed)
cd apps/web && npx ng serve --host 0.0.0.0 --port 4200
```

Open **https://localhost:4200** (https — `angular.json:91` sets `ssl: true`).

### Gotchas that cost hours — do not rediscover
- **`apps/api/.env` is a symlink → root `.env`** (created 2026-07-16). `config.ts:1` uses
  `dotenv/config`, which reads `.env` from **cwd** (`apps/api`), so without the symlink the API
  sees *none* of your config and silently falls back to defaults (incl. the OLD Meta app id).
- **Port 3000 conflict:** `next-server` (an unrelated Next.js app) was observed holding `:3000`.
  Kill it or the API gets `EADDRINUSE`.
- **`env-config.ts` is generated + gitignored.** `./dev` runs `npx ng serve` directly, which
  **bypasses the `prestart` hook**, so `apply-env.mjs` never regenerates it. If Meta OAuth is
  mysteriously disabled, check this file — it had `META_OAUTH_ENABLED = false` and the OLD app id,
  which silently no-op'd the Connect button (`meta-oauth.service.ts:56` returns early).
  Regenerate: `cd apps/web && node scripts/apply-env.mjs`
- **`.env` changes need a manual restart.** `tsx watch` watches `.ts`; `uvicorn --reload` watches
  `.py`. Neither notices `.env`. A stale process silently keeps using the OLD DB host.
- **Accept the self-signed cert** at https://localhost:4200 *before* Meta OAuth, or the popup dies
  on the cert interstitial.
- **"Not connected" badge ≠ dead token.** `meta-oauth.service.ts:49-51` sets `disconnected` on ANY
  status-call error, including a 401 from an expired session JWT. Re-login first; check the DB before
  concluding the token died.
- Logs: `tail -f /tmp/cosmisk/{api,ai-layer,web}.log` (symlinks; session-scoped — recreate if stale).

---

## 3. THE key finding: Meta Development Access tier

The app runs on `ads_api_access_tier: "development_access"` (see the
`x-business-use-case-usage` response header). This is an **access tier**, NOT a permissions/scopes
setting — adding scopes to the Meta app does nothing. Advanced/Standard Access requires
**App Review + Tech Provider verification** (weeks).

**The misleading errors.** When the rate budget is exhausted Meta returns:
- `code=1 "Please reduce the amount of data you're asking for, then retry your request"`
- `code=1 subcode=99 "An unknown error occurred"`

Both point at *query size*. **Both are lies.** The real cause is an empty rate budget.

**The actual culprit: `MetaWarmup`** (`services/meta-warmup.ts`, cron at `routes/agent.ts:124`,
`0 */2 * * *`). It fires ~120-273 read-only calls **per user every 2 hours** — deliberately using
the most expensive shapes (breakdowns by age/gender/country/publisher_platform, ad-level insights,
`/previews`, `/reachestimate`) across up to 5 accounts. It exists to manufacture ~1,500 calls/day of
API volume for **Meta App Review**; its own comment (line 6) says calls are varied so usage
*"looks like a real analytics app, not a bot."*

> **Risk worth stating:** synthetic traffic shaped to look organic is a real hazard to the app
> itself. Meta pattern-analyses usage during review; engineered volume, if recognized, is grounds
> for rejection. When Advanced Access is actually pursued, genuine usage from real connected
> tenants is the path that survives scrutiny.

**Measured evidence (2026-07-16/17, `act_1738503939658460`):**

| Test | Result |
|---|---|
| `last_30d`, unchunked | 3 paginated pages, ~1051 rows — **intermittent**; failed repeatedly after warmup ran |
| `last_7d` | 1 page, 125 rows, ~15s — reliable |
| **4 × ~7d `time_range` chunks** | **all single-page (`next=False`), ~1018-1051 rows total, ~65s, budget 0%** |

One call read `total_time: 19%` right after the warmup burst; **eight calls later read 0%**.
That proves the budget is a decaying window and **the warmup — not the query — drained it.**
An earlier hypothesis that `limit: 500` was too large was **tested and disproven** (page 1 always
succeeded at limit=500).

---

## 4. Empty-store trap (why "ai layer failed to load" happened)

`apps/ai-layer/ai_layer/api.py:105-108`:

```python
if source == "store":
    ds = store.load_dataset(account_id)
    if len(ds) > 0:
        return ds
return ml.fetch_dataset(_need_token(token), ...)   # <-- falls through to LIVE
```

With an **empty store**, `source="store"` silently falls through to a ~60s live Meta pull, which
blows the API's `CHAT_TIMEOUT_MS` (`services/ai-layer-client.ts`) → 502 → *"ai layer failed to
load"*. **One successful ingest breaks the cycle** — store-backed reads are 2-7s.

To re-fill the store (bypasses the API's ingest timeout):
`POST http://localhost:8077/ingest/act_1738503939658460?preset=last_7d`
with headers `X-API-Key` and `X-Meta-Token` (decrypt from `meta_tokens`; AES-256-GCM,
`iv:authTag:ciphertext` hex, key = `TOKEN_ENCRYPTION_KEY` right-padded into 32 bytes).

---

## 5. Demo-critical remaining

- [x] **DONE 2026-07-17 — `MetaWarmup` cron removed** (`routes/agent.ts:123-130`). It fired on
      **even hours** and would have throttled Meta mid-demo. See §5.1 for the exact record.
- [ ] **Re-login** to clear the "not connected" badge (expired JWT; the token is valid).
- [ ] **Decide the Refresh button.** It calls `preset=last_30d`
      (`ai-layer-client.ts:50,185,240` → `opts.preset ?? 'last_30d'`; `api.py:129,227`
      `Query("last_30d")`; `api.py:163` chat's live fallback). With the warmup gone, `last_30d`
      may work as-is — **untested** (the ai-layer died before the test ran). Either verify it, or
      default to `last_7d`. Avoid pressing Refresh on stage until this is settled; the store is
      already filled, so ai-chat does not need it.

### 5.1 Record: the `MetaWarmup` cron removal (2026-07-17)

**Removed:** the only cron touched. `routes/agent.ts` — the `cron.schedule('0 */2 * * *', ...)`
call that ran `runMetaWarmup`, replaced by a comment block at `agent.ts:123-130` explaining why.
The startup log line that advertised `warmup every 2h` was corrected in the same edit.

**Deliberately NOT touched:** the other 10 crons still schedule as before (`agent.ts` watchdog /
briefing / outcomes / reports / content / sales / decay, `autopilot.ts:22`, `automations.ts:533`,
`reports.ts:615`). Killing those is §6.2, deferred.

**Kept alive:** `runMetaWarmup` itself and its import — still used by the manual admin route
`POST /meta-warmup/run` (`agent.ts:373`, admin-only, rate-limited 2/min). Only the *automatic*
2-hourly burst is gone; a deliberate warmup is still one call away.

**Why:** on `development_access` it shared the `ads_insights` rate budget with the product
(~273 calls/run of the most expensive shapes), so Meta rejected real ingests with a misleading
`code=1 "reduce the amount of data"`. Full evidence in §3.

**Cost of removal:** pauses App Review call-volume accrual — moot while multi-tenancy is deferred.
**To reverse:** un-comment the block; re-enable only alongside Advanced Access.
**Verified:** `tsc --noEmit` baseline-only (`billing.ts:4` stripe).

### 5.2 Demo scope: the whole platform, with every AI service served by Python

The demo shows the **whole platform working in synergy** — `apps/web` → `apps/api` → `apps/ai-layer`.
The TS layer stays in the demo as the product surface. What changes is *who does the AI work*:
**every AI service is fulfilled by the Python ai-layer, never by TS AI code**, which is slated for
retirement (§6.2). So the rule for each TS route is: it must delegate to the ai-layer, or it is a
demo risk.

Traced 2026-07-17 — the AI-serving path per route the UI actually calls:

| UI call | TS route | Who serves the AI | Demo-safe? |
|---|---|---|---|
| `generate()` | `creative-studio.ts:114` | ai-layer — `:151` `creativeGenEnabled()` picks `processGenerationViaAiLayer` (`:513+`, zero `createMessage`) | ✅ delegates, Anthropic-free |
| `scoreCreative()` | `creative-studio.ts:227` | `creative-scorer/scorer.ts` — deterministic, no LLM at all | ✅ no AI vendor |
| `getGeneration()` / `getGenerations()` / `getAccuracy()` | `:165` / `:204` / `:283` | DB reads only | ✅ |
| ai-chat / insights | `ai-layer-client.ts` | ai-layer (OpenRouter) | ✅ delegates |
| **`analyzeUrl()`** | **`creative-studio.ts:43`** | **TS-side Anthropic** — `createMessage` at `:72` | ❌ **violates the rule** |

**The one live gap: `/analyze-url`.** It is the only UI-reachable creative route still calling
Anthropic in TS (`createMessage`, `:72`). With no Anthropic recharge it will fail. It is not
covered by the `creativeGenEnabled()` delegation, so nothing routes it to Python today. Either
avoid that button on stage, or port it to the ai-layer. (`:338`/`:435` also call `createMessage`,
but only inside the legacy `processGeneration` — dead while `AI_LAYER_URL` is set.)

**The second gap: the UGC video track has no front end.** Per
`creative-studio-ops-handoff.md` #10, `direction` / `n_shots` / creator / seconds and
`/creative/video/plan` + `/video/generate` exist **only** in Python;
`creative-gen-client.ts` wraps just `/creative/generate` + `/jobs`. So in a
platform-synergy demo the video track is **unreachable from the UI** — static ads only, unless
the TS wiring lands (`videoPlan()`/`videoGenerate()` forwarding + a web input & plan→quote→generate
flow). Reachable meanwhile only by direct API call or `/docs`.

Driving Python directly (for checks or as a fallback) needs an `X-API-Key` header —
`AI_LAYER_API_KEY` is set, so `require_api_key` enforces; it no-ops only when the key is unset.

### 5.3 Persistence for creative studio — what "the object store" actually is

**There is no object store, by design.** R2 was evaluated and **dropped**
(`creative-studio-architecture-and-integration-state.md:318-320,335`). The model is split:

| What | Where | Status |
|---|---|---|
| Metadata (jobs, variants, teardowns) | Neon `ai_layer` schema | ✅ `creative_jobs` (0001), `creative_variants` (0002), `creative_teardowns` (0003) |
| Bytes (images/video/audio) | local FS, `CREATIVE_OUTPUT_DIR` | ✅ defaults to `ai_layer/data/creative_output` (gitignored; 33 prior runs) |

**Applied 2026-07-17:** alembic `0001 → 0003` on the demo branch. Both migrations are purely
additive (`create_table` + `create_index`; `drop_table` only on downgrade). This mattered: the
architecture doc §3.2.3 warns that without 0002+0003 "the loop and the graph never persist,
**silently**" — no error, just missing rows. Verified by querying `information_schema`, not by
trusting the alembic stamp (`alembic.ini:19` sets root logger `WARN`, so runs print nothing).

**Known gaps (not demo-blocking, local):**
- Assets are served by `app.mount("/creative/assets", StaticFiles(...))` at `api.py:286-288`,
  which does **not** inherit the `require_api_key` dependency that `include_router` applies —
  generated assets are readable unauthenticated. Real issue only once this is exposed publicly.
- `FAL_ADMIN_KEY` is unset → `fal_billing.affordable()` returns `enabled: False` and the
  pre-spend balance guard is a **graceful no-op** (`pipeline.py:702-718`). It guards only the
  paid video-render path. Set it to get the pre-spend refusal back.
- On a container (Railway), `CREATIVE_OUTPUT_DIR` must point at a mounted volume or every asset
  dies on redeploy — including ones already referenced by Neon rows. Local disk is fine.

---

## 6. TASK LIST (deferred — not demo-blocking)

### 6.1 Ingest redesign — fits dev tier (user's design, validated)
- [ ] **Add `time_range` support to `fetch_envelope`** (`meta_live.py:127`) — currently accepts
      `date_preset` only, so "days 8-14" is inexpressible. This one addition unlocks both the
      chunked backfill and 45-day retention. Small change.
- [ ] **First-connect backfill:** 4 × ~7d chunks (30d). Proven: single page each, ~65s, 0% budget.
- [ ] **Steady state: re-pull a TRAILING 7-day window** — *not* 1 day.
      **Why this correction matters:** `ATTRIBUTION_WINDOWS = ["1d_view", "7d_click"]`
      (`meta_live.py:53`) means Meta attributes conversions **retroactively up to 7 days**. A
      1-day-only pull permanently under-reports ROAS for every past day. `ai_layer.facts` PK is
      `[brand_id, platform, account_id, campaign_id, date]` and UPSERTs, so re-pulling a trailing
      window self-corrects late-landing conversions at the same 1-page cost. `store.py`'s
      "trailing-window UPSERT semantics" docstring suggests this was always the intent.
- [ ] **Retention:** `DELETE FROM ai_layer.facts WHERE date < now() - interval '45 days'`.
- [ ] *(Long-term)* Meta's documented answer for heavy pulls is the **async insights job**
      (`POST /insights` → poll `report_run_id`). More code than chunking; revisit only if chunking
      proves insufficient.

### 6.2 Kill the TS cron/AI layer (user decision: no Anthropic recharge)
- [ ] Remove/disable all **11 crons**:

| Cron | Schedule | Stops |
|---|---|---|
| `agent.ts:124` MetaWarmup | `0 */2 * * *` | App Review volume — **the budget hog** |
| `agent.ts:33` Watchdog | `30 1,7,13,19 * * *` | recommendations/predictions → `/intelligence/*` goes static |
| `agent.ts:48` Briefing | `35 1 * * *` | `/ai/briefing` |
| `agent.ts:69` Outcomes | `0 2 * * 1` | prediction verification |
| `agent.ts:80` Decay | `0 3 * * 0` | memory decay |
| `agent.ts:91/102/113` Reports/Content/Sales | Tue/Wed/Thu `0 2` | agent content |
| `autopilot.ts:22` Autopilot | `0 */4 * * *` | new alerts |
| `automations.ts:533` Automations | `0 */4 * * *` | automation runs |
| `reports.ts:615` Weekly Reports | `0 7 * * 1` | weekly reports |

  **Demo impact: none.** The dashboard polls `/autopilot/alerts` + `/unread-count` every minute;
  those are plain DB reads and keep returning 200 — they just stop gaining rows.

- [ ] **Anthropic-dependent modules that die without credits** (decision: do NOT recharge):
      `routes/ai/claude.ts` + `routes/ai/intent.ts` (**ai-studio `/ai/chat`**),
      `boot/meta-creative-routes.ts` (**`/creatives/batch-dna`**), `routes/creative-studio.ts`,
      `routes/content.ts`, `routes/score.ts`, `routes/reports.ts`, `routes/google-ads.ts`,
      `routes/tiktok-ads.ts`, `audit/audit-agent.ts`, `services/ad-watchdog/reasoning.ts`,
      `services/{content,report,sales}-agent.ts`, `services/creative-strategist.ts`,
      `services/sprint-planner.ts`, `services/agent-memory.ts`, `services/job-queue.ts`,
      `services/llm-gateway.ts`.
      **SAFE:** `services/ai-layer-client.ts` — imports an Anthropic *type* only (line 8) and is a
      *"drop-in replacement for llm-gateway `createMessage` that routes to the Python ai-layer"*
      (line 310). Also note this silently kills **audits** and **Creative Studio** — fine if not
      demoed.
- [ ] Scrap `ai-studio` per `dev_reports/SCRAP_LIST.md` (ai-chat is the KEEP). Post-demo.

### 6.3 Security (1-tenant public demo)
Only internet-facing holes matter at one tenant:
- [ ] **G-1 `/intelligence/*` — 14 routes, ZERO auth** (`routes/intelligence.ts`, registered
      `index.ts:216`; `grep -c preHandler` = 0). Public data leak. Add
      `preHandler:[app.authenticate]`, replace path-param `clientId` with `request.user.id`. ~1h.
      **Highest priority whenever the app faces the internet.**
- [ ] **G-5 OAuth `state` = raw session JWT** (`meta-oauth.service.ts:58`), never validated
      (`auth.ts` ignores it). Leaks the JWT into Facebook's URL chain + CSRF-open. Use a
      server-stored nonce. ~2h.
- [ ] **G-21 `AI_LAYER_API_KEY` no-ops when unset** (`api.py:50` — `if config.AI_LAYER_API_KEY and ...`).
      Verify it's set on both services; fail closed.
- [ ] **G-7 `TOKEN_ENCRYPTION_KEY` hardcoded fallback** at `audit/index.ts:378`. Remove it.
- [ ] **G-2 hardcoded `vishant@gmail.com`** at `audit/index.ts:354` — audits run on a dev's creds.
      That user does NOT exist in the new Neon branch, so audits would no-op.
- [ ] Deferred with multi-tenancy (safe at exactly 1 tenant): G-3 ai-layer IDOR, G-6 `audits` has
      no `user_id`, G-4 `brand_id or account_id` collapse (`repository.py:24`), G-10/G-12 connector
      global-env creds, Shopify HMAC (`shopify.ts:135`), G-14 Google `LIMIT 1`.

### 6.4 Multi-tenancy — DEFERRED ENTIRELY post-demo
Demo is strictly 1 tenant. Blocked on Meta **Advanced Access** (App Review) regardless.
`tenant_ad_accounts` join + backfill · `assertAccountBelongsToUser` · X-Brand-Id threading A→B ·
connector `CredentialProvider` · Meta token refresh cron (60d > demo horizon) · ai-layer
`brand_id` required. NOTE: **Google Ads ai-layer consumption is the ai-engineer's — do not touch.**

### 6.5 Deployment (deferred — demo runs locally)
- [ ] Vercel: `API_BASE_URL` is **build-time** (`apply-env.mjs` prebuild) — set for all envs +
      redeploy **without cache**; grep build log for `[apply-env]`. Disable Deployment Protection
      (the "CORS/manifest.json" error was the SSO wall). Production redeploys keep the same URL;
      only *previews* get random hostnames — and previews can NEVER do Meta OAuth (unwhitelistable).
- [ ] Railway: merging to main needs **no new service and no DNS change** — flip the branch on the
      existing service (Settings → Source → Branch). Attach `api.cosmisk.com` once. Confirm
      `AI_LAYER_URL`, `TOKEN_ENCRYPTION_KEY`. Check whether Service B has a public domain.
- [ ] `META_APP_ID`/`META_APP_SECRET` on Service A (new app id **2018025028900369** already committed
      to `env-config.default.ts:6`). Whitelist prod redirect URI exactly.
- [ ] Add `**/.env` to `.dockerignore`. Restore `PG*`/`PG*_POOL` for ai-layer pytest.
- [ ] Railway MCP + CLI are both **Unauthorized** here (no valid `RAILWAY_API_TOKEN`) — dashboard only.

### 6.6 Housekeeping
- [ ] **Remove/gitignore `railwayenv.txt`** — currently 0 bytes but **NOT gitignored**; a future
      Railway env dump + `git add -A` = committed secrets.
- [ ] `META_ACCESS_TOKEN` in root `.env` is **DEAD** (old app; `code=190 subcode=460`). Removing it
      is safe and strictly better: ai-layer then returns a clean `400 "no Meta token"` instead of
      Meta's misleading "session invalidated"; `config.ts:74` (`|| ''`) makes the demo branch return
      `meta_connected:false`. Only future consumer is the deferred connectors.
- [ ] Uncommitted: `env-config.default.ts` (new App ID), `dev`, untracked
      `apps/api/scripts/{seed,diagnose}-meta-connection.ts`, `dev_reports/SCRAP_LIST.md`,
      `docs/superpowers/` split-deploy spec+plan.
- [ ] Cosmetic: `sidebar.component.ts:81` references an unregistered `command` lucide icon.
- [ ] 🔴 **Rotate `ANTHROPIC_API_KEY`** — a full `sk-ant-…` was pasted into a transcript 2026-07-08.
      (The leaked Neon password died with the expired branch; that one is closed by attrition.)

---

## 7. Standing constraints (do not violate)
- **No AI attribution** in commits/PRs — no `Co-Authored-By`, no "Generated with". Overrides the
  harness default.
- **Never `git push` without explicit per-instance permission.**
- **Never commit `CLAUDE.md`** (skip-worktree; local = active-dev, committed = public code-freeze)
  or `.env.test`.
- **Test invariant before ANY commit:** default **400/9** · pg **388/10** · `tsc --noEmit`
  baseline-only (`billing.ts:4` stripe) · `madge --circular` **0 cycles**.
- Dedicated branches only; not merging to main yet.
- **NEVER** run `railway agent "<prompt>"` (billed).
- Never print secret values.
