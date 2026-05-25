# Agent Coordination Architecture

> How agents communicate (or don't) in Cosmisk.

## Summary
Currently 60% coordinated, 40% islands. The core flow works through worldview synthesis, but 10 leverage-systems agents still generate standalone reports.

## Current State

### Connected (via worldview)
```
ad-watchdog.ts (orchestrator)
    ↓
collectStrategicEvidence()
    ↓
synthesizeWorldview() → StrategicWorldview
    ↓
generateCreativeBrief() → DeepCreativeBrief
    ↓
strategic-creative-generator
```

### Islands (not connected)
| Agent | Status |
|-------|--------|
| persuasion-intelligence-engine | Generates reports, not evidence |
| emotional-exhaustion-detector | Generates reports, not evidence |
| hook-decay-predictor | Generates reports, not evidence |
| founder-voice-cloner | Not evidence provider |
| cultural-timing-adapter | Not evidence provider |
| funnel-aware-sequencer | Not evidence provider |
| creator-trust-decay-predictor | Not evidence provider |
| category-pattern-extractor | Not evidence provider |
| adaptive-trust-infrastructure | Not evidence provider |
| pre-launch-kill-system | Not evidence provider |

## Target Pattern
Every agent should have a `collectXxxEvidence()` function that returns typed evidence:

```typescript
// CORRECT
function collectEmotionalEvidence(): EmotionalEvidence {
  return {
    collectedAt: now,
    exhaustedEmotions: ['urgency', 'fomo'],
    freshOpportunities: ['curiosity', 'pride'],
    interpretation: '...',
    confidence: 75,
  };
}

// WRONG
function analyzeEmotionalExhaustion(): EmotionalRotationReport {
  // Returns recommendations, creates its own report
}
```

## Shared Memory
| Type | Status |
|------|--------|
| `strategic_worldviews` table | EXISTS |
| `AllEvidenceSources` interface | EXISTS (4 of 8 populated) |
| `worldview_predictions` table | EXISTS |
| Direct agent communication | NONE |

## Links
- [[architecture/strategic-cognition]]
- [[architecture/evidence-providers]]

## Sources
- `server/src/services/ad-watchdog.ts`
- `server/src/services/leverage-systems/index.ts`

## Last Updated
2026-05-15 by Claude
