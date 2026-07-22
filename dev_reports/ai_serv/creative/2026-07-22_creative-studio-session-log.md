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

### 6. Sidebar — dormant surfaces marked
- **`3bc67cc`** — Creative Cockpit, Director Lab, Creative Engine tagged **(inactive)** and dimmed in the sidebar.

## Gates
- apps/api `tsc --noEmit` baseline-only (`billing.ts:4` stripe) · apps/api suite **436 pass / 2 skip** · apps/web `ng build` clean (3 pre-existing NG8107 warnings, not ours).

## Open / follow-ups
- Formats: entry now sends `['static']` (the ai-layer formats are hardcoded in the proxy; the gallery switches on `'static'`) — confirm statics render in a real run.
- Deferred (unchanged): `variant_axis`/`variant_values` still don't leave the browser (feature gap, not honesty); paid end-to-end sim (~$4.78 real fal) is the user's call.
- Before merge: strip the two preview scaffolds (`gen/preview` sample + the mock interceptor + the `cosmisk_mock` flag in `enter.html`).
- Marking the dormant creative surfaces **(inactive)** across the rest of the app (command palette, topbar, dashboard tiles, welcome tour, public footer) — in progress.
