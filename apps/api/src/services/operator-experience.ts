/**
 * Operator Experience Intelligence — Cosmisk
 *
 * The layer that makes intelligence FEEL magical.
 * Technical infrastructure creates data; this creates wow moments.
 *
 * Core Principle: "This platform thinks alongside me."
 *
 * Contains:
 * 1. Narrative Intelligence — Transform evidence into compelling stories
 * 2. Hidden Opportunity Surfacing — Patterns humans can't find
 * 3. Strategic Timing — Create urgency with time-sensitive windows
 *
 * ---------------------------------------------------------------------------
 * This file is now a thin BARREL. The implementation was decomposed into
 * focused modules under ./operator-experience/. Importers keep working
 * unchanged — the original public surface (named exports) is re-exported here.
 * The shared in-memory prediction store lives in ./operator-experience/state.ts.
 */

// Public types (preserves the original exported type surface)
export type {
  NarrativeInsight,
  HiddenOpportunity,
  TimedIntelligence,
  OperatorIntelligencePackage,
  OperatorPersona,
  RoleBriefing,
  CompressionLevel,
  CompressedDecision,
  DisclosureDepth,
  ProgressiveDisclosure,
  Tier2IntelligencePackage,
  TrackedPrediction,
  PredictionScorecard,
  CompetitorMovementType,
  CompetitorMovement,
  AnticipatedNeedType,
  AnticipatedNeed,
  Tier3IntelligencePackage,
  CompleteOperatorExperience,
} from './operator-experience/types.js';

// 1. Narrative Intelligence
export { buildNarrative, weaveNarrative } from './operator-experience/narrative.js';

// 2. Hidden Opportunity Surfacing
export {
  surfaceHiddenOpportunities,
  generateNonObviousInsight,
} from './operator-experience/opportunities.js';

// 3. Strategic Timing
export {
  calculateOpportunityWindow,
  addStrategicTiming,
  generateTimingBrief,
} from './operator-experience/timing.js';

// Tier 1 combined package
export { generateOperatorPackage } from './operator-experience/operator-package.js';

// Tier 2: Role-based intelligence
export { generateRoleBriefing } from './operator-experience/roles.js';

// Tier 2: Decision compression
export {
  compressDecisions,
  generateFiveMinuteBrief,
} from './operator-experience/decisions.js';

// Tier 2: Progressive disclosure
export {
  generateProgressiveDisclosure,
  formatDisclosure,
} from './operator-experience/disclosure.js';

// Tier 2 combined package
export { generateTier2Package } from './operator-experience/tier2-package.js';

// Tier 3.1: Prediction scorecards
export {
  storePrediction,
  verifyPrediction,
  generatePredictionScorecard,
  formatPredictionScorecard,
} from './operator-experience/predictions.js';

// Tier 3.2: Competitor movement alerts
export {
  detectCompetitorMovements,
  formatCompetitorAlert,
} from './operator-experience/competitors.js';

// Tier 3.3: Anticipation engine
export {
  anticipateNeeds,
  formatAnticipatedNeeds,
} from './operator-experience/anticipation.js';

// Tier 3 combined package
export { generateTier3Package } from './operator-experience/tier3-package.js';

// Complete experience package (also triggers the all-tiers-loaded log line)
export { generateCompleteExperience } from './operator-experience/complete.js';
