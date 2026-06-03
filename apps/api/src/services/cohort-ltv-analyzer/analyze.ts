/**
 * Cohort LTV Analyzer — main analysis orchestration, quick check, client-aware analysis
 */

import { logger } from '../../utils/logger.js';
import { getDbAdapter } from '../../db/adapter.js';
import { decryptToken } from '../token-crypto.js';
import {
  getClientContext, getCohortLTVStore, updateCohortLTVStore,
  getCohortLTVGapThreshold, createRecommendation,
} from '../service-clients.js';
// CLOSED-LOOP OPERATING SYSTEM
import { agentRecommend } from '../recommendation-loop.js';
// STRATEGIC MEMORY - Week-to-week learning
import { recordEpisode } from '../agent-memory.js';
import { getStrategicContextForAgent, recordReport, type ReportRecord } from '../strategic-memory.js';
import { v4 as uuidv4 } from 'uuid';

import type {
  CohortLTVAnalysis,
  CohortLTVQuickCheck,
  ClientCohortLTVReport,
} from './types.js';
import { fetchAllOrders } from './data-fetching.js';
import { buildCustomerMap } from './customer-map.js';
import { calculateChannelMetrics, calculateMonthlyCohorts, calculateLTVGap } from './metrics.js';
import { generateRecommendations, generateActionableRecommendations } from './recommendations.js';

// ============ MAIN FUNCTION ============

export async function analyzeCohortLTV(
  userId: string,
  options: {
    days?: number;
    minCustomersPerChannel?: number;
  } = {}
): Promise<CohortLTVAnalysis | null> {
  const { days = 90, minCustomersPerChannel = 10 } = options;

  logger.info(`[CohortLTV] Analyzing for user ${userId}, last ${days} days`);

  const db = getDbAdapter();

  // Get Shopify credentials
  const shopifyRow = await db.get<{ shop_domain: string; encrypted_access_token: string }>(
    'SELECT shop_domain, encrypted_access_token FROM shopify_tokens WHERE user_id = ?',
    [userId]
  );

  if (!shopifyRow) {
    logger.warn(`[CohortLTV] No Shopify connected for user ${userId}`);
    return null;
  }

  const store = shopifyRow.shop_domain;
  const token = decryptToken(shopifyRow.encrypted_access_token);

  try {
    // Fetch orders with pagination
    const since = new Date();
    since.setDate(since.getDate() - days);

    logger.info(`[CohortLTV] Fetching orders since ${since.toISOString()}`);

    const allOrders = await fetchAllOrders(store, token, since);
    logger.info(`[CohortLTV] Fetched ${allOrders.length} orders`);

    if (allOrders.length === 0) {
      logger.warn(`[CohortLTV] No orders found`);
      return null;
    }

    // Build customer map with LTV and acquisition source
    const customerMap = buildCustomerMap(allOrders);
    logger.info(`[CohortLTV] Found ${customerMap.size} unique customers`);

    // Calculate channel metrics
    const channelMetrics = calculateChannelMetrics(customerMap, minCustomersPerChannel);

    // Calculate monthly cohorts
    const monthlyCohorts = calculateMonthlyCohorts(customerMap);

    // Calculate overall metrics
    const totalCustomers = customerMap.size;
    const totalRevenue = Array.from(customerMap.values()).reduce((s, c) => s + c.totalSpent, 0);
    const avgAccountLTV = totalRevenue / totalCustomers;
    const repeatCustomers = Array.from(customerMap.values()).filter(c => c.orders.length > 1).length;
    const avgRepeatRate = (repeatCustomers / totalCustomers) * 100;

    // Find best and worst channels
    const sortedChannels = [...channelMetrics].sort((a, b) => b.avgLTV - a.avgLTV);
    const bestChannel = sortedChannels[0] || null;
    const worstChannel = sortedChannels[sortedChannels.length - 1] || null;

    // Calculate LTV gap
    const { ltvGap, ltvGapExplanation } = calculateLTVGap(channelMetrics, bestChannel);

    // Calculate attribution rate
    const knownSourceCustomers = Array.from(customerMap.values())
      .filter(c => c.acquisitionSource.key !== 'direct' && c.acquisitionSource.key !== 'other');
    const attributionRate = (knownSourceCustomers.length / totalCustomers) * 100;

    // Data quality based on attribution rate
    const dataQuality = attributionRate > 60 ? 'high' : attributionRate > 30 ? 'medium' : 'low';

    // Generate recommendations
    const recommendations = generateRecommendations(channelMetrics, avgAccountLTV, avgRepeatRate, ltvGap);

    const analysis: CohortLTVAnalysis = {
      period: `Last ${days} days`,
      daysAnalyzed: days,
      totalOrders: allOrders.length,
      totalCustomers,
      totalRevenue,
      avgAccountLTV,
      avgRepeatRate,
      channels: channelMetrics,
      bestChannel,
      worstChannel,
      monthlyCohorts,
      ltvGap,
      ltvGapExplanation,
      recommendations,
      dataQuality,
      attributionRate,
      analyzedAt: new Date().toISOString(),
    };

    logger.info(`[CohortLTV] Analysis complete: ${channelMetrics.length} channels, ${attributionRate.toFixed(1)}% attribution`);

    return analysis;

  } catch (error) {
    logger.error(`[CohortLTV] Error: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

// ============ QUICK CHECK (For Watchdog Integration) ============

export async function quickCohortLTVCheck(userId: string): Promise<CohortLTVQuickCheck | null> {
  const analysis = await analyzeCohortLTV(userId, { days: 30, minCustomersPerChannel: 10 });

  if (!analysis || !analysis.bestChannel || !analysis.worstChannel) {
    return null;
  }

  const ltvGap = analysis.bestChannel.avgLTV - analysis.worstChannel.avgLTV;
  const ltvGapPercent = analysis.worstChannel.avgLTV > 0
    ? (ltvGap / analysis.worstChannel.avgLTV) * 100
    : 0;

  // Get actionable recommendations
  const actions = generateActionableRecommendations(
    analysis.channels,
    analysis.avgAccountLTV,
    analysis.avgRepeatRate,
    analysis.ltvGap
  );

  const topAction = actions.find(a => a.priority === 'high') || actions[0] || null;
  const hasSignificantGap = ltvGapPercent > 10 && ltvGap > 300;

  // Build summary for watchdog
  let summary = `${analysis.bestChannel.displayName} customers worth ₹${Math.round(ltvGap).toLocaleString()} more than ${analysis.worstChannel.displayName} (${ltvGapPercent.toFixed(0)}% higher LTV).`;

  if (topAction && topAction.type !== 'healthy') {
    summary += ` ${topAction.action}`;
  }

  return {
    hasSignificantGap,
    bestChannel: analysis.bestChannel.displayName,
    worstChannel: analysis.worstChannel.displayName,
    ltvGap,
    ltvGapPercent,
    topAction,
    summary,
  };
}

// ============ CLIENT-AWARE COHORT LTV ============

/**
 * Analyze Cohort LTV for a specific client
 * - Uses client's Shopify credentials
 * - Applies revenue-level LTV gap thresholds
 * - Tracks analysis history
 */
export async function analyzeCohortLTVForClient(
  clientId: string,
  options?: { days?: number },
): Promise<ClientCohortLTVReport | null> {
  const ctx = await getClientContext(clientId);
  if (!ctx) {
    logger.error({ clientId }, '[CohortLTV Client] Client not found');
    return null;
  }

  const { client } = ctx;
  const ltvStore = await getCohortLTVStore(clientId);

  // === STRATEGIC MEMORY: Load context from previous runs ===
  const strategicContext = await getStrategicContextForAgent(clientId);
  if (strategicContext) {
    logger.info({ contextLength: strategicContext.length }, '[CohortLTV] Loaded strategic context');
  }

  logger.info({
    clientId,
    brandName: client.brandName,
    revenueLevel: client.revenueLevel,
  }, '[CohortLTV Client] Starting analysis');

  // Get gap threshold for this client
  const gapThreshold = getCohortLTVGapThreshold(client);
  logger.info({ gapThreshold }, '[CohortLTV Client] Using gap threshold');

  // Get Shopify credentials from database
  // Note: In real usage, we'd need a user association to get the Shopify token
  // For now, we'll use the existing analyzeCohortLTV which handles this internally

  // Run the analysis (uses userId internally to find Shopify connection)
  const analysis = await analyzeCohortLTV(clientId, { days: options?.days || 90 });

  if (!analysis) {
    logger.warn({ clientId }, '[CohortLTV Client] No analysis data available');
    return null;
  }

  // Calculate LTV gap percentage
  const ltvGapPercent = analysis.bestChannel && analysis.worstChannel
    ? Math.round(((analysis.bestChannel.avgLTV - analysis.worstChannel.avgLTV) / analysis.worstChannel.avgLTV) * 100)
    : 0;

  // Determine if we should alert based on gap threshold
  const shouldAlert = ltvGapPercent >= gapThreshold && analysis.bestChannel !== null;
  const alertReason = shouldAlert
    ? `${ltvGapPercent}% LTV gap between ${analysis.bestChannel?.displayName} and ${analysis.worstChannel?.displayName}`
    : undefined;

  logger.info({
    ltvGapPercent,
    gapThreshold,
    shouldAlert,
  }, '[CohortLTV Client] Alert decision');

  // Update LTV store
  await updateCohortLTVStore(clientId, {
    lastAnalyzedAt: new Date().toISOString(),
    bestChannel: analysis.bestChannel?.displayName,
    worstChannel: analysis.worstChannel?.displayName,
    ltvGap: analysis.ltvGap,
    avgLTV: analysis.avgAccountLTV,
    alertsSent: shouldAlert ? (ltvStore?.alertsSent || 0) + 1 : ltvStore?.alertsSent || 0,
    lastAlertAt: shouldAlert ? new Date().toISOString() : ltvStore?.lastAlertAt,
  });

  // Create recommendation if significant gap found
  if (shouldAlert) {
    await createRecommendation(clientId, 'cohort_ltv', 'rebalance_channel_budget', {
      bestChannel: analysis.bestChannel?.displayName,
      worstChannel: analysis.worstChannel?.displayName,
      ltvGap: analysis.ltvGap,
      ltvGapPercent,
      recommendations: analysis.recommendations,
    });

    // === CLOSED-LOOP OPERATING SYSTEM ===
    if (analysis.worstChannel && analysis.bestChannel) {
      try {
        await agentRecommend(clientId, 'cohort_ltv', {
          type: 'change_targeting',
          entityType: 'account',
          entityId: analysis.worstChannel.displayName,
          entityName: analysis.worstChannel.displayName,
          action: `Shift budget from ${analysis.worstChannel.displayName} to ${analysis.bestChannel.displayName}`,
          reasoning: `LTV gap of ₹${analysis.ltvGap.toLocaleString()} (${ltvGapPercent}%) between best (${analysis.bestChannel.displayName}: ₹${analysis.bestChannel.avgLTV?.toLocaleString()}) and worst (${analysis.worstChannel.displayName}: ₹${analysis.worstChannel.avgLTV?.toLocaleString()}) channels`,
          evidence: [
            `Best channel: ${analysis.bestChannel.displayName} (LTV: ₹${analysis.bestChannel.avgLTV?.toLocaleString()})`,
            `Worst channel: ${analysis.worstChannel.displayName} (LTV: ₹${analysis.worstChannel.avgLTV?.toLocaleString()})`,
            `LTV gap: ₹${analysis.ltvGap.toLocaleString()} (${ltvGapPercent}%)`,
            `Account avg LTV: ₹${analysis.avgAccountLTV?.toLocaleString()}`,
          ],
          confidence: 75,
          predictedSavings: analysis.ltvGap * 10, // Rough estimate: gap * assumed monthly customers
        });
      } catch (loopErr) {
        logger.warn({ err: loopErr }, '[CohortLTV] Closed-loop tracking failed');
      }
    }

    // === STRATEGIC MEMORY: Record episode for LTV gap detection ===
    recordEpisode(
      'system',
      'audience',
      `LTV Gap Alert: ${analysis.bestChannel?.displayName} vs ${analysis.worstChannel?.displayName} (${ltvGapPercent.toFixed(0)}% gap) for ${client.brandName}`,
      JSON.stringify({ bestChannel: analysis.bestChannel?.displayName, worstChannel: analysis.worstChannel?.displayName, gap: ltvGapPercent }),
      'pending'
    ).catch(epErr => logger.warn({ err: epErr }, '[CohortLTV] Episode recording failed'));
  }

  // === STRATEGIC MEMORY: Record report summary ===
  try {
    const now = new Date();
    const weekNumber = Math.ceil((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
    const reportRecord: ReportRecord = {
      id: uuidv4(),
      clientId,
      reportType: 'cohort-ltv',
      generatedAt: now.toISOString(),
      weekNumber,
      year: now.getFullYear(),
      headline: `LTV Report: ${analysis.channels?.length || 0} channels analyzed, ${ltvGapPercent.toFixed(0)}% LTV gap`,
      keyInsights: [
        `Best channel: ${analysis.bestChannel?.displayName || 'N/A'}`,
        `Worst channel: ${analysis.worstChannel?.displayName || 'N/A'}`,
        `LTV gap threshold: ${gapThreshold}%`,
      ],
      recommendations: shouldAlert ? [`Shift budget from ${analysis.worstChannel?.displayName} to ${analysis.bestChannel?.displayName}`] : [],
      metricsSnapshot: {
        channelCount: analysis.channels?.length || 0,
        ltvGap: ltvGapPercent,
        gapThreshold
      },
      qualityScore: 80,
      wasShipped: shouldAlert,
      shipDecision: shouldAlert ? 'SHIP' : 'HOLD',
      deliveredVia: [],
    };
    await recordReport(reportRecord);
  } catch (repErr) {
    logger.warn({ err: repErr }, '[CohortLTV] Report recording failed');
  }

  return {
    ...analysis,
    clientId,
    clientName: client.brandName,
    revenueLevel: client.revenueLevel || 'unknown',
    gapThreshold,
    shouldAlert,
    alertReason,
  };
}
