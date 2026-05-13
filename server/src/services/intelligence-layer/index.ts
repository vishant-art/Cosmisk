/**
 * Intelligence Layer
 *
 * The core infrastructure for ACTIVE STRATEGIC REASONING.
 *
 * This is NOT pipeline intelligence (detect → score → ship).
 * This is strategic reasoning (investigate → hypothesize → challenge → synthesize → ship ONLY elite).
 *
 * Components:
 * 1. Deep Search Protocol - Defines minimum searches before concluding "no insight"
 * 2. Thinking Quality Evaluator - Scores REASONING, not just output
 * 3. Mediocrity Detector - Aggressively rejects dashboard-level insights
 * 4. Elite Quality Gate - Unified gate for ALL agent outputs
 */

// ============================================================================
// Deep Search Protocol
// ============================================================================

export {
  getSpendTier,
  createSearchProtocol,
  evaluateProtocol,
  recordSearchAttempt,
  recordCorrelationAttempt,
  recordHiddenPatternAttempt,
  incrementDepth,
  completeProtocol,
  SEARCH_REQUIREMENTS,
  MANDATORY_CORRELATIONS,
  HIDDEN_PATTERN_SEARCHES,
  type SpendTier,
  type SearchRequirement,
  type CrossCorrelation,
  type HiddenPatternSearch,
  type SearchAttempt,
  type CorrelationAttempt,
  type HiddenPatternAttempt,
  type SearchProtocolState,
  type ProtocolEvaluation,
} from './deep-search-protocol.js';

// ============================================================================
// Thinking Quality Evaluator
// ============================================================================

export {
  evaluateThinkingQuality,
  createEmptyThinkingTrace,
  addHypothesis,
  addEvidenceSearch,
  addCausalChain,
  addAssumption,
  addContradiction,
  addConsequence,
  addHiddenLeverageSearch,
  addBehavioralInterpretation,
  type HypothesisRecord,
  type CausalChain,
  type ThinkingTrace,
  type ThinkingDimensionScore,
  type ThinkingQualityEvaluation,
} from './thinking-quality-evaluator.js';

// ============================================================================
// Mediocrity Detector
// ============================================================================

export {
  detectMediocrity,
  checkCommoditization,
  filterForQuality,
  MEDIOCRITY_PATTERNS,
  type MediocrityPattern,
  type MediocrityMatch,
  type MediocrityEvaluation,
  type CommoditizationCheck,
  type QualityFilterResult,
} from './mediocrity-detector.js';

// ============================================================================
// Elite Quality Gate
// ============================================================================

export {
  evaluateEliteQuality,
  quickQualityCheck,
  generateRejectionReport,
  getQualityThresholds,
  getSpendTier as getSpendTierForGate,
  type EliteQualityThresholds,
  type EliteQualityInput,
  type EliteQualityVerdict,
} from './elite-quality-gate.js';
