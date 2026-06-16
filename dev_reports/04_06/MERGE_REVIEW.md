# Morning Review — Bucket H Phase 1-2 (PR #4) + Session Report
**Date:** 2026-06-04 · **For:** review → merge decision on PR #4 · **Branch:** `monorepo-restructure`

---

## TL;DR — Recommendation
**Merge PR #4** (https://github.com/vishant-art/Cosmisk/pull/4). It's a behavior-preserving monorepo move (`server/` → `apps/api/`) + an inert workspace scaffold. Fully verified locally **and** in CI. After merge, intelligence development can begin (it's not blocked by the rest of the monorepo work).

---

## 1. The merge decision: PR #4

**What it does (2 commits, +68 / −5 lines, 421 files):**
- **H1 — workspace scaffold** (`0421a89`): adds `apps/`, `packages/types/` (`@cosmisk/types`, empty), `turbo.json`, `tsconfig.base.json`. All **inert** — nothing references them yet. No existing file touched.
- **H2 — server move** (`a9b96ed`): `git mv server → apps/api` (414 files, **R100 = byte-identical**, history preserved). Updated the only 2 deploy-config path couplings: `Dockerfile` backend-stage COPY + `ci.yml` (working-dir/cache/audit). `docker-compose` uses `build: .` → no change needed. Workspace-manifest flip deferred to Phase 3.

**Verification — every gate green:**
| Gate | Result |
|---|---|
| tsc (apps/api) | ✅ baseline-only (`billing.ts:4` stripe, pre-existing) |
| default suite | ✅ 400 passed / 9 skipped |
| pg suite | ✅ 388 / 10 (lone perf-test miss was CPU contention from the concurrent docker build — **passed on isolated rerun**) |
| madge | ✅ 0 circular deps |
| docker build (local, new paths) | ✅ image built |
| boot smoke (local) | ✅ prod image → `/health` 200 `db:connected` |
| **CI (all jobs)** | ✅ Backend · **Docker Build** · Frontend · Unit · Security · Playwright · Vercel ×2 |
| risk score | 0.00 (0 changed functions — pure relocation) |

**Why it's safe:** app-internal imports are all relative (unaffected by the dir rename); env-loading is file/cwd-relative (`vitest.setup*` + `drizzle.config`); CI's own Docker Build proves the deploy path. Merging changes no runtime behavior.

---

## 2. What happened this session

**Already merged — PR #3 (`44619d8`, 28 commits):** the structural refactor + hardening.
- R1: 11 root docs → `docs/`. R2: 20 god files decomposed into barrels + `index.ts` 1305→290 (routes → `boot/`). R3: stale-SQLite comment sweep.
- RH-0 (security): untracked `server/.env.test` from the public repo + added `.env.test.example`.
- RH-3: 106 `console.*` → structured `logger`.
- CLAUDE.md optimized (two-version: public freeze / local active-dev via `skip-worktree`).

**This session — PR #4 (open):** Bucket H Phase 1-2 (above).

**Branch cleanup:** deleted `repo-cleanup` + `dev` (local + remote, fully merged). `worktree-sow-audit-report` left (bound to an active worktree). `bucket-h` renamed → **`monorepo-restructure`**.

**Specs written (in `dev_reports/03_06/`, for engineers/future phases):** intelligence activation map + Phase A wiring spec · RH-1 LLM-gateway consolidation spec · runtime-hardening audit · Bucket H plan + Phase 1-2 detail · PR descriptions.

---

## 3. Where the server files went + graph status

- **All 414 `server/` files → `apps/api/`** at R100 (100% identical). `.env.test` → `apps/api/.env.test`; `node_modules`/`dist` moved too. **Nothing lost or changed.**
- **Leftover:** `server/` now holds only an untracked, stale `server/data/` (old SQLite data dir, obsolete since DB-2 — 4 KB). Safe to delete (awaiting your OK).
- **code-review-graph is stale:** last built at `b98ddb8` on the old `server/` layout (4,201 nodes / 38,120 edges / 394 files). Since the move is R100, the "new" graph ≈ the old one with paths re-rooted `server/src/… → apps/api/src/…` + ~3 nodes for `packages/types`. It needs a re-index to point at `apps/api`; I paused the full rebuild per your call — an **incremental update** (lighter) is ready to run on your OK.

---

## 4. Repository directory guide

### Top level
| Dir | Meaning |
|---|---|
| `apps/` | Monorepo apps (Bucket H). Today: `api/`. Planned: `web/`, `worker/`, `ai-service/`. |
| `apps/api/` | The Fastify/Node **backend** (moved from `server/`). |
| `packages/` | Shared workspace libs. `types/` = `@cosmisk/types` (shared contracts; empty scaffold). |
| `src/` | The **Angular frontend** (still at root; → `apps/web/` in Phase 3). |
| `server/` | ⚠️ Stale leftover (only untracked `server/data/`) — delete. |
| `e2e/` | Playwright end-to-end tests. |
| `scripts/` | Python data/scrapers (`ad-intel`, `crawl-free`, `scrape`) + one-off client scripts. |
| `mcp-servers/` | Custom MCP servers (`frameio/` = Frame.io integration). |
| `analysis/` | Ad-hoc analysis/design notes. |
| `cosmisk-wiki/` | Knowledge wiki: `strategic/`, `agents/`, `architecture/`, `business/`, `clients/`. |
| `docs/` | Repo documentation (organized in R1). |
| `dev_reports/` | Our working/session reports — local/temp, deletable (this report + all specs). |
| `temp_reports/` | Gitignored scratch. |
| `dist/` · `node_modules/` | Build artifacts / deps. |
| `.github/` · `.devcontainer/` · `.claude/` | CI / dev container / Claude config + worktrees. |

### `apps/api/src/`
| Dir | Meaning |
|---|---|
| `routes/` | Fastify route plugins, one per domain (HTTP layer). |
| `boot/` | Bootstrap route modules extracted from `index.ts` (public/meta-creative/account routes + helpers). |
| `services/` | Business logic + agents — the bulk (see below). |
| `db/` | DB layer: `adapter` (async DbAdapter + SQLite→PG dialect shim), `pg`, `pg-schema` (Drizzle). + `apps/api/drizzle/` migrations. |
| `audit/` | Creative-audit subsystem (audit-agent: ingestion → QA → output). |
| `plugins/` | Fastify plugins (auth JWT, usage-limiter). |
| `validation/` | Zod request schemas. |
| `types/` · `utils/` | Shared types · logger/error/claude-helpers/request-context. |
| `__tests__/` | Vitest tests (default + `*.pg.test.ts`). |
| `.claude/` | ⚠️ Stray `settings.local.json` that rode along in the move — can clean. |

### `apps/api/src/services/` (by role)
Each dir named after a god-file is a **decomposed barrel** (original path re-exports focused submodules; deeper dirs are the submodules).
- **Live agents** (watchdog cron): `ad-watchdog/` (orchestrator), `oos-detector/`, `comment-mining/`, `cohort-ltv-analyzer/`, `creative-scorer/`, `competitor-creative-intel/`, `learning-engine/`, `strategic-intelligence-engine/`.
- **Dormant intelligence brain** (built, unwired — the activation target): `intelligence-layer/` (reasoning-quality infra), `elite-intelligence/` (THE ONE THING engine), `strategic-cognition/` (worldview-synthesis cluster: recursive-investigator, causal, competing-hypotheses, curiosity, uncertainty, self-improving, elite-decision-compression, narrative-synthesis, client-report-generator), `quality-governance/` (quality gate), `signal-discovery/` (Signal contract).
- **Creative/ad gen:** `ad-engine/` (strategy → gemini-generator → validator), `creative-intelligence/`.
- **Support:** `reality-testing/`, `operator-experience/`, `quality-gate/`.
- **Flat (non-decomposed) files:** `llm-gateway`, `agent-registry`, `strategic-memory`, `intelligence-infrastructure`, `intelligence-persistence`, **`intelligence-integration`** (the no-op seam), `recommendation-loop`, etc.

---

## 5. Phase-wise scorecard (done vs needed)

| Foundation phase | Needed | Status |
|---|---|---|
| **DB migration (DB-2)** | SQLite → Neon Postgres cutover | ✅ DONE (live, deployed) |
| **Codebase cleanup (refactor)** | God files, root docs, structure | ✅ DONE (PR #3 merged) |
| **Runtime Hardening** | RH-0 secrets · RH-3 logging | ✅ DONE |
| | RH-1 LLM-gateway bypasses | 📄 SPEC ONLY (your call) |
| | RH-2 crons-in-API | → folded into Bucket H (`apps/worker`) |
| **Monorepo (Bucket H)** | Phase 1 scaffold · Phase 2 api move | ✅ DONE (PR #4) |
| | Phase 3 web · 4 worker · 5 ai-service | ⏳ pending |

---

## 6. Can we start intelligence development? — **Yes.**
The foundation that *blocked* intelligence work is complete: Postgres is live, the codebase is refactored, security + logging hardened. The remaining items (Bucket H Phase 3-5, RH-1) are **parallel infrastructure that does not gate** activating the intelligence layer.
- **Phase A** (reconnect the no-op `intelligence-integration.ts` seam → strategic-cognition + quality-governance, deliver via `routes/intelligence.ts`) is spec'd and ready (`dev_reports/03_06/phase_A_intelligence_wiring_spec.md`).
- It can proceed in parallel with the rest of the monorepo move.

---

## 7. Pending actions

**Yours (human-only):**
1. 🔑 **Rotate the `.env.test` secrets** (Anthropic key + others were in the public repo — assume compromised).
2. 🗄️ **Make the Neon `ep-plain-breeze` branch persistent** — autodeletes ~Jun 10, else the pg suite breaks.
3. ✅ **Merge PR #4** after this review.

**Mine — awaiting your OK (cleanups):**
- Delete the stale `server/` leftover (untracked `server/data/`).
- Run the **incremental** code-review-graph update (re-point to `apps/api`).
- Clean the stray `apps/api/src/.claude/settings.local.json`.

**Next phases (your steer):** intelligence Phase A (start now?) · Bucket H Phase 3 (web) · RH-1 build (or keep as spec).

---

## 8. Open follow-ups (tracked, not blocking)
- `.devcontainer/` still has `server/` paths + stale-SQLite config → dedicated verified cleanup.
- Dockerfile still installs the stale better-sqlite3 toolchain (`python3 make g++`) — build works; remove in a verified pass.
- `worktree-sow-audit-report` branch + its worktree — remove when convenient.
- Decision parked for Phase 5: the 4 ai-service integration questions (DB ownership, agent source-of-truth, Typesense provisioning, what/where the service is).
