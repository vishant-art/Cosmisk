# Agent Inventory

> What's built, what's wired, what's not.

## Production Ready (Use These)

| Agent | File | Status | Notes |
|-------|------|--------|-------|
| **OOS Detection** | `oos-detector.ts` | BUILT + WIRED | Fuzzy matching, Shopify verification |
| **Discount Leakage** | `discount-leakage-detector.ts` | BUILT + WIRED | Coupon site scraping |
| **Ad Watchdog** | `ad-watchdog.ts` | BUILT + WIRED | Main orchestrator, 1700 lines |
| **Competitor Intel** | `competitor-spy.ts` | BUILT | Meta Ad Library + Claude analysis |
| **Creative Scorer** | `creative-scorer.ts` | BUILT + WIRED | 5-dimension scoring |
| **Autopilot Engine** | `autopilot-engine.ts` | BUILT | Auto-optimize budgets |

## Strategic Cognition (Core System)

| Component | File | Status |
|-----------|------|--------|
| **Worldview Schema** | `strategic-cognition/worldview-schema.ts` | DONE |
| **Synthesis Engine** | `strategic-cognition/synthesis-engine.ts` | DONE |
| **Creative Reasoning** | `strategic-cognition/creative-reasoning.ts` | DONE |
| **Strategic Creative Gen** | `strategic-creative-generator.ts` | DONE (requires worldview) |

## Leverage Systems (10 are ISLANDS)

| Agent | Status | Problem |
|-------|--------|---------|
| `trust-state-router.ts` | WIRED | Evidence provider pattern |
| `persuasion-intelligence-engine.ts` | ISLAND | Generates reports, not evidence |
| `emotional-exhaustion-detector.ts` | ISLAND | Generates reports, not evidence |
| `hook-decay-predictor.ts` | ISLAND | Generates reports, not evidence |
| `founder-voice-cloner.ts` | ISLAND | Not evidence provider |
| `cultural-timing-adapter.ts` | ISLAND | Not evidence provider |
| `funnel-aware-sequencer.ts` | ISLAND | Not evidence provider |
| `creator-trust-decay-predictor.ts` | ISLAND | Not evidence provider |
| `category-pattern-extractor.ts` | ISLAND | Not evidence provider |
| `adaptive-trust-infrastructure.ts` | ISLAND | Not evidence provider |
| `pre-launch-kill-system.ts` | ISLAND | Not evidence provider |

## Evidence Types Status

| Type | Interface | Status |
|------|-----------|--------|
| trust | TrustEvidence | POPULATED |
| audience | AudienceEvidence | NOT POPULATED |
| fatigue | FatigueEvidence | PARTIAL |
| persuasion | PersuasionEvidence | NOT POPULATED |
| emotional | EmotionalEvidence | NOT POPULATED |
| competitor | CompetitorEvidence | NOT POPULATED |
| cohort | CohortEvidence | PARTIAL |
| operational | OperationalEvidence | NOT POPULATED |

## Not Built Yet

| Agent | Priority | Needs |
|-------|----------|-------|
| Inventory Velocity | MEDIUM | Shopify MCP |
| Cohort/LTV Tracking | MEDIUM | Shopify MCP |

## Links
- [[architecture/strategic-cognition]]
- [[architecture/evidence-providers]]

## Last Updated
2026-05-15 by Claude
