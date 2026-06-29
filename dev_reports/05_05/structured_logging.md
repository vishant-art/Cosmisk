> **Status: ♻️ SUPERSEDED (2026-05-31)** — May-03 structured-logging plan; counts re-baselined. Superseded by `19_05/structured_logging.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Structured Logging Guide (2026-05-03)

## Unique essence preserved

- **console.* inventory (2026-05-03 baseline, before re-baseline)**: 85 total `console.log/error/warn` across 7 files —
  - `audit/index.ts`: 55 (CLI-style flow before route wiring)
  - `services/audit-scheduler.ts`: 15 (forked from CLI flow)
  - `audit/audit-agent.ts`: 6
  - `routes/audits.ts`: 4 (CLI status prints carried into route)
  - `config.ts`: 3 — **KEEP as console.error** (fire on missing-secret boot detection before pino is constructed; pino there would swallow the msg or re-introduce a circular dep)
  - `audit/website-analysis.ts`: 1
  - `audit/google-ads-ingestion.ts`: 1
- Section 1 also cited an older figure: **76** `console.log` in the audit pipeline (`audit/index.ts`, `audit/audit-agent.ts`, `services/audit-scheduler.ts`). The 85/7-file count above supersedes it.
- **35 of 42 files** already import and use the shared `logger` correctly; the remaining **7** (the files above) are the gap.
- Canonical logger: `server/src/utils/logger.ts` (pino; pino-pretty in dev, JSON/line in prod). Fastify wired with same pino config at **`server/src/index.ts:50-57`**, so `app.log`/`request.log` flow to same output and carry `reqId`.
- **Cron jobs that run silently** (the pain motivating the plan): `morning-briefing` (01:30 UTC), `ad-watchdog`, `report-agent`, `sales-agent`, weekly competitive-intel job, audit scheduler.
- **LLM gateway (Track B)** fan-out across **19 callers** — on upstream 429 need `{ userId, operation, model }` consistently.
- **CI assertion to enforce once migrated**: `! rg -q "console\.(log|warn|error)" server/src --glob '!server/src/config.ts' --glob '!server/src/__tests__/**'` (tests may use console.* freely). After migration, `rg "console\.(log|warn|error)" server/src/` should return only the 3 intentional `config.ts` lines.
- **Optional LOG_LEVEL override** (logger currently reads `config.nodeEnv`, not `LOG_LEVEL`): add to `utils/logger.ts` — `level: env['LOG_LEVEL'] || (config.nodeEnv === 'production' ? 'info' : 'debug')`.
- **Rollout (one PR, mechanical, ~couple hours)**: (1) replace **82** `console.*` across the 7 files, keep the 3 in `config.ts`; (2) add the 3 boot-time `logger.info` lines (gateway already exists; JobQueue recovered-sprints + AuditScheduler schedule-count recommended); (3) add lifecycle logs (`Run starting`/`Run complete`/`Run failed`) to the **5 cron handlers in `routes/agent.ts`** if missing; (4) add the CI assertion.
- **Exemplar services that already follow the convention** (copy these): `services/llm-gateway.ts` (canonical; `{userId, operation}` tags), `services/job-queue.ts` (`[JobQueue]` prefix, structured `err`, lifecycle logs), `services/creative-strategist.ts`, `routes/ai.ts`. The 7 section-5 files are the migration target, not the model.
- Convention specifics (carried to successor; kept here as the originating plan): context-object-first pino calls; levels error/warn/info/debug; pass real error under `err` (not stringified, preserves stack); never log secrets/tokens/full bodies/prompts/PII (log hash or `slice(-4)`, ids, shape, counts); subsystem `[Bracket]` prefix; sentence-case message; no emojis; no trailing period.

## Pointer

- SUPERSEDED -> full restatement (remediates Risk E per 19_05/new_and_added_risks.md; cited by 23_05/risk_register.md:20,60): see `19_05/structured_logging.md`.
