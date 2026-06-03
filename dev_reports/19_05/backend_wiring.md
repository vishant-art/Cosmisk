> **Status: ♻️ SUPERSEDED (2026-05-31)** — May-19 backend-wiring refresh. Superseded by `23_05/state_of_codebase.md` / `23_05/module_inventory.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# Backend Wiring & Flows — Refresh (2026-05-19/20)

**Supersedes:** `dev_reports/backend_wiring.md` (2026-04-26)
**Stack:** Fastify (Node 22, ESM, TypeScript strict), `better-sqlite3`, `@anthropic-ai/sdk`, Angular 17.
**Entry point:** `server/src/index.ts` (**1,326 LOC** — was 1,287; still mixes bootstrap with ad-hoc endpoints).
**Process model:** unchanged. Single Node process; 13 cron schedules inside the API process (was 8).

---

## 1. Headline delta

| Metric | 2026-04-26 | 2026-05-19 | Delta |
|---|---:|---:|---:|
| Route modules **imported** in `index.ts` | 29 | **36** | +7 |
| Route modules **registered** with `app.register` | 29 | **43** | +14 |
| Route files actually present in `server/src/routes/` | 29 | **32** | +3 |
| Services in `server/src/services/` (excl. `__tests__`) | 28 | **82** | +54 |
| Cron schedules inside API process | 8 | **13** | +5 |
| Index.ts LOC | 1,287 | **1,326** | +39 |

**Critical mismatch.** The 43 registered vs 32 present mean **11 registrations point to imports that do not exist or are duplicated**. Confirmed missing files (per `19_05/new_and_added_risks.md` § N): `health-score.ts`, `creative-scan.ts`, `quick-wins.ts`, `static-ads.ts`. The remaining 7 register-count is consistent with multi-route exports per file.

---

## 2. Registered route prefixes (post-merge, 43 calls)

Grouped by status:

### 2.1 Healthy — file present, imports resolve

```
/auth                routes/auth.ts                 — JWT mixed
/ad-accounts         routes/ad-accounts.ts          — JWT
/dashboard           routes/dashboard.ts            — JWT
/analytics           routes/analytics.ts            — JWT
/brain               routes/brain.ts                — JWT
/director            routes/director.ts             — JWT
/ai                  routes/ai.ts                   — JWT (1,379 LOC, god-file)
/reports             routes/reports.ts              — JWT
/ugc                 routes/ugc.ts                  — JWT
(root-level)         routes/ugc-workflows.ts        — JWT
/brands              routes/brands.ts               — JWT
/assets              routes/assets.ts               — JWT
/automations         routes/automations.ts          — JWT
/campaigns           routes/campaigns.ts            — JWT
/media               routes/media-gen.ts            — JWT
/billing             routes/billing.ts              — JWT + HMAC for webhooks
/autopilot           routes/autopilot.ts            — JWT + 4h cron
/competitor-spy      routes/competitor-spy.ts       — JWT (rate-limited LLM analyse)
/google-ads          routes/google-ads.ts           — JWT
/tiktok-ads          routes/tiktok-ads.ts           — JWT
/creative-engine     routes/creative-engine.ts      — JWT (1,641 LOC, god-file)
/content             routes/content.ts              — JWT
/score               routes/score.ts                — JWT
/agent               routes/agent.ts                — JWT + 7 cron schedules
/swipe-file          routes/swipe-file.ts           — JWT
/team                routes/team.ts                 — JWT
/creative-studio     routes/creative-studio.ts      — JWT
/audits              routes/audits.ts               — JWT
/schedules           routes/schedules.ts            — NONE (Risk: missing auth)
/ad-command          routes/ad-command.ts           — JWT (NEW since 2026-04-26)
/shopify             routes/shopify.ts              — JWT (NEW since 2026-04-26)
(root-level)         routes/intelligence.ts         — JWT (NEW since 2026-04-26)
```

### 2.2 Broken — registered but file does NOT exist

```
/health-score        routes/health-score.ts         — MISSING
/creative-scan       routes/creative-scan.ts        — MISSING
/quick-wins          routes/quick-wins.ts           — MISSING
/static-ads          routes/static-ads.ts           — MISSING
```

**Impact.** Server cannot compile. See `19_05/cleanup_suggestions.md` S1.1 for the remediation.

---

## 3. Services delta (28 → 82)

The original report listed 28 services. Today there are 82 files in `server/src/services/`. The new arrivals fall into five clusters:

### 3.1 Analyst agents (8 new)
`cohort-ltv-analyzer.ts` (1,029), `competitor-creative-intel.ts` (2,614), `comment-mining-agent.ts` (1,818), `creative-scorer.ts` (1,192), `discount-leakage-detector.ts` (914), `fatigue-detector.ts`, `oos-detector.ts` (1,284), `competitor-intel-report.ts`.

### 3.2 Service-clients abstraction (1 new)
`service-clients.ts` (952) — per-brand identity model for agency-delivery.

### 3.3 Strategic-cognition cluster (9 new under `services/strategic-cognition/`)
`causal-intelligence.ts`, `competing-hypotheses.ts`, `narrative-synthesis.ts`, `elite-decision-compression.ts`, `recursive-investigator.ts`, `self-improving-cognition.ts`, `strategic-curiosity.ts`, `uncertainty-intelligence.ts`, `client-report-generator.ts`.

### 3.4 Intelligence + quality cluster (12 new)
- `services/intelligence-layer/` — `deep-search-protocol.ts`, `elite-quality-gate.ts`, `index.ts`, `mediocrity-detector.ts`, `thinking-quality-evaluator.ts`.
- `services/quality-governance/` — `explainable-quality-engine.ts`, `quality-scorer.ts`, `index.ts`.
- `services/elite-intelligence/` — `html-report.ts`, `index.ts`, `reasoning-engines.ts`, `signal-collector.ts`, `synthesis-engine.ts`, `types.ts`.

### 3.5 LLM-gateway carve-out (1 new, in scope)
`llm-gateway.ts` (~338 LOC of meaningful code) — the central Anthropic wrapper. `cost_ledger` accounting + Bottleneck rate limit. **Tested:** `__tests__/llm-gateway.test.ts` (357 lines).

### 3.6 Operator experience + reality testing (4 new)
`operator-experience.ts` (2,788), `reality-testing.ts` (1,469), `learning-engine.ts` (1,236), `recommendation-loop.ts` (440).

### 3.7 Infrastructure / aggregator (5 new)
`multi-account-aggregator.ts`, `multi-region-aggregator.ts`, `intelligence-infrastructure.ts`, `intelligence-persistence.ts`, `strategic-memory.ts`, `strategic-intelligence-engine.ts`, `organic-paid-intelligence.ts`, `unified-agent-runner.ts`.

### 3.8 Shopify (3 new)
`shopify-client.ts` (630 LOC equivalent), `audit/shopify-ingestion.ts`, `routes/shopify.ts`.

### 3.9 Misc (3 new)
`build-gate.ts`, `quality-gate.ts`, `quality-gated-runner.ts`, `client-context.ts`.

---

## 4. Direct-Anthropic call sites (post LLM-gateway carve-out)

The gateway is the single source of `new Anthropic({...})`. Verification today:

```
$ grep -l "new Anthropic\b" server/src --include="*.ts" | grep -v __tests__
server/src/services/llm-gateway.ts            ← canonical owner (OK)
server/src/services/competitor-creative-intel.ts   ← NOT wrapped
server/src/services/comment-mining-agent.ts        ← NOT wrapped
```

**Status:** 2 services still bypass the gateway. Both are large (4,432 LOC combined). See `19_05/rate_limiting/implementation_plan.md` and `19_05/cleanup_suggestions.md` S3.

---

## 5. Cron schedules (13 in-process)

```
services/audit-scheduler.ts         × 2  (per-user + system)
routes/autopilot.ts                 × 1  ( */4 h, was daily)
routes/agent.ts                     × 7  ( watchdog 6h, briefing 2h, weekly reports, etc.)
routes/reports.ts                   × 1  (weekly Monday 7am)
routes/automations.ts               × 1  ( */4 h)
                              total  13
```

All inside the API process. **Cadence has tightened** from once-daily to every 4–6 hours; per `analysis/new_added_risks_and_design.md` Risk J this materially raises the blast radius of any cron-induced API hang.

---

## 6. Boot-sequence diff vs original

Steps unchanged: 1 (config), 2 (Fastify), 3 (cors), 4 (helmet), 5 (rate-limit), 6 (auth plugin), 7 (usage-limiter), 8 (error handler), 9 (`/health`), 10 (public leads + waitlist), 14 (ad-hoc `/ugc/avatars`), 15 (slow-request hook), 16 (`getDb`), 17 (SIGINT/SIGTERM, no unhandledRejection), 18 (listen + recoverInterruptedSprints).

Step 11 (route registrations) bloated from 29 to 43 calls (4 of which point to missing files; see § 2.2).
Step 12 (`initializeScheduler`) now boots 2 audit-scheduler crons (unchanged behaviour, larger client base).

---

## 7. Open mid-flight issues

1. **`/schedules` still has no JWT auth** (unchanged from 2026-04-26 finding). Promote to S1 alongside the broken imports.
2. **`/ad-command`** is new and JWT-protected. No issue.
3. **`/shopify`** is new and JWT-protected. Imports `../utils/encryption.js` which **does not exist** — same build-broken cluster as § 2.2.
4. **`unified-agent-runner.ts`** imports 12 analyser files that don't exist. Likely an unfinished feature.

---

**End of refresh.**
