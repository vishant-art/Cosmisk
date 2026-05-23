# Codebase Cleanup — Suggested Steps

**Date:** 2026-05-19
**Branch:** `analysis-and-cleanup` @ `ebff657` (post-merge)
**Companion docs:** `cleanup_plan.md` (full plan + risk register), `new_database_issues.md` (DB migration audit)

> **Purpose.** A prioritised punch-list of cleanup actions, in the order they should be tackled. Each step lists what to do, why, the verification gate, and what it blocks. **No actions performed here** — this is a planning artefact.

---

## Order of operations

The work has a strict dependency order. Each step's verification gates the next.

```
S0 — Recover environment        (node_modules ownership, build can run)
  ↓
S1 — Stop the bleeding           (resolve 25 broken imports → server compiles)
  ↓
S2 — Schema consolidation        (collapse 11 lazy/script tables into schema.ts)
  ↓
S3 — Complete the LLM gateway    (wrap last 2 direct-Anthropic services)
  ↓
S4 — Repo hygiene                (untracked files, branches, root-level docs)
  ↓
S5 — CI guards                   (regression prevention for S1–S3)
  ↓
S6 — Documentation refresh        (sync dev_reports to post-cleanup reality)
  ↓
S7 — Backlog (out of scope)       (god-files, cron extraction, frontend decomp)
```

S0 is non-negotiable. Everything else is gated by it.

---

## S0 — Recover the working environment (effort: 15 min, owner-gateable)

### S0.1 Reset `node_modules` ownership

**Problem.** `server/node_modules/`, `node_modules/`, `.angular/`, and `dist/` are owned by `root` (a devcontainer ran as root once). `npm install` fails with `EACCES` for the current user.

**Action.** One-time:

```sh
sudo chown -R $USER:$USER node_modules server/node_modules .angular dist server/dist
```

**Verification.** `stat -c '%U' server/node_modules` returns the non-root user.
**Blocks.** Every subsequent step.

### S0.2 Clean install

```sh
npm ci                       # root (Angular workspace)
npm --prefix server ci       # server
```

**Verification.** Both exit 0. `server/node_modules/.bin/tsc --version` works.
**Blocks.** S1 verification (typecheck).

---

## S1 — Make the server compile again (effort: 0.5–1 day, owner-gated)

### S1.1 Resolve four missing route imports

**Files imported but absent:** `server/src/routes/health-score.ts`, `creative-scan.ts`, `quick-wins.ts`, `static-ads.ts` — see `cleanup_plan.md` § 4.1.

**Action.** Owner picks one:

- **Path A (most likely):** delete the four imports + register calls in `server/src/index.ts:40-43` and `:275-278`. These were never written.
- **Path B:** recover the route files (search team chat / Linear) and commit them.
- **Path C:** stub-write `export async function healthScoreRoutes(app) {}` × 4 to keep the prefixes alive while the real routes get designed.

**Verification.** `grep -rE "/health-score|/creative-scan|/quick-wins|/static-ads" src e2e` shows no frontend caller (Path A safe) OR stubs return 200 (Path C).

### S1.2 Recover or delete `intelligence-integration` (Risk imported by ad-watchdog + report-agent)

**Used as:** `import { watchdogSnapshotToSignals, buildStrategicPromptSection, enhanceWatchdogDecisions } from './intelligence-integration.js'`.

**Action.** The three symbols have **0 exports anywhere in the codebase**. Likely the module was deleted by mistake during the rebase. Two paths:

- **Path A:** recover the file from git history if it ever existed (`git log --all --diff-filter=A -- server/src/services/intelligence-integration.ts`).
- **Path B:** delete the three call sites in `ad-watchdog.ts` and `report-agent.ts` and replace the calls with no-ops / inline logic; the watchdog reverts to its pre-strategic-intelligence shape.

### S1.3 Recover or stub `utils/encryption`

Imported by `routes/shopify.ts` and `services/shopify-client.ts`. Almost certainly the Shopify-token encryption helper, equivalent in shape to `services/token-crypto.ts`.

**Action.** Most likely solution: replace `import { encrypt, decrypt } from '../utils/encryption.js'` with `import { encryptToken, decryptToken } from './token-crypto.js'`. Verify call-site argument shape matches.

### S1.4 Resolve the `ad-engine/` cluster

`services/ad-engine/creative-intelligence.ts`, `gemini-generator.ts`, `strategy.ts`, `validator.ts` all import `./types.js`. `validator.ts` additionally imports `../client-references.js`, `../pattern-extractor.js`, `./templates.js`.

**Action.** These look like an unfinished feature. Two paths:

- **Path A:** find the missing files in a sibling branch and merge.
- **Path B:** delete the `ad-engine/` folder entirely if no code outside it depends on it.

**Pre-check.** `grep -rE "from '.*ad-engine" server/src` to see what depends on the cluster. If only `server/src/services/ad-engine/*` references itself, **safely delete the folder**.

### S1.5 Resolve `learning-engine.ts` → `client-references.js`

Single missing import. Same pattern as S1.4 — owner check: does this feature still ship? If not, delete `learning-engine.ts`.

### S1.6 Resolve `strategic-cognition/` → `signal-discovery/index.js`

Four files in `strategic-cognition/` import `../signal-discovery/index.js`. The `signal-discovery/` folder doesn't exist.

**Action.** Likely same pattern: dropped folder. Search history or delete the four import lines and unwrap whatever call sites used the missing exports.

### S1.7 Resolve `unified-agent-runner.ts` → 12 missing analyser files

`unified-agent-runner.ts` imports a dozen specialised analyser modules (`audience-saturation-analyzer.ts`, `creative-lifespan-predictor.ts`, etc.). **None exist.** This is the largest single hole.

**Action.** Two realistic paths:

- **Path A:** the analysers were never written; comment out / delete the imports and the calls.
- **Path B:** they live in a sibling branch never merged here. Search.

**Pre-check.** `grep -rE "from '.*unified-agent-runner'" server/src` to see who depends on this module. If only `routes/agent.ts`, the impact is contained.

### S1.8 Verify

```sh
npm --prefix server run build
npm --prefix server run test
```

**Both must exit 0.** Until they do, S2 and S3 cannot proceed safely (their changes can't be tested).

---

## S2 — Consolidate the schema (effort: 1 day, after S1)

### S2.1 Snapshot the live DB first

```sh
cp server/data/cosmisk.db server/data/cosmisk.db.snapshot-$(date +%Y%m%d%H%M)
```

Document the snapshot in `dev_reports/db_snapshots/`.

### S2.2 Collapse `shopify_tokens` dual definition

Delete the `CREATE TABLE` block from `server/scripts/add-shopify-tables.ts`. Keep seed-row logic. Add a CI grep guard:

```sh
! grep -rE "CREATE TABLE IF NOT EXISTS shopify_tokens" server/scripts
```

### S2.3 Move `brands`, `brand_context`, `audits` into `schema.ts`

`server/scripts/add-audit-tables.ts` creates these. Copy `CREATE TABLE` blocks into `createTables()` in `schema.ts`, preserving column types and FKs. Keep the brand-seed logic in the script (for one-shot runs); remove the table-creation logic.

**Pre-check.** `PRAGMA table_info('brands')` against a live `cosmisk.db` snapshot — confirm column shapes match before deleting the script's DDL.

### S2.4 Move `client_contexts` (from `services/client-context.ts`) into `schema.ts`

Lazy creation pattern needs to go. Either:
- Keep the lazy init AS-IS but have it call the canonical `schema.ts` DDL via a shared helper.
- Move the DDL into `schema.ts` and delete the lazy `ensureSchema` from `client-context.ts`.

### S2.5 Move `strategic_*` (×4) into `schema.ts`

Same pattern as S2.4 for `services/strategic-memory.ts`.

### S2.6 Move `scheduled_audits` into `schema.ts`

Same pattern from `services/audit-scheduler.ts`.

### S2.7 Move `waitlist_leads` into `schema.ts`

Currently lazily created inside `server/src/index.ts` boot. Move the DDL into `schema.ts` and remove the boot-time create.

### S2.8 Verify

After S2.1–S2.7:
- `grep -rE "CREATE TABLE" server/src server/scripts --include="*.ts"` returns only `schema.ts` and test files.
- `npm --prefix server run test -- schema.test.ts` passes.
- A fresh DB created via `createTables(new Database(':memory:'))` matches the live snapshot's `PRAGMA table_info` per table.

---

## S3 — Complete the LLM gateway carve-out (effort: 1.5 days, after S1)

### S3.1 Wrap `competitor-creative-intel.ts`

2,614 LOC, no existing tests. Replace `new Anthropic({...})` with `createMessage(...)` from `services/llm-gateway.js`. Thread `userId` + `operation` through every entry point. See `cleanup_plan.md` § 6.1.

**Pre-step.** Write a smoke test before wrapping (no tests today). Tests live at `server/src/__tests__/competitor-creative-intel.test.ts`.

### S3.2 Wrap `comment-mining-agent.ts`

1,818 LOC. Same pattern as S3.1.

### S3.3 Wrap `utils/claude-helpers.ts` if it instantiates the SDK

Verify by inspection. If it does, wrap. If it only re-exports helper types, leave alone.

### S3.4 Decide operator-script policy

Per `cleanup_plan.md` § 6.4. Two paths:
- **Path A:** operator scripts pass `userId: 'operator:<name>'` to the gateway; gateway accepts synthetic principals.
- **Path B:** `OPERATOR_BYPASS_GATEWAY` flag; operator runs uncapped, billed to a separate budget.

Document in `dev_reports/rate_limiting/implementation_plan.md`.

### S3.5 Add CI grep guards

```sh
! grep -rE "new Anthropic\b" server/src --include='*.ts' | grep -v __tests__ | grep -v services/llm-gateway.ts
! grep -rE "import .* from ['\"]@anthropic-ai/sdk['\"]" server/src --include='*.ts' | grep -v __tests__ | grep -v services/llm-gateway.ts
```

**Verification.** Add a synthetic `new Anthropic` in a test PR; CI must fail.

---

## S4 — Repo hygiene (effort: 0.5 day, can run alongside S1–S3)

### S4.1 Move `analysis/new_added_risks_and_design.md` into `dev_reports/`

```sh
git mv analysis/new_added_risks_and_design.md dev_reports/new_added_risks_and_design_2026-05-09.md
rmdir analysis
```

### S4.2 Decide `dev_reports/` tracking policy

`.gitignore` currently lists `dev_reports/`, but files inside are already tracked. Two choices (see `cleanup_plan.md` § 3.2):

- **Policy A:** untrack (`git rm -r --cached dev_reports`). Reports become local-only.
- **Policy B (recommended):** delete the line from `.gitignore`. Reports stay tracked for the team.

### S4.3 Triage stale branches (owner-gated)

`origin/claude/angular-n8n-integration-Zo23j`, `origin/claude/setup-n8n-mcp-9X8Lp`, `origin/claude/testing-plan-rxbCV`, local `dev` (empty), local `lean-devcontainer` (superseded).

For each:
```sh
git tag archive/<name> origin/claude/<name>
git push origin :refs/heads/claude/<name>
```

Same for local branches: `git branch -d` (refuses on unmerged; never `-D`).

### S4.4 Delete warmup logs from version control

```sh
git rm server/scripts/warmup.log server/scripts/warmup-stdout.log server/scripts/warmup-stderr.log
echo "server/scripts/warmup*.log" >> .gitignore
```

### S4.5 Reorganise top-level marketing docs

14 `.md` files at root. Per `cleanup_plan.md` § 4.6, move 10 of them into `docs/business/`, `docs/meta-review/`, `docs/ops/`, `docs/historical/`. Keep `README.md`, `CLAUDE.md`, `AGENTS.md` at root.

**Pre-check.** Inventory external links to these files (Smashed website, Notion, emails) before moving.

### S4.6 Reconcile `mcp-servers/` with `CLAUDE.md` claims

`CLAUDE.md` claims 4 MCP servers (frameio, descript, firecrawl, shopify). Only `frameio/` exists. Either add the three missing servers or delete the claim. Same for `.cursorrules`, `.windsurfrules` (stale duplicates).

---

## S5 — CI guards (effort: 0.25 day, after S1–S3)

Per `cleanup_plan.md` § 8:

| Guard | Purpose |
|---|---|
| `G1` — no `new Anthropic` outside the gateway | S3 regression prevention |
| `G2` — no `CREATE TABLE` outside `schema.ts` + tests | S2 regression prevention |
| `G3` — `console.*` migration (warn-only) | tracking `structured_logging.md` work |
| `G4` — no `import ... from '@anthropic-ai/sdk'` outside the gateway | stronger G1 |
| `G5` — `npm --prefix server run build` must succeed | S1 regression prevention |
| `G6` — `npm --prefix server run test` must pass | all-tier regression prevention |
| `G7` — diff-aware LOC cap warning (warn, not fail) | Tier 4 prevention |

All guards live in `.github/workflows/ci.yml`. Read the existing CI first; don't duplicate.

---

## S6 — Documentation refresh (effort: 0.5 day, after S1–S5)

Existing docs in `dev_reports/` reference the pre-merge state. Update:

- **`audit.md`** — recount `console.*` (now 96, not 85), `as any` production (now 78, not 35), test counts (35 server tests, 38 frontend tests).
- **`db_structure.md`** — table count 40 → 71. Add per-table reference for 23 new analyst tables + 5 lazy tables. Flag `shopify_tokens` dual definition until S2.2 lands.
- **`backend_wiring.md`** — route count 29 → 41 imports / 35 files present. Add `/ad-command`, `/shopify`, `/intelligence`, `/health-score` (if recovered), `/creative-scan`, `/quick-wins`, `/static-ads`.
- **`new_and_added_risks.md`** — append Risks H–M from `analysis/new_added_risks_and_design.md` + the build-broken risk from this audit.
- **`tasklist.md`** — append S0 through S5 as new task IDs.
- **`Database_migration_strat.md`** — per `new_database_issues.md` § 8, patch 7 sections.
- **`guide.md`** — bump file/node/edge counts (376 / 11,209 / 84,530).
- **Rebuild code-review-graph** at the end of S6.

---

## S7 — Backlog (explicitly out of scope for this round)

These items are tracked in `cleanup_plan.md` Tier 4. Do not start during the current cleanup window.

- **God-file decomposition.** 12 server files > 900 LOC, 6 frontend components > 900 LOC. The top three (`operator-experience.ts` 2,788; `competitor-creative-intel.ts` 2,614; `comment-mining-agent.ts` 1,818) have no tests.
- **In-process cron extraction.** 13 cron schedules inside the API process; should move to a separate worker.
- **Frontend Angular component decomposition.** `landing.component.ts` 1,920 LOC; `dashboard.component.ts` 1,244 LOC; etc.
- **Postgres + Drizzle migration.** Gated on S0–S2 completing first; see `new_database_issues.md` for prerequisites.
- **JWT cookie migration (Added Risk A).** Separate SoW item (P0.4 in `tasklist.md`).
- **Sentry + observability wiring (Added Risk #2).** Separate SoW item (P0.1).
- **External-API circuit breakers.** Bundled into Milestones 2/4 per `scope_alignment.md`.
- **Python scraper dependency policy (Risk M).** Owner-gated; not part of this cleanup.

---

## Total effort & cumulative state

| Step | Effort | Cumulative effort | What's done after |
|---|---|---|---|
| S0 | 15 min | 0.05 d | Toolchain works locally |
| S1 | 0.5–1 d | 1 d | Server compiles + tests pass |
| S2 | 1 d | 2 d | Schema is single-source-of-truth |
| S3 | 1.5 d | 3.5 d | All Anthropic calls go through gateway |
| S4 | 0.5 d | 4 d | Repo is tidy; branches triaged |
| S5 | 0.25 d | 4.25 d | CI prevents regression |
| S6 | 0.5 d | 4.75 d | Docs match reality |
| S7 | (deferred) | n/a | Out of scope |

**Working assumption:** single engineer, no external blockers. Realistic delivery window: **one work week (5 days)** including ~25% buffer for owner-gated decisions, external-link inventory, and unexpected DB-snapshot drift in S2.

---

## Owner gates (must be answered before starting)

These block specific steps. Listed in the order they're needed.

| Gate | Step | Question |
|---|---|---|
| OG-1 | S0.1 | OK to `sudo chown -R` over `node_modules`, `.angular`, `dist`? (Local-only, reversible.) |
| OG-2 | S1.1 | Were `health-score`, `creative-scan`, `quick-wins`, `static-ads` routes ever written? Path A (delete imports), B (recover), or C (stub)? |
| OG-3 | S1.2 | Was `intelligence-integration.ts` ever written? Path A (recover) or B (delete callers)? |
| OG-4 | S1.4 | Is the `ad-engine/` feature still planned? Path A (recover folder) or B (delete it)? |
| OG-5 | S1.6 | Is the `signal-discovery/` cluster still planned? Path A or B? |
| OG-6 | S1.7 | Are the 12 unified-agent-runner analysers still planned? Path A or B? |
| OG-7 | S3.4 | Operator-script gateway policy — Path A (synthetic principal) or B (bypass flag)? |
| OG-8 | S4.2 | `dev_reports/` policy — A (untrack) or B (keep tracked, recommended)? |
| OG-9 | S4.3 | OK to archive-and-delete the three `origin/claude/*` branches plus local `dev` and `lean-devcontainer`? |
| OG-10 | S4.5 | Are any external sites linking directly to root-level `.md` files? |
| OG-11 | S6 (DB) | Is `Database_migration_strat.md` ready to be patched per `new_database_issues.md` § 8? |

Until OG-1 is answered, **no work proceeds**. OG-2 through OG-7 each block their specific S1 step. The rest are sequenced to land alongside their step.

---

## Critical findings worth surfacing again

1. **The server does not compile today.** 15 files reference 25 non-existent modules. This is the highest-priority finding; it was masked by `dist/` being pre-built on 2026-05-03 from an earlier state of the codebase.
2. **Schema is fragmented across 6 sources** with `shopify_tokens` defined twice. The Database migration strategy assumes 4 sources; the gap is the 5 lazy/script tables that have grown since 2026-04-26.
3. **Migration strategy is sound in principle, unimplementable in practice.** See `new_database_issues.md` § 10. Three prerequisite gates (build, install, schema consolidation) must close before Drizzle adoption can begin.
4. **78 commits on the local branch are not on `origin/analysis-and-cleanup`.** A push would be safe (fast-forward-equivalent after the merge), but is gated on the build going green.

---

**End of suggestions.**
