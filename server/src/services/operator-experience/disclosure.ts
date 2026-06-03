/**
 * Operator Experience — TIER 2: PROGRESSIVE DISCLOSURE
 */

import type { Evidence } from '../quality-gate.js';
import type { DisclosureDepth, ProgressiveDisclosure, NarrativeInsight } from './types.js';

/**
 * Generate progressive disclosure for an insight
 */
export function generateProgressiveDisclosure(
  insight: NarrativeInsight,
  requestedDepth: DisclosureDepth = 'tldr'
): ProgressiveDisclosure {
  // Always generate TL;DR
  const tldr = generateTldr(insight);

  const result: ProgressiveDisclosure = {
    depth: requestedDepth,
    tldr,
    canDrillDeeper: requestedDepth !== 'full_audit',
  };

  // Add summary if requested
  if (requestedDepth !== 'tldr') {
    result.summary = generateSummaryBullets(insight);
  }

  // Add detailed if requested
  if (requestedDepth === 'detailed' || requestedDepth === 'full_audit') {
    result.detailed = {
      narrative: insight.narrative,
      evidence: insight.evidence,
      alternatives: generateAlternatives(insight),
      risks: generateRisks(insight),
    };
  }

  // Add full audit if requested
  if (requestedDepth === 'full_audit') {
    result.fullAudit = {
      dataSourcesUsed: extractDataSources(insight.evidence),
      calculationsPerformed: ['Confidence scoring', 'Urgency calculation', 'Evidence correlation'],
      assumptionsMade: extractAssumptions(insight),
      confidenceBreakdown: {
        evidenceQuality: insight.confidence * 0.4,
        dataFreshness: insight.confidence * 0.3,
        signalStrength: insight.confidence * 0.3,
      },
    };
  }

  // Set drill-down prompt
  if (result.canDrillDeeper) {
    const nextDepths: Record<DisclosureDepth, DisclosureDepth> = {
      tldr: 'summary',
      summary: 'detailed',
      detailed: 'full_audit',
      full_audit: 'full_audit',
    };
    result.nextDepth = nextDepths[requestedDepth];
    result.drillDownPrompt = getDrillDownPrompt(requestedDepth);
  }

  return result;
}

/**
 * Generate TL;DR (one sentence)
 */
function generateTldr(insight: NarrativeInsight): string {
  const urgencyPrefix = {
    act_now: '🚨 ',
    this_week: '⚡ ',
    this_month: '📋 ',
    when_ready: '💡 ',
  };

  return `${urgencyPrefix[insight.urgency]}${insight.headline} — ${insight.actionStatement}`;
}

/**
 * Generate summary bullets
 */
function generateSummaryBullets(insight: NarrativeInsight): string[] {
  const bullets: string[] = [];

  bullets.push(`**What:** ${insight.headline}`);
  bullets.push(`**Why it matters:** ${insight.emotionalHook}`);
  bullets.push(`**Action:** ${insight.actionStatement}`);
  bullets.push(`**If not:** ${insight.whatIfNothing}`);

  if (insight.alternativeAction) {
    bullets.push(`**Alternative:** ${insight.alternativeAction}`);
  }

  return bullets;
}

/**
 * Generate alternative approaches
 */
function generateAlternatives(insight: NarrativeInsight): string[] {
  const alternatives: string[] = [];

  if (insight.alternativeAction) {
    alternatives.push(insight.alternativeAction);
  }

  // Generate based on urgency
  if (insight.urgency === 'act_now') {
    alternatives.push('Delegate to team member if you can\'t act personally');
    alternatives.push('Set a 24-hour reminder if you need time to decide');
  } else {
    alternatives.push('Schedule for next planning session');
    alternatives.push('Add to backlog for batch processing');
  }

  return alternatives;
}

/**
 * Generate risks of action/inaction
 */
function generateRisks(insight: NarrativeInsight): string[] {
  const risks: string[] = [];

  risks.push(`Inaction risk: ${insight.whatIfNothing}`);

  if (insight.confidence < 70) {
    risks.push(`Confidence is ${insight.confidence.toFixed(0)}% — consider gathering more data`);
  }

  if (insight.evidence.length < 3) {
    risks.push('Limited data points — recommendation may change with more data');
  }

  return risks;
}

/**
 * Extract data sources from evidence
 */
function extractDataSources(evidence: Evidence[]): string[] {
  const sources = new Set<string>();

  for (const e of evidence) {
    if (e.source) {
      sources.add(e.source);
    } else {
      sources.add('Internal metrics');
    }
  }

  return Array.from(sources);
}

/**
 * Extract assumptions made
 */
function extractAssumptions(insight: NarrativeInsight): string[] {
  const assumptions: string[] = [];

  assumptions.push('Historical patterns will continue');
  assumptions.push('Data sources are accurate and complete');

  if (insight.urgency === 'act_now') {
    assumptions.push('Immediate action is feasible');
  }

  return assumptions;
}

/**
 * Get drill-down prompt for each depth
 */
function getDrillDownPrompt(currentDepth: DisclosureDepth): string {
  const prompts: Record<DisclosureDepth, string> = {
    tldr: 'Want more context? →',
    summary: 'See full analysis →',
    detailed: 'View audit trail →',
    full_audit: '',
  };
  return prompts[currentDepth];
}

/**
 * Format disclosure for display
 */
export function formatDisclosure(disclosure: ProgressiveDisclosure): string {
  const parts: string[] = [];

  parts.push(disclosure.tldr);

  if (disclosure.summary) {
    parts.push('\n---\n');
    parts.push(disclosure.summary.join('\n'));
  }

  if (disclosure.detailed) {
    parts.push('\n---\n**DETAILED ANALYSIS**\n');
    parts.push(disclosure.detailed.narrative);
    parts.push('\n**Alternatives:**');
    parts.push(disclosure.detailed.alternatives.map(a => `- ${a}`).join('\n'));
    parts.push('\n**Risks:**');
    parts.push(disclosure.detailed.risks.map(r => `- ${r}`).join('\n'));
  }

  if (disclosure.fullAudit) {
    parts.push('\n---\n**AUDIT TRAIL**\n');
    parts.push(`Data sources: ${disclosure.fullAudit.dataSourcesUsed.join(', ')}`);
    parts.push(`Calculations: ${disclosure.fullAudit.calculationsPerformed.join(', ')}`);
    parts.push(`Assumptions: ${disclosure.fullAudit.assumptionsMade.join(', ')}`);
  }

  if (disclosure.canDrillDeeper && disclosure.drillDownPrompt) {
    parts.push(`\n${disclosure.drillDownPrompt}`);
  }

  return parts.join('\n');
}
