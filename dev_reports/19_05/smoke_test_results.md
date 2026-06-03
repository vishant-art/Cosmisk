> **Status: 📖 REFERENCE (2026-05-31)** — May-20 devcontainer smoke-test record.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# Smoke Test Results — Devcontainer (2026-05-20)

**Environment:** `cosmisk-dev` Docker container (node:22-bookworm-slim, npm 10.9.8)
**Built from:** `.devcontainer/Dockerfile` + `docker-compose.dev.yml`
**Container started:** 2026-05-20 (this session)

> Confirms the build-broken finding from the static analysis with hard numbers from `tsc` and `vitest`. Adds two NEW findings (missing npm packages, missing @types) that the static analysis didn't catch.

---

## 1. Container bring-up

| Step | Result |
|---|---|
| `docker compose -f .devcontainer/docker-compose.dev.yml up -d --build` | ✅ Container built in ~120 s; started clean |
| `docker exec cosmisk-dev node --version` | ✅ `v22.22.3` (matches devcontainer pin) |
| `/workspace` bind-mount | ✅ Host source visible |
| `node_modules` named volumes (`root_node_modules`, `server_node_modules`) | ✅ Mounted; isolates from root-owned host dirs |

---

## 2. Server install — `npm install` in `server/`

| Step | Result |
|---|---|
| Package count | 256 packages |
| Exit code | 0 (clean) |
| Warnings | only the npm 10 → 11 upgrade notice |

---

## 3. Server build — `npm run build` (= `tsc`)

**Exit code: NON-ZERO. 55 TypeScript errors. Build does not produce a usable `server/dist/`.**

### 3.1 Error breakdown

| Code | Count | What |
|---|---:|---|
| TS2307 | **34** | Cannot find module (the missing-imports finding) |
| TS7006 | 10 | Parameter implicitly has 'any' type |
| TS7016 | 9 | Could not find declaration file for installed package (missing @types) |
| TS2538 | 1 | Type 'symbol' cannot be used as an index type |
| TS2345 | 1 | Argument type not assignable to parameter |

### 3.2 Missing modules (TS2307) — full inventory

**Confirmed from static analysis (15 files, ~22 paths):**
- `./routes/health-score.js`, `./routes/creative-scan.js`, `./routes/quick-wins.js`, `./routes/static-ads.js` (index.ts:40-43)
- `../utils/encryption.js` (routes/shopify.ts:22, services/shopify-client.ts:601)
- `./types.js` (ad-engine cluster ×4)
- `./templates.js`, `../client-references.js`, `../pattern-extractor.js` (ad-engine/validator.ts)
- `./intelligence-integration.js` (ad-watchdog.ts:28, report-agent.ts:25)
- `./client-references.js` (learning-engine.ts:22)
- `../signal-discovery/index.js` (strategic-cognition ×4)
- 12 analyser modules (unified-agent-runner.ts:29-64)

**NEW findings from the actual build (not caught by grep) — missing npm packages:**
- `sharp` — imported by `services/ad-engine/gemini-generator.ts:6`
- `cheerio` — imported by `services/competitor-creative-intel.ts:26`

Both are real npm packages that need to be **added to `server/package.json`** (the import is for image processing in the Gemini ad generator and HTML parsing in the competitor-intel scraper). Static grep missed these because they don't have relative paths.

### 3.3 Missing type declarations (TS7016)

| Package | Files affected |
|---|---|
| `better-sqlite3` | audit/index.ts, db/index.ts, db/schema.ts, audit-scheduler.ts, client-context.ts, strategic-memory.ts (×6) |
| `bcryptjs` | db/index.ts, index.ts:1099, routes/auth.ts (×3) |

`@types/better-sqlite3` and `@types/bcryptjs` are listed in `server/package.json` `devDependencies` but **the installed `bcryptjs` version (`^2.4.3`) is older than the `@types/bcryptjs@^2.4.6` and they may have drifted out of sync.** Or `@types/better-sqlite3` is just not being picked up by `tsconfig.json` — needs investigation.

Either way: fixable in S0/S1.

### 3.4 Implicit-any errors (TS7006)

Concentrated in:
- `ad-engine/validator.ts:944` (1)
- `competitor-creative-intel.ts:209, 218` (×4)
- `learning-engine.ts:304, 308, 311` (×4)
- `unified-agent-runner.ts:340` (1)

These are existing code-quality issues unrelated to the merge. Adding `// @ts-expect-error` or proper types would close them.

### 3.5 Type errors (TS2345, TS2538)

- `ad-engine/validator.ts:667` — symbol used as index type. Likely an enum mismatch.
- `ad-watchdog.ts:891:52` — `AccountSnapshot` passed where `string` expected. Probably a signature drift from the recent ad-watchdog edits.

---

## 4. Server tests — `npx vitest run`

**Exit code: NON-ZERO. 18 of 806 tests failed (97.5% pass rate).**

| Metric | Count |
|---|---:|
| Test files | 35 |
| Test files passing | 28 |
| Test files failing | 7 |
| Tests | 806 |
| Tests passing | **786** (97.5%) |
| Tests failing | **18** |
| Tests skipped | 2 |
| Duration | 25.8 s |

### 4.1 Failed test files

```
src/__tests__/ad-watchdog.test.ts                  (full-file fail — likely from import-resolution)
src/__tests__/agent-routes.test.ts                 (full-file fail)
src/__tests__/billing-routes.test.ts               (full-file fail)
src/__tests__/content-routes.test.ts               (3 cases)
src/__tests__/llm-gateway.test.ts                  (8 cases — see § 4.2)
src/__tests__/media-gen-routes.test.ts             (5 cases — 503 vs 500 mismatches)
src/__tests__/reports-routes.test.ts               (2 cases)
```

### 4.2 LLM-gateway test failures (8) — important

These hit the recently-shipped gateway. Pattern of failures:

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

These suggest the gateway's behaviour drifted from the spec **after** the tests were written (the rate-limit-mapping ones in particular). The gateway shipped on `1521cce` but the test file pre-dates the final shape. Treat as **gateway is partially under-spec'd, partially under-tested** — needs reconciliation as part of S3.

### 4.3 Media-gen 503-vs-500 (5 cases)

Five tests expect `503` (service unavailable when env var missing) but get `500` (unhandled error). This is likely a guard-clause regression in `routes/media-gen.ts` — the missing-env-var path is throwing instead of replying with 503.

### 4.4 Reports + content + agent + billing + ad-watchdog (≤ 6 cases)

Each test file has 1–3 failures. Worth a per-file look; not blocking.

---

## 5. What the smoke test confirms

| Claim from `dev_reports/19_05/` | Actual smoke result |
|---|---|
| Build broken: 15 files, 25 missing modules | **34 TS2307 errors confirmed**, plus 2 new ones (`sharp`, `cheerio`) |
| @types broken: bcryptjs, better-sqlite3 | **9 TS7016 errors confirmed** |
| Implicit any in 78 places (production code) | only 10 surfaced as build errors; the rest are at sites the build skips because their parent module fails first. **78 will need to be re-counted after S1.** |
| 35 server test files | confirmed |
| 786 of 806 tests pass | confirmed (97.5%) |
| LLM gateway tests written | confirmed; **8 of them fail** — gateway needs reconciliation |

### New findings (not in any prior report)

1. **`sharp` is a missing npm dependency** (not just a missing source file). Add to `server/package.json` or remove the import in `ad-engine/gemini-generator.ts`.
2. **`cheerio` is a missing npm dependency.** Same fix shape.
3. **bcryptjs / better-sqlite3 @types are not resolving** despite being in `devDependencies`. Investigate `tsconfig.json` `types` field and the version drift.
4. **8 LLM gateway tests fail.** The gateway as it ships does not match the test suite. This needs reconciliation as part of S3 (not the addition of new wraps).
5. **5 media-gen tests fail with 503-vs-500.** Guard-clause regression in `routes/media-gen.ts`.

---

## 6. Container state after smoke test

- Container `cosmisk-dev` is **still running** (`shutdownAction: stopCompose` means it stays up while VS Code is attached).
- `server/node_modules` named volume contains 256 packages.
- `node_modules` (root) was being installed when the test was interrupted; partial. Frontend build (`ng build`) was not attempted.
- `server/dist` was not produced (build failed).

---

## 7. Implication for the cleanup plan

The smoke test **does not change** the recommended order (S0 → S1 → S2 → S3 → P0…), but it **expands the scope** of S1 and S3:

- S1 must now also: install `sharp` + `cheerio` (or remove their imports), resolve the @types mismatch.
- S3 must now also: reconcile the 8 failing gateway tests with the gateway code.
- A new sub-step: **S1.9 — investigate the bcryptjs / better-sqlite3 @types resolution failure.**

---

**End of smoke test report.**
