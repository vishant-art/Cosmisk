/**
 * MULTI-REGION AGGREGATOR
 *
 * Handles the common D2C setup:
 * - ONE Meta account with campaigns named by region (e.g., "India - Wedding", "USA - NRI")
 * - MULTIPLE Shopify stores (one per region)
 *
 * Flow:
 * 1. Fetch all campaigns from the single Meta account
 * 2. Parse campaign names to identify region (India/USA/etc.)
 * 3. Run agents per region (filtering Meta data + matching Shopify store)
 * 4. Aggregate findings with regional context
 * 5. Generate cross-region insights
 */

import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import {
  getClientContext,
  getActiveShopifyStores,
  type ClientContext,
  type ShopifyStore,
} from './client-context.js';

import {
  runAllAgents,
  type UnifiedAgentRun,
  type AgentFinding,
} from './unified-agent-runner.js';

import {
  recordReport,
  type ReportRecord,
} from './strategic-memory.js';

// ============================================================================
// TYPES
// ============================================================================

export interface RegionConfig {
  name: string;           // "India", "USA", "Global"
  campaignPatterns: string[];  // ["india", "in -", "bharatiya"]
  shopifyDomain?: string;      // pratapsons.myshopify.com
  currency: string;            // "INR", "USD"
}

export interface RegionRun {
  region: string;
  campaignCount: number;
  shopifyConnected: boolean;
  run: UnifiedAgentRun | null;
  error?: string;
  durationMs: number;
}

export interface CrossRegionInsight {
  type: 'performance_gap' | 'shared_issue' | 'regional_opportunity' | 'best_practice';
  title: string;
  description: string;
  regions: string[];
  metrics: Record<string, number | string>;
  priority: 'critical' | 'high' | 'medium' | 'low';
  actionable: string;
}

export interface RegionalFinding extends AgentFinding {
  region: string;
  campaignsAffected: string[];
}

export interface MultiRegionRun {
  runId: string;
  clientId: string;
  clientName: string;
  metaAccountId: string;

  // Timing
  startedAt: string;
  completedAt: string;
  totalDurationMs: number;

  // Region runs
  regionRuns: RegionRun[];
  regionsAnalyzed: number;

  // Results by region
  findingsByRegion: Record<string, RegionalFinding[]>;
  crossRegionInsights: CrossRegionInsight[];

  // Totals
  totalFindings: number;
  criticalFindings: number;
  totalEstimatedSavings: number;
  savingsByRegion: Record<string, number>;

  // Recommendations
  topPriorities: string[];
  regionSpecificActions: Record<string, string[]>;
}

// ============================================================================
// DEFAULT REGION CONFIGS
// ============================================================================

/**
 * Default region patterns based on common D2C naming conventions
 */
export const DEFAULT_REGION_CONFIGS: RegionConfig[] = [
  {
    name: 'India',
    campaignPatterns: ['india', 'in -', 'in_', 'bharatiya', 'indian', 'domestic', 'ind-'],
    currency: 'INR',
  },
  {
    name: 'USA',
    campaignPatterns: ['usa', 'us -', 'us_', 'america', 'nri', 'global', 'international', 'intl'],
    currency: 'USD',
  },
  {
    name: 'UAE',
    campaignPatterns: ['uae', 'dubai', 'gulf', 'gcc', 'middle east'],
    currency: 'AED',
  },
  {
    name: 'UK',
    campaignPatterns: ['uk', 'united kingdom', 'britain', 'england'],
    currency: 'GBP',
  },
];

// ============================================================================
// CAMPAIGN REGION PARSER
// ============================================================================

/**
 * Parse campaign name to identify region
 */
export function identifyCampaignRegion(
  campaignName: string,
  regionConfigs: RegionConfig[] = DEFAULT_REGION_CONFIGS
): string | null {
  const nameLower = campaignName.toLowerCase();

  for (const config of regionConfigs) {
    for (const pattern of config.campaignPatterns) {
      if (nameLower.includes(pattern.toLowerCase())) {
        return config.name;
      }
    }
  }

  return null; // Unknown region
}

/**
 * Group campaigns by region
 */
export function groupCampaignsByRegion(
  campaigns: Array<{ id: string; name: string; spend?: number }>,
  regionConfigs: RegionConfig[] = DEFAULT_REGION_CONFIGS
): Map<string, Array<{ id: string; name: string; spend?: number }>> {
  const grouped = new Map<string, Array<{ id: string; name: string; spend?: number }>>();

  // Initialize all regions
  for (const config of regionConfigs) {
    grouped.set(config.name, []);
  }
  grouped.set('Unknown', []); // For campaigns we can't classify

  for (const campaign of campaigns) {
    const region = identifyCampaignRegion(campaign.name, regionConfigs) || 'Unknown';
    grouped.get(region)!.push(campaign);
  }

  return grouped;
}

// ============================================================================
// MAIN AGGREGATOR
// ============================================================================

export async function runMultiRegionAgents(
  clientId: string,
  options: {
    metaAccountId: string;
    metaToken?: string;
    shopifyTokens?: Record<string, string>; // domain -> token
    regionConfigs?: RegionConfig[];
    autoExecute?: boolean;
    includeTimeSavers?: boolean;
  }
): Promise<MultiRegionRun> {
  const {
    metaAccountId,
    metaToken,
    shopifyTokens = {},
    regionConfigs = DEFAULT_REGION_CONFIGS,
    autoExecute = false,
    includeTimeSavers = false,
  } = options;

  const runId = uuidv4();
  const startedAt = new Date();

  logger.info(`[MultiRegion] Starting multi-region run ${runId} for ${clientId}`);

  // Get client context
  const clientContext = getClientContext(clientId);
  if (!clientContext) {
    throw new Error(`Client context not found for ${clientId}`);
  }

  // Get active Shopify stores
  const shopifyStores = getActiveShopifyStores(clientId);

  // Map regions to Shopify stores
  const regionToShopify = new Map<string, ShopifyStore>();
  for (const store of shopifyStores) {
    regionToShopify.set(store.region, store);
  }

  logger.info(`[MultiRegion] Meta account: ${metaAccountId}, Shopify stores: ${shopifyStores.length}`);

  const regionRuns: RegionRun[] = [];
  const findingsByRegion: Record<string, RegionalFinding[]> = {};
  const savingsByRegion: Record<string, number> = {};
  const regionSpecificActions: Record<string, string[]> = {};

  // Run agents for each region
  for (const config of regionConfigs) {
    const regionStart = Date.now();
    const shopifyStore = regionToShopify.get(config.name);

    logger.info(`[MultiRegion] Running agents for ${config.name} region`);

    try {
      // Run unified agents with region context
      // Note: In a full implementation, we'd filter Meta API calls by campaign name patterns
      // For now, we run agents and tag findings with region
      const run = await runAllAgents(clientId, metaAccountId, {
        clientId,
        autoExecute,
        includeMeta: true,
        includeShopify: !!shopifyStore,
        includeTimeSavers,
        metaToken,
        shopDomain: shopifyStore?.domain,
        shopifyToken: shopifyTokens[shopifyStore?.domain || ''] || shopifyStore?.accessToken,
      });

      // Tag findings with region
      const regionalFindings: RegionalFinding[] = run.findings.map(f => ({
        ...f,
        region: config.name,
        campaignsAffected: [], // Would be populated from Meta API data
      }));

      findingsByRegion[config.name] = regionalFindings;
      savingsByRegion[config.name] = run.estimatedMonthlySavings;
      regionSpecificActions[config.name] = run.findings
        .filter(f => f.actionPending)
        .map(f => f.actionPending!);

      regionRuns.push({
        region: config.name,
        campaignCount: 0, // Would be populated from Meta API
        shopifyConnected: !!shopifyStore,
        run,
        durationMs: Date.now() - regionStart,
      });

    } catch (err) {
      logger.error(`[MultiRegion] Failed for ${config.name}: ${err}`);
      regionRuns.push({
        region: config.name,
        campaignCount: 0,
        shopifyConnected: !!shopifyStore,
        run: null,
        error: String(err),
        durationMs: Date.now() - regionStart,
      });
      findingsByRegion[config.name] = [];
      savingsByRegion[config.name] = 0;
    }
  }

  // Generate cross-region insights
  const crossRegionInsights = generateCrossRegionInsights(regionRuns, findingsByRegion, savingsByRegion);

  // Calculate totals
  const totalEstimatedSavings = Object.values(savingsByRegion).reduce((a, b) => a + b, 0);
  const allFindings = Object.values(findingsByRegion).flat();
  const criticalFindings = allFindings.filter(f => f.severity === 'critical').length;

  // Top priorities across all regions
  const topPriorities = allFindings
    .filter(f => f.severity === 'critical' || f.severity === 'high')
    .sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    })
    .slice(0, 5)
    .map(f => `[${f.region}] ${f.title}`);

  const completedAt = new Date();
  const totalDurationMs = completedAt.getTime() - startedAt.getTime();

  const result: MultiRegionRun = {
    runId,
    clientId,
    clientName: clientContext.name,
    metaAccountId,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    totalDurationMs,
    regionRuns,
    regionsAnalyzed: regionRuns.filter(r => r.run !== null).length,
    findingsByRegion,
    crossRegionInsights,
    totalFindings: allFindings.length,
    criticalFindings,
    totalEstimatedSavings,
    savingsByRegion,
    topPriorities,
    regionSpecificActions,
  };

  // Record in strategic memory
  const weekNumber = getISOWeekNumber(completedAt);
  const reportRecord: ReportRecord = {
    id: runId,
    clientId,
    reportType: 'multi-region-run',
    generatedAt: completedAt.toISOString(),
    weekNumber,
    year: completedAt.getFullYear(),
    headline: topPriorities[0] || 'Multi-Region Intelligence Run',
    keyInsights: topPriorities,
    recommendations: allFindings.filter(f => f.actionPending).map(f => f.actionPending!),
    metricsSnapshot: {
      totalFindings: allFindings.length,
      criticalFindings,
      totalSavings: totalEstimatedSavings,
      regionsAnalyzed: result.regionsAnalyzed,
    },
    qualityScore: 0,
    wasShipped: true,
    shipDecision: 'SHIP',
    deliveredVia: [],
  };

  try {
    recordReport(reportRecord);
    logger.info(`[MultiRegion] Recorded multi-region report in strategic memory`);
  } catch (err) {
    logger.error(`[MultiRegion] Failed to record report: ${err}`);
  }

  logger.info(
    `[MultiRegion] Run ${runId} complete: ${allFindings.length} findings across ${result.regionsAnalyzed} regions, ` +
    `Rs ${totalEstimatedSavings.toLocaleString()} total estimated savings`
  );

  return result;
}

// ============================================================================
// CROSS-REGION INSIGHTS
// ============================================================================

function generateCrossRegionInsights(
  regionRuns: RegionRun[],
  findingsByRegion: Record<string, RegionalFinding[]>,
  savingsByRegion: Record<string, number>
): CrossRegionInsight[] {
  const insights: CrossRegionInsight[] = [];
  const successfulRegions = regionRuns.filter(r => r.run !== null);

  if (successfulRegions.length < 2) {
    return insights; // Need at least 2 regions to compare
  }

  // 1. Compare savings potential between regions
  const sortedSavings = Object.entries(savingsByRegion)
    .filter(([, savings]) => savings > 0)
    .sort(([, a], [, b]) => b - a);

  if (sortedSavings.length >= 2) {
    const [highRegion, highSavings] = sortedSavings[0];
    const [lowRegion, lowSavings] = sortedSavings[sortedSavings.length - 1];

    if (highSavings > lowSavings * 1.5) {
      insights.push({
        type: 'performance_gap',
        title: `${highRegion} has ${((highSavings / (lowSavings || 1)) - 1) * 100 | 0}% more optimization potential than ${lowRegion}`,
        description: `${highRegion} shows Rs ${highSavings.toLocaleString()} in potential savings vs Rs ${lowSavings.toLocaleString()} in ${lowRegion}.`,
        regions: [highRegion, lowRegion],
        metrics: { highSavings, lowSavings, ratio: highSavings / (lowSavings || 1) },
        priority: 'high',
        actionable: `Focus optimization efforts on ${highRegion} first for maximum ROI`,
      });
    }
  }

  // 2. Find issues appearing in multiple regions (shared problems)
  const issuesByType = new Map<string, string[]>();
  for (const [region, findings] of Object.entries(findingsByRegion)) {
    for (const finding of findings) {
      const key = `${finding.agentName}:${finding.severity}`;
      if (!issuesByType.has(key)) {
        issuesByType.set(key, []);
      }
      if (!issuesByType.get(key)!.includes(region)) {
        issuesByType.get(key)!.push(region);
      }
    }
  }

  const sharedIssues = Array.from(issuesByType.entries())
    .filter(([, regions]) => regions.length >= 2);

  if (sharedIssues.length > 0) {
    insights.push({
      type: 'shared_issue',
      title: `${sharedIssues.length} issue types found across multiple regions`,
      description: `Shared problems may indicate systemic issues in creative strategy or product catalog management.`,
      regions: [...new Set(sharedIssues.flatMap(([, regions]) => regions))],
      metrics: { sharedIssueTypes: sharedIssues.length },
      priority: 'high',
      actionable: 'Review creative strategy and product catalog for systemic issues',
    });
  }

  // 3. Identify best practices from top-performing region
  const topRegion = sortedSavings.length > 0 ? sortedSavings[sortedSavings.length - 1][0] : null;
  if (topRegion && findingsByRegion[topRegion]?.length < 3) {
    insights.push({
      type: 'best_practice',
      title: `${topRegion} has fewest issues - study what's working`,
      description: `${topRegion} shows minimal optimization needed. Analyze campaigns and replicate patterns to other regions.`,
      regions: [topRegion],
      metrics: { issueCount: findingsByRegion[topRegion]?.length || 0 },
      priority: 'medium',
      actionable: `Document ${topRegion} campaign structure and creative approach for replication`,
    });
  }

  // 4. Regional opportunity based on Shopify connection
  const regionsWithoutShopify = regionRuns.filter(r => !r.shopifyConnected && r.run !== null);
  if (regionsWithoutShopify.length > 0) {
    insights.push({
      type: 'regional_opportunity',
      title: `${regionsWithoutShopify.length} regions missing Shopify integration`,
      description: `Regions without Shopify: ${regionsWithoutShopify.map(r => r.region).join(', ')}. Cross-platform agents (OOS, Margin ROAS) can't run.`,
      regions: regionsWithoutShopify.map(r => r.region),
      metrics: { missingShopifyCount: regionsWithoutShopify.length },
      priority: 'medium',
      actionable: 'Connect Shopify stores for these regions to enable cross-platform intelligence',
    });
  }

  return insights;
}

// ============================================================================
// HELPERS
// ============================================================================

function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// ============================================================================
// FORMATTED OUTPUT
// ============================================================================

export function formatMultiRegionSummary(run: MultiRegionRun): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('═'.repeat(70));
  lines.push('         MULTI-REGION INTELLIGENCE REPORT');
  lines.push(`         ${run.clientName.toUpperCase()}`);
  lines.push('═'.repeat(70));
  lines.push('');
  lines.push(`Meta Account: ${run.metaAccountId}`);
  lines.push(`Run ID: ${run.runId.slice(0, 8)}`);
  lines.push(`Duration: ${(run.totalDurationMs / 1000).toFixed(1)}s`);
  lines.push(`Regions Analyzed: ${run.regionsAnalyzed}`);
  lines.push('');

  // Savings by region
  lines.push('┌─────────────────────────────────────────────────────────────────┐');
  lines.push('│                    SAVINGS BY REGION                            │');
  lines.push('├─────────────────────────────────────────────────────────────────┤');
  for (const [region, savings] of Object.entries(run.savingsByRegion)) {
    if (savings > 0) {
      lines.push(`│  ${region.padEnd(20)} Rs ${savings.toLocaleString().padStart(15)}          │`);
    }
  }
  lines.push('├─────────────────────────────────────────────────────────────────┤');
  lines.push(`│  TOTAL                    Rs ${run.totalEstimatedSavings.toLocaleString().padStart(15)}          │`);
  lines.push('└─────────────────────────────────────────────────────────────────┘');
  lines.push('');

  // Cross-region insights
  if (run.crossRegionInsights.length > 0) {
    lines.push('🔗 CROSS-REGION INSIGHTS:');
    for (const insight of run.crossRegionInsights) {
      const icon = insight.priority === 'critical' ? '🚨' :
                   insight.priority === 'high' ? '⚠️' :
                   insight.type === 'best_practice' ? '✨' : '📊';
      lines.push(`  ${icon} ${insight.title}`);
      lines.push(`     → ${insight.actionable}`);
    }
    lines.push('');
  }

  // Top priorities
  if (run.topPriorities.length > 0) {
    lines.push('🎯 TOP PRIORITIES:');
    for (let i = 0; i < run.topPriorities.length; i++) {
      lines.push(`  ${i + 1}. ${run.topPriorities[i]}`);
    }
    lines.push('');
  }

  // Region breakdown
  lines.push('📊 REGION BREAKDOWN:');
  for (const regionRun of run.regionRuns) {
    if (regionRun.run) {
      const shopifyIcon = regionRun.shopifyConnected ? '🔗' : '⚠️';
      const findings = regionRun.run.totalFindings;
      const savings = regionRun.run.estimatedMonthlySavings;
      lines.push(`  ✅ ${regionRun.region} ${shopifyIcon}`);
      lines.push(`     ${findings} findings, Rs ${savings.toLocaleString()} savings`);

      // Region-specific actions
      const actions = run.regionSpecificActions[regionRun.region] || [];
      if (actions.length > 0) {
        lines.push(`     Actions: ${actions.slice(0, 2).join('; ')}`);
      }
    } else {
      lines.push(`  ❌ ${regionRun.region}: ${regionRun.error || 'Failed'}`);
    }
  }
  lines.push('');

  lines.push('═'.repeat(70));

  return lines.join('\n');
}
