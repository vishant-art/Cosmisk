# Repo Reshape Plan — Gravity-inspired monorepo (definitive)

**Date:** 2026-06-04 · **Base:** `main` ← `monorepo-restructure` @ `a9b96ed` · **Status:** PLAN — approve to execute.
**Task:** fix the shape of the repo into a clean, Gravity-inspired monorepo. **Rationale (accepted):** two engineers will work in parallel, so the structure must give each a self-contained, independently buildable/deployable app with shared contracts. That justifies the full apparatus (workspaces + per-app CI + Turbo) — this supersedes earlier "premature" framing.
**Adaptation (kept from Gravity, fit to us):** take the *shape*, not the *stack* — Angular + Fastify stay (no Remix/NestJS/Bun), Railway + Vercel stay (no AWS/ECS), Python stays as scripts. 
**Supersedes:** `monorepo_restructure_assessment.md`, `monorepo_viability_assessment.md`, `two_engineer_transition_plan.md` (kept for history).

---

## 1. Target shape

```
Cosmisk/
├── apps/
│   ├── web/                 # Angular frontend — own package.json, Dockerfile, VERSION, tsconfig.*
│   └── api/                 # Fastify backend  — own package.json, Dockerfile, VERSION (move done)
├── packages/
│   └── types/               # @cosmisk/types — shared TS contracts (web ↔ api)
├── infra/                   # nginx.conf, docker-compose.yml, deploy notes (railway/vercel)
├── scripts/                 # python scrapers (ad-intel, crawl, scrape)
├── e2e/                     # Playwright (spans web+api) — stays top-level
├── docs/  cosmisk-wiki/  dev_reports/
├── package.json             # WORKSPACE ROOT (thin): workspaces=[apps/*,packages/*], root scripts → turbo
├── turbo.json               # WIRED pipelines: build / test / typecheck / lint (+ cache)
├── tsconfig.base.json       # extended by every app + package
└── .github/workflows/       # web.yml + api.yml (path-filtered) — independent per app
```

**The shift from today:** root stops being the Angular app; it becomes a thin workspace manifest. The frontend becomes a real, self-contained `apps/web`. `turbo.json` and `packages/types` stop being inert scaffold and become wired.

## 2. How this serves two parallel engineers
- **Self-contained apps:** each engineer runs `cd apps/<x> && npm i && npm run build|test` in isolation — separate `package.json`, separate `node_modules` (hoisted by workspaces), separate Dockerfile.
- **Disjoint file ownership:** Engineer-A in `apps/web/**` (+ `web.yml`, `apps/web/Dockerfile`, `vercel.json`); Engineer-B in `apps/api/**` (+ `api.yml`, `apps/api/Dockerfile`, `railway.toml`). The only shared files are `packages/types`, `e2e/`, `turbo.json`, `tsconfig.base.json` — touched rarely, via small PRs.
- **Independent CI:** path-filtered `web.yml`/`api.yml` → a frontend PR doesn't run backend gates and vice-versa (faster feedback, no cross-blocking).
- **Shared contracts:** `packages/types` is the one place cross-app shapes live, so the two lanes don't drift (tsc enforces).

## 3. The reshape steps (ordered; each a single gated, reversible PR)

| # | Step | What it does | Key edits (source imports = **0**, all relative — K1) | Gate |
|---|---|---|---|---|
| **1** | **Land foundation** | re-open + merge PR #4 (`apps/api` move + scaffold) → `main` | none (already done) | full CI (green) |
| **2** | **Move Angular → `apps/web`, self-contained** | `git mv src/ + angular.json + tsconfig.{json,app,spec} + tailwind.config.js + proxy.conf.json → apps/web/`; **split frontend deps into `apps/web/package.json`** (root keeps none of them); repoint `angular.json` paths; `vercel.json` (Root Dir → `apps/web` in dashboard); `Dockerfile` frontend stage → `apps/web/Dockerfile` | config-only; **0 TS import edits** (whole `src/` tree moves together) | full CI + **Vercel preview** + docker build + boot smoke |
| **3** | **Adopt npm workspaces** | root `package.json` → thin workspace manifest (`"workspaces":["apps/*","packages/*"]`); single hoisted install; `@cosmisk/types` now resolves via symlink | lockfile regenerates | install + build all apps + full CI |
| **4** | **Wire Turborepo** | add `turbo` dep; `turbo.json` `build/test/typecheck/lint` with caching; root scripts delegate to `turbo run` | none | `turbo run build test` green; CI uses it |
| **5** | **Per-app CI + Dockerfiles + `infra/`** | split `ci.yml` → `web.yml` + `api.yml` (`paths:` filters + sentinel for branch protection); per-app Dockerfile; move `nginx.conf`/`docker-compose.yml` → `infra/` (fix stale `server/data`→`data`) | none | both workflows green; both images build; compose up |
| **6** | **`packages/types` — first contracts** | extract genuinely-shared cross-app types into `@cosmisk/types`; apps import via `@cosmisk/types` | add tsconfig `paths`/workspace dep; `import type` where type-only | tsc both apps + full CI |
| **7** | **Hygiene + coherence** | per-app `VERSION` (semver) + `/health` reads it; delete leaked `turbo.json` ai-service comment; wire `tsconfig.base` into each app; remove `server/data` (elevated perms) | minor | suites + tsc baseline + madge 0 |

**Parallelism unlocks after Step 5**: from there the two engineers run fully independent lanes. Steps 1–5 are the sequenced foundation; the big/risky one is **Step 2** (the move + dep split), done with the exact discipline that made the `apps/api` move risk-0.00.

## 4. Integrity discipline (non-negotiable, every PR)
- **K1 — zero source-import changes:** all moves are `git mv` of whole trees; relative imports preserved; behavior-preserving (proven by the `apps/api` move).
- **Test Invariant:** default **400/9**, pg **388/10**, `tsc` baseline-only (`billing.ts:4` stripe), `madge` **0 cycles** — before every merge.
- **Deploy verify** for config-touching steps (2, 5): Vercel preview + Docker build + boot smoke — catches the out-of-repo Vercel/Railway dashboard settings (root dir / build / output) that don't move with files.
- **One step per PR, serialized merges, trailing PRs rebase, each independently green.** Every step is `git revert`-able.
- Branch off `main`; don't commit `CLAUDE.md` / `.env.test`.
- **Pre-req:** make the Neon `ep-plain-breeze` test branch persistent (else the pg gate breaks ~Jun 10).

## 5. Go
Approve this 7-step sequence and I start immediately with **Step 1 (merge the foundation)** → **Step 2 (the Angular→`apps/web` move + dep split)**, gating each as above. Two questions that only affect *Step 2/3 mechanics* (I'll default to the recommended if you don't care):
1. **`apps/web` fully self-contained (own `package.json`) + npm workspaces** — recommended (it's what gives clean parallel lanes). Confirm?
2. **Turbo now (Step 4) or after the apps settle** — recommended now (caching helps two parallel CIs). Confirm?
