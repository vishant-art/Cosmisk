/**
 * Reality Testing — shared module-level state (in-memory stores).
 *
 * These singletons are the ONE source of truth for cross-module state.
 * They must be imported (never re-declared) by the other reality-testing
 * modules so all consumers share the same Map instances.
 *
 * (Would be DB in production.)
 */

import type {
  IntelligenceMetrics,
  TrackedRecommendation,
  OperatorFeedback,
  BehaviorEvent,
  OperatorProfile,
} from './types.js';

export const recommendationStore = new Map<string, TrackedRecommendation[]>();
export const metricsStore = new Map<string, IntelligenceMetrics[]>();
export const feedbackStore = new Map<string, OperatorFeedback[]>();
export const behaviorStore = new Map<string, BehaviorEvent[]>();
export const profileStore = new Map<string, OperatorProfile>();
