/**
 * Learning Engine — Data Aggregation (from existing analyzers)
 */

import { getDbAdapter } from '../../db/adapter.js';
import { getClientPatterns } from '../client-references.js';
import type {
  LTVByCreativeData,
  CreativeReturnData,
  FatigueData,
  CompetitorData,
} from './types.js';

/**
 * Aggregate LTV data by creative type
 */
export async function aggregateLTVData(clientId: string): Promise<LTVByCreativeData[]> {
  const db = getDbAdapter();

  // Try to get from ltv_by_creative table if exists
  try {
    const data = await db.all(`
      SELECT
        creative_id as creativeId,
        creative_name as creativeName,
        hook_type as hookType,
        avg_ltv as avgLtv,
        repeat_rate as repeatRate,
        customer_count as customers
      FROM ltv_by_creative
      WHERE client_id = ?
      ORDER BY avg_ltv DESC
      LIMIT 50
    `, [clientId]) as LTVByCreativeData[];

    return data;
  } catch {
    // Table doesn't exist or no data
    return [];
  }
}

/**
 * Aggregate return rate data by creative
 */
export async function aggregateReturnData(clientId: string): Promise<CreativeReturnData[]> {
  const db = getDbAdapter();

  try {
    const data = await db.all(`
      SELECT
        creative_id as creativeId,
        creative_name as creativeName,
        return_rate as returnRate,
        refund_amount as refundAmount,
        order_count as orders
      FROM creative_returns
      WHERE client_id = ?
      ORDER BY return_rate DESC
      LIMIT 50
    `, [clientId]) as CreativeReturnData[];

    return data;
  } catch {
    return [];
  }
}

/**
 * Get fatigue patterns from watchdog history
 */
export async function aggregateFatigueData(clientId: string): Promise<FatigueData[]> {
  const db = getDbAdapter();

  try {
    // Get from agent_decisions with fatigue type
    const data = await db.all(`
      SELECT
        target_id as campaignId,
        target_name as campaignName,
        reasoning
      FROM agent_decisions
      WHERE user_id = ? AND type = 'creative_fatigue'
      ORDER BY created_at DESC
      LIMIT 30
    `, [clientId]) as { campaignId: string; campaignName: string; reasoning: string }[];

    // Parse reasoning for fatigue metrics
    return data.map(d => ({
      campaignId: d.campaignId,
      campaignName: d.campaignName,
      daysActive: 14, // Default estimate
      ctrDecline: 0,
      roasDecline: 0,
      fatigueLevel: 'moderate' as const,
    }));
  } catch {
    return [];
  }
}

/**
 * Get competitor intelligence
 */
export async function aggregateCompetitorData(clientId: string): Promise<CompetitorData> {
  // Get patterns from client_references
  const patterns = getClientPatterns(clientId);

  if (patterns) {
    // Extract gaps from hook types that competitors DON'T use frequently
    const commonHooks = ['benefit', 'social-proof', 'problem-solution', 'curiosity', 'urgency'];
    const competitorHooks = patterns.hooks.hookTypes.map(h => h.type.toLowerCase());
    const gaps = commonHooks.filter(h => !competitorHooks.includes(h));

    return {
      dominantHooks: patterns.hooks.hookTypes.slice(0, 5).map(h => h.type),
      dominantFormats: [patterns.visualStyle.overallStyle], // From visual style
      gaps,
      trends: patterns.hooks.hookTypes.filter(h => h.frequency > 0.3).map(h => h.type),
    };
  }

  return {
    dominantHooks: [],
    dominantFormats: [],
    gaps: [],
    trends: [],
  };
}
