# Intelligence Layer — Activation Map & Plan (2026-06-03)

> Read-only audit of what intelligence functionality is **built**, what is **live**, and what is **dormant** — plus a concrete, sequenced **activation plan**. Cross-validated by 3 independent mapping passes (execution/triggers, dormant modules, intelligence hubs).

---

## THE HEADLINE

**Cosmisk's entire "evidence → worldview synthesis → THE ONE THING → client card" intelligence architecture exists as complete, working code — but it is disconnected at a single seam.**

That seam is **`services/intelligence-integration.ts`**, whose 5 bridge functions are deliberate **no-ops** (return `[]` / `''` / passthrough). Its own header says the strategic-cognition cluster "is [not] wired up." Live agents (ad-watchdog, report-agent) already CALL this bridge — and silently receive nothing. Wiring this one seam is the highest-leverage move in the entire codebase.

The "dead code" we declined to delete is, almost entirely, **this built-but-unwired intelligence layer.** Confirms the "zero loss" call was correct.

---

## WHAT'S ACTUALLY LIVE TODAY

**Autonomous (cron-driven):**
- **Watchdog** — every 6h (`routes/agent.ts:33`, `startAgentCrons`). Orchestrates: oos-detector, discount-leakage-detector, cohort-ltv-analyzer, comment-mining-agent, strategic-intelligence-engine (conditional on comment data), visual-analyzer, creative-analysis. → writes recommendations/predictions to Postgres via `intelligence-persistence`.
- **Autopilot** — every 4h (`routes/autopilot.ts:22`). Self-contained, inline fatigue heuristic (does NOT call fatigue-detector service).
- **Audit-agent** — per-brand cron, **only if `scheduled_audits` table has enabled rows** (`audit-scheduler.ts`). Runs `runCreativeAudit` only — no catalog agents.
- **Support crons** (agent.ts): morning-briefing, outcome-checker (Mon), memory-decay (Sun), report-agent (Tue), content-agent (Wed), sales-agent (Thu), meta-warmup (2h).

**Route-triggered only (no autonomy):**
- creative-scorer (`/creative-studio`), fatigue-detector (`/ad-command`), audits (`/audits`).

**Live HTTP surface:** `routes/intelligence.ts` (mounted no-prefix at `index.ts:215`) reads `intelligence-persistence` → ~14 endpoints. **This is the only genuinely-wired intelligence flow:** *watchdog writes to Postgres → routes/intelligence.ts reads back.*

---

## THE DORMANT ISLAND (built, complete, zero entry points)

```
elite-intelligence/generateEliteIntelligence  →  THE ONE THING / EliteIntelligenceOutput  →  (nobody)
strategic-cognition cluster:
  recursive-investigator → causal-intelligence / competing-hypotheses / strategic-curiosity
                         → narrative-synthesis (WorldviewModel) → client-report-generator  →  (nobody)
quality-governance → intelligence-layer (evaluateEliteQuality) → quality-gated-runner  →  (nobody)
intelligence-infrastructure (reasoning traces + vector-ready pattern store)  →  (nobody)
```

> Note: the project-doc claims "quality governance wired into ad-watchdog" and "evidence providers feeding worldview synthesis" describe the **design**, not the current wiring. In code, ad-watchdog only touches the no-op `intelligence-integration` bridge.

---

## DORMANT MODULE INVENTORY (tiered by activation effort × value)

### Tier 1 — Complete, low-effort, high-value (all deps already live)
| Module | Activation | Value |
|---|---|---|
| **prediction-verifier.ts** | Add `verifyAllClientsPredictions()` to `audit-scheduler` as a daily cron | Closes the prediction→reality loop (self-improvement signal) |
| **quality-gated-runner.ts** | Swap in at the watchdog/audit call site (replaces plain `runAllAgents`) | Enforces "NO MEDIOCRE OUTPUTS" architecture rule |
| **multi-account-aggregator.ts** / **multi-region-aggregator.ts** | Add a route or scheduler step | Cross-account / cross-region rollups |

### Tier 2 — Complete, need an upstream feeder built (medium effort)
| Module | Missing piece |
|---|---|
| **creative-opportunity-engine.ts** | Signal adapters (fatigue + comment + competitor) feeding `generateOpportunityQueue` |
| **organic-paid-intelligence.ts** | Content-ingestion adapter (IG/TikTok/YT comments + features). *Registry stale-claims it "wired" — it is dormant.* |
| **client-report-generator.ts** | An upstream strategic-cognition run + delivery (WhatsApp/HTML) — matches wiki's pending "WhatsApp delivery" / "THE ONE THING formatter" |
| **ad-engine** (`strategy.ts` → `gemini-generator.ts`) | A route/autopilot step. **⚠ gemini-generator calls Google API directly — bypasses llmGateway (billing risk).** Activate as a unit, after gateway routing. |

### Tier 3 — Framework complete but runtime-empty
| Module | Issue |
|---|---|
| **agent-orchestrator.ts** | `AGENT_REGISTRY` starts empty; nothing calls `registerAgent()`. Needs concrete `ExecutingAgent` impls + `initializeOrchestrator()` at boot. |

### Tier 4 — NOT built (registry is aspirational; these are build tasks, not wiring)
- `health-score`, `quick-wins` → route stubs returning `status:'stubbed'`; **no service file**.
- `brand-persona-intelligence`, `creative-analyzer`, `agent-chains` → **no files exist at all**. `agent-chains` is likely a stale alias for the real `agent-orchestrator.ts`.

---

## THE ACTIVATION SEAMS (where to plug in)
1. **`intelligence-integration.ts` — THE seam.** Replace its 5 no-op functions (`watchdogSnapshotToSignals`, `buildStrategicPromptSection`, `enhanceWatchdogDecisions`, `reportDataToSignals`, `enhanceReportOutput`) with real calls into `signal-discovery` + `strategic-cognition` + `quality-governance`. Already sits live between agents and the dormant core.
2. **`signal-discovery/index.ts`** — the canonical Signal contract the strategic-cognition cluster consumes; where aggregators/evidence-providers should emit.
3. **`routes/intelligence.ts`** — the live HTTP surface to deliver `EliteIntelligenceOutput` / `WorldviewModel` / client-report output (it already owns `persistence`).
4. **`intelligence-infrastructure.ts`** — attach point for prediction-verifier + embeddings/vector (typed `Evidence`/trace abstractions waiting).
5. **`quality-gated-runner.ts`** — intended wrapper to gate any agent output via `evaluateEliteQuality`; needs a caller (watchdog/report-agent).

---

## ARCHITECTURE FLAGS TO RESOLVE (before activating)
- **`ad-engine/gemini-generator.ts`** calls `generativelanguage.googleapis.com` directly via `fetch` (`:182,:233,:251`) — violates CLAUDE.md "NO DIRECT LLM CALLS — llmGateway only" + billing-risk concern. Route through llmGateway first.
- **`build-gate.ts`** has a dead `@anthropic-ai/sdk` import (unused; latent rule violation).
- **`agent-registry.ts`** is stale: marks `organic-paid-intelligence` "already wired" (it's dormant); the "to wire" block (`:313-318`) points at 3 non-existent files.

---

## PROPOSED ACTIVATION SEQUENCE

**Phase A — Reconnect the spine (highest leverage).** Wire `intelligence-integration.ts`'s no-op bridge to the strategic-cognition cluster + quality-governance, so the watchdog's already-collected signals flow into worldview synthesis → THE ONE THING. Deliver the output via `routes/intelligence.ts`. *This lights up the elite-intelligence + strategic-cognition + quality-governance islands at once, through code that already exists.*

**Phase B — Close the loop.** Activate `prediction-verifier` (daily cron) + swap `quality-gated-runner` in at the watchdog call site. Self-improvement + mediocrity gate go live with minimal new code.

**Phase C — Delivery.** Wire `client-report-generator` → WhatsApp/HTML (the wiki's pending "WhatsApp delivery" + "THE ONE THING formatter"). Now THE ONE THING reaches the founder.

**Phase D — Breadth (optional).** Aggregators (multi-account/region), creative-opportunity-engine, organic-paid-intelligence — each needs a feeder/route. Lower priority.

**Phase E — Cleanup the catalog.** Fix `agent-registry` (stale claims + phantom entries), decide health-score/quick-wins (build vs drop the stubs), route gemini-generator through llmGateway.

> Each phase is independently shippable and behavior-additive (turns on dormant code; doesn't change live behavior until wired). Verify with the same invariant + a per-phase smoke that the new path produces output end-to-end.

---

## NOTE ON CODE FREEZE / BRANCH
This activation is **net-new wiring** (behavioral), distinct from the structural refactor. It belongs on its own branch and should be sequenced against the code-freeze + dev-team coordination. Decide go/timing before starting Phase A.
