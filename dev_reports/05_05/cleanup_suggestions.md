> **Status: ♻️ SUPERSEDED (2026-05-31)** — early cleanup punch-list. Superseded by `19_05/suggested.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Codebase Cleanup — Suggested Steps

Branch `analysis-and-cleanup` @ `ebff657` (post-merge). Companion: `cleanup_plan.md`, `new_database_issues.md`. The S0..S7 phased plan is fully restated in `19_05/suggested.md`; only unique detail kept here.

## Critical finding (kept)

**Migration strategy is sound in principle, unimplementable in practice.** See `new_database_issues.md` § 10. Three prerequisite gates (build, install, schema consolidation) must close before Drizzle adoption can begin.

## Unique essence preserved

**S0 — env recovery (15 min).** Root-cause: `server/node_modules`, `node_modules`, `.angular`, `dist`, `server/dist` owned by `root` (a devcontainer ran as root once) → `npm install` EACCES. Fix `sudo chown -R $USER:$USER ...`; verify `stat -c '%U' server/node_modules` non-root. Then `npm ci` + `npm --prefix server ci`.

**S1 — make server compile (root finding).** Server does NOT compile today: 15 files reference 25 non-existent modules — masked by `dist/` pre-built 2026-05-03 from an earlier state. Holes:
- S1.1 missing route files `routes/{health-score,creative-scan,quick-wins,static-ads}.ts`; imports at `index.ts:40-43` and `:275-278`. Path A delete / B recover / C stub `export async function ...Routes(app){}`.
- S1.2 `intelligence-integration.ts`: symbols `watchdogSnapshotToSignals`, `buildStrategicPromptSection`, `enhanceWatchdogDecisions` have **0 exports anywhere**; used by `ad-watchdog.ts` + `report-agent.ts`. Recover via `git log --all --diff-filter=A`. Path B note: deleting the 3 call sites in `ad-watchdog.ts` + `report-agent.ts` reverts the watchdog to its pre-strategic-intelligence shape.
- S1.3 `utils/encryption` missing (`routes/shopify.ts`, `services/shopify-client.ts`) → replace `encrypt/decrypt` with `encryptToken/decryptToken` from `token-crypto.js`. The encryption helper is equivalent in shape to `services/token-crypto.ts`; verify call-site argument shape matches.
- S1.4 `ad-engine/` cluster (`creative-intelligence.ts`, `gemini-generator.ts`, `strategy.ts`, `validator.ts` → `./types.js`; validator also `../client-references.js`, `../pattern-extractor.js`, `./templates.js`) likely unfinished; delete folder if self-referential only.
- S1.5 `learning-engine.ts` → missing `client-references.js`. S1.6 `strategic-cognition/` (4 files) → missing `signal-discovery/index.js` folder. S1.7 `unified-agent-runner.ts` → **12 missing analyser files** (`audience-saturation-analyzer.ts`, `creative-lifespan-predictor.ts`, …) = largest hole; depended on by `routes/agent.ts`.

**S2 — schema consolidation.** Schema fragmented across **6 sources**; `shopify_tokens` defined twice; migration strategy assumes 4 sources, gap = 5 lazy/script tables grown since 2026-04-26. Moves into `schema.ts`: shopify_tokens (drop CREATE from `scripts/add-shopify-tables.ts`); brands/brand_context/audits (`scripts/add-audit-tables.ts`); client_contexts (`services/client-context.ts`); strategic_* ×4 (`services/strategic-memory.ts`); scheduled_audits (`services/audit-scheduler.ts`); waitlist_leads (lazily created in `index.ts` boot).
- S2.1 **Snapshot the live DB first** (before any schema work): `cp server/data/cosmisk.db server/data/cosmisk.db.snapshot-$(date +%Y%m%d%H%M)`; document the snapshot in `dev_reports/db_snapshots/`.
- S2.8 **Verify**: a fresh DB via `createTables(new Database(':memory:'))` must match the live snapshot's `PRAGMA table_info` per table.

**S3 — gateway carve-out.** Targets: `competitor-creative-intel.ts` (2,614 LOC, no tests — write smoke test at `server/src/__tests__/competitor-creative-intel.test.ts` first); `comment-mining-agent.ts` (1,818 LOC); `utils/claude-helpers.ts` (wrap only if it instantiates SDK). CI grep guards block `new Anthropic` and `@anthropic-ai/sdk` imports outside gateway/__tests__.
- S3.4 Path B: `OPERATOR_BYPASS_GATEWAY` runs uncapped, billed to a separate budget.

**S4 — hygiene.** `git mv analysis/new_added_risks_and_design.md → dev_reports/new_added_risks_and_design_2026-05-09.md`. Warmup logs (`warmup.log`, `warmup-stdout.log`, `warmup-stderr.log`) tracked → `git rm` + gitignore. 14 root `.md` files; move 10 into `docs/{business,meta-review,ops,historical}`, keep README/CLAUDE/AGENTS. CLAUDE.md claims 4 MCP servers (frameio, descript, firecrawl, shopify) but only `frameio/` exists; `.cursorrules`/`.windsurfrules` stale dupes. Stale branches `origin/claude/{angular-n8n-integration-Zo23j,setup-n8n-mcp-9X8Lp,testing-plan-rxbCV}` + local `dev` (empty) + `lean-devcontainer` (superseded) → archive via `git tag` then delete.
- S4.2 dev_reports tracking decision: Policy A (untrack via `git rm -r --cached dev_reports`, reports become local-only) vs Policy B (delete the line from `.gitignore`, reports stay tracked) — **B recommended**.

**S5 — CI guards G1–G7.** G1 no `new Anthropic`; G2 no `CREATE TABLE` outside schema.ts+tests; G3 `console.*` warn-only; G4 no `@anthropic-ai/sdk` import; G5 build must succeed; G6 test must pass; G7 diff-aware LOC cap (warn). Live in `.github/workflows/ci.yml`.

**S6 — doc-refresh counts.** `console.*` now 96 (not 85); `as any` prod now 78 (not 35); 35 server tests, 38 frontend tests; tables 40→71 (23 new analyst + 5 lazy); routes 29→41 imports / 35 files present; graph 376 files / 11,209 nodes / 84,530 edges.
- S6 doc-refresh edits: `new_and_added_risks.md` — append Risks H–M (from `analysis/new_added_risks_and_design.md`) + the build-broken risk; `tasklist.md` — append S0–S5 as new task IDs; `backend_wiring.md` — add new routes `/ad-command`, `/shopify`, `/intelligence`, `/health-score`, `/creative-scan`, `/quick-wins`, `/static-ads`; **Rebuild code-review-graph at the end of S6.**

**S7 — backlog.** 12 server files >900 LOC, 6 frontend >900 LOC; top three `operator-experience.ts` 2,788 / `competitor-creative-intel.ts` 2,614 / `comment-mining-agent.ts` 1,818 (no tests); 13 in-process cron schedules; `landing.component.ts` 1,920 LOC, `dashboard.component.ts` 1,244 LOC.
- S7 full backlog (out of scope for this plan): Postgres+Drizzle migration (gated on S0–S2; see `new_database_issues.md`); JWT cookie migration = Added Risk A / P0.4 in `tasklist.md`; Sentry + observability = Added Risk #2 / P0.1; external-API circuit breakers bundled into Milestones 2/4 per `scope_alignment.md`; Python scraper dependency policy = Risk M, owner-gated.

**Effort ladder & state.** S0 0.05d · S1 1d · S2 2d · S3 3.5d · S4 4d · S5 4.25d · S6 4.75d; ~1 work week (5d) incl 25% buffer. **78 commits** on local branch not on `origin/analysis-and-cleanup`; push safe (fast-forward-equivalent) but gated on green build.

**Owner gates OG-1..OG-11** (step-mapped): OG-1 (chown) blocks all work; OG-2..OG-7 each block their S1 substep; OG-7 = operator-script gateway policy Path A (synthetic principal) vs B (bypass flag); OG-8 dev_reports tracking; OG-9 branch archive; OG-10 external links to root .md; OG-11 DB migration strat patch readiness.

## Pointer
- SUPERSEDED → see: `19_05/suggested.md` (full S0–S7 restatement). Cross-refs: `cleanup_plan.md`, `new_database_issues.md`, `dev_reports/rate_limiting/implementation_plan.md`.
