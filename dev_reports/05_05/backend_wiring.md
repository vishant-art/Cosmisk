> **Status: ♻️ SUPERSEDED (2026-05-31)** — Apr-26 backend wiring reference. Superseded by `19_05/backend_wiring.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Backend Wiring & Flows — Engineer Reference (2026-04-26)

## Unique essence preserved

**Pre-Postgres snapshot:** Fastify (Node 22, ESM, TS strict), `better-sqlite3`, `@anthropic-ai/sdk`, Angular 17 on Vercel. `index.ts` bootstrap = **1287 LOC**. Single Node process; cron runs **inside** the API process, no separate worker (Added Risk B).

**Boot step 0 — config:** load dotenv, build typed config object (`config.ts`); **refuse to start in production with a default `JWT_SECRET` or `tokenEncryptionKey`** (security boot-guard).

**Boot sequence file:line refs (`index.ts`):**
- Fastify + Pino `50-57`; `@fastify/cors` allow-list of 7 origins, credentials true `59-64`; helmet CSP (self + Razorpay/Stripe/Anthropic/Meta/Google fonts, HSTS 1y, frameguard sameorigin) `67-96`; `@fastify/rate-limit` 100 req/min/IP default `99-103`.
- Global `setErrorHandler` (logs ≥500 with `{err,url,method}`) `109-119`; `GET /health` (60/min, `SELECT 1` SQLite) `122-135`.
- Public no-auth `POST /leads/capture` + `POST /waitlist/join` — waitlist handler **lazy-creates `waitlist_leads` table** on first request, fires fire-and-forget `fetch` to n8n `137-211`.
- 29 route modules registered `214-242`; `initializeScheduler()` `246`; `@fastify/static /audio/*` + prod SPA fallback `252-277`; hardcoded `GET /ugc/avatars` `1240-1252`; `onResponse` slow-log >2000ms `1255-1261`; `getDb()` runs `createTables()`+`seedReviewerAccount()` `1266`.
- SIGINT/SIGTERM close handlers only — **NO `unhandledRejection`/`uncaughtException`** `1268-1275`; `recoverInterruptedSprints()` dynamic-imported after listen `1277-1286`.

**`recoverInterruptedSprints()` behavior:** at boot it **resets stuck `generating`/`polling` jobs back to `pending`** so they re-dispatch through the queue loop.

**Cross-cutting:**
- auth: JWT expiry `7d`; bcryptjs rounds=10; `/auth` rate triple-stack (per-IP 3/min + per-user 3/h silent + single-use token); team invite tokens SHA-256 hashed.
- usage-limiter: 4 `checkXLimit` + 4 `trackXUsage` helpers via `routes/billing.ts checkLimit()`/`incrementUsage()`; emits `429 {usage,upgrade_url}`. **Count-based only — no $/day cap on LLM/agent endpoints** (only `job-queue.ts` enforces a daily $ cap, creative jobs only). Risk E / P0.3 task #8.
- `validation/schemas.ts` 543 LOC, ~30 Zod schemas; body+params+query all validated.
- `utils/logger.ts` Pino: **116 `logger.*` vs 85 stray `console.*`** (latter bypass JSON in prod) — P0.2 task #7.

**Per-endpoint rate limits (§3 route reference):** `/auth/login` 10/min · `/auth/signup` 5/min · `/auth/forgot-password` 3/min + per-user 3/h soft cap · `/competitor-spy/analyze` 5/min · `/content/generate` 5/min · `/media` generate-image 10/min, generate-video 5/min · `/agent/*/run` 2/min (creative-strategist 5/min) · `/ai/chat` 20/min · `/health` 60/min.

**God-files / sizes:** `creative-engine.ts` **1641 LOC** (biggest route, 20+ endpoints), `ai.ts` **1371**, `index.ts` **1287** (#22/#23). `creative-scorer.ts` 810, `visual-analyzer.ts` 693. 28 services total.

**Creative pipeline engine (`job-queue.ts`, 413 LOC):** in-memory poll loop, one sprint = one processor in `activeProcessors` Set, polls every 5s, grabs up to 5 pending jobs, pre-checks `checkDailyCostLimit` vs `cost_ledger`, retries up to 2x then `notifyAlert()` Slack, inserts `creative_assets` + `cost_ledger` on success. Phase 3 → queue worker.

**Routing oddities / risks:**
- `routes/ugc-workflows.ts` registered with **NO prefix** (root endpoints `/ugc-onboarding`, `/ugc-phase1`, `/ugc-concept-approval`, `/ugc-phase3`, `/ugc-delivery`, `/ugc-script-revision`) — unique among 29 modules.
- `routes/schedules.ts` has **NO auth** (admin start/stop scheduler) — P0.4 task #9.
- `routes/ai.ts POST /chat` (20/min) highest-spend, no $ cap — P0.3 #8.

**8 `node-cron` schedules inside `agent.ts`:** daily 01:30 watchdog `0 30 1 * * *`; daily 01:35 briefings `0 35 1 * * *`; Mon 02:00 weekly content `0 0 2 * * 1`; Sun 03:00 cleanup `0 0 3 * * 0`; Tue 02:00 sales `0 0 2 * * 2`; Wed 02:00 report `0 0 2 * * 3`; Thu 02:00 meta warmup `0 0 2 * * 4`; every 2h autopilot `0 0 */2 * * *`. Phase 3 task #17.

**Services / outbound:** `token-crypto.ts` = AES-256-GCM around OAuth tokens; `meta-api.ts` safeFetch 30s timeout, no retry. `safeFetch` (`utils/safe-fetch.ts`) = canonical wrapper but **no retry/circuit-breaker** (P4.1 #19); `index.ts:202-207` waitlist→n8n uses **bare `fetch`, no timeout** (fix P0.2). **safeFetch ✅ adopters:** meta-api, google-ads-api, slack-interactive, notifications, email, visual-analyzer.

**Audit pipeline:** `audit/index.ts runAudit()` orchestrates meta/google-ads/shopify ingestion (parallel) + website-analysis + `audit-agent.ts` (LLM) + `qa-validator.ts` (downgrades to "partial" on failure) + `output.ts` (md/JSON) + `pdf-export.ts` (jsPDF). **Persistence:** writes `audits` row + updates `brand_context.winning_patterns` / `failed_approaches` (Flow D).

**Billing:** Razorpay `x-razorpay-signature` HMAC + Stripe `constructEvent` both verified; **NO idempotency keys outbound** — P4.2 task #20 (gap spans Stripe/Razorpay/Resend/n8n). Exports `incrementUsage()`/`checkLimit()`/`getUserEffectiveLimits()` cross-module.

**Schema fragmentation:** `audits`/`brands`/`brand_context`/`shopify_tokens` exist only after manually running `server/scripts/add-audit-tables.ts`; `waitlist_leads` created lazily in handler — #16 (P2.5 drizzle-kit migrations consolidate).

**Type debt:** 35 production `as any` (DB-row casts in `audit/`, `routes/audits`, `automations`, `ad-accounts`, `creative-studio`, `audit-scheduler`) — #11 (P1.2), eliminated by Drizzle inference #12.

**Punch-list refs:** missing `unhandledRejection`/`uncaughtException` → **#6 (P0.1, Sentry captures unhandledRejection)**; slow-request log >2s has no SLO/APM → **#6 + #21**; outbound idempotency gap (Stripe/Razorpay/Resend/n8n) → **#20 (P4.2)**.

**Other:** JWT stored in `localStorage` (`cosmisk_token`) — Risk A / P0.4 #9. Punch-list maps 1:1 to `tasklist.md`.

## Pointer
- SUPERSEDED -> see: `19_05/backend_wiring.md`
