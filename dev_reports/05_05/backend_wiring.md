# Backend Wiring & Flows — Engineer Reference (2026-04-26)

**Stack:** Fastify (Node 22, ESM, TypeScript strict), `better-sqlite3`, `@anthropic-ai/sdk`, Angular 17 frontend served by Vercel.
**Entry point:** `server/src/index.ts` (1287 LOC — the bootstrap, but also contains ad-hoc endpoints — see Phase 5 task #22).
**Process model:** single Node process. Cron jobs (`node-cron`, `cron`) run **inside** the API process; no separate worker (see Added Risk B).

---

## 1. Boot sequence (`server/src/index.ts`)

| Order | Action | File ref |
|---|---|---|
| 1 | Load `dotenv`, build typed `config` object, refuse to start in production with default `JWT_SECRET` or `tokenEncryptionKey`. | `config.ts` |
| 2 | Create Fastify instance with Pino logger (pretty in dev, JSON in prod). | `index.ts:50–57` |
| 3 | Register `@fastify/cors` (allow-list of 7 origins, credentials true). | `index.ts:59–64` |
| 4 | Register `@fastify/helmet` with CSP allowing self + Razorpay/Stripe/Anthropic/Meta/Google fonts; HSTS 1y; frameguard sameorigin. | `index.ts:67–96` |
| 5 | Register `@fastify/rate-limit` (100 req/min/IP default; per-route overrides). | `index.ts:99–103` |
| 6 | Register `authPlugin` (decorates `app.authenticate` with JWT verify). | `plugins/auth.ts` |
| 7 | Register `usageLimiterPlugin` (decorates `app.checkChatLimit` etc., reads `user_usage`). | `plugins/usage-limiter.ts` |
| 8 | Register global `setErrorHandler` — logs >=500 with structured `{err, url, method}`, sends `{success:false, error}`. | `index.ts:109–119` |
| 9 | Register `GET /health` (rate-limited 60/min). Probes `SELECT 1` against SQLite. | `index.ts:122–135` |
| 10 | Register two **public, no-auth** endpoints: `POST /leads/capture`, `POST /waitlist/join`. The waitlist handler **lazy-creates** the `waitlist_leads` table on first request. Fires fire-and-forget `fetch` to n8n. | `index.ts:137–211` |
| 11 | Register all 29 route modules with prefixes (see §3 below). | `index.ts:214–242` |
| 12 | `initializeScheduler()` — boots `services/audit-scheduler.ts` (in-process CronJobs). | `index.ts:246` |
| 13 | Register `@fastify/static` for `/audio/*` (generated TTS files on local disk). In production also serve Angular `index.html` SPA fallback. | `index.ts:252–277` |
| 14 | Ad-hoc endpoint pile: `GET /ugc/avatars` (returns hardcoded persona list). | `index.ts:1240–1252` |
| 15 | `onResponse` hook logs slow requests (>2000ms). | `index.ts:1255–1261` |
| 16 | `getDb()` — opens SQLite, runs `createTables()` + `seedReviewerAccount()`. | `index.ts:1266` |
| 17 | Wire `SIGINT`/`SIGTERM` → close DB + close Fastify. **No `unhandledRejection`/`uncaughtException` handlers.** | `index.ts:1268–1275` |
| 18 | `app.listen({port, host:'0.0.0.0'})`. After listen, dynamic-import and call `recoverInterruptedSprints()`. | `index.ts:1277–1286` |

---

## 2. Cross-cutting plugins

### 2.1 `plugins/auth.ts` — `app.authenticate`
- Wraps `@fastify/jwt`, secret from `config.jwtSecret`, expiry `7d`.
- Decorator does `request.jwtVerify()`; on failure replies `401 {message:'Unauthorized'}`.
- Used in every protected route via `preHandler: [app.authenticate]`.

### 2.2 `plugins/usage-limiter.ts`
Decorates four `checkXLimit` preHandlers (chat, image, video, creative) and four `trackXUsage` post-call helpers. All read/write `user_usage` via `routes/billing.ts checkLimit()`/`incrementUsage()`. Emits `429 {error, usage:{current,limit}, upgrade_url}` when exceeded.

> Coverage gap (Added Risk E): the limiter checks **counts** per period (e.g., 100 chats/month), but there is **no $-cost-per-day cap on LLM/agent endpoints**. Only `services/job-queue.ts` enforces a per-day **dollar** cap (creative jobs only). P0.3 / task #8 closes this.

### 2.3 Validation
Every route uses Zod via `validation/schemas.ts` (543 LOC, ~30 named schemas) and a shared helper `validate(schema, request.X, reply)` that responds `400` on failure. This is consistent across routes. **Body, params, and query are all validated.**

### 2.4 Logging
`utils/logger.ts` — Pino instance imported by services (Fastify routes get `request.log` automatically). 116 `logger.*` calls vs. 85 stray `console.*` calls — the latter bypass structured JSON in prod (P0.2 / task #7 fixes this).

---

## 3. Per-route reference (29 modules)

> Format: **prefix · file (LOC) · auth? · endpoints · DB tables touched · external services · special hooks/limiters.**
> "Auth" column: `none` = no JWT, `jwt` = `app.authenticate`, `mixed` = some endpoints public.

### Identity & teams

#### `/auth` — `routes/auth.ts` (~280 LOC) — auth: mixed
| Method | Path | Auth | Rate limit | Tables | External |
|---|---|---|---|---|---|
| POST | `/login` | none | 10/min | `users`, `activity_log` | — |
| POST | `/signup` | none | 5/min | `users`, `activity_log` | — |
| GET | `/meta-status` | jwt | — | `meta_tokens` | — |
| POST | `/meta-oauth/exchange` | jwt | — | `meta_tokens` | Meta Graph |
| POST | `/meta-disconnect` | jwt | — | `meta_tokens` | — |
| POST | `/forgot-password` | none | 3/min + per-user 3/h soft cap | `password_reset_tokens` | Resend (email) |
| POST | `/reset-password` | none | — | `password_reset_tokens`, `users` | — |

Notes: passwords hashed with `bcryptjs` rounds=10. Rate-limit triple-stack: per-IP (3/min), per-user (3/h silent), single-use token. Activity log entries on login + signup + role/password changes.

#### `/team` — `routes/team.ts` — auth: jwt
| Method | Path | Tables |
|---|---|---|
| GET `/members`, POST `/invite`, PUT `/members/:id/role`, DELETE `/members/:id`, POST `/accept`, POST `/resend/:id` | | `team_members`, `team_invitations`, `users`, `activity_log` |

External: Resend (invite emails). Token hashed with SHA-256 before storage.

---

### Ad ops & analytics (Meta-backed)

#### `/ad-accounts` — `routes/ad-accounts.ts` — auth: jwt
| Endpoint | Tables | External | Notes |
|---|---|---|---|
| GET `/list` | `meta_tokens` | Meta Graph | List ad accounts |
| GET `/kpis` | `meta_tokens` | Meta Graph | Daily KPI snapshot |
| GET `/top-ads` | `meta_tokens` | Meta Graph | Top-performing ads |
| GET `/video-source` | `meta_tokens` | Meta Graph | Find video URL for an ad |
| GET `/portfolio-health` | `meta_tokens`, `creative_sprints`, `autopilot_alerts`, `agent_decisions` | Meta Graph | Composite health score |
| GET `/pages` | `meta_tokens` | Meta Graph | FB pages list |

Decrypts `meta_tokens.encrypted_access_token` via `services/token-crypto.ts`. Calls `services/meta-api.ts` (30s `safeFetch` timeout, no retry).

#### `/dashboard` — `routes/dashboard.ts` — auth: jwt
- GET `/chart`, `/insights`, `/kpis`. Pulls Meta insights + UGC project counts; assembles dashboard payload.
- Tables: `meta_tokens`, `ugc_projects`, `ugc_concepts`, `ugc_scripts`.

#### `/analytics` — `routes/analytics.ts` — auth: jwt
- GET `/full`. Composite analytics view (Meta).
- Tables: `meta_tokens`. External: Meta Graph.

#### `/brain` — `routes/brain.ts` — auth: jwt
- GET `/patterns`. Calls `services/creative-patterns.ts` to surface "what's working" patterns.
- Tables: `meta_tokens`. External: Meta Graph.

#### `/director` — `routes/director.ts` — auth: jwt
- POST `/generate-brief`, `/auto-publish`, `/update-status`. Generates strategic brief via Claude, publishes ads back to Meta.
- Tables: `meta_tokens`. External: Meta Graph, Anthropic.

#### `/automations` — `routes/automations.ts` — auth: jwt
- GET `/list`, POST `/create`, PUT `/update`, DELETE `/delete`, GET `/activity`, POST `/execute-action`, POST `/run`.
- Tables: `automations`, `meta_tokens`. External: Meta Graph (when actions execute).
- **Automation tick:** `services/automation-engine.ts` is invoked by `agent.ts` cron (`agent_runs` daily run). Pulls `automations WHERE is_active = 1`, fetches Meta data, evaluates trigger expr, fires action.

#### `/autopilot` — `routes/autopilot.ts` — auth: jwt
- GET `/alerts`, GET `/unread-count`, POST `/mark-read`, POST `/run`, DELETE `/alerts/:id`.
- Tables: `autopilot_alerts`. Engine: `services/autopilot-engine.ts` runs anomaly detection vs. Meta data, creates alerts.

#### `/campaigns` — `routes/campaigns.ts` — auth: jwt
- GET `/list`, GET `/detail`, POST `/create`, POST `/update`, POST `/launch`, GET `/suggest`.
- Tables: `campaigns`, `meta_tokens`. External: Meta Graph (for `/launch`), Anthropic (for `/suggest`).

#### `/google-ads` — `routes/google-ads.ts` — auth: jwt
- OAuth flow + KPIs + campaigns + analyze + disconnect.
- Tables: `google_tokens`. External: Google Ads API (`services/google-ads-api.ts`).

#### `/tiktok-ads` — `routes/tiktok-ads.ts` — auth: jwt
- Mirrors google-ads structure. Tables: `tiktok_tokens`. External: TikTok Ads API.

#### `/competitor-spy` — `routes/competitor-spy.ts` — auth: jwt
- GET `/search`, GET `/analyze` (5/min). Tables: `meta_tokens`. External: Meta Graph (for ad library), Anthropic (for analysis).

#### `/reports` — `routes/reports.ts` — auth: jwt
- GET `/templates`, `/list`, POST `/generate-weekly`, `/generate`. Tables: `reports`, `meta_tokens`, `users`. External: Anthropic (report writing), Meta Graph (data).

---

### Creative pipeline

#### `/creative-engine` — `routes/creative-engine.ts` (1641 LOC, **biggest route file**) — auth: jwt
20+ endpoints, summarised:
- Sprint lifecycle: POST `/analyze`, `/plan`, `/sprint/:id/approve`, `/sprint/:id/cancel`, `/sprint/:id/duplicate`, DELETE `/sprint/:id`.
- Sprint reads: GET `/sprints`, `/sprint/:id`, `/sprint/:id/progress`, `/sprint/:id/review`, `/templates`, `/analytics`, `/costs`, `/usage`.
- Asset & script: POST `/sprint/:id/scripts`, `/sprint/:id/generate`, `/asset/:id/approve`, `/asset/:id/reject`, `/asset/:id/edit`, POST `/job/:id/retry`.
- Tracking & publish: POST `/sprint/:id/publish`, `/sprint/:id/track`, `/auto-track` (cron-fired endpoint).
- Tables: `creative_sprints`, `creative_jobs`, `creative_assets`, `cost_ledger`, `meta_tokens`, `ugc_projects`, `users`.
- External: Anthropic (planning/scripts), `api-providers.ts` dispatches to Veo, NanoBanana, Heygen, Kling, Creatify, Flux (depending on `format`).
- Engine: `services/job-queue.ts` (413 LOC) runs an in-memory poll loop per sprint, dispatches jobs, polls for completion, retries up to 2x, enforces per-plan daily cost cap. **One sprint = one in-process processor in `activeProcessors` Set**, polling every 5s.

> When Phase 3 (BullMQ/pg-boss) lands, `job-queue.ts` becomes a queue worker; the in-process Set goes away.

#### `/creative-studio` — `routes/creative-studio.ts` — auth: mixed
- POST `/analyze-url` (cached in `url_analysis_cache`), POST `/generate`, GET `/generation/:id`, GET `/generations`, POST `/score`, GET `/accuracy`.
- Tables: `studio_generations`, `studio_outputs`, `score_predictions`, `url_analysis_cache`.
- External: Anthropic, Gemini (vision), NanoBanana / Flux (images).

#### `/score` — `routes/score.ts` — auth: jwt
- POST `/analyze`, POST `/batch`. Calls `services/creative-scorer.ts` (810 LOC).
- Tables: `score_predictions`. External: Anthropic + Gemini.

#### `/assets` — `routes/assets.ts` — auth: jwt
- GET `/list`, GET `/folders`. Tables: `meta_tokens`. External: Meta Graph.

#### `/swipe-file` — `routes/swipe-file.ts` — auth: jwt
- GET `/list`, POST `/save`, DELETE `/:id`. Tables: `swipe_file`.

---

### UGC

#### `/ugc` — `routes/ugc.ts` — auth: jwt
- GET `/projects`, POST `/project-detail`, GET `/concepts`, GET `/scripts`. Tables: `ugc_projects`, `ugc_concepts`, `ugc_scripts`.

#### `/(root)` — `routes/ugc-workflows.ts` — auth: jwt
Registered with **no prefix** — endpoints sit at root: POST `/ugc-onboarding`, `/ugc-phase1`, `/ugc-concept-approval`, `/ugc-phase3`, `/ugc-delivery`, `/ugc-script-revision`. Tables: `ugc_projects`, `ugc_concepts`, `ugc_scripts`, `meta_tokens`. External: Anthropic.

> The `ugc-workflows` registration without a prefix is unique among the 29 modules. Worth normalising during Phase 5 decomposition.

---

### Content / Social

#### `/content` — `routes/content.ts` — auth: jwt
- GET `/weekly-stats`, POST `/generate` (5/min), POST `/save`, POST `/save-batch`, GET `/bank`, PUT `/bank/:id`, DELETE `/bank/:id`, POST `/trigger-weekly`.
- Tables: `content_bank`, `creative_assets`, `creative_jobs`, `creative_sprints`, `meta_tokens`, `users`.
- External: Anthropic.
- Uses **dynamic SQL** for partial updates with **whitelisted column names** (safe).

---

### Brands / Audit

#### `/brands` — `routes/brands.ts` — auth: jwt
- GET `/list`. Tables: `meta_tokens`, `users`.

#### `/audits` — `routes/audits.ts` — auth: jwt
- GET (audit history). Tables: `audits`, `brands`.
- Engine: `audit/index.ts runAudit()` orchestrates `meta-ingestion` + `google-ads-ingestion` + `shopify-ingestion` + `website-analysis` + `audit-agent` (LLM) + `qa-validator` + `output` (markdown/JSON/PDF).

#### `/schedules` — `routes/schedules.ts` — auth: **none** (admin endpoints)
- GET `/status`, POST `/start`, POST `/stop`, GET `/`. Backed by `services/audit-scheduler.ts` (in-process CronJob registry).

> **Risk:** these endpoints are not behind `app.authenticate`. If exposed publicly, anyone can stop the scheduler. Verify they're not reachable from outside (likely only used by the admin SPA, but no IP-allow-list exists). Flag for P0.4 / task #9 cookie-auth scope debate.

---

### Agents

#### `/agent` — `routes/agent.ts` — auth: mixed
| Endpoint | Auth | Tables / engine |
|---|---|---|
| POST `/slack-action` | none (verified by Slack signing secret) | `services/slack-interactive.ts` |
| GET `/runs` | jwt | `agent_runs` |
| GET `/decisions` | jwt | `agent_decisions` |
| POST `/decisions/:id/approve`, `/reject` | jwt | `agent_decisions` |
| POST `/watchdog/run` (2/min) | jwt | `services/ad-watchdog.ts` |
| POST `/report/run` (2/min) | jwt | `services/report-agent.ts` |
| POST `/content/run` (2/min) | jwt | `services/content-agent.ts` |
| POST `/sales/run` (2/min) | jwt | `services/sales-agent.ts` |
| POST `/meta-warmup/run` (2/min) | jwt | `services/meta-warmup.ts` |
| POST `/creative-strategist/run` (5/min) | jwt | `services/creative-strategist.ts` |
| POST `/creative-strategist/feedback`, `/teach`, `/seed` (2/min) | jwt | `agent_core_memory`, `agent_episodes`, `agent_entities` |
| GET `/memory/:agentType`, `/memory-structured` | jwt | agent memory tables |
| GET `/sales/context`, `/briefing/latest` | jwt | reads cached briefings |

**Cron schedules registered inside this file (8 of them):**
| Cron | Schedule | Calls |
|---|---|---|
| daily 01:30 | `0 30 1 * * *` | watchdog runs |
| daily 01:35 | `0 35 1 * * *` | morning briefings |
| Mon 02:00 | `0 0 2 * * 1` | weekly content |
| Sun 03:00 | `0 0 3 * * 0` | weekly cleanup |
| Tue 02:00 | `0 0 2 * * 2` | sales agent |
| Wed 02:00 | `0 0 2 * * 3` | report agent |
| Thu 02:00 | `0 0 2 * * 4` | meta warmup |
| every 2h | `0 0 */2 * * *` | autopilot tick |

All 8 are `node-cron` schedules **inside the API process** — Phase 3 / task #17 moves them out.

#### `/ai` — `routes/ai.ts` (1371 LOC) — auth: jwt
- POST `/chat` (20/min) — Anthropic chat with Claude, streamed. Pulls user context from `meta_tokens`, `agent_decisions`, `agent_runs`. Calls `services/insights-parser.ts` to enrich with Meta data.
- GET `/briefing` — cached morning briefing.

> This is one of the highest-spend endpoints and currently has **no $-cost cap** beyond the count-based usage limiter. P0.3 / task #8.

#### `/media` — `routes/media-gen.ts` — auth: jwt
- POST `/generate-image` (10/min, `checkImageLimit`), POST `/generate-video` (5/min, `checkVideoLimit`), GET `/video-status`, POST `/generate-image-flux`, GET `/image-status`.
- External: NanoBanana, Heygen, Kling, Creatify, Flux. **Uses `safeFetch`** but no retry/circuit breaker (P4.1 / task #19).

---

### Billing

#### `/billing` — `routes/billing.ts` (~700 LOC) — auth: mixed
| Endpoint | Auth | Tables / external |
|---|---|---|
| GET `/plans` | none | static plan config |
| GET `/status` | jwt | `subscriptions`, `user_usage`, `users` |
| POST `/start-trial` | jwt | `subscriptions` |
| POST `/create-checkout` | jwt | `subscriptions` ; calls Stripe / Razorpay |
| POST `/verify-payment` | jwt | `subscriptions` ; verifies Razorpay HMAC |
| POST `/cancel` | jwt | `subscriptions` ; Stripe / Razorpay |
| POST `/create-portal` | jwt | Stripe billing portal |
| POST `/razorpay-webhook` | none (HMAC verified) | `subscriptions` |
| POST `/webhook` (Stripe) | none (signature verified) | `subscriptions` |

Webhook signature verification is in place for both Razorpay (`x-razorpay-signature` HMAC) and Stripe (Stripe SDK constructEvent). **No idempotency keys** on outbound calls — P4.2 / task #20.

Also exports two helpers used cross-module: `incrementUsage()` (used by `usage-limiter.ts`), `checkLimit()`, `getUserEffectiveLimits()`.

---

## 4. Service layer (`server/src/services/*`)

28 services. Grouped by purpose:

| Group | Files |
|---|---|
| Provider SDKs / API wrappers | `meta-api.ts`, `google-ads-api.ts`, `api-providers.ts` (creative gen), `email.ts` (Resend), `notifications.ts` (Slack alerts), `slack-interactive.ts` |
| Encryption | `token-crypto.ts` (AES-256-GCM around OAuth tokens) |
| Engines (do work, called by routes or cron) | `automation-engine.ts`, `autopilot-engine.ts`, `audit-scheduler.ts`, `ad-watchdog.ts`, `morning-briefing.ts`, `meta-warmup.ts`, `trend-analyzer.ts`, `platform-signals.ts` |
| Agents (LLM-driven) | `report-agent.ts`, `content-agent.ts`, `sales-agent.ts`, `creative-strategist.ts` |
| Creative pipeline | `job-queue.ts`, `sprint-planner.ts`, `creative-scorer.ts` (810 LOC), `creative-patterns.ts`, `visual-analyzer.ts` (693 LOC), `plan-scorer.ts` |
| Memory | `agent-memory.ts` |
| Helpers | `insights-parser.ts`, `format-helpers.ts` |

`safeFetch` (in `utils/safe-fetch.ts`) is the canonical outbound HTTP wrapper. Every service that calls a 3rd-party should use it. Audit findings:
- ✅ `meta-api`, `google-ads-api`, `slack-interactive`, `notifications`, `email`, `visual-analyzer` — use `safeFetch`.
- ⚠️ `index.ts:202–207` (waitlist → n8n) uses **bare `fetch` with no timeout**. Fix during P0.2.
- ⚠️ `safeFetch` itself has timeout but **no retry/circuit-breaker** — P4.1 / task #19.

---

## 5. Six end-to-end flows (engineer mental model)

### Flow A — Auth & token issuance
1. Client → `POST /auth/login` (10/min IP rate-limit).
2. `bcrypt.compare` against `users.password_hash`.
3. JWT signed with `config.jwtSecret`, `expiresIn:'7d'`.
4. **Client stores JWT in `localStorage`** (`cosmisk_token`) — Added Risk A.
5. Subsequent requests carry `Authorization: Bearer <jwt>`. `app.authenticate` calls `request.jwtVerify()`; on success `request.user` is populated.
6. `usage-limiter` preHandlers gate paid endpoints by counts.

### Flow B — Meta-backed dashboard render
1. Client → `GET /dashboard/insights` with JWT.
2. `app.authenticate` verifies. Route reads `meta_tokens.encrypted_access_token` for `request.user.id`.
3. `decryptToken()` (AES-256-GCM, key `config.tokenEncryptionKey`).
4. `services/meta-api.ts` calls Meta Graph via `safeFetch` (30s timeout).
5. `services/insights-parser.ts` aggregates into UI-ready KPIs.
6. Response shipped. **No retry on Meta 5xx** — flake = user error. P4.1 fixes.

### Flow C — Creative sprint (most complex flow)
1. `POST /creative-engine/analyze` → analyses account creatives. Anthropic + Meta.
2. `POST /creative-engine/plan` → `services/sprint-planner.ts` builds a sprint plan, inserts `creative_sprints` (status `analyzing`) and N `creative_jobs` (status `pending`).
3. `POST /creative-engine/sprint/:id/approve` → status flips to `processing`. `job-queue.processSprintJobs(sprintId)` is invoked, registered in `activeProcessors` Set.
4. The poll loop (every 5s) grabs up to 5 pending jobs. For each:
   a. Pre-check: `checkDailyCostLimit(user_id, plan)` against `cost_ledger`.
   b. Dispatch via `api-providers.ts.getProvider(format)` → e.g. Heygen for video.
   c. Update job status `generating` → `polling` → `completed` / `failed`.
   d. On failure: retry up to 2x; on final failure, `notifyAlert()` to Slack.
   e. On success: insert `creative_assets` + insert `cost_ledger` row.
5. `recoverInterruptedSprints()` at boot resets stuck `generating`/`polling` jobs back to `pending` so they re-dispatch.
6. `POST /creative-engine/sprint/:id/publish` → publishes approved assets to Meta as ads.
7. `POST /creative-engine/sprint/:id/track` (or cron-fired `/auto-track`) → fetches Meta metrics for published assets, fills `creative_assets.actual_metrics`.

### Flow D — Audit (in-process pipeline)
1. Cron tick (`audit-scheduler.ts`) or manual `POST /audits` triggers `audit/index.ts runAudit()`.
2. `meta-ingestion`, `google-ads-ingestion`, `shopify-ingestion` pull live snapshots in parallel.
3. `website-analysis` scrapes the brand domain (`utils/safe-fetch`).
4. `audit-agent.ts` calls Anthropic with all snapshots + `brand_context` to produce findings.
5. `qa-validator.ts` runs sanity checks (e.g., wasted-spend math). On failure the audit is downgraded to "partial".
6. `output.ts` renders markdown + JSON. `pdf-export.ts` (jsPDF) produces a PDF artifact saved to disk.
7. Persists `audits` row + updates `brand_context.winning_patterns` / `failed_approaches`.

### Flow E — Billing (Razorpay subscription)
1. `POST /billing/create-checkout` → creates Razorpay subscription, returns checkout URL.
2. Client opens Razorpay UI; on payment, Razorpay calls `POST /billing/razorpay-webhook` server-to-server.
3. Server verifies `x-razorpay-signature` HMAC. **No idempotency-key check** (P4.2 / task #20).
4. Updates `subscriptions` row, may bump `users.plan`.
5. `POST /billing/verify-payment` is also called by client for client-side confirmation.

### Flow F — Agent run + Slack-interactive approval
1. Cron tick → e.g. `report-agent.ts` runs daily.
2. Agent inserts `agent_runs` (status `running`) + N `agent_decisions` (status `pending`).
3. `notifications.notifyAlert()` posts Slack message with "Approve / Reject" buttons.
4. User clicks → Slack hits `POST /agent/slack-action` (no JWT; Slack signing-secret verification in `slack-interactive.ts`).
5. Decision flips to `approved`/`rejected`; if approved, the action is executed (e.g., pause Meta ad).
6. UI also calls `POST /agent/decisions/:id/approve` from in-app flow.

---

## 6. Where the wiring is fragile (engineer punch-list)

| # | Symptom | Root cause | Task |
|---|---|---|---|
| 1 | One sprint poll-loop crash takes the API process down with it | `job-queue.ts` runs in-process | #17 (P3.1) |
| 2 | Cron jobs duplicate if a 2nd replica starts | All 8 cron schedules in `agent.ts` are `node-cron` in-process | #17 |
| 3 | Cron jobs miss firing during deploy | Same — no persistent job ledger | #17 |
| 4 | Provider 503 = user-visible error | `safeFetch` has no retry / circuit breaker | #19 (P4.1) |
| 5 | Webhook retry can double-charge | No idempotency keys for Stripe / Razorpay / Resend / n8n | #20 (P4.2) |
| 6 | Silent crashes on `unhandledRejection` | No process-level handler | #6 (P0.1, Sentry captures these) |
| 7 | Slow-request log fires >2s but no SLO; no APM | Pino-only logging | #6 + #21 |
| 8 | `console.*` calls bypass JSON logs in prod | Mixed logging across 85 sites | #7 (P0.2) |
| 9 | `localStorage.cosmisk_token` exfiltrated by any XSS | JWT in browser storage | #9 (P0.4) |
| 10 | `routes/schedules.ts` has **no auth** | Missing `preHandler` | Add to scope of #9 |
| 11 | `index.ts /waitlist/join` calls bare `fetch` no-timeout | Pre-`safeFetch` code | Fix during #7 |
| 12 | `audits`/`brands`/`brand_context`/`shopify_tokens` exist only after running `server/scripts/add-audit-tables.ts` by hand | Schema fragmentation | #16 (P2.5 — drizzle-kit migrations consolidate everything) |
| 13 | `waitlist_leads` table created lazily inside a request handler | Same | Move to `schema.ts` during #16 |
| 14 | Daily cost cap exists for creative jobs only | `services/job-queue.ts` checks `cost_ledger`, but `routes/ai.ts` does not | #8 (P0.3) |
| 15 | Largest god-files: `creative-engine.ts` 1641, `ai.ts` 1371, `index.ts` 1287 | Accumulated scope | #22 + #23 (P5.1, P5.2) |
| 16 | 35 production `as any` (mostly DB-row casts in `audit/`, `routes/audits`, `routes/automations`, `routes/ad-accounts`, `routes/creative-studio`, `services/audit-scheduler`) | No typed row models | #11 (P1.2) → eliminated by #12 (Drizzle infers) |

This punch-list maps 1:1 to the existing tasklist in `tasklist.md`.
