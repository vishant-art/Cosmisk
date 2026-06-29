> **Status: 📖 REFERENCE (2026-05-31)** — snapshot of LLM call-site wiring feeding the rate-limiter design.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Findings — Current LLM Wiring (2026-05-02)

Verified against working tree at branch `analysis-and-cleanup` (commit `c61f025`).

## Unique essence preserved

### 1. Anthropic SDK call inventory
**SDK:** `@anthropic-ai/sdk@^0.78.0` (`server/package.json:13`). Several majors behind, but `Anthropic.RateLimitError`, `client.messages.countTokens`, response-header access, and `maxRetries` are all already in 0.78. SDK upgrade is a separate task.

**24 `messages.create` call sites across 20 files.** No `messages.stream()` callers anywhere.

**Services (10 files, 11 sites):**

| File | Line | Model | Notes |
|---|---|---|---|
| `services/audit-agent.ts` | 506 | `claude-sonnet-4-20250514` | ⚠ Date-suffixed alias (§4) |
| `services/agent-memory.ts` | 123 | `claude-haiku-4-5-20251001` | OK |
| `services/ad-watchdog.ts` | 245 | `claude-sonnet-4-6` | OK |
| `services/content-agent.ts` | 151 | `claude-sonnet-4-6` | OK |
| `services/autopilot-engine.ts` | 238 | `claude-sonnet-4-6` | OK |
| `services/creative-strategist.ts` | 98 | `claude-opus-4-6` | OK |
| `services/report-agent.ts` | 159 | `claude-sonnet-4-6` | OK |
| `services/morning-briefing.ts` | 251 | `claude-sonnet-4-6` | OK |
| `services/sprint-planner.ts` | 241, 447 | `claude-opus-4-6`, `claude-sonnet-4-6` | OK |
| `services/sales-agent.ts` | 416 | `claude-sonnet-4-6` | OK |

**Routes (8 files, 12 sites):**

| File | Line | Model | Notes |
|---|---|---|---|
| `routes/ai.ts` | 327, 391 | `claude-sonnet-4-6`, `claude-haiku-4-5-20251001` | Highest-volume — `/ai/chat`, briefings |
| `routes/competitor-spy.ts` | 94 | `claude-sonnet-4-6` | OK |
| `routes/content.ts` | 325, 617 | `claude-sonnet-4-6` ×2 | OK |
| `routes/creative-studio.ts` | 70, 300, 393 | `claude-haiku-4-5-20251001`, `claude-sonnet-4-20250514`, `claude-haiku-4-5-20251001` | ⚠ Date-suffixed alias on 300 |
| `routes/google-ads.ts` | 199 | `claude-sonnet-4-6` | OK |
| `routes/reports.ts` | 570 | `claude-sonnet-4-6` | OK |
| `routes/score.ts` | 126, 221 | `claude-sonnet-4-6` ×2 | OK |
| `routes/tiktok-ads.ts` | 266 | `claude-sonnet-4-6` | OK |

**Bootstrap (1 site):** `index.ts:643` — `claude-sonnet-4-20250514` ⚠ date-suffixed alias; inline endpoint that should move into a route module per `suggested.md` Phase 5.

### 2. Client instantiation
`utils/claude-helpers.ts` exports only `extractText(message, fallback)` — no shared client. **19 `new Anthropic({ apiKey: config.anthropicApiKey })` instantiations** (10 services, 8 routes, 1 inline `index.ts:634` for the line-643 call). Module-level singleton pattern. Exception: `audit-agent.ts:32-37` uses lazy `getAnthropic()`. No client carries `maxRetries`/`timeout`/`baseURL`; default `maxRetries: 2` applies. No client-side rate limiter. Lifting to single shared client owned by `services/llm-gateway.ts` is one search-and-replace.

### 3. Existing cost / rate-limit machinery
**`cost_ledger`** — `db/schema.ts:224`:
```sql
CREATE TABLE IF NOT EXISTS cost_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL, sprint_id TEXT, job_id TEXT,
  api_provider TEXT NOT NULL,   -- 'anthropic','gemini','flux','heygen'
  operation TEXT NOT NULL, cost_cents INTEGER NOT NULL,
  metadata TEXT, created_at TEXT DEFAULT (datetime('now'))
);
```
No index on `(user_id, created_at)` (`db_structure.md` §11 flags it; land with gateway or P1.1 PG migration).

**Plan-tier daily caps** — `job-queue.ts:23-30`:

| Plan | Daily cap |
|---|---:|
| `free` | 500¢ ($5) |
| `solo` | 5_000¢ ($50) |
| `growth` | 20_000¢ ($200) |
| `agency` | 100_000¢ ($1000) |
| default (unknown) | 1_000¢ ($10) |

**`checkDailyLimit(userId)`** — `job-queue.ts:64-74`. Returns `{allowed, spent, limit, remaining}`. Backed by `getDailySpendCents` (sums `cost_ledger.cost_cents` for user+today) and `getUserDailyLimit` (reads `users.plan`). Cost writes happen in `job-queue.ts → dispatchJob` for Flux/HeyGen/Meta spend. **The 24 LLM call sites do NOT call `checkDailyLimit` and do NOT write `cost_ledger`.**

**What is missing:**

| Layer | Status |
|---|---|
| Per-user daily cap on Anthropic spend | ❌ caps exist but unenforced on LLM routes |
| Per-user daily cap on Gemini spend | ❌ |
| Org-wide RPM throttling (Anthropic) | ❌ relies on Anthropic 429 |
| Org-wide ITPM throttling | ❌ |
| Org-wide OTPM throttling | ❌ |
| Retry / exponential backoff on 429/5xx | ❌ SDK default maxRetries:2; nothing parses retry shape |
| Circuit breaker per provider | ❌ |
| Pre-flight token estimation | ❌ `countTokens` never called |
| `cost_ledger` writes from LLM sites | ❌ |
| `anthropic-ratelimit-*` header inspection | ❌ |
| Typed error handling (`Anthropic.RateLimitError`) | ❌ generic try/catch everywhere |

### 4. Model-string issues to fix while migrating
Per `claude-api` skill (`shared/models.md`, `shared/model-migration.md`): use exact catalog aliases, not date-suffixed strings. `claude-sonnet-4-20250514` is old; current is `claude-sonnet-4-6` (keeping old quietly pins Sonnet 4, forgoes 4.5/4.6).

| File | Line | Current | Recommended |
|---|---|---|---|
| `services/audit-agent.ts` | 506 | `claude-sonnet-4-20250514` | `claude-sonnet-4-6` |
| `index.ts` | 643 | `claude-sonnet-4-20250514` | `claude-sonnet-4-6` |
| `routes/creative-studio.ts` | 300 | `claude-sonnet-4-20250514` | `claude-sonnet-4-6` |

The four `claude-haiku-4-5-20251001` strings (`agent-memory.ts:123`, `ai.ts:391`, `creative-studio.ts:70,393`) are valid (published full ID for Haiku 4.5) but alias `claude-haiku-4-5` is preferred — cosmetic. Gateway can accept a known-aliases set and reject others, self-enforcing once Track B lands.

### 5. Other LLM providers
**Gemini** — `@google/generative-ai@^0.24.1`. Two sites: `audit/audit-agent.ts:480` `analyzeWithGemini` → `gemini-1.5-flash` (Gemini primary/free-tier-first, Claude fallback `audit-agent.ts:524-530`); `services/visual-analyzer.ts:126-190` File API vision (resumable upload). Same per-user cost-ledger gate applies (`api_provider='gemini'`); org-wide rate limiting separate (Google enforces own quota; leaked free-tier key is bigger blast radius than RPM). **No OpenAI/Mistral/other LLM SDKs** (`package.json` confirms).

### 6. Job queue, cron, where rate limiting lives
`services/job-queue.ts` in-process, SQLite-backed, MAX_CONCURRENT=5; runs Anthropic indirectly via services (e.g. `creative-scorer.ts`) but queue itself doesn't call Anthropic. Gateway slots *below* the queue — every `messages.create` goes through it. **5 cron schedules in `routes/agent.ts`:** morning brief 01:30, ad-perf trends 01:35, weekly competitive intel Mon 02:00, weekly benchmarking Sun 03:00, weekly creative-DNA Tue 02:00. All call services issuing `messages.create`; if two fire close they hit Anthropic in parallel uncoordinated — where org-wide RPM/ITPM enforcement matters. `routes/schedules.ts` is unauthenticated (`backend_wiring.md` §F1) — pair gateway rollout with Phase 0.4 cookie-auth fix so unauthenticated cron triggers can't bypass per-user cap.

### 7. Single-replica posture
`railway.toml` runs one instance. In-process limiter (Node-side `bottleneck`) is correct for single-replica. Phase 3 of `suggested.md` adds Redis (BullMQ); limiter then switches to Bottleneck's Redis backend with no API change. Right posture today and forward-compatible.

## Pointer
- DURABLE_REFERENCE -> see: rate-limit findings (successor); upstream limit numbers/decision matrices in `05_05/rate_limiting/{README,anthropic_rate_limits,options}.md` and `implementation_plan.md` (limiter SHIPPED commit 1521cce).
