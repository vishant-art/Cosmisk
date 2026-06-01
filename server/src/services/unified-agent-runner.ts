/**
 * Unified Agent Runner — Cosmisk
 *
 * Runs UNIQUE cross-platform agents that provide data clients CAN'T get elsewhere.
 *
 * UNIQUE AGENTS (default enabled):
 * - OOS Detection: Ads spending on out-of-stock products (Meta + Shopify)
 * - RTO/COD Analysis: Return rate by city with blocklist (Shopify only)
 * - Geo Profitability: Shipping cost vs revenue per city (Shopify only)
 * - Margin-weighted ROAS: True profitability after costs (Meta + Shopify)
 * - Discount Leakage: Coupon codes on unauthorized sites (Shopify + Web)
 *
 * TIME-SAVER AGENTS (optional, disabled by default):
 * - Inventory Velocity: Shopify has "Low Stock" reports
 * - New vs Repeat: Shopify Analytics shows this
 * - Time of Day: Meta Ads Manager shows this
 * - Audience Saturation: Meta shows frequency metrics
 * - Creative Lifespan: Meta shows creative performance
 * - Placement Efficiency: Meta shows placement breakdown
 *
 * Flow:
 * 1. Run UNIQUE agents only (cross-platform value)
 * 2. Collect verified findings
 * 3. Create auto-approved decisions for safe actions
 * 4. Create pending decisions for risky actions (needs approval)
 */

import { logger } from '../utils/logger.js';
import { getAgentBrain } from './agent-brain.js';
import { v4 as uuidv4 } from 'uuid';
import { correlationStore } from '../utils/request-context.js';
import { getDb } from '../db/index.js';
import { decryptToken } from './token-crypto.js';

// Import Client Context + Strategic Memory
import {
  getClientContext,
  getClientBriefForAgent,
  type ClientContext,
} from './client-context.js';

import {
  getStrategicContextForAgent,
  getRecentReports,
  getLastWeekReport,
  recordReport,
  recordRecommendation,
  shouldShipReport,
  type ReportRecord,
  type RecommendationRecord,
} from './strategic-memory.js';

// Import all agents
import { runOOSCheck, type OOSWatchdogResult } from './oos-detector.js';
import { analyzeNewVsRepeat, type NewRepeatAnalysis } from './new-repeat-analyzer.js';
import { analyzeGeoProfitability, type GeoProfitabilityAnalysis } from './geo-profitability-analyzer.js';
import { analyzeInventoryVelocity, type InventoryVelocityAnalysis } from './inventory-velocity-predictor.js';
import { analyzeAudienceSaturation, type AudienceSaturationAnalysis } from './audience-saturation-analyzer.js';
import { analyzePlacementEfficiency, type PlacementEfficiencyAnalysis } from './placement-efficiency-analyzer.js';
import { analyzeCreativeLifespan, type CreativeLifespanAnalysis } from './creative-lifespan-predictor.js';
import { analyzeTimeOfDay, type TimeOfDayAnalysis } from './time-of-day-analyzer.js';
import { analyzeCreativeReturns, type CreativeReturnsAnalysis } from './creative-returns-analyzer.js';
import { analyzeLTVByCreative, type LTVByCreativeAnalysis } from './ltv-by-creative-analyzer.js';
import { analyzeRTOPatterns, type RTOAnalysis } from './rto-cod-analyzer.js';
import { analyzeMarginWeightedROAS, type MarginWeightedAnalysis } from './margin-weighted-roas-analyzer.js';

// ============ TYPES ============

export interface AgentFinding {
  agentName: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  actionTaken: string | null; // If auto-executed
  actionPending: string | null; // If needs approval
  metrics: Record<string, number | string>;
  timestamp: string;
}

export interface UnifiedAgentRun {
  runId: string;
  userId: string;
  accountId: string;
  clientId?: string;

  // Timing
  startedAt: string;
  completedAt: string;
  durationMs: number;

  // Results
  findings: AgentFinding[];
  totalFindings: number;
  criticalFindings: number;
  actionsAutoExecuted: number;
  actionsPendingApproval: number;

  // Savings estimate
  estimatedMonthlySavings: number;
  actualSavingsThisRun: number;

  // Agent status
  agentsRun: string[];
  agentsFailed: string[];

  // Context used (for transparency)
  clientContextLoaded: boolean;
  strategicMemoryLoaded: boolean;
  deduplicationApplied: boolean;
  previousReportsChecked: number;
}

// ============ MAIN RUNNER ============

export async function runAllAgents(
  userId: string,
  accountId: string,
  options: {
    clientId?: string; // NEW: Client ID for context + memory
    autoExecute?: boolean; // Default true - auto-pause OOS, reduce saturated, etc.
    includeShopify?: boolean; // Run Shopify agents
    includeMeta?: boolean; // Run Meta agents
    includeTimeSavers?: boolean; // Include time-saver agents (default false - they duplicate Shopify/Meta dashboards)
    // Credentials for cross-platform agents (OOS detection)
    metaToken?: string;
    shopDomain?: string;
    shopifyToken?: string;
    catalogId?: string;
  } = {}
): Promise<UnifiedAgentRun> {
  const {
    clientId,
    autoExecute = true,
    includeShopify = true,
    includeMeta = true,
    includeTimeSavers = false, // Disabled by default - only run UNIQUE agents
    catalogId,
  } = options;

  // ============ LOAD CLIENT CONTEXT + STRATEGIC MEMORY ============
  let clientContext: ClientContext | null = null;
  let strategicContext: string = '';
  let clientBrief: string = '';
  let previousReportsCount = 0;

  if (clientId) {
    // Load client context (multi-account setup, brief, geo segments)
    clientContext = getClientContext(clientId);
    if (clientContext) {
      clientBrief = getClientBriefForAgent(clientId);
      logger.info(`[AgentRunner] Loaded client context for ${clientId}: ${clientContext.name}`);
    } else {
      logger.warn(`[AgentRunner] No client context found for ${clientId}`);
    }

    // Load strategic memory (week-by-week continuity)
    strategicContext = getStrategicContextForAgent(clientId);
    const recentReports = getRecentReports(clientId, 4);
    previousReportsCount = recentReports.length;
    if (recentReports.length > 0) {
      logger.info(`[AgentRunner] Loaded ${recentReports.length} previous reports for ${clientId}`);
    } else {
      logger.info(`[AgentRunner] First run for ${clientId} - no previous reports`);
    }
  }

  // Auto-fetch tokens from database if not provided in options
  let { metaToken, shopDomain, shopifyToken } = options;
  const db = getDb();

  if (!metaToken && includeMeta) {
    const metaRow = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(userId) as { encrypted_access_token: string } | undefined;
    if (metaRow) {
      metaToken = decryptToken(metaRow.encrypted_access_token);
    }
  }

  if ((!shopDomain || !shopifyToken) && includeShopify) {
    const shopifyRow = db.prepare('SELECT * FROM shopify_tokens WHERE user_id = ?').get(userId) as { shop_domain: string; encrypted_access_token: string } | undefined;
    if (shopifyRow) {
      shopDomain = shopifyRow.shop_domain;
      shopifyToken = decryptToken(shopifyRow.encrypted_access_token);
    }
  }

  // Auto-fetch Meta ad account ID from brands table if not provided
  let resolvedAccountId = accountId;
  if (!resolvedAccountId && includeMeta) {
    const brandRow = db.prepare('SELECT meta_ad_account_id FROM brands WHERE id = ? OR user_id = ?').get(userId, userId) as { meta_ad_account_id: string } | undefined;
    if (brandRow?.meta_ad_account_id) {
      resolvedAccountId = brandRow.meta_ad_account_id;
    }
  }

  const runId = uuidv4();
  correlationStore.enterWith({ correlationId: runId });
  const startedAt = new Date();

  // Insert run into agent_runs table (required for FK constraint on decisions)
  db.prepare(`
    INSERT INTO agent_runs (id, agent_type, user_id, status, started_at)
    VALUES (?, 'unified', ?, 'running', datetime('now'))
  `).run(runId, userId);

  logger.info(`[AgentRunner] Starting unified run ${runId} for user ${userId}, account ${resolvedAccountId}`);
  logger.info(`[AgentRunner] Tokens: Meta=${!!metaToken}, Shopify=${!!shopDomain && !!shopifyToken}, Account=${resolvedAccountId || 'none'}`);

  const findings: AgentFinding[] = [];
  const agentsRun: string[] = [];
  const agentsFailed: string[] = [];
  let actionsAutoExecuted = 0;
  let actionsPendingApproval = 0;
  let estimatedSavings = 0;
  let actualSavings = 0;

  const brain = getAgentBrain(userId, accountId, 'watchdog');

  // ============ RUN META AGENTS ============
  if (includeMeta) {
    // 1. OOS Detection (UNIQUE - requires cross-platform credentials)
    if (metaToken && shopDomain && shopifyToken && resolvedAccountId) {
      try {
        agentsRun.push('oos_detector');
        const oosResult = await runOOSCheck({
          metaAccountId: resolvedAccountId,
          metaToken,
          shopDomain,
          shopifyToken,
          catalogId,
        });

        if (oosResult && oosResult.topMatches && oosResult.topMatches.length > 0) {
          const totalWaste = oosResult.wastedSpend || 0;

          for (const oos of oosResult.topMatches.slice(0, 10)) {
            findings.push({
              agentName: 'oos_detector',
              severity: 'critical',
              title: `OOS: "${oos.productTitle}" running ads while out of stock`,
              description: `Ad "${oos.adName}" spending Rs ${oos.spend?.toLocaleString() || 0}/day on out-of-stock product`,
              actionTaken: autoExecute ? 'Paused ad' : null,
              actionPending: autoExecute ? null : 'Pause ad',
              metrics: { wastedSpend: oos.spend || 0, adId: oos.adId },
              timestamp: new Date().toISOString(),
            });

            if (autoExecute && oos.adId) {
              brain.createDecision({
                runId,
                action: 'pause_ad',
                target: { type: 'ad', id: oos.adId, name: oos.adName || 'Unknown' },
                reason: `OOS product: ${oos.productTitle}`,
                confidence: 0.95,
                expectedImpact: `Save Rs ${oos.spend?.toLocaleString() || 0}/day`,
                autoExecute: true,
              });
              actionsAutoExecuted++;
              actualSavings += (oos.spend || 0) * 30; // Monthly estimate
            }
          }

          estimatedSavings += totalWaste * 30;
        }
      } catch (err) {
        logger.error(`[AgentRunner] OOS detector failed: ${err}`);
        agentsFailed.push('oos_detector');
      }
    }

    // 2. Audience Saturation (TIME SAVER - Meta shows frequency metrics)
    if (includeTimeSavers) try {
      agentsRun.push('audience_saturation');
      const saturation = await analyzeAudienceSaturation(userId, accountId);

      if (saturation) {
        for (const adset of saturation.criticalList.slice(0, 5)) {
          findings.push({
            agentName: 'audience_saturation',
            severity: 'high',
            title: `Saturated: "${adset.adsetName}" (${adset.frequency.toFixed(1)}x frequency)`,
            description: adset.saturationReasons[0] || 'Audience exhausted',
            actionTaken: autoExecute ? 'Reduced budget 30%' : null,
            actionPending: autoExecute ? null : 'Reduce budget',
            metrics: { frequency: adset.frequency, spend: adset.spend, cpm: adset.cpm },
            timestamp: new Date().toISOString(),
          });

          if (autoExecute) {
            brain.createDecision({
              runId,
              action: 'decrease_budget',
              target: { type: 'adset', id: adset.adsetId, name: adset.adsetName, percentage: 30 },
              reason: `Saturated audience: ${adset.frequency.toFixed(1)}x frequency`,
              confidence: 0.85,
              expectedImpact: 'Reduce waste on exhausted audience',
              autoExecute: true,
            });
            actionsAutoExecuted++;
          }
        }
        estimatedSavings += saturation.wastedSpendEstimate * 30;
      }
    } catch (err) {
      logger.error(`[AgentRunner] Audience saturation failed: ${err}`);
      agentsFailed.push('audience_saturation');
    }

    // 3. Creative Lifespan (TIME SAVER - Meta shows creative performance)
    if (includeTimeSavers) try {
      agentsRun.push('creative_lifespan');
      const lifespan = await analyzeCreativeLifespan(userId, accountId);

      if (lifespan) {
        // Dead creatives - auto pause
        for (const ad of lifespan.deadCreatives.slice(0, 5)) {
          findings.push({
            agentName: 'creative_lifespan',
            severity: 'critical',
            title: `Dead creative: "${ad.adName}"`,
            description: ad.healthReasons[0] || 'Creative exhausted',
            actionTaken: autoExecute ? 'Paused ad' : null,
            actionPending: autoExecute ? null : 'Pause ad',
            metrics: { frequency: ad.frequency, ctr: ad.ctr, daysActive: ad.daysActive },
            timestamp: new Date().toISOString(),
          });

          if (autoExecute) {
            brain.createDecision({
              runId,
              action: 'pause_ad',
              target: { type: 'ad', id: ad.adId, name: ad.adName },
              reason: `Dead creative: ${ad.healthReasons[0]}`,
              confidence: 0.9,
              expectedImpact: 'Stop wasting spend on exhausted creative',
              autoExecute: true,
            });
            actionsAutoExecuted++;
          }
        }

        // Dying creatives - alert only (no auto action)
        for (const ad of lifespan.needsRefresh.filter(a => a.healthStatus === 'dying').slice(0, 3)) {
          findings.push({
            agentName: 'creative_lifespan',
            severity: 'high',
            title: `Dying creative: "${ad.adName}" (~${ad.estimatedDaysRemaining} days left)`,
            description: 'Prepare replacement creative',
            actionTaken: null,
            actionPending: 'Have new creative ready',
            metrics: { daysRemaining: ad.estimatedDaysRemaining || 0, frequency: ad.frequency },
            timestamp: new Date().toISOString(),
          });
          actionsPendingApproval++;
        }

        estimatedSavings += lifespan.revenueAtRisk;
      }
    } catch (err) {
      logger.error(`[AgentRunner] Creative lifespan failed: ${err}`);
      agentsFailed.push('creative_lifespan');
    }

    // 4. Placement Efficiency (TIME SAVER - Meta shows placement breakdown)
    if (includeTimeSavers) try {
      agentsRun.push('placement_efficiency');
      const placements = await analyzePlacementEfficiency(userId, accountId);

      if (placements && placements.wastefulPlacements > 0) {
        findings.push({
          agentName: 'placement_efficiency',
          severity: 'medium',
          title: `${placements.wastefulPlacements} wasteful placements detected`,
          description: `Rs ${placements.wastedSpendEstimate.toLocaleString()} wasted on poor placements`,
          actionTaken: null,
          actionPending: 'Exclude wasteful placements from targeting',
          metrics: { wastedSpend: placements.wastedSpendEstimate, wastefulCount: placements.wastefulPlacements },
          timestamp: new Date().toISOString(),
        });
        actionsPendingApproval++;
        estimatedSavings += placements.wastedSpendEstimate * 30;
      }
    } catch (err) {
      logger.error(`[AgentRunner] Placement efficiency failed: ${err}`);
      agentsFailed.push('placement_efficiency');
    }

    // 5. Time of Day (TIME SAVER - Meta Ads Manager shows this)
    if (includeTimeSavers) try {
      agentsRun.push('time_of_day');
      const timeOfDay = await analyzeTimeOfDay(userId, accountId);

      if (timeOfDay && timeOfDay.hourlyWastedSpend > 1000) {
        findings.push({
          agentName: 'time_of_day',
          severity: 'low',
          title: `Rs ${timeOfDay.hourlyWastedSpend.toLocaleString()} wasted on low-performing hours`,
          description: `Consider dayparting: disable ${timeOfDay.suggestedSchedule.disabledHours.length} hours`,
          actionTaken: null,
          actionPending: 'Enable ad scheduling',
          metrics: { wastedSpend: timeOfDay.hourlyWastedSpend },
          timestamp: new Date().toISOString(),
        });
        estimatedSavings += timeOfDay.hourlyWastedSpend * 30;
      }
    } catch (err) {
      logger.error(`[AgentRunner] Time of day failed: ${err}`);
      agentsFailed.push('time_of_day');
    }
  }

  // ============ RUN SHOPIFY AGENTS ============
  if (includeShopify) {
    // 6. Inventory Velocity (TIME SAVER - Shopify shows inventory levels)
    if (includeTimeSavers) try {
      agentsRun.push('inventory_velocity');
      const velocity = await analyzeInventoryVelocity(userId);

      if (velocity) {
        // Critical - reduce ad spend
        for (const product of velocity.criticalList.slice(0, 5)) {
          if (product.daysUntilOOS === 0) continue; // Already OOS handled by OOS detector

          findings.push({
            agentName: 'inventory_velocity',
            severity: 'high',
            title: `Low stock: "${product.productTitle}" (${product.daysUntilOOS} days left)`,
            description: `Selling ${product.avgDailySales.toFixed(1)}/day, only ${product.currentInventory} left`,
            actionTaken: null,
            actionPending: 'Reduce ad spend or restock urgently',
            metrics: {
              daysLeft: product.daysUntilOOS || 0,
              inventory: product.currentInventory,
              dailySales: product.avgDailySales,
            },
            timestamp: new Date().toISOString(),
          });
          actionsPendingApproval++;
        }
        estimatedSavings += velocity.totalRevenueAtRisk;
      }
    } catch (err) {
      logger.error(`[AgentRunner] Inventory velocity failed: ${err}`);
      agentsFailed.push('inventory_velocity');
    }

    // 7. New vs Repeat (TIME SAVER - Shopify shows customer reports)
    if (includeTimeSavers) try {
      agentsRun.push('new_vs_repeat');
      const newRepeat = await analyzeNewVsRepeat(userId);

      if (newRepeat && newRepeat.isHighRepeat) {
        findings.push({
          agentName: 'new_vs_repeat',
          severity: 'medium',
          title: `${newRepeat.repeatPercentage.toFixed(1)}% repeat customers in conversions`,
          description: `Rs ${newRepeat.estimatedWasteIfProspecting.toLocaleString()} potentially wasted acquiring existing customers`,
          actionTaken: null,
          actionPending: 'Separate new vs repeat targeting in campaigns',
          metrics: {
            repeatPct: newRepeat.repeatPercentage,
            wastedSpend: newRepeat.estimatedWasteIfProspecting,
          },
          timestamp: new Date().toISOString(),
        });
        actionsPendingApproval++;
        estimatedSavings += newRepeat.estimatedWasteIfProspecting;
      }
    } catch (err) {
      logger.error(`[AgentRunner] New vs repeat failed: ${err}`);
      agentsFailed.push('new_vs_repeat');
    }

    // 8. Geo Profitability (UNIQUE - combines RTO risk data)
    try {
      agentsRun.push('geo_profitability');
      const geo = await analyzeGeoProfitability(userId);

      if (geo) {
        // Flag unprofitable cities
        const unprofitable = geo.cities.filter((c: { profitabilityScore: number }) => c.profitabilityScore < 40);
        if (unprofitable.length > 0) {
          findings.push({
            agentName: 'geo_profitability',
            severity: 'medium',
            title: `${unprofitable.length} unprofitable cities detected`,
            description: unprofitable.slice(0, 3).map((c: { city: string }) => c.city).join(', '),
            actionTaken: null,
            actionPending: 'Consider geo-exclusions or prepaid-only',
            metrics: { unprofitableCities: unprofitable.length },
            timestamp: new Date().toISOString(),
          });
          actionsPendingApproval++;
        }
      }
    } catch (err) {
      logger.error(`[AgentRunner] Geo profitability failed: ${err}`);
      agentsFailed.push('geo_profitability');
    }

    // 9. RTO/COD Analysis
    try {
      agentsRun.push('rto_cod');
      const rto = await analyzeRTOPatterns(userId);

      if (rto && rto.overallRTORate > 25) {
        findings.push({
          agentName: 'rto_cod',
          severity: 'high',
          title: `High RTO rate: ${rto.overallRTORate.toFixed(1)}%`,
          description: `Rs ${rto.estimatedRTOLoss.toLocaleString()} lost to RTO this period`,
          actionTaken: null,
          actionPending: 'Block high-RTO pincodes or require prepaid',
          metrics: {
            rtoRate: rto.overallRTORate,
            rtoLoss: rto.estimatedRTOLoss,
            codPct: rto.codPercentage,
          },
          timestamp: new Date().toISOString(),
        });
        actionsPendingApproval++;
        estimatedSavings += rto.estimatedRTOLoss * 0.3; // 30% reduction possible
      }

      // Blocklist suggestion
      if (rto && rto.suggestedBlocklist.length > 0) {
        findings.push({
          agentName: 'rto_cod',
          severity: 'medium',
          title: `Suggested blocklist: ${rto.suggestedBlocklist.length} high-RTO cities`,
          description: rto.suggestedBlocklist.slice(0, 5).join(', '),
          actionTaken: null,
          actionPending: 'Add to pincode blocklist',
          metrics: { blocklistCount: rto.suggestedBlocklist.length },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      logger.error(`[AgentRunner] RTO/COD failed: ${err}`);
      agentsFailed.push('rto_cod');
    }

    // 10. Margin-Weighted ROAS
    try {
      agentsRun.push('margin_roas');
      const marginRoas = await analyzeMarginWeightedROAS(userId);

      if (marginRoas && marginRoas.hiddenLosses > 10000) {
        findings.push({
          agentName: 'margin_roas',
          severity: 'high',
          title: `Rs ${marginRoas.hiddenLosses.toLocaleString()} hidden losses detected`,
          description: 'Campaigns with good ROAS but negative profit after costs',
          actionTaken: null,
          actionPending: 'Review margin-weighted ROAS for each campaign',
          metrics: {
            standardRoas: marginRoas.accountStandardROAS,
            trueRoas: marginRoas.accountMarginWeightedROAS,
            hiddenLosses: marginRoas.hiddenLosses,
          },
          timestamp: new Date().toISOString(),
        });
        actionsPendingApproval++;
        estimatedSavings += marginRoas.hiddenLosses;
      }
    } catch (err) {
      logger.error(`[AgentRunner] Margin ROAS failed: ${err}`);
      agentsFailed.push('margin_roas');
    }

    // 11. Creative Returns
    try {
      agentsRun.push('creative_returns');
      const returns = await analyzeCreativeReturns(userId);

      if (returns && returns.highReturnCampaigns.length > 0) {
        const topOffender = returns.highReturnCampaigns[0];
        findings.push({
          agentName: 'creative_returns',
          severity: 'medium',
          title: `High-return campaign: ${topOffender.returnRate.toFixed(1)}% return rate`,
          description: `"${topOffender.utmCampaign}" attracts customers who return products`,
          actionTaken: null,
          actionPending: 'Review creative messaging - may be overpromising',
          metrics: {
            returnRate: topOffender.returnRate,
            refundAmount: topOffender.refundedAmount,
          },
          timestamp: new Date().toISOString(),
        });
        actionsPendingApproval++;
      }
    } catch (err) {
      logger.error(`[AgentRunner] Creative returns failed: ${err}`);
      agentsFailed.push('creative_returns');
    }

    // 12. LTV by Creative
    try {
      agentsRun.push('ltv_by_creative');
      const ltv = await analyzeLTVByCreative(userId);

      if (ltv && ltv.worstCohorts.length > 0) {
        const worst = ltv.worstCohorts[0];
        findings.push({
          agentName: 'ltv_by_creative',
          severity: 'info',
          title: `Low-LTV source: ${worst.acquisitionSource}/${worst.acquisitionCampaign}`,
          description: `Rs ${worst.avgLTV.toLocaleString()} LTV (${worst.ltvVsAverage.toFixed(0)}% below average)`,
          actionTaken: null,
          actionPending: 'Consider reducing spend on low-LTV sources',
          metrics: {
            avgLTV: worst.avgLTV,
            ltvVsAvg: worst.ltvVsAverage,
            repeatRate: worst.repeatRate,
          },
          timestamp: new Date().toISOString(),
        });
      }

      // Lookalike recommendation
      if (ltv && ltv.bestCohorts.length > 0) {
        findings.push({
          agentName: 'ltv_by_creative',
          severity: 'info',
          title: `Lookalike recommendation: Use ${ltv.bestCohorts[0].acquisitionSource} customers`,
          description: `Highest LTV source: Rs ${ltv.bestCohorts[0].avgLTV.toLocaleString()} avg LTV`,
          actionTaken: null,
          actionPending: null,
          metrics: { avgLTV: ltv.bestCohorts[0].avgLTV },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      logger.error(`[AgentRunner] LTV by creative failed: ${err}`);
      agentsFailed.push('ltv_by_creative');
    }
  }

  // ============ COMPLETE RUN ============
  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();

  // ============ DEDUPLICATION CHECK ============
  let deduplicationApplied = false;
  if (clientId && findings.length > 0) {
    // Check if we're about to ship duplicate insights
    const headline = findings[0]?.title || 'Agent Run Complete';
    const insights = findings.map(f => f.title);
    const shipCheck = shouldShipReport(clientId, headline, insights);

    if (!shipCheck.shouldShip) {
      logger.warn(`[AgentRunner] Deduplication blocked: ${shipCheck.reason}`);
      deduplicationApplied = true;
      // Don't block the run, but flag it for review
    }
  }

  // ============ RECORD IN STRATEGIC MEMORY ============
  if (clientId && findings.length > 0) {
    // Calculate ISO week number
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const weekNumber = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);

    // Record the report
    const reportRecord: ReportRecord = {
      id: runId,
      clientId,
      reportType: 'unified-agent-run',
      generatedAt: completedAt.toISOString(),
      weekNumber,
      year: now.getFullYear(),
      headline: findings[0]?.title || 'Agent Run Complete',
      keyInsights: findings.slice(0, 5).map(f => f.title),
      recommendations: findings.filter(f => f.actionPending).map(f => f.actionPending!),
      metricsSnapshot: {
        totalFindings: findings.length,
        criticalFindings: findings.filter(f => f.severity === 'critical').length,
        estimatedSavings,
        agentsRun: agentsRun.length,
      },
      qualityScore: 0, // Will be set by quality gate
      wasShipped: !deduplicationApplied,
      shipDecision: deduplicationApplied ? 'HOLD' : 'SHIP',
      deliveredVia: [],
    };

    try {
      recordReport(reportRecord);
      logger.info(`[AgentRunner] Recorded report in strategic memory: ${runId}`);
    } catch (err) {
      logger.error(`[AgentRunner] Failed to record report: ${err}`);
    }

    // Record recommendations for tracking
    for (const finding of findings.filter(f => f.actionPending)) {
      const recRecord: RecommendationRecord = {
        id: uuidv4(),
        clientId,
        reportId: runId,
        createdAt: completedAt.toISOString(),
        recommendation: finding.actionPending!,
        category: categorizeRecommendation(finding.agentName),
        priority: finding.severity === 'critical' ? 'critical' :
                  finding.severity === 'high' ? 'high' :
                  finding.severity === 'medium' ? 'medium' : 'low',
        expectedImpact: `From ${finding.agentName}`,
        status: 'pending',
      };

      try {
        recordRecommendation(recRecord);
      } catch (err) {
        logger.error(`[AgentRunner] Failed to record recommendation: ${err}`);
      }
    }
  }

  const result: UnifiedAgentRun = {
    runId,
    userId,
    accountId,
    clientId,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs,
    findings,
    totalFindings: findings.length,
    criticalFindings: findings.filter(f => f.severity === 'critical').length,
    actionsAutoExecuted,
    actionsPendingApproval,
    estimatedMonthlySavings: estimatedSavings,
    actualSavingsThisRun: actualSavings,
    agentsRun,
    agentsFailed,
    // Context tracking
    clientContextLoaded: !!clientContext,
    strategicMemoryLoaded: strategicContext.length > 0,
    deduplicationApplied,
    previousReportsChecked: previousReportsCount,
  };

  // Update run status in database
  db.prepare(`
    UPDATE agent_runs SET status = 'completed', completed_at = datetime('now'),
    summary = ? WHERE id = ?
  `).run(JSON.stringify({ findings: findings.length, savings: estimatedSavings, clientId }), runId);

  logger.info(
    `[AgentRunner] Run ${runId} complete: ${findings.length} findings, ` +
    `${actionsAutoExecuted} auto-executed, ${actionsPendingApproval} pending, ` +
    `Rs ${estimatedSavings.toLocaleString()} estimated savings`
  );

  return result;
}

// ============ FORMATTED SUMMARY ============

export function formatRunSummary(run: UnifiedAgentRun): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('═'.repeat(60));
  lines.push('         COSMISK INTELLIGENCE REPORT');
  lines.push('═'.repeat(60));
  lines.push('');
  lines.push(`Run ID: ${run.runId.slice(0, 8)}`);
  lines.push(`Duration: ${(run.durationMs / 1000).toFixed(1)}s`);
  lines.push(`Agents Run: ${run.agentsRun.length} | Failed: ${run.agentsFailed.length}`);
  lines.push('');

  // Summary stats
  lines.push('┌─────────────────────────────────────────────────────┐');
  lines.push('│                     SUMMARY                         │');
  lines.push('├─────────────────────────────────────────────────────┤');
  lines.push(`│  Findings:           ${String(run.totalFindings).padStart(5)}                        │`);
  lines.push(`│  Critical:           ${String(run.criticalFindings).padStart(5)}                        │`);
  lines.push(`│  Actions Executed:   ${String(run.actionsAutoExecuted).padStart(5)}                        │`);
  lines.push(`│  Actions Pending:    ${String(run.actionsPendingApproval).padStart(5)}                        │`);
  lines.push('├─────────────────────────────────────────────────────┤');
  lines.push(`│  Est. Monthly Savings: Rs ${run.estimatedMonthlySavings.toLocaleString().padStart(10)}          │`);
  lines.push('└─────────────────────────────────────────────────────┘');
  lines.push('');

  // Critical findings
  const critical = run.findings.filter(f => f.severity === 'critical');
  if (critical.length > 0) {
    lines.push('🚨 CRITICAL (Auto-Actioned):');
    for (const f of critical) {
      lines.push(`  • ${f.title}`);
      if (f.actionTaken) {
        lines.push(`    ✓ ${f.actionTaken}`);
      }
    }
    lines.push('');
  }

  // High findings
  const high = run.findings.filter(f => f.severity === 'high');
  if (high.length > 0) {
    lines.push('⚠️ HIGH PRIORITY:');
    for (const f of high.slice(0, 5)) {
      lines.push(`  • ${f.title}`);
      if (f.actionTaken) {
        lines.push(`    ✓ ${f.actionTaken}`);
      } else if (f.actionPending) {
        lines.push(`    → ${f.actionPending}`);
      }
    }
    lines.push('');
  }

  // Medium/info (summary only)
  const other = run.findings.filter(f => f.severity === 'medium' || f.severity === 'low');
  if (other.length > 0) {
    lines.push(`📋 ${other.length} other findings (see full report)`);
    lines.push('');
  }

  lines.push('═'.repeat(60));

  return lines.join('\n');
}

// ============ HELPER FUNCTIONS ============

/**
 * Categorize recommendation by agent type
 */
function categorizeRecommendation(agentName: string): RecommendationRecord['category'] {
  const budgetAgents = ['audience_saturation', 'time_of_day', 'placement_efficiency'];
  const creativeAgents = ['creative_lifespan', 'creative_returns', 'ltv_by_creative'];
  const productAgents = ['oos_detector', 'inventory_velocity', 'margin_roas'];
  const audienceAgents = ['new_vs_repeat', 'geo_profitability'];

  if (budgetAgents.includes(agentName)) return 'budget';
  if (creativeAgents.includes(agentName)) return 'creative';
  if (productAgents.includes(agentName)) return 'product';
  if (audienceAgents.includes(agentName)) return 'audience';
  return 'strategy';
}

/**
 * Get strategic context summary for logging
 */
export function getRunContextSummary(clientId: string): string {
  const context = getStrategicContextForAgent(clientId);
  const clientBrief = getClientBriefForAgent(clientId);

  return `
═══════════════════════════════════════════════════════════════════════
AGENT RUN CONTEXT FOR: ${clientId.toUpperCase()}
═══════════════════════════════════════════════════════════════════════

${clientBrief}

${context}
`.trim();
}
