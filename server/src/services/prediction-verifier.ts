/**
 * PREDICTION VERIFIER
 *
 * Fetches actual metrics from Meta/Shopify to verify predictions made by Strategic Cognition.
 * This closes the learning loop - we check if our predictions were correct and learn from errors.
 */

import { getPendingPredictions, verifyPrediction, PredictionRecord } from './strategic-memory.js';
import { getClient } from './service-clients.js';
import { MetaApiService } from './meta-api.js';
import { getShopifyClientForUser } from './shopify-client.js';
import { logger } from '../utils/logger.js';
import { getDbAdapter } from '../db/adapter.js';
import { decryptToken } from './token-crypto.js';

// ============================================================================
// TYPES
// ============================================================================

export interface MetricFetcher {
  (clientId: string, entityId: string): Promise<number | null>;
}

export interface VerificationStats {
  verified: number;
  correct: number;
  incorrect: number;
  skipped: number;
}

// ============================================================================
// METRIC FETCHERS
// ============================================================================

/**
 * Fetch ROAS for a campaign/adset/ad
 */
async function fetchRoas(clientId: string, entityId: string): Promise<number | null> {
  try {
    const client = await getClient(clientId);
    if (!client?.metaAdAccountId) return null;

    const token = await getMetaAccessToken(clientId);
    if (!token) return null;

    const metaApi = new MetaApiService(token);

    // Try to fetch insights for the entity
    const insights = await metaApi.get(`/${entityId}/insights`, {
      fields: 'purchase_roas',
      date_preset: 'last_7d',
    });

    const roas = insights.data?.[0]?.purchase_roas?.[0]?.value;
    return roas ? parseFloat(roas) : null;
  } catch (error) {
    logger.error(`[PredictionVerifier] Failed to fetch ROAS for ${entityId}: ${error}`);
    return null;
  }
}

/**
 * Fetch spend for a campaign/adset/ad
 */
async function fetchSpend(clientId: string, entityId: string): Promise<number | null> {
  try {
    const client = await getClient(clientId);
    if (!client?.metaAdAccountId) return null;

    const token = await getMetaAccessToken(clientId);
    if (!token) return null;

    const metaApi = new MetaApiService(token);

    const insights = await metaApi.get(`/${entityId}/insights`, {
      fields: 'spend',
      date_preset: 'last_7d',
    });

    const spend = insights.data?.[0]?.spend;
    return spend ? parseFloat(spend) : null;
  } catch (error) {
    logger.error(`[PredictionVerifier] Failed to fetch spend for ${entityId}: ${error}`);
    return null;
  }
}

/**
 * Fetch revenue for a campaign/adset/ad
 */
async function fetchRevenue(clientId: string, entityId: string): Promise<number | null> {
  try {
    const client = await getClient(clientId);
    if (!client?.metaAdAccountId) return null;

    const token = await getMetaAccessToken(clientId);
    if (!token) return null;

    const metaApi = new MetaApiService(token);

    const insights = await metaApi.get(`/${entityId}/insights`, {
      fields: 'action_values',
      date_preset: 'last_7d',
    });

    const actionValues = insights.data?.[0]?.action_values || [];
    const purchaseValue = actionValues.find((av: any) => av.action_type === 'purchase');
    return purchaseValue ? parseFloat(purchaseValue.value) : null;
  } catch (error) {
    logger.error(`[PredictionVerifier] Failed to fetch revenue for ${entityId}: ${error}`);
    return null;
  }
}

/**
 * Fetch conversions for a campaign/adset/ad
 */
async function fetchConversions(clientId: string, entityId: string): Promise<number | null> {
  try {
    const client = await getClient(clientId);
    if (!client?.metaAdAccountId) return null;

    const token = await getMetaAccessToken(clientId);
    if (!token) return null;

    const metaApi = new MetaApiService(token);

    const insights = await metaApi.get(`/${entityId}/insights`, {
      fields: 'actions',
      date_preset: 'last_7d',
    });

    const actions = insights.data?.[0]?.actions || [];
    const purchases = actions.find((a: any) => a.action_type === 'purchase');
    return purchases ? parseInt(purchases.value) : null;
  } catch (error) {
    logger.error(`[PredictionVerifier] Failed to fetch conversions for ${entityId}: ${error}`);
    return null;
  }
}

/**
 * Fetch CPA for a campaign/adset/ad
 */
async function fetchCpa(clientId: string, entityId: string): Promise<number | null> {
  try {
    const client = await getClient(clientId);
    if (!client?.metaAdAccountId) return null;

    const token = await getMetaAccessToken(clientId);
    if (!token) return null;

    const metaApi = new MetaApiService(token);

    const insights = await metaApi.get(`/${entityId}/insights`, {
      fields: 'spend,actions',
      date_preset: 'last_7d',
    });

    const spend = parseFloat(insights.data?.[0]?.spend || '0');
    const actions = insights.data?.[0]?.actions || [];
    const purchases = actions.find((a: any) => a.action_type === 'purchase');
    const conversions = purchases ? parseInt(purchases.value) : 0;

    return conversions > 0 ? spend / conversions : null;
  } catch (error) {
    logger.error(`[PredictionVerifier] Failed to fetch CPA for ${entityId}: ${error}`);
    return null;
  }
}

/**
 * Fetch CTR for a campaign/adset/ad
 */
async function fetchCtr(clientId: string, entityId: string): Promise<number | null> {
  try {
    const client = await getClient(clientId);
    if (!client?.metaAdAccountId) return null;

    const token = await getMetaAccessToken(clientId);
    if (!token) return null;

    const metaApi = new MetaApiService(token);

    const insights = await metaApi.get(`/${entityId}/insights`, {
      fields: 'ctr',
      date_preset: 'last_7d',
    });

    const ctr = insights.data?.[0]?.ctr;
    return ctr ? parseFloat(ctr) : null;
  } catch (error) {
    logger.error(`[PredictionVerifier] Failed to fetch CTR for ${entityId}: ${error}`);
    return null;
  }
}

// ============================================================================
// METRIC FETCHER REGISTRY
// ============================================================================

const METRIC_FETCHERS: Record<string, MetricFetcher> = {
  roas: fetchRoas,
  spend: fetchSpend,
  revenue: fetchRevenue,
  conversions: fetchConversions,
  purchases: fetchConversions, // Alias
  cpa: fetchCpa,
  ctr: fetchCtr,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get Meta access token for client
 */
async function getMetaAccessToken(clientId: string): Promise<string | null> {
  try {
    const db = getDbAdapter();
    const row = await db.get(`
      SELECT encrypted_access_token FROM meta_tokens WHERE brand_id = ?
    `, [clientId]) as { encrypted_access_token: string } | undefined;

    if (!row) return null;
    return decryptToken(row.encrypted_access_token);
  } catch (error) {
    logger.error(`[PredictionVerifier] Failed to get Meta token for ${clientId}: ${error}`);
    return null;
  }
}

/**
 * Parse prediction data JSON to extract metric info
 */
interface PredictionData {
  metricType: string;
  entityId: string;
  expectedValue: number;
}

function parsePredictionData(pred: PredictionRecord): PredictionData | null {
  try {
    // The prediction record already has metric and expectedValue at top level
    // But we need entityId from prediction text or data
    // For now, assume entityId is embedded in prediction text or we extract from reportId

    // Try to extract entity ID from prediction text
    // Format: "Campaign 123456789 will see ROAS increase to 3.5"
    const entityMatch = pred.prediction.match(/(?:Campaign|AdSet|Ad)\s+(\d+)/i);
    const entityId = entityMatch ? entityMatch[1] : null;

    if (!entityId) {
      logger.warn(`[PredictionVerifier] No entity ID found in prediction: ${pred.prediction}`);
      return null;
    }

    return {
      metricType: pred.metric.toLowerCase(),
      entityId,
      expectedValue: pred.expectedValue,
    };
  } catch (error) {
    logger.error(`[PredictionVerifier] Failed to parse prediction ${pred.id}: ${error}`);
    return null;
  }
}

/**
 * Compare actual vs expected with 20% tolerance
 */
function isCorrect(actual: number, expected: number, tolerance = 0.20): boolean {
  const diff = Math.abs(actual - expected);
  const threshold = expected * tolerance;
  return diff <= threshold;
}

// ============================================================================
// MAIN VERIFICATION FUNCTIONS
// ============================================================================

/**
 * Verify all pending predictions for a client
 */
export async function verifyPendingPredictions(clientId: string): Promise<VerificationStats> {
  const stats: VerificationStats = {
    verified: 0,
    correct: 0,
    incorrect: 0,
    skipped: 0,
  };

  const pendingPredictions = getPendingPredictions(clientId);

  if (pendingPredictions.length === 0) {
    logger.info(`[PredictionVerifier] No pending predictions for ${clientId}`);
    return stats;
  }

  logger.info(`[PredictionVerifier] Verifying ${pendingPredictions.length} predictions for ${clientId}`);

  for (const pred of pendingPredictions) {
    try {
      // Parse prediction data
      const data = parsePredictionData(pred);
      if (!data) {
        stats.skipped++;
        continue;
      }

      // Get appropriate fetcher
      const fetcher = METRIC_FETCHERS[data.metricType];
      if (!fetcher) {
        logger.warn(`[PredictionVerifier] No fetcher for metric type: ${data.metricType}`);
        stats.skipped++;
        continue;
      }

      // Fetch actual value
      const actualValue = await fetcher(clientId, data.entityId);
      if (actualValue === null) {
        logger.warn(`[PredictionVerifier] Could not fetch actual value for ${pred.id}`);
        stats.skipped++;
        continue;
      }

      // Compare with expected
      const correct = isCorrect(actualValue, data.expectedValue);

      // Generate lesson learned if incorrect
      let lessonLearned: string | undefined;
      if (!correct) {
        const errorPercent = Math.abs((actualValue - data.expectedValue) / data.expectedValue * 100);
        lessonLearned = `Prediction was ${errorPercent.toFixed(1)}% off. Expected ${data.expectedValue}, got ${actualValue}. Need to adjust ${pred.metric} prediction model.`;
      }

      // Record verification
      verifyPrediction(pred.id, actualValue, correct, lessonLearned);

      stats.verified++;
      if (correct) {
        stats.correct++;
      } else {
        stats.incorrect++;
      }

      logger.info(`[PredictionVerifier] Verified ${pred.id}: ${correct ? 'CORRECT' : 'INCORRECT'} (expected: ${data.expectedValue}, actual: ${actualValue})`);
    } catch (error) {
      logger.error(`[PredictionVerifier] Error verifying prediction ${pred.id}: ${error}`);
      stats.skipped++;
    }
  }

  logger.info(`[PredictionVerifier] ${clientId} verification complete: ${stats.correct}/${stats.verified} correct (${stats.skipped} skipped)`);
  return stats;
}

/**
 * Verify pending predictions for all clients
 */
export async function verifyAllClientsPredictions(): Promise<Record<string, VerificationStats>> {
  const db = getDbAdapter();
  const clients = await db.all('SELECT id FROM service_clients WHERE status = ?', ['active']) as { id: string }[];

  const results: Record<string, VerificationStats> = {};

  for (const client of clients) {
    try {
      const stats = await verifyPendingPredictions(client.id);
      results[client.id] = stats;
    } catch (error) {
      logger.error(`[PredictionVerifier] Error verifying predictions for ${client.id}: ${error}`);
      results[client.id] = {
        verified: 0,
        correct: 0,
        incorrect: 0,
        skipped: 0,
      };
    }
  }

  // Log overall summary
  const totalVerified = Object.values(results).reduce((sum, s) => sum + s.verified, 0);
  const totalCorrect = Object.values(results).reduce((sum, s) => sum + s.correct, 0);
  const totalIncorrect = Object.values(results).reduce((sum, s) => sum + s.incorrect, 0);
  const totalSkipped = Object.values(results).reduce((sum, s) => sum + s.skipped, 0);

  logger.info(`[PredictionVerifier] All clients verification complete: ${totalCorrect}/${totalVerified} correct (${totalIncorrect} incorrect, ${totalSkipped} skipped)`);

  return results;
}
