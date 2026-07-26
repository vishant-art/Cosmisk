# Two-Engineer Parallel Plan — Developer + Intelligence (with crossover)

**Date:** 2026-06-04 · **Base:** `main` ← `monorepo-restructure` @ `a9b96ed` · **Status:** PLAN — awaiting go.
**Team:** **E-Dev** (platform/product: frontend + API plumbing + infra) · **E-Intel** (the dormant intelligence brain → activation). **Some crossover expected** — so the model is *clear primary ownership + a typed contract at the seam*, not hard walls.
**Goal:** both engineers work in parallel (mostly inside `apps/api`) without breaking each other or the system.

---

## 0. Two integrity keystones

- **K1 — moves change zero source imports.** Frontend/back are 100% relative imports, no path-aliases, no cross-app imports (verified). Any directory move is behavior-preserving (the `apps/api` move proved it, risk 0.00).
- **K2 — the seam is already the typed boundary.** `services/intelligence-integration.ts` exposes **5 functions with frozen signatures** (`watchdogSnapshotToSignals`, `buildStrategicPromptSection`, `enhanceWatchdogDecisions`, `reportDataToSignals`, `enhanceReportOutput`) + the boundary types `Signal`, `WatchdogDecisionLike`, `EnhancedReportOutput`. Callers (`ad-watchdog/reasoning.ts:9`, `report-agent.ts:26`) already depend on them; Phase A fills in the bodies with **no call-site changes**. **This contract is what lets two engineers edit the same `apps/api` concurrently — `tsc` fails any breaking change at the other side before merge.**

---

## 1. The real split + the seam (centerpiece)

| Zone | Owner | Files (primary) |
|---|---|---|
| **Intelligence brain** | **E-Intel** | `apps/api/src/services/{strategic-cognition/ (13), elite-intelligence/ (6), intelligence-layer/ (5), quality-governance/ (4), signal-discovery/ (1)}` + flat `intelligence-infrastructure.ts`, `intelligence-persistence.ts`, `recommendation-loop.ts`; **the seam BODIES** (`intelligence-integration.ts` impl); the data behind `routes/intelligence.ts` |
| **Platform / product** | **E-Dev** | `apps/web/**` (frontend), `apps/api/src/{routes/ (HTTP shells), boot/, db/, plugins/, validation/, utils/}`, live-agent **call sites** (`ad-watchdog/*` orchestration, `report-agent.ts`), `llm-gateway`, the **worker** extraction, deploy/CI/infra |
| **Crossover (shared — typed contract + review rule)** | **both** | the seam **signatures** + `packages/types` (the contract), `routes/intelligence.ts` (shell vs data), `intelligence-persistence.ts` + `pg-schema` (DDL), `llm-gateway` API, the watchdog cron entrypoint |

### Crossover rules (so "some crossover" stays safe)
1. **Seam signatures = frozen & jointly owned.** E-Intel implements the bodies; E-Dev owns the callers. A signature change is a deliberate, both-review event — enforced by the contract living in `packages/types` (below). Today's Phase A needs **zero** signature changes.
2. **`routes/intelligence.ts` = E-Dev owns the route shell + auth + persistence wiring; E-Intel provides the typed payload** (a `@cosmisk/types` DTO). Split by handler, not by line.
3. **DB: E-Dev owns DDL/migrations; E-Intel requests schema** (recommendations/predictions/worldview) via a 2-line spec, then reads/writes through `intelligence-persistence`. (Same ownership model as DB-2.)
4. **`llm-gateway`: E-Dev owns; E-Intel consumes via `createMessage` only** (architecture rule — no direct LLM calls). Stable API.
5. **Worker: E-Dev builds the process; E-Intel's watchdog→brain loop runs inside it.** Different files (cron registration vs seam bodies); the watchdog call site stays frozen.

---

## 2. Import / path update plan

### 2a. Source code — **zero changes** (K1). Directory moves only.

### 2b. ★ The high-value change for THIS team — lift the seam contract into `packages/types`
This is the parallelization enabler (more so than any move). Cheap, zero-infra, zero-runtime-risk:

| Step | Action |
|---|---|
| Create `packages/types/src/intelligence.ts` | move the **boundary** interfaces from the seam: `Signal`, `WatchdogDecisionLike`, `EnhancedReportOutput`; add the **delivery DTOs** `routes/intelligence.ts` will return (e.g. `WorldviewSummary`, `TheOneThing`) |
| `intelligence-integration.ts` | `import type` them from `@cosmisk/types` and **re-export** → existing importers (`reasoning.ts`, `report-agent.ts`) unchanged (zero churn) |
| `apps/api/tsconfig` | add `baseUrl` + `"paths": { "@cosmisk/types": ["../../packages/types/src/index.ts"] }` |
| Consumption rule | **`import type`** only (interfaces are compile-time; `tsc`/`tsx` erase them → **no npm-workspaces, no runtime resolution needed**). Keep cluster-*internal* types (`WorldviewModel`, `EliteIntelligenceOutput`, `ExplainableQualityReport`) inside the Intelligence zone; only **boundary + delivery** types go to `@cosmisk/types`. |
| Note | there are already two `Signal`s (seam's flat `Signal` vs `elite-intelligence/types.ts Signal<T>`) and two `EliteIntelligenceOutput`s — **do not merge them**; the boundary type is the seam's `Signal`. |

> This makes `packages/types` real *now* (revises the earlier "defer to Phase 6"): for a Developer+Intelligence split the seam contract **is** the coordination artifact, and as type-only it costs nothing at runtime.

### 2c. `apps/web` move — **downgraded** for this pair (config-only edits; do when convenient)
Neither engineer is FE-dedicated, so the web move's value here is *declutter + deploy clarity*, not parallel isolation. Kept for reference; full config edit list (source = zero):
`angular.json` (repoint project root→`apps/web`, stays at root) · move `src/`, `tailwind.config.js`, `proxy.conf.json`, `tsconfig.{json,app,spec}` → `apps/web/` · `vercel.json` (Vercel **Root Directory** is a dashboard step — verify on preview) · `Dockerfile` frontend stage paths · `ci.yml` frontend jobs · `docker-compose` stale `server/data`→`data` fix. Each reversible (`git revert`).

### 2d. Zod *runtime* schemas (future) — deferred
When shared runtime validation is wanted, those are runtime values (not erasable) → that's when the npm-workspaces decision returns. Not now.

---

## 3. The parallel workflow

**Rule:** structural/contract PRs merge in sequence; each independently green; trailing PRs rebase. E-Intel is **never blocked** — the brain lives in dirs the moves don't touch.

### Phase 0 — Foundation (small, fast; unblocks parallel) 
| PR | Owner | Scope | Gate |
|---|---|---|---|
| **A. Re-land api move** | E-Dev | reopen + merge PR #4 (`apps/api` + scaffold) → `main` | full CI (already green) |
| **B. ★ Seam contract → `packages/types`** | both (E-Intel leads types, E-Dev adds tsconfig alias) | §2b | tsc baseline + default 400/9 (re-export = no behavior change) |
| **C. Versioning + hygiene** | E-Dev | `apps/*/VERSION`, `/health` from VERSION (`boot/public-routes.ts:20`), delete leaked `turbo.json:3` comment, fix `docker-compose` path | default 400/9 + pg 388/10 + tsc + madge |

### Phase 1 — Parallel lanes (the planned workload — runs concurrently after Phase 0)
- **E-Intel — Phase A activation** (own zone + seam bodies): implement the 5 seam functions via `signal-discovery` → `strategic-cognition` (`investigateRootCause`, `synthesizeNarrative`) → `quality-governance` gate → deliver THE ONE THING via `routes/intelligence.ts` + persist. Acceptance per `phase_A_intelligence_wiring_spec.md` §3. **No call-site edits.**
- **E-Dev — platform**: worker extraction (`IS_WORKER_MODE` + fix `0 */4` collision + Railway service); `apps/web` move + per-app CI/Dockerfile split (when convenient); FE/API features.
- **Coordinated, small:** schema requests (E-Intel→E-Dev), `routes/intelligence.ts` handler split, any new `@cosmisk/types` DTOs.

```
Phase 0 (sequence):  A ─► B(contract) ─► C
                              │
Phase 1 (parallel):          ├── E-Intel: Phase A (clusters + seam bodies + delivery)   ┐
                              └── E-Dev:   worker → web move/CI split → features         ┘  meet only at the typed seam
```

---

## 4. Integrity gates (every PR)
1. **Test Invariant:** default **400/9**, pg **388/10**, `tsc` baseline-only (`billing.ts:4`), `madge` **0 cycles**.
2. **Crossover guardrail:** the `@cosmisk/types` seam contract — a breaking I/O change fails `tsc` at the other lane *before* merge. This is the core protection for concurrent `apps/api` edits.
3. **Phase A acceptance (E-Intel):** non-empty `strategicSection` in a watchdog smoke; ≥1 decision filtered by the quality gate; a `routes/intelligence.ts` endpoint returns THE ONE THING; **all LLM via `createMessage`** (no direct calls); new behavior = new tests (additive).
4. **Deploy verify** for config PRs (web move, worker): Vercel preview + Docker build + boot smoke (catches out-of-repo Vercel/Railway dashboard settings).
5. One concern per PR; serialized structural merges; rebase trailing PRs; don't commit `CLAUDE.md`/`.env.test`.

---

## 5. Risk register (crossover-focused)
| Risk | Sev | Mitigation |
|---|---|---|
| Seam **signature drift** breaks the other lane | **High→Low** | contract in `@cosmisk/types`; signatures frozen; `tsc` catches at both sides pre-merge; Phase A needs none |
| `routes/intelligence.ts` **double-touch** | Med | E-Dev owns shell, E-Intel owns payload (typed DTO); split by handler |
| DB **schema contention** (Intel needs tables, Dev owns DDL) | Med | Dev owns migrations; Intel requests via 2-line spec; read/write through `intelligence-persistence` |
| Watchdog **crossover** (worker move vs seam activation) | Low | different files; the `reasoning.ts` call site is frozen |
| Intel makes a **direct LLM call** (bypasses gateway) | Med | gate: grep for non-`createMessage` Anthropic/Gemini calls in the cluster; architecture rule |
| Worker **double-registers** crons / `0 */4` collision | Med | `IS_WORKER_MODE` at every `cron.schedule`; env-flag rollback |
| Vercel/Railway **dashboard** settings (web move) | Med | preview-deploy gate; lower priority now (web move downgraded) |
| Neon `ep-plain-breeze` test branch auto-deletes ~Jun 10 | Med | make persistent before relying on the pg gate |

---

## 6. Go / no-go
1. **Lane split confirmed:** E-Dev = platform/product, E-Intel = intelligence, crossover at the seam? (or adjust)
2. **Contract-first (PR-B): lift the seam types to `packages/types` now** (type-only, zero-infra) — approve? *(recommended — it's the parallelization enabler)*
3. **Start Phase A immediately** (E-Intel) in parallel with E-Dev's Phase 0/worker? *(recommended — Phase A is the product priority and unblocked)*
4. **`apps/web` move:** schedule it (E-Dev, when convenient) or defer? *(low parallel-value for this pair)*
5. **Workspaces:** skip (not needed for type-only contract) — confirm? Revisit only if Zod runtime schemas are shared.
6. **Neon test branch** made persistent?

> On go: **A** (re-land api) → **B** (seam contract to `packages/types`) → then **E-Intel starts Phase A** while **E-Dev does C + worker** — parallel from that point, meeting only at the typed seam.
