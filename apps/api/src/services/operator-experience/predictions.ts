/**
 * Operator Experience — TIER 3.1: PREDICTION SCORECARDS
 */

import { logger } from '../../utils/logger.js';
import type { TrackedPrediction, PredictionScorecard } from './types.js';
import { predictionStore } from './state.js';

/**
 * Store a prediction for future verification
 */
export function storePrediction(
  clientId: string,
  prediction: string,
  predictedOutcome: string,
  confidence: number,
  timeframe: string,
  insightType: string,
  evidenceUsed: string[],
  predictedValue?: number
): TrackedPrediction {
  const tracked: TrackedPrediction = {
    id: `pred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    clientId,
    createdAt: new Date().toISOString(),
    prediction,
    predictedOutcome,
    predictedValue,
    confidence,
    timeframe,
    evidenceUsed,
    insightType,
  };

  const existing = predictionStore.get(clientId) || [];
  existing.push(tracked);
  predictionStore.set(clientId, existing);

  logger.debug({ predictionId: tracked.id, clientId }, '[Experience] Prediction stored for tracking');

  return tracked;
}

/**
 * Verify a prediction against actual outcome
 */
export function verifyPrediction(
  predictionId: string,
  actualOutcome: string,
  actualValue?: number,
  actionTaken?: string
): TrackedPrediction | null {
  for (const [clientId, predictions] of predictionStore) {
    const prediction = predictions.find(p => p.id === predictionId);
    if (prediction) {
      prediction.verificationDate = new Date().toISOString();
      prediction.actualOutcome = actualOutcome;
      prediction.actualValue = actualValue;
      prediction.actionTaken = actionTaken;

      // Calculate accuracy
      if (prediction.predictedValue !== undefined && actualValue !== undefined) {
        const diff = Math.abs(prediction.predictedValue - actualValue);
        const maxVal = Math.max(prediction.predictedValue, actualValue);
        prediction.accuracyScore = maxVal > 0 ? Math.round((1 - diff / maxVal) * 100) : 100;
        prediction.wasAccurate = prediction.accuracyScore >= 70;
      } else {
        // Qualitative comparison
        const predictedLower = prediction.predictedOutcome.toLowerCase();
        const actualLower = actualOutcome.toLowerCase();
        prediction.wasAccurate =
          actualLower.includes(predictedLower.split(' ')[0]) ||
          predictedLower.includes(actualLower.split(' ')[0]);
        prediction.accuracyScore = prediction.wasAccurate ? 80 : 30;
      }

      logger.debug({ predictionId, wasAccurate: prediction.wasAccurate }, '[Experience] Prediction verified');

      return prediction;
    }
  }
  return null;
}

/**
 * Generate prediction scorecard for a client
 */
export function generatePredictionScorecard(clientId: string): PredictionScorecard {
  const predictions = predictionStore.get(clientId) || [];
  const verified = predictions.filter(p => p.verificationDate);
  const accurate = verified.filter(p => p.wasAccurate);

  // Calculate accuracy by type
  const byType: Record<string, { total: number; accurate: number }> = {};
  for (const p of verified) {
    if (!byType[p.insightType]) {
      byType[p.insightType] = { total: 0, accurate: 0 };
    }
    byType[p.insightType].total++;
    if (p.wasAccurate) byType[p.insightType].accurate++;
  }

  const accuracyByType: PredictionScorecard['accuracyByType'] = {};
  for (const [type, data] of Object.entries(byType)) {
    accuracyByType[type] = {
      ...data,
      accuracy: data.total > 0 ? Math.round((data.accurate / data.total) * 100) : 0,
    };
  }

  // Recent accuracy (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentVerified = verified.filter(p =>
    new Date(p.verificationDate!) > thirtyDaysAgo
  );
  const recentAccurate = recentVerified.filter(p => p.wasAccurate);
  const recentAccuracy = recentVerified.length > 0
    ? Math.round((recentAccurate.length / recentVerified.length) * 100)
    : 0;

  // Overall accuracy
  const overallAccuracy = verified.length > 0
    ? Math.round((accurate.length / verified.length) * 100)
    : 0;

  // Accuracy trend
  let accuracyTrend: PredictionScorecard['accuracyTrend'] = 'stable';
  if (recentVerified.length >= 5) {
    if (recentAccuracy > overallAccuracy + 10) accuracyTrend = 'improving';
    else if (recentAccuracy < overallAccuracy - 10) accuracyTrend = 'declining';
  }

  // Trust score calculation
  let trustScore = 50;  // Base score
  trustScore += Math.min(verified.length * 2, 20);  // More verifications = more trust
  trustScore += (overallAccuracy - 50) * 0.3;  // Accuracy boost/penalty
  if (accuracyTrend === 'improving') trustScore += 10;
  if (accuracyTrend === 'declining') trustScore -= 10;
  trustScore = Math.max(0, Math.min(100, trustScore));

  // Trust level
  let trustLevel: PredictionScorecard['trustLevel'] = 'building';
  if (verified.length < 5) trustLevel = 'building';
  else if (trustScore >= 75) trustLevel = 'high';
  else if (trustScore >= 50) trustLevel = 'medium';
  else trustLevel = 'low';

  // Trust factors
  const trustFactors: string[] = [];
  if (verified.length >= 10) trustFactors.push(`${verified.length} verified predictions`);
  if (overallAccuracy >= 70) trustFactors.push(`${overallAccuracy}% overall accuracy`);
  if (accuracyTrend === 'improving') trustFactors.push('Accuracy improving over time');
  if (accurate.length >= 5) trustFactors.push(`${accurate.length} accurate predictions`);

  // Best and worst prediction types
  const typeAccuracies = Object.entries(accuracyByType)
    .filter(([_, data]) => data.total >= 3)
    .sort((a, b) => b[1].accuracy - a[1].accuracy);

  const bestPredictionTypes = typeAccuracies.slice(0, 2).map(([type]) => type);
  const worstPredictionTypes = typeAccuracies.slice(-2).map(([type]) => type);

  // Improvement areas
  const improvementAreas: string[] = [];
  for (const [type, data] of Object.entries(accuracyByType)) {
    if (data.accuracy < 50 && data.total >= 3) {
      improvementAreas.push(`${type} predictions need more data or better signals`);
    }
  }

  return {
    clientId,
    generatedAt: new Date().toISOString(),
    totalPredictions: predictions.length,
    verifiedPredictions: verified.length,
    accuratePredictions: accurate.length,
    overallAccuracy,
    accuracyByType,
    recentAccuracy,
    accuracyTrend,
    trustScore: Math.round(trustScore),
    trustLevel,
    trustFactors,
    recentPredictions: predictions.slice(-5).reverse(),
    bestPredictionTypes,
    worstPredictionTypes,
    improvementAreas,
  };
}

/**
 * Format scorecard for display
 */
export function formatPredictionScorecard(scorecard: PredictionScorecard): string {
  const parts: string[] = [];

  const trustEmoji = {
    high: '🟢',
    medium: '🟡',
    low: '🔴',
    building: '🔵',
  };

  parts.push(`**PREDICTION SCORECARD** ${trustEmoji[scorecard.trustLevel]}`);
  parts.push(`Trust Level: ${scorecard.trustLevel.toUpperCase()} (${scorecard.trustScore}/100)\n`);

  parts.push('**Accuracy Stats**');
  parts.push(`- Overall: ${scorecard.overallAccuracy}% (${scorecard.accuratePredictions}/${scorecard.verifiedPredictions} verified)`);
  parts.push(`- Last 30 days: ${scorecard.recentAccuracy}%`);
  parts.push(`- Trend: ${scorecard.accuracyTrend}\n`);

  if (scorecard.bestPredictionTypes.length > 0) {
    parts.push(`**Best at:** ${scorecard.bestPredictionTypes.join(', ')}`);
  }

  if (scorecard.worstPredictionTypes.length > 0) {
    parts.push(`**Improving:** ${scorecard.worstPredictionTypes.join(', ')}`);
  }

  if (scorecard.trustFactors.length > 0) {
    parts.push(`\n**Why you can trust this:**`);
    for (const factor of scorecard.trustFactors) {
      parts.push(`✓ ${factor}`);
    }
  }

  return parts.join('\n');
}
