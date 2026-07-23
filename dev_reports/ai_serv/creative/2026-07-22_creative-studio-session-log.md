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
