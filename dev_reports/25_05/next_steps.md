> **Status: ♻️ SUPERSEDED (2026-05-31)** — May-25 plan; Tier-1 commits were implemented, but its shopify_tokens deferral/JOIN assumptions were later invalidated. Superseded by `31_05/next_steps.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

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

## 2. Tier 1 — fire-fast items

Two steps left before PR (docker smoke + push & PR). Everything before is committed.

### 2.1 — ✅ Done

- Commit 3 (`d4195fe`): `routes/schedules.ts` auth preHandler. 9 routes gated. Verified live with no-token (401) and valid-JWT (200) matrix on 2026-05-24.
- Commit 3a (`7b08d0b`): pinned `@types/node` to `^20.19.0`. Lockfile diff was 9+/14-. Resolved an env regression where `tsc` couldn't find Node type defs.
- Commit 4 (`270366e`): Skipped 8 pre-existing test failures (`media-gen-routes` ×5, `content-routes` ×3) with root-cause comments pointing at ON_HOLD.md items 2 and 3. `tsc --noEmit` clean. Pushed to origin on 2026-05-25 14:35.
- Commit 5a (`0f2adbc`): Committed the 25_05 dev_reports set plus the top-level `ON_HOLD.md`. +1374 lines.
- Commit 5b (`c4012f9`): Merged `origin/main` (8 commits we had been missing since May 14). Resolved 4 conflicts: CLAUDE.md → theirs (thin freeze version); pattern-extractor → theirs (full Gemini Vision impl, strict superset of our stub); llm-gateway → ours (rate-limited `createMessage` API); ad-watchdog → manual (kept main's Factual Validation hook, rewrote LLM call to use our new API). Post-merge fixes: extended `AgentType` (added `'inventory' | 'audience'`), created `static-ad-generator.ts` stub. Both fixes resolved tsc errors that existed on main too.

### 2.2 — ❌ Dropped: Commit 4 (`shopify_tokens` schema patch)

Original plan: generalise `ensureUsersColumn` into `ensureColumn(table, column, def)` and add `ensureColumn('shopify_tokens', 'shop_name', 'TEXT')`.

**Dropped because:** diagnosis revealed a schema fork (different PKs, not just a missing column). The original ALTER would not have fixed the 500 against any legacy-shape DB. Full forensic in [`shopify_tokens_fork.md`](shopify_tokens_fork.md).

**Replaced by:** M1 reconciliation step (see § 3.1 below).

### 2.3 — Step 5c: Local Docker verification (NOT a commit by default)

This is a **verification step**, not a commit. A commit only happens if the build or test run surfaces an issue and we have to change the Dockerfile.

**Build smoke:**
```bash
docker build -t cosmisk-test .
```
~10 min on cold cache. Validates that `sharp@^0.33.5` (uses precompiled `@img/sharp-libvips-linuxmusl-x64`) and `better-sqlite3@^11.7.0` (compiled via `python3 make g++` in the builder stage) install cleanly on `node:22-alpine`.

**Container-run tests (vitest workaround):**
```bash
docker run --rm -w /app/server cosmisk-test npm test 2>&1 | tail -60
```
Confirm: 8 known skips, no new failures. The container has no WSL2 syscall layer, so vitest runs clean (ON_HOLD item 6).

**Result branches:**
- ✅ Both pass → no commit. Proceed to Commit 6.
- ❌ Build fails on sharp → add `RUN apk add --no-cache vips-dev` to the builder stage; that becomes Commit 5d (Dockerfile fix).
- ❌ Build fails on better-sqlite3 native → unlikely (deps already present), but if it surfaces, add `libstdc++` to the builder layer. Commit 5d.
- ❌ Container `npm test` shows a 9th unknown failure → triage. Either fix or add to ON_HOLD before PR.

### 2.4 — Commit 6: Push + open PR (the only commit-level step left if 5c is clean)

🟢 `git push origin analysis-and-cleanup`. The first push of this session went through (`1a7a04e → 270366e`); this second push covers `0f2adbc` (docs) + `c4012f9` (merge) + whatever 5c adds. No force needed — fast-forward only.

Open PR `→ main` via `gh pr create`.

**Suggested title:** "Unblock backend build + close one production bug"
- Down from "two production bugs" in the original plan, since `shopify_tokens` deferred.

**PR description must include:**
- Summary of commits 1-5 (this branch).
- **Known-issue list (linking to ON_HOLD.md):**
  - `/shopify/*` routes are known-broken against legacy-shape DBs (ON_HOLD item 1) — deferred to M1. No production impact today (old Railway sacrificed).
  - 8 pre-existing tests skipped (ON_HOLD items 2 + 3) — real fix in M2.
  - Stripe types resolution error in `routes/billing.ts:4` (ON_HOLD item 4) — runtime unaffected.
  - Vitest bus-errors on WSL2 (ON_HOLD item 6) — CI/Docker is test-authoritative.
  - `static-ad-generator.ts` is a stub (ON_HOLD item 13) — orchestrator's static-ad codepath is a no-op pending M2 impl.
  - Watchdog reasoning moved from Gemini Flash to Claude Sonnet via the new gateway (ON_HOLD item 13) — costlier but functionally identical.
- Link to `dev_reports/25_05/INDEX.md`, `dev_reports/24_05/merge_readiness.md`, and `dev_reports/ON_HOLD.md` for reviewers.
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

1. ✅ **Commit 4** (`270366e`): `it.skip` 8 test fails — done, pushed.
2. ✅ **Commit 5a** (`0f2adbc`): dev_reports + ON_HOLD — done, LOCAL.
3. ✅ **Commit 5b** (`c4012f9`): merge `origin/main` + post-merge fixes — done, LOCAL.
4. **Step 5c (verification, not a commit):** `docker build` + `docker run npm test`. Pass → continue. Fail → fix Dockerfile, that's Commit 5d.
5. `git push origin analysis-and-cleanup` (1 min) — pushes `0f2adbc`, `c4012f9`, plus 5d if a Dockerfile fix was needed.
6. **Commit 6 = open PR** `analysis-and-cleanup → main`. Title: *"Unblock backend build + close one production bug"*. Body must include the known-issues list (all M0 ON_HOLD items referenced). (5 min)
7. CI green → merge (passive wait)
8. New Railway account project setup (new infra; not blocking PR merge) (~30 min — Sanskar)
9. Open fresh branch `m1-infrastructure` off post-merge `main`
10. **Tier 1.5a:** Postgres + Drizzle migration (~3 days)
    - Includes `shopify_tokens` fork reconciliation (`cohort-ltv-analyzer.ts`, `unified-agent-runner.ts` patches)
    - Includes dev-seed for service_clients / brands
11. **Tier 1.5b:** Sentry init (~half day)
12. **Tier 1.5c:** Request-ID (~half day)
13. **Tier 1.5d:** `as any` cleanup (absorbed or day 5)
14. M1 retrospective + handoff to M2 (May 28)

---

## 11. Critical constraints to remember after `/compact`

- **No `Co-Authored-By: Claude` trailers.** No "Generated with Claude Code" attribution. Standard human-readable commit messages.
- **Explain each fix before applying.** Wait for explicit approval. Verify behavior before committing.
- **Log everything in `dev_reports/25_05/session_log.md`.**
- **Never destructive without confirmation.** No `git reset --hard`, no `--no-verify`, no force push to main, no schema drops, no `rm -rf`.
- **Push state:** `270366e` (and everything before it) is on remote. `0f2adbc` and `c4012f9` are LOCAL only. Re-push before opening PR.
- **Production data is sacrificed.** Don't try to recover from Railway. The new Railway account is a cold start. M1 has no data-import step.
- **`shopify_tokens` fork is M1's problem.** Drop the original Commit 4 ALTER plan entirely; canonical Drizzle schema + two reader patches is the fix.
- **Open question:** does `brands.owner_user_id` exist? Verify at M1 start before writing the JOIN. If not, escalate before continuing.
- **CLAUDE.md is now the thin freeze version on this branch.** Took main's 112-line version during merge. The fat engineering version lives in git history (any commit before `c4012f9`'s first-parent ancestor).
- **AgentType extended:** added `'inventory' | 'audience'` to the union at `server/src/types/index.ts:341` to fix pre-existing main-side tsc errors.
- **`static-ad-generator.ts` is a stub.** `agent-orchestrator.ts:275` imports it dynamically. Stub returns `{ generated: [] }`. Full impl is ON_HOLD item 13 (M2).
- **Vitest bus-errors on this WSL2 host.** ON_HOLD item 6. Use Docker container or `NODE_OPTIONS="--jitless --no-opt"` for local runs. CI is authoritative.
