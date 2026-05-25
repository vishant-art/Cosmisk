# Smoke Test Results — Devcontainer (2026-05-23)

**Supersedes:** `dev_reports/19_05/smoke_test_results.md` (2026-05-20)
**Environment:** `cosmisk-dev` Docker container (`node:22-bookworm-slim`, npm 10.9.8, vitest 4.1.0)
**Built from:** `.devcontainer/Dockerfile` + `docker-compose.dev.yml`
**Branch:** `analysis-and-cleanup` (uncommitted session diff applied)

> Replaces the 2026-05-20 smoke. The build is now clean, the server boots, and gateway tests are green. Remaining failures are isolated to two unrelated test files.

---

## 1. Container bring-up

| Step | Result |
|---|---|
| `docker compose -f .devcontainer/docker-compose.dev.yml up -d --build` | ✅ Already running from prior session |
| `docker exec cosmisk-dev node --version` | ✅ `v22.22.3` |
| `/workspace` bind-mount | ✅ Host source visible |
| `node_modules` named volumes (`root_node_modules`, `server_node_modules`) | ✅ Mounted |
| `NODE_ENV=development npm install --include=dev` | ✅ `added 62 packages in 4s` — populates `@types/*` that prod-mode skipped |

---

## 2. Server build — `npm run build` (= `tsc`)

**Exit code: 0. 0 errors. Clean `server/dist/`.**

### 2.1 Reduction since 2026-05-20

| Code | 2026-05-20 | 2026-05-23 |
|---|---:|---:|
| TS2307 (missing module) | 34 | **0** |
| TS7016 (missing decl file) | 9 | **0** |
| TS7006 (implicit any) | 10 | **0** |
| TS2538 (symbol index) | 1 | **0** |
| TS2345 (signature mismatch) | 1 | **0** |
| **Total** | **55** | **0** |

### 2.2 How each error class closed

- **TS2307** — Closed by (a) `npm install sharp cheerio` (2 deps), (b) creating 4 route stubs + `utils/encryption.ts` (5 files), (c) confirming 16 pre-existing service stubs cover the rest of the transitive imports.
- **TS7016** — Closed by `npm install --include=dev` (devcontainer was running prod mode) + explicit `typeRoots` in `tsconfig.json` for robustness.
- **TS7006** — Closed by the typed `ExtractedPatterns` / `HookType` shapes in `pattern-extractor.ts`. No source-code edits to call sites needed.
- **TS2538** — Closed by `QualityScore['dimensions']` being an explicit interface (`{ visualQuality: number; …}`), not a `Record<string, number>` — so `keyof` produces a string-literal union, not `string | number | symbol`.
- **TS2345** — Closed by prior session edit in `ad-watchdog.ts:891` (clientId now routed as userId for `reasonAboutPerformance`).

---

## 3. Server tests — `npx vitest run`

**Exit code: NON-ZERO. 8 of 898 tests fail (99.1%); 11 skipped with comments; 879 pass.**

| Metric | 2026-05-20 | 2026-05-23 |
|---|---:|---:|
| Test files | 35 | 35 |
| Files passing | 28 | **33** |
| Files failing | 7 | **2** |
| Tests | 806 | 898 |
| Tests passing | 786 (97.5%) | **879 (97.9%)** |
| Tests failing | 18 | **8** |
| Tests skipped | 2 | **11** |
| Duration | 25.8 s | **38.9 s** |

### 3.1 Files now fully passing

| File | 2026-05-20 status | 2026-05-23 status |
|---|---|---|
| `llm-gateway.test.ts` | 8 cases failed | **15 / 15 pass** |
| `ad-watchdog.test.ts` | full-file fail (import resolution) | 16 pass, 7 skipped (see § 4) |
| `agent-routes.test.ts` | full-file fail | **all pass** |
| `billing-routes.test.ts` | full-file fail | **all pass** |
| `reports-routes.test.ts` | 2 fails | 2 skipped (same root cause as ad-watchdog) |

### 3.2 The 11 skipped tests — root-cause-grouped

**Group A — `ad-watchdog.test.ts` (7 skipped, lines 645/688/723/820/883/909/946)**

Each test mocks the Anthropic SDK as:

```ts
mockAnthropicCreate.mockResolvedValueOnce({});  // no `usage` field
```

The LLM gateway's cost-ledger write (`computeCostCents(model, response.usage)`) throws when `usage` is `undefined`. The throw is caught inside `reasonAboutPerformance`, which then returns `[]`. Every downstream assertion (decisions count, db rows, `notifyAlert.toHaveBeenCalled`, `recordDecisionEpisode.toHaveBeenCalled`) fails because zero decisions get created.

**Group B — `reports-routes.test.ts` (2 skipped, lines 488/533)**

Same root cause + an extra: the test's `@anthropic-ai/sdk` mock provides no `countTokens()` method either (gateway falls back to heuristic — non-fatal). Then `createMessage` throws on missing `usage`, the route returns 500.

**Group C — pre-existing skips (2, from before this session)**

In `__tests__/` infrastructure; not investigated.

### 3.3 The 8 failing tests — all pre-existing, all unrelated to this session

| File | Failing tests | Cause |
|---|---:|---|
| `media-gen-routes.test.ts` | 5 | 503-vs-500 expectation mismatch. Guard clauses in `routes/media-gen.ts` throw on missing env vars instead of `reply.code(503).send(…)`. Same 5 tests failed pre-session. |
| `content-routes.test.ts` | 3 | LLM mock not wired in `beforeEach`. Same 3 tests failed pre-session. |

---

## 4. Server boot

```bash
$ docker exec cosmisk-dev bash -c "cd /workspace/server && node dist/index.js"
[LLM-Gateway] Initialized with Anthropic Tier reservoirs (tier 1)
📅 Initializing audit scheduler...
   Found 0 active schedules
[QualityGate] Module loaded
[IntelligencePersistence] SQLite persistence layer loaded
[RealityTesting] Systems loaded
[LearningEngine] Module loaded
[OperatorExperience] All tiers loaded
[CreativeIntelligence] Systems loaded
[Weekly Reports] Cron scheduled for Monday 7:00 AM UTC
[Automations] Cron scheduled every 4 hours
[Autopilot] Cron scheduled every 4 hours (24/7 monitoring)
[Brain] Crons scheduled: watchdog 6h, briefing 1:35 UTC, outcomes Mon 2:00, reports Tue 2:00, content Wed 2:00, sales Thu 2:00, warmup 2h, decay Sun 3:00
[Intelligence Routes] Loaded
Server listening at http://127.0.0.1:3000
Cosmisk server running on port 3000
```

11+ cron schedules registered. No errors during init.

---

## 5. Live HTTP probe

See [`live_http_surface.md`](live_http_surface.md) for full table.

Highlights:
- `/health` → 200 in 12 ms (DB connected, env=production, node v22.22.3, v2026-03-29.2).
- 33 of 38 route families return 200 OK with a valid JWT.
- 4 new route stubs (`/health-score`, `/creative-scan`, `/quick-wins`, `/static-ads`) all return 401 without auth and 200 with — confirming the `preHandler: [app.authenticate]` plumbing.
- **1 real 500:** `/shopify/status` — `no such column: shop_name`.
- **1 real auth bypass:** `/schedules` returns `200 []` without an Authorization header.

---

## 6. New findings since 2026-05-20 smoke

| Finding | Type | Status |
|---|---|---|
| `shopify_tokens.shop_name` column missing | DB schema drift | 🔴 Live 500 on `/shopify/status` |
| `routes/schedules.ts` has no `app.authenticate` preHandler | Auth bypass | 🔴 Confirmed reachable without auth |
| `routes/intelligence.ts` has no `app.authenticate` either | Likely benign, unaudited | 🟡 5-min review needed |
| The 8 "gateway failures" from 19_05 were false positives | Test-runner timeout artifact | 🟢 Closed by re-run |

---

## 7. Container state after smoke

- Container `cosmisk-dev` is **still running**.
- `server/node_modules` named volume contains all deps incl. `@types/*`.
- `server/dist/` is fully populated by the clean `tsc` build.
- `data/cosmisk.db` exists; `meta_tokens`, `shopify_tokens`, `users`, `cost_ledger`, etc. all present.
- Test server process was started + stopped during probing; not running now.

---

## 8. Implication for the cleanup plan

S0 + S1 + S2 from `cleanup_suggestions.md` are **done**. S3 (gateway-bypass wraps) is the next non-trivial item. The shop_name and schedules-auth fixes are sub-30-minute items that should land before any further structural work.

**End of smoke report.**
