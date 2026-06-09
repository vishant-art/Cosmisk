/**
 * Quality-Gated Agent Runner
 *
 * Wraps the unified agent runner and filters ALL outputs through the Intelligence Layer.
 * Only ships findings that meet elite quality standards.
 *
 * For each finding:
 * 1. Evaluates thinking quality (was reasoning deep?)
 * 2. Evaluates output quality (is this actionable?)
 * 3. Detects mediocrity (is this dashboard-level?)
 * 4. Checks commoditization (can any tool show this?)
 * 5. Applies spend-tier thresholds
 *
 * Findings that don't pass are:
 * - Logged for analysis
 * - NOT shipped to client
 * - Flagged for agent improvement
 */

import { logger } from '../utils/logger.js';
import {
  runAllAgents,
  type UnifiedAgentRun,
  type AgentFinding,
} from './unified-agent-runner.js';

import {
  evaluateEliteQuality,
  quickQualityCheck,
  detectMediocrity,
  createEmptyThinkingTrace,
  addHypothesis,
  addEvidenceSearch,
  type EliteQualityVerdict,
} from './intelligence-layer/index.js';

import { getSpendTier } from './intelligence-layer/deep-search-protocol.js';

// ============================================================================
// Types
// ============================================================================

export interface QualityGatedFinding extends AgentFinding {
  qualityScore: number;
  qualityVerdict: 'SHIP_ELITE' | 'SHIP_ADEQUATE' | 'HOLD_FOR_REVIEW' | 'REJECTED' | 'REJECTED_NO_DATA';
  rejectionReason?: string;
}

export interface QualityGatedRun extends UnifiedAgentRun {
  // Quality metrics
  qualityGateEnabled: boolean;
  spendTier: string;
  qualityThreshold: number;

  // Filtered findings
  shippedFindings: QualityGatedFinding[];
  rejectedFindings: QualityGatedFinding[];

  // Stats
  totalFindingsBeforeGate: number;
  totalFindingsAfterGate: number;
  rejectionRate: number;
  averageQualityScore: number;
}

// ============================================================================
// Quality Evaluation for Findings
// ============================================================================

function evaluateFindingQuality(
  finding: AgentFinding,
  monthlySpend: number,
): { score: number; verdict: QualityGatedFinding['qualityVerdict']; rejectionReason?: string } {
  // Build a minimal thinking trace based on finding metadata
  let trace = createEmptyThinkingTrace();

  // Add hypothesis based on finding
  trace = addHypothesis(
    trace,
    finding.title,
    true,
    [finding.description],
    0.8,
    false
  );

  // Add evidence based on metrics
  const metricsCount = Object.keys(finding.metrics).length;
  trace = addEvidenceSearch(
    trace,
    finding.agentName,
    'Finding metrics',
    metricsCount > 0,
    `${metricsCount} metrics found`
  );

  // Build content from finding
  const content = `${finding.title}\n\n${finding.description}\n\nMetrics: ${JSON.stringify(finding.metrics)}`;
  const recommendations = [
    finding.actionTaken || finding.actionPending || 'Review and take action'
  ].filter(Boolean) as string[];

  // Quick mediocrity check first
  const mediocrity = detectMediocrity(content);
  if (mediocrity.overallSeverity === 'fatal') {
    return {
      score: 20,
      verdict: 'REJECTED',
      rejectionReason: `Mediocrity: ${mediocrity.matches[0]?.description || 'Dashboard-level insight'}`,
    };
  }

  // Full quality evaluation
  const qualityInput = {
    clientId: 'quality-gate',
    monthlySpend,
    reportType: finding.agentName,
    content,
    recommendations,
    thinkingTrace: trace,
    signalEvidence: Object.entries(finding.metrics).map(([key, value]) => ({
      source: 'meta_ads' as const,
      dataPoint: key,
      value: String(value),
      confidence: 0.8,
    })),
    crossSourceSynthesis: false,
  };

  const verdict = evaluateEliteQuality(qualityInput);

  let qualityVerdict: QualityGatedFinding['qualityVerdict'];
  if (verdict.ship && verdict.combinedScore >= 85) {
    qualityVerdict = 'SHIP_ELITE';
  } else if (verdict.ship) {
    qualityVerdict = 'SHIP_ADEQUATE';
  } else if (verdict.combinedScore >= 50) {
    qualityVerdict = 'HOLD_FOR_REVIEW';
  } else {
    qualityVerdict = 'REJECTED';
  }

  return {
    score: verdict.combinedScore,
    verdict: qualityVerdict,
    rejectionReason: verdict.rejection?.primaryReason,
  };
}

// ============================================================================
// Cross-Platform Finding Detection
// ============================================================================

/**
 * Determines if a finding is cross-platform (unique value) vs single-platform
 * Cross-platform findings get boosted scores
 */
function isCrossPlatformFinding(finding: AgentFinding): boolean {
  const crossPlatformAgents = [
    'oos_detector',           // Meta + Shopify
    'discount_leakage',       // Shopify + Web scraping
    'margin_weighted_roas',   // Meta + Shopify
    'creative_ltv',           // Meta + Shopify
    'creative_returns',       // Meta + Shopify
    'cohort_ltv',             // Meta + Shopify (via UTM)
  ];

  return crossPlatformAgents.includes(finding.agentName);
}

/**
 * Determines if a finding is just replicating dashboard data
 */
function isDashboardReplication(finding: AgentFinding): boolean {
  const dashboardAgents = [
    'audience_saturation',    // Meta shows frequency
    'placement_efficiency',   // Meta shows placements
    'time_of_day',            // Meta shows hourly data
    'inventory_velocity',     // Shopify shows low stock
    'new_vs_repeat',          // Shopify shows this
  ];

  return dashboardAgents.includes(finding.agentName);
}

// ============================================================================
// Main Quality-Gated Runner
// ============================================================================

export async function runAllAgentsWithQualityGate(
  userId: string,
  accountId: string,
  monthlySpend: number,
  options: {
    autoExecute?: boolean;
    includeShopify?: boolean;
    includeMeta?: boolean;
    includeTimeSavers?: boolean;
    metaToken?: string;
    shopDomain?: string;
    shopifyToken?: string;
    catalogId?: string;
    // Quality gate options
    enableQualityGate?: boolean;
    qualityThresholdOverride?: number;
  } = {}
): Promise<QualityGatedRun> {
  const {
    enableQualityGate = true,
    qualityThresholdOverride,
    ...runnerOptions
  } = options;

  // Run the standard unified agent runner
  const baseRun = await runAllAgents(userId, accountId, runnerOptions);

  // If quality gate disabled, return as-is with wrapper
  if (!enableQualityGate) {
    return {
      ...baseRun,
      qualityGateEnabled: false,
      spendTier: getSpendTier(monthlySpend),
      qualityThreshold: 0,
      shippedFindings: baseRun.findings.map(f => ({
        ...f,
        qualityScore: 100,
        qualityVerdict: 'SHIP_ADEQUATE' as const,
      })),
      rejectedFindings: [],
      totalFindingsBeforeGate: baseRun.findings.length,
      totalFindingsAfterGate: baseRun.findings.length,
      rejectionRate: 0,
      averageQualityScore: 100,
    };
  }

  // Determine threshold based on spend tier
  const spendTier = getSpendTier(monthlySpend);
  const qualityThreshold = qualityThresholdOverride ?? (
    spendTier === 'enterprise' ? 85 :
    spendTier === 'scale' ? 75 :
    spendTier === 'growth' ? 65 :
    55
  );

  logger.info(`[QualityGate] Evaluating ${baseRun.findings.length} findings against ${qualityThreshold}+ threshold (${spendTier} tier)`);

  // Evaluate each finding
  const shippedFindings: QualityGatedFinding[] = [];
  const rejectedFindings: QualityGatedFinding[] = [];
  let totalScore = 0;

  for (const finding of baseRun.findings) {
    // Cross-platform findings get evaluated normally
    // Dashboard replication findings get penalized
    const isDashboard = isDashboardReplication(finding);
    const isCrossPlat = isCrossPlatformFinding(finding);

    const evaluation = evaluateFindingQuality(finding, monthlySpend);

    // Boost cross-platform, penalize dashboard replication
    let adjustedScore = evaluation.score;
    if (isCrossPlat) {
      adjustedScore = Math.min(100, adjustedScore + 10);
    }
    if (isDashboard) {
      adjustedScore = Math.max(0, adjustedScore - 15);
    }

    totalScore += adjustedScore;

    const gatedFinding: QualityGatedFinding = {
      ...finding,
      qualityScore: adjustedScore,
      qualityVerdict: evaluation.verdict,
      rejectionReason: evaluation.rejectionReason,
    };

    // Ship or reject based on threshold
    if (adjustedScore >= qualityThreshold && evaluation.verdict !== 'REJECTED') {
      shippedFindings.push(gatedFinding);
      logger.info(`[QualityGate] ✅ SHIPPED: ${finding.title} (score: ${adjustedScore})`);
    } else {
      rejectedFindings.push(gatedFinding);
      logger.warn(`[QualityGate] ❌ REJECTED: ${finding.title} (score: ${adjustedScore}, reason: ${evaluation.rejectionReason || 'Below threshold'})`);
    }
  }

  const averageQualityScore = baseRun.findings.length > 0
    ? Math.round(totalScore / baseRun.findings.length)
    : 0;

  const rejectionRate = baseRun.findings.length > 0
    ? Math.round((rejectedFindings.length / baseRun.findings.length) * 100)
    : 0;

  logger.info(`[QualityGate] Results: ${shippedFindings.length} shipped, ${rejectedFindings.length} rejected (${rejectionRate}% rejection rate)`);

  return {
    ...baseRun,
    // Override findings with only shipped ones
    findings: shippedFindings,
    totalFindings: shippedFindings.length,

    // Quality metrics
    qualityGateEnabled: true,
    spendTier,
    qualityThreshold,
    shippedFindings,
    rejectedFindings,
    totalFindingsBeforeGate: baseRun.findings.length,
    totalFindingsAfterGate: shippedFindings.length,
    rejectionRate,
    averageQualityScore,
  };
}

// ============================================================================
// Quality Report Generation
// ============================================================================

export function generateQualityReport(run: QualityGatedRun): string {
  const lines: string[] = [
    '# Quality Gate Report',
    '',
    `**Spend Tier:** ${run.spendTier}`,
    `**Quality Threshold:** ${run.qualityThreshold}+`,
    `**Average Score:** ${run.averageQualityScore}/100`,
    '',
    '## Summary',
    '',
    `- **Total findings generated:** ${run.totalFindingsBeforeGate}`,
    `- **Findings shipped:** ${run.totalFindingsAfterGate}`,
    `- **Findings rejected:** ${run.rejectedFindings.length}`,
    `- **Rejection rate:** ${run.rejectionRate}%`,
    '',
  ];

  if (run.shippedFindings.length > 0) {
    lines.push('## Shipped Findings');
    lines.push('');
    for (const f of run.shippedFindings) {
      lines.push(`### ✅ ${f.title}`);
      lines.push(`- **Score:** ${f.qualityScore}/100`);
      lines.push(`- **Verdict:** ${f.qualityVerdict}`);
      lines.push(`- **Agent:** ${f.agentName}`);
      lines.push(`- **Severity:** ${f.severity}`);
      lines.push('');
    }
  }

  if (run.rejectedFindings.length > 0) {
    lines.push('## Rejected Findings (Not Shipped)');
    lines.push('');
    for (const f of run.rejectedFindings) {
      lines.push(`### ❌ ${f.title}`);
      lines.push(`- **Score:** ${f.qualityScore}/100`);
      lines.push(`- **Rejection Reason:** ${f.rejectionReason || 'Below threshold'}`);
      lines.push(`- **Agent:** ${f.agentName}`);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('*Better to ship nothing than ship mediocrity.*');

  return lines.join('\n');
}

// Types are exported inline with their definitions above
