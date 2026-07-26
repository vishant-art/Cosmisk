> **Status: ♻️ SUPERSEDED (2026-05-31)** — May-19 risk refresh (A–N). Superseded by `23_05/risk_register.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Additional Risks — Refresh (2026-05-19/20)

**Supersedes:** `dev_reports/new_and_added_risks.md` (2026-04-26) + `analysis/new_added_risks_and_design.md` (2026-05-09). Risks A–G shape unchanged (numbers updated); H–M lifted from the 2026-05-09 design memo; **N new** (this session's verification pass). Successor `23_05/risk_register.md` supersedes A–N.

## Unique essence preserved

- **A. JWT in localStorage** — `cosmisk_token` still in `localStorage`; 7-day JWT, no jti, no refresh-token rotation, no revocation list. Fix: httpOnly+SameSite=Lax+Secure cookie, CSRF on state-changing routes, 15–60 min access token, refresh rotation, per-user `tokenVersion`.
- **B. In-process cron — WORSE** (was 8 schedules, now **13**): `services/audit-scheduler.ts` (×2), `routes/autopilot.ts` (×1), `routes/agent.ts` (×7), `routes/reports.ts` (×1), `routes/automations.ts` (×1). Fix: BullMQ/Redis or pg-boss/Postgres; workers in a separate process from the API.
- **C. No retry/backoff/circuit-breaker — WORSE.** Outbound deps grew: Anthropic, Gemini, Meta Graph, Google Ads, TikTok Ads, Stripe, Razorpay, ElevenLabs, Heygen, Kling, Creatify, Flux, NanoBanana, n8n, Slack, Resend + **Shopify Admin API + 3 Python scrapers** (ScrapeGraphAI, free crawler, ad-intel). Fix: exp backoff+jitter (3 attempts, 5xx/network only), per-provider circuit breaker, idempotency keys.
- **D. God-files** — LOC: `landing.component.ts` 1,920; `creative-engine.ts` 1,641; `dashboard.component.ts` 1,244; `pitch-deck.component.ts` 1,214; `creative-cockpit.component.ts` 1,133; `settings.component.ts` 1,119; `index.ts` 1,326 (was 1,287); `ai.ts` 1,379. New: `operator-experience.ts` **2,788**; `competitor-creative-intel.ts` **2,614**; `comment-mining-agent.ts` **1,818**; `reality-testing.ts` 1,469; `oos-detector.ts` 1,284; `learning-engine.ts` 1,236; `ad-watchdog.ts` 1,199; `creative-scorer.ts` 1,192; `strategic-cognition/narrative-synthesis.ts` 1,177. Out of scope; Risk H promotes `competitor-creative-intel.ts` as first decomposition target after cleanup prefix.
- **F. Column-only migrations** — **19 `ensureColumn` calls** (was 13). Fix: Drizzle Kit once Drizzle lands; SQLite era = additive-only freeze.
- **G. Single-replica + SQLite-on-disk** — `railway.toml`: `restartPolicyMaxRetries = 3`, healthcheck only; `databasePath: './data/cosmisk.db'`.
- **H. God-file inflation (NEW)** — `operator-experience.ts` 2,788 / `competitor-creative-intel.ts` 2,614 / `comment-mining-agent.ts` 1,818, all **no tests**, all multi-responsibility (fetch+transform+prompt-build+Anthropic). `competitor-creative-intel.ts` = 2nd-largest TS file after `index.ts` (~1,326). Extend Risk D tasks #22–#24 with its decomposition; defer rest.
- **I. Direct-Anthropic bypass (NEW)** — `grep -l "new Anthropic\b"` → `llm-gateway.ts` (canonical) + `competitor-creative-intel.ts` + `comment-mining-agent.ts`. Fix: (1) wrap both with `createMessage(...)` plumbing `userId`+`operation`, ~1.5 d; (2) CI grep guard banning direct `new Anthropic`; (3) same guard for `import.*@anthropic-ai/sdk`.
- **J. Cron cadence raised w/o isolation (NEW)** — commit `7c46f6e` quadrupled-to-sixfold tick rate (autopilot every 4 h, watchdog every 6 h), all same Node process. At 4 h cadence a long-running tick blocks the API request loop; 24/7-monitoring claim sized for once-a-day work. Promote Risk B to P1; extract cron worker before any further cadence increase.
- **K. Schema drift (NEW)** — `shopify_tokens` defined in `db/schema.ts:408-414` AND `scripts/add-shopify-tables.ts`; SQLite `IF NOT EXISTS` masks duplication. Fix: delete `CREATE TABLE shopify_tokens` from `add-shopify-tables.ts` (keep seed-row), CI grep guard, ~0.5 d. See `19_05/cleanup_suggestions.md` S2.2.
- **L. Operator scripts bypass access controls (NEW)** — `scripts/run-client-*.mjs`, `setup-pratapsons-client.mjs`, `test-*.mjs` (~18 scripts) run outside the Fastify request lifecycle (no JWT, `usage-limiter`, rate-limit). After gateway lands they also bypass per-user daily $ cap unless invoked with operator `userId`. Fix: Path A (gateway accepts `operator:<name>` synthetic principal) or Path B (`OPERATOR_BYPASS_GATEWAY` flag + separate budget). Owner gate.
- **N. Build broken — 25 missing modules (NEW, CRITICAL, 2026-05-19)** — **15 files import 25 unique missing module paths.** `tsc` fails → no test runs, no migration tool can introspect. `dist/` + `server/dist/` pre-built 2026-05-03 from an older state hide the bug from anyone running only the deployed bundle. Each missing import = (a) deleted by mistake, (b) never written, or (c) in an unmerged sibling branch. Map:
  - `index.ts` → `routes/health-score.js`, `creative-scan.js`, `quick-wins.js`, `static-ads.js`
  - `routes/shopify.ts` + `services/shopify-client.ts` → `utils/encryption.js`
  - `ad-engine/{creative-intelligence,gemini-generator,strategy}.ts` → `./types.js`
  - `ad-engine/validator.ts` → `client-references.js`, `pattern-extractor.js`, `templates.js`, `types.js`
  - `ad-watchdog.ts` + `report-agent.ts` → `intelligence-integration.js`
  - `learning-engine.ts` → `client-references.js`
  - `strategic-cognition/{causal-intelligence,competing-hypotheses,recursive-investigator,strategic-curiosity}.ts` → `signal-discovery/index.js`
  - `unified-agent-runner.ts` → `agent-brain.js` + 11 analyzers (audience-saturation, creative-lifespan-predictor, creative-returns, geo-profitability, inventory-velocity-predictor, ltv-by-creative, margin-weighted-roas, new-repeat, placement-efficiency, rto-cod, time-of-day).
  Fix per `19_05/cleanup_suggestions.md` S1 (path A/B/C per file group, owner). **Until N closes, S2/S3/all P-phases blocked.**
- **Cheat-sheet (severity / likelihood / scope / effort):** A High/High/yes/2–3 d · B High/High/P1/3–5 d+infra · C Med/High/partial/2–3 d · D Low/High/no/deferred · E High/Med/yes S3/1.5 d · F Med/High/yes w/Drizzle/bundled · G High/Med/yes w/PG/bundled · H Low/High/no/deferred · I High/Med/yes S3/1.5 d · J High/High/yes P1/3–5 d+infra · K Low/High/yes S2.2/0.5 d · L Med/Med/yes owner-gated/0.5 d · M Low/Low/no/0.5–1.5 d · **N CRITICAL/certain/yes S1/0.5–1 d.**

## Cited & kept (referenced elsewhere)

- **Risk E — Cost ceilings only on creative jobs (MOSTLY RESOLVED)** — `services/llm-gateway.ts` is the single source of `new Anthropic({...})` for almost all routes/services; two still bypass: `competitor-creative-intel.ts` + `comment-mining-agent.ts` (see Risk I). Cost-ceiling hole persists until both wrapped. *(Cited by 23_05/risk_register.md; structured-logging plan 19_05/structured_logging.md remediates the silent-failure dimension of E.)*
- **Risk M — Python scrapers without an outbound dependency policy (NEW, low)** — `scripts/ad-intel.py`, `crawl-free.py`, `scrape.py`: no `requirements.txt`, no pinned versions, no CI gate. Fix: move scraping into audited TypeScript surface OR pin Python deps + wire into CI + document operator. Owner gate; out of scope unless explicitly added. *(Cited by 23_05/risk_register.md, 23_05/new_findings.md:133.)*

## Pointer

- SUPERSEDED → see: `23_05/risk_register.md` (full A–N restatement; keeps Risk M + Risk E).
