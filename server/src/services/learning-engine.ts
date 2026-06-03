/**
 * Learning Engine — Cosmisk
 *
 * The system that gets SMARTER over time.
 * Aggregates patterns from all analyzers into strategic creative guidance.
 *
 * Data Sources:
 * - LTV-by-Creative Analyzer → Which creative styles bring repeat buyers
 * - Creative Returns Analyzer → Which creatives have high return rates
 * - Fatigue Detector → How long each creative format lasts
 * - Competitor Intel → What patterns are trending/missing
 * - Client History → What worked/failed for this specific client
 *
 * Outputs:
 * - CreativeGuidance → What to create next
 * - ClientPlaybook → Learned patterns for each client
 * - Predictions → What will happen based on current trajectory
 *
 * ----------------------------------------------------------------------------
 * BARREL: This file was decomposed into focused modules under ./learning-engine/.
 * It re-exports the exact original public surface so importers are unaffected.
 * ----------------------------------------------------------------------------
 */

import { logger } from '../utils/logger.js';

// Public types
export type {
  CreativeGuidance,
  ClientPlaybook,
  Prediction,
  StoredPrediction,
  PredictionAccuracy,
  HumanReviewItem,
  LearningEngineOutput,
} from './learning-engine/types.js';

// Main learning engine functions
export {
  generateCreativeGuidance,
  buildClientPlaybook,
  generatePredictions,
  runLearningEngine,
} from './learning-engine/engine.js';

// Cache management (shared module-level state lives in ./learning-engine/cache.ts)
export {
  getCreativeGuidanceCached,
  invalidateGuidanceCache,
} from './learning-engine/cache.js';

// TIER 2: Signal decay
export {
  calculateDecayFactor,
  applyDecay,
} from './learning-engine/decay.js';

// TIER 2: Memory pruning
export { prunePlaybook } from './learning-engine/pruning.js';

// TIER 2: Prediction accuracy measurement
export {
  storePrediction,
  verifyPredictions,
  getPredictionAccuracy,
  adjustConfidenceByAccuracy,
} from './learning-engine/predictions.js';

// TIER 2: Human review escalation
export {
  createHumanReviewItem,
  getPendingReviews,
  resolveReview,
  getCriticalReviews,
  createReviewsFromQualityGate,
} from './learning-engine/human-review.js';

// ============================================================================
// Logging
// ============================================================================

logger.info('[LearningEngine] Module loaded — aggregates patterns into strategic guidance');
