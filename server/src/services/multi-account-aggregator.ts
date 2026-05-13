/**
 * MULTI-ACCOUNT AGGREGATOR
 *
 * Runs agents across all accounts for a client and aggregates findings.
 *
 * Solves: "Client has India + USA accounts, wants unified intelligence"
 *
 * Features:
 * - Runs agents on each active Meta account in parallel
 * - Runs agents on each active Shopify store
 * - Aggregates findings into a single report
 * - Cross-account insights (e.g., "USA outperforming India on X")
 * - Deduplicates similar findings across accounts
 * - Prioritizes by total impact across all accounts
 */

import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import {
  getClientContext,
  getActiveMetaAccounts,
  getActiveShopifyStores,
  type ClientContext,
  type MetaAccount,
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

export interface AccountRun {
  accountId: string;
  accountName: string;
  region: string;
  type: 'meta' | 'shopify';
  run: UnifiedAgentRun | null;
  error?: string;
  durationMs: number;
}

export interface CrossAccountInsight {
  type: 'performance_gap' | 'shared_issue' | 'regional_pattern' | 'opportunity';
  title: string;
  description: string;
  accounts: string[];
  metrics: Record<string, number | string>;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface AggregatedFinding extends AgentFinding {
  sourceAccounts: string[];
  totalImpact: number;
  isSharedAcrossAccounts: boolean;
}

export interface MultiAccountRun {
  runId: string;
  clientId: string;
  clientName: string;

  // Timing
  startedAt: string;
  completedAt: string;
  totalDurationMs: number;

  // Account runs
  accountRuns: AccountRun[];
  accountsSucceeded: number;
  accountsFailed: number;

  // Aggregated results
  aggregatedFindings: AggregatedFinding[];
  crossAccountInsights: CrossAccountInsight[];
  totalFindings: number;
  criticalFindings: number;

  // Impact
  totalEstimatedSavings: number;
  savingsByRegion: Record<string, number>;

  // Summary
  topPriorities: string[];
}

// ============================================================================
// MAIN AGGREGATOR
// ============================================================================

export async function runMultiAccountAgents(
  clientId: string,
  options: {
    autoExecute?: boolean;
    includeTimeSavers?: boolean;
    parallelExecution?: boolean; // Run accounts in parallel (default true)
    metaTokens?: Record<string, string>; // accountId -> token
    shopifyTokens?: Record<string, string>; // domain -> token
  } = {}
): Promise<MultiAccountRun> {
  const {
    autoExecute = false,
    includeTimeSavers = false,
    parallelExecution = true,
    metaTokens = {},
    shopifyTokens = {},
  } = options;

  const runId = uuidv4();
  const startedAt = new Date();

  logger.info(`[MultiAccount] Starting multi-account run ${runId} for ${clientId}`);

  // Get client context
  const clientContext = getClientContext(clientId);
  if (!clientContext) {
    throw new Error(`Client context not found for ${clientId}`);
  }

  // Get active accounts
  const metaAccounts = getActiveMetaAccounts(clientId);
  const shopifyStores = getActiveShopifyStores(clientId);

  logger.info(`[MultiAccount] Found ${metaAccounts.length} Meta accounts, ${shopifyStores.length} Shopify stores`);

  const accountRuns: AccountRun[] = [];

  // ============ RUN META ACCOUNTS ============
  const metaRunPromises = metaAccounts.map(async (account): Promise<AccountRun> => {
    const accountStart = Date.now();
    try {
      logger.info(`[MultiAccount] Running agents on Meta account: ${account.name} (${account.id})`);

      const run = await runAllAgents(clientId, account.id, {
        clientId,
        autoExecute,
        includeMeta: true,
        includeShopify: false, // Run Shopify separately
        includeTimeSavers,
        metaToken: metaTokens[account.id],
      });

      return {
        accountId: account.id,
        accountName: account.name,
        region: account.region,
        type: 'meta',
        run,
        durationMs: Date.now() - accountStart,
      };
    } catch (err) {
      logger.error(`[MultiAccount] Failed on ${account.name}: ${err}`);
      return {
        accountId: account.id,
        accountName: account.name,
        region: account.region,
        type: 'meta',
        run: null,
        error: String(err),
        durationMs: Date.now() - accountStart,
      };
    }
  });

  // ============ RUN SHOPIFY STORES ============
  const shopifyRunPromises = shopifyStores.map(async (store): Promise<AccountRun> => {
    const storeStart = Date.now();
    try {
      logger.info(`[MultiAccount] Running agents on Shopify store: ${store.name} (${store.domain})`);

      const run = await runAllAgents(clientId, '', {
        clientId,
        autoExecute,
        includeMeta: false, // Run Meta separately
        includeShopify: true,
        includeTimeSavers,
        shopDomain: store.domain,
        shopifyToken: shopifyTokens[store.domain] || store.accessToken,
      });

      return {
        accountId: store.domain,
        accountName: store.name,
        region: store.region,
        type: 'shopify',
        run,
        durationMs: Date.now() - storeStart,
      };
    } catch (err) {
      logger.error(`[MultiAccount] Failed on ${store.name}: ${err}`);
      return {
        accountId: store.domain,
        accountName: store.name,
        region: store.region,
        type: 'shopify',
        run: null,
        error: String(err),
        durationMs: Date.now() - storeStart,
      };
    }
  });

  // Execute all runs (parallel or sequential)
  if (parallelExecution) {
    const allRuns = await Promise.all([...metaRunPromises, ...shopifyRunPromises]);
    accountRuns.push(...allRuns);
  } else {
    for (const promise of [...metaRunPromises, ...shopifyRunPromises]) {
      accountRuns.push(await promise);
    }
  }

  // ============ AGGREGATE FINDINGS ============
  const allFindings: Array<AgentFinding & { sourceAccount: string; sourceRegion: string }> = [];

  for (const accountRun of accountRuns) {
    if (accountRun.run) {
      for (const finding of accountRun.run.findings) {
        allFindings.push({
          ...finding,
          sourceAccount: accountRun.accountName,
          sourceRegion: accountRun.region,
        });
      }
    }
  }

  // Group and deduplicate findings
  const aggregatedFindings = aggregateFindings(allFindings);

  // Generate cross-account insights
  const crossAccountInsights = generateCrossAccountInsights(accountRuns, aggregatedFindings);

  // Calculate savings by region
  const savingsByRegion: Record<string, number> = {};
  for (const accountRun of accountRuns) {
    if (accountRun.run) {
      const region = accountRun.region;
      savingsByRegion[region] = (savingsByRegion[region] || 0) + accountRun.run.estimatedMonthlySavings;
    }
  }

  // Calculate totals
  const totalEstimatedSavings = Object.values(savingsByRegion).reduce((a, b) => a + b, 0);
  const accountsSucceeded = accountRuns.filter(r => r.run !== null).length;
  const accountsFailed = accountRuns.filter(r => r.run === null).length;
  const criticalFindings = aggregatedFindings.filter(f => f.severity === 'critical').length;

  // Top priorities
  const topPriorities = aggregatedFindings
    .filter(f => f.severity === 'critical' || f.severity === 'high')
    .sort((a, b) => b.totalImpact - a.totalImpact)
    .slice(0, 5)
    .map(f => f.title);

  const completedAt = new Date();
  const totalDurationMs = completedAt.getTime() - startedAt.getTime();

  const result: MultiAccountRun = {
    runId,
    clientId,
    clientName: clientContext.name,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    totalDurationMs,
    accountRuns,
    accountsSucceeded,
    accountsFailed,
    aggregatedFindings,
    crossAccountInsights,
    totalFindings: aggregatedFindings.length,
    criticalFindings,
    totalEstimatedSavings,
    savingsByRegion,
    topPriorities,
  };

  // Record in strategic memory
  const weekNumber = getISOWeekNumber(completedAt);
  const reportRecord: ReportRecord = {
    id: runId,
    clientId,
    reportType: 'multi-account-run',
    generatedAt: completedAt.toISOString(),
    weekNumber,
    year: completedAt.getFullYear(),
    headline: topPriorities[0] || 'Multi-Account Intelligence Run',
    keyInsights: topPriorities,
    recommendations: aggregatedFindings.filter(f => f.actionPending).map(f => f.actionPending!),
    metricsSnapshot: {
      totalFindings: aggregatedFindings.length,
      criticalFindings,
      totalSavings: totalEstimatedSavings,
      accountsAnalyzed: accountsSucceeded,
    },
    qualityScore: 0,
    wasShipped: true,
    shipDecision: 'SHIP',
    deliveredVia: [],
  };

  try {
    recordReport(reportRecord);
    logger.info(`[MultiAccount] Recorded multi-account report in strategic memory`);
  } catch (err) {
    logger.error(`[MultiAccount] Failed to record report: ${err}`);
  }

  logger.info(
    `[MultiAccount] Run ${runId} complete: ${aggregatedFindings.length} findings across ${accountsSucceeded} accounts, ` +
    `Rs ${totalEstimatedSavings.toLocaleString()} total estimated savings`
  );

  return result;
}

// ============================================================================
// AGGREGATION HELPERS
// ============================================================================

/**
 * Aggregate findings from multiple accounts, deduplicating similar issues
 */
function aggregateFindings(
  findings: Array<AgentFinding & { sourceAccount: string; sourceRegion: string }>
): AggregatedFinding[] {
  const grouped = new Map<string, Array<AgentFinding & { sourceAccount: string; sourceRegion: string }>>();

  // Group by agent + similar title (fuzzy match)
  for (const finding of findings) {
    const key = `${finding.agentName}:${normalizeTitle(finding.title)}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(finding);
  }

  const aggregated: AggregatedFinding[] = [];

  for (const [, group] of grouped) {
    if (group.length === 0) continue;

    // Calculate total impact
    const totalImpact = group.reduce((sum, f) => {
      const spend = (f.metrics['wastedSpend'] as number) || (f.metrics['spend'] as number) || 0;
      return sum + spend;
    }, 0);

    // Merge metrics
    const mergedMetrics: Record<string, number | string> = {};
    for (const f of group) {
      for (const [key, value] of Object.entries(f.metrics)) {
        if (typeof value === 'number') {
          mergedMetrics[key] = ((mergedMetrics[key] as number) || 0) + value;
        } else {
          mergedMetrics[key] = value;
        }
      }
    }

    const sourceAccounts = [...new Set(group.map(f => f.sourceAccount))];
    const isSharedAcrossAccounts = sourceAccounts.length > 1;

    // Use highest severity
    const severities = ['critical', 'high', 'medium', 'low', 'info'] as const;
    const highestSeverity = severities.find(s => group.some(f => f.severity === s)) || 'info';

    // Create aggregated finding
    const first = group[0];
    aggregated.push({
      agentName: first.agentName,
      severity: highestSeverity,
      title: isSharedAcrossAccounts
        ? `[${sourceAccounts.length} accounts] ${first.title}`
        : `[${sourceAccounts[0]}] ${first.title}`,
      description: isSharedAcrossAccounts
        ? `Issue found in: ${sourceAccounts.join(', ')}. ${first.description}`
        : first.description,
      actionTaken: first.actionTaken,
      actionPending: first.actionPending,
      metrics: mergedMetrics,
      timestamp: first.timestamp,
      sourceAccounts,
      totalImpact,
      isSharedAcrossAccounts,
    });
  }

  // Sort by total impact (highest first)
  return aggregated.sort((a, b) => b.totalImpact - a.totalImpact);
}

/**
 * Generate cross-account insights by comparing performance
 */
function generateCrossAccountInsights(
  accountRuns: AccountRun[],
  aggregatedFindings: AggregatedFinding[]
): CrossAccountInsight[] {
  const insights: CrossAccountInsight[] = [];

  // Get successful runs grouped by region
  const byRegion = new Map<string, AccountRun[]>();
  for (const run of accountRuns.filter(r => r.run !== null)) {
    if (!byRegion.has(run.region)) {
      byRegion.set(run.region, []);
    }
    byRegion.get(run.region)!.push(run);
  }

  // Compare regions if we have multiple
  const regions = Array.from(byRegion.keys());
  if (regions.length >= 2) {
    // Compare savings potential between regions
    const savingsByRegion = new Map<string, number>();
    for (const [region, runs] of byRegion) {
      const totalSavings = runs.reduce((sum, r) => sum + (r.run?.estimatedMonthlySavings || 0), 0);
      savingsByRegion.set(region, totalSavings);
    }

    // Find highest and lowest
    const sorted = Array.from(savingsByRegion.entries()).sort((a, b) => b[1] - a[1]);
    if (sorted.length >= 2) {
      const [highestRegion, highestSavings] = sorted[0];
      const [lowestRegion, lowestSavings] = sorted[sorted.length - 1];

      if (highestSavings > lowestSavings * 2) {
        insights.push({
          type: 'performance_gap',
          title: `${highestRegion} has ${Math.round(highestSavings / lowestSavings)}x more waste than ${lowestRegion}`,
          description: `${highestRegion} shows Rs ${highestSavings.toLocaleString()} in potential savings vs Rs ${lowestSavings.toLocaleString()} in ${lowestRegion}. Focus optimization efforts on ${highestRegion}.`,
          accounts: [highestRegion, lowestRegion],
          metrics: { highestSavings, lowestSavings },
          priority: 'high',
        });
      }
    }
  }

  // Find shared issues (same problem across multiple accounts)
  const sharedIssues = aggregatedFindings.filter(f => f.isSharedAcrossAccounts);
  if (sharedIssues.length > 0) {
    insights.push({
      type: 'shared_issue',
      title: `${sharedIssues.length} issues found across multiple accounts`,
      description: `Shared problems: ${sharedIssues.slice(0, 3).map(f => f.title).join('; ')}. These may indicate systemic issues in creative or product strategy.`,
      accounts: [...new Set(sharedIssues.flatMap(f => f.sourceAccounts))],
      metrics: { sharedIssueCount: sharedIssues.length },
      priority: sharedIssues.some(f => f.severity === 'critical') ? 'critical' : 'high',
    });
  }

  // Regional pattern detection
  for (const [region, runs] of byRegion) {
    const criticalInRegion = runs.reduce((sum, r) => sum + (r.run?.criticalFindings || 0), 0);
    if (criticalInRegion >= 3) {
      insights.push({
        type: 'regional_pattern',
        title: `${region} has ${criticalInRegion} critical issues`,
        description: `Multiple critical issues detected in ${region}. This region needs immediate attention.`,
        accounts: runs.map(r => r.accountName),
        metrics: { criticalCount: criticalInRegion },
        priority: 'critical',
      });
    }
  }

  return insights;
}

/**
 * Normalize title for grouping similar findings
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/["']/g, '')
    .replace(/rs\s*[\d,]+/g, 'RS_AMOUNT')
    .replace(/\d+(\.\d+)?%/g, 'PERCENT')
    .replace(/\d+/g, 'NUM')
    .trim();
}

/**
 * Get ISO week number
 */
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

export function formatMultiAccountSummary(run: MultiAccountRun): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('═'.repeat(70));
  lines.push('         MULTI-ACCOUNT INTELLIGENCE REPORT');
  lines.push(`         ${run.clientName.toUpperCase()}`);
  lines.push('═'.repeat(70));
  lines.push('');
  lines.push(`Run ID: ${run.runId.slice(0, 8)}`);
  lines.push(`Duration: ${(run.totalDurationMs / 1000).toFixed(1)}s`);
  lines.push(`Accounts: ${run.accountsSucceeded} succeeded, ${run.accountsFailed} failed`);
  lines.push('');

  // Savings by region
  lines.push('┌─────────────────────────────────────────────────────────────────┐');
  lines.push('│                    SAVINGS BY REGION                            │');
  lines.push('├─────────────────────────────────────────────────────────────────┤');
  for (const [region, savings] of Object.entries(run.savingsByRegion)) {
    lines.push(`│  ${region.padEnd(20)} Rs ${savings.toLocaleString().padStart(15)}          │`);
  }
  lines.push('├─────────────────────────────────────────────────────────────────┤');
  lines.push(`│  TOTAL                    Rs ${run.totalEstimatedSavings.toLocaleString().padStart(15)}          │`);
  lines.push('└─────────────────────────────────────────────────────────────────┘');
  lines.push('');

  // Cross-account insights
  if (run.crossAccountInsights.length > 0) {
    lines.push('🔗 CROSS-ACCOUNT INSIGHTS:');
    for (const insight of run.crossAccountInsights) {
      const icon = insight.priority === 'critical' ? '🚨' :
                   insight.priority === 'high' ? '⚠️' : '📊';
      lines.push(`  ${icon} ${insight.title}`);
      lines.push(`     ${insight.description.slice(0, 80)}...`);
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

  // Account breakdown
  lines.push('📊 ACCOUNT BREAKDOWN:');
  for (const accountRun of run.accountRuns) {
    const status = accountRun.run ? '✅' : '❌';
    const findings = accountRun.run?.totalFindings || 0;
    const savings = accountRun.run?.estimatedMonthlySavings || 0;
    lines.push(`  ${status} ${accountRun.accountName} (${accountRun.region})`);
    lines.push(`     ${findings} findings, Rs ${savings.toLocaleString()} savings`);
  }
  lines.push('');

  lines.push('═'.repeat(70));

  return lines.join('\n');
}
