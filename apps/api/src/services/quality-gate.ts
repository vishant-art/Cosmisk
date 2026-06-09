/**
 * Quality Gate — Cosmisk
 *
 * THE MANDATORY FILTER for all agent outputs.
 * Nothing reaches a client without passing through here.
 *
 * Core principle: "Would an experienced media buyer spending ₹30L+/month
 * already know this?" If yes, filter it out.
 *
 * Every output must:
 * 1. Synthesize 2+ signals (not just report one metric)
 * 2. Pass non-obviousness check
 * 3. Have strategic depth (explain WHY + WHAT TO DO)
 * 4. Be specific and actionable
 *
 * NOTE: This file is a thin barrel. Implementation lives in ./quality-gate/*.
 */

import { logger } from '../utils/logger.js';

// Types
export type {
  Evidence,
  ConfidenceFactors,
  QualityCheckResult,
  InsightInput,
  DecisionInput,
  QualityGateConfig,
} from './quality-gate/types.js';

// Evidence validation & claim verification
export { extractNumericClaims, verifyClaims } from './quality-gate/evidence.js';

// Main quality gate functions
export {
  checkInsightQuality,
  checkDecisionQuality,
  filterInsights,
  filterDecisions,
} from './quality-gate/core.js';

// Contradiction detection
export { detectContradictions, resolveContradictions } from './quality-gate/contradictions.js';

// Utility functions
export { isObvious, getQualityScore, getSuggestions } from './quality-gate/utils.js';

// ============================================================================
// Logging
// ============================================================================

logger.info('[QualityGate] Module loaded — all agent outputs will be filtered');
