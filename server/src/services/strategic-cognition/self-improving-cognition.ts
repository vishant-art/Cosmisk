/**
 * Self-Improving Cognition System
 *
 * Instead of static reasoning, this system:
 * 1. Tracks all predictions/hypotheses with confidence levels
 * 2. Measures actual outcomes against predictions
 * 3. Analyzes errors to understand where reasoning failed
 * 4. Identifies patterns in successful vs failed reasoning
 * 5. Updates weights/priors based on track record
 * 6. Propagates lessons to improve future reasoning
 *
 * This file is a thin barrel that re-exports the cohesive modules
 * extracted into ./self-improving-cognition/. The public surface is
 * preserved exactly — importers are unaffected.
 */

export type {
  OutcomeAccuracy,
  PatternContext,
  HypothesisOutcome,
  ErrorAnalysis,
  InvestigationOutcome,
  ReasoningPattern,
  PatternAdjustment,
  FeedbackRecord,
  CognitiveImprovement,
  LearningSystemState,
  SystemMetrics,
  LearningReport,
  LearningSummary,
  PatternInsight,
  LearningRecommendation,
  CalibrationAnalysis,
} from './self-improving-cognition/types.js';

export { SelfImprovingCognitionEngine } from './self-improving-cognition/engine.js';
export { createSelfImprovingCognitionEngine } from './self-improving-cognition/factory.js';
