> **Status: ♻️ SUPERSEDED (2026-05-31)** — May-19 risk refresh (A–N). Superseded by `23_05/risk_register.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# Additional Risks — Refresh (2026-05-19/20)

**Supersedes:** `dev_reports/new_and_added_risks.md` (2026-04-26) + `analysis/new_added_risks_and_design.md` (2026-05-09).

> Risks A–G unchanged in shape; numbers updated. Risks H–M lifted from the 2026-05-09 design memo. **One new emergency risk (N) added** from this session's verification pass.

---

## A. JWT stored in `localStorage` (XSS-extractable)

**Status:** unchanged. `cosmisk_token` is still in `localStorage`; 7-day JWT, no jti, no refresh-token rotation, no revocation list.

**Migration:** httpOnly + SameSite=Lax + Secure cookie. Add CSRF token on state-changing routes. Shorten access token to 15–60 min, add refresh-token rotation, per-user `tokenVersion`.

---

## B. In-process cron jobs (single-instance fragility)

**Status:** **WORSE** since 2026-04-26. Cadence quadrupled-to-sixfold (see Risk J). 13 cron schedules in-process (was 8).

**Where:** `services/audit-scheduler.ts` (×2), `routes/autopilot.ts` (×1), `routes/agent.ts` (×7), `routes/reports.ts` (×1), `routes/automations.ts` (×1).

**Migration unchanged:** BullMQ on Redis or pg-boss on Postgres. Workers run in a separate process from the API.

---

## C. No retry/backoff or circuit breaker on external APIs

**Status:** **WORSE.** Outbound dependency tree has grown: Anthropic, Gemini, Meta Graph, Google Ads, TikTok Ads, Stripe, Razorpay, ElevenLabs, Heygen, Kling, Creatify, Flux, NanoBanana, n8n, Slack, Resend — **plus Shopify Admin API + 3 Python scrapers (ScrapeGraphAI, free crawler, ad-intel) since the original audit.**

**Migration unchanged:** exponential backoff + jitter retry (3 attempts, 5xx and network only), per-provider circuit breaker, idempotency keys for non-idempotent calls.

---

## D. God-files / decomposition debt

**Status:** Materially worse via Risk H.

Original LOC table:

| File | LOC |
|---|---:|
| `src/app/features/landing/landing.component.ts` | 1,920 |
| `server/src/routes/creative-engine.ts` | 1,641 |
| `src/app/features/dashboard/dashboard.component.ts` | 1,244 |
| `src/app/features/pitch-deck/pitch-deck.component.ts` | 1,214 |
| `src/app/features/creative-cockpit/creative-cockpit.component.ts` | 1,133 |
| `src/app/features/settings/settings.component.ts` | 1,119 |
| `server/src/index.ts` | 1,326 (was 1,287) |
| `server/src/routes/ai.ts` | 1,379 |

Plus the new ones (Risk H):

| File | LOC |
|---|---:|
| `server/src/services/operator-experience.ts` | **2,788** |
| `server/src/services/competitor-creative-intel.ts` | **2,614** |
| `server/src/services/comment-mining-agent.ts` | **1,818** |
| `server/src/services/reality-testing.ts` | 1,469 |
| `server/src/services/oos-detector.ts` | 1,284 |
| `server/src/services/learning-engine.ts` | 1,236 |
| `server/src/services/ad-watchdog.ts` | 1,199 |
| `server/src/services/creative-scorer.ts` | 1,192 |
| `server/src/services/strategic-cognition/narrative-synthesis.ts` | 1,177 |

**Status:** OUT of scope (Risk D framing) but Risk H promotes `competitor-creative-intel.ts` to the first decomposition target after the cleanup prefix.

---

## E. Cost ceilings only on creative jobs

**Status:** **MOSTLY RESOLVED.** The LLM gateway (`services/llm-gateway.ts`) is the single source of `new Anthropic({...})` for almost all routes/services. Two services still bypass:

- `server/src/services/competitor-creative-intel.ts`
- `server/src/services/comment-mining-agent.ts`

See Risk I. The hole in cost-ceiling enforcement persists until those two are wrapped.

---

## F. Custom column-only migrations

**Status:** unchanged shape, larger surface — **19 `ensureColumn` calls** today (was 13).

**Migration:** Drizzle Kit migrations once Drizzle is in. For the SQLite era, freeze schema changes to additive-only.

---

## G. Single-replica deployment + SQLite-on-disk

**Status:** unchanged. `railway.toml`: `restartPolicyMaxRetries = 3`, healthcheck only. `databasePath: './data/cosmisk.db'`.

---

## H. God-file inflation (NEW — surfaced 2026-05-09)

Three files dwarf anything previously catalogued:

| File | LOC | Has tests? |
|---|---:|---|
| `server/src/services/operator-experience.ts` | 2,788 | no |
| `server/src/services/competitor-creative-intel.ts` | 2,614 | no |
| `server/src/services/comment-mining-agent.ts` | 1,818 | no |

`competitor-creative-intel.ts` is now the second-largest TS file in the repo after `index.ts` (~1,326). Each is multi-responsibility (fetch + transform + prompt-build + Anthropic call).

**Treatment.** Extend Risk D's task list (#22–#24) with a decomposition pass for `competitor-creative-intel.ts`. Defer the rest.

---

## I. Direct-Anthropic call sites bypass the cost gateway (NEW)

**Status:** 2 services bypass after gateway shipped.

```
$ grep -l "new Anthropic\b" server/src --include="*.ts" | grep -v __tests__
server/src/services/llm-gateway.ts            ← canonical
server/src/services/competitor-creative-intel.ts
server/src/services/comment-mining-agent.ts
```

**Treatment.**
1. Wrap both with `createMessage(...)` from `services/llm-gateway.ts`. Plumb `userId` + `operation`. ~1.5 days.
2. Add CI grep guard banning direct `new Anthropic` outside the gateway.
3. Add the same guard for `import.*@anthropic-ai/sdk`.

---

## J. Cron cadence raised without isolating cron from API (NEW)

**Where:** commit `7c46f6e` quadrupled-to-sixfold the Autopilot/Watchdog tick rate (autopilot every 4 h, watchdog every 6 h). All inside the same Node process.

**Why it matters.** Risk B's once-daily cadence was already a stability concern. At 4-hour cadence the next outage during a long-running tick blocks the API request loop visibly. The 24/7-monitoring marketing claim now depends on infrastructure sized for once-a-day work.

**Treatment.** Promote Risk B from "partial / M4" to a P1 item. Extract cron worker before any further cadence increase.

---

## K. Schema drift between `schema.ts` and `add-shopify-tables.ts` (NEW)

**Where:** `shopify_tokens` is defined in `server/src/db/schema.ts:408-414` *and* `server/scripts/add-shopify-tables.ts`. SQLite's `IF NOT EXISTS` masks the duplication today.

**Treatment.** Delete the `CREATE TABLE shopify_tokens` block from `add-shopify-tables.ts` (keep seed-row logic). Add a CI grep guard. ~0.5 day. See `19_05/cleanup_suggestions.md` S2.2.

---

## L. Per-client run scripts bypass production access controls (NEW)

**Where:** `server/scripts/run-client-*.mjs`, `setup-pratapsons-client.mjs`, `test-*.mjs` (~18 scripts). All execute outside the Fastify request lifecycle (no JWT, no `usage-limiter`, no rate-limit).

**Why it matters.** Once the gateway lands, these scripts also bypass the per-user daily $ cap unless invoked with an operator `userId`.

**Treatment.** Path A (gateway accepts `operator:<name>` synthetic principal) or Path B (`OPERATOR_BYPASS_GATEWAY` flag, separate budget). Owner gate.

---

## M. Python scrapers without an outbound dependency policy (NEW, low)

**Where:** `scripts/ad-intel.py`, `crawl-free.py`, `scrape.py`. No `requirements.txt`, no pinned versions, no CI gate.

**Treatment.** Either move scraping into the audited TypeScript surface OR pin Python deps + wire into CI + document operator. Owner gate. Out of scope unless explicitly added.

---

## N. Build broken — 25 missing modules (NEW, CRITICAL — surfaced 2026-05-19)

**Where:** Fifteen TypeScript files import 25 modules that do not exist anywhere in the working tree. Python-based import-scan against `server/src/`:

| File | Missing imports |
|---|---|
| `server/src/index.ts` | `./routes/health-score.js`, `./routes/creative-scan.js`, `./routes/quick-wins.js`, `./routes/static-ads.js` |
| `server/src/routes/shopify.ts` | `../utils/encryption.js` |
| `server/src/services/shopify-client.ts` | `../utils/encryption.js` |
| `server/src/services/ad-engine/creative-intelligence.ts` | `./types.js` |
| `server/src/services/ad-engine/gemini-generator.ts` | `./types.js` |
| `server/src/services/ad-engine/strategy.ts` | `./types.js` |
| `server/src/services/ad-engine/validator.ts` | `../client-references.js`, `../pattern-extractor.js`, `./templates.js`, `./types.js` |
| `server/src/services/ad-watchdog.ts` | `./intelligence-integration.js` |
| `server/src/services/learning-engine.ts` | `./client-references.js` |
| `server/src/services/report-agent.ts` | `./intelligence-integration.js` |
| `server/src/services/strategic-cognition/causal-intelligence.ts` | `../signal-discovery/index.js` |
| `server/src/services/strategic-cognition/competing-hypotheses.ts` | `../signal-discovery/index.js` |
| `server/src/services/strategic-cognition/recursive-investigator.ts` | `../signal-discovery/index.js` |
| `server/src/services/strategic-cognition/strategic-curiosity.ts` | `../signal-discovery/index.js` |
| `server/src/services/unified-agent-runner.ts` | `./agent-brain.js`, `./audience-saturation-analyzer.js`, `./creative-lifespan-predictor.js`, `./creative-returns-analyzer.js`, `./geo-profitability-analyzer.js`, `./inventory-velocity-predictor.js`, `./ltv-by-creative-analyzer.js`, `./margin-weighted-roas-analyzer.js`, `./new-repeat-analyzer.js`, `./placement-efficiency-analyzer.js`, `./rto-cod-analyzer.js`, `./time-of-day-analyzer.js` |

**Total: 15 files, ~25 unique missing module paths.**

**Why it matters.**
- `tsc` fails. No test can run. No migration tool (e.g., Drizzle) can introspect.
- `dist/` and `server/dist/` were pre-built on 2026-05-03 from an older state. They hide the bug from anyone who only runs the deployed bundle.
- Each missing import is either: (a) the file was deleted by mistake, (b) it was never written, (c) it lives in a sibling branch never merged.

**Treatment.** Per `19_05/cleanup_suggestions.md` S1, decide path A/B/C per file group with owner. **Until N closes, S2/S3/all P-phases are blocked.**

---

## Risk register cheat-sheet

| Risk | Severity | Likelihood | In scope? | Effort |
|---|---|---|---|---|
| A. JWT in localStorage | High | High | yes | 2–3 d (was design-only) |
| B. In-process cron | High | High | partial → **P1** | 3–5 d + infra |
| C. No retry/CB | Medium | High | partial | 2–3 d |
| D. God-files | Low | High | no | (deferred) |
| E. LLM cost ceiling | High | Medium | yes (S3 finishes) | 1.5 d remaining |
| F. Column-only migrations | Medium | High | yes (with Drizzle) | bundled |
| G. Single-replica | High | Medium | yes (with PG) | bundled |
| H. God-file inflation | Low | High | no | (deferred) |
| I. Anthropic call sites bypass | High | Medium | yes — S3 | 1.5 d |
| J. Cron cadence | High | High | yes — P1 (promoted) | 3–5 d + infra |
| K. shopify_tokens dual | Low | High | yes — S2.2 | 0.5 d |
| L. Operator scripts bypass | Medium | Medium | yes (owner-gated) | 0.5 d |
| M. Python scrapers | Low | Low | no | 0.5–1.5 d |
| **N. Build broken** | **CRITICAL** | **certain (it's the state today)** | yes — **S1** | 0.5–1 d |

---

**End of refresh.**
