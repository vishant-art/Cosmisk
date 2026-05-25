# Evidence Provider Pattern

> The pattern for converting agents from recommendation-generators to evidence-providers.

## Summary
Agents should provide EVIDENCE to the synthesis engine, not make DECISIONS. The synthesis engine resolves contradictions and determines strategic direction.

## The Pattern

### Before (Wrong)
```typescript
export function analyzeEmotionalExhaustion(
  clientId: string,
  adData: AdData[]
): EmotionalRotationReport {
  // Analyzes data
  // Makes recommendations
  // Returns full report with suggested actions
  return {
    recommendations: [...],
    suggestedRotations: [...],
    urgency: 'high',
  };
}
```

### After (Correct)
```typescript
export function collectEmotionalEvidence(
  clientId: string,
  adData: AdData[]
): EmotionalEvidence {
  // Analyzes data
  // Returns EVIDENCE, not recommendations
  return {
    collectedAt: new Date().toISOString(),
    currentEmotionalTerritory: 'aspiration',
    exhaustedEmotions: ['urgency', 'fomo'],
    freshEmotionalOpportunities: ['curiosity', 'pride'],
    signals: {
      emotionalResponseByAd: { ... },
      commentSentiment: { ... },
      engagementByEmotion: { ... },
    },
    interpretation: 'Urgency messaging showing 40% decline...',
    confidence: 75,
  };
}
```

## Evidence Types (AllEvidenceSources)
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

## Reference Implementation
`trust-state-router.ts` has `collectTrustEvidence()` - use as template.

## Links
- [[architecture/agent-coordination]]
- [[architecture/strategic-cognition]]

## Sources
- `server/src/services/leverage-systems/trust-state-router.ts`
- `server/src/services/strategic-cognition/worldview-schema.ts`

## Last Updated
2026-05-15 by Claude
