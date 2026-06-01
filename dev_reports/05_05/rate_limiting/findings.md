> **Status: 📖 REFERENCE (2026-05-31)** — snapshot of LLM call-site wiring feeding the rate-limiter design.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# Findings — Current LLM Wiring (2026-05-02)

Snapshot of how Claude (and Gemini) are called today. Numbers and paths verified against the working tree at branch `analysis-and-cleanup` (commit `c61f025`).

---

## 1. Anthropic SDK call inventory

**SDK:** `@anthropic-ai/sdk@^0.78.0` (`server/package.json:13`). Several majors behind current — not breaking, but `Anthropic.RateLimitError`, `client.messages.countTokens`, response-header access, and `maxRetries` are all already in 0.78. SDK upgrade is a separate task.

**24 `messages.create` call sites across 20 files.** No `messages.stream()` callers anywhere.

### Services (10 files, 11 call sites)

| File | Line | Model | Notes |
|---|---|---|---|
| `server/src/services/audit-agent.ts` | 506 | `claude-sonnet-4-20250514` | ⚠ Date-suffixed alias (see § 4) |
| `server/src/services/agent-memory.ts` | 123 | `claude-haiku-4-5-20251001` | OK |
| `server/src/services/ad-watchdog.ts` | 245 | `claude-sonnet-4-6` | OK |
| `server/src/services/content-agent.ts` | 151 | `claude-sonnet-4-6` | OK |
| `server/src/services/autopilot-engine.ts` | 238 | `claude-sonnet-4-6` | OK |
| `server/src/services/creative-strategist.ts` | 98 | `claude-opus-4-6` | OK |
| `server/src/services/report-agent.ts` | 159 | `claude-sonnet-4-6` | OK |
| `server/src/services/morning-briefing.ts` | 251 | `claude-sonnet-4-6` | OK |
| `server/src/services/sprint-planner.ts` | 241, 447 | `claude-opus-4-6`, `claude-sonnet-4-6` | OK |
| `server/src/services/sales-agent.ts` | 416 | `claude-sonnet-4-6` | OK |

### Routes (8 files, 12 call sites)

| File | Line | Model | Notes |
|---|---|---|---|
| `server/src/routes/ai.ts` | 327, 391 | `claude-sonnet-4-6`, `claude-haiku-4-5-20251001` | Highest-volume entry — `/ai/chat`, briefings |
| `server/src/routes/competitor-spy.ts` | 94 | `claude-sonnet-4-6` | OK |
| `server/src/routes/content.ts` | 325, 617 | `claude-sonnet-4-6` × 2 | OK |
| `server/src/routes/creative-studio.ts` | 70, 300, 393 | `claude-haiku-4-5-20251001`, `claude-sonnet-4-20250514`, `claude-haiku-4-5-20251001` | ⚠ Date-suffixed alias on line 300 |
| `server/src/routes/google-ads.ts` | 199 | `claude-sonnet-4-6` | OK |
| `server/src/routes/reports.ts` | 570 | `claude-sonnet-4-6` | OK |
| `server/src/routes/score.ts` | 126, 221 | `claude-sonnet-4-6` × 2 | OK |
| `server/src/routes/tiktok-ads.ts` | 266 | `claude-sonnet-4-6` | OK |

### Bootstrap (1 file, 1 call site)

| File | Line | Model | Notes |
|---|---|---|---|
| `server/src/index.ts` | 643 | `claude-sonnet-4-20250514` | ⚠ Date-suffixed alias. Inline endpoint that should move into a route module per `suggested.md` Phase 5. |

---

## 2. Client instantiation patterns

`server/src/utils/claude-helpers.ts` exports only a tiny `extractText(message, fallback)` helper — no shared client.

**19 `new Anthropic({ apiKey: config.anthropicApiKey })` instantiations**, one per module that needs LLM access:

- 10 in services, 8 in routes, 1 inline in `server/src/index.ts:634` (for the line-643 call site).
- Pattern is module-level singleton: `const anthropic = new Anthropic({ ... })` at the top of the file, then `anthropic.messages.create(...)` inside handlers/services.
- One exception: `audit-agent.ts:32-37` uses lazy init via `getAnthropic()` — same end result.

No client carries `maxRetries`, custom `timeout`, custom `baseURL`, or any other option. Default retry policy applies (`maxRetries: 2` per SDK default). No client-side rate limiter wraps any call.

Implication for Track B: lifting this to a single shared client owned by `services/llm-gateway.ts` is one search-and-replace, not a deep refactor.

---

## 3. Existing cost / rate-limit machinery

### What is in place

**`cost_ledger` table** — `server/src/db/schema.ts:224`:

```sql
CREATE TABLE IF NOT EXISTS cost_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  sprint_id TEXT,
  job_id TEXT,
  api_provider TEXT NOT NULL,   -- e.g. 'anthropic', 'gemini', 'flux', 'heygen'
  operation TEXT NOT NULL,
  cost_cents INTEGER NOT NULL,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

No index on `(user_id, created_at)`. `db_structure.md` § 11 already flags this; an index for daily-aggregate queries should land alongside the gateway work, or as part of P1.1 (PG migration) — minor either way.

**Plan-tier daily caps** — `server/src/services/job-queue.ts:23-30`:

| Plan | Daily cap |
|---|---:|
| `free` | 500¢ ($5/day) |
| `solo` | 5_000¢ ($50/day) |
| `growth` | 20_000¢ ($200/day) |
| `agency` | 100_000¢ ($1000/day) |
| (default for unknown plan) | 1_000¢ ($10/day) |

**`checkDailyLimit(userId)`** — `server/src/services/job-queue.ts:64-74`. Returns `{ allowed, spent, limit, remaining }`. Backed by `getDailySpendCents` (sums `cost_ledger.cost_cents` for `user_id` and today) and `getUserDailyLimit` (reads `users.plan`).

**Cost writes happen** in `services/job-queue.ts → dispatchJob` for Flux / HeyGen / Meta-side spend. The 24 LLM call sites enumerated above do **not** call `checkDailyLimit` and do **not** write to `cost_ledger`.

### What is missing

| Layer | Status |
|---|---|
| Per-user daily cap on Anthropic spend | ❌ — caps exist but aren't enforced on LLM routes |
| Per-user daily cap on Gemini spend | ❌ — same |
| Org-wide RPM throttling (Anthropic) | ❌ — relies entirely on Anthropic returning 429 |
| Org-wide ITPM throttling (Anthropic) | ❌ |
| Org-wide OTPM throttling (Anthropic) | ❌ |
| Retry / exponential backoff on 429/5xx | ❌ — SDK default `maxRetries: 2` is in effect because no caller overrides it; nothing parses the retry shape |
| Circuit breaker per provider | ❌ |
| Pre-flight token estimation | ❌ — `client.messages.countTokens` is never called |
| `cost_ledger` writes from LLM call sites | ❌ |
| `anthropic-ratelimit-*` header inspection / logging | ❌ |
| Typed error handling (`Anthropic.RateLimitError`) | ❌ — generic `try { ... } catch (err) { ... }` everywhere |

---

## 4. Model-string issues to fix while migrating

Per the `claude-api` skill (`shared/models.md` and `shared/model-migration.md`): use **exact aliases from the catalog**, not date-suffixed strings constructed from training-data memory. Three sites use `claude-sonnet-4-20250514`, which is an old date-suffixed Sonnet 4 alias. The current Sonnet alias is `claude-sonnet-4-6`. Same models, different version — keeping the old alias quietly pins to Sonnet 4 and forgoes 4.5/4.6 improvements.

| File | Line | Current | Recommended |
|---|---|---|---|
| `server/src/services/audit-agent.ts` | 506 | `claude-sonnet-4-20250514` | `claude-sonnet-4-6` |
| `server/src/index.ts` | 643 | `claude-sonnet-4-20250514` | `claude-sonnet-4-6` |
| `server/src/routes/creative-studio.ts` | 300 | `claude-sonnet-4-20250514` | `claude-sonnet-4-6` |

The four `claude-haiku-4-5-20251001` strings (`agent-memory.ts:123`, `ai.ts:391`, `creative-studio.ts:70, 393`) are valid — `claude-haiku-4-5-20251001` is the published full ID for Haiku 4.5, but the alias `claude-haiku-4-5` is preferred. Cosmetic, not a correctness issue.

The gateway can accept a known-aliases set and reject anything else, so this enforces itself once Track B lands.

---

## 5. Other LLM providers (in scope to flag, not to over-engineer)

**Google Gemini** — `@google/generative-ai@^0.24.1`. Two call sites:

- `server/src/audit/audit-agent.ts:480` — `analyzeWithGemini` calls `gemini-1.5-flash`. Gemini is **primary** for audit (free-tier first), Claude is fallback (`audit-agent.ts:524-530`).
- `server/src/services/visual-analyzer.ts:126-190` — Gemini File API for vision (resumable upload).

Same per-user cost-ledger gate should apply (`api_provider='gemini'`). Org-wide rate limiting for Gemini is a separate shape (Google enforces its own quota; less urgent because a leaked key on a free-tier project is the bigger blast radius than RPM).

**No OpenAI, no Mistral, no other LLM SDKs** — `package.json` confirms.

---

## 6. Job queue, cron, and where rate limiting needs to live

**Job queue:** `server/src/services/job-queue.ts` is in-process, SQLite-backed, MAX_CONCURRENT=5. It runs Anthropic calls indirectly through services like `services/creative-scorer.ts`, but the queue itself does not call Anthropic. The gateway slots in *below* the queue — every `messages.create` regardless of caller goes through it.

**Cron:** 5 cron schedules in `routes/agent.ts` (morning brief at 01:30, ad-perf trends at 01:35, weekly competitive intel Mon 02:00, weekly benchmarking Sun 03:00, weekly creative-DNA Tue 02:00). All eventually call services that issue `messages.create`. If two of these fire close together, today they hit Anthropic in parallel with no coordination — exactly where org-wide RPM/ITPM enforcement matters.

**Auth on cron-touched endpoints:** `routes/schedules.ts` is unauthenticated today (`backend_wiring.md` § F1). Out of scope for this bundle but worth pairing the gateway rollout with the Phase 0.4 cookie-auth fix so unauthenticated cron triggers can't bypass the per-user cap.

---

## 7. Single-replica posture today

`railway.toml` runs one instance. An in-process limiter (Node-side `bottleneck`) is correct for single-replica. Phase 3 of `suggested.md` adds Redis (BullMQ); at that point the limiter switches to Bottleneck's Redis backend with no API change. This is the right posture for today and forward-compatible.
