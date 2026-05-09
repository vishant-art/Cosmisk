/**
 * Intelligence Persistence Layer — Cosmisk
 *
 * Replaces in-memory Maps with SQLite persistence for all intelligence stores.
 * Provides CRUD operations for predictions, recommendations, feedback, behavior, etc.
 */

import { getDb } from '../db/index.js';
import { logger } from '../utils/logger.js';
import type { TrackedPrediction } from './operator-experience.js';
import type {
  TrackedRecommendation,
  OperatorFeedback,
  BehaviorEvent,
  OperatorProfile,
  IntelligenceMetrics,
} from './reality-testing.js';

// ============================================================================
// PREDICTION PERSISTENCE
// ============================================================================

export function savePrediction(prediction: TrackedPrediction): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO intelligence_predictions (
      id, client_id, created_at, prediction, predicted_outcome, predicted_value,
      confidence, timeframe, evidence_used, insight_type, verification_date,
      actual_outcome, actual_value, was_accurate, accuracy_score, action_taken
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    prediction.id,
    prediction.clientId,
    prediction.createdAt,
    prediction.prediction,
    prediction.predictedOutcome,
    prediction.predictedValue ?? null,
    prediction.confidence,
    prediction.timeframe,
    JSON.stringify(prediction.evidenceUsed),
    prediction.insightType,
    prediction.verificationDate ?? null,
    prediction.actualOutcome ?? null,
    prediction.actualValue ?? null,
    prediction.wasAccurate ? 1 : 0,
    prediction.accuracyScore ?? null,
    prediction.actionTaken ?? null
  );
}

export function getPrediction(id: string): TrackedPrediction | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM intelligence_predictions WHERE id = ?').get(id) as any;
  if (!row) return null;
  return mapRowToPrediction(row);
}

export function getPredictionsByClient(clientId: string): TrackedPrediction[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM intelligence_predictions WHERE client_id = ? ORDER BY created_at DESC').all(clientId) as any[];
  return rows.map(mapRowToPrediction);
}

export function getUnverifiedPredictions(clientId: string): TrackedPrediction[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM intelligence_predictions WHERE client_id = ? AND verification_date IS NULL').all(clientId) as any[];
  return rows.map(mapRowToPrediction);
}

function mapRowToPrediction(row: any): TrackedPrediction {
  return {
    id: row.id,
    clientId: row.client_id,
    createdAt: row.created_at,
    prediction: row.prediction,
    predictedOutcome: row.predicted_outcome,
    predictedValue: row.predicted_value,
    confidence: row.confidence,
    timeframe: row.timeframe,
    evidenceUsed: JSON.parse(row.evidence_used || '[]'),
    insightType: row.insight_type,
    verificationDate: row.verification_date,
    actualOutcome: row.actual_outcome,
    actualValue: row.actual_value,
    wasAccurate: row.was_accurate === 1,
    accuracyScore: row.accuracy_score,
    actionTaken: row.action_taken,
  };
}

// ============================================================================
// RECOMMENDATION PERSISTENCE
// ============================================================================

export function saveRecommendation(rec: TrackedRecommendation): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO intelligence_recommendations (
      id, client_id, created_at, type, headline, recommendation, confidence, urgency,
      was_viewed, viewed_at, was_acted_upon, acted_upon_at, action_taken,
      outcome_tracked, outcome_positive, outcome_notes, operator_rating, operator_feedback,
      marked_as_obvious, marked_as_useless, marked_as_non_obvious, validated_at, validation_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    rec.id,
    rec.clientId,
    rec.createdAt,
    rec.type,
    rec.headline,
    rec.recommendation,
    rec.confidence,
    rec.urgency,
    rec.wasViewed ? 1 : 0,
    rec.viewedAt ?? null,
    rec.wasActedUpon ? 1 : 0,
    rec.actedUponAt ?? null,
    rec.actionTaken ?? null,
    rec.outcomeTracked ? 1 : 0,
    rec.outcomePositive ? 1 : 0,
    rec.outcomeNotes ?? null,
    rec.operatorRating ?? null,
    rec.operatorFeedback ?? null,
    rec.markedAsObvious ? 1 : 0,
    rec.markedAsUseless ? 1 : 0,
    rec.markedAsNonObvious ? 1 : 0,
    rec.validatedAt ?? null,
    rec.validationScore ?? null
  );
}

export function getRecommendation(id: string): TrackedRecommendation | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM intelligence_recommendations WHERE id = ?').get(id) as any;
  if (!row) return null;
  return mapRowToRecommendation(row);
}

export function getRecommendationsByClient(clientId: string, limit = 100): TrackedRecommendation[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM intelligence_recommendations WHERE client_id = ? ORDER BY created_at DESC LIMIT ?').all(clientId, limit) as any[];
  return rows.map(mapRowToRecommendation);
}

export function updateRecommendationView(id: string): void {
  const db = getDb();
  db.prepare('UPDATE intelligence_recommendations SET was_viewed = 1, viewed_at = datetime("now") WHERE id = ?').run(id);
}

export function updateRecommendationAction(id: string, action: string): void {
  const db = getDb();
  db.prepare('UPDATE intelligence_recommendations SET was_acted_upon = 1, acted_upon_at = datetime("now"), action_taken = ? WHERE id = ?').run(action, id);
}

export function updateRecommendationOutcome(id: string, positive: boolean, notes?: string): void {
  const db = getDb();
  db.prepare('UPDATE intelligence_recommendations SET outcome_tracked = 1, outcome_positive = ?, outcome_notes = ? WHERE id = ?').run(positive ? 1 : 0, notes ?? null, id);
}

export function updateRecommendationRating(id: string, rating: number, feedback?: string): void {
  const db = getDb();
  db.prepare('UPDATE intelligence_recommendations SET operator_rating = ?, operator_feedback = ? WHERE id = ?').run(rating, feedback ?? null, id);
}

function mapRowToRecommendation(row: any): TrackedRecommendation {
  return {
    id: row.id,
    clientId: row.client_id,
    createdAt: row.created_at,
    type: row.type,
    headline: row.headline,
    recommendation: row.recommendation,
    confidence: row.confidence,
    urgency: row.urgency,
    wasViewed: row.was_viewed === 1,
    viewedAt: row.viewed_at,
    wasActedUpon: row.was_acted_upon === 1,
    actedUponAt: row.acted_upon_at,
    actionTaken: row.action_taken,
    outcomeTracked: row.outcome_tracked === 1,
    outcomePositive: row.outcome_positive === 1,
    outcomeNotes: row.outcome_notes,
    operatorRating: row.operator_rating,
    operatorFeedback: row.operator_feedback,
    markedAsObvious: row.marked_as_obvious === 1,
    markedAsUseless: row.marked_as_useless === 1,
    markedAsNonObvious: row.marked_as_non_obvious === 1,
    validatedAt: row.validated_at,
    validationScore: row.validation_score,
  };
}

// ============================================================================
// FEEDBACK PERSISTENCE
// ============================================================================

export function saveFeedback(feedback: OperatorFeedback): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO operator_feedback (
      id, recommendation_id, client_id, operator_id, submitted_at, rating,
      rating_dimensions, feedback_type, freeform_feedback, operator_correction,
      operator_alternative, disagreed_with, disagreement_reason,
      should_have_known, already_did_this, will_try_this
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    feedback.id,
    feedback.recommendationId,
    feedback.clientId,
    feedback.operatorId,
    feedback.submittedAt,
    feedback.rating,
    feedback.ratingDimensions ? JSON.stringify(feedback.ratingDimensions) : null,
    feedback.feedbackType,
    feedback.freeformFeedback ?? null,
    feedback.operatorCorrection ?? null,
    feedback.operatorAlternative ?? null,
    feedback.disagreedWith ?? null,
    feedback.disagreementReason ?? null,
    feedback.shouldHaveKnown ? 1 : 0,
    feedback.alreadyDidThis ? 1 : 0,
    feedback.willTryThis ? 1 : 0
  );
}

export function getFeedbackByClient(clientId: string, limit = 100): OperatorFeedback[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM operator_feedback WHERE client_id = ? ORDER BY submitted_at DESC LIMIT ?').all(clientId, limit) as any[];
  return rows.map(mapRowToFeedback);
}

function mapRowToFeedback(row: any): OperatorFeedback {
  return {
    id: row.id,
    recommendationId: row.recommendation_id,
    clientId: row.client_id,
    operatorId: row.operator_id,
    submittedAt: row.submitted_at,
    rating: row.rating,
    ratingDimensions: row.rating_dimensions ? JSON.parse(row.rating_dimensions) : undefined,
    feedbackType: row.feedback_type,
    freeformFeedback: row.freeform_feedback,
    operatorCorrection: row.operator_correction,
    operatorAlternative: row.operator_alternative,
    disagreedWith: row.disagreed_with,
    disagreementReason: row.disagreement_reason,
    shouldHaveKnown: row.should_have_known === 1,
    alreadyDidThis: row.already_did_this === 1,
    willTryThis: row.will_try_this === 1,
  };
}

// ============================================================================
// BEHAVIOR PERSISTENCE
// ============================================================================

export function saveBehaviorEvent(event: BehaviorEvent): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO operator_behavior (
      id, client_id, operator_id, timestamp, event_type, context,
      item_id, item_type, action, duration, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.id,
    event.clientId,
    event.operatorId,
    event.timestamp,
    event.eventType,
    event.context,
    event.itemId ?? null,
    event.itemType ?? null,
    event.action ?? null,
    event.duration ?? null,
    event.metadata ? JSON.stringify(event.metadata) : null
  );
}

export function getBehaviorEvents(clientId: string, operatorId: string, limit = 1000): BehaviorEvent[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM operator_behavior
    WHERE client_id = ? AND operator_id = ?
    ORDER BY timestamp DESC LIMIT ?
  `).all(clientId, operatorId, limit) as any[];
  return rows.map(mapRowToBehaviorEvent);
}

function mapRowToBehaviorEvent(row: any): BehaviorEvent {
  return {
    id: row.id,
    clientId: row.client_id,
    operatorId: row.operator_id,
    timestamp: row.timestamp,
    eventType: row.event_type,
    context: row.context,
    itemId: row.item_id,
    itemType: row.item_type,
    action: row.action,
    duration: row.duration,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}

// ============================================================================
// PROFILE PERSISTENCE
// ============================================================================

export function saveOperatorProfile(profile: OperatorProfile): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO operator_profiles (
      operator_id, client_id, last_updated, preferred_times, avg_session_duration,
      sessions_per_week, preferred_insight_types, ignored_insight_types,
      preferred_detail_level, urgency_threshold, avg_decision_time, action_rate,
      feedback_rate, learning_velocity, trust_level, should_simplify,
      wants_more_detail, prefers_visual, needs_urgency
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    profile.operatorId,
    profile.clientId,
    profile.lastUpdated,
    JSON.stringify(profile.preferredTimes),
    profile.avgSessionDuration,
    profile.sessionsPerWeek,
    JSON.stringify(profile.preferredInsightTypes),
    JSON.stringify(profile.ignoredInsightTypes),
    profile.preferredDetailLevel,
    profile.urgencyThreshold,
    profile.avgDecisionTime,
    profile.actionRate,
    profile.feedbackRate,
    profile.learningVelocity,
    profile.trustLevel,
    profile.shouldSimplify ? 1 : 0,
    profile.wantsMoreDetail ? 1 : 0,
    profile.prefersVisual ? 1 : 0,
    profile.needsUrgency ? 1 : 0
  );
}

export function getOperatorProfile(clientId: string, operatorId: string): OperatorProfile | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM operator_profiles WHERE client_id = ? AND operator_id = ?').get(clientId, operatorId) as any;
  if (!row) return null;
  return mapRowToProfile(row);
}

function mapRowToProfile(row: any): OperatorProfile {
  return {
    operatorId: row.operator_id,
    clientId: row.client_id,
    lastUpdated: row.last_updated,
    preferredTimes: JSON.parse(row.preferred_times || '[]'),
    avgSessionDuration: row.avg_session_duration,
    sessionsPerWeek: row.sessions_per_week,
    preferredInsightTypes: JSON.parse(row.preferred_insight_types || '[]'),
    ignoredInsightTypes: JSON.parse(row.ignored_insight_types || '[]'),
    preferredDetailLevel: row.preferred_detail_level,
    urgencyThreshold: row.urgency_threshold,
    avgDecisionTime: row.avg_decision_time,
    actionRate: row.action_rate,
    feedbackRate: row.feedback_rate,
    learningVelocity: row.learning_velocity,
    trustLevel: row.trust_level,
    shouldSimplify: row.should_simplify === 1,
    wantsMoreDetail: row.wants_more_detail === 1,
    prefersVisual: row.prefers_visual === 1,
    needsUrgency: row.needs_urgency === 1,
  };
}

// ============================================================================
// METRICS PERSISTENCE
// ============================================================================

export function saveIntelligenceMetrics(metrics: IntelligenceMetrics): void {
  const db = getDb();
  const id = `metrics_${metrics.clientId}_${metrics.period}_${Date.now()}`;
  db.prepare(`
    INSERT INTO intelligence_metrics (
      id, client_id, period, generated_at, recommendation_usefulness,
      strategic_accuracy, operator_trust, wow_factor_score, insight_uniqueness,
      prediction_usefulness, execution_leverage, decision_quality_improvement,
      insight_adoption_rate, recommendation_follow_through, decision_speed_improvement,
      creative_hit_rate_improvement, overall_score, trend, risk_flags
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    metrics.clientId,
    metrics.period,
    metrics.generatedAt,
    metrics.recommendationUsefulness,
    metrics.strategicAccuracy,
    metrics.operatorTrust,
    metrics.wowFactorScore,
    metrics.insightUniqueness,
    metrics.predictionUsefulness,
    metrics.executionLeverage,
    metrics.decisionQualityImprovement,
    metrics.insightAdoptionRate,
    metrics.recommendationFollowThrough,
    metrics.decisionSpeedImprovement,
    metrics.creativeHitRateImprovement,
    metrics.overallScore,
    metrics.trend,
    JSON.stringify(metrics.riskFlags)
  );
}

export function getLatestMetrics(clientId: string): IntelligenceMetrics | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM intelligence_metrics WHERE client_id = ? ORDER BY generated_at DESC LIMIT 1').get(clientId) as any;
  if (!row) return null;
  return mapRowToMetrics(row);
}

function mapRowToMetrics(row: any): IntelligenceMetrics {
  return {
    clientId: row.client_id,
    period: row.period,
    generatedAt: row.generated_at,
    recommendationUsefulness: row.recommendation_usefulness,
    strategicAccuracy: row.strategic_accuracy,
    operatorTrust: row.operator_trust,
    wowFactorScore: row.wow_factor_score,
    insightUniqueness: row.insight_uniqueness,
    predictionUsefulness: row.prediction_usefulness,
    executionLeverage: row.execution_leverage,
    decisionQualityImprovement: row.decision_quality_improvement,
    insightAdoptionRate: row.insight_adoption_rate,
    recommendationFollowThrough: row.recommendation_follow_through,
    decisionSpeedImprovement: row.decision_speed_improvement,
    creativeHitRateImprovement: row.creative_hit_rate_improvement,
    sessionFrequency: 0,
    timeInPlatform: 0,
    featureUsageDepth: 0,
    returnAfterInsight: 0,
    overallScore: row.overall_score,
    trend: row.trend,
    riskFlags: JSON.parse(row.risk_flags || '[]'),
  };
}

// ============================================================================
// COMPETITOR PERSISTENCE
// ============================================================================

export function saveCompetitorSnapshot(
  clientId: string,
  snapshot: {
    competitorName: string;
    competitorId?: string;
    activeAds: number;
    estimatedSpend?: number;
    topFormats: string[];
    topAngles: string[];
    offers: string[];
    newCreatives: number;
    killedCreatives: number;
  }
): void {
  const db = getDb();
  const id = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(`
    INSERT INTO competitor_snapshots (
      id, client_id, competitor_name, competitor_id, active_ads, estimated_spend,
      top_formats, top_angles, offers, new_creatives, killed_creatives
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    clientId,
    snapshot.competitorName,
    snapshot.competitorId ?? null,
    snapshot.activeAds,
    snapshot.estimatedSpend ?? null,
    JSON.stringify(snapshot.topFormats),
    JSON.stringify(snapshot.topAngles),
    JSON.stringify(snapshot.offers),
    snapshot.newCreatives,
    snapshot.killedCreatives
  );
}

export function getCompetitorSnapshots(clientId: string, competitorName: string, limit = 10): any[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM competitor_snapshots
    WHERE client_id = ? AND competitor_name = ?
    ORDER BY captured_at DESC LIMIT ?
  `).all(clientId, competitorName, limit) as any[];
}

export function saveCompetitorMovement(movement: any): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO competitor_movements (
      id, client_id, detected_at, competitor_name, competitor_id, movement_type,
      description, significance, evidence, implications, suggested_response,
      response_urgency, first_mover_window, acknowledged, response_action
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    movement.id,
    movement.clientId,
    movement.detectedAt,
    movement.competitorName,
    movement.competitorId ?? null,
    movement.movementType,
    movement.description,
    movement.significance,
    JSON.stringify(movement.evidence),
    JSON.stringify(movement.implications),
    movement.suggestedResponse,
    movement.responseUrgency,
    movement.firstMoverWindow ?? null,
    movement.acknowledged ? 1 : 0,
    movement.responseAction ?? null
  );
}

export function getUnacknowledgedMovements(clientId: string): any[] {
  const db = getDb();
  return db.prepare('SELECT * FROM competitor_movements WHERE client_id = ? AND acknowledged = 0 ORDER BY detected_at DESC').all(clientId) as any[];
}

// ============================================================================
// Logging
// ============================================================================

logger.info('[IntelligencePersistence] SQLite persistence layer loaded');
