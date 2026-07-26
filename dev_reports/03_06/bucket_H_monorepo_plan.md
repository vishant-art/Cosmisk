# Bucket H — Monorepo Restructure: Plan & Python-Service Fit (2026-06-04)

> Builds on `monorepo_restructure_assessment.md` (the Gravity-pattern verdict). This is the **executable plan** + a fit assessment for the incoming **Python AI service**. Outward-facing (rewrites deploy config) → execute AFTER the `repo-cleanup` merge + freeze clearance. Behavior-preserving: suites + each deploy target stay green through the move.

---

## Current root (the clutter)
Angular frontend at ROOT (`src/`, `angular.json`, `tailwind.config.js`, `tsconfig.app.json`, `proxy.conf.json`) mixed with: `server/` (Node/Fastify backend), `scripts/*.py` (ad-intel, crawl, scrape), `e2e/` (Playwright), `mcp-servers/`, `analysis/`, `cosmisk-wiki/`, `dev_reports/`, `docs/`, `temp_reports/`, and deploy config (`Dockerfile`, `railway.toml`, `vercel.json`, `nginx.conf`, `docker-compose.yml`). npm only — no workspaces, no Turbo.

---

## Target layout
```
cosmisk/
  apps/
    web/            ← Angular (from root: src/, angular.json, tailwind, tsconfig.app, proxy.conf)
    api/            ← server/ (Fastify/Node) — request handling only
    worker/         ← NEW: the heavy crons extracted from api (absorbs RH-2)
    ai-service/     ← NEW: the Python FastAPI/uv service (Typesense, agents, vector)  ← YOUR STRUCTURE
  packages/
    types/          ← shared Zod/TS contracts (web ↔ api ↔ worker); ai-service mirrors via generated schema
    config/         ← shared tsconfig/eslint/tailwind presets
  e2e/              ← Playwright (stays top-level; spans web+api)
  infra/            ← Dockerfiles, nginx.conf, docker-compose.yml, railway/vercel config
  docs/ cosmisk-wiki/ dev_reports/    ← unchanged
  package.json (workspace root) · turbo.json · tsconfig.base.json
```
- **TS side:** npm workspaces + Turborepo orchestrate `web`/`api`/`worker`/`packages/*`.
- **Python side:** `ai-service` stays **uv-managed and OUTSIDE the npm/Turbo dependency graph** (polyglot "don't mix" rule). Turbo may invoke it via a thin pipeline task that shells to `uv`, but its deps/build/test are uv + its own CI job. **Do NOT add a `package.json` to ai-service to force it into the workspace** (your tree already drops it — correct).

---

## ✅ Python AI-service fit assessment (your explicit ask)
Your structure maps **cleanly** to `apps/ai-service`. Verdict: **good fit, minor adjustments.**

| Your item | Fit / action |
|---|---|
| `pyproject.toml` + `uv.lock` + `.python-version` | ✅ uv-managed. Keep self-contained under `apps/ai-service`; do NOT hoist into npm workspace. |
| `package.json` (you deleted it) | ✅ Correct — a Python app shouldn't carry one. Keeps it out of npm's graph. |
| `main.py` / `db.py` / `migrate.py` | ✅ FastAPI entry + DB + migrations. Note: it has its OWN `db.py`/`migrate.py` — decide if it shares the **same Postgres** as `apps/api` (likely yes) → coordinate migrations so two services don't fight one schema (own schema/namespace, or api owns DDL and ai-service is read-mostly). **Open question — see below.** |
| `seed_typesense.py` + Typesense | ✅ Vector/search backend. Add **Typesense to `infra/docker-compose.yml`** for local dev. This is almost certainly the backend for the dormant `intelligence-infrastructure.ts` "vector-ready pattern store" seam — wire that in Phase D of the intelligence plan. |
| `seed_agents.py` | Agent definitions — likely overlaps the Node `agent-registry.ts`. **Decide the source of truth** (one registry, or ai-service owns agent defs and api reads them). Avoid two diverging catalogs. |
| `VERSION` | ✅ Adopt per-service semver across ALL apps (the Gravity pattern) — `apps/*/VERSION` + auto-bump from conventional commits + GHCR images. |
| `Dockerfile` + `.dockerignore` | ✅ Independent container. Move to `apps/ai-service/Dockerfile`; reference from `infra/`/Railway. |
| `workflows/` | ⚠️ Clarify: if these are **CI** workflows, lift to root `.github/workflows/` (a sub-CI job for ai-service). If they're **agent/app workflows** (runtime), keep under `apps/ai-service/`. |
| `tests/` | ✅ uv/pytest test dir — its own CI job, separate from vitest. |
| `src/` (the `0` is likely a tree-render artifact) | ✅ app package code. Confirm it's the importable package (`apps/ai-service/src/<pkg>`). |
| existing `scripts/*.py` (ad-intel, crawl, scrape) | These root Python scripts likely belong WITH ai-service (or `apps/ai-service/scripts/`). Consolidate Python in one place — don't leave scrapers at the repo root. |

**Net:** the service is monorepo-ready as `apps/ai-service`. The real work isn't the move — it's the **two integration contracts**: (1) shared Postgres migration ownership, (2) agent-definition source of truth, plus standing up Typesense in infra.

---

## Migration map (current → target)
| From | To |
|---|---|
| `src/`, `angular.json`, `tailwind.config.js`, `tsconfig.app.json`, `tsconfig.spec.json`, `proxy.conf.json` | `apps/web/` |
| `server/` | `apps/api/` |
| (extract heavy crons from `apps/api`) | `apps/worker/` (RH-2) |
| the Python service you showed | `apps/ai-service/` |
| `scripts/*.py` | `apps/ai-service/scripts/` (consolidate) |
| `Dockerfile`, `nginx.conf`, `docker-compose.yml`, root deploy bits | `infra/` |
| duplicated TS types (web/api) | `packages/types/` |
| `e2e/`, `docs/`, `cosmisk-wiki/`, `dev_reports/` | unchanged (top-level) |

---

## Deploy-config rewrites (the risk surface — each is path-coupled)
- **`angular.json`** — `root`/`sourceRoot`/`outputPath` → `apps/web` (Angular CLI is opinionated about project root).
- **`vercel.json`** — build command + output dir → `apps/web` (Vercel project settings change).
- **`Dockerfile`(s)** — build context paths → per-app Dockerfiles under each app; root one becomes api's.
- **`railway.toml`** — root/build/start commands per service (api, worker, ai-service as separate Railway services).
- **`nginx.conf`** — static root path → `apps/web` dist.
- **`.github/workflows/ci.yml`** — per-area jobs → per-app jobs (web: ng build/test; api+worker: vitest+tsc; ai-service: uv + pytest); Turbo caching for the TS side; GHCR image push per app.
- **`tsconfig*.json`** — split into `tsconfig.base.json` + per-app extends; path aliases for `packages/*`.

---

## Workspace tooling
- **npm workspaces** (`"workspaces": ["apps/web","apps/api","apps/worker","packages/*"]`) — stay on npm (less churn than pnpm; decide at move-time).
- **Turborepo** (`turbo.json`) — `build`/`test`/`lint`/`typecheck` pipelines with caching → faster CI + local. ai-service participates only via an optional shell task.
- **`packages/types`** — start incrementally (move shared contracts as touched); enables end-to-end Zod typing for the intelligence outputs (THE ONE THING / cards).
- **Per-service semver + auto-bump + GHCR + Releases** — adoptable fairly independently; consumes the existing conventional commits.

---

## Sequencing (behavior-preserving, verify deploy each step)
0. **Prereq:** `repo-cleanup` merged + freeze cleared + `.env.test` rotated. Do Bucket H on its own branch.
1. **Scaffold workspace** — add root `package.json` workspaces + `turbo.json` + `tsconfig.base.json`, no moves yet. Verify install + build still work.
2. **Move `server/` → `apps/api/`** — update `railway.toml`/`Dockerfile` paths, run pg+default suites, verify Railway deploy.
3. **Move Angular → `apps/web/`** — update `angular.json`/`vercel.json`/`nginx.conf`, verify Vercel deploy + e2e.
4. **Extract `apps/worker/`** — move heavy crons out of api (RH-2); de-dupe the `0 */4 * * *` collision; new Railway worker service.
5. **Add `apps/ai-service/`** — drop in the Python service; Typesense in `infra/docker-compose`; resolve the 2 integration contracts (DB migrations, agent source-of-truth); ai-service CI job + Railway service.
6. **`packages/types`** — extract shared contracts incrementally.
7. **Per-service versioning + GHCR + Releases.**
> Each step is independently revertible and keeps all suites + deploy targets green. Don't batch moves — one app per PR.

---

## ❓ Open questions for you (gate step 5)
1. **What is the Python ai-service, exactly, and where does it live now** (separate repo to fold in? a local folder?) — affects how we import its history.
2. **Does it share the same Postgres as `apps/api`?** If yes, who owns migrations (recommend: api owns DDL; ai-service read-mostly or owns a separate schema).
3. **Agent definitions** — should `seed_agents.py` or the Node `agent-registry.ts` be the source of truth? (Don't keep two.)
4. **Typesense** — is it already provisioned (Railway/managed), or do we add it to infra now?
