# Closed-Loop Learning Architecture

> The system that makes Cosmisk smarter over time.

## Summary
Closed-loop tracking connects recommendations → predictions → outcomes → learning. Currently partially built: prediction tracking exists but detection and evolution are incomplete.

## Current State
| Capability | Status |
|------------|--------|
| Recommend | WORKS |
| Generate creative | WORKS |
| Deploy | Manual (OK for now) |
| Detect launched creatives | NOT BUILT |
| Compare predicted vs actual | BASIC |
| Update confidence | STARTED |
| Evolve reasoning | NOT BUILT |

## Flow
```
Recommendation made
    ↓
agentRecommend() → recommendation_tracking table
    ↓
trackWorldviewPrediction() → worldview_predictions table
    ↓
[Client implements recommendation]
    ↓
detectLaunchedCreatives() → creative_launches table [NOT BUILT]
    ↓
monitorCreativePerformance() → creative_performance table [NOT BUILT]
    ↓
evaluatePrediction() → verified_correct / verified_incorrect
    ↓
evolveStrategicReasoning() → client_playbook updated [NOT BUILT]
```

## Key Tables
| Table | Purpose | Status |
|-------|---------|--------|
| recommendation_tracking | Store recommendations | EXISTS |
| worldview_predictions | Store predictions with expected outcomes | EXISTS |
| creative_launches | Link ads to briefs | NOT EXISTS |
| creative_performance | Track performance over time | NOT EXISTS |

## Prediction Structure
```typescript
interface StoredPrediction {
  id: string;
  clientId: string;
  type: 'fatigue' | 'roas_decline' | 'cpa_spike' | 'opportunity';
  prediction: string;
  confidence: number;
  expectedOutcome: {
    metric: string;       // 'click_to_atc', 'ROAS', etc.
    direction: 'increase' | 'decrease' | 'stable';
    minChange?: number;
  };
  status: 'pending' | 'verified_correct' | 'verified_incorrect' | 'expired';
  expiresAt: string;
}
```

## Confidence Adjustment
- Accurate prediction: confidence += 2
- Missed prediction: confidence -= 5

## What Needs Building
1. `detectLaunchedCreatives()` - match new ads to briefs
2. `monitorCreativePerformance()` - pull performance after 72h and 7d
3. `evaluateCreativePrediction()` - compare predicted vs actual
4. `evolveStrategicReasoning()` - update client_playbook

## Links
- [[architecture/strategic-cognition]]
- [[patterns/predictions]]

## Sources
- `server/src/services/learning-engine.ts`
- `server/src/services/recommendation-loop.ts`

## Last Updated
2026-05-15 by Claude
