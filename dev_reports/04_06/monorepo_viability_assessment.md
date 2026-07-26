# Monorepo Structure — Viability Assessment (Gravity pattern → Cosmisk)

**Date:** 2026-06-04 · **Branch:** `monorepo-restructure` · **Method:** multi-agent ground-truth verification (5 facts) + PM judge-panel (4 lenses) + adversarial critique. All claims verified against the repo; critique corrections folded in.
**Trigger:** "big change in plans" — re-evaluate whether the Gravity-style monorepo PM structure fits Cosmisk before committing the repo to it. PR #4 (Bucket H Phase 1-2) **closed** pending this.

---

## 1. Bottom line

**Adopt the Gravity *shape*; reject the Gravity *apparatus*.** That distinction is the whole decision.

- **Shape (ADOPT):** a two-app, organize-by-deployable-unit tree — `apps/web` (Angular→Vercel), `apps/api` (Fastify→Railway, already done on this branch) — plus an empty `packages/types` slot. Real, cheap, fully reversible navigability win.
- **Apparatus (DEFER/SKIP):** pnpm/npm workspaces manifest, Turborepo, path-filtered per-service CI via Turbo, GHCR images + GitHub Releases, `apps/ai-service`, and `apps/worker` as a monorepo unit.

**Judge-panel score for adopting the FULL structure now: 3/10 (consensus 3,3,3,4).** Score for the right-sized 2-app subset: **adopt.**

Gravity's load-bearing justification — *"organize by deployable unit **because** 3 polyglot services ship independently"* — **does not hold for Cosmisk**: 2 homogeneous TypeScript units on one npm graph, one monolithic Docker image, a 5-person team with a single 54% contributor and no per-service owners. The full stack would tax daily velocity to be ready for services that don't exist, while the actual product priority — activating the dormant in-process TS intelligence layer (Phase A, `services/intelligence-integration.ts`) — is **explicitly not blocked by any of it** (`MERGE_REVIEW.md §6`).

## 2. The pivot — the 4-app case rests on a service that doesn't exist

The team's own assessment names the Python `apps/ai-service` as *"the single biggest reason to target the monorepo shape"* (`monorepo_restructure_assessment.md:26`). **Verified SPECULATIVE (high confidence):**

- No `apps/ai-service/` (only `apps/api/`). No `pyproject.toml` / `uv.lock` / `.python-version` anywhere.
- The only Python is 3 throwaway scrapers (`scripts/{scrape,crawl-free,ad-intel}.py`) — not a service.
- The intelligence layer is **100% in-process TypeScript**; Phase A wires it with zero Python.
- The team's docs admit ignorance: `bucket_H_monorepo_plan.md` lists *"What is the Python ai-service, exactly, and where does it live now?"* as an **Open Question**; `MERGE_REVIEW.md:143` parks the 4 ai-service questions to "Phase 5." Language is uniformly "IF/when," "graduate to."

**Recalculated real unit count: 2** (soon 3 *if* you count a cron worker — a TS process, not the speculative Python service). Remove the ai-service from the premise and **~90% of the apparatus's value collapses**; what remains is one concrete win: getting Angular out of the junk-drawer root.

## 3. Adopt now / Defer / Skip — every Gravity practice, judged

| Gravity practice | Cosmisk action | Grounding |
|---|---|---|
| Organize by deployable unit (`apps/`) | **ADOPT (2 units)** | `apps/api` landed; move Angular root→`apps/web`. Real win: FE source + ~18 root configs tangled with backend, scrapers, `e2e/`, `mcp-servers/`, `analysis/`, docs, wiki, dev_reports |
| `apps/web` move | **ADOPT — single atomic, fully-gated PR** | ~25 mechanical path edits across `vercel.json`, `Dockerfile`, `angular.json`, `ci.yml`, `tsconfig.app.json`, `docker-compose`, `package.json`. High reversibility (`git revert`). **See §4 caveat (the no-workspaces tension).** |
| `packages/types` shared Zod | **ADOPT slot, DEFER population** | Empty by design (`export {}`). Duplication is only ~5-8 stable interfaces (CreativeScore/ScoreDimension, AiChatResponse, UGC). Populate at Phase 6 once Phase A reveals the real end-to-end contract (THE ONE THING / client cards) |
| Per-service VERSION + semver | **ADOPT (lightweight, do now)** | Real incoherence: root `0.0.0`, `apps/api` `1.0.0`, `/health` reports `'2026-03-29.2'` (`apps/api/src/boot/public-routes.ts:20`). Deploy-tool-agnostic; near-zero cost. **Pick a scheme — see §6.** |
| Path-filtered CI | **ADOPT cheap version (GH Actions `paths:`), NOT Turbo** | All jobs run on every PR; Angular builds **2× per CI run** (`ci.yml:20` frontend + `ci.yml:45` smoke) **+ 1× in Docker** (`Dockerfile:14`). **Footgun: `paths:` on required checks can block merges — see §6.** |
| Separate runtime for heavy crons | **ADOPT operationally — NOT as a monorepo unit** | Real problem (RH-2): watchdog/autopilot/Meta-warmup `await`ed on the shared API event loop (`routes/agent.ts`, `autopilot.ts`, `automations.ts`). Solve via a 2nd Railway process from the same codebase. **Not pure infra — see §4.** |
| pnpm/npm workspaces manifest | **DEFER** | No `pnpm-workspace.yaml`, no `workspaces` field; plain npm. No shared-dependency payoff at 2 units; changes lockfile + install across 3 deploy targets |
| Turborepo install + caching | **DEFER** | `turbo.json` inert; turbo not in deps (`npm ci` won't install it). Caching buys nothing for 2 TS units on one graph; adds CI + local-dev friction |
| `apps/ai-service` (FastAPI/uv) | **SKIP building; reserve in *planning docs only*** | Speculative (§2). Zero references in any committed config (delete the leaked one, §6) |
| `apps/worker` as monorepo artifact | **SKIP as monorepo unit** | Solve via Railway process; fold into the tree only once it stabilizes |
| Per-service GHCR + GitHub Releases | **SKIP** | Railway builds its own image from `Dockerfile`; Vercel owns its artifacts. GHCR is a registry no deploy target consumes |
| `infra/` AWS-ECS task defs | **SKIP entirely** | Zero ECS surface. Railway + Vercel + Docker/nginx. Pure Gravity noise |
| Fix leaked Gravity cruft | **ADOPT (immediate)** | `turbo.json:3` names "the Python `apps/ai-service` builds/tests via uv" — a phantom service. Active footgun |
| Remove shadow artifact | **ADOPT (needs elevated perms)** | Empty root-owned `server/data/` shadows `apps/api` post-move. **`root`-owned → needs `sudo`, not a plain `rm`** |

## 4. The right-sized target structure

```
Cosmisk/
├── apps/
│   ├── web/          # Angular 17 → Vercel  (move from root: src/, angular.json,
│   │                 #   tailwind.config.js, tsconfig.app.json, proxy.conf.json, VERSION)
│   └── api/          # Fastify/Node TS → Railway  (LANDED on branch; + VERSION)
├── packages/
│   └── types/        # empty slot — populate at Phase 6 (intelligence outputs first)
├── scripts/          # throwaway *.py scrapers (stay; not a service)
├── Dockerfile, nginx.conf, railway.toml, vercel.json   # deploy configs, path-rewritten
└── package-lock.json # plain npm — NO pnpm-workspace.yaml, NO workspaces field
```

**Explicitly absent:** Turborepo, workspaces manifest, path-filtered-Turbo CI, GHCR, `infra/`, `apps/ai-service`, `apps/worker`.

**Two caveats the move surfaces (do not gloss):**

1. **`apps/web` move vs. deferred-workspaces tension.** With no `workspaces` field, the root `package.json`/`node_modules`/lockfile stay at root and `angular.json` points *down* into `apps/web/src`. That means **`apps/web` is not fully self-contained** (its dependency manifest lives two levels up) — asymmetric with `apps/api`, which has its own `package.json`. Accept this asymmetry for now; giving `apps/web` its own manifest **is** the workspaces decision, which we're deferring. The "self-describing tree" benefit is therefore partial for `web` until workspaces is justified. (This is the honest cost behind the "~25 mechanical lines" framing.)

2. **The cron worker is a code change, not just infra.** A 2nd Railway process from the same image needs the `IS_WORKER_MODE` gate threaded through **every** `cron.schedule` call-site (API mode must *not* register crons; worker mode registers only them), **and** the existing `0 */4 * * *` collision between `autopilot.ts:22` and `automations.ts:533` resolved — otherwise you double-register. That edit lives inside `apps/api` and is gated by the **Test Invariant**.

## 5. Sequencing (vs. intelligence activation, the freeze, and PR #4)

Bucket H and the product priority are **independent** — don't let infra crowd out the brain.

1. **PR #4 / the `apps/api` move:** the commits (`a9b96ed` H2, `0421a89` H1) are the **HEAD of `monorepo-restructure`** and validated green (tsc baseline-only, vitest 400/9, pg 388/10, madge 0 cycles, docker OK, `/health` 200, risk 0.00). The **GitHub PR to `main` is now closed** per the confidence pause. **Disposition: keep these commits; do NOT revert.** When confidence returns, re-land *just the `apps/api` half* to `main` as-is — it's the safe, fully-validated slice.
2. **Immediate, low-cost (but run the suites — not all gate-free):** delete the leaked `turbo.json:3` ai-service comment; add per-service `VERSION` files + a coherent version scheme (§6); add cheap GH-Actions `paths:` guards (mind branch protection, §6). Removing `server/data/` needs elevated perms.
3. **Parallel — the actual priority (unblocked by all monorepo work):** Phase A intelligence activation (`intelligence-integration.ts` → strategic-cognition + quality-governance). Honor the Test Invariant; don't commit `CLAUDE.md` / `.env.test`.
4. **Operational, ~1-2 days:** extract heavy crons to a 2nd Railway process (`IS_WORKER_MODE` + collision fix, §4.2).
5. **Then, one disciplined PR (the PR #4 pattern):** move Angular root→`apps/web`, with local + staging gates across all three deploy paths before merge.
6. **Only later, gated on real signals:** populate `packages/types` (Phase 6); consider workspaces/Turbo/per-service release automation **only if** a genuine 3rd independently-deployable unit + per-service ownership actually materialize.

**Freeze:** the public CLAUDE.md freeze guards external contributors; this is the local active-dev maintainer copy where server changes are allowed on dedicated branches. The freeze doesn't block this; the Test Invariant does.

## 6. Decisions the plan must stop hand-waving

- **Version scheme (pick now):** per-service **semver** in each `apps/*/VERSION`; derive `/health.version` from the file at build time; **delete the hardcoded `'2026-03-29.2'`** in `apps/api/src/boot/public-routes.ts:20`. Note: changing the `/health` body may trip a smoke/boot test — run default + pg suites, don't treat as free.
- **`paths:` CI filter footgun:** GitHub branch-protection *required* checks + a `paths:`-skipped job = an unmergeable "pending" PR. Today `smoke-test needs:[frontend]` and `docker needs:[backend]` already form a DAG. Apply `paths:` with an always-green sentinel job or `paths-ignore` discipline, and reconcile with required-checks config — it's one line of YAML but a real trap.

## 7. Anti-patterns already visible in the repo (fix regardless of the structure call)

- **Cargo-culted Gravity comment in committed config** — `turbo.json:3` describes a phantom Python service. Will mislead the next maintainer. Fix/delete now.
- **Version incoherence** — root `0.0.0` vs `apps/api` `1.0.0` vs `/health` date-string. No coherent artifact identity across the Railway image and Vercel build.
- **Inert tooling masquerading as wired** — `turbo.json` present but turbo isn't a dependency; no workspaces. Keep as a cheap slot, but document it as INERT or someone will "finish" it prematurely.
- **Speculative slots presented as roadmap** — the "4-app plan (web/api/worker/ai-service)" treats the ai-service as "incoming" when it's an unanswered Open Question. Risk = **structure-theater**: burning a small team's velocity on inert infra for services that may never exist, while the only product-value lever (the dormant intelligence layer) waits.
- **Leftover `server/data/` shadow** — empty, root-owned, muddies the self-describing tree.

---

### One line
*A well-chosen **shape** (organize by deployable unit) wrapped around a **stack and apparatus** borrowed from a bigger, polyglot product. Take the two-app shape and the cheap wins (versioning, `packages/types` slot, a Railway worker process); leave Turborepo, workspaces, GHCR, ECS, and the Python `apps/ai-service` on the shelf until a third real service and per-service ownership actually arrive.*
