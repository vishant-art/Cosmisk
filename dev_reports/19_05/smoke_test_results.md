> **Status: 📖 REFERENCE (2026-05-31)** — May-20 devcontainer smoke-test record.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Smoke Test Results — Devcontainer (2026-05-20)

## Unique essence preserved

**Environment:** `cosmisk-dev` Docker container (node:22-bookworm-slim, npm 10.9.8), node `v22.22.3`; built from `.devcontainer/Dockerfile` + `docker-compose.dev.yml`; started 2026-05-20. Container built in ~120s, bind-mount + `root_node_modules`/`server_node_modules` named volumes OK.

**§2 install:** `npm install` in `server/` → 256 packages, exit 0, only npm 10→11 upgrade notice.

**§3 build (`npm run build` = tsc):** NON-ZERO, **55 TS errors**, no usable `server/dist/`.

| Code | Count | What |
|---|---:|---|
| TS2307 | 34 | Cannot find module |
| TS7006 | 10 | implicit 'any' param |
| TS7016 | 9 | missing @types decl |
| TS2538 | 1 | symbol as index type |
| TS2345 | 1 | arg type not assignable |

- **§3.2 Confirmed from static analysis (15 files, ~22 paths):** the build CONFIRMED the static-analysis missing-module inventory of 15 files / ~22 relative-path imports (in addition to the 2 NEW npm packages below). Confirmed missing-module file:line refs:
  - `./intelligence-integration.js` — ad-watchdog.ts:28, report-agent.ts:25
  - `../utils/encryption.js` — routes/shopify.ts:22, services/shopify-client.ts:601
  - `./client-references.js` — learning-engine.ts:22
  - 12 analyser modules — unified-agent-runner.ts:29-64
  - index.ts:40-43 route stubs (health-score / creative-scan / quick-wins / static-ads)
  - signal-discovery ×4 (strategic-cognition)
- **NEW missing npm packages (grep missed, no relative path):** `sharp` (ad-engine/gemini-generator.ts:6, image proc), `cheerio` (competitor-creative-intel.ts:26, HTML parse) — add to `server/package.json`.
- **TS7016 @types:** `better-sqlite3` ×6 (audit/index.ts, db/index.ts, db/schema.ts, audit-scheduler.ts, client-context.ts, strategic-memory.ts); `bcryptjs` ×3 (db/index.ts, index.ts:1099, routes/auth.ts). In devDeps but `bcryptjs ^2.4.3` older than `@types/bcryptjs ^2.4.6` (drift), or tsconfig `types` not picking up. Fixable S0/S1.
- **TS7006 (per-site multiplicity):** validator.ts:944 (×1); competitor-creative-intel.ts:209,218 (×4); learning-engine.ts:304,308,311 (×4); unified-agent-runner.ts:340 (×1). Total = 10.
- **TS2538/TS2345:** ad-engine/validator.ts:667 (symbol as index, enum mismatch); ad-watchdog.ts:891:52 (`AccountSnapshot` where `string` expected, signature drift).

**§4 tests (`npx vitest run`):** NON-ZERO, **18 of 806 failed (97.5% pass)**. 35 files (28 pass / 7 fail), 2 skipped, 25.8s.

**78-implicit-any claim:** only 10 surfaced as build errors (rest at sites the build skips because parent module fails first); re-count after S1.

**§7 plan impact:** order S0→S1→S2→S3→P0 unchanged. S1 also installs sharp+cheerio + resolves @types. S3 reconciles the 8 gateway tests. New **S1.9 — investigate bcryptjs/better-sqlite3 @types resolution failure.**

**§6 container state:** `cosmisk-dev` still running (`shutdownAction: stopCompose`); `server/node_modules`=256 pkgs; root `node_modules` partial (install interrupted); `ng build` not attempted; `server/dist` not produced.

## Cited & kept (referenced elsewhere)

Cited by ON_HOLD.md items 2/3/9/11 — keep exact test names + root causes.

### §4.1 Failed test files
```
src/__tests__/ad-watchdog.test.ts        (full-file fail — likely import-resolution)
src/__tests__/agent-routes.test.ts       (full-file fail)
src/__tests__/billing-routes.test.ts     (full-file fail)
src/__tests__/content-routes.test.ts     (3 cases)
src/__tests__/llm-gateway.test.ts        (8 cases — see §4.2)
src/__tests__/media-gen-routes.test.ts   (5 cases — 503 vs 500 mismatches)
src/__tests__/reports-routes.test.ts     (2 cases)
```

### §4.2 LLM-gateway failures (8) — hit recently-shipped gateway (`1521cce`)
NOTE: 23_05/state_of_codebase says this was a FALSE-POSITIVE — gateway later 15/15 pass.
```
createMessage — per-user daily cap > does NOT count Gemini spend toward the Anthropic cap (per-provider)
createMessage — cost ledger        > writes exactly one cost_ledger row per successful call
createMessage — maxRetries propagation > passes a per-call maxRetries override to messages.create
createMessage — maxRetries propagation > omits maxRetries when caller does not override
createMessage — token estimation   > calls countTokens by default and uses input_tokens for weighting
createMessage — token estimation   > skips countTokens when caller supplies estimateTokens
createMessage — upstream rate-limit mapping > wraps SDK RateLimitError as UpstreamRateLimitedError
createMessage — upstream rate-limit mapping > defaults retry-after to 60 when header missing
```
Root cause: test file pre-dates gateway final shape; gateway partially under-spec'd/under-tested — reconcile in S3.

### §4.3 Media-gen 503-vs-500 (5 cases)
Five tests expect `503` (env var missing) but get `500` (unhandled). Likely guard-clause regression in `routes/media-gen.ts` — missing-env-var path throws instead of replying 503.

### §4.4 Reports + content + agent + billing + ad-watchdog (≤6 cases)
Each file 1–3 failures; per-file look warranted; not blocking.

## Pointer
- DURABLE_REFERENCE → superseded by `dev_reports/23_05/smoke_test_results.md`; §4.x retained here per ON_HOLD.md citations.
