# Creative Studio — session log, 2026-07-22

Branch `improve/creative`. Goal: make Creative Studio honest, ai-layer-only, and winning-ads-first; then make the flow reviewable without a backend. No push; no AI attribution.

## What shipped (9 commits, `cd02b48..HEAD`)

### 1. Honesty fixes
- **`1d5407c` — ground runs by default.** The apps/api client overrode the ai-layer's `ground:true` default to `false` on every run (`creative-gen-client.ts:81`), so nothing grounded on real winners while the UI showed grounding pills. Now defaults to the ai-layer's honest value.
- **`07a603d` — drop fabricated 5-dim score + predicted-ROAS panel.** The ai-layer has no 0–100 scorer and no ROAS model; the panel was fed by the legacy TS scorer and is dark on the ai-layer path. Removed from `output-gallery`; kept the real per-run evidence (QA-rejected count + run cost).

### 2. ai-layer-only — TS creative logic disconnected (preserved, not deleted)
- **`18ca8c6` / `4d9eff0`.** Creative Studio serves only the ai-layer creative module; apps/api is a thin proxy. Disconnected (commented out, on disk): `/analyze-url`, `/score`, `/accuracy`, the `processGeneration` legacy path (generate is now ai-layer-only, **503** if unconfigured — no TS fallback), and the frontend service calls (`analyzeUrl`/`scoreCreative`/`getAccuracy`). Legacy-UGC list removed from the entry only (`UgcService` stays for onboarding + project-detail).
- Full inventory + reconnect steps: **`DISCONNECTED_TS_MODULES.md`** (same folder). Memory: `creative-studio-ai-layer-only.md`.

### 3. Brief-less "generate from winners" (campaign mode) + hardening
- `/generate` accepts no brief when a Meta account is present; **token-gated → 400** if no real Meta token (else the ai-layer silently falls back to bundled mock data); `brief_json` stored null; poll cap raised to 12 min for the heavier first campaign-mode run.

### 4. Winning-ads-first entry redesign
- **`37f8d5f`.** Replaced the manual brief form + aspect-ratio chips with a "Making from winning ads" hero: grounding pill, optional directions, an Output choice (Static / Video / Both), and a "Generate from winners" button gated on a *connected* (not expired) Meta account. Dropped the hardcoded brand label + the legacy-UGC list; collapsed the proven panel; capped history at 5.
- **`ccfd279` — null-proof + video intent.** Campaign-mode runs have a null brief; the detail header/brief card now guard it (show a "grounded on your winning ads" note). The Output choice rides through as `?plan=video|both` → the video planner shows immediately for Video/Both, otherwise behind a **$0 reveal**. The planner never auto-renders (video stays quoted-before-pay).

### 5. Preview + walkthrough scaffolding (localStorage-gated, remove before merge)
- **`efad362`** — `/app/ugc-studio/gen/preview` renders banner-marked sample data so the run/results/planner screens are viewable without a backend.
- **`071ce6c`** — an HTTP interceptor (active only when `localStorage.cosmisk_mock==='1'`, set by the preview `enter.html`) returns timed sample responses for the whole flow (grounded → generate → streaming progress → results → plan → quote → render → QA → publish → harvest). Inert in any real deployment. The one thing it can't fake: rendered video bytes (`<video src>` is a native fetch, not HttpClient).

### 6. Dormant surfaces — marked (inactive) + dead CTAs re-pointed
- **`3bc67cc` / `f274de1`** — Creative Cockpit, Director Lab, Creative Engine tagged **(inactive)** in the sidebar, command palette (page entries), and topbar titles + dimmed. **Named page-entries stay inactive** (they name the dead page).
- **`46fcabc`** — *functional* CTAs/actions that targeted a dead surface were re-pointed to the live replacement:
  - Creative **generation** (dashboard "Creative Engine"/"Create Brief" CTAs, quick-action tile, command-palette "Generate Ads from Winners" action, welcome-tour "Creative Engine" step) → **Creative Studio** (`/app/ugc-studio`).
  - Creative **insight** (Creative Cockpit KPI cards, "Top Creatives" link, DNA tour step) → **AI Chat** (`/app/ai-chat`).

> **Provisional routing — `(ai-chat for now)`.** The creative-insight destinations point to **AI Chat as a stopgap** (Creative Cockpit's real insight home isn't rebuilt). These are labeled **`(ai-chat for now)`** in the UI (dashboard "Ask what's working" link, the Active Creatives KPI card, the welcome-tour step) so the temporary routing is explicit. Revisit when a dedicated creative-insight surface exists.
> **ROAS KPI → Analytics** (not AI Chat): a pure metric belongs in Analytics (`/app/analytics`), per the user. Revenue/ROAS KPI cards both route there.

## Gates
- apps/api `tsc --noEmit` baseline-only (`billing.ts:4` stripe) · apps/api suite **436 pass / 2 skip** · apps/web `ng build` clean (3 pre-existing NG8107 warnings, not ours).

---

# 2026-07-23 — whole-branch container integration test + fixes

Brought the whole branch up in containers (`docker-compose.sim.yml`: web nginx :8080 → api :3100 → ai-layer :8000, R2 on via `STORAGE_BUCKET`, FAL on) and drove a real **campaign-mode** run through the browser. Scaffolding was first **stripped to commented-out form** (`43139a2`) so the frontend talks to the real backend; re-enable by uncommenting the `SCAFFOLDING` markers.

**Standing rule set + saved to memory (`approval-before-any-change`):** get explicit approval before ANY change (code/commit/migration/deploy); use ponytail + code-review-graph.

## Blockers found while driving a live static run (each diagnosed before fixing)
1. **DB `brief_json` NOT NULL → 500** on brief-less insert. **Fixed:** drizzle migration **`0005_natural_tony_stark.sql`** (`ALTER COLUMN brief_json DROP NOT NULL`), applied to Neon; schema `pg-schema.ts:512` now nullable. All readers verified null-safe. Commit `ef03b7c`.
2. **Concept-gen JSON parse crash** — `story_brain.generate_concepts` → `brain.chat_json` (brain.py:39) did a near-naive `json.loads` on a `google/gemini-2.5-flash` response that came back malformed. **HELD** (user deferred): proposed fix = retry 1–2× on `JSONDecodeError` + tolerant `{…}` extraction, protects all `chat_json` callers.
3. **Meta grounding `code=1 subcode=99`** in `meta_live.fetch_envelope` (ads_insights). Matches the known **dev-tier rate-budget → misleading code=1** note; **cleared on retry** (budget replenished). Robustness follow-up = chunked `time_range` backfill + retry on `code=1` (per `[[meta-dev-tier-rate-budget]]`).
4. **Generated images blank / broken thumbnails.** Root cause was **asset-URL topology**, not blank renders — the real PNGs (1.2–1.6 MB) were on the ai-layer and R2 served them (302→R2→200 verified). The api handed the browser a relative `/api/creative-studio/asset/…` path that resolved to the **web origin** (nginx/Vercel), which doesn't serve it. **Fixed:** `resolveAssetUrl()` rebases asset paths on `API_BASE_URL` so the browser reaches the api, which 302s straight to R2 (prod, $0 egress) or byte-proxies (dev/sim). Commit for the fix in `apps/web`. **Confirmed: images now load.** This bug also affected prod (`API_BASE_URL=https://api.cosmisk.com` cross-origin), not just the sim.

## Result
Full campaign-mode path validated end-to-end in containers: winning-ads-first entry → brief-less generate → DB insert → grounding (Meta, real token) → brand kit → concepts → 6 static renders → **images load from R2** → "Plan a UGC video · $0 to quote" reveal. The redesign's honest failure-reporting (milestone rail, verbatim Activity error, campaign-mode note) also verified on the earlier failed runs.

---

# PENDING TASKS (all, as of 2026-07-23)

## Creative Studio branch (`improve/creative`) — remaining
1. **R2 thumbnails for images + videos** (NEXT). ai-layer: on completion, downscale each image (~512px) + grab a video poster frame → upload to R2 `{job}/thumbs/…` → add `thumb_url`/`poster_url` to the manifest. Frontend: grid uses `asset(img.thumb_url || img.image_url)`, full-res on open/download, `<video [poster]>`. api unchanged. $0 fal. **Needs approval before building.**
2. **Concept-gen JSON robustness** (ai-layer `brain.chat_json`) — retry + tolerant parse (blocker #2 above, held).
3. **Meta `code=1` grounding robustness** (ai-layer `meta_live`) — chunked `time_range` backfill + retry on transient code=1 (blocker #3).
4. **Run-cost accuracy** — displayed cost (e.g. $0.09) appears to exclude fal image-render costs; verify the aggregation counts fal + OpenRouter.
5. **Strip preview scaffolding before merge** — currently commented-out (`43139a2`): mock interceptor + registration, `gen/preview` handler/banner, entry preview link. Decide delete vs keep-commented; the interceptor file + sample consts still on disk.
6. **`variant_axis`/`variant_values` never leave the browser** — variants A/B feature not wired end-to-end (feature gap).
7. **Deploy/merge to `main`** — whole-branch (web+api+ai-layer) via PR → main → Vercel + Railway. Prereqs: strip scaffolds, green gates, **apply migration `0005` to prod Neon**, rollback plan ready. No push without per-instance permission.
8. **`finishing-a-development-branch`** — proper close-out for `improve/creative`.
9. **Paid full sim** — one video render (~$4.78 real fal) to validate the paid path. User's call.

## Durable carry (from `[[pending-tasks]]` memory, non-creative)
- Docker rehearsal + push (#29 done/green); #31/32/33/34/48 pending; frontend↔ai-layer gaps; user-actions #46/39/40/41 + rotate the leaked test-branch password.

---

# 2026-07-24 — ponytail cuts + R2 thumbnails + CORP fix (3 commits, gates green, no push)

Branch `improve/creative`, now 227 ahead of main. Commits: `ad95a98` (ponytail), `2b6ee9a` (thumbnails), `acd99dd` (CORP). apps/api `tsc` baseline-only; creative-gen-client tests 7/7; ai-layer creative service+editor 29 passed; thumbs.py self-check ok; `ng build` clean.

## Ponytail audit → applied (`ad95a98`)
- **#1 `creative-gen-client.ts`** — one `aiFetch(method, path, label, opts)` helper collapses the 7 uniform calls (videoPlan/videoGenerate/markPublished/learn/getPrior/getGraph/voicePreview); dropped `jsonHeaders`. `startCreativeGen`/`getCreativeJob` keep their richer network-catch + `{detail}`. **No-timeout preserved** on the two long LLM video calls (a naive default would have broken them).
- **#2 `generation-detail.component.ts`** — `swatch`/`PREVIEW_GEN`/`PREVIEW_JOB` were referenced only by commented-out `/gen/preview` scaffolding; line-commented so the whole preview path re-enables as one unit instead of shipping dead module consts.

## R2 thumbnails (`2b6ee9a`)
- **ai-layer** `creative/thumbs.py` — `image_thumb` (PIL ~512px JPEG) + `video_poster` (bundled-ffmpeg first frame); both already deps, **$0 fal**. `service.py` `_add_thumbs`/`_add_poster` run **fail-open** before the R2 publish in both job paths (a bad thumb never fails a run); `thumbs/*.jpg` joins the delivered set → R2 mirrors them; `thumb_url`/`poster_url` added to the manifest.
- **api** — `thumb_url`/`poster_url` typed and proxied through `proxy()`.
- **web** — grid `<img [src]>` = `asset(img.thumb_url || img.image_url)` (full-res stays on open/download); `<video [poster]>` with a **subdir-preserving rebase** (a bare basename would drop the `thumbs/` prefix and 404).
- Verified live in the sim: thumb **27 KB vs 755 KB** full-res, `302 → R2 → 200`.

## CORP bug + fix (`acd99dd`)
- **Symptom:** thumbs fetched (all `302`) but `net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin` in the console → blank grid.
- **Root cause:** `@fastify/helmet` (`index.ts:88`) sets `Cross-Origin-Resource-Policy: same-origin` globally; the `/asset` `302` is cross-origin (web `:8080` vs api `:3100` in sim; `cosmisk.com` vs `api.cosmisk.com` in prod) → the browser blocks the `<img>` embed. R2's response has no CORP (fine).
- **Fix:** per-route `reply.header('Cross-Origin-Resource-Policy','cross-origin')` on the `/asset` route only; every other endpoint keeps helmet's strict `same-origin`. The per-route header wins over helmet's global hook (no `onSend` fallback needed). Confirmed by curl. **This was a pre-existing prod bug** — full-res in-grid embeds hit it too.

## Backfill for historical runs (data only, no code)
- 3 completed runs (`2d3dc29c`/`8aaf7e0a`/`22be8608`) predated the feature → no `thumb_url`. Generated **18 thumbs** from the R2 originals → uploaded `{job}/thumbs/`; patched `studio_outputs.output_json` to add `thumb_url` (**5 rows / 30 images**). $0. Scripts kept in scratchpad (`bf_thumbs.py`, `bf_patch.cjs`). Note: the `studio` reads are frozen `output_json` (not re-fetched from ai-layer), so a backfill must patch both R2 **and** the stored JSON.

## Prod determinism (CSP check)
- `vercel.json` sets `X-Frame-Options`/`X-Content-Type-Options`/`Referrer-Policy` but **no CSP and no CORP**; no CSP anywhere in `apps/web`. Prod chain = web (no CSP) → api `/asset` (CORP now `cross-origin`) → R2 (no CORP) → renders. **Deterministic at the app layer**; residual risk is infra only (Railway/CF stripping/adding CORP), unverifiable pre-deploy.

## New findings logged (not fixed)
- `output-gallery` `@switch` has no case for `9:16`/`4:5`/`1:1` formats → old multi-format-row runs (`9a06710b`) render **nothing**. Latent bug, older per-format-row schema.
- `creative-studio.ts:540/591` (non-ai-layer image/carousel write paths) omit `thumb_url` — matters only if those branches are still reachable (likely dead post-disconnect; verify).

## Security
- **ROTATE the Neon `neondb_owner` password** — an env-check shell bug printed the full `DATABASE_URL` (with password) into the session transcript.

## Pending (updated 2026-07-24)
1. Rotate Neon password (user action).
2. Concept-gen JSON retry · Meta `code=1` backfill · run-cost accuracy (ai-layer robustness, held).
3. Strip or delete the now-commented preview scaffolding before merge.
4. `output-gallery` format-switch gap; write-path `thumb_url` gap (verify reachability).
5. Deploy/merge to main: apply migration `0005` to prod Neon, green gates, PR → Vercel + Railway. No push without permission.
6. `finishing-a-development-branch`; paid full sim (user's call).

---

# 2026-07-24 (later) — remote check + next-task decision point

State: `improve/creative` @ `b043d22`, **228 ahead of `origin/main`, 41 unpushed**. Session log committed. All containers stopped (Docker Desktop off).

## Remote fetch — one new branch, ZERO conflicts
- **`origin/new/creative_v2`** (author `dryayeet`, tip `f1e81c1`, 2026-07-23): a **from-scratch v2 Creative Studio**, entirely inside a new top-level **`rnd_mine/`** package (`src/creative_studio/`, own `pyproject.toml`, 37 test files, 3 design docs). **108 files, +14,682 lines, pure additions.**
- Branched from our same base `56db2f1`. Diverged: **they +46 / we +41**, but **0 overlapping files** (they touch only `rnd_mine/`; we touch `apps/`, `dev_reports/`, `infra/`). Merge is mechanically conflict-free.
- Contents: planning layer, fal adapters + balance reader, golden-tested prompt builders, durable run state, asyncio orchestrator w/ resume + selective regen, product-truth (birefnet+bria), ffmpeg composition, deterministic QA/QAReport, exporter + AssetManifest, CLI w/ dry-run + spend gates, FastAPI facade. Docs/adapters reference `apps/ai-layer`.
- **`origin/main` unchanged** — nothing to pull. `origin/improve/creative` is merely behind us.

## ⚠ BLOCKING STRATEGIC QUESTION (for user + dryayeet)
**Does `rnd_mine/creative_studio` supersede the `apps/ai-layer` creative module our Creative Studio frontend serves?** If yes, further polish on the `apps/` creative path is largely throwaway and the merge-to-main plan needs a convergence step first. Not answerable from the code. See memory `[[creative-v2-parallel-branch]]`.

## Next-task options + tradeoffs (user deciding)
| Option | Upside | Downside |
|---|---|---|
| **A.** Fix 2 pre-merge gaps (`output-gallery` format-switch; write-path `thumb_url`) | Clears last *known* correctness bugs before merge | Low real impact — format bug hits only **legacy** per-format rows; write-path may be **dead code** (check reachability first) |
| **B. (recommended)** Concept-gen JSON robustness — `brain.chat_json` retry + tolerant parse | Highest reliability value: a malformed Gemini response **actually killed a live run**; protects *all* `chat_json` callers; **$0** to verify via unit test, no Docker | Full end-to-end confidence would want a real run |
| **C.** Deploy/merge to main | Ships real value (thumbnails + CORP prod fix); branch drift risk is real, now with a sibling branch | Highest risk: ships A's gaps, needs migration `0005` on prod Neon, scaffolding decision, **push permission**, and CORP infra-layer behavior only verifiable post-deploy |

## User action outstanding
- **Rotate the Neon `neondb_owner` password** — the full `DATABASE_URL` (with password) was printed into the 2026-07-24 session transcript by an env-check shell bug. User will do it later.

---

# 2026-07-25 — pre-ship hardening: JSON retry, dead-code purge, cost breakdown, ship plan

Decision (user): **ship `apps/ai-layer` only; leave `rnd_mine/` (origin/new/creative_v2) alone.**
The parallel v2 branch does NOT gate this ship (0 overlapping files). Plan verified by a
ponytail-enabled Fable agent before building — it corrected 4 of my calls (see below).

## Commits (branch `improve/creative`, now `d1e0e9a`+, 235+ ahead of origin/main, UNPUSHED)
- `40e8ff6` **chat_json JSON retry + transport dedup.** A malformed Gemini response killed a live
  run: `brain.chat_json` did a bare `json.loads`. The retry already existed as a near-duplicate in
  `brand_brain._chat_json` — its 3 callers were protected, `chat_json`'s 7 story_brain callers were
  not. Moved the `attempts=3` loop into `chat_json`, deleted the copy + `_vision_user` copy, all 10
  callers now protected. **Only JSONDecodeError retries** (a 502 is not retried — Fable's guardrail).
  New `test_brain.py` (retry / exhaust-raise / no-retry-on-RuntimeError).
- `e5255e4` **deleted the dead `processGeneration` path** (−211 lines + orphan FluxProvider/safeJson
  imports). No caller/test/export; `/generate` hard-503s without the ai-layer. Fable upgraded this
  from "drop the task" to "delete it". `DISCONNECTED_TS_MODULES.md` updated.
- `bdfd802` **output-gallery `fmt()` normalize** — legacy history rows whose `format` is an aspect
  ratio (`9:16`/`4:5`/`1:1`) rendered nothing but orphaned rating buttons (the rating block sits
  OUTSIDE the `@switch`). One-line map to `static`; also fixes the filter chips. New runs only send
  `['static']`, so this is history-only. **USER-VERIFIED in the sim** on runs `9a06710b`/`c961965d`.
- `de696a6` **deleted the preview scaffolding** (mock interceptor 138 lines + 6 commented blocks).
  Bundle byte-identical (584.23 kB) — it was never in the import graph. Its own header said "remove
  before merge".
- `becc613` **persist the run cost breakdown to Neon.** `creative_jobs.ledger_json` existed since
  migration 0001 and save_job/load_job already mapped the `ledger` key — but nothing ever set it, so
  it was NULL since creation and `Ledger.finalize()`'s return was discarded at all 9 call sites. New
  `_run_ledger` lifts the finalized TOTAL (grand total + by_op) off the run's ephemeral disk on all
  3 completion paths (incl. salvage). No schema change, no R2, no new table. Also: `creator_from_
  direction` discarded its cost → now returns `(kit, cost)`, recorded as a `cast` op. `_run_cost`
  docstring corrected (sums per-op rows, deliberately NOT the TOTAL — survives an unfinalized run).
- `d1e0e9a` **test(ai-layer): `_entries()` reads newest cost_ledger row, not oldest.** Latent
  test-isolation bug (NOT mine): unordered `select()[0]` assumed an empty table; on a *used* branch
  it read a real id=1 row (0.005597) and 2 tests failed. `order_by(id.desc())`. Green on both a used
  and a clean branch. Matters because the post-rotation test target won't be pristine.

## Gate sweep — ALL GREEN
apps/api `tsc` baseline-only · `madge` 0 cycles · apps/api **436p/2s** · `ng build` clean 584.23 kB ·
ai-layer **599 passed / 7 skipped** on BOTH a used (.env) and a clean (.env.test) Neon branch.
Running the ai-layer suite needs `PG*`/`PG*_POOL` (absent from all `.env`) — derive from a
test-branch URL: `PG*`←direct, `PG*_POOL`←pooled, `+PGSSLMODE=require +PGCHANNELBINDING=require`.
Without them → 108 collection ERRORS that are pure env, not code (this fooled an earlier read).

## Sim verification — $0, no credits spent
Rebuilt all 3 images from `becc613`, brought up docker-compose.sim.yml, smoke PASS. Verified the new
code is IN the images (chat_json retry, _run_ledger, creator tuple sig, 0 processGeneration in the
api bundle, 0 preview refs in web). CORP header survived the rebuild (asset route `cross-origin`,
/health `same-origin`). **Cost breakdown proven by STUBBING ONLY `pipeline.run`** (the entire paid
boundary) and running the REAL completion path: `ledger_json` landed in Neon with by_op summing
exactly to cost_usd ($0.104588), incl. the `cast` cost that used to vanish; R2 mirrored ad_*.png +
thumbs/. Two real prior rows in the same table show `ledger_json=NULL` — the before/after in one
query. **Stub fully cleaned up** (4 R2 objs + 1 Neon row + local dir deleted, verified 0 left).
Containers since stopped by the user.

## Ship-to-prod CHECKLIST (task tracker, deliberately UNCOMMITTED)
`dev_reports/ai_serv/creative/2026-07-24-ship-to-prod-checklist.md` — a working tracker until ship,
NOT committed by design. Key durable decisions captured here so they survive /compact:

- **`INSTALL_GOOGLE=0`** set in `apps/ai-layer/Dockerfile` (committed). **Why 0 for the demo ship:**
  Google Ads is blocked on #39/#40/#41 (OAuth consent + login-customer-id + account owner), so the
  connector can't ground on Google data even with the dep present. `funnel.py:135` imports it
  lazily → absence is a graceful `skipped`, not a boot failure. Drops the heavy google-ads gRPC dep
  → smaller/faster demo image. **Flip back to 1 when #39/40/41 land.**
- **`META_ACCESS_TOKEN` must be UNSET on BOTH prod services.** It is a dev/CLI fallback that leaked
  into every `.env`, not a shared credential. Prod is per-request (`getMetaTokenForUser` →
  `X-Meta-Token`). Left set on Service B, `service.py:348` (`x_meta_token or META_ACCESS_TOKEN`) makes
  any header-less request silently ground on the OPERATOR's account — wrong brand, no error. Unsetting
  turns silent corruption into the designed loud failure. Cost: loses dev "demo mode" + ai-layer CLI
  in prod (neither is shipped product).
- **`API_BASE_URL` → set in Vercel to Railway A's generated URL** (no custom domain yet). The
  committed default `api.cosmisk.com` is dead; `apply-env.mjs` overrides from the env var at build.
  Do NOT change the committed default (it's the eventual custom-domain target; a Railway hostname
  would couple the repo to infra). Railway's generated domain is stable across redeploys.
- **`FRONTEND_URL` NOT needed.** The churning URL is Vercel's per-DEPLOY preview URL; production
  uses the stable alias `cosmisk.vercel.app`, already whitelisted in `config.ts:77-84` (with the
  custom domains). Omit the var.
- **Meta OAuth redirect URIs MUST be whitelisted before ship.** The URI is browser-derived
  (`${window.location.origin}/app/settings/meta-callback`, meta-oauth.service.ts:57); localhost does
  NOT cover prod, and Meta checks it at BOTH dialog and token-exchange (exact match). Add one entry
  per origin users can reach (cosmisk.com AND www.cosmisk.com are distinct). Then set Vercel
  `META_OAUTH_ENABLED=true`.
- **Migration**: one `ALTER TABLE studio_generations ALTER COLUMN brief_json DROP NOT NULL` via
  **psql directly** (NOT drizzle-kit — prod journal may be empty from manual M1 → could replay from
  0000). Backward-compatible; apply before the code lands.
- **Two SILENT env failures on Service B**: `AI_LAYER_API_KEY` unset ⇒ open unauthenticated
  generation endpoint (api.py:48-51); `STORAGE_BUCKET` unset ⇒ publish no-ops, next redeploy 404s
  every past run's images (storage.py:18).
- **Do NOT remove `mkdir ./data`** from the api Dockerfile even though ElevenLabs is out of scope —
  `index.ts:232` mkdirs it unconditionally at boot as non-root → EACCES without it.

## Ship order (from the checklist)
rotate Neon pw (+ update apps/api/.env.test) → psql ALTER → whitelist OAuth URIs → Service B env
(AI_LAYER_API_KEY first, META_ACCESS_TOKEN unset) → Service A env (AI_LAYER_URL last) → PR to main
(needs push permission) → repoint 3 deploys to main + Vercel META_OAUTH_ENABLED=true → post-deploy:
curl the /asset CORP header, load a history run, one real run to confirm ledger_json.

## Still outstanding (user)
Rotate the Neon password (leaked to a 2026-07-24 transcript); push permission; the manual ship
steps above. Nothing pushed.
