/**
 * Reality Testing — 3. Human Feedback Loops
 *
 * Learns from operator corrections and ratings.
 */

import { logger } from '../../utils/logger.js';
import type { FeedbackInsights, OperatorFeedback } from './types.js';
import { feedbackStore, recommendationStore } from './stores.js';

/**
 * Submit operator feedback
 */
export function submitFeedback(
  recommendationId: string,
  clientId: string,
  operatorId: string,
  rating: 1 | 2 | 3 | 4 | 5,
  feedbackType: OperatorFeedback['feedbackType'],
  options?: {
    ratingDimensions?: OperatorFeedback['ratingDimensions'];
    freeformFeedback?: string;
    operatorCorrection?: string;
    operatorAlternative?: string;
    disagreedWith?: string;
    disagreementReason?: string;
    shouldHaveKnown?: boolean;
    alreadyDidThis?: boolean;
    willTryThis?: boolean;
  }
): OperatorFeedback {
  const feedback: OperatorFeedback = {
    id: `fb_${Date.now()}`,
    recommendationId,
    clientId,
    operatorId,
    submittedAt: new Date().toISOString(),
    rating,
    feedbackType,
    ...options,
  };

  // Store feedback
  const existing = feedbackStore.get(clientId) || [];
  existing.push(feedback);
  feedbackStore.set(clientId, existing);

  // Update the recommendation
  for (const [_, recs] of recommendationStore) {
    const rec = recs.find(r => r.id === recommendationId);
    if (rec) {
      rec.operatorRating = rating;
      rec.operatorFeedback = options?.freeformFeedback;
      rec.markedAsObvious = feedbackType === 'obvious';
      rec.markedAsUseless = feedbackType === 'not_helpful';
      break;
    }
  }

  logger.info({ feedbackId: feedback.id, rating, feedbackType }, '[Reality] Feedback received');

  return feedback;
}

/**
 * Record operator correction/override
 */
export function recordCorrection(
  recommendationId: string,
  clientId: string,
  operatorId: string,
  correction: string,
  reason?: string
): void {
  submitFeedback(recommendationId, clientId, operatorId, 2, 'wrong', {
    operatorCorrection: correction,
    disagreementReason: reason,
  });

  logger.info({ recommendationId, correction }, '[Reality] Correction recorded');
}

/**
 * Generate feedback insights
 */
export function generateFeedbackInsights(
  clientId: string,
  period: string
): FeedbackInsights {
  const feedback = feedbackStore.get(clientId) || [];
  const periodFeedback = feedback;  // Would filter by period

  if (periodFeedback.length === 0) {
    return {
      clientId,
      period,
      generatedAt: new Date().toISOString(),
      totalFeedback: 0,
      averageRating: 0,
      positivePercent: 0,
      negativePercent: 0,
      dimensionScores: { actionability: 0, accuracy: 0, timeliness: 0, uniqueness: 0 },
      topIssues: [],
      correctionsCount: 0,
      topCorrections: [],
      learningSignals: [],
    };
  }

  // Calculate averages
  const avgRating = periodFeedback.reduce((s, f) => s + f.rating, 0) / periodFeedback.length;
  const positive = periodFeedback.filter(f => f.rating >= 4).length;
  const negative = periodFeedback.filter(f => f.rating <= 2).length;

  // Dimension scores
  const withDimensions = periodFeedback.filter(f => f.ratingDimensions);
  const dimensionScores = {
    actionability: calculateDimensionAvg(withDimensions, 'actionability'),
    accuracy: calculateDimensionAvg(withDimensions, 'accuracy'),
    timeliness: calculateDimensionAvg(withDimensions, 'timeliness'),
    uniqueness: calculateDimensionAvg(withDimensions, 'uniqueness'),
  };

  // Top issues
  const issueCounts = new Map<string, number>();
  for (const f of periodFeedback) {
    const count = issueCounts.get(f.feedbackType) || 0;
    issueCounts.set(f.feedbackType, count + 1);
  }
  const topIssues = Array.from(issueCounts.entries())
    .map(([issue, count]) => ({
      issue,
      count,
      percent: Math.round((count / periodFeedback.length) * 100),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Corrections
  const corrections = periodFeedback.filter(f => f.operatorCorrection);
  const topCorrections = corrections
    .slice(0, 5)
    .map(c => c.operatorCorrection!)
    .filter(Boolean);

  // Learning signals
  const learningSignals: string[] = [];
  if (dimensionScores.actionability < 3) {
    learningSignals.push('Improve actionability — make recommendations more specific');
  }
  if (dimensionScores.uniqueness < 3) {
    learningSignals.push('Increase uniqueness — filter out obvious insights');
  }
  if (negative / periodFeedback.length > 0.3) {
    learningSignals.push('High negative feedback — review recommendation quality');
  }
  const alreadyDid = periodFeedback.filter(f => f.alreadyDidThis).length;
  if (alreadyDid / periodFeedback.length > 0.2) {
    learningSignals.push('Many "already did this" — speed up insight delivery');
  }

  return {
    clientId,
    period,
    generatedAt: new Date().toISOString(),
    totalFeedback: periodFeedback.length,
    averageRating: Math.round(avgRating * 10) / 10,
    positivePercent: Math.round((positive / periodFeedback.length) * 100),
    negativePercent: Math.round((negative / periodFeedback.length) * 100),
    dimensionScores,
    topIssues,
    correctionsCount: corrections.length,
    topCorrections,
    learningSignals,
  };
}

function calculateDimensionAvg(
  feedback: OperatorFeedback[],
  dimension: keyof NonNullable<OperatorFeedback['ratingDimensions']>
): number {
  const withDim = feedback.filter(f => f.ratingDimensions?.[dimension]);
  if (withDim.length === 0) return 0;
  return withDim.reduce((s, f) => s + (f.ratingDimensions![dimension] || 0), 0) / withDim.length;
}
