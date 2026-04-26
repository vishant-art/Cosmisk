# Final Report — 2026-04-26

Single source of truth for the academic-break analysis window (Apr 15 to May 15). Captures the scope decisions made today, summarises what is already delivered, and lists what is left to produce before May 15. Companion docs in `dev_reports/`: `audit.md`, `new_and_added_risks.md`, `suggested.md`, `tasklist.md`, `db_structure.md`, `backend_wiring.md`, `scope_alignment.md`, `guide.md`, `log.md`.

**Project state.** Branch `analysis-and-cleanup` at commit `fa0c87b`. 1 task done (#5, audit QA wasted-spend fix), 19 open. Repository is in pre-implementation analysis state. Today is day 12 of the break; **19 days remain until May 15**.

---

## 1. Scope decisions logged today (2026-04-26)

Two items previously flagged out of scope are now **in scope** by owner decision:

| Item | Was | Now | Task | Treatment for the break window |
|---|---|---|---|---|
| Added Risk A. JWT migration to httpOnly cookie + refresh rotation | Out of scope | **In scope** | #9 / P0.4 | **Design-only.** No code before May 16. |
| Added Risk E. Per-user LLM cost ceiling (rate limiting) | Out of scope | **In scope** | #8 / P0.3 | Recommended carve-out: ship the ~3 h code change now, pending explicit go-ahead. Otherwise May 16. |

Items still out of scope:

- Added Risk D (god-file decomposition, tasks #22 to #24). Track as opportunistic cleanup only.
- Added Risks B (in-process cron) and C (no retry / circuit breaker) remain *partially* in scope, bundled into Milestones 4 and 2 respectively. No change.

The break-window rule (analysis only, zero implementation) holds for everything else. The cost-ceiling carve-out is the only candidate code change between today and May 15.

---

## 2. Overall scope-mapping table

| Finding | Status | Note |
|---|---|---|
| Audit Risk 1. SQLite + missing indexes | In scope | Official Risk #1 |
| Audit Risk 2. Observability gap | In scope | Official Risk #2 |
| Audit Risk 3. `as any` casts | In scope | Official Risk #3 |
| Added Risk A. JWT cookie | **In scope (NEW)** | Owner-approved 2026-04-26. Design only during break. |
| Added Risk B. In-process cron | Partially in scope | Bundle into Milestone 4 (Automated Trigger Logic). |
| Added Risk C. Retry / circuit breaker | Partially in scope | Bundle into Milestones 2 and 4. |
| Added Risk D. God-files | Out of scope | Opportunistic cleanup only. |
| Added Risk E. LLM cost ceiling | **In scope (NEW)** | Owner-approved 2026-04-26. Carve-out candidate. |
| Added Risk F. Custom column-only migrations | In scope, free with Risk #1 | Resolved by Drizzle adoption. |
| Added Risk G. Single-replica + SQLite-on-disk | In scope, free with Risk #1 | Resolved by PG migration. |

Net: **5 fully in-scope items** (was 3), **2 partially in-scope**, **1 strictly out of scope**.

---

## 3. What is done so far

### 3.1 Reports delivered (all in `dev_reports/`)

| File | Purpose | Status |
|---|---|---|
| `audit.md` | Risk #1 / #2 / #3 verified against the codebase, with corrected counts. | ✅ done |
| `new_and_added_risks.md` | Seven additional risks (A through G) found during the audit. | ✅ done |
| `suggested.md` | Six-phase remediation plan (P0 to P5). | ✅ done |
| `tasklist.md` | 20-task list mirroring the in-conversation TaskList, with in-scope flags. | ✅ done. Needs flag edit per § 6 (cells for #8 and #9). |
| `db_structure.md` | Engineer reference for all 40 tables across 3 source files. Missing-index summary, JSON-as-TEXT inventory, FK gaps, enum candidates. | ✅ done |
| `backend_wiring.md` | Engineer reference. Fastify boot sequence, all 29 route modules, 28 services, six end-to-end flows, fragility punch-list. | ✅ done |
| `scope_alignment.md` | Mapping of audit findings against the official Apr-15 SoW + academic-break milestones. | ✅ done. Superseded on items A and E by this report. |
| `guide.md` | Codebase + infra guide (stack, deployment, security posture, infra flaws). | ✅ done |
| `log.md` | Daily work log. | ✅ done |
| `final_report.md` (this file) | Final status + roadmap to May 15. | ✅ done |
| `CONTINUE.md` | Session-resume notes. | ✅ done |

### 3.2 Code changes already on this branch

Pre-existing commits on `analysis-and-cleanup` (none of these are part of the cleanup phases; they predate the audit):

| Commit | Change |
|---|---|
| `fa0c87b` | chore: init cleanup |
| `69b4352` | Fix wasted spend validation logic in QA validator |
| `1a2ff6e` | Add comprehensive data validation to audit QA system |
| `6731182` | Add PDF export for audit reports |
| `e4a052a` | Wire frontend audit to backend API + add summary report |

No Phase 0 to 5 work has touched the repo. The only sanctioned code change still on the table for the break window is the cost-ceiling carve-out (§ 5.4).

### 3.3 In-conversation TaskList state

20 tasks total. **1 done (#5), 19 open.** Open tasks split by phase:

- Phase 0 (4 tasks): #6 P0.1, #7 P0.2, #8 P0.3, #9 P0.4.
- Phase 1 (2 tasks): #10 P1.1, #11 P1.2.
- Phase 2 (5 tasks): #12 P2.1, #13 P2.2, #14 P2.3, #15 P2.4, #16 P2.5.
- Phase 3 (2 tasks): #17 P3.1, #18 P3.2.
- Phase 4 (3 tasks): #19 P4.1, #20 P4.2, #21 P4.3.
- Phase 5 (3 tasks, out of scope): #22 P5.1, #23 P5.2, #24 P5.3.

---

## 4. What is left to deliver before May 15

19 days remain. All items are analysis-only except the cost-ceiling carve-out (gated on owner go-ahead).

### 4.1 Required deliverables (to be produced during the break)

| # | Deliverable | Why | Estimate | Status |
|---|---|---|---|---|
| D1 | **Detailed PG schema design** for Milestone 1 | Lets May 16 start at "run migrations," not "design tables." Column types, FK rules, enum types, index list, seed strategy, JSON-to-jsonb mapping, boolean-as-INT to real boolean, timestamp-as-TEXT to `timestamptz`. Inputs are already in `db_structure.md` (40 tables, missing-index summary, F1 to F8 cross-cutting findings). | 5 days | Pending |
| D2 | **Sentry + request-id design doc** | Vendor (Sentry self-hosted vs cloud), DSN handling, server SDK + browser SDK setup, release tagging, source-map upload from Vercel build, Fastify request-id hook design, `console.*` to `logger.*` migration plan covering 85 sites. | 2 day | Pending |
| D3 | **Cookie-auth design doc** | Formally required after the JWT scope inclusion. Six sections listed in § 5.3. | 2.5 day | Pending |
| D4 | **Cost-ceiling design doc** | Helper signature, `cost_ledger` query plan, plan-tier cap config, error response shape, integration points (`routes/ai.ts`, `routes/agent.ts`, score / audit / report agent services). | 3 day | Pending |
| D5 | **`tasklist.md` scope-flag edit** | Flip the `*` markers on #8 and #9 to reflect the new in-scope status. | every time 10 mins | Pending. Needs go-ahead per workflow rule. |
| D6 | **Updated `log.md` entry for 2026-04-26** | Capture the scope decisions and final-report delivery. | every time 10 mins | Pending |

Total analysis effort: **~12-13 days of focused writing**. Comfortable inside the 19-day window with buffer for revisions and the open-question discussions in § 7.
## 3. What is done so far

### 3.1 Reports delivered (all in `dev_reports/`)

| File | Purpose | Status |
|---|---|---|
| `audit.md` | Risk #1 / #2 / #3 verified against the codebase, with corrected counts. | ✅ done |
| `new_and_added_risks.md` | Seven additional risks (A through G) found during the audit. | ✅ done |
| `suggested.md` | Six-phase remediation plan (P0 to P5). | ✅ done |
| `tasklist.md` | 20-task list mirroring the in-conversation TaskList, with in-scope flags. | ✅ done. Needs flag edit per § 6 (cells for #8 and #9). |
| `db_structure.md` | Engineer reference for all 40 tables across 3 source files. Missing-index summary, JSON-as-TEXT inventory, FK gaps, enum candidates. | ✅ done |
| `backend_wiring.md` | Engineer reference. Fastify boot sequence, all 29 route modules, 28 services, six end-to-end flows, fragility punch-list. | ✅ done |
| `scope_alignment.md` | Mapping of audit findings against the official Apr-15 SoW + academic-break milestones. | ✅ done. Superseded on items A and E by this report. |
| `guide.md` | Codebase + infra guide (stack, deployment, security posture, infra flaws). | ✅ done |
| `log.md` | Daily work log. | ✅ done |
| `final_report.md` (this file) | Final status + roadmap to May 15. | ✅ done |
| `CONTINUE.md` | Session-resume notes. | ✅ done |

### 3.2 Code changes already on this branch

Pre-existing commits on `analysis-and-cleanup` (none of these are part of the cleanup phases; they predate the audit):

| Commit | Change |
|---|---|
| `fa0c87b` | chore: init cleanup |
| `69b4352` | Fix wasted spend validation logic in QA validator |
| `1a2ff6e` | Add comprehensive data validation to audit QA system |
| `6731182` | Add PDF export for audit reports |
| `e4a052a` | Wire frontend audit to backend API + add summary report |

No Phase 0 to 5 work has touched the repo. The only sanctioned code change still on the table for the break window is the cost-ceiling carve-out (§ 5.4).

### 3.3 In-conversation TaskList state

20 tasks total. **1 done (#5), 19 open.** Open tasks split by phase:

- Phase 0 (4 tasks): #6 P0.1, #7 P0.2, #8 P0.3, #9 P0.4.
- Phase 1 (2 tasks): #10 P1.1, #11 P1.2.
- Phase 2 (5 tasks): #12 P2.1, #13 P2.2, #14 P2.3, #15 P2.4, #16 P2.5.
- Phase 3 (2 tasks): #17 P3.1, #18 P3.2.
- Phase 4 (3 tasks): #19 P4.1, #20 P4.2, #21 P4.3.
- Phase 5 (3 tasks, out of scope): #22 P5.1, #23 P5.2, #24 P5.3.

---

## 4. What is left to deliver before May 15

19 days remain. All items are analysis-only except the cost-ceiling carve-out (gated on owner go-ahead).

### 4.1 Required deliverables (to be produced during the break)

| # | Deliverable | Why | Estimate | Status |
|---|---|---|---|---|
| D1 | **Detailed PG schema design** for Milestone 1 | Lets May 16 start at "run migrations," not "design tables." Column types, FK rules, enum types, index list, seed strategy, JSON-to-jsonb mapping, boolean-as-INT to real boolean, timestamp-as-TEXT to `timestamptz`. Inputs are already in `db_structure.md` (40 tables, missing-index summary, F1 to F8 cross-cutting findings). | 2 days | Pending |
| D2 | **Sentry + request-id design doc** | Vendor (Sentry self-hosted vs cloud), DSN handling, server SDK + browser SDK setup, release tagging, source-map upload from Vercel build, Fastify request-id hook design, `console.*` to `logger.*` migration plan covering 85 sites. | 0.5 day | Pending |
| D3 | **Cookie-auth design doc** | Formally required after the JWT scope inclusion. Six sections listed in § 5.3. | 1 day | Pending |
| D4 | **Cost-ceiling design doc** | Helper signature, `cost_ledger` query plan, plan-tier cap config, error response shape, integration points (`routes/ai.ts`, `routes/agent.ts`, score / audit / report agent services). | 0.5 day | Pending |
| D5 | **`tasklist.md` scope-flag edit** | Flip the `*` markers on #8 and #9 to reflect the new in-scope status. | 5 min | Pending. Needs go-ahead per workflow rule. |
| D6 | **Updated `log.md` entry for 2026-04-26** | Capture the scope decisions and final-report delivery. | 5 min | Pending |

Total analysis effort: **~4 days of focused writing**. Comfortable inside the 19-day window with buffer for revisions and the open-question discussions in § 7.

### 4.2 Optional carve-out (gated on explicit go)

| # | Item | Effort | Status |
|---|---|---|---|
| C1 | **LLM cost-ceiling code (#8 / P0.3)** | ~3 h code + ~0.5 day tests | Pending owner go / no-go. See § 5.4. |

### 4.3 Decisions needed from owner

These do not require new docs but unblock the deliverables above:

- Cost-ceiling carve-out go / no-go (C1).
- Cookie-auth design depth: doc only, or doc + schema migration draft (additive `tokenVersion`).
- Bundling B and C into Milestones 4 and 2 (confirm intent).
- Deploy target (Railway-only vs Railway + Render vs Fly.io). Drives the Postgres pick.
- Redis vs pg-boss for Phase 3.
- Cookie-domain confirmation (`cosmisk.com` zone shared between frontend and API, or cross-site).

---

## 5. Detail on the four design docs and the carve-out

### 5.1 D1. PG schema design (Milestone 1 input)

Inputs already in `db_structure.md`:

- Per-table reference for all 40 tables, grouped by domain.
- F1 missing-index summary (13 tables, 16 indexes to add).
- F2 JSON-as-TEXT inventory (32 columns to convert to `jsonb`).
- F3 missing FK constraints (5 tables).
- F4 enum candidates (~25 columns).
- F5 boolean-as-INT (6 columns).
- F6 timestamp-as-TEXT (every `created_at` / `updated_at`).
- F7 stale-row / TTL gaps (6 tables).
- F8 schema fragmentation (40 tables across 4 source files).

What the doc needs to add on top of `db_structure.md`:

- Final column-type decisions for every table (concrete `varchar(n)` vs `text`, `numeric(p, s)` vs `int`, `bytea` vs `text` for ciphertext).
- Enum type definitions (one section per enum: `user_role`, `plan_tier`, `subscription_status`, `gateway`, `creative_status`, `creative_format`, `agent_type`, `agent_status`, etc.).
- FK constraint table (parent, child, on-delete, on-update).
- Migration-1 SQL skeleton (no application code yet, just `CREATE TABLE` + `CREATE INDEX` + `CREATE TYPE`).
- Seed strategy: replace the hardcoded brand seed in `add-audit-tables.ts` with a real `POST /brands/create` route on the May 16 work.
- Out-of-`schema.ts` consolidation list: `brands`, `brand_context`, `audits`, `shopify_tokens`, `scheduled_audits`, `waitlist_leads`. Each one moves into the canonical Drizzle schema.

### 5.2 D2. Sentry + request-id design

Sections to cover:

- Vendor pick (Sentry SaaS vs GlitchTip self-host) and projected event volume.
- Server SDK setup (`@sentry/node`, `requestHandler`, `errorHandler` on Fastify, `ProfilingIntegration` optional).
- Browser SDK setup (`@sentry/angular-ivy`, route-change tracing, `ErrorHandler` provider).
- Release tagging from CI (`SENTRY_RELEASE` from git sha, source-map upload step).
- `unhandledRejection` and `uncaughtException` handlers (currently absent in `index.ts`).
- Request-id Fastify hook design (header in / header out, Pino bindings, propagation to `request.log`).
- `console.*` migration plan: 85 call sites identified in audit. Bulk-replace with `request.log.*` inside route handlers, `logger.*` inside services, fail the build with an ESLint rule (`no-console`) once done.

### 5.3 D3. Cookie-auth design

Six required sections:

1. **Cookie strategy.** httpOnly + `Secure` always. `SameSite` choice (Lax vs None) driven by the cross-site cookie requirement between `cosmisk.com` and `api.cosmisk.com`. Parent-domain (`Domain=.cosmisk.com`) preferred if both domains share the zone.
2. **Refresh-token model.** Decision between (a) short-lived access JWT (15 to 60 min) plus opaque refresh token in DB with rotation, or (b) sliding-window JWT plus `users.tokenVersion` for instant revocation. Trade-offs captured.
3. **`tokenVersion` schema change.** Additive `INT NOT NULL DEFAULT 0` column on `users`. Bump on password change, on explicit logout-all, on role demotion. Verified at every `request.jwtVerify()` via a custom hook.
4. **CSRF approach.** Double-submit cookie pattern preferred (no server state, fits existing CORS allow-list). Document which routes need it (`POST` / `PUT` / `PATCH` / `DELETE` only, exempt webhooks already verified by HMAC).
5. **Cutover plan.** Grace window during which both `Authorization: Bearer` and cookie are accepted; forced-logout day; OAuth callback redirect impact on Meta / Google / TikTok flows; Razorpay / Stripe webhooks unaffected (no auth header, signature-verified).
6. **Test plan.** Playwright auth specs (login, refresh, logout, password-reset, OAuth round-trip), per-route smoke confirming cookie carries over, regression check on the reviewer-account seed flow.

Sub-finding to fold in: `routes/schedules.ts` (`/schedules/start`, `/schedules/stop`, etc.) currently has **no JWT auth**. Add `preHandler: [app.authenticate]` to all four endpoints during the May 16 implementation. No additional design needed.

### 5.4 D4. Cost-ceiling design + C1 carve-out

The design doc covers:

- Helper signature: `checkAndConsumeCost(userId, provider, estimatedCents): Promise<void>` throws `429` on cap breach.
- `cost_ledger` query: aggregate by `(user_id, date_trunc('day', created_at))`. Today this is a full scan (no index per `db_structure.md` § 11). For SQLite era, add `idx_cost_ledger_user_day` as part of the same change. This single index is independently useful and lives in P1.1.
- Plan-tier cap config: per-plan dollar ceiling (free, basic, growth, enterprise).
- Error response shape: `429 {error: 'daily_llm_cap', current_cents, cap_cents, resets_at}`.
- Integration points: `routes/ai.ts` (chat, briefing), `routes/agent.ts` (8 agent run endpoints), `services/audit-agent.ts`, `services/creative-scorer.ts`, `services/report-agent.ts`, `services/sales-agent.ts`, `services/content-agent.ts`, `services/creative-strategist.ts`. The job-queue path already has its own check (`checkDailyCostLimit`); align both to the same helper if possible, or document why they stay separate.

The C1 carve-out, if approved, ships only the helper + preHandlers + the new index. Cap config can stay conservative (a single hard cap such as $5/day/user) and be tuned post-break. Tests cover: under-cap path, at-cap path, over-cap 429, ledger row written. No public API change beyond adding the 429 response.

---

## 6. `tasklist.md` flag edit (D5)

Two cells to flip:

| Task | Phase | Old flag | New flag |
|---|---|---|---|
| #8 P0.3 Per-user daily LLM cost ceiling | Phase 0 | `*` Added Risk E (out of scope) | ✅ In scope (Added Risk E, owner-approved 2026-04-26) |
| #9 P0.4 Move JWT to httpOnly cookie + refresh rotation | Phase 0 | `*` Added Risk A (out of scope) | ✅ In scope (Added Risk A, owner-approved 2026-04-26) |

All other entries unchanged. Phase 5 (#22 to #24) remains starred / out of scope. Per the workflow rule, this report does not edit `tasklist.md` itself. Say the word and I will apply the two flag changes.

---

## 7. Phase-0 plan after the scope change (post-break)

With A and E formally in scope, Phase 0 is now four sanctioned items:

| ID | Item | Effort | Window |
|---|---|---|---|
| #6 P0.1 | Wire Sentry on server + browser, capture `unhandledRejection` / `uncaughtException` | ~0.5 day | Starts May 16 |
| #7 P0.2 | Request-id Fastify hook + replace 85 `console.*` calls with structured logger | ~1 day | Starts May 16, blocked by #6 |
| #8 P0.3 | Per-user daily LLM cost ceiling on `routes/ai.ts` + `routes/agent.ts` + agent services | ~3 h code + ~0.5 day tests | **Carve-out candidate now**. Otherwise May 16. |
| #9 P0.4 | JWT to httpOnly cookie + refresh rotation + `tokenVersion` + CSRF + auth fix on `/schedules/*` | ~2 to 3 days | Code starts May 16. Design only during break. |

Order on May 16: P0.4 first (auth surface stable before any other code touches it), P0.1 + P0.2 in parallel, P0.3 if not already shipped. P1 indexes (#10, #11) can run alongside Phase 0.

---

## 8. Open questions on the table

1. **Cost-ceiling carve-out (C1).** Explicit go / no-go on writing the ~3 h of code now versus waiting until May 16. *My recommendation: go.*
2. **Cookie-auth design depth.** Design doc only, or design doc plus schema migration draft (additive `tokenVersion INT NOT NULL DEFAULT 0` on `users`) so May 16 starts at code, not design? *Schema is additive and break-safe; I would include it.*
3. **Bundling B and C.** Confirm intent to fold "in-process cron to queue" into Milestone 4 and "retry / circuit breaker" into Milestones 2 and 4, rather than carrying them as separate scope.
4. **Deploy-target decision.** Railway-only vs Railway + Render vs Fly.io. Drives the Postgres pick (Neon, Railway PG, Supabase) for Milestone 1.
5. **Redis budget.** Needed if Phase 3 lands as BullMQ; optional if pg-boss. Affects Milestone 4 implementation choice.
6. **Cookie-domain assumption.** Confirm whether `cosmisk.com` and `api.cosmisk.com` will both stay under the `cosmisk.com` zone (cookie strategy simplifies considerably) or whether a cross-site setup is in play long-term.

---

## 9. Summary

**Done:** 11 reports, all 3 official audit risks verified, 7 added risks documented, full DB + backend reference, six-phase remediation plan, 20-item task list with scope flags, scope decisions on Risks A and E logged.

**Left for the break window (19 days):** 4 design docs (D1 to D4, ~4 days work), 1 small file edit (D5), 1 log entry (D6). Optional ~3 h cost-ceiling code carve-out (C1), gated on explicit go-ahead.

**Implementation status:** zero Phase 0 to 5 code on the branch. Earliest sanctioned implementation is May 16, the start of Milestone 1.
