# Strategic Cognition Architecture

> The central brain of Cosmisk. Synthesizes evidence into unified worldview.

## Summary
Strategic Cognition is a 3-file system that transforms fragmented agent findings into a unified strategic direction. Creatives are the OUTPUT of strategic reasoning, not inputs to it.

## Core Files
| File | Purpose | Lines |
|------|---------|-------|
| `worldview-schema.ts` | Types, DB ops, evidence interfaces | ~450 |
| `synthesis-engine.ts` | Central brain, contradiction resolution | ~650 |
| `creative-reasoning.ts` | DeepCreativeBrief generation | ~760 |

## Flow
```
Evidence (8 types)
    ↓
synthesizeWorldview()
    ↓
StrategicWorldview (unified state)
    ↓
generateCreativeBrief()
    ↓
DeepCreativeBrief (9 sections)
    ↓
strategic-creative-generator
    ↓
Creative with prediction attached
```

## Key Types
- `TrustState`: high_trust | curiosity | skepticism | verification | trust_crisis
- `AudienceState`: unaware | problem_aware | solution_aware | product_aware | most_aware | legitimacy_verifying
- `DominantProblem`: trust_erosion | creative_fatigue | audience_saturation | ...
- `PrimaryLeverage`: founder_transparency | process_revelation | social_proof_surge | ...

## Contradiction Resolution
Priority hierarchy:
1. Trust > Fatigue (trust crisis is existential)
2. Revenue > Optimization (survival > growth)
3. Audience psychology > Operational convenience

## Links
- [[architecture/agent-coordination]]
- [[architecture/evidence-providers]]
- [[patterns/what-works]]

## Sources
- `server/src/services/strategic-cognition/synthesis-engine.ts`
- `server/src/services/strategic-cognition/worldview-schema.ts`
- `server/src/services/strategic-cognition/creative-reasoning.ts`

## Last Updated
2026-05-15 by Claude
