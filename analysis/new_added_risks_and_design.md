# New, Added Risks & Design — Refresh 2026-05-20

> Companion to `dev_reports/19_05/`. Captures what `analysis-and-cleanup` looks like **after** the `origin/analysis-and-cleanup` merge (`ebff657`) and which findings in the prior memo (2026-05-09) are now stale or resolved.
>
> **Baseline:** `dev_reports/*.md` (root) were written at the divergence point `69b4352`. **Now:** `analysis-and-cleanup` @ `ebff657` is **34 commits ahead of `origin/main`** post-merge.
> **Numbers in this file are authoritative as of 2026-05-20.** Where any other doc disagrees, trust `dev_reports/19_05/`.

---

## 0. TL;DR vs the 2026-05-09 memo

| Then (2026-05-09) | Now (2026-05-20) |
|---|---|
| 31 routes registered, 36 services | **43 registered (32 files present — 4 broken)**, **82 services** |
| 42 tables across 4 sources | **71 tables across 6 sources** |
| Gateway only on `analysis-and-cleanup` | **Gateway merged.** 2 services still bypass |
| 8 cron schedules in-process | **13 cron schedules** in-process |
| Risk surface H–M (6 new) | **Plus Risk N — CRITICAL** (build broken) |
| Build state: assumed compiling | **Build broken** — 15 files, 25 missing modules |

The 2026-05-09 § 6 "things that have to be redone" list is now done: see `dev_reports/19_05/` for the refreshed numbers.

---

## 1. What landed on `main` since 2026-04-26 (cumulative through merge)

### 1.1 New product surface

| Area | What | Key files |
|---|---|---|
| Ad Command Dashboard MVP | New top-level frontend feature + backend route at `/ad-command`. Adds `creative_briefs`. | `server/src/routes/ad-command.ts`, `src/app/features/ad-command/ad-command.component.ts` |
| Shopify integration | OAuth route, encrypted-token client, audit ingestion. **`utils/encryption.js` missing — see Risk N.** | `server/src/routes/shopify.ts`, `server/src/services/shopify-client.ts`, `server/src/audit/shopify-ingestion.ts` |
| Client-aware analyst agents | Cohort LTV, Fatigue, Watchdog (cross-platform OOS), Discount Leakage, Creative Scorer, Competitor Creative Intelligence, Comment Mining, OOS Detector. Per-brand context, Smashed branding, branded HTML reports. | `cohort-ltv-analyzer.ts` (1,029), `fatigue-detector.ts`, `ad-watchdog.ts` (1,199), `discount-leakage-detector.ts` (914), `creative-scorer.ts` (1,192), `competitor-creative-intel.ts` (**2,614**), `comment-mining-agent.ts` (**1,818**), `oos-detector.ts` (1,284) |
| Strategic-cognition cluster | 9 new services under `services/strategic-cognition/`. **Four import `../signal-discovery/index.js` — missing (Risk N).** | `narrative-synthesis.ts` (1,177), `causal-intelligence.ts`, `competing-hypotheses.ts`, `recursive-investigator.ts`, `strategic-curiosity.ts`, `self-improving-cognition.ts`, `elite-decision-compression.ts`, `uncertainty-intelligence.ts`, `client-report-generator.ts` |
| Intelligence / quality cluster | 12 new services under `intelligence-layer/`, `quality-governance/`, `elite-intelligence/`. | (see `19_05/backend_wiring.md` § 3.4) |
| Operator experience + reality testing | Closed-loop telemetry and recommendation accuracy. | `operator-experience.ts` (**2,788**), `reality-testing.ts` (1,469), `learning-engine.ts` (1,236 — imports missing `client-references.js`) |
| Service-clients abstraction | Per-brand identity for agency-delivery. | `service-clients.ts` (952) |
| LLM gateway | **MERGED.** Single source of `new Anthropic({...})` for almost all callers. | `llm-gateway.ts` + `__tests__/llm-gateway.test.ts` (357 lines) |
| Cron tightening | Autopilot once-daily → every 4 h; Watchdog once-daily → every 6 h. **Same Node process.** Total cron schedules: 8 → 13. | commit `7c46f6e` |
| Scrapers (Python, ad-hoc) | ScrapeGraphAI + free crawler + ad-intel. | `scripts/ad-intel.py`, `crawl-free.py`, `scrape.py` |
| Ops scripts | ~18 `.mjs` scripts (`run-client-*.mjs`, `setup-pratapsons-client.mjs`, `test-*.mjs`). | `server/scripts/` |
| Tests | 35 server vitest suites (was 26). | `server/src/__tests__/*.test.ts` |

### 1.2 New schema rows

71 tables total across 6 source locations (was 40 across 3). The 25 new tables in `schema.ts` cluster around the agency-delivery model (`service_clients` as parent) and analyst output stores. **11 tables live outside `schema.ts`** (was 5):

- `add-shopify-tables.ts` — `shopify_tokens` (**duplicate** — also in `schema.ts:408-414`; Risk K).
- `add-audit-tables.ts` — `brands`, `brand_context`, `audits`.
- `services/client-context.ts` — `client_contexts` (lazy `ensureSchema`).
- `services/strategic-memory.ts` — `strategic_reports`, `strategic_recommendations`, `strategic_running_context`, `strategic_predictions` (all lazy).
- `services/audit-scheduler.ts` — `scheduled_audits` (lazy).
- `server/src/index.ts` — `waitlist_leads` (lazy, inside `/waitlist/join` handler).

A "fresh DB" produced by `createTables(new Database())` is missing those 11 tables until each owner is first called.

### 1.3 Route + service counts (post-merge)

- Imports in `index.ts`: 29 → **36**.
- `app.register` calls: 29 → **43**.
- Route files present in `server/src/routes/`: 29 → **32**.
- Services: 28 → **82**.
- **Critical mismatch.** 4 registrations point to files that do not exist: `routes/health-score.ts`, `routes/creative-scan.ts`, `routes/quick-wins.ts`, `routes/static-ads.ts`. This is the visible tip of Risk N.

---

## 2. New & amplified risks

### Risk N — Build is broken (NEW, CRITICAL — surfaced 2026-05-19)

**Finding.** 15 TypeScript files import 25 modules that do not exist anywhere in the working tree. Until these are resolved `tsc` cannot run; tests cannot run; Drizzle introspection cannot run. `dist/` and `server/dist/` were pre-built on 2026-05-03 from an older tree, masking the bug from anyone running the deployed bundle.

| File | Missing imports |
|---|---|
| `server/src/index.ts` | `./routes/health-score.js`, `./routes/creative-scan.js`, `./routes/quick-wins.js`, `./routes/static-ads.js` |
| `server/src/routes/shopify.ts`, `services/shopify-client.ts` | `../utils/encryption.js` |
| `services/ad-engine/*.ts` (4 files) | `./types.js`, `../client-references.js`, `../pattern-extractor.js`, `./templates.js` |
| `services/ad-watchdog.ts`, `services/report-agent.ts` | `./intelligence-integration.js` |
| `services/learning-engine.ts` | `./client-references.js` |
| `services/strategic-cognition/*.ts` (4 files) | `../signal-discovery/index.js` |
| `services/unified-agent-runner.ts` | 12 analyser files (`agent-brain.js`, `audience-saturation-analyzer.js`, …) |

**Treatment.** Owner-gated per-cluster: delete the importers, stub the missing modules, or recover from a sibling branch. **Until N closes, every other cleanup item is blocked.** Plan: `dev_reports/19_05/cleanup_suggestions.md` § S1.

### Risk H — God-file inflation (UPDATED — list grew)

**Finding.** Files >900 LOC continue to accumulate. The 2026-05-09 list cited the top five; the post-merge list adds three new tier-1 offenders (operator-experience, reality-testing, comment-mining):

| File | LOC | Tests? |
|---|---:|---|
| `services/operator-experience.ts` | **2,788** | no |
| `services/competitor-creative-intel.ts` | **2,614** | no |
| `services/comment-mining-agent.ts` | **1,818** | no |
| `services/reality-testing.ts` | 1,469 | no |
| `routes/ai.ts` | 1,379 | — |
| `routes/creative-engine.ts` | 1,641 | — |
| `index.ts` | 1,326 (was 1,287) | — |
| `services/oos-detector.ts` | 1,284 | yes |
| `services/learning-engine.ts` | 1,236 | no |
| `services/ad-watchdog.ts` | 1,199 | yes |
| `services/creative-scorer.ts` | 1,192 | no |
| `services/strategic-cognition/narrative-synthesis.ts` | 1,177 | no |
| `services/cohort-ltv-analyzer.ts` | 1,029 | no |
| `services/service-clients.ts` | 952 | no |
| `services/discount-leakage-detector.ts` | 914 | yes |

**Treatment.** `competitor-creative-intel.ts` remains the first concrete decomposition target — partly because Risk I forces it open for gateway wrapping anyway. The rest is deferred backlog.

### Risk I — Direct-Anthropic call sites bypass the cost gateway (PARTIALLY RESOLVED)

**Status:** **Mostly resolved.** The LLM gateway shipped on the cleanup branch (commit `1521cce`) and was merged today. 20 files now route through `createMessage(...)`. The original ~14-site projection in the 2026-05-09 memo undercounted — actual final state is much narrower. **Two services still bypass:**

```
$ grep -l "new Anthropic\b" server/src --include="*.ts" | grep -v __tests__
server/src/services/llm-gateway.ts            ← canonical owner (OK)
server/src/services/competitor-creative-intel.ts   ← bypass
server/src/services/comment-mining-agent.ts        ← bypass
```

**Why these two.** Combined they're 4,432 LOC with no tests. Each instantiates Anthropic at the top of the file and threads it through many private methods. Wrapping them is the S3.1/S3.2 task — ~1.5 days combined, smoke tests written first.

**Treatment.**
1. Wrap both with `createMessage(...)` from `services/llm-gateway.ts`. Plumb `userId` + `operation`.
2. Add CI grep guard banning direct `new Anthropic` outside the gateway.
3. Add the same guard for `import.*@anthropic-ai/sdk`.

### Risk J — Cron cadence raised without isolating cron from API (CONFIRMED, WORSE)

**Finding.** 13 cron schedules now run inside the API process (was 8). Cadence:

```
services/audit-scheduler.ts × 2
routes/autopilot.ts         × 1   ( */4 h, was daily)
routes/agent.ts             × 7   ( watchdog 6h, briefing 2h, weekly reports, etc.)
routes/reports.ts           × 1
routes/automations.ts       × 1
```

**Why it matters.** Risk B's once-daily cadence was already a stability concern. At 4–6 hour cadence any cron-induced API hang is visible to live requests, not buried at 1:30 AM. The 24/7-monitoring marketing claim now depends on infrastructure sized for once-a-day work.

**Treatment.** Promote Risk B from "partial / M4" to a P1 item. Cheapest viable extraction: split the same Docker image into two roles via env var (`ROLE=cron` vs `ROLE=api`), keep one codebase, factor `services/audit-scheduler.ts` callbacks into pure functions, add a thin worker entry. ~3–5 d + infra.

### Risk K — Schema drift between `schema.ts` and `add-shopify-tables.ts` (UNCHANGED)

**Finding.** `shopify_tokens` is defined in `server/src/db/schema.ts:408-414` *and* `server/scripts/add-shopify-tables.ts`. SQLite's `IF NOT EXISTS` masks the drift today.

**Treatment.** Delete the `CREATE TABLE shopify_tokens` block from `add-shopify-tables.ts` (keep any seed-row logic). Add a CI grep guard that fails if more than one file contains `CREATE TABLE IF NOT EXISTS shopify_tokens`. ~0.5 day. Plan: `19_05/cleanup_suggestions.md` § S2.2.

### Risk L — Operator scripts bypass production access controls (UPDATED — bigger surface)

**Finding.** ~18 `.mjs` scripts in `server/scripts/` (`run-client-*.mjs`, `setup-pratapsons-client.mjs`, `test-*.mjs`) execute outside the Fastify request lifecycle (no JWT, no `usage-limiter`, no rate-limit, no per-user $ cap). The 2026-05-09 memo estimated ~8.

**Why it matters.** Now the gateway has shipped, these scripts are the largest remaining gap in cost-ceiling enforcement.

**Treatment.** Owner-gated. Recommend Path A — `createMessage` accepts a synthetic `userId: 'operator:<name>'` principal and writes `cost_ledger` rows under that key. ~0.5 d gateway change + per-script plumbing.

### Risk M — Python scrapers without a dependency policy (UNCHANGED, low)

**Finding.** `scripts/ad-intel.py`, `crawl-free.py`, `scrape.py` add Python tooling for AI scraping (ScrapeGraphAI). No `requirements.txt`, no pinned versions, no CI gate.

**Treatment.** Either move scraping into the audited TypeScript surface, or pin Python deps (`requirements.txt`), wire into CI, document operator. Owner-gated; out of scope unless explicitly added.

---

## 3. Existing risks — status delta

| Risk | 2026-05-09 status | 2026-05-20 status |
|---|---|---|
| #1 SQLite + missing indexes | In scope | **Larger surface.** 40 → 71 tables; 51 indexes now exist; need fresh gap list via `EXPLAIN QUERY PLAN` |
| #2 Observability (console vs logger) | Stale ratios | **Recounted.** `console.*` 85 → **96**; `logger.*` 116 → **539** (4.6× — new analyst services adopted pino from day one); still no Sentry, no request-id hook |
| #3 `as any` casts | Stale count | **Recounted.** Production casts 35 → **78** (2.2×); none of the new analyst services declared explicit DB-row interfaces |
| A. JWT in localStorage | Design-only | Unchanged; design doc still pending — break window has closed, code can start |
| B. In-process cron | Partial | **Worse — see Risk J. Promoted to P1.** 13 schedules now (was 8) |
| C. No retry / circuit breaker | Partial | Worse: outbound tree grew by Shopify + 3 Python scrapers |
| D. God-files | OOS | **Worse — see Risk H.** Three tier-1 offenders >1,800 LOC each |
| E. LLM cost ceiling | In scope (carve-out) | **Mostly resolved.** Gateway merged. 2 services bypass — see Risk I |
| F. Custom column-only migrations | In scope | **Worse.** 13 → **19** `ensureColumn` calls |
| G. Single replica + SQLite-on-disk | In scope | Unchanged |

---

## 4. Design implications for the next 9 days

The merge has happened. The order of work is now driven by what unblocks `tsc`:

1. **Risk N is the bottleneck.** Until 25 missing modules are resolved no build-dependent work (tests, Drizzle introspection, migration script) can run. S1 takes 0.5–1 day given owner gates on disposition.
2. **Risk I is the last gateway gap.** Two services, 1.5 days. Then ship the CI guard so this hole can't reopen.
3. **Risk K is mechanical** (~0.5 d) and bundles into S2 schema-consolidation work.
4. **Risk J is no longer optional** if cadence rises further. Bundle the cron worker carve-out into the same image-role split.
5. **Operator scripts (Risk L) must be a first-class principal of the gateway**, not an exception. Plumb the synthetic `operator:<name>` userId once the gateway accepts it.
6. **Schema is bi-modal until S2 collapses the 11 outside-`schema.ts` tables** — Drizzle adoption cannot start before this lands.
7. **Decomposition target picked.** `competitor-creative-intel.ts` is the first concrete decomposition target on the post-cleanup roadmap, partly forced by Risk I.

---

## 5. Effort estimate for the new risks (H–N)

Rough engineering days, single engineer, steady pace. Each range assumes the prerequisite owner decisions land cleanly.

| Risk | Effort (days) | Type | Gate |
|---|---|---|---|
| **N. Build broken — 25 missing modules** | **0.5–1** | Per-cluster disposition | **OG-2 through OG-6** (5 cluster gates) |
| H. God-file inflation | 3–7 | Refactor + characterization tests | Owner approval (Risk D was OOS) |
| I. Wrap the last 2 Anthropic call sites | **1.5** | Smoke tests then mechanical wrap | None — extends Risk E (in scope) |
| J. Cron extraction | 3–5 + infra | Refactor + topology change | Owner approval (Risk B was partial) |
| K. `shopify_tokens` dual definition | ~0.5 | Cleanup + CI guard | None — under Risk F |
| L. Operator scripts vs gateway | ~0.5 | Plumbing once policy chosen | OG-7 |
| M. Python scrapers dep policy | 0.5–1.5 | Depends on chosen path | Owner decision |
| | **~9.5–17.5** | | |

### Per-risk notes (deltas from 2026-05-09)

**Risk N (NEW).** Disposition per cluster: routes (delete imports or stub), `utils/encryption.js` (likely repoint to existing `token-crypto.ts`), `ad-engine/` cluster (recover or delete folder), `signal-discovery/` cluster (recover or delete folder), `unified-agent-runner.ts` (delete file — 12 analysers were never written). The cheapest path through is "delete the importers" wherever no one downstream actually needs the feature.

**Risk I (was 1–2 d, now 1.5 d).** Inventory shrank from "wrap ~14 sites" to "wrap 2 services + add CI guard". The gateway already exists; this is per-call-site mechanical work plus smoke tests for the two un-tested services. The merge-conflict risk the 2026-05-09 memo warned about has been absorbed by the merge itself.

**Risk H (3–7 d).** List grew by three files (operator-experience, comment-mining, reality-testing). `competitor-creative-intel.ts` is still the first concrete decomposition target. Hard gate: Risk D remains "opportunistic cleanup only" in `scope_alignment.md`.

**Risk J, K, L, M.** Unchanged from 2026-05-09 in shape and effort.

### Bottom-line framing

- **Inside the current audit charter (S-prefix + P-phase work):** Risks N + I + K = **~2.5–3 d** of pre-P0 tidy-up. This sits in the S1–S3 phases.
- **Decision-gated, opt-in:** Risks H + J + L + M = **~7–14 d**, none authorised today. Best treated as a backlog the owner can pull from after M2.

---

## 6. Things that have been redone

The 2026-05-09 § 6 punch-list was the trigger for the `dev_reports/19_05/` refresh. All twelve items have been addressed:

- [x] **`backend_wiring.md`** — refreshed at `19_05/backend_wiring.md`. 43 registered / 32 present (4 broken) / 82 services / 13 cron schedules.
- [x] **`db_structure.md`** — refreshed at `19_05/db_structure.md`. 71 tables across 6 sources; per-table notes for the 25 new arrivals; `shopify_tokens` flagged as dual-source.
- [x] **`new_and_added_risks.md`** — refreshed at `19_05/new_and_added_risks.md`. Risks A–G updated, Risks H–N appended (N is new this session).
- [x] **`audit.md`** — refreshed at `19_05/audit.md`. `console.*` re-counted (96), `as any` re-counted (78), Risk N elevated as fatal.
- [x] **`guide.md`** — refreshed at `19_05/guide.md`. 376 files / 11,209 nodes / 84,530 edges; services list expanded.
- [x] **`scope_alignment.md`** — refreshed at `19_05/scope_alignment.md`. Post-break milestone-window status (M1 day 4 of 13).
- [x] **`rate_limiting/implementation_plan.md`** — refreshed. Records what shipped; remaining wrap work is the 2 bypass services.
- [x] **`structured_logging.md`** — refreshed. Recount: 96 console / 539 logger.
- [x] **`Database_migration_strat.md`** — refreshed and patched per `new_database_issues.md` § 8.
- [x] **`tasklist.md`** — refreshed. 20 → 39 items (adds S-prefix cleanup tasks).
- [x] **`final_report.md`** — refreshed. Re-baselined for M1 in progress.
- [x] **Knowledge graph** — rebuilt on `analysis-and-cleanup` post-merge (2026-05-19T19:52). 376 / 11,209 / 84,530.

Three new cross-cutting docs were also produced this session at the root of `dev_reports/`:
- `cleanup_plan.md` (831 lines) — full plan with 20-risk register + § 17 self-audit + § 18 merge record.
- `cleanup_suggestions.md` (365 lines) — S0–S7 step-by-step.
- `new_database_issues.md` (269 lines) — audit of `Database_migration_strat.md`.

---

## 7. Open owner gates (blocking)

Reproduced from `19_05/scope_alignment.md` § 6 for convenience. Without these the cleanup prefix cannot finish:

| ID | Question |
|---|---|
| OG-1 | OK to `sudo chown -R` over root-owned dirs (`server/data`, `server/node_modules`, …)? |
| OG-2 | Were the 4 missing routes (`health-score`, `creative-scan`, `quick-wins`, `static-ads`) ever written? Delete imports / stub / recover? |
| OG-3 | Was `intelligence-integration.ts` ever written? |
| OG-4 | Is the `ad-engine/` cluster still planned? |
| OG-5 | Is the `signal-discovery/` cluster still planned? |
| OG-6 | Are the 12 `unified-agent-runner.ts` analysers still planned? |
| OG-7 | Operator-script gateway policy — synthetic principal (A) or bypass flag (B)? |
| OG-8 | `dev_reports/` tracking policy — keep tracked (B) or untrack? |
| OG-9 | OK to archive-and-delete stale branches (`origin/claude/*` ×3, `dev`, `lean-devcontainer`)? |
| OG-10 | External links to root-level `.md` files before they move into `docs/`? |
| OG-11 | OK to patch `Database_migration_strat.md`? |

The first six (OG-1 through OG-6) are the only ones that block code work today.
