> **Status: ♻️ SUPERSEDED (2026-05-31)** — early cleanup plan; restated with current numbers in the 19_05 audit. Superseded by `19_05/suggested.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Cosmisk Repository Cleanup Plan

## Unique essence preserved

**Branch/commit anchors (one-time, historical):** baseline `analysis-and-cleanup` @ `ebff657` (merge); pre-merge HEAD `958a6ea` tagged `archive/pre-pull-2026-05-19`; remote HEAD `1a7a04e`; target `origin/main` @ `df2bfe1` (merge-base `df2bfe1b04e939d94ae1ca31ffaed49d9524b21b`). Post-merge: **34 ahead / 0 behind** main, 0 behind remote (was 18); net **+5,196/-973 over 60 files** (pre-merge: 15 ahead, +5,204/-972). Gateway commits: local `1521cce`, remote `227391f`. Remote merge commits `9348c79`, `c61f025`. Duplicate `CHOREEEE` at `8240d04`/`01dc5a6`. Do NOT squash (now in merged history).

**CRITICAL broken state:** `server/src/index.ts:40-43` imports + `:275-278` registers four nonexistent route modules — `health-score.js`, `creative-scan.js`, `quick-wins.js`, `static-ads.js`. `git log --diff-filter=A` confirms never committed. Server cannot build cleanly. Owner gate: Hypothesis A (delete imports/stubs) vs B (recover files).

**Direct-Anthropic still un-wrapped (cost_ledger bypass):** `competitor-creative-intel.ts` (2,614 LOC), `comment-mining-agent.ts` (1,818 LOC); also `utils/claude-helpers.ts` imports SDK (R20). `llm-gateway.ts` = canonical owner.

**Schema fragmentation:** `shopify_tokens` dual `CREATE TABLE` in `db/schema.ts` (canonical) + `scripts/add-shopify-tables.ts` (legacy); SQLite `IF NOT EXISTS` masks drift. Other CREATE TABLE outside schema.ts: `index.ts`->`waitlist_leads`; `strategic-memory.ts`->`strategic_reports/recommendations/running_context/predictions`; `add-audit-tables.ts`. schema.ts grep expectations: CREATE TABLE 60, CREATE INDEX 50, ensureColumn 19. **13 in-process cron** sites: audit-scheduler x2, autopilot x1 (4h), agent x7, reports x1, automations x1.

**God-file LOC inventory:** operator-experience 2788, competitor-creative-intel 2614, comment-mining-agent 1818, creative-engine 1641, reality-testing 1469, ai.ts 1379, index.ts 1326, oos-detector 1284 (test 1037), learning-engine 1236, ad-watchdog 1199 (test 985), creative-scorer 1192, narrative-synthesis 1177; frontend landing.component.ts 1920. service-clients.ts stable 952 LOC / 29556 bytes.

**Fresh-count deltas vs prior audit:** 96 console.* (was 85), 539 logger.* (was 116), 78 prod `as any` (was 35). SessionStart graph: Nodes 11214, Edges 84782, Files 376.

**14 root .md files (LOC):** README 27, AGENTS 38, GEMINI 38, AGENTS_OVERVIEW 355, BUSINESS_CONTEXT 384, COMBINED_OFFERING_MAP 311, CREATIVE_BRIEF_FOR_ADS 226, EMPLOYEE_TESTING_INSTRUCTIONS 169, META_API_TESTING_GUIDE 474, META_API_TESTING_PLAN 497, META_APP_REVIEW_SUBMISSION 270, META_REVIEW_15_DAY_USAGE_PLAN 232, REVISED_DEVELOPMENT_PLAN 329, ROADMAP_COMING_SOON 244, CLAUDE.md 1132 (keep at root). `.cursorrules`/`.windsurfrules` identical 1755-byte likely-stale files.

**Hygiene findings:** untracked `analysis/new_added_risks_and_design.md` (May-9 memo, Risks H-M source) -> rename `dev_reports/new_added_risks_and_design_2026-05-09.md`. Tracked artifacts `server/scripts/warmup.log` (44KB), `warmup-stdout.log`/`warmup-stderr.log` (0B). Root-owned dirs cause EACCES: `server/data/`, `.angular/`, `dist/`, `server/dist` (chown fix). `mcp-servers/` has only `frameio/` vs CLAUDE.md claiming 4 (descript/firecrawl/shopify missing). `dev_reports/` is `.gitignore`'d AND tracked (this file added via `git add -f`).

**Stale branches (owner sign-off):** `origin/claude/angular-n8n-integration-Zo23j`, `origin/claude/setup-n8n-mcp-9X8Lp`, `origin/claude/testing-plan-rxbCV`; local `dev`, `lean-devcontainer` (`781cef5`).

**Tier scheme:** T0 reversible hygiene, T1 verifiable de-junking, T2 schema consolidation, T3 Anthropic-gateway carve-out, T4 decomposition (out of scope per scope_alignment.md). ~5 eng-days in-scope. Operator-script policy (R6): Path A synthetic principal `userId:'operator:<name>'` vs Path B `OPERATOR_BYPASS` flag. R18: DB backup pre-flight `cp cosmisk.db.bak`. G7 LOC cap must be diff-aware warn-only.

**Merge action record (§18):** chose `origin/analysis-and-cleanup` (18 ahead — most vs lean-devcontainer 16, claude/angular 14, claude/testing 10, claude/setup 6, dev 1). Resolved 8 conflict files, all Took-HEAD: `.gitignore`, `CLAUDE.md` (stripped 3 outer + 3 inner stale markers from prior `4e872ae`), `final_report.md` (dropped dup; estimate reconciled to 12-13 days vs origin's 4-day dup), `competitor-spy.ts`, `ad-watchdog.ts`, `creative-strategist.ts`, `morning-briefing.ts`, `report-agent.ts`. Fixed 4 stale `<<<<<<<` markers in CLAUDE.md (now 0). Build/test NOT verified post-merge. No force-push; remote unchanged.

## Pointer
- SUPERSEDED -> see: `19_05/suggested.md` (S0..S7 phased restatement); SoW mapping in `05_05/scope_alignment.md` / `19_05/scope_alignment.md`; risks in `23_05/risk_register.md`.
