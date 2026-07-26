> **Status: ♻️ SUPERSEDED (2026-05-31)** — May-19 codebase/infra guide refresh. Superseded by `23_05/state_of_codebase.md`; for durable orientation see `05_05/guide.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Cosmisk — Codebase & Infra Guide — Refresh (2026-05-19/20)

## Unique essence preserved
- **Baseline:** `analysis-and-cleanup` @ `ebff657` (post-merge, 34 commits ahead of `origin/main`). Supersedes `dev_reports/guide.md` (2026-04-19 @ `69b4352`).
- **Graph growth:** 376 files / 11,209 nodes / 84,530 edges (was 290 / 3,632 / 33,757, i.e. 3.1× nodes / 2.5× edges).
- **Counts:** Route files 32 present / 36 imported / **43 registered** (4 missing); Service files 28→**82**; Schema tables 40→**71**.
- **NEW stack deps:** `bottleneck` (LLM-gateway rate limiter) + Shopify Admin API integration.
- **LLM gateway** `server/src/services/llm-gateway.ts` enforces: per-user daily $ cap (reads `cost_ledger`), org RPM via bottleneck `minTime`, org ITPM via weighted reservoir, SDK retry on 429/5xx, `cost_ledger` write per successful call. All Anthropic calls *should* flow through `createMessage(...)`.
- **service-clients.ts (952 LOC):** new ownership layer; `service_clients` table is per-brand parent for analyst output; most new tables reference `service_clients.id`, not `users.id`.
- **New service groups:** 8 analyst agents (cohort LTV, competitor creative intel, comment mining, creative scorer, discount leakage, fatigue, OOS, competitor intel report); 9 `services/strategic-cognition/` services; 3 sibling folders `intelligence-layer/`, `quality-governance/`, `elite-intelligence/`.
- **§3.4 strategic-cognition (9 services under `services/strategic-cognition/`):** Causal reasoning, competing hypotheses, narrative synthesis, elite decision compression, recursive investigator, self-improving cognition, strategic curiosity, uncertainty intelligence, client report generator. (`client report generator` is load-bearing — CLAUDE.md flags `client-report-generator` under Needs-wiring.)
- **Shopify broken build cluster:** `routes/shopify.ts` + `services/shopify-client.ts` import `../utils/encryption.js` which does **not exist**. (Files: `routes/shopify.ts`, `services/shopify-client.ts`, `audit/shopify-ingestion.ts`.)
- **Critical issues for a new dev:**
  - Server does not compile — `tsc` fails on 15 files / 25 missing modules (see `19_05/cleanup_suggestions.md` S1).
  - `server/data/`, `node_modules/`, `dist/`, `.angular/` root-owned → `npm install` EACCES; `sudo chown -R $USER:$USER` once.
  - 11 tables live outside `schema.ts` (lazy services + scripts); fresh DBs need `add-audit-tables.ts` run manually.
  - `shopify_tokens` defined twice (schema.ts + script) → drift hazard.
  - `/schedules` route has **no JWT auth** (finding from 2026-04-26, unfixed).
  - 4 routes registered, 0 files: `/health-score`, `/creative-scan`, `/quick-wins`, `/static-ads`.
  - `unified-agent-runner.ts` imports 12 analyser files that don't exist (unfinished feature).
  - `ad-engine/`: 4 files import missing `types.js` (broken).
  - `mcp-servers/`: README claims 4 servers, only `frameio/` present.
- **Tooling NEW:** `dev` = 214-line shell convenience runner; `.devcontainer/` Docker dev env with passing smoke test (run steps in `19_05/run_guide.md`).

## Cited & kept (referenced elsewhere)
- §3.1 gateway bypass: **two services still bypass the gateway as of 2026-05-19** — `competitor-creative-intel.ts` (2,614 LOC) and `comment-mining-agent.ts` (1,818 LOC); see `19_05/cleanup_suggestions.md` S3.

## Pointer
- SUPERSEDED → see: `23_05/state_of_codebase.md`; durable orientation `05_05/guide.md`, durable setup `05_05/run_guide.md`.
