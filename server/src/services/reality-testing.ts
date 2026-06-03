/**
 * Reality Testing Phase — Cosmisk
 *
 * Validates that intelligence actually works in the real world.
 * Not building impressive AI demos — creating systems that genuinely
 * improve how elite D2C operators think and execute.
 *
 * Core Risk: "Reality failure instead of architecture failure."
 *
 * Contains:
 * 1. Intelligence Validation — Measure actual usefulness
 * 2. Fake Intelligence Detection — Catch useless/obvious/repetitive outputs
 * 3. Human Feedback Loops — Learn from operator corrections
 * 4. Operator Behavior Learning — Adapt to how operators actually work
 * 5. Deployment Risk Mitigation — Handle trust calibration issues
 *
 * ----------------------------------------------------------------------------
 * BARREL: This file was decomposed into focused modules under ./reality-testing/.
 * It re-exports the exact original public surface so importers are unaffected.
 * Shared in-memory state lives in ./reality-testing/stores.ts (single source).
 * ----------------------------------------------------------------------------
 */

import { logger } from '../utils/logger.js';

// ============================================================================
// Public types
// ============================================================================
export type {
  IntelligenceMetrics,
  TrackedRecommendation,
  FakeIntelligenceAlert,
  FakeIntelligenceType,
  OperatorFeedback,
  FeedbackInsights,
  BehaviorEvent,
  BehaviorEventType,
  OperatorProfile,
  DeploymentRisk,
  RiskAssessment,
  RealityTestingPackage,
} from './reality-testing/types.js';

// ============================================================================
// 1. Intelligence Validation
// ============================================================================
export {
  trackRecommendation,
  recordView,
  recordAction,
  recordOutcome,
  calculateIntelligenceMetrics,
} from './reality-testing/validation.js';

// ============================================================================
// 2. Fake Intelligence Detection
// ============================================================================
export {
  detectFakeIntelligence,
  formatFakeIntelligenceAlert,
} from './reality-testing/fake-intelligence.js';

// ============================================================================
// 3. Human Feedback Loops
// ============================================================================
export {
  submitFeedback,
  recordCorrection,
  generateFeedbackInsights,
} from './reality-testing/feedback.js';

// ============================================================================
// 4. Operator Behavior Learning
// ============================================================================
export {
  trackBehavior,
  updateOperatorProfile,
  getPersonalizationRecommendations,
} from './reality-testing/behavior.js';

// ============================================================================
// 5. Deployment Risk Mitigation
// ============================================================================
export {
  assessDeploymentRisks,
  formatRiskAssessment,
} from './reality-testing/risk.js';

// ============================================================================
// Combined: Reality Testing Package
// ============================================================================
export {
  generateRealityTestingPackage,
} from './reality-testing/package.js';

// ============================================================================
// Logging
// ============================================================================

logger.info('[RealityTesting] Systems loaded — Validation, Fake Detection, Feedback, Behavior Learning, Risk Assessment');
