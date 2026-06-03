# Monorepo / Project-Management Restructure — Assessment ("Bucket H", future phase)

> Reference assessment of the **Gravity Monorepo** pattern (Remix + NestJS/Bun + FastAPI/uv, pnpm workspaces + Turborepo,
> per-service semantic versioning) applied to **Cosmisk**. Scope per request: **project-management & structural patterns only** —
> NOT the framework/runtime choices. Not for now; this is a deliberate later phase, after the god-file refactor (R2/R3) + Runtime Hardening.

## Cosmisk today (grounding)
- **Root is cluttered**: the Angular frontend lives *at root* (`angular.json`, `src/`, `tailwind.config.js`, `tsconfig.app.json`) mixed with `server/` (Fastify/Node backend, `cosmisk-server`), Python scripts (`scripts/*.py` — scrape, crawl, ad-intel), `e2e/` (Playwright), `mcp-servers/`, `analysis/`, `cosmisk-wiki/`, `dev_reports/`, `docs/`, plus deploy config (`Dockerfile`, `railway.toml`, `vercel.json`, `nginx.conf`, `docker-compose.yml`).
- **No workspace tooling**: npm, no `pnpm-workspace.yaml`, no `turbo.json`. Two TS packages (root Angular + `server/`).
- **Inconsistent versioning**: root `package.json` 0.0.0, `server` 1.0.0, runtime `/health` reports a date-string (`2026-03-29.2`).
- **Conventional commits already in use** (`feat:`/`fix:`/`refactor:`), which auto-versioning could consume directly.

## Verdict
The Gravity **structure + PM patterns are a strong fit** for the "cleaner codebase" goal at the **macro** level (the god-file refactor is the micro level). Adopt the *shape*, not the *stack*.

### ✅ Adopt (high value)
| Pattern | Fit | Cosmisk target |
|---|---|---|
| `apps/` + `packages/` split | High | `apps/web` (Angular, off root), `apps/api` (`server/`), `packages/types` + `config`; root = workspace config only |
| `packages/types` shared Zod contracts | High | frontend↔backend (and future ai-service) end-to-end type safety; intelligence-layer outputs (THE ONE THING / cards) typed once. Can start incrementally. |
| Per-service semver + auto-bump from commits + git tags + GHCR images + GitHub Releases | High | replaces the inconsistent versions; traceable releases; consumes existing conventional commits. Adoptable fairly independently. |
| Turborepo orchestration | Med-High | build/test caching → faster CI + local; adopt *with* the workspace move |
| `scripts/bootstrap.sh` + clean-install + health endpoints | Med (cheap) | `/health` already exists; one-command setup is an easy DX win |

### 🔮 Adopt when the future addition lands
- **Runtime isolation / polyglot (TS + Python, separate package managers — uv for Python, npm for TS, "don't mix")** — forward-relevant: Cosmisk already has Python *scripts*, and the intelligence layer will likely need a Python service (embeddings/vector — `intelligence-infrastructure` references vector extensions). When those graduate to a real `apps/ai-service` (FastAPI/uv), this discipline applies cleanly. **This is the single biggest reason to target the monorepo shape.** Plan the slot; build only when needed.

### ❌ Skip (cost, no PM benefit)
- **Framework swaps** (Remix, NestJS) — keep Angular + Fastify; migrating frameworks is huge cost, zero PM gain.
- **Bun runtime** — Cosmisk runs Node (Railway node 22; the whole DB-2 migration assumed node-postgres/Node). Switching to Bun is risky + pointless.
- **pnpm switch** — npm has workspaces too; staying on npm + adding workspaces is less churn than a pnpm migration. Decide at move-time.

## Gravity → Cosmisk mapping
| Gravity | Cosmisk now | Cosmisk target |
|---|---|---|
| `apps/web` (Remix) | Angular at root | `apps/web` (Angular) |
| `apps/api` (NestJS/Bun) | `server/` (Fastify/Node) | `apps/api` (Fastify/Node — keep stack) |
| `apps/py-service` (FastAPI) | `scripts/*.py` only | `apps/ai-service` (FastAPI/uv) — IF/when the Python intelligence service is built |
| `packages/types` (Zod) | duplicated types | `packages/types` (shared Zod) |
| pnpm workspaces + Turbo | npm, no workspace | npm/pnpm workspaces + Turbo |
| per-service VERSION + auto-bump | date-string version | semver + auto-bump from commits |
| per-service CI + GHCR | per-area CI jobs in `ci.yml` | per-service CI + GHCR images + Releases |

## Sequencing (these are complementary, not competing)
1. **Now:** finish the **god-file decomposition (R2/R3)** — micro-structure. (The decomposed submodules move cleanly into `apps/api` later — no conflict.)
2. **Incrementally, anytime:** `packages/types` (shared contracts) + **per-service semver / auto-versioning / GHCR** — don't require the full move.
3. **Bucket H (separate, deliberate phase, own approval):** the `apps/`+`packages/` restructure + Turborepo. **High value, high effort, outward-facing** — `angular.json`, `vercel.json`, `Dockerfile`, `railway.toml`, `nginx.conf`, and `ci.yml` all reference root paths and would need rework; Railway/Vercel build settings change. Do *after* the current refactor + Runtime Hardening stabilize.

## Risks for Bucket H (when it happens)
- Deploy breakage: Railway (root/build cmd), Vercel (`vercel.json`), Docker (`Dockerfile` paths), nginx — all path-coupled to the current root layout. Move behind a branch + verify each deploy target.
- Frontend build (Angular CLI) is opinionated about project root — moving to `apps/web` means updating `angular.json` `root`/`sourceRoot` + `tsconfig` paths.
- Keep it behavior-preserving like R2: the test suites must stay identical through the move.
