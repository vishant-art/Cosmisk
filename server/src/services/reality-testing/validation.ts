/**
 * Reality Testing — 1. Intelligence Validation Systems
 *
 * Tracks recommendations and computes intelligence quality metrics.
 */

import { logger } from '../../utils/logger.js';
import type { IntelligenceMetrics, TrackedRecommendation } from './types.js';
import { recommendationStore, metricsStore } from './stores.js';

/**
 * Track a recommendation for validation
 */
export function trackRecommendation(
  clientId: string,
  type: string,
  headline: string,
  recommendation: string,
  confidence: number,
  urgency: string
): TrackedRecommendation {
  const tracked: TrackedRecommendation = {
    id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    clientId,
    createdAt: new Date().toISOString(),
    type,
    headline,
    recommendation,
    confidence,
    urgency,
    wasViewed: false,
  };

  const existing = recommendationStore.get(clientId) || [];
  existing.push(tracked);
  recommendationStore.set(clientId, existing);

  logger.debug({ recId: tracked.id, type }, '[Reality] Recommendation tracked');

  return tracked;
}

/**
 * Record that a recommendation was viewed
 */
export function recordView(recommendationId: string): void {
  for (const [_, recs] of recommendationStore) {
    const rec = recs.find(r => r.id === recommendationId);
    if (rec) {
      rec.wasViewed = true;
      rec.viewedAt = new Date().toISOString();
      logger.debug({ recId: recommendationId }, '[Reality] View recorded');
      return;
    }
  }
}

/**
 * Record that a recommendation was acted upon
 */
export function recordAction(
  recommendationId: string,
  actionTaken: string
): void {
  for (const [_, recs] of recommendationStore) {
    const rec = recs.find(r => r.id === recommendationId);
    if (rec) {
      rec.wasActedUpon = true;
      rec.actedUponAt = new Date().toISOString();
      rec.actionTaken = actionTaken;
      logger.debug({ recId: recommendationId, action: actionTaken }, '[Reality] Action recorded');
      return;
    }
  }
}

/**
 * Record the outcome of a recommendation
 */
export function recordOutcome(
  recommendationId: string,
  positive: boolean,
  notes?: string
): void {
  for (const [_, recs] of recommendationStore) {
    const rec = recs.find(r => r.id === recommendationId);
    if (rec) {
      rec.outcomeTracked = true;
      rec.outcomePositive = positive;
      rec.outcomeNotes = notes;
      logger.debug({ recId: recommendationId, positive }, '[Reality] Outcome recorded');
      return;
    }
  }
}

/**
 * Calculate intelligence metrics for a client
 */
export function calculateIntelligenceMetrics(
  clientId: string,
  period: string
): IntelligenceMetrics {
  const recs = recommendationStore.get(clientId) || [];
  const periodRecs = filterByPeriod(recs, period);

  // Calculate core metrics
  const viewed = periodRecs.filter(r => r.wasViewed);
  const actedUpon = periodRecs.filter(r => r.wasActedUpon);
  const withOutcome = periodRecs.filter(r => r.outcomeTracked);
  const positive = withOutcome.filter(r => r.outcomePositive);
  const rated = periodRecs.filter(r => r.operatorRating !== undefined);
  const nonObvious = periodRecs.filter(r => r.markedAsNonObvious);

  // Recommendation usefulness (average rating)
  const avgRating = rated.length > 0
    ? rated.reduce((sum, r) => sum + (r.operatorRating || 3), 0) / rated.length
    : 3;
  const recommendationUsefulness = Math.round((avgRating / 5) * 100);

  // Strategic accuracy (positive outcomes / tracked outcomes)
  const strategicAccuracy = withOutcome.length > 0
    ? Math.round((positive.length / withOutcome.length) * 100)
    : 50;

  // Insight adoption rate (acted upon / viewed)
  const insightAdoptionRate = viewed.length > 0
    ? Math.round((actedUpon.length / viewed.length) * 100)
    : 0;

  // Wow factor (non-obvious / total)
  const wowFactorScore = periodRecs.length > 0
    ? Math.round((nonObvious.length / periodRecs.length) * 100)
    : 50;

  // Calculate overall score
  const overallScore = Math.round(
    (recommendationUsefulness * 0.25) +
    (strategicAccuracy * 0.25) +
    (insightAdoptionRate * 0.25) +
    (wowFactorScore * 0.25)
  );

  // Detect risk flags
  const riskFlags: string[] = [];
  if (insightAdoptionRate < 20) riskFlags.push('Low adoption — insights may not be actionable');
  if (strategicAccuracy < 50) riskFlags.push('Low accuracy — predictions need calibration');
  if (wowFactorScore < 30) riskFlags.push('Low wow factor — insights may be too obvious');
  if (viewed.length < periodRecs.length * 0.5) riskFlags.push('Low engagement — insights not being seen');

  // Determine trend (would compare to previous period)
  const trend: IntelligenceMetrics['trend'] = 'stable';

  const metrics: IntelligenceMetrics = {
    clientId,
    period,
    generatedAt: new Date().toISOString(),
    recommendationUsefulness,
    strategicAccuracy,
    operatorTrust: calculateTrustScore(periodRecs),
    wowFactorScore,
    insightUniqueness: 70,  // Would be calculated from comparison
    predictionUsefulness: strategicAccuracy,
    executionLeverage: calculateExecutionLeverage(actedUpon),
    decisionQualityImprovement: strategicAccuracy,
    insightAdoptionRate,
    recommendationFollowThrough: insightAdoptionRate,
    decisionSpeedImprovement: 0,  // Would need timing data
    creativeHitRateImprovement: 0,  // Would need creative performance data
    sessionFrequency: 0,
    timeInPlatform: 0,
    featureUsageDepth: 0,
    returnAfterInsight: 0,
    overallScore,
    trend,
    riskFlags,
  };

  // Store metrics
  const existing = metricsStore.get(clientId) || [];
  existing.push(metrics);
  metricsStore.set(clientId, existing);

  return metrics;
}

/**
 * Filter recommendations by period
 */
function filterByPeriod(recs: TrackedRecommendation[], period: string): TrackedRecommendation[] {
  // Simple period filtering (would be more sophisticated)
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  return recs.filter(r => new Date(r.createdAt) > thirtyDaysAgo);
}

/**
 * Calculate trust score from recommendations
 */
function calculateTrustScore(recs: TrackedRecommendation[]): number {
  if (recs.length === 0) return 50;

  let score = 50;

  // Positive ratings increase trust
  const highRated = recs.filter(r => (r.operatorRating || 0) >= 4);
  score += (highRated.length / recs.length) * 25;

  // Actions taken increase trust
  const actedUpon = recs.filter(r => r.wasActedUpon);
  score += (actedUpon.length / recs.length) * 15;

  // Positive outcomes increase trust
  const positive = recs.filter(r => r.outcomePositive);
  const tracked = recs.filter(r => r.outcomeTracked);
  if (tracked.length > 0) {
    score += (positive.length / tracked.length) * 10;
  }

  return Math.min(Math.round(score), 100);
}

/**
 * Calculate execution leverage
 */
function calculateExecutionLeverage(actedUpon: TrackedRecommendation[]): number {
  if (actedUpon.length === 0) return 50;

  // Based on positive outcomes from acted recommendations
  const positive = actedUpon.filter(r => r.outcomePositive);
  return Math.round((positive.length / actedUpon.length) * 100);
}
