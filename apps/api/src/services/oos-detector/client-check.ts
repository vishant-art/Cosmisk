/**
 * OOS Detector - Client-aware detection
 *
 * Runs OOS checks scoped to a specific client: applies the client's alert
 * threshold, tracks known OOS products, records history and strategic memory.
 */

import { logger } from '../../utils/logger.js';
import {
  getClientContext,
  getOOSAgentStore,
  updateOOSAgentStore,
  createRecommendation,
  getOOSAlertThreshold,
} from '../service-clients.js';
// CLOSED-LOOP OPERATING SYSTEM
import { agentRecommend } from '../recommendation-loop.js';
// STRATEGIC MEMORY - Week-to-week learning
import { recordEpisode } from '../agent-memory.js';
import { getStrategicContextForAgent, recordReport, type ReportRecord } from '../strategic-memory.js';
import { v4 as uuidv4 } from 'uuid';
import { runOOSCheck } from './watchdog.js';
import type { ClientOOSReport } from './types.js';

// ============================================================================
// CLIENT-AWARE OOS DETECTION
// ============================================================================

/**
 * Run OOS check for a specific client
 * - Uses client's alert threshold based on revenue level
 * - Tracks known OOS products to identify NEW issues
 * - Records history and cumulative waste
 */
export async function runOOSCheckForClient(
  clientId: string,
  options: {
    metaToken: string;
    days?: number;
  }
): Promise<ClientOOSReport | null> {
  // Get client context
  const ctx = await getClientContext(clientId);
  if (!ctx) {
    logger.error({ clientId }, '[OOS Client] Client not found');
    return null;
  }

  const { client } = ctx;
  const oosStore = await getOOSAgentStore(clientId);

  // === STRATEGIC MEMORY: Load context from previous runs ===
  const strategicContext = await getStrategicContextForAgent(clientId);
  if (strategicContext) {
    logger.info({ contextLength: strategicContext.length }, '[OOS] Loaded strategic context');
  }

  logger.info({
    clientId,
    brandName: client.brandName,
    revenueLevel: client.revenueLevel
  }, '[OOS Client] Starting check');

  // Get alert threshold for this client
  const alertThreshold = getOOSAlertThreshold(client);
  logger.info({ alertThreshold }, '[OOS Client] Using alert threshold');

  // Parse Shopify store info
  let shopDomain: string | undefined;
  let shopifyToken: string | undefined;

  if (client.shopifyStore) {
    try {
      const shopifyData = JSON.parse(client.shopifyStore);
      // Could be { india: '...', global: '...' } or just a string
      if (typeof shopifyData === 'string') {
        shopDomain = shopifyData;
      } else if (shopifyData.india) {
        shopDomain = shopifyData.india;
      } else if (shopifyData.global) {
        shopDomain = shopifyData.global;
      }
    } catch {
      shopDomain = client.shopifyStore;
    }
  }

  // Validate required credentials
  if (!shopDomain) {
    logger.warn({ clientId }, '[OOS Client] No Shopify store configured');
    return null;
  }

  // Run the OOS check
  const result = await runOOSCheck({
    metaAccountId: client.metaAdAccountId || '',
    metaToken: options.metaToken,
    shopDomain,
    shopifyToken: shopifyToken || '', // Would need to get from credentials store
    days: options.days || 7,
  });

  // Identify NEW OOS products vs previously known
  const knownProducts = oosStore?.knownOOSProducts || [];
  const currentOOSProducts = result.enhanced?.topWasted?.map(p => p.productId) || [];
  const newOOSProducts = currentOOSProducts.filter(id => !knownProducts.includes(id));
  const previouslyKnown = currentOOSProducts.filter(id => knownProducts.includes(id));

  // Determine if we should alert
  // Alert if: verified waste > threshold AND there are NEW products
  const shouldAlert = result.verifiedWastedSpend > alertThreshold && newOOSProducts.length > 0;

  logger.info({
    verifiedWaste: result.verifiedWastedSpend,
    alertThreshold,
    newProducts: newOOSProducts.length,
    shouldAlert,
  }, '[OOS Client] Alert decision');

  // Update OOS store
  if (oosStore) {
    const allKnownProducts = [...new Set([...knownProducts, ...currentOOSProducts])];
    await updateOOSAgentStore(clientId, {
      lastCheckAt: new Date().toISOString(),
      knownOOSProducts: allKnownProducts,
      cumulativeWaste: (oosStore.cumulativeWaste || 0) + result.verifiedWastedSpend,
      alertsSent: shouldAlert ? (oosStore.alertsSent || 0) + 1 : oosStore.alertsSent,
      lastAlertAt: shouldAlert ? new Date().toISOString() : oosStore.lastAlertAt,
    });
  }

  // Create recommendation record if alerting
  if (shouldAlert) {
    await createRecommendation(clientId, 'oos_detector', 'pause_oos_ads', {
      wastedSpend: result.verifiedWastedSpend,
      productsCount: newOOSProducts.length,
      topProducts: result.enhanced?.topWasted?.slice(0, 5) || [],
      summary: result.summary,
    });

    // === CLOSED-LOOP OPERATING SYSTEM ===
    const topWasted = result.enhanced?.topWasted?.[0];
    if (topWasted) {
      try {
        await agentRecommend(clientId, 'oos_detector', {
          type: 'fix_oos',
          entityType: 'product',
          entityId: topWasted.productId || topWasted.productName,
          entityName: topWasted.productName,
          action: 'Pause ads for out-of-stock products',
          reasoning: `${newOOSProducts.length} products are OOS with ₹${result.verifiedWastedSpend.toLocaleString()} wasted spend. Top: ${topWasted.productName} (₹${topWasted.wastedSpend?.toLocaleString() || 0})`,
          evidence: [
            `${newOOSProducts.length} new OOS products detected`,
            `₹${result.verifiedWastedSpend.toLocaleString()} wasted on OOS ads`,
            `Top product: ${topWasted.productName}`,
          ],
          confidence: 90,
          predictedSavings: result.verifiedWastedSpend,
        });
      } catch (loopErr) {
        logger.warn({ err: loopErr }, '[OOS] Closed-loop tracking failed');
      }
    }

    // === STRATEGIC MEMORY: Record episode for OOS detection ===
    recordEpisode(
      'system',
      'inventory',
      `OOS Alert: ${newOOSProducts.length} products wasting ₹${result.verifiedWastedSpend.toLocaleString()} for ${client.brandName}`,
      JSON.stringify({ newOOS: newOOSProducts.length, wastedSpend: result.verifiedWastedSpend }),
      'pending'
    ).catch(epErr => logger.warn({ err: epErr }, '[OOS] Episode recording failed'));
  }

  // === STRATEGIC MEMORY: Record report summary ===
  try {
    const now = new Date();
    const weekNumber = Math.ceil((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
    const reportRecord: ReportRecord = {
      id: uuidv4(),
      clientId,
      reportType: 'oos-detection',
      generatedAt: now.toISOString(),
      weekNumber,
      year: now.getFullYear(),
      headline: `OOS Report: ${result.enhanced?.totalOOSProducts || 0} products, ₹${result.verifiedWastedSpend.toLocaleString()} wasted`,
      keyInsights: [
        `${newOOSProducts.length} new OOS products detected`,
        `Alert threshold: ₹${alertThreshold.toLocaleString()}`,
        result.summary,
      ],
      recommendations: shouldAlert ? [`Pause ads for ${newOOSProducts.length} OOS products`] : [],
      metricsSnapshot: {
        totalOOS: result.enhanced?.totalOOSProducts || 0,
        wastedSpend: result.verifiedWastedSpend,
        alertThreshold
      },
      qualityScore: 85,
      wasShipped: shouldAlert,
      shipDecision: shouldAlert ? 'SHIP' : 'HOLD',
      deliveredVia: [],
    };
    await recordReport(reportRecord);
  } catch (repErr) {
    logger.warn({ err: repErr }, '[OOS] Report recording failed');
  }

  return {
    ...result,
    clientId,
    clientName: client.brandName,
    revenueLevel: client.revenueLevel,
    alertThreshold,
    shouldAlert,
    newOOSProducts,
    previouslyKnown,
  };
}
