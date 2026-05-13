/**
 * Intelligence Quality Governance Layer
 *
 * The MOST critical system in Cosmisk.
 *
 * Goal: Maximum signal quality, NOT maximum output volume.
 *
 * "Is this worth showing to a founder spending ₹50L/month?"
 *
 * CRITICAL DISTINCTION:
 * - "No insight found" can mean GOOD (avoided hallucination) or BAD (weak synthesis)
 * - For high-spend accounts, "nothing exists" is almost NEVER true
 * - The issue is usually WEAK SYNTHESIS, not ABSENT SIGNALS
 */

// Basic quality scorer (v1)
export {
  evaluateQuality,
  isShippable,
  generateNoInsightResponse,
  validatePreGeneration,
  withQualityGates,
  checkSignalSufficiency, // NEW: Prevents shipping "no data" reports
  scoreSignalDensity,
  scoreStrategicDepth,
  scoreOriginality,
  scoreActionability,
  scoreFounderWow,
  scoreEconomicValue,
  type QualityVerdict,
  type QualityScores,
  type QualityPenalties,
  type QualityEvaluation,
  type IntelligenceOutput,
  type SignalSufficiencyCheck, // NEW
} from './quality-scorer.js';

// Explainable quality engine (v2) - with synthesis depth analysis
export {
  evaluateExplainableQuality,
  generateIntelligentNoInsightResponse,
  ALL_SIGNAL_SOURCES,
  HIDDEN_PATTERN_AREAS,
  type SignalSource,
  type SignalEvidence,
  type QualityDimension,
  type SynthesisDepthAnalysis,
  type ExplainableQualityReport,
  type IntelligenceInput,
} from './explainable-quality-engine.js';
