# Final Scope Report — 2026-04-26

**Supersedes:** `scope_alignment.md` (same date) on the two scope items called out in §1. Every other claim in `scope_alignment.md` still holds, including the academic-break (Apr 15 to May 15) analysis-only constraint.

**Context:** Cosmisk Project Documentation (Apr 15, 2026). Branch `analysis-and-cleanup`, last commit `fa0c87b`. Today is 2026-04-26, day 12 of the academic exam break.

**Companion docs (all in `dev_reports/`):** `audit.md`, `new_and_added_risks.md`, `suggested.md`, `tasklist.md`, `db_structure.md`, `backend_wiring.md`, `scope_alignment.md`, `guide.md`, `log.md`.

---

## 1. What changed since `scope_alignment.md`

Two items previously flagged out of scope are now **in scope** by owner decision (lemon, 2026-04-26):

| Item | Was | Now | Task ID |
|---|---|---|---|
| Added Risk A. JWT migration to httpOnly cookie + refresh rotation | Out of scope | **In scope** | #9 / P0.4 |
| Added Risk E. Per-user LLM cost ceiling (rate limiting) | Out of scope | **In scope** | #8 / P0.3 |

Captured reasoning, for the record:

- **JWT migration.** The current `localStorage.cosmisk_token` is a 7-day, fully privileged credential extractable by any XSS, rogue browser extension, or compromised npm dependency. There is no server-side revocation. Folding this into the formal plan closes the largest unbounded auth-blast-radius in the system before user growth picks up.
- **LLM cost ceiling.** Spend caps exist only for the creative pipeline (`services/job-queue.ts checkDailyCostLimit`). `routes/ai.ts` (1371 LOC of LLM endpoints) and `routes/agent.ts` are uncapped per user. With Anthropic and Gemini billed pay-as-you-go, a leaked token or a runaway client can drain the project budget in hours. Now part of the formal plan, not a discretionary carve-out.

Items still out of scope:

- Added Risk D. God-file decomposition (tasks #22 P5.1, #23 P5.2, #24 P5.3). Track as opportunistic cleanup only.
- Added Risks B (in-process cron) and C (no retry / circuit breaker) remain *partially* in scope, bundled into Milestones 4 and 2 respectively. No change.

---

## 2. Updated scope-mapping table

| Finding | Status | Note |
|---|---|---|
| Audit Risk 1. SQLite + missing indexes | In scope | Official Risk #1 |
| Audit Risk 2. Observability gap | In scope | Official Risk #2 |
| Audit Risk 3. `as any` casts | In scope | Official Risk #3 |
| Added Risk A. JWT cookie | **In scope (NEW)** | Owner-approved 2026-04-26 |
| Added Risk B. In-process cron | Partially in scope | Bundle into Milestone 4 (Automated Trigger Logic) |
| Added Risk C. Retry / circuit breaker | Partially in scope | Bundle into Milestones 2 and 4 |
| Added Risk D. God-files | Out of scope | Opportunistic cleanup only |
| Added Risk E. LLM cost ceiling | **In scope (NEW)** | Owner-approved 2026-04-26 |
| Added Risk F. Custom column-only migrations | In scope, free with Risk #1 | Resolved by Drizzle adoption |
| Added Risk G. Single-replica + SQLite-on-disk | In scope, free with Risk #1 | Resolved by PG migration |

Net: **5 fully in-scope items** (was 3), **2 partially in-scope**, **1 strictly out of scope**.

---

## 3. Implications for the academic-break window (Apr 15 to May 15)

The break-window rule (analysis only, zero implementation) **still holds**. Bringing two items into scope does not by itself unlock code work during the break. The remaining decision is whether either item warrants a defensive carve-out before May 16.

### 3.1 LLM cost ceiling (#8 / P0.3)

`scope_alignment.md` § 3 already proposed this as an Option B carve-out (~3 hours of code, near-zero blast radius, defensive against runaway spend during exams). With the item now formally in scope, the carve-out argument is stronger:

- **Defensive, not feature work.** It does not add capability; it removes the ability to overspend. Closer to a P0 bug fix than to milestone implementation.
- **Self-protective.** A runaway LLM bill during exam break is precisely the incident that derails the rest of the plan.
- **Bounded change.** A single helper (`checkAndConsumeCost(userId, provider, estimatedCents)`) wired into the existing `cost_ledger` table, plus `preHandler` decorators on `routes/ai.ts` and `routes/agent.ts`. No schema change, no migration, no public API change.

**Recommendation:** ship the cost ceiling now, inside the break window. Treat it as the single sanctioned code change between today and May 15. Per workflow rule, this needs an explicit go before any code is written.

### 3.2 JWT cookie migration (#9 / P0.4)

Different shape from the cost ceiling, and not a candidate for a break-window carve-out:

- **Touches the auth boundary.** Server cookie set/clear, client interceptor changes, CSRF token plumbing, refresh-token rotation, `tokenVersion` column on `users`, all OAuth callback redirects (Meta, Google, TikTok).
- **User-visible.** Every existing session is invalidated at cutover, or needs a one-time bridge that issues a cookie alongside the existing JWT for some grace period.
- **Cross-cutting tests.** Auth flow, every protected route, and Playwright E2E specs all need updating.
- **Domain split.** Frontend on Vercel (`cosmisk.com`), API on Railway (`api.cosmisk.com`). Cookie domain scoping is a real design decision (parent-domain cookie vs CORS-friendly cross-site cookie with `SameSite=None; Secure`).

That is a 2 to 3 day change with non-trivial blast radius. It does not fit the "P0 hotfix" framing the cost ceiling does. Carving it out of the break window stretches the analysis-only rule past breaking.

**Recommendation:** keep JWT migration as a **design-only deliverable during the break**, ship the code on May 16 as the first item of Milestone 1, before the PG migration starts.

Specifically, produce during the break:

1. **Cookie strategy doc.** httpOnly + `Secure` always. `SameSite` choice (Lax vs None) driven by the cross-site cookie requirement between `cosmisk.com` and `api.cosmisk.com`. If they share a parent zone (e.g., both under `cosmisk.com`), `SameSite=Lax` with `Domain=.cosmisk.com` is cleanest. If not, `SameSite=None; Secure` with explicit CSRF defence.
2. **Refresh-token model.** Decision between (a) short-lived access JWT (15 to 60 min) plus opaque refresh token in DB with rotation, or (b) sliding-window JWT plus `users.tokenVersion` for instant revocation. Capture the trade-offs.
3. **`tokenVersion` schema change.** Additive `INT NOT NULL DEFAULT 0` column on `users`. Bump on password change, on explicit logout-all, on role demotion. Verified at every `request.jwtVerify()` via a custom hook.
4. **CSRF approach.** Double-submit cookie pattern preferred (no server state, fits existing CORS allow-list). Document which routes need it (`POST` / `PUT` / `PATCH` / `DELETE` only, exempt webhooks already verified by HMAC).
5. **Cutover plan.** Grace window during which both `Authorization: Bearer` and cookie are accepted; forced-logout day; OAuth callback redirect impact on Meta / Google / TikTok flows; Razorpay / Stripe webhooks unaffected (no auth header, signature-verified).
6. **Test plan.** Playwright auth specs (login, refresh, logout, password-reset, OAuth round-trip), per-route smoke confirming cookie carries over, regression check on the reviewer-account seed flow.

Then May 16: implement against the design, with one full E2E pass before merging.

### 3.3 Note on `routes/schedules.ts`

Sub-finding from `backend_wiring.md` § 3: `/schedules/start` and `/schedules/stop` have **no JWT auth**. Anyone reaching that endpoint can stop the audit scheduler. This was previously suggested for inclusion in the cookie-auth scope. With JWT migration now in scope, fold this fix into the same work item: while updating the auth surface, add `preHandler: [app.authenticate]` to all four `/schedules/*` endpoints. No additional design needed.

---

## 4. Updated tasklist scope flags

`tasklist.md` should be updated so the following lose their `*` out-of-scope marker:

| Task | Phase | Old flag | New flag |
|---|---|---|---|
| #8 P0.3 Per-user daily LLM cost ceiling | Phase 0 | `*` Added Risk E (out of scope) | ✅ In scope (Added Risk E, owner-approved 2026-04-26) |
| #9 P0.4 Move JWT to httpOnly cookie + refresh rotation | Phase 0 | `*` Added Risk A (out of scope) | ✅ In scope (Added Risk A, owner-approved 2026-04-26) |

All other entries unchanged. Phase 5 (#22 to #24) remains starred / out of scope.

Per the workflow rule, this file does **not** itself edit `tasklist.md`. Say the word and I will apply the two flag changes.

---

## 5. Updated deliverables for the Apr 15 to May 15 window

| Deliverable | Status |
|---|---|
| `audit.md` | ✅ done |
| `new_and_added_risks.md` | ✅ done |
| `suggested.md` | ✅ done |
| `tasklist.md` | ✅ done (needs scope-flag edit per § 4) |
| `db_structure.md` | ✅ done |
| `backend_wiring.md` | ✅ done |
| `scope_alignment.md` | ✅ done |
| `final_report.md` (this file) | ✅ done |
| Detailed PG schema design (Milestone 1 input) | Pending |
| Sentry + request-id design doc | Pending |
| **Cookie-auth design doc** (now formally required, see § 3.2) | Pending |
| **Cost-ceiling design doc + ~3 h code carve-out** (per § 3.1) | Pending. Needs explicit go-ahead before code touches the repo. |
| Scope-extension memo | No longer needed for items A and E (now approved). Still useful if you want B and C formally bundled into Milestones 4 and 2. |

---

## 6. Phase-0 plan after the scope change

Phase 0 in `suggested.md` originally had four items. With A and E now formally in scope, all four are sanctioned work:

| ID | Item | Effort | Window |
|---|---|---|---|
| #6 P0.1 | Wire Sentry on server + browser, capture `unhandledRejection` / `uncaughtException` | ~0.5 day | Starts May 16 |
| #7 P0.2 | Request-id Fastify hook + replace 85 `console.*` calls with structured logger | ~1 day | Starts May 16, blocked by #6 |
| #8 P0.3 | Per-user daily LLM cost ceiling on `routes/ai.ts` + `routes/agent.ts` (and audit / score services) | ~3 h code + ~0.5 day tests | **Recommended carve-out: ship now**. Otherwise May 16. |
| #9 P0.4 | JWT to httpOnly cookie + refresh rotation + `tokenVersion` + CSRF + auth fix on `/schedules/*` | ~2 to 3 days | Design now, code May 16 |

Order on May 16: P0.4 first (auth surface stable before any other code touches it), P0.1 + P0.2 in parallel, P0.3 if not already shipped. P1 indexes can run alongside P0.

---

## 7. Open questions still on the table

Carried from `scope_alignment.md` and prior conversation, narrowed by the scope decisions made today:

1. **Cost-ceiling carve-out.** Explicit go / no-go on writing the ~3 h of code now versus waiting until May 16. (My recommendation: go.)
2. **Cookie-auth design depth.** Design doc only, or also schema migration draft (additive `tokenVersion INT NOT NULL DEFAULT 0` on `users`) so May 16 starts at code, not design? Schema is additive and break-safe; I would include it.
3. **Bundling B and C.** Confirm intent to fold "in-process cron to queue" into Milestone 4 and "retry / circuit breaker" into Milestones 2 and 4, rather than carrying them as separate scope.
4. **Deploy-target decision.** Railway-only vs Railway + Render vs Fly.io, since it changes the Postgres choice (Neon, Railway PG, Supabase) for Milestone 1.
5. **Redis budget.** Needed if Phase 3 lands as BullMQ; optional if pg-boss. Affects Milestone 4 implementation choice.
6. **Cookie domain assumption.** Confirm whether `cosmisk.com` and `api.cosmisk.com` will both stay under the `cosmisk.com` zone (cookie strategy simplifies considerably) or whether a cross-site setup is in play long-term.

---

## 8. Project-state snapshot (unchanged since last report)

- Branch `analysis-and-cleanup` at commit `fa0c87b`. No Phase 0 to 5 implementation on this branch beyond prior audit-API + PDF export + QA-validator commits.
- 1 task done, 19 open in `tasklist.md`.
- Architecture-graph stats: 290 files, 3,369 nodes, 33,360 edges, 19 communities, 8 high-coupling warnings.
- Repository remains in pre-implementation analysis state through May 15, with the single possible exception of the cost-ceiling carve-out called out in § 3.1.
