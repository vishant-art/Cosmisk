> **Status: ♻️ SUPERSEDED (2026-05-31)** — Apr-26 academic-break status snapshot. Superseded by `19_05/final_report.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Final Report — 2026-04-26

## Unique essence preserved

**Scope decision logged 2026-04-26 (owner-approved):**
- Added Risk A — JWT → httpOnly cookie + refresh rotation (#9 / P0.4): OUT → **IN scope**. Design-only during break, no code before May 16.
- Added Risk E — per-user LLM cost ceiling (#8 / P0.3): OUT → **IN scope**. Carve-out candidate (ship ~3h now pending go-ahead).
- Net: **5 fully in-scope** (was 3), 2 partial (Risk B in-process cron → M4; Risk C retry/circuit-breaker → M2+M4), 1 strictly out (Risk D god-files).
- Risk F — custom column-only migrations: IN scope, free with Risk #1, resolved by Drizzle. Risk G — single-replica + SQLite-on-disk: IN scope, free with Risk #1, resolved by PG migration. (Both restated in successor `19_05/final_report.md` §6.)
- Break-window rule = analysis only, zero implementation. Only sanctioned code candidate = cost-ceiling carve-out C1 (~3h code + ~0.5d tests).

**Project state:** branch `analysis-and-cleanup` @ `fa0c87b`. 1 task done (#5 audit QA wasted-spend fix), 19 open. Day 12 of break, 19 days to May 15.
- Pre-audit branch commits: `fa0c87b` init cleanup · `69b4352` fix wasted-spend validation in QA validator · `1a2ff6e` data validation in audit QA · `6731182` PDF export for audit reports · `e4a052a` wire frontend audit to backend API + summary report.
- TaskList 20 tasks: P0 #6-#9 · P1 #10-#11 · P2 #12-#16 · P3 #17-#18 · P4 #19-#21 · P5 (out of scope) #22-#24.

**D4 cost-ceiling design + C1 carve-out:**
- Helper `checkAndConsumeCost(userId, provider, estimatedCents): Promise<void>` throws `429`.
- `cost_ledger` aggregate by `(user_id, date_trunc('day', created_at))` — currently full scan (no index, db_structure.md §11). Add `idx_cost_ledger_user_day` (lives in P1.1).
- Error shape: `429 {error:'daily_llm_cap', current_cents, cap_cents, resets_at}`. Conservative single cap $5/day/user is only the C1 carve-out default, tune post-break.
- **Plan-tier cap config (full design, not just flat cap):** per-plan dollar ceiling — free, basic, growth, enterprise — each with its own daily cap; the flat $5/day is the conservative carve-out default until tiered config lands.
- Integration points: `routes/ai.ts` (chat, briefing), `routes/agent.ts` (8 agent endpoints), `services/`: audit-agent, creative-scorer, report-agent, sales-agent, content-agent, creative-strategist. Job-queue path already has `checkDailyCostLimit` — align to same helper or document why separate.

**D3 cookie-auth:**
- **Refresh-token model is a DECISION between two options:** (a) short-lived access JWT (15-60 min) + opaque refresh token stored in DB with rotation, vs (b) sliding-window JWT + `users.tokenVersion` for instant revocation — trade-offs captured (DB round-trip + rotation complexity vs no instant per-token revocation). Successor `19_05/final_report.md` notes the cookie design doc is STILL PENDING, so this decision is recorded only here.
- `tokenVersion` additive `INT NOT NULL DEFAULT 0` on `users`; bump on password change / logout-all / role demotion; verified at every `request.jwtVerify()` via custom hook.
- CSRF: double-submit cookie on POST/PUT/PATCH/DELETE; exempt HMAC-verified webhooks. SameSite Lax-vs-None driven by `cosmisk.com`↔`api.cosmisk.com` cross-site; `Domain=.cosmisk.com` if shared zone.
- **Cutover plan:** grace window accepting both `Authorization: Bearer` and cookie during transition; a forced-logout day to retire bearer tokens; OAuth callback redirect impact on Meta/Google/TikTok flows must be checked; Razorpay/Stripe webhooks unaffected (signature-verified, carry no auth header).
- **Test plan:** Playwright auth specs (login, refresh, logout, password-reset, OAuth round-trip) + per-route cookie smoke + reviewer-account seed-flow regression check.
- Sub-finding: `routes/schedules.ts` (`/schedules/start`, `/stop`, 4 endpoints) has **NO JWT auth** — add `preHandler:[app.authenticate]` during May 16 work.

**D2 Sentry + request-id:**
- 85 `console.*` call sites to migrate (`request.log.*` in routes, `logger.*` in services, enforce ESLint `no-console`).
- `unhandledRejection`/`uncaughtException` handlers currently absent in `index.ts`. Vendor: Sentry SaaS vs GlitchTip self-host.
- **Concrete design (not shipped, not in successor):** server SDK `@sentry/node` (requestHandler/errorHandler, optional ProfilingIntegration); browser SDK `@sentry/angular-ivy` with route-change tracing; release tagging via `SENTRY_RELEASE` from git sha + source-map upload from the Vercel build.

**D1 PG schema inputs (db_structure.md, 40 tables / 3 source files):**
- F1 missing-index: 13 tables / 16 indexes · F2 JSON-as-TEXT: 32 cols → jsonb · F3 missing FK: 5 tables · F4 enum candidates: ~25 cols · F5 boolean-as-INT: 6 cols · F6 timestamp-as-TEXT: all created_at/updated_at · F7 stale-row/TTL: 6 tables · F8 fragmentation: 40 tables across 4 source files.
- Out-of-`schema.ts` consolidation list: `brands`, `brand_context`, `audits`, `shopify_tokens`, `scheduled_audits`, `waitlist_leads` → canonical Drizzle schema.
- Seed: replace hardcoded brand seed in `add-audit-tables.ts` with real `POST /brands/create` route (May 16).
- backend_wiring.md: Fastify boot, 29 route modules, 28 services, six end-to-end flows.

**Deliverables before May 15 (~12-13d in 19d window):** D1 PG schema (5d) · D2 Sentry+req-id (2d) · D3 cookie-auth (2.5d) · D4 cost-ceiling (3d) · D5 tasklist flag edit · D6 log entry.

**May-16 Phase-0 order:** P0.4 first (auth surface stable), P0.1+P0.2 parallel, P0.3 if not shipped; P1 indexes #10/#11 alongside. Effort: #6 ~0.5d · #7 ~1d (blocked by #6) · #8 ~3h+0.5d · #9 ~2-3d.

**Open decisions needed:** C1 go/no-go (recommend go) · cookie-auth doc-only vs +tokenVersion migration draft (recommend include, break-safe) · confirm B→M4 / C→M2+M4 bundling · deploy target Railway vs Railway+Render vs Fly.io (drives Postgres pick Neon/Railway PG/Supabase) · Redis(BullMQ) vs pg-boss for Phase 3 · cookie-domain shared-zone confirmation.

## Pointer
- SUPERSEDED → see: `19_05/final_report.md`
