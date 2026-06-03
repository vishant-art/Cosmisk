> **Status: ♻️ SUPERSEDED (2026-05-31)** — May-03 structured-logging plan; counts re-baselined. Superseded by `19_05/structured_logging.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# Structured Logging Guide (2026-05-03)

How to make every backend service surface useful, structured log entries in the terminal during `npm run dev`, so error diagnosis stops requiring stack-trace archaeology.

---

## 1. Why this exists

Today, log coverage in the server is inconsistent. Some services emit clean structured logs via the shared pino `logger`. Others fall back to `console.log` with emojis and string concatenation. A few critical paths (cron, background jobs, the audit pipeline) do not log enough context, so when something fails the only signal is a 500 response or a silently-stuck job.

Concrete pain this causes today:

- **Cron jobs run silently.** `morning-briefing` (01:30 UTC), `ad-watchdog`, `report-agent`, `sales-agent`, the weekly competitive-intel job, and the audit scheduler all execute without surfacing anything in the terminal until they fail. By then the failure is already in production logs and the local repro is gone.
- **The audit pipeline uses 76 `console.log` calls** (across `audit/index.ts`, `audit/audit-agent.ts`, `services/audit-scheduler.ts`). These print to stdout but do not carry structured context, so you cannot grep them by `userId`, `brandId`, or `auditId` in a noisy terminal, and they ship to production stdout without log-level filtering.
- **External API calls fail without context.** A `safeFetch` to Meta, Google, or Anthropic that 500s often only logs the error, not which userId / accountId / operation triggered it. Reproducing the failure means reverse-engineering the call site from the stack trace.
- **The new LLM gateway (Track B) introduced fan-out across 19 callers.** When an upstream 429 happens, you need to know which caller, which model class, which userId. Without consistent structured fields on every log line, the gateway's own warnings are useful but the surrounding context is missing.

Goal: every meaningful event in every service emits one structured log entry, viewable live in the terminal during `npm --prefix server run dev`, and indexable in production by field (userId, operation, error type) instead of by free-text grep.

---

## 2. What is already in place

**Logger:** `server/src/utils/logger.ts`

```ts
import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: config.nodeEnv === 'production' ? 'info' : 'debug',
  ...(config.nodeEnv === 'production' ? {} : {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
});
```

That is the canonical logger. In dev it pipes through `pino-pretty` so output is colorized, line-formatted, and easy to scan in the terminal. In production it emits one JSON object per line, which Railway / Datadog / Loki all parse natively.

**Fastify is already wired** at `server/src/index.ts:50-57` with the same pino config, so `app.log.info(...)` and `request.log.info(...)` inside route handlers also flow to the same terminal output. Those carry `reqId` automatically, which is useful for correlating multi-step request handling.

**35 of 42 files** already import the shared logger and use it correctly: routes (`ai.ts`, `reports.ts`, `creative-engine.ts`, etc.), services (`job-queue.ts`, `creative-strategist.ts`, `morning-briefing.ts`, `llm-gateway.ts`, etc.). The remaining 7 are the gap.

**85 `console.log` / `console.error` / `console.warn` calls** still exist in:

| File | Count | Why it leaks |
|---|---:|---|
| `audit/index.ts` | 55 | Built as a CLI-style flow before being wired into routes |
| `services/audit-scheduler.ts` | 15 | Forked from the CLI flow |
| `audit/audit-agent.ts` | 6 | Same lineage |
| `routes/audits.ts` | 4 | Carries CLI-style status prints into the route |
| `config.ts` | 3 | Production-bootstrap fatal errors before pino is initialized (these are arguably correct) |
| `audit/website-analysis.ts` | 1 | One-off |
| `audit/google-ads-ingestion.ts` | 1 | One-off |

The three `console.error` calls in `config.ts` run before pino is constructed (they fire on missing-secret detection during boot), so leaving them as `console.error` is correct. Everything else should move to the shared logger.

---

## 3. The convention

**One rule:** never call `console.log` / `console.warn` / `console.error` from inside server code (the only exception is bootstrap-time fatal errors in `config.ts`, where pino is not initialized yet). Use the shared `logger` for everything else.

### 3.1 Shape of a log call

```ts
logger.info({ userId, accountId, operation: 'audit.run' }, 'Audit completed');
logger.warn({ userId, spent, limit }, '[LLM-Gateway] Daily Anthropic cap exceeded');
logger.error({ err, userId, brandId }, '[Audit] Gemini analysis failed, falling back to Claude');
```

The pattern is always the same: pino takes a **context object first, then a human-readable message**. The context object becomes structured fields in the JSON output and tagged key-value pairs in pino-pretty terminal output. The message is the searchable string.

**Why the context object matters:**

- In dev the terminal shows e.g. `[12:42:18] WARN: [LLM-Gateway] Daily Anthropic cap exceeded {"userId":"u_abc","spent":500,"limit":500}`. Easy to grep by user.
- In production Railway and Datadog parse these into queryable fields. `userId:u_abc AND level:warn` becomes a one-line query.

### 3.2 Levels

| Level | When to use | Examples |
|---|---|---|
| `logger.error` | Something failed and the user is affected, OR an unhandled exception was caught | upstream 500 from Meta API, JSON parse failure on user-visible response, DB write rollback |
| `logger.warn` | Something failed but was handled gracefully, OR a soft limit was hit | LLM cap exceeded (caller will see 429), Gemini analysis failed and we fell back to Claude, retry-after received and obeyed |
| `logger.info` | A meaningful state change worth surfacing in dev and prod | sprint started, sprint completed, cron job started/finished, scheduled-audit run dispatched, server boot, gateway initialized with tier/reservoirs |
| `logger.debug` | Verbose flow info useful only when actively debugging | "fetched 47 campaigns", "preflight token estimate: 1240", per-loop iteration details |

In dev, `level: 'debug'` is on, so all four show. In production only `info` and above show, which keeps log volume sane.

### 3.3 Always include context, never just a string

These two log the same event. Only one is useful when you need to find it later:

```ts
// Bad. Searchable only by exact string match.
logger.info(`Sprint ${sprintId} completed in ${ms}ms with ${count} creatives`);

// Good. Each value is a queryable field.
logger.info({ sprintId, durationMs: ms, creativeCount: count }, 'Sprint completed');
```

The first form is fine when there genuinely is no context (server boot lines, for instance). The second is the default.

### 3.4 Errors get the `err` field, not stringified

```ts
// Bad. Loses stack trace, swallows non-Error throws.
catch (err: any) {
  logger.error(`Failed: ${err.message}`);
}

// Good. pino serializes Error objects with stack.
catch (err) {
  logger.error({ err, userId, operation: 'audit.run' }, 'Audit failed');
}
```

Pass the actual error object under `err`. Pino has a built-in serializer that captures `name`, `message`, and `stack`. If you stringify it yourself you lose the stack.

---

## 4. Where to add logging

Don't sprinkle. Log at boundaries. Six categories:

### 4.1 Route entry (only when worth surfacing)

Most routes do not need an entry log because Fastify's default logger already prints one per request with `reqId`, method, URL, and timing. Only add an explicit entry log if the handler does something the request line wouldn't show: kicking off a long async job, dispatching to a cron-style worker, fanning out to multiple providers.

```ts
app.post('/audits/run', { preHandler: [app.authenticate] }, async (request, reply) => {
  request.log.info({ brandId, datePreset }, 'Audit run requested');
  // ...
});
```

`request.log` carries the request's `reqId` automatically, which is the right way to log inside a handler.

### 4.2 External API calls (always)

Every call out to Meta, Google, Anthropic, Gemini, Stripe, Razorpay, n8n, Slack, etc. should log:
- Once at the call site if a non-trivial branch depends on the result, OR
- Inside the catch block, with structured context (which provider, which userId, which operation).

```ts
try {
  const response = await metaApi.get(`/${accountId}/insights`, { ... });
} catch (err) {
  logger.error({ err, userId, accountId, endpoint: 'insights' }, '[MetaApi] Insights fetch failed');
  throw err;
}
```

The LLM gateway is the canonical example. Look at `services/llm-gateway.ts` for the pattern: `logger.warn` on cap exceeded with `{ userId, spent, limit, operation }`, `logger.warn` on upstream 429 with `{ userId, operation, model }`. Replicate that shape.

### 4.3 Branches with diagnostic value

When code makes a non-obvious choice ("Gemini failed, falling back to Claude"; "no Meta token, skipping account"; "below the spend confidence threshold, skipping recommendation"), log it. This is exactly the kind of line that, six weeks later, you wish was in the terminal when you're trying to figure out why a user got an empty response.

```ts
if (!process.env['GOOGLE_AI_API_KEY']) {
  logger.warn({ userId, brandId }, '[Audit] Gemini key missing, falling back to Claude');
  return analyzeWithClaude(prompt, userId);
}
```

### 4.4 Cron / background job lifecycle

Every cron handler and every background job should emit:
- `info` on start, with the job name and any input ids.
- `info` on success, with duration and counts.
- `error` on failure, with `err` plus enough context to reproduce.

```ts
async function runMorningBriefing() {
  const startedAt = Date.now();
  logger.info({ trigger: 'cron' }, '[MorningBriefing] Run starting');
  try {
    const sent = await dispatchAll();
    logger.info({ sent, durationMs: Date.now() - startedAt }, '[MorningBriefing] Run complete');
  } catch (err) {
    logger.error({ err, durationMs: Date.now() - startedAt }, '[MorningBriefing] Run failed');
    throw err;
  }
}
```

This is what makes cron stop being a black box.

### 4.5 Errors caught at any layer

If you catch it, log it before deciding what to do with it. Even if you re-throw, the log line carries the context the caller may have lost.

### 4.6 Server boot

The server already logs Fastify's startup line. Add one line per major subsystem so the dev terminal tells you what initialized:

```ts
logger.info({ tier, limits }, '[LLM-Gateway] Initialized with Anthropic Tier reservoirs');  // already exists
logger.info({ activeJobs }, '[JobQueue] Recovered N interrupted sprints on boot');         // recommended
logger.info({ scheduleCount }, '[AuditScheduler] N audit schedules loaded');               // recommended
```

When the dev terminal scrolls cleanly through these on `npm run dev`, you know the boot sequence is healthy.

---

## 5. Concrete migration: the 7 files with `console.log`

Today the audit pipeline prints lines like:

```ts
console.log(`\n🔍 Starting audit for brand: ${brandId}`);
console.log(`   Date range: ${datePreset}`);
console.log('\n📦 Loading brand data...');
console.log(`   Brand: ${brand.name} (${brand.category})`);
```

Replace with:

```ts
logger.info({ brandId, datePreset }, '[Audit] Run starting');
logger.info({ brandId, brandName: brand.name, category: brand.category }, '[Audit] Brand loaded');
```

Same information, fewer lines, structured fields, no emojis cluttering the terminal, and grep-able by `brandId`. In dev the pino-pretty output is still readable and color-coded; in production it ships clean JSON.

The mechanical work:

1. **`audit/index.ts`** (55 calls): the CLI-style "step header" prints (`📦 Loading brand data`, `🔑 Getting Meta access token`, etc.) collapse to one `logger.info` per step with the relevant ids in context. Status lines (`Total spend: ₹X`) become `logger.info({ totalSpend, creativeCount }, '[Audit] Meta data fetched')`.
2. **`services/audit-scheduler.ts`** (15 calls): same pattern. Each `console.log` describing a scheduled-audit lifecycle event becomes a `logger.info` with `{ scheduleId, brandId, brandName }` context.
3. **`audit/audit-agent.ts`** (6 calls): `console.log('   Using Gemini (free tier)...')` → `logger.info({ userId, brandId, provider: 'gemini' }, '[Audit] Using Gemini')`. The fallback line (`Gemini failed, trying Claude...`) becomes `logger.warn({ userId, brandId, err }, '[Audit] Gemini failed, falling back to Claude')`.
4. **`routes/audits.ts`** (4 calls): replace with `request.log.info(...)` so the request id is preserved.
5. **`audit/website-analysis.ts`**, **`audit/google-ads-ingestion.ts`** (1 each): trivial.
6. **`config.ts`** (3 calls): leave as `console.error`. They run during boot before pino is constructed; using pino there would either silently swallow the message or re-introduce a circular dependency.

After this migration, `rg "console\.(log|warn|error)" server/src/` should return only the three intentional lines in `config.ts`. That assertion is the one to enforce in CI when this is done.

---

## 6. What NOT to log

| Never log | Why | What to do instead |
|---|---|---|
| API keys, JWT secrets, OAuth tokens, encryption keys | Logs are persisted, replicated, and shipped to third-party log providers. A leaked token in a log line is as bad as one in code. | Log a hash or the last 4 chars: `{ keyHint: token.slice(-4) }` |
| Full request bodies that may contain user content | Same reason. Also bloats logs. | Log shape: `{ messageCount: messages.length, totalChars: ... }` |
| Full LLM prompts | They often contain user data, brand secrets, or competitor names | Log the operation name and token estimate instead |
| Raw stack traces in `info` lines | Buries the signal. Stack belongs only with errors. | Use `logger.error({ err }, ...)` so pino formats it once, in the right place |
| One log per loop iteration in tight loops | Floods the terminal in dev and the log bill in prod | Log once per batch with `{ batchSize, processed, failed }` |
| Personal data (full email, phone, address) when an id will do | Privacy / compliance | Log `{ userId }`, look up the rest only when needed |

---

## 7. How to view it in the terminal

**Run the dev server:**

```bash
npm --prefix server run dev
```

This starts `tsx watch src/index.ts`. The pino-pretty transport renders each entry like:

```
[12:42:18.305] INFO  (8421): [LLM-Gateway] Initialized with Anthropic Tier reservoirs
    tier: 1
    limits: { sonnet: { rpm: 50, itpm: 30000, otpm: 8000 }, ... }
[12:42:18.412] INFO  (8421): Server listening at http://0.0.0.0:3000
[12:42:23.178] INFO  (8421): incoming request
    reqId: "req-1"
    method: "POST"
    url: "/ai/chat"
[12:42:24.501] WARN  (8421): [LLM-Gateway] Daily Anthropic cap exceeded
    userId: "u_abc123"
    operation: "ai.askClaude"
    spent: 500
    limit: 500
```

**Filter by level** in dev (e.g. only warnings and errors):

```bash
LOG_LEVEL=warn npm --prefix server run dev
```

(The logger reads `config.nodeEnv` today, not `LOG_LEVEL`. If you want this filtering, add a one-line override in `utils/logger.ts`: `level: env['LOG_LEVEL'] || (config.nodeEnv === 'production' ? 'info' : 'debug')`.)

**Filter by string** with grep / ripgrep, since pino-pretty output is line-oriented:

```bash
npm --prefix server run dev | rg "LLM-Gateway"
npm --prefix server run dev | rg "userId.*u_abc123"
```

**In production** the output is one JSON object per line. Pipe to `jq` for ad-hoc analysis on Railway:

```bash
railway logs | jq 'select(.userId == "u_abc123" and .level >= 40)'
```

---

## 8. Style notes

- **Prefix with the subsystem in brackets.** `[LLM-Gateway]`, `[JobQueue]`, `[Audit]`, `[MorningBriefing]`. Keeps terminal output scannable when many subsystems are emitting concurrently. Already the dominant pattern in `services/job-queue.ts` and `services/llm-gateway.ts`.
- **Sentence case for the message.** "Daily cap exceeded" not "daily_cap_exceeded" and not "DAILY CAP EXCEEDED". The structured fields carry the data; the message is for human eyes.
- **No emojis in log messages.** They render as `?` boxes in some terminals and add nothing in production JSON. The audit pipeline's existing emoji prints are part of why this guide exists.
- **Past tense for completed events** (`Sprint completed`), **present participle for in-flight** (`Generating script`), **gerund or imperative for starting** (`Starting morning briefing` / `Run starting`). Pick one and stay consistent within a subsystem.
- **No trailing period.** Pino convention. `'Sprint completed'`, not `'Sprint completed.'`.

---

## 9. Recommended rollout

This is the cheap version. Do it in one PR, since the changes are mechanical and the audit pipeline is the only real surface area.

1. Replace 82 `console.*` calls across the 7 files listed in section 5. Keep the 3 in `config.ts`.
2. Add the three boot-time `logger.info` lines suggested in section 4.6.
3. Add lifecycle logs (`Run starting` / `Run complete` / `Run failed`) to the five cron handlers in `routes/agent.ts` if they are missing.
4. Add a CI assertion: `! rg -q "console\.(log|warn|error)" server/src --glob '!server/src/config.ts' --glob '!server/src/__tests__/**'`. (Tests can use `console.*` freely.)

Total effort: a couple of hours of mechanical edits. The payoff is that every meaningful event in every subsystem becomes visible in the terminal during dev, and queryable by structured field in production.

---

## 10. Reference: services that already follow this pattern well

If you need an example of the convention in practice, read these (in order of how representative they are):

- **`services/llm-gateway.ts`** (this branch). Tight, structured, every important event tagged with `userId` and `operation`.
- **`services/job-queue.ts`**. The `[JobQueue]` prefix, structured `err`, lifecycle logs on sprint start / completion / failure.
- **`services/creative-strategist.ts`**. Service-level logger usage with brand and run context.
- **`routes/ai.ts`**. Uses `logger` from the module and falls back to graceful errors.

The services to **avoid copying** are the ones in section 5: they are the migration target, not the model.
