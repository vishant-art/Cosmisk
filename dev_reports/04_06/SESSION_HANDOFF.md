# SESSION HANDOFF — Monorepo Reshape (Bucket H, Steps 3–7)

**Date:** 2026-06-04 · **Branch:** `monorepo-restructure` · **Plan:** `dev_reports/04_06/repo_reshape_plan.md`
**Status:** reshape Steps 2–7 executed as **5 incremental commits**, each gated + behavior-preserving. Nothing merged to `main`. No prod deploy triggered.

---

## 1. What landed this session (commits on `monorepo-restructure`)

| Commit | Step | What |
|---|---|---|
| `92314ca` | **H3** | Angular frontend `src/` + `angular.json` + `tsconfig.*` + `tailwind`/`proxy` → **`apps/web/`** (whole-tree `git mv`, 0 import edits); root `package.json` → thin **npm-workspace** manifest; deploy/CI repointed (Dockerfile, vercel.json, ci.yml, playwright.ci). apps/api **excluded** from workspaces (kept undisturbed). |
| `0037582` | **H4** | **Turborepo** wired: `turbo ^2.9.16` + `packageManager`; root scripts `build/test/typecheck/lint` → `turbo run`; `.turbo/` ignored. Verified: `turbo run build` green + cache hit (FULL TURBO 88ms). |
| `028ca51` | **H5** | **CI split** → `web.yml` + `api.yml`, path-filtered (dorny/paths-filter) with always-on **sentinel gates** `web-ci`/`api-ci` (no branch-protection deadlock). `docker-compose.yml` + `nginx.conf` → **`infra/`** (compose build context → `..`). |
| `21fe542` | **H6** | **`packages/types` is now real** — first shared contract: intelligence `AiInsight`/`InsightPriority`/`InsightActionType`. `apps/web` declares `@cosmisk/types` + its `insight.model` re-exports it (public surface unchanged). Build green. |
| `0cd1615` | **H7** | `/health` reads `apps/api/src/version.ts` (`VERSION='1.0.0'`) instead of stale `'2026-03-29.2'`; `.gitignore` `server/*` → `apps/api/*`. |

**Step 1** (merge foundation PR to `main`) and **Step 2/3** mechanics were folded into H3.

## 2. Gate status (Test Invariant)
- `apps/api` **tsc baseline-only** ✅ (`src/routes/billing.ts:4` stripe TS7016 — the known baseline; nothing else).
- `madge --circular` **0 cycles** ✅ (358 files).
- `apps/web` production build ✅ (via `turbo run build`).
- **vitest (400/9) + pg (388/10) suites NOT run locally** — vitest's rolldown native binary SIGBUSes on this WSL2 host. They gate in **CI** (`api.yml` backend job). Run them in CI / a healthy host before merge.
- `docker build` not run locally (docker CLI absent in this WSL distro) — gates in CI (`api.yml` docker job).

## 3. DEFERRED — each non-hasty by design (NOT bugs; conscious scope calls)

1. **Per-app Dockerfile split (part of H5).** Production is a **single combined image**: `railway.toml` → root `Dockerfile`, Fastify serves the built Angular from `/public`. Splitting into `apps/web/Dockerfile` (nginx static) + `apps/api/Dockerfile` (API-only) is a **deploy-model decision** (does Fastify stop serving the SPA? two images on Railway? frontend = Vercel only?). **Your call.** Until then the root `Dockerfile` stays as the production build (unchanged, zero deploy risk).
2. **`apps/api` adoption of `@cosmisk/types` (part of H6).** apps/api is outside the npm workspace with `rootDir: "src"`; a cross-package `import` hits the classic tsc `rootDir` error (via tsconfig paths) or forces a `file:` dep + backend lockfile churn + a blind Dockerfile COPY (only CI-docker-gatable). Clean path = **TS project references**. This is the natural **second contract**, best done when the intelligence seam is activated (Phase A).
3. **`tsconfig.base` full wiring (part of H7).** Extending base into `apps/api` adds `noImplicitReturns`, which surfaces **2 real errors** → `apps/api/src/index.ts:128` and `apps/api/src/services/competitor-creative-intel/brand-context.ts:48` (`TS7030` not all code paths return). Fix those two functions first, then `extends` base. Wiring base into only `apps/web` would leave it inconsistent, so deferred whole. (`packages/types` already extends base correctly.)
4. **`server/data` cleanup (part of H7).** Lingering root `./server/data` is **root-owned** (old docker-volume artifact). Needs `sudo rm -rf server` — I can't remove it. It is gitignored + untracked, so harmless, just untidy.

## 4. YOU must do (out-of-repo / your click)
- **Merge order:** when ready, merge `monorepo-restructure` → `main` as the foundation (Step 1), or open a PR. **CI must be green first** (it runs the suites I can't run locally).
- **Branch protection (CRITICAL):** the old required checks (`Frontend (Angular)`, `Backend (Fastify)`, `Smoke Test (Playwright)`, `Docker Build`, …) no longer exist. Update `main`'s required status checks to **`web-ci`** and **`api-ci`** (the new sentinels). If you skip this, single-app PRs will hang on never-reporting checks.
- **Vercel dashboard:** set the project **Root Directory → `apps/web`** (the in-repo `vercel.json` build/output paths are already repointed, but the dashboard Root Dir is out-of-repo).
- `sudo rm -rf server` to clear the root-owned artifact (optional).

## 5. code-review-graph — why a full rebuild takes 50+ min, and the policy
**Diagnosis:** `full_rebuild=true` discards the store and re-parses + **re-postprocesses** (community + flow detection over 48k edges, embeddings, wiki regeneration over 5.3k nodes) on a **126 MB** SQLite store, on WSL2's slow translated FS. The Tree-sitter parse is seconds — the postprocess + wiki regen is the 50 min. The new npm-workspace symlinks (`node_modules/@cosmisk/{web,types}` → back into the repo) also risk the walker re-traversing `apps/web`/`packages/types` if it follows symlinks.
**Policy adopted:** never per-phase full-rebuild. The **commit hook already does cheap incremental analysis** (each commit reported risk 0.00 except H7's informational 0.30). The graph still carries **stale pre-move `src/*` nodes** (cosmetic — that's why the hook says "179/594 changed files" on config-only commits). Reconcile with **one** full rebuild **when idle / out-of-band** (`postprocess=minimal`), not after each step.

## 6. Next-session entry points
- Decide #1 (Dockerfile split / deploy model) and #3 (fix the 2 `TS7030` sites → wire `tsconfig.base`).
- When activating intelligence (Phase A), do #2 (apps/api → `@cosmisk/types` via project references) as the second shared contract.
- Superseded planning docs kept for history: `monorepo_restructure_assessment.md`, `monorepo_viability_assessment.md`, `two_engineer_transition_plan.md`.

## 7. QUEUED for next session (2026-06-05) — re-enable live-feature tests, then PR + merge
**Decided:** no feature/code changes — only un-skip tests for *online* features, verify, commit, then open PR for merge.

**In scope — ad-watchdog (7 skipped tests), the live 6h loop:** `apps/api/src/__tests__/ad-watchdog.test.ts` lines 655/699/735/833/897/924/962. Each does `mockAnthropicCreate.mockResolvedValueOnce({})`; the real llm-gateway throws at `computeCostCents(model, response.usage)` (llm-gateway.ts:~321) on missing `usage`. **Fix (test-only):** give each `{ usage: { input_tokens: 100, output_tokens: 50 } }`, change `it.skip`→`it`, drop the `// SKIP:` comment. Verify: `cd apps/api && npx vitest run src/__tests__/ad-watchdog.test.ts --no-coverage` (vitest runs fine per-file; only the full parallel run SIGBUSes on WSL2). Watch for the gateway's `recordCost` path needing a known model price — may need one more mock tweak. Est ~15 min.
- Result after fix: **default-suite skips 9 → 2** (only the flaky discount-leakage pair remain, covered by unit tests).

**Out of scope (today's reasoning):**
- media-gen (5): needs a real code change (route throws 500 instead of 503 on missing env) — feature work, excluded.
- content (3) + reports (2): pg-suite only (`vitest.pg.config.ts`, `*.pg.test.ts` excluded from default) — need a live Neon branch (`TEST_DATABASE_URL`, not set here) to run/verify. **pg-suite skips stay /10** until the Neon test branch is up.
- discount-leakage (2): skipped for rate-limit flakiness; core covered by unit tests.

**State at stop:** 6 reshape commits + CODEOWNERS pushed to `origin/monorepo-restructure`; **PR NOT opened**; zero test edits made (clean tree). Pre-merge actions unchanged (SESSION_HANDOFF §4: CI green, branch-protection → web-ci/api-ci, Vercel Root Dir → apps/web).

## 8. COMPLETED (2026-06-05) — ad-watchdog tests enabled, PR opened, CI green

**Commit `964e235` `test(watchdog): enable 7 ad-watchdog decision tests against the real llm-gateway`** (test-only, no production code change):
- Root cause was **two-fold**, not one: (a) SDK mock returned `{}` → gateway threw on missing `response.usage`; (b) the gateway's `checkDailyLimit`/`getDailySpendCents` runs *during* `createMessage` (a `db.get` between the meta-token and shopify reads), and the mocked `config` lacked `llmDailyUsdCapOverride`. **A third, undocumented blocker surfaced:** the unmocked **quality gate** (`filterDecisions`, `minScore:55/requireSynthesis:true`) filtered the low-detail test fixtures → `passedDecisions=[]`.
- Fix per test: real `usage` shape on the SDK mock; a `{ total_cents: 0 }` row slotted into each `mockDbGet` chain (gateway daily-spend read); `llmDailyUsdCapOverride:100000` on the mocked config; and a file-scoped **pass-through mock of `../services/quality-gate.js`** (its scoring policy is a separate, independently-tested concern — the watchdog test asserts the watchdog's own reason→validate→record→notify pipeline).
- **Result: `ad-watchdog.test.ts` 35/35.** Gates: tsc baseline-only (`billing.ts:4`); madge 0 cycles (358 files). Default-suite manual skips **9 → 2** (only flaky discount-leakage pair remain). New default baseline ≈ **407 / 2**.

**Integrity re-confirmed via git** (`git diff -M -l0 origin/main...`): **583 renames** (mostly byte-identical), real content edits confined to ~20 infra/config files. Entrypoint chain (`railway.toml`→root `Dockerfile`→`dist/index.js`) and DB layer (`db/pg.ts`, `load-env.ts`, `config.ts`) are unchanged moves → prod + Neon DB safe.

**PR #5 OPEN** — `monorepo-restructure` → `main` (https://github.com/vishant-art/Cosmisk/pull/5), 9 commits. **All CI green:** Backend (Fastify) vitest, Docker Build (1m35s), Smoke (Playwright), Angular build + unit tests, **`api-ci`/`web-ci` sentinels**, Vercel previews. Safe to merge.

**REMAINING — user's click (out-of-repo):**
1. Merge PR #5 to `main` (triggers Railway prod deploy).
2. Branch protection → required checks **`web-ci`** + **`api-ci`** (old check names no longer gate single-app PRs).
3. Vercel dashboard → Root Directory **`apps/web`**.

Still skipped by design: discount-leakage flaky pair (default, 2); content/reports/media-gen (pg-suite, need Neon `TEST_DATABASE_URL`; media-gen also needs a 503-vs-500 code change — feature work).
