> **Status: ✅ IMPLEMENTED (2026-05-31)** — records executed build-unblock + gateway reconciliation work (55 tsc errors → 0; gateway tests 7/15 → 15/15).
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Section 2 Implementation — Build Unblock + Gateway Reconciliation

## Unique essence preserved

**Context:** 2026-05-20, branch `analysis-and-cleanup`, container `cosmisk-dev` (node:22-bookworm-slim, npm 10.9.8). Scope: TASK 2A+2B+2C from operator brief. Shipped 2026-05-31.

**Net result:** `npm run build` 55 errors → **0**; LLM gateway tests 7/15 → **15/15**; total server tests 786/806 (97.5%) → **879/898 (98.1%)**; server boots and `/health → 200`; 4 stub routes registered + auth-gated (all 401 unauth). No run-time behaviour change to existing features.

**TASK 2C — gateway root cause (kept verbatim):**
```
Error: Impossible to add a job having a weight of 1000 to a limiter
       having a maxConcurrent setting of 5
  at node_modules/bottleneck/lib/LocalDatastore.js:248:15
```
Bottleneck rejects any job whose `weight` exceeds `maxConcurrent`. Gateway set `maxConcurrent: 5` and scheduled with `weight: Math.max(1, inputTokens)`; real token counts routinely exceed 5, so **every gateway call was rejected at the scheduler before the SDK was invoked**. Visible test failures (rate-limit mapping, cost ledger) were downstream symptoms.
- **Fix:** `server/src/services/llm-gateway.ts` — removed `maxConcurrent` from the Bottleneck constructor; rely on `reservoir` (itpm) + `minTime` (rpm) only. Comment added to prevent reintroduction.
- **2C confirmed already-correct (no edits beyond maxConcurrent):** per-provider daily cap (`getDailySpendCents`/`checkDailyLimit` filter `api_provider='anthropic'`; `createMessage` passes `{apiProvider:'anthropic'}` so Gemini excluded); `UpstreamRateLimitedError` reads `retry-after`/`Retry-After` case-insensitive, defaults 60; `countTokens`+`estimateTokens`+`maxRetries` propagation correct.

**TASK 2A — deps + compiler:**
- `server/package.json`: `+cheerio ^1.0.0` (used `services/competitor-creative-intel.ts:26`, bundled types), `+sharp ^0.33.5` (used `services/ad-engine/gemini-generator.ts:6`, bundled types, prebuilt Bookworm binaries).
- `server/tsconfig.json`: `+typeRoots ["./node_modules/@types","./src/types"]`.
- **Real TS7016 root cause:** devcontainer ships `ENV NODE_ENV=production`, so npm skipped `devDependencies` — `@types/better-sqlite3`, `@types/bcryptjs`, `@types/cron`, `@types/node-cron`, `@types/uuid` were never installed in the named volume. Fix = re-run `NODE_ENV=development npm install --include=dev` (populated 5 @types + 59 transitive). `@types/bcryptjs@^2.4.6` caret left unchanged (not version drift).

**TASK 2B — stubs** (all empty/null returns + debug log, no I/O; "module exists so import graph resolves, runtime stubbed+logged"):
- 4 Fastify route stubs `health-score`/`creative-scan`/`quick-wins`/`static-ads` — each `[app.authenticate]`, response `{success:true,status:'stubbed',data:[]}`, `request.log.warn {route,stage:'stub'}`.
- Encryption bridge `server/src/utils/encryption.ts`: `export { encryptToken, decryptToken } from '../services/token-crypto.js'` (canonical AES-256-GCM; consumers `routes/shopify.ts`, `services/shopify-client.ts`).
- `ad-engine/types.ts` (AdFormat, ProductBrief, AdCopy, QualityScore, ValidationOutput, RenderOutput, etc.; index sig `[key:string]:unknown` on ProductBrief/ShopifyProduct) + `ad-engine/templates.ts` (`renderAd()` stub).
- **12 analyser stubs** (`server/src/services/`, all `Promise<T|null>`; `unified-agent-runner.ts` wraps each in `if(result)` → null is safe no-op; ESM-TS: `.ts` source, `.js` import ext): `new-repeat-analyzer`, `geo-profitability-analyzer`, `inventory-velocity-predictor`, `audience-saturation-analyzer`, `placement-efficiency-analyzer`, `creative-lifespan-predictor`, `time-of-day-analyzer`, `creative-returns-analyzer`, `ltv-by-creative-analyzer`, `rto-cod-analyzer`, `margin-weighted-roas-analyzer`, `agent-brain` (`getAgentBrain` returning `{createDecision}`).
- **Transitive (non-listed) stubs:** `services/client-references.ts` (`getClientPatterns`/`getGenerationGuidance`) ← `ad-engine/validator.ts:22`, `learning-engine.ts:22`; `services/pattern-extractor.ts` (`ExtractedPatterns`,`HookType`,`HookPatterns`,…) ← `ad-engine/validator.ts:23`, `learning-engine.ts`; `services/intelligence-integration.ts` (`watchdogSnapshotToSignals`,`buildStrategicPromptSection`,`enhanceWatchdogDecisions`,`reportDataToSignals`,`enhanceReportOutput`,`isStrategicEnough`) ← `ad-watchdog.ts:25-28`, `report-agent.ts:22-24`; `services/signal-discovery/index.ts` (`SignalDiscoveryService`+`createSignalDiscovery`+`SignalSource`/`SignalResult`/`SignalQuery`) ← `strategic-cognition/{causal-intelligence,competing-hypotheses,recursive-investigator,strategic-curiosity}`.

**TASK 2B item 5 — TS fixes (principle: fix types in new stubs, not legacy source):**
- Only source edit (TS2345) `ad-watchdog.ts:891`: `reasonAboutPerformance(snapshot,[],'',clientId)` → `reasonAboutPerformance(clientId,snapshot,[],'',clientId)`; first param is `userId:string`, no separate userId in `runWatchdogClient` scope, `clientId` is the gateway principal in client mode.
- Resolved by stub design (no source edit): `validator.ts:944` TS7006 via `HookType.examples:string[]`; `learning-engine.ts:304,308,311` TS7006 via `HookType`; `competitor-creative-intel.ts:209,218` TS7006 via cheerio bundled types; `validator.ts:667` TS2538 via `QualityScore.dimensions` explicit object literal.

**Inventory:** 24 new files + 4 edited (`package.json`, `tsconfig.json`, `ad-watchdog.ts:891`, `llm-gateway.ts`) + 1 container action (`NODE_ENV=development npm install --include=dev`).

**Boot verification:** `/health 200` → `{status:ok, db:connected, node:v22.22.3, env:production, version:2026-03-29.2}`; 13 cron schedules register; logs `[LLM-Gateway] Initialized with Anthropic Tier reservoirs`; listens `127.0.0.1:3000` + `172.18.0.2:3000`.

**Follow-ups (one PR each):** re-evaluate `NODE_ENV=production` default in `.devcontainer/docker-compose.dev.yml` (flip to development or `post-create.sh --include=dev`); stub→real promotion priority for M2: OOS (`inventory-velocity`, `geo-profitability`, `rto-cod`) → Cohort/LTV (`ltv-by-creative`, `new-repeat`, `creative-returns`) → Meta (`audience-saturation`, `creative-lifespan`, `placement-efficiency`, `time-of-day`) → Cross-platform (`margin-weighted-roas`) → Brain (`agent-brain` persistence) → Strategic (`signal-discovery` + `intelligence-integration`).

## Cited & kept (referenced elsewhere)

- **STATUS_INDEX (IMPLEMENTED):** the what-shipped summary — build-unblock + gateway reconciliation took 55 tsc errors → 0 (see §0/2C above).
- **Pre-existing failures (cross-ref to `19_05/smoke_test_results.md` §4.x):** the 17 remaining test fails are NOT introduced by Section 2 — `ad-watchdog.test.ts`×7 (expects `result.decisions===1`, gets `0`; parser drops mocked Claude decision, likely an intelligence-integration passthrough effect), `content-routes.test.ts`×3 + `reports-routes.test.ts`×2 (LLM-gateway-mock assertions pre-dating gateway consolidation), `media-gen-routes.test.ts`×5 (503-vs-500 guard regression in `routes/media-gen.ts`).

## Pointer

- IMPLEMENTED → see successor: build-unblock + gateway reconciliation, 55 tsc→0 (STATUS_INDEX). Pre-existing test failures detailed in `19_05/smoke_test_results.md` §4.1-§4.4 (also cited by ON_HOLD.md items 2/3/9/11). Full original in git history.
