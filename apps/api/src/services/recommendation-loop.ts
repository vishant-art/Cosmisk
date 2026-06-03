/**
 * RECOMMENDATION LOOP - The Closed-Loop Operating System Core
 *
 * This is the infrastructure that transforms stateless agents into an operating system.
 *
 * The loop:
 * 1. DETECT → Agent finds something
 * 2. RECOMMEND → System creates tracked recommendation
 * 3. TRACK → Monitor if recommendation was executed
 * 4. VALIDATE → Measure outcome vs prediction
 * 5. LEARN → Update reasoning for next time
 *
 * Every recommendation has a lifecycle, not just a report.
 */

import { getDbAdapter } from '../db/adapter.js';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';

// ============================================================
// TYPES
// ============================================================

export type RecommendationType =
  | 'pause_campaign'
  | 'increase_budget'
  | 'decrease_budget'
  | 'refresh_creative'
  | 'test_creative'
  | 'fix_oos'
  | 'fix_discount_leak'
  | 'change_targeting'
  | 'adjust_bidding'
  | 'general';

export type RecommendationStatus =
  | 'pending'      // Just created, waiting for action
  | 'executed'     // User took the recommended action
  | 'ignored'      // User decided not to act
  | 'partially'    // User did something similar
  | 'auto_executed' // System executed automatically
  | 'expired';     // Too old, no longer relevant

export interface Recommendation {
  id: string;
  clientId: string;
  agentId: string;
  type: RecommendationType;
  entityType: 'campaign' | 'adset' | 'ad' | 'creative' | 'product' | 'account';
  entityId: string;
  entityName: string;

  // The recommendation itself
  action: string;           // What to do: "Pause this campaign"
  reasoning: string;        // Why: "CTR dropped 40% in 7 days, CPA spiked to ₹2,400"
  evidence: string[];       // Supporting data points
  confidence: number;       // 0-100

  // Prediction
  predictedOutcome: string; // "Will save ₹15,000/week"
  predictedMetric: string;  // "weekly_spend"
  predictedValue: number;   // 15000
  predictedDirection: 'increase' | 'decrease' | 'maintain';

  // Status
  status: RecommendationStatus;
  createdAt: Date;
  executedAt: Date | null;
  validatedAt: Date | null;

  // Outcome (filled after validation)
  actualOutcome: string | null;
  actualValue: number | null;
  predictionAccurate: boolean | null;
  accuracyScore: number | null;
}

export interface RecommendationInput {
  clientId: string;
  agentId: string;
  type: RecommendationType;
  entityType: Recommendation['entityType'];
  entityId: string;
  entityName: string;
  action: string;
  reasoning: string;
  evidence: string[];
  confidence: number;
  predictedOutcome: string;
  predictedMetric: string;
  predictedValue: number;
  predictedDirection: 'increase' | 'decrease' | 'maintain';
}

// ============================================================
// STEP 1: CREATE RECOMMENDATION
// ============================================================

/**
 * Create a tracked recommendation. Every agent output should go through this.
 */
export async function createRecommendation(input: RecommendationInput): Promise<Recommendation> {
  const db = getDbAdapter();
  const id = uuidv4();
  const now = new Date().toISOString();

  // Check for duplicate recommendations (same entity + type in last 7 days)
  const existingDuplicate = await findDuplicateRecommendation(
    input.clientId,
    input.entityId,
    input.type
  );

  if (existingDuplicate) {
    logger.info({ entityId: input.entityId }, '[LOOP] Duplicate recommendation found, returning existing');
    return existingDuplicate;
  }

  await db.run(`
    INSERT INTO recommendations (
      id, client_id, agent_id, type, entity_type, entity_id, entity_name,
      action, reasoning, evidence, confidence,
      predicted_outcome, predicted_metric, predicted_value, predicted_direction,
      status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    input.clientId,
    input.agentId,
    input.type,
    input.entityType,
    input.entityId,
    input.entityName,
    input.action,
    input.reasoning,
    JSON.stringify(input.evidence),
    input.confidence,
    input.predictedOutcome,
    input.predictedMetric,
    input.predictedValue,
    input.predictedDirection,
    'pending',
    now
  ]);

  logger.info({ id, action: input.action }, '[LOOP] Created recommendation');

  return {
    id,
    ...input,
    status: 'pending',
    createdAt: new Date(now),
    executedAt: null,
    validatedAt: null,
    actualOutcome: null,
    actualValue: null,
    predictionAccurate: null,
    accuracyScore: null,
  };
}

/**
 * Check for duplicate recommendations
 */
async function findDuplicateRecommendation(
  clientId: string,
  entityId: string,
  type: RecommendationType
): Promise<Recommendation | null> {
  const db = getDbAdapter();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const row = await db.get(`
    SELECT * FROM recommendations
    WHERE client_id = ? AND entity_id = ? AND type = ?
      AND created_at >= ? AND status = 'pending'
    LIMIT 1
  `, [clientId, entityId, type, sevenDaysAgo.toISOString()]) as any;  // DB-2: typed when row becomes a Drizzle result

  return row ? mapRowToRecommendation(row) : null;
}

// ============================================================
// STEP 2: TRACK EXECUTION
// ============================================================

/**
 * Mark a recommendation as executed (user took the action)
 */
export async function markExecuted(recommendationId: string, _executionNotes?: string): Promise<void> {
  const db = getDbAdapter();
  const now = new Date().toISOString();

  await db.run(`
    UPDATE recommendations
    SET status = 'executed', executed_at = ?
    WHERE id = ?
  `, [now, recommendationId]);

  logger.info({ recommendationId }, '[LOOP] Marked as executed');
}

/**
 * Mark as ignored (user decided not to act)
 */
export async function markIgnored(recommendationId: string, ignoreReason?: string): Promise<void> {
  const db = getDbAdapter();

  await db.run(`
    UPDATE recommendations SET status = 'ignored' WHERE id = ?
  `, [recommendationId]);

  logger.info({ recommendationId, ignoreReason: ignoreReason || 'no reason' }, '[LOOP] Marked as ignored');
}

/**
 * Detect execution automatically by comparing entity state
 */
export async function detectExecution(
  clientId: string,
  entityId: string,
  currentState: Record<string, unknown>
): Promise<void> {
  const db = getDbAdapter();

  const pending = await db.all(`
    SELECT * FROM recommendations
    WHERE client_id = ? AND entity_id = ? AND status = 'pending'
  `, [clientId, entityId]) as any[];  // DB-2: typed when row becomes a Drizzle result

  for (const rec of pending) {
    const executed = checkIfExecuted(rec, currentState);
    if (executed) {
      await markExecuted(rec.id, 'Auto-detected');
    }
  }
}

/**
 * Check if recommendation was executed based on current state
 */
function checkIfExecuted(
  rec: any,
  currentState: Record<string, unknown>
): boolean {
  switch (rec.type) {
    case 'pause_campaign':
      return currentState['status'] === 'PAUSED';

    case 'increase_budget':
      return Number(currentState['dailyBudget']) >= Number(rec.predicted_value);

    case 'decrease_budget':
      return Number(currentState['dailyBudget']) <= Number(rec.predicted_value);

    case 'fix_oos':
      return Number(currentState['inventoryQuantity']) > 0;

    default:
      return false;
  }
}

// ============================================================
// STEP 3: VALIDATE OUTCOMES
// ============================================================

/**
 * Validate outcome of an executed recommendation
 */
export async function validateOutcome(
  recommendationId: string,
  actualMetricValue: number,
  actualOutcomeDescription: string
): Promise<{
  predictionAccurate: boolean;
  accuracyScore: number;
  analysis: string;
}> {
  const db = getDbAdapter();
  const rec = await getRecommendation(recommendationId);

  if (!rec) {
    throw new Error(`Recommendation ${recommendationId} not found`);
  }

  // Calculate accuracy
  const { accurate, score, analysis } = calculateAccuracy(
    rec.predictedValue,
    actualMetricValue,
    rec.predictedDirection
  );

  const now = new Date().toISOString();

  // Update recommendation
  await db.run(`
    UPDATE recommendations
    SET validated_at = ?, actual_value = ?, actual_outcome = ?,
        prediction_accurate = ?, accuracy_score = ?
    WHERE id = ?
  `, [now, actualMetricValue, actualOutcomeDescription, accurate ? 1 : 0, score, recommendationId]);

  // Record in prediction accuracy table
  await recordPredictionAccuracy(rec, actualMetricValue, score);

  logger.info({ recommendationId, result: accurate ? 'ACCURATE' : 'INACCURATE', score }, '[LOOP] Validated');

  return {
    predictionAccurate: accurate,
    accuracyScore: score,
    analysis,
  };
}

/**
 * Calculate prediction accuracy
 */
function calculateAccuracy(
  predicted: number,
  actual: number,
  direction: 'increase' | 'decrease' | 'maintain'
): {
  accurate: boolean;
  score: number;
  analysis: string;
} {
  const actualDirection = actual > predicted ? 'increase' : actual < predicted ? 'decrease' : 'maintain';
  const directionCorrect = actualDirection === direction || direction === 'maintain';

  const percentDiff = Math.abs(actual - predicted) / Math.max(predicted, 1);
  const valueScore = Math.max(0, 100 - percentDiff * 100);

  const score = Math.round(directionCorrect ? valueScore : valueScore * 0.5);
  const accurate = score >= 70;

  const analysis = directionCorrect
    ? `Prediction direction correct. Value accuracy: ${valueScore.toFixed(0)}%`
    : `Prediction direction wrong. Expected ${direction}, got ${actualDirection}`;

  return { accurate, score, analysis };
}

/**
 * Record prediction accuracy for learning
 */
async function recordPredictionAccuracy(
  rec: Recommendation,
  actualValue: number,
  score: number
): Promise<void> {
  const db = getDbAdapter();
  const id = uuidv4();
  const now = new Date().toISOString();

  await db.run(`
    INSERT INTO prediction_accuracy (
      id, client_id, agent_id, recommendation_type, entity_type,
      predicted_value, actual_value, accuracy_score, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    rec.clientId,
    rec.agentId,
    rec.type,
    rec.entityType,
    rec.predictedValue,
    actualValue,
    score,
    now
  ]);
}

// ============================================================
// STEP 4: LEARN
// ============================================================

/**
 * Get agent accuracy stats for learning
 */
export async function getAgentAccuracyStats(
  clientId: string,
  agentId: string
): Promise<{
  totalPredictions: number;
  accuratePredictions: number;
  averageAccuracyScore: number;
  accuracyByType: Record<string, number>;
  recentTrend: 'improving' | 'declining' | 'stable';
}> {
  const db = getDbAdapter();

  const results = await db.all(`
    SELECT * FROM prediction_accuracy
    WHERE client_id = ? AND agent_id = ?
    ORDER BY created_at DESC
  `, [clientId, agentId]) as any[];  // DB-2: typed when row becomes a Drizzle result

  if (results.length === 0) {
    return {
      totalPredictions: 0,
      accuratePredictions: 0,
      averageAccuracyScore: 0,
      accuracyByType: {},
      recentTrend: 'stable',
    };
  }

  const totalPredictions = results.length;
  const accuratePredictions = results.filter(r => r.accuracy_score >= 70).length;
  const averageAccuracyScore = results.reduce((sum, r) => sum + r.accuracy_score, 0) / totalPredictions;

  // Accuracy by type
  const byType: Record<string, { sum: number; count: number }> = {};
  for (const r of results) {
    if (!byType[r.recommendation_type]) {
      byType[r.recommendation_type] = { sum: 0, count: 0 };
    }
    byType[r.recommendation_type].sum += r.accuracy_score;
    byType[r.recommendation_type].count += 1;
  }

  const accuracyByType: Record<string, number> = {};
  for (const [type, data] of Object.entries(byType)) {
    accuracyByType[type] = Math.round(data.sum / data.count);
  }

  // Recent trend
  let recentTrend: 'improving' | 'declining' | 'stable' = 'stable';
  if (results.length >= 20) {
    const recent10 = results.slice(0, 10);
    const previous10 = results.slice(10, 20);
    const recentAvg = recent10.reduce((sum, r) => sum + r.accuracy_score, 0) / 10;
    const previousAvg = previous10.reduce((sum, r) => sum + r.accuracy_score, 0) / 10;

    if (recentAvg > previousAvg + 5) recentTrend = 'improving';
    else if (recentAvg < previousAvg - 5) recentTrend = 'declining';
  }

  return {
    totalPredictions,
    accuratePredictions,
    averageAccuracyScore: Math.round(averageAccuracyScore),
    accuracyByType,
    recentTrend,
  };
}

/**
 * Get learning insights for an agent
 */
export async function getLearningInsights(
  clientId: string,
  agentId: string
): Promise<{
  strongAreas: string[];
  weakAreas: string[];
  suggestions: string[];
}> {
  const stats = await getAgentAccuracyStats(clientId, agentId);

  const strongAreas: string[] = [];
  const weakAreas: string[] = [];
  const suggestions: string[] = [];

  for (const [type, accuracy] of Object.entries(stats.accuracyByType)) {
    if (accuracy >= 80) {
      strongAreas.push(`${type}: ${accuracy}% accuracy`);
    } else if (accuracy < 60) {
      weakAreas.push(`${type}: ${accuracy}% accuracy`);
      suggestions.push(`Improve ${type} predictions - consider gathering more data`);
    }
  }

  if (stats.recentTrend === 'declining') {
    suggestions.push('Recent accuracy is declining - review prediction methodology');
  }

  if (stats.totalPredictions < 10) {
    suggestions.push('Limited data - more validated predictions needed');
  }

  return { strongAreas, weakAreas, suggestions };
}

// ============================================================
// QUERIES
// ============================================================

/**
 * Get a single recommendation
 */
export async function getRecommendation(id: string): Promise<Recommendation | null> {
  const db = getDbAdapter();
  const row = await db.get('SELECT * FROM recommendations WHERE id = ?', [id]) as any;  // DB-2: typed when row becomes a Drizzle result
  return row ? mapRowToRecommendation(row) : null;
}

/**
 * Get pending recommendations for a client
 */
export async function getPendingRecommendations(clientId: string): Promise<Recommendation[]> {
  const db = getDbAdapter();
  const rows = await db.all(`
    SELECT * FROM recommendations
    WHERE client_id = ? AND status = 'pending'
    ORDER BY created_at DESC
  `, [clientId]) as any[];  // DB-2: typed when row becomes a Drizzle result

  return rows.map(mapRowToRecommendation);
}

/**
 * Get recommendations needing validation
 */
export async function getRecommendationsNeedingValidation(clientId: string): Promise<Recommendation[]> {
  const db = getDbAdapter();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const rows = await db.all(`
    SELECT * FROM recommendations
    WHERE client_id = ? AND status = 'executed'
      AND executed_at <= ? AND validated_at IS NULL
  `, [clientId, sevenDaysAgo.toISOString()]) as any[];  // DB-2: typed when row becomes a Drizzle result

  return rows.map(mapRowToRecommendation);
}

/**
 * Get recommendation history for an entity
 */
export async function getEntityHistory(clientId: string, entityId: string): Promise<Recommendation[]> {
  const db = getDbAdapter();
  const rows = await db.all(`
    SELECT * FROM recommendations
    WHERE client_id = ? AND entity_id = ?
    ORDER BY created_at DESC
  `, [clientId, entityId]) as any[];  // DB-2: typed when row becomes a Drizzle result

  return rows.map(mapRowToRecommendation);
}

/**
 * Map database row to Recommendation type
 */
function mapRowToRecommendation(row: any): Recommendation {
  return {
    id: row.id,
    clientId: row.client_id,
    agentId: row.agent_id,
    type: row.type as RecommendationType,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityName: row.entity_name,
    action: row.action,
    reasoning: row.reasoning,
    evidence: JSON.parse(row.evidence || '[]'),
    confidence: row.confidence,
    predictedOutcome: row.predicted_outcome,
    predictedMetric: row.predicted_metric,
    predictedValue: row.predicted_value,
    predictedDirection: row.predicted_direction,
    status: row.status as RecommendationStatus,
    createdAt: new Date(row.created_at),
    executedAt: row.executed_at ? new Date(row.executed_at) : null,
    validatedAt: row.validated_at ? new Date(row.validated_at) : null,
    actualOutcome: row.actual_outcome,
    actualValue: row.actual_value,
    predictionAccurate: row.prediction_accurate === 1,
    accuracyScore: row.accuracy_score,
  };
}

// ============================================================
// LOOP STATUS - For agents to check before making recommendations
// ============================================================

/**
 * Get loop status summary for a client
 */
export async function getLoopStatus(clientId: string): Promise<{
  pendingRecommendations: number;
  executedAwaitingValidation: number;
  validatedLast30Days: number;
  overallAccuracy: number;
  topPerformingAgents: { agentId: string; accuracy: number }[];
  needsAttention: string[];
}> {
  const db = getDbAdapter();

  const pending = await getPendingRecommendations(clientId);
  const needingValidation = await getRecommendationsNeedingValidation(clientId);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const validated = await db.all(`
    SELECT * FROM recommendations
    WHERE client_id = ? AND validated_at >= ?
  `, [clientId, thirtyDaysAgo.toISOString()]) as any[];  // DB-2: typed when row becomes a Drizzle result

  const overallAccuracy = validated.length > 0
    ? Math.round(validated.reduce((sum, r) => sum + (r.accuracy_score || 0), 0) / validated.length)
    : 0;

  // Agent performance
  const agentScores: Record<string, { sum: number; count: number }> = {};
  for (const v of validated) {
    if (!agentScores[v.agent_id]) {
      agentScores[v.agent_id] = { sum: 0, count: 0 };
    }
    agentScores[v.agent_id].sum += v.accuracy_score || 0;
    agentScores[v.agent_id].count += 1;
  }

  const topPerformingAgents = Object.entries(agentScores)
    .map(([agentId, data]) => ({
      agentId,
      accuracy: Math.round(data.sum / data.count),
    }))
    .sort((a, b) => b.accuracy - a.accuracy)
    .slice(0, 5);

  // What needs attention
  const needsAttention: string[] = [];
  if (pending.length > 20) {
    needsAttention.push(`${pending.length} pending recommendations - review backlog`);
  }
  if (needingValidation.length > 10) {
    needsAttention.push(`${needingValidation.length} executed recommendations need validation`);
  }
  if (overallAccuracy < 60 && validated.length >= 10) {
    needsAttention.push(`Overall accuracy is ${overallAccuracy}% - predictions need improvement`);
  }

  return {
    pendingRecommendations: pending.length,
    executedAwaitingValidation: needingValidation.length,
    validatedLast30Days: validated.length,
    overallAccuracy,
    topPerformingAgents,
    needsAttention,
  };
}

// ============================================================
// AGENT INTEGRATION - Helper for agents to use the loop
// ============================================================

/**
 * Helper for agents: Create recommendation with sensible defaults
 */
export async function agentRecommend(
  clientId: string,
  agentId: string,
  params: {
    type: RecommendationType;
    entityType: Recommendation['entityType'];
    entityId: string;
    entityName: string;
    action: string;
    reasoning: string;
    evidence: string[];
    confidence: number;
    predictedSavings?: number;
    predictedROASIncrease?: number;
  }
): Promise<Recommendation> {
  // Determine prediction based on type
  let predictedOutcome: string;
  let predictedMetric: string;
  let predictedValue: number;
  let predictedDirection: 'increase' | 'decrease' | 'maintain';

  if (params.predictedSavings) {
    predictedOutcome = `Save ₹${params.predictedSavings.toLocaleString()}`;
    predictedMetric = 'spend_reduction';
    predictedValue = params.predictedSavings;
    predictedDirection = 'decrease';
  } else if (params.predictedROASIncrease) {
    predictedOutcome = `Increase ROAS by ${params.predictedROASIncrease}%`;
    predictedMetric = 'roas_improvement';
    predictedValue = params.predictedROASIncrease;
    predictedDirection = 'increase';
  } else {
    predictedOutcome = 'Improve performance';
    predictedMetric = 'general_improvement';
    predictedValue = 0;
    predictedDirection = 'maintain';
  }

  return await createRecommendation({
    clientId,
    agentId,
    type: params.type,
    entityType: params.entityType,
    entityId: params.entityId,
    entityName: params.entityName,
    action: params.action,
    reasoning: params.reasoning,
    evidence: params.evidence,
    confidence: params.confidence,
    predictedOutcome,
    predictedMetric,
    predictedValue,
    predictedDirection,
  });
}
