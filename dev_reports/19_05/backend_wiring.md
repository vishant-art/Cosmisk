> **Status: ♻️ SUPERSEDED (2026-05-31)** — May-19 backend-wiring refresh. Superseded by `23_05/state_of_codebase.md` / `23_05/module_inventory.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Backend Wiring & Flows — Refresh (2026-05-19/20)

## Unique essence preserved
- **Supersedes:** `dev_reports/backend_wiring.md` (2026-04-26). Stack: Fastify Node 22 ESM TS-strict, better-sqlite3, @anthropic-ai/sdk, Angular 17. Entry `server/src/index.ts` = **1,326 LOC** (was 1,287); single Node process, **13** cron in-process (was 8).
- **Headline delta (04-26 → 05-19):** route modules imported 29→**36** (+7); registered via `app.register` 29→**43** (+14); route files present in `routes/` 29→**32** (+3); services (excl `__tests__`) 28→**82** (+54); cron 8→**13** (+5); index.ts LOC 1,287→**1,326** (+39).
- **Critical mismatch:** 43 registered vs 32 present = **11 registrations point to missing/duplicated imports**. Confirmed missing per `19_05/new_and_added_risks.md §N`: `health-score.ts`, `creative-scan.ts`, `quick-wins.ts`, `static-ads.ts` (broken prefixes `/health-score /creative-scan /quick-wins /static-ads`). Remaining 7 = multi-route exports per file. **Server cannot compile**; remediation `19_05/cleanup_suggestions.md` S1.1.
- **God-files:** `routes/ai.ts` 1,379 LOC; `routes/creative-engine.ts` 1,641 LOC.
- **`/schedules` route has NO auth** (Risk: missing auth) — unchanged from 04-26; promote to S1.
- **Per-route auth/behavior map (original §2.1, 29 healthy routes — guide.md:133 + run_guide.md:112 point here for per-route docs; successor lists only largest-by-LOC, not this map):** `/billing` = JWT + HMAC for webhooks; `/competitor-spy` = JWT (rate-limited LLM analyse); `/autopilot` = JWT + 4h cron; `/agent` = JWT + 7 cron schedules; `/auth` = JWT mixed; `/media` → `routes/media-gen.ts`; `ugc-workflows.ts` and `intelligence.ts` are **root-level** registrations.
- **NEW routes since 04-26:** `routes/ad-command.ts` (JWT, ok); `routes/shopify.ts` (JWT but imports `../utils/encryption.js` which **does not exist** at this point-in-time — same build-broken cluster; NOTE: contradicted by successor `23_05/module_inventory.md §1.1` which records `utils/encryption.ts` now exists as a re-export bridge — acceptable as historical); `routes/intelligence.ts` (root-level JWT).
- **Services delta (28→82) LOC:** cohort-ltv-analyzer 1,029, competitor-creative-intel 2,614, comment-mining-agent 1,818, creative-scorer 1,192, discount-leakage-detector 914, oos-detector 1,284; service-clients.ts 952 (per-brand identity for agency-delivery); operator-experience 2,788, reality-testing 1,469, learning-engine 1,236, recommendation-loop 440; shopify-client ~630. **Analyst-agents cluster (original §3.1) — `competitor-intel-report.ts`** (unique to this report; appears in no other dev_report and not carried by the named successor — preserved here to prevent permanent erasure).
- **Shopify cluster (original §3.8):** `shopify-client.ts`, `audit/shopify-ingestion.ts`, `routes/shopify.ts`.
- **strategic-cognition/ (9):** causal-intelligence, competing-hypotheses, narrative-synthesis, elite-decision-compression, recursive-investigator, self-improving-cognition, strategic-curiosity, uncertainty-intelligence, client-report-generator.
- **intelligence-layer/:** deep-search-protocol, elite-quality-gate, index, mediocrity-detector, thinking-quality-evaluator. **quality-governance/:** explainable-quality-engine, quality-scorer, index. **elite-intelligence/:** html-report, index, reasoning-engines, signal-collector, synthesis-engine, types.
- **llm-gateway.ts** ~338 LOC meaningful, central Anthropic wrapper, `cost_ledger` accounting + Bottleneck rate limit; tested `__tests__/llm-gateway.test.ts` (357 lines).
- **Direct-Anthropic bypass** (grep `new Anthropic`): canonical owner `services/llm-gateway.ts`; **2 services still bypass** = `competitor-creative-intel.ts` + `comment-mining-agent.ts` (4,432 LOC combined). Refs `19_05/rate_limiting/implementation_plan.md`, `cleanup_suggestions.md` S3.
- **Cron breakdown (13):** audit-scheduler.ts ×2 (per-user + system); autopilot.ts ×1 (*/4h, was daily); agent.ts ×7 (watchdog 6h, briefing 2h, weekly reports etc); reports.ts ×1 (weekly Mon 7am); automations.ts ×1 (*/4h). Cadence tightened daily→4–6h; per Risk J this raises blast radius of any cron-induced API hang.
- **Boot diff:** step 11 route registrations bloated 29→43 (4 point to missing files); step 12 `initializeScheduler` boots 2 audit-scheduler crons. SIGINT/SIGTERM handled but **NO unhandledRejection handler**. Other steps unchanged.
- **`unified-agent-runner.ts`** imports 12 analyser files that don't exist (likely unfinished feature).

## Pointer
- SUPERSEDED → see: `23_05/module_inventory.md` (and `23_05/state_of_codebase.md`)
