# Phase A — Intelligence Spine Reconnection: Implementation Spec

> **Audience:** the AI engineer who will wire this. **Goal:** turn the dormant intelligence brain ON by replacing the no-op `intelligence-integration.ts` bridge with real calls into the (already-built) strategic-cognition + quality-governance clusters, and deliver the output. **Behavior-additive** — the live watchdog/report paths keep working; this fills in what they already try to call.
> Context: see `intelligence_layer_activation_map.md` (the full audit). Memory: `[[intelligence-layer-state]]`.

---

## 0. The one-paragraph problem
`services/intelligence-integration.ts` is the connective tissue between live agents (ad-watchdog, report-agent) and the strategic core. All 5 of its functions are deliberate no-ops. The watchdog already calls `watchdogSnapshotToSignals(snapshot)` then `buildStrategicPromptSection(clientId, signals)` and injects the result as `strategicSection` into its LLM prompt (`ad-watchdog/reasoning.ts:40-41,54`) — but gets `''`. Report-agent calls `reportDataToSignals` + `enhanceReportOutput` (`report-agent.ts:215-216`) — passthrough. **Implement these 5 functions for real and the whole pipeline lights up, no call-site changes required.**

---

## 1. Exact contracts to implement (in `services/intelligence-integration.ts`)

The signatures must stay identical (callers already depend on them):

### 1a. `watchdogSnapshotToSignals(snapshot: unknown): Signal[]`
Map the watchdog `snapshot` (shape at `ad-watchdog/reasoning.ts:57-66`: `accountName/accountId`, `week`/`month` `{spend,roas,cpa,ctr,conversions}`, `dailyRoas:number[]`, `campaigns[]{name,spend,roas,cpa,ctr,conversions,roasTrend,cpaTrend,ctrTrend,confidence}`) into `Signal[]` (`{source,kind,value,context}`). One signal per meaningful metric/trend (e.g. `{source:'meta', kind:'roas_trend_30d', value:<slope>, context:{daily:dailyRoas}}`, per-campaign anomaly signals, etc.). Pure function, no I/O.

### 1b. `buildStrategicPromptSection(clientId, signals): Promise<string>`  ← **the spine**
This is where the dormant cluster gets invoked. Pipeline:
1. **(Optional) enrich signals** via `signal-discovery` — `createSignalDiscovery()` (`signal-discovery/index.ts:125`) + `SignalDiscoveryService` (`:83`). Maps watchdog signals into the cluster's canonical `SignalResult`/`SignalQuery` contract (`:57`,`:68`).
2. **Run strategic cognition.** Call `investigateRootCause(...)` (`strategic-cognition/recursive-investigator.ts:583`) to get root-cause investigation, then `synthesizeNarrative(...)` (`strategic-cognition/narrative-synthesis/synthesizer.ts:985`) to build the `WorldviewModel` → strategic imperatives. (Causal/hypotheses/curiosity modules feed in per the cluster's internal contract.)
3. **Return a prompt section string** summarizing the worldview + top strategic imperative(s), formatted to inject at `reasoning.ts:54`. Keep it bounded (~300-600 tokens) so it doesn't blow the watchdog prompt budget.
4. **Resilience:** the call site already wraps in try/catch (`reasoning.ts:42`); still, internally guard each cluster call so a cluster failure degrades to `''` (never breaks the live watchdog).

### 1c. `enhanceWatchdogDecisions(decisions, clientId, signals): Promise<T[]>`
Run each `WatchdogDecisionLike` through the **quality gate** before returning. Use `evaluateQuality(output)` (`quality-governance/quality-scorer.ts:681`) or the explainable v2 `evaluateExplainableQuality(input)` (`explainable-quality-engine.ts:788`); drop/flag decisions that fail the mediocrity bar (the "NO MEDIOCRE OUTPUTS" rule). Preserve the array contract (return same `T[]` type, just filtered/annotated).

### 1d. `reportDataToSignals(reportData): Signal[]` + 1e. `enhanceReportOutput(...)`
Symmetric to 1a/1c for the weekly report-agent path. `enhanceReportOutput` should run `input.{strategicAnalysis,keyInsights,recommendations}` through the same quality gate and set `qualityCheck.genericInsightsFiltered` to the real count removed.

---

## 2. Delivery (so output reaches a human, not a dead-end)
Wire the strategic output to the live HTTP surface **`routes/intelligence.ts`** (already mounted no-prefix at `index.ts:215`, already owns `persistence`). Add endpoints to expose:
- the latest `WorldviewModel` / strategic imperatives per client,
- THE ONE THING (`elite-intelligence/generateEliteIntelligence` at `elite-intelligence/index.ts:389`, or the strategic-cognition `EliteIntelligenceOutput` from `elite-decision-compression`).
Persist via the existing `intelligence-persistence` layer so it survives restarts and the watchdog/report writes and the API reads share one store.

---

## 3. Acceptance criteria
- Watchdog run produces a **non-empty** `strategicSection` (assert in a smoke test: run watchdog for a seeded client, confirm the prompt contains worldview text).
- At least one decision is filtered/annotated by the quality gate on a deliberately-mediocre input.
- A new `routes/intelligence.ts` endpoint returns the worldview/THE ONE THING for a client.
- **Invariant preserved:** existing default suite still 400/9, pg 388/10, tsc baseline-only, madge 0 cycles. New behavior covered by new tests (additive).
- No direct LLM calls introduced — all model calls go through `llmGateway` (`createMessage`). (The strategic-cognition cluster must already comply; verify.)

---

## 4. Out of scope for Phase A (later phases)
- `prediction-verifier` cron, `quality-gated-runner` swap (Phase B).
- `client-report-generator` → WhatsApp/HTML delivery (Phase C).
- Aggregators / creative-opportunity-engine / organic-paid-intelligence feeders (Phase D).
- `agent-registry` cleanup + `gemini-generator` gateway-routing + health-score/quick-wins build decision (Phase E / Runtime Hardening).

---

## 5. Key file references
| Purpose | File:line |
|---|---|
| The seam to implement | `services/intelligence-integration.ts` (all 5 fns) |
| Live watchdog call site | `services/ad-watchdog/reasoning.ts:40-41,54` |
| Live report call site | `services/report-agent.ts:215-216` |
| Signal contract | `services/signal-discovery/index.ts:57,68,83,125` |
| Root-cause investigation | `services/strategic-cognition/recursive-investigator.ts:583` |
| Worldview synthesis | `services/strategic-cognition/narrative-synthesis/synthesizer.ts:985` |
| THE ONE THING engine | `services/elite-intelligence/index.ts:389` |
| Quality gate | `services/quality-governance/quality-scorer.ts:681,877` + `explainable-quality-engine.ts:788` |
| Delivery surface | `routes/intelligence.ts` + `services/intelligence-persistence.ts` |
