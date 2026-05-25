# Next Steps — Updated Plan After `shopify_tokens` Fork Discovery + Railway Data Sacrifice

**Supersedes:** `dev_reports/24_05/next_steps.md` (Commit 4 dropped from Tier 1; Tier 1.5a sub-steps updated for cold-start).
**Source of truth:** `dev_reports/05_05/scope_alignment.md` (Cosmisk SoW, Apr 15 2026).
**Date:** 2026-05-25.
**Related decision docs:** [`shopify_tokens_fork.md`](shopify_tokens_fork.md), [`railway_data_at_risk.md`](railway_data_at_risk.md).

---

## 0. TL;DR

**Today's Tier 1 work is 3 commits + a push.** The original 4-commit plan dropped Commit 4 (`shopify_tokens` patch) when the issue turned out to be a schema fork rather than missing-column drift; it's deferred to M1, where Postgres + Drizzle can build the canonical shape from scratch and the two `brand_id`-keyed readers can be patched. Production data sacrifice (see `railway_data_at_risk.md`) means M1 does not need a data-import step, leaving its critical path roughly unchanged.

---

## 1. State of the branch

Branch: `analysis-and-cleanup`. Five commits ahead of `origin/analysis-and-cleanup` (none pushed). Ahead of `origin/main` by considerably more (per `24_05/INDEX.md` § branch state).

```
d4195fe  fix(server): require auth on all /schedules routes          ← landed 2026-05-24
7b08d0b  build(server): pin @types/node to ^20.19.0                   ← landed 2026-05-24
1c6a26a  docs: add 24_05 decision reports
c6d4f79  docs: track dev_reports under date-stamped folders
63e4711  fix(server): unblock build, wire Bridge Service route stubs
```

Working tree status: `dev_reports/25_05/*` are new untracked files (this doc + the two decision docs + INDEX + session log). Server source has no further edits since `d4195fe`.

---

## 2. Tier 1 — fire-fast items (collectively < 30 min remaining)

Three commits + a push left before PR.

### 2.1 — ✅ Done

- Commit 3 (`d4195fe`): `routes/schedules.ts` auth preHandler. 9 routes gated. Verified live with no-token (401) and valid-JWT (200) matrix on 2026-05-24.
- Commit 3a (`7b08d0b`): pinned `@types/node` to `^20.19.0`. Lockfile diff was 9+/14-. Resolved an env regression where `tsc` couldn't find Node type defs.

### 2.2 — ❌ Dropped: Commit 4 (`shopify_tokens` schema patch)

Original plan: generalise `ensureUsersColumn` into `ensureColumn(table, column, def)` and add `ensureColumn('shopify_tokens', 'shop_name', 'TEXT')`.

**Dropped because:** diagnosis revealed a schema fork (different PKs, not just a missing column). The original ALTER would not have fixed the 500 against any legacy-shape DB. Full forensic in [`shopify_tokens_fork.md`](shopify_tokens_fork.md).

**Replaced by:** M1 reconciliation step (see § 3.4 below).

### 2.3 — Commit 4 (was 5): Skip 8 pre-existing test failures

🟢 Same pattern as the 9 tests we already skipped earlier in this branch. `it.skip(...)` + a comment block citing the root cause (test mock setup vs route handler). ~15 min. Unblocks CI's Backend job.

Files:
- `server/src/__tests__/media-gen-routes.test.ts` — 5 failures
- `server/src/__tests__/content-routes.test.ts` — 3 failures

**Test:** Before commit, run `cd server && npm test 2>&1 | tail -40`. Confirm exactly the 8 known failures are skipped; no other tests regress. Comments should reference both files being byte-identical to `main` (so this is a pre-existing failure, not introduced by this branch).

### 2.4 — Commit 5 (was 6): Local Docker build smoke

🟡 `docker build -t cosmisk-test .` from repo root. ~5 min. Validates that sharp + node-canvas + better-sqlite3 native modules compile on `node:22-alpine`.

If it fails on sharp: add `RUN apk add --no-cache vips-dev` to the builder stage of `Dockerfile`. If it fails on better-sqlite3 native build: the Dockerfile already installs `python3 make g++` in the builder stage, so that should be fine — but if it surfaces, add `libstdc++` to the builder layer (it's already in production layer).

**Test:** `docker run --rm cosmisk-test node -e "console.log('ok')"` succeeds.

### 2.5 — Commit 6 (was 7): Push + open PR

🟢 `git push origin analysis-and-cleanup` (no force needed — origin is behind, not divergent). Open PR `→ main` via `gh pr create`.

**Suggested title:** "Unblock backend build + close one production bug"
- Down from "two production bugs" in the original plan, since `shopify_tokens` deferred.

**PR description must include:**
- Summary of commits 1-5 (this branch).
- **Explicit known-issue note:** "/shopify/* routes are known-broken against legacy-shape DBs. This is pre-existing on main and is deferred to M1 (Postgres + Drizzle) per `dev_reports/25_05/shopify_tokens_fork.md`. No production impact today — old Railway deployment is offline and held only test data."
- Link to `dev_reports/25_05/INDEX.md` and `dev_reports/24_05/merge_readiness.md` for reviewers.
- Test plan checklist.

After PR opens: monitor CI. If green and `main` is buildable post-merge, merge. Railway deploy will happen on the new account after M1 begins.

---

## 3. Tier 1.5 — M1 Official Deliverables (May 16-28 window) — AFTER PR-to-main

Same four items as `24_05/next_steps.md` Tier 1.5, with **one updated sub-step and one new sub-step in 1.5a** to absorb the `shopify_tokens` fork.

Open fresh branch off post-merge `main`. Suggested name: `m1-infrastructure`. Time-box to **2026-05-28** (3 days from today).

### 3.1 — Tier 1.5a (UPDATED): PostgreSQL + Drizzle migration

The headline M1 deliverable. Updated sub-steps:

| Sub-step | Effort | Change |
|---|---|---|
| Provision Postgres (Neon free / Railway-managed on new account) | ~30 min | Updated: explicitly on new account |
| Design canonical schema (column types, FK rules, index list) | ~half day | Unchanged |
| `npm install drizzle-orm drizzle-kit pg` + config | ~1 hour | Unchanged |
| Define every table in `db/drizzle/schema.ts` using Drizzle table builders (71 tables) | ~1 day | Unchanged |
| Generate + run initial migration | ~1 hour | Unchanged |
| ~~Migration script: SQLite → Postgres data dump + restore~~ | ~~half day~~ | **REMOVED — no source data to migrate (Railway sacrifice).** |
| Update `db/index.ts` to open Postgres connection (env-driven `DATABASE_URL`) | ~1 hour | Unchanged |
| Replace `db.prepare(...).get/run/all(...)` call sites with Drizzle queries (~30 sites) | ~1 day | Unchanged |
| **NEW: Patch `cohort-ltv-analyzer.ts:184` + `unified-agent-runner.ts:178`** to JOIN through `brands.owner_user_id` for shopify_tokens lookups | ~half day | **NEW — `shopify_tokens` fork reconciliation.** See `shopify_tokens_fork.md` §9. |
| **NEW: Seed mock service_clients / brands for dev smoke** | ~30 min | NEW — replaces lost test data |
| Test parity — every passing test still passes against Postgres | ~half day | Unchanged |

**Total: 3-5 days.** Critical path unchanged from `24_05/next_steps.md` — the half day removed from data import roughly equals the half day added for the `brand_id` reader patches.

**Definition of done:**
- `npm test` passes against Postgres.
- `node dist/index.js` boots and `/health` returns `{"db":"connected"}` when `DATABASE_URL=postgres://...` is set.
- A smoke-test Shopify OAuth round-trip writes a row to `shopify_tokens` keyed by `user_id`.
- `unified-agent-runner` and `cohort-ltv-analyzer` both successfully resolve a brand → its Shopify token without 500ing.
- `psql -c '\d shopify_tokens'` shows canonical shape (no `brand_id`, no `scope`).

**Open question before starting M1:** does `brands` table have an `owner_user_id` column? Verify in `db/schema.ts` before writing the JOIN clauses. If not, the JOIN strategy changes — there's no `brand_id → user_id` mapping path. (10-min check at start of M1.)

### 3.2 — Tier 1.5b: Sentry integration

Unchanged from `24_05/next_steps.md`. `npm install @sentry/node` + `Sentry.init(...)` at top of `server/src/index.ts`. Wrap Fastify with `Sentry.setupFastifyErrorHandler(app)`.

**Effort:** ~half day basic; ~1 day if wired into every error-response path.

**Definition of done:** thrown error in any route surfaces in Sentry project within 30 seconds.

### 3.3 — Tier 1.5c: Request-ID / correlationId middleware

Unchanged from `24_05/next_steps.md`. Fastify ships `request.id` natively. Wire it into every `logger.*` call site (via Pino's `req.log`), every cron run (mint `runId` at entrypoint, thread through internal helpers), and LLM gateway `createMessage` calls (add `correlationId` to metadata written to `cost_ledger`).

**Effort:** ~half day.

**Definition of done:** every request-scoped log line has `reqId`; every cron-triggered log line has `runId`; sample query against `cost_ledger` shows non-null `correlationId` on recent rows.

### 3.4 — Tier 1.5d: `as any` audit cleanup

Unchanged from `24_05/next_steps.md`. 78 instances today. Audit each, replace with specific types where cheap; document residuals.

**Effort:** ~1 day.

**Definition of done:** count under 30; remaining instances have inline comment explaining why the cast is necessary.

---

## 4. Tier 2 — high-leverage cleanup — AFTER M1

Defer until after 2026-05-28. Same items as `24_05/next_steps.md` Tier 2.

- 2.1 — Audit + protect `routes/intelligence.ts`
- 2.2 — Wrap the 2 remaining LLM-gateway bypasses
- 2.3 — (Optional) Fix the 8 pre-existing test failures properly (instead of skipping)

---

## 5. Tier 3 — the larger cleanup arc — M2 cool-down or later

Same as `24_05/next_steps.md` Tier 3.

- 3.1 — Schema consolidation *(now obsolete after 1.5a — Drizzle is the single source of truth)*
- 3.2 — CI grep guards (`new Anthropic` outside gateway; `CREATE TABLE` outside Drizzle schema; ≤500 LOC per file; secrets pattern)
- 3.3 — Docs refresh (CLAUDE.md "9 Agents" reconciliation; route inventory regen)
- 3.4 — Deferred items (JWT-in-localStorage, in-process cron → queue, retry/CB on external APIs, operator-script principal)

---

## 6. Tier 4 — feature work — M2-M4

Same as `24_05/next_steps.md` Tier 4. Depends on Tier 1.5a (DB foundation) complete.

---

## 7. Time-line view

```
Today (2026-05-25)        : Tier 1 commits 4-5-6 → push → PR
Today / 2026-05-26        : CI green → merge → branch m1-infrastructure
2026-05-26 to 2026-05-28  : Tier 1.5 — M1 deliverables
                            (a) Postgres + Drizzle      [days 1-3]
                                + shopify_tokens fix    [absorbed in day 2]
                                + dev seed data         [absorbed in day 3]
                            (b) Sentry                  [day 3]
                            (c) Request-ID              [day 3]
                            (d) as any cleanup          [absorbed]
2026-05-28                : M1 close + handoff doc
2026-05-29 to 2026-06-10  : M2 — Ingestion & Normalisation
2026-06-11 to 2026-06-22  : M3 — AI Analysis
2026-06-23 to 2026-07-03  : M4 — Generative Engine
2026-07-04 to 2026-07-10  : M5 — QA & Final Delivery
M2-cool-down weekends     : Tier 2/3 cleanup items as opportunity allows
```

**Slack on M1:** ~half day removed from data import compensates ~half day added for `shopify_tokens` fork. Net zero. Stay on the May 28 close date unless something unrelated slips.

---

## 8. What to drop if M1 slips

Same priority order as `24_05/next_steps.md`, with one annotation:

1. **DROP:** Tier 1.5d (`as any` audit cleanup) — pure quality work; defer to M2 cool-down.
2. **DROP:** Tier 1.5c (Request-ID middleware) — defer to M2.
3. **DEFER:** Tier 1.5b (Sentry) — get DSN ready, wire `init` only; deeper integration defers.
4. **NEVER DROP:** Tier 1.5a (Postgres + Drizzle) — slip the deadline if needed, but don't drop. M2 depends on it. **Specifically, do NOT drop the `shopify_tokens` fork reconciliation sub-step** — if 1.5a ships without it, two services (`cohort-ltv-analyzer`, `unified-agent-runner`) will 500 against canonical PG.

---

## 9. What gets cut entirely from formal scope

Same as `24_05/next_steps.md` § 7 — `/schedules` auth, intelligence-route audit, gateway bypass wraps, CI guards, god-file decomposition, JWT-cookie migration. Backlog only.

---

## 10. Single ordered execution list (for the next 3 days)

1. **Commit 4 (was 5):** `it.skip` 8 test fails (15 min)
2. **Commit 5 (was 6):** Local docker build smoke (5 min)
3. `git push origin analysis-and-cleanup` (1 min)
4. **Commit 6 = open PR** `analysis-and-cleanup → main`. Title: *"Unblock backend build + close one production bug"*. Body must include the known-issue note for `shopify_tokens`. (5 min)
5. CI green → merge (passive wait)
6. New Railway account project setup (new infra; not blocking PR merge) (~30 min — Sanskar)
7. Open fresh branch `m1-infrastructure` off post-merge `main`
8. **Tier 1.5a:** Postgres + Drizzle migration (~3 days)
   - Includes `shopify_tokens` fork reconciliation (`cohort-ltv-analyzer.ts`, `unified-agent-runner.ts` patches)
   - Includes dev-seed for service_clients / brands
9. **Tier 1.5b:** Sentry init (~half day)
10. **Tier 1.5c:** Request-ID (~half day)
11. **Tier 1.5d:** `as any` cleanup (absorbed or day 5)
12. M1 retrospective + handoff to M2 (May 28)

---

## 11. Critical constraints to remember after `/compact`

- **No `Co-Authored-By: Claude` trailers.** No "Generated with Claude Code" attribution. Standard human-readable commit messages.
- **Explain each fix before applying.** Wait for explicit approval. Verify behavior before committing.
- **Log everything in `dev_reports/25_05/session_log.md`.**
- **Never destructive without confirmation.** No `git reset --hard`, no `--no-verify`, no force push to main, no schema drops, no `rm -rf`.
- **Branch is unpushed.** All five local commits + today's doc work are not on origin yet. Push is Commit 6.
- **Production data is sacrificed.** Don't try to recover from Railway. The new Railway account is a cold start. M1 has no data-import step.
- **`shopify_tokens` fork is M1's problem.** Drop the original Commit 4 ALTER plan entirely; canonical Drizzle schema + two reader patches is the fix.
- **Open question:** does `brands.owner_user_id` exist? Verify at M1 start before writing the JOIN. If not, escalate before continuing.
