/**
 * Learning Engine — TIER 2: Prediction Accuracy Measurement
 */

import { getDbAdapter } from '../../db/adapter.js';
import { logger } from '../../utils/logger.js';
import type { Prediction, StoredPrediction, PredictionAccuracy } from './types.js';

/**
 * Store a prediction for later verification
 */
export async function storePrediction(
  prediction: Prediction,
  clientId: string,
  expectedOutcome: StoredPrediction['expectedOutcome'],
): Promise<StoredPrediction> {
  const db = getDbAdapter();
  const id = `pred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Parse timeframe to calculate expiry
  const timeframeDays = parseTimeframeToDays(prediction.timeframe);
  const expiresAt = new Date(Date.now() + timeframeDays * 24 * 60 * 60 * 1000).toISOString();

  const stored: StoredPrediction = {
    ...prediction,
    id,
    clientId,
    createdAt: new Date().toISOString(),
    expiresAt,
    expectedOutcome,
    status: 'pending',
  };

  try {
    await db.run(`
      INSERT INTO predictions (id, client_id, type, prediction_text, confidence, timeframe,
        expected_metric, expected_direction, expected_min_change, expires_at, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
    `, [
      id, clientId, prediction.type, prediction.prediction, prediction.confidence,
      prediction.timeframe, expectedOutcome.metric, expectedOutcome.direction,
      expectedOutcome.minChange || null, expiresAt
    ]);
  } catch (err) {
    // Table might not exist, log but don't fail
    logger.debug({ err }, '[LearningEngine] predictions table not found');
  }

  return stored;
}

/**
 * Parse timeframe string to days
 */
function parseTimeframeToDays(timeframe: string): number {
  const lower = timeframe.toLowerCase();

  // Handle ranges like "5-7 days"
  const rangeMatch = lower.match(/(\d+)-(\d+)\s*(days?|weeks?)/);
  if (rangeMatch) {
    const avg = (parseInt(rangeMatch[1]) + parseInt(rangeMatch[2])) / 2;
    if (rangeMatch[3].startsWith('week')) return avg * 7;
    return avg;
  }

  // Handle single values
  const singleMatch = lower.match(/(\d+)\s*(days?|weeks?|hours?)/);
  if (singleMatch) {
    const value = parseInt(singleMatch[1]);
    if (singleMatch[2].startsWith('week')) return value * 7;
    if (singleMatch[2].startsWith('hour')) return value / 24;
    return value;
  }

  return 7; // Default 7 days
}

/**
 * Verify expired predictions against actual outcomes
 */
export async function verifyPredictions(clientId: string): Promise<{
  verified: number;
  correct: number;
  incorrect: number;
}> {
  const db = getDbAdapter();
  let verified = 0, correct = 0, incorrect = 0;

  try {
    // Get pending predictions that have expired
    const pending = await db.all(`
      SELECT * FROM predictions
      WHERE client_id = ? AND status = 'pending' AND expires_at < datetime('now')
    `, [clientId]) as Array<{
      id: string;
      type: string;
      expected_metric: string;
      expected_direction: string;
      expected_min_change: number | null;
      confidence: number;
    }>;

    for (const pred of pending) {
      // Get actual metric data (would need to fetch from Meta/Shopify)
      // For now, we'll mark as expired if we can't verify
      const actualOutcome = await fetchActualOutcome(clientId, pred.expected_metric);

      if (!actualOutcome) {
        await db.run(`UPDATE predictions SET status = 'expired' WHERE id = ?`, [pred.id]);
        continue;
      }

      // Determine if prediction was correct
      const directionCorrect =
        (pred.expected_direction === 'increase' && actualOutcome.changePercent > 0) ||
        (pred.expected_direction === 'decrease' && actualOutcome.changePercent < 0) ||
        (pred.expected_direction === 'stable' && Math.abs(actualOutcome.changePercent) < 10);

      const magnitudeCorrect = !pred.expected_min_change ||
        Math.abs(actualOutcome.changePercent) >= pred.expected_min_change;

      const isCorrect = directionCorrect && magnitudeCorrect;

      await db.run(`
        UPDATE predictions
        SET status = ?, verified_at = datetime('now'),
            actual_value = ?, actual_change = ?
        WHERE id = ?
      `, [
        isCorrect ? 'verified_correct' : 'verified_incorrect',
        actualOutcome.actualValue,
        actualOutcome.changePercent,
        pred.id
      ]);

      verified++;
      if (isCorrect) correct++;
      else incorrect++;
    }
  } catch (err) {
    logger.debug({ err }, '[LearningEngine] Error verifying predictions');
  }

  if (verified > 0) {
    logger.info({ clientId, verified, correct, incorrect }, '[LearningEngine] Verified predictions');
  }

  return { verified, correct, incorrect };
}

/**
 * Fetch actual outcome for a metric (placeholder - needs real implementation)
 */
async function fetchActualOutcome(
  clientId: string,
  metric: string,
): Promise<{ actualValue: number; previousValue: number; changePercent: number } | null> {
  // This would fetch from Meta API or cached insights
  // For now, return null to mark predictions as expired
  const db = getDbAdapter();

  try {
    // Try to get from cached insights
    const recent = await db.all(`
      SELECT * FROM daily_metrics
      WHERE client_id = ? AND metric_name = ?
      ORDER BY date DESC LIMIT 2
    `, [clientId, metric]) as Array<{ value: number; date: string }>;

    if (recent.length >= 2) {
      const actualValue = recent[0].value;
      const previousValue = recent[1].value;
      const changePercent = previousValue > 0
        ? ((actualValue - previousValue) / previousValue) * 100
        : 0;

      return { actualValue, previousValue, changePercent };
    }
  } catch {
    // Table doesn't exist or no data
  }

  return null;
}

/**
 * Get prediction accuracy stats for a client
 */
export async function getPredictionAccuracy(clientId: string): Promise<PredictionAccuracy[]> {
  const db = getDbAdapter();
  const stats: PredictionAccuracy[] = [];

  try {
    const types: Prediction['type'][] = ['fatigue', 'roas_decline', 'cpa_spike', 'opportunity'];

    for (const type of types) {
      const rows = await db.get(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'verified_correct' THEN 1 ELSE 0 END) as correct,
          SUM(CASE WHEN status = 'verified_incorrect' THEN 1 ELSE 0 END) as incorrect,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          AVG(CASE WHEN status = 'verified_correct' THEN confidence ELSE NULL END) as avg_conf_correct,
          AVG(CASE WHEN status = 'verified_incorrect' THEN confidence ELSE NULL END) as avg_conf_incorrect
        FROM predictions
        WHERE client_id = ? AND type = ?
      `, [clientId, type]) as any;

      if (rows && rows.total > 0) {
        const total = rows.correct + rows.incorrect;
        stats.push({
          type,
          totalPredictions: rows.total,
          correctPredictions: rows.correct || 0,
          incorrectPredictions: rows.incorrect || 0,
          pendingPredictions: rows.pending || 0,
          accuracyRate: total > 0 ? (rows.correct || 0) / total : 0,
          avgConfidenceWhenCorrect: rows.avg_conf_correct || 0,
          avgConfidenceWhenIncorrect: rows.avg_conf_incorrect || 0,
        });
      }
    }
  } catch {
    // Table doesn't exist
  }

  return stats;
}

/**
 * Adjust prediction confidence based on historical accuracy
 */
export async function adjustConfidenceByAccuracy(
  prediction: Prediction,
  clientId: string,
): Promise<number> {
  const accuracyStats = await getPredictionAccuracy(clientId);
  const typeStats = accuracyStats.find(s => s.type === prediction.type);

  if (!typeStats || typeStats.totalPredictions < 5) {
    // Not enough data to adjust
    return prediction.confidence;
  }

  // Adjust confidence based on historical accuracy
  // If 80% accurate, multiply by 1.0. If 50% accurate, multiply by 0.7
  const accuracyMultiplier = 0.5 + (typeStats.accuracyRate * 0.5);

  return Math.round(prediction.confidence * accuracyMultiplier);
}
