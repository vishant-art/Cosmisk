# Additional Risks Found — 2026-04-26

Seven risks not in the original three-item audit. Ordered by blast radius.

---

## A. JWT stored in `localStorage` (XSS-extractable)

**Where:** `src/app/core/services/meta-oauth.service.spec.ts` references `cosmisk_token` in `localStorage`. `server/src/plugins/auth.ts` issues tokens with `expiresIn: '7d'`, no jti, no refresh-token rotation, no revocation list.

**Risk:** Any XSS — a malicious npm dep, a stored-XSS in user-controlled content, a Chrome extension — exfiltrates the JWT and gets 7 days of full account access. No way to invalidate a leaked token short of rotating `JWT_SECRET` and forcing every user to re-login.

**Solution direction:** Move session token to `httpOnly` + `SameSite=Lax` + `Secure` cookie. Add CSRF token on state-changing routes. Shorten access token to 15–60 min, add a refresh token with rotation, store a per-user `tokenVersion` for instant revocation.

---

## B. In-process cron jobs (single-instance fragility)

**Where:** 8 `cron.schedule(...)` calls in `server/src/routes/agent.ts`. `services/audit-scheduler.ts` constructs `CronJob` instances inside the API process.

**Risk:**
- Two replicas → cron jobs fire twice (duplicate billing reports, duplicate AI calls, duplicate emails).
- One replica → jobs miss firing windows during deploys/restarts.
- A crashing cron job tears down or destabilizes the API process.
- No central observability for cron failures.

Only `recoverInterruptedSprints()` has restart recovery; the rest assume the process never restarts.

**Solution direction:** Move to **BullMQ on Redis** or **pg-boss on Postgres**. Workers run in a separate process from the API. Repeatable jobs replace cron schedules. Failed jobs go to a dead-letter queue with Sentry/Slack alerts.

---

## C. No retry/backoff or circuit breaker on external APIs

**Where:** `server/src/utils/safe-fetch.ts` — has timeout + AbortController, but **no retry, no backoff, no circuit breaker**.

**Risk:** The system depends on ~13 external providers (Anthropic, Gemini, Meta Graph, Google Ads, TikTok Ads, Stripe, Razorpay, ElevenLabs, Heygen, Kling, Creatify, Flux, NanoBanana, n8n, Slack, Resend). One transient 503 from Gemini = user sees a hard error. A degraded provider keeps draining latency budget instead of failing fast.

**Solution direction:** Add exponential backoff + jitter retry (3 attempts, 5xx and network only), per-provider circuit breaker (`opossum` or `cockatiel`), per-provider Sentry tags. Mark non-idempotent calls (Stripe charge, Razorpay capture, email send) with idempotency keys before adding retries.

---

## D. God-files / decomposition debt

**Where:**

| File | LOC |
|---|---|
| `src/app/features/landing/landing.component.ts` | 1920 |
| `server/src/routes/creative-engine.ts` | 1641 |
| `src/app/features/dashboard/dashboard.component.ts` | 1244 |
| `src/app/features/pitch-deck/pitch-deck.component.ts` | 1214 |
| `src/app/features/creative-cockpit/creative-cockpit.component.ts` | 1133 |
| `src/app/features/settings/settings.component.ts` | 1119 |
| `server/src/index.ts` | 1287 |
| `server/src/routes/ai.ts` | 1371 |

**Risk:** Slow review cycles, churn-prone tests, hard to onboard, hard to lazy-load on the frontend (large main bundle), high change-risk per edit. Architecture-graph already flags 387 cross-edges between `routes` and `services-generate`.

**Solution direction:** Decompose by feature folder. Start with `server/src/index.ts` (extract route registration + ad-hoc endpoints into proper modules) and `landing.component.ts` (split into 4–6 standalone Angular components, each lazy-loaded if possible).

---

## E. Cost ceilings only on creative jobs

**Where:** `server/src/services/job-queue.ts` checks daily spend before dispatching. No equivalent guard in `routes/ai.ts` (1371 LOC of LLM endpoints), `routes/agent.ts`, scoring services, or audit pipelines.

**Risk:** A leaked JWT or a runaway frontend bug can issue unlimited LLM calls. Anthropic/Gemini bills are uncapped per user. Bad actors can also burn your free-tier quota with a few signups.

**Solution direction:** Centralize a `checkAndConsumeCost(userId, provider, estimatedCents)` helper backed by the existing `cost_ledger` table. Wrap every paid-LLM route with it. Add a daily-cap config per plan tier; deny with 429 once exceeded.

---

## F. Custom column-only migrations

**Where:** `server/src/db/schema.ts` — `addColumn()` shim idempotently adds columns. No migration ledger, no rename/drop path, no down migrations, no version history.

**Risk:** Renames silently become "add new + leave orphan". Dropping a column requires manual SQL. The Postgres cutover (Phase 2) cannot be reproduced or rolled back without a real tool.

**Solution direction:** Adopt **Drizzle Kit** migrations once Drizzle is in. For the SQLite era, freeze schema changes to additive-only.

---

## G. Single-replica deployment + SQLite-on-disk

**Where:** `railway.toml`: `restartPolicyMaxRetries = 3`, healthcheck only. `databasePath: './data/cosmisk.db'`.

**Risk:**
- Disk loss on the Railway instance = data loss. No replication.
- No documented backup cadence in the repo.
- Deploys cause downtime.
- Cannot scale out under load — the cron + SQLite combo prevents it.

**Solution direction:** This resolves itself once Phase 2 (Postgres) ships. Until then: enable scheduled disk snapshots, document a restore drill, and put the SQLite file on a persistent volume (verify it actually is).
