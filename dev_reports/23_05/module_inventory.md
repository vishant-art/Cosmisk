# Module Inventory — Running / Partial / Stubbed / Planned

**As of:** 2026-05-23
**Source:** file-by-file pass over `server/src/services/`, `server/src/routes/`, `server/src/plugins/`. Backed by `wc -l`, JSDoc inspection, and grep for self-declared stub markers.

> Stub classification rule: a file is a Stub if it (a) is < 120 LOC, (b) its JSDoc explicitly says "stub", and (c) it emits a `logger.debug('… stub …')` or `request.log.warn('Route placeholder executed')` line at runtime.

---

## 1. RUNNING — production code, in real use

### 1.1 Core infrastructure

| Module | LOC | What it does | Verified |
|---|---:|---|---|
| `services/llm-gateway.ts` | 343 | Single Anthropic entrypoint. Per-provider daily cap, cost-ledger writes, RPM/ITPM bottleneck, retry-after handling. | 15/15 tests pass |
| `services/token-crypto.ts` | 32 | AES-256-GCM token encryption (Meta + Shopify tokens). | Used at boot |
| `utils/encryption.ts` | small (new) | Re-export bridge to `token-crypto.ts` for legacy import paths. | Build resolves |
| `db/schema.ts`, `db/index.ts` | — | `better-sqlite3` open + table creation. | Server boots |
| `plugins/auth.ts`, `plugins/usage-limiter.ts` | — | JWT decorator + usage limiter. | All authed routes work |
| `config.ts` | — | Env parsing. | Boot validates |
| `utils/logger.ts`, `utils/safe-fetch.ts`, `utils/error-response.ts`, `utils/claude-helpers.ts` | — | Pino logger, fetch wrapper, error shaper, Claude text-extract helper. | Used across services |

### 1.2 Intelligence (real)

| Module | LOC | What it does | Notes |
|---|---:|---|---|
| `services/oos-detector.ts` | 1284 | Fuzzy product matching, per-product spend, Shopify cross-ref, catalog DPA. | Integrated into Watchdog at line 508-536 |
| `services/discount-leakage-detector.ts` | 914 | Coupon-site scrape, Shopify discount-code match, revenue impact. | Watchdog-integrated |
| `services/ad-watchdog.ts` | 1202 | 13-type decision engine (ROAS decline, CPA spike, wasted spend, creative fatigue, OOS, leakage, etc). | 7 tests skipped (gateway/mock issue) |
| `services/creative-scorer.ts` | 1192 | 5-dimension creative scoring. | Tested |
| `services/creative-strategist.ts` | 457 | Hook + visual + audio DNA analysis. | Tested |
| `services/creative-intelligence.ts` | 1024 | Quality + Reasoning + Evolution + Category Knowledge tiers. | Boot-loaded |
| `services/competitor-creative-intel.ts` | 2614 | Meta Ad Library + cheerio brand scrape + Claude analysis. | **Bypasses LLM gateway** — Risk I |
| `services/comment-mining-agent.ts` | 1818 | Pulls + classifies ad comments. | **Bypasses LLM gateway** — Risk I |
| `services/autopilot-engine.ts` | 385 | Auto-budget, pause/scale decisions. | Every-4h cron |
| `services/report-agent.ts` | 360 | Weekly strategic reports. | 2 tests skipped (same gateway/mock issue) |
| `services/morning-briefing.ts` | 412 | Daily WhatsApp/Slack summary. | Cron scheduled |
| `services/sales-agent.ts` | 441 | Outbound sequencing. | Boot-loaded |
| `services/content-agent.ts` | 309 | Content generation pipeline. | Boot-loaded |
| `services/sprint-planner.ts` | 712 | Plans creative sprints. | Boot-loaded |
| `services/strategic-memory.ts` | 708 | Cross-week strategic continuity. | Used by `unified-agent-runner` |
| `services/strategic-intelligence-engine.ts` | 1024 | Strategic prompt synthesis. | |
| `services/intelligence-infrastructure.ts` | 848 | Top-level intelligence init. | |
| `services/intelligence-persistence.ts` | 529 | SQLite persistence for intelligence outputs. | |
| `services/reality-testing.ts` | 1469 | Validation + fake detection + feedback + behaviour learning. | |
| `services/recommendation-loop.ts` | 709 | Closed-loop OS: predictions + outcomes. | |
| `services/quality-gate.ts` | 1049 | Filters generic/obvious agent outputs. | |
| `services/learning-engine.ts` | 1236 | Pattern aggregation across runs. | |
| `services/operator-experience.ts` | 2788 | Narratives, opportunities, timing, roles. | |
| `services/cohort-ltv-analyzer.ts` | 1029 | **Note:** CLAUDE.md lists this as "not built" but the file is 1029 LOC of real code. Audit. | |
| `services/multi-region-aggregator.ts` | 556 | Aggregates across regions. | |
| `services/multi-account-aggregator.ts` | 570 | Aggregates across accounts. | |
| `services/organic-paid-intelligence.ts` | 847 | Organic vs paid attribution. | |
| `services/build-gate.ts` | 657 | Decision gate before sprint kick-off. | Imports SDK but probably for types only |

### 1.3 Platform integrations

| Module | LOC | What it does |
|---|---:|---|
| `services/meta-api.ts` | — | Meta Graph API client. |
| `services/google-ads-api.ts` | 242 | Google Ads client. |
| `services/shopify-client.ts` | 630 | Shopify Admin API client. |
| `services/api-providers.ts` | 666 | Cross-provider abstraction. |
| `services/insights-parser.ts` | 110 | Parses Meta insight metrics. |
| `services/trend-analyzer.ts` | 247 | Trend detection. |
| `services/fatigue-detector.ts` | 631 | Creative fatigue. |
| `services/format-helpers.ts` | 43 | Number formatting (Rs, %, etc). |
| `services/notifications.ts` | — | WhatsApp + Slack + email dispatch. |
| `services/email.ts` | 124 | Email send (Resend). |
| `services/slack-interactive.ts` | 270 | Slack actions. |

### 1.4 Routes (real)

All route files except the 4 stubs are real. The largest: `creative-engine.ts` (1641 LOC), `ai.ts` (1379 LOC), `reports.ts` (697 LOC), `billing.ts` (694 LOC), `content.ts` (691 LOC), `ad-accounts.ts` (629 LOC).

### 1.5 Cron schedules (running)

Verified from boot log:

| Job | Cadence | Source |
|---|---|---|
| Weekly Reports | Mon 7:00 UTC | `services/report-agent.ts` (registered in route) |
| Automations | Every 4 h | `services/automation-engine.ts` (registered in route) |
| Autopilot | Every 4 h | `services/autopilot-engine.ts` (registered in route) |
| Watchdog | Every 6 h | `services/ad-watchdog.ts` (registered in route `brain`) |
| Morning briefing | 1:35 UTC | `services/morning-briefing.ts` |
| Outcome check | Mon 2:00 UTC | Brain |
| Reports | Tue 2:00 UTC | Brain |
| Content | Wed 2:00 UTC | Brain |
| Sales | Thu 2:00 UTC | Brain |
| Warmup | Every 2 h | `services/meta-warmup.ts` |
| Decay | Sun 3:00 UTC | Brain |
| Audit scheduler | dynamic | `services/audit-scheduler.ts` |

---

## 2. PARTIAL — real code, known bugs

| Item | Symptom | Severity | Effort |
|---|---|---|---|
| `shopify_tokens.shop_name` column missing | `/shopify/status` → 500 `no such column: shop_name` | 🔴 High | ~30 min (`ALTER TABLE` + migration row) |
| `routes/schedules.ts` no auth preHandler | `GET /schedules` → `200 []` without Authorization header | 🔴 High | ~5 min |
| `routes/intelligence.ts` no explicit auth check | Probably benign; unaudited | 🟡 Medium | ~5-min review |
| `services/comment-mining-agent.ts` direct `new Anthropic(…)` | Bills off-ledger; no rate limits | 🟡 Medium | ~½ day to wrap in `createMessage` |
| `services/competitor-creative-intel.ts` direct `new Anthropic(…)` | Bills off-ledger; no rate limits | 🟡 Medium | ~½ day to wrap |
| `media-gen-routes.test.ts` 5 fails | Route handler throws instead of replying 503 | 🟢 Low | ~1 h |
| `content-routes.test.ts` 3 fails | LLM mock not wired | 🟢 Low | ~1 h |
| `ad-watchdog.test.ts` 7 skipped + `reports-routes.test.ts` 2 skipped | SDK mock missing `response.usage` | 🟢 Low | ~30 min (gateway tolerance) OR ~3 h (mock fixup) |

---

## 3. STUBBED — declared stub, returns empty data

> Each of these compiles, registers, and returns either `null`, `[]`, `''`, or `{ success: true, status: 'stubbed', … }`. None throws.

### 3.1 Service stubs (16)

| File | LOC | Returns | Real implementation belongs to |
|---|---:|---|---|
| `services/intelligence-integration.ts` | 113 | empty arrays + passthrough | Strategic prompt synthesis on top of `signal-discovery` |
| `services/signal-discovery/index.ts` | small | `SignalDiscoveryService` no-op class | Cross-platform signal aggregation. 4 strategic-cognition files depend on this and are currently dead-on-arrival. |
| `services/agent-brain.ts` | 54 | object with `createDecision` no-op | Autopilot decision store. Used by `unified-agent-runner`. |
| `services/client-references.ts` | 33 | `getClientPatterns → null`, `getGenerationGuidance → empty` | Per-client reference library. |
| `services/pattern-extractor.ts` | 104 | **types only** (no extraction function) | Pattern extractor. Validator imports only the type. |
| `services/ad-engine/templates.ts` | small | `renderAd → { filePath: '' }` | Sharp + SVG layout compositor. |
| `services/audience-saturation-analyzer.ts` | 31 | `null` | Meta-only frequency analysis. |
| `services/creative-lifespan-predictor.ts` | 38 | `null` | Meta-only creative lifespan. |
| `services/creative-returns-analyzer.ts` | 25 | `null` | Shopify-only return-by-campaign. |
| `services/geo-profitability-analyzer.ts` | 25 | `null` | Shipping cost vs revenue per city. |
| `services/inventory-velocity-predictor.ts` | 27 | `null` | Days-until-OOS prediction. |
| `services/ltv-by-creative-analyzer.ts` | 28 | `null` | LTV cohort by acquisition source. |
| `services/margin-weighted-roas-analyzer.ts` | 28 | `null` | Profit-after-COGs ROAS. |
| `services/new-repeat-analyzer.ts` | 21 | `null` | New-customer vs repeat-customer attribution. |
| `services/placement-efficiency-analyzer.ts` | 23 | `null` | Meta placement breakdown. |
| `services/rto-cod-analyzer.ts` | 21 | `null` | RTO rate by pincode. |
| `services/time-of-day-analyzer.ts` | 24 | `null` | Hourly performance for dayparting. |

### 3.2 Route stubs (4, this session)

| File | Bytes | Route | Real implementation |
|---|---:|---|---|
| `routes/health-score.ts` | 887 | `GET /health-score` (auth-gated) | Composite 0–100 score (OOS + leakage + fatigue + RTO). |
| `routes/creative-scan.ts` | 765 | `GET /creative-scan` (auth-gated) | Wire to existing `creative-strategist` + `creative-scorer`. |
| `routes/quick-wins.ts` | 825 | `GET /quick-wins` (auth-gated) | Dedup'd ranked Watchdog + Autopilot actions. |
| `routes/static-ads.ts` | 761 | `GET /static-ads` (auth-gated) | Gemini-MCP-driven generator. |

---

## 4. PLANNED — described, not coded

| Item | Source of truth |
|---|---|
| Profit dashboard per SKU / campaign (true profit not just ROAS) | `CLAUDE.md` → "Still to Build" |
| Inventory Velocity (real implementation; stub exists) | `CLAUDE.md` |
| Schema consolidation (71 tables → `db/schema.ts`) | `dev_reports/19_05/Database_migration_strat.md` |
| Drizzle ORM migration | Same |
| Soft-delete (`deleted_at`) on every table — currently 0 tables have it | Same |
| Patch `shopify_tokens.shop_name` column drift | This session (see § 2) |
| Add `preHandler: [app.authenticate]` to `routes/schedules.ts` | This session (see § 2) |
| CI grep guards (no `new Anthropic` outside gateway; no `CREATE TABLE` outside schema.ts; file ≤ 500 LOC) | `cleanup_suggestions.md` S5 |
| Operator-script principal handling for gateway | `19_05/rate_limiting/options.md` § 2.2 |
| Gemini gateway (LLM-gateway sibling for image gen) | Same § 2.3 |
| Resolve 4 strategic-cognition files (currently dead-on-arrival) — flesh out signal-discovery or remove the 4 files | This session |
| Remove or revive `cohort-ltv-analyzer.ts` (real code, listed as "not built" in CLAUDE.md — audit gap) | This session |

---

## 5. Quick numeric summary

```
~30  Running modules (real, exercised)
  5  Partial modules (real, with bugs)
 20  Stubbed modules (compile, no real behaviour)
~10  Planned items (described, not coded)
```
