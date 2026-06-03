/**
 * Operator Experience — COMPLETE OPERATOR EXPERIENCE PACKAGE
 *
 * The complete intelligence package combining all tiers, plus the
 * module-load log line that signals all tiers are wired up.
 */

import { logger } from '../../utils/logger.js';
import type { Evidence } from '../quality-gate.js';
import type { ClientPlaybook } from '../learning-engine.js';
import type {
  CrossSignalData,
  CompetitorSnapshot,
  AnticipationContext,
  OperatorIntelligencePackage,
  Tier2IntelligencePackage,
  Tier3IntelligencePackage,
  CompleteOperatorExperience,
} from './types.js';
import { generateOperatorPackage } from './operator-package.js';
import { generateTier2Package } from './tier2-package.js';
import { generateTier3Package } from './tier3-package.js';

/**
 * Generate complete operator experience
 */
export function generateCompleteExperience(
  clientId: string,
  insights: Array<{ type: string; evidence: Evidence[]; context: Record<string, unknown> }>,
  playbook?: ClientPlaybook,
  additionalData?: {
    crossSignalData?: CrossSignalData;
    metrics?: Array<{ metric: string; value: number; change: number }>;
    competitorSnapshots?: { current: CompetitorSnapshot[]; previous: CompetitorSnapshot[] };
    anticipationContext?: AnticipationContext;
  }
): CompleteOperatorExperience {
  // Generate Tier 1
  const tier1 = generateOperatorPackage(
    clientId,
    insights,
    playbook,
    additionalData?.crossSignalData
  );

  // Generate Tier 2
  const tier2 = generateTier2Package(
    clientId,
    tier1.narrativeInsights,
    tier1.hiddenOpportunities,
    tier1.timedItems,
    additionalData?.metrics
  );

  // Generate Tier 3
  const tier3 = generateTier3Package(
    clientId,
    additionalData?.competitorSnapshots,
    additionalData?.anticipationContext
  );

  // Generate executive summary
  const executiveSummary = generateExecutiveSummary(tier1, tier2, tier3);

  return {
    generatedAt: new Date().toISOString(),
    clientId,
    tier1,
    tier2,
    tier3,
    executiveSummary,
  };
}

/**
 * Generate executive summary
 */
function generateExecutiveSummary(
  tier1: OperatorIntelligencePackage,
  tier2: Tier2IntelligencePackage,
  tier3: Tier3IntelligencePackage
): string {
  const parts: string[] = [];

  parts.push('**EXECUTIVE SUMMARY**\n');

  // THE ONE THING
  if (tier1.theOneThing) {
    parts.push(`**Priority:** ${tier1.theOneThing.action}`);
    parts.push(`↳ ${tier1.theOneThing.whyThisAboveAll}\n`);
  }

  // Trust indicator
  parts.push(`**Trust Score:** ${tier3.overallTrustScore}/100 (${tier3.predictionScorecard.trustLevel})`);

  // Key numbers
  parts.push(`**Active Insights:** ${tier1.narrativeInsights.length}`);
  parts.push(`**Hidden Opportunities:** ${tier1.hiddenOpportunities.length}`);
  parts.push(`**Competitor Alerts:** ${tier3.competitorMovements.length}`);
  parts.push(`**Anticipated Needs:** ${tier3.anticipatedNeeds.length}`);

  // Timing
  const criticalItems = tier1.timedItems.filter(t => t.urgencyLevel === 'critical');
  if (criticalItems.length > 0) {
    parts.push(`\n**⚠️ ${criticalItems.length} critical item(s) need attention today**`);
  }

  return parts.join('\n');
}

// ============================================================================
// Logging
// ============================================================================

logger.info('[OperatorExperience] All tiers loaded — Narratives, Opportunities, Timing, Roles, Compression, Disclosure, Trust, Competitors, Anticipation');
