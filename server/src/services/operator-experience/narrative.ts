/**
 * Operator Experience — 1. NARRATIVE INTELLIGENCE
 *
 * Transform evidence into compelling stories.
 */

import type { Evidence } from '../quality-gate.js';
import type { ClientPlaybook } from '../learning-engine.js';
import type { NarrativeTemplate, NarrativeInsight } from './types.js';

/**
 * Narrative templates for common insight types
 */
const NARRATIVE_TEMPLATES: NarrativeTemplate[] = [
  {
    type: 'cpa_spike',
    pattern: 'CPA increased',
    template: 'Your CPA spiked {change}% because {causes}. This is {recoverable} with {action}.',
    emotionalHook: 'The spike has a fixable cause',
    actionFrame: 'recoverable in {timeframe}',
  },
  {
    type: 'roas_decline',
    pattern: 'ROAS dropped',
    template: 'ROAS dropped from {old}x to {new}x while {context}. The pattern suggests {root_cause}.',
    emotionalHook: 'Not random — there\'s a pattern',
    actionFrame: 'reverse this by {action}',
  },
  {
    type: 'creative_fatigue',
    pattern: 'creative fatigue',
    template: '{count} creatives hit fatigue simultaneously after {days} days. Your audience has seen these {frequency}+ times. Fresh creative can recover {potential}% of lost performance.',
    emotionalHook: 'Quantified recovery potential',
    actionFrame: 'launch {count} new creatives in next {window}',
  },
  {
    type: 'competitor_opportunity',
    pattern: 'competitor gap',
    template: 'Competitors are absent from {gap_area}. First-mover window: {window}. Similar brands saw {lift}% lift when owning this angle.',
    emotionalHook: 'Uncontested territory exists',
    actionFrame: 'test {angle} with {variants} variants this week',
  },
  {
    type: 'oos_waste',
    pattern: 'out of stock',
    template: '{spend} spent on {count} out-of-stock products in the last {period}. These ads are paying for clicks that can\'t convert.',
    emotionalHook: 'Money literally wasted',
    actionFrame: 'pause ads or restock within {hours} hours',
  },
  {
    type: 'ltv_pattern',
    pattern: 'LTV correlation',
    template: 'Customers acquired via {creative_type} have {multiplier}x higher LTV than average. You\'ve been underweighting this format by {underweight}%.',
    emotionalHook: 'Hidden profit multiplier',
    actionFrame: 'shift {percent}% of budget to {format}',
  },
  {
    type: 'discount_leakage',
    pattern: 'discount leak',
    template: 'Your "exclusive" {code} code appeared on {sites} coupon sites. {percent}% of orders used leaked codes. Margin impact: {amount}.',
    emotionalHook: 'Someone\'s stealing your margins',
    actionFrame: 'rotate codes and implement {protection}',
  },
];

/**
 * Build a narrative from raw evidence
 */
export function buildNarrative(
  insightType: string,
  evidence: Evidence[],
  context: Record<string, unknown>
): NarrativeInsight {
  const template = NARRATIVE_TEMPLATES.find(t =>
    t.type === insightType || insightType.toLowerCase().includes(t.pattern)
  );

  if (!template) {
    // Fallback to generic narrative
    return buildGenericNarrative(insightType, evidence, context);
  }

  // Fill in template with context
  let narrative = template.template;
  for (const [key, value] of Object.entries(context)) {
    narrative = narrative.replace(`{${key}}`, String(value));
  }

  // Clean up any unfilled placeholders
  narrative = narrative.replace(/\{[^}]+\}/g, '...');

  // Build headline from first sentence
  const headline = narrative.split('.')[0].slice(0, 80);

  // Calculate urgency based on evidence
  const urgency = calculateUrgency(evidence, insightType);

  // Build action statement
  let actionStatement = template.actionFrame;
  for (const [key, value] of Object.entries(context)) {
    actionStatement = actionStatement.replace(`{${key}}`, String(value));
  }

  // What happens if they do nothing
  const whatIfNothing = buildInactionCost(insightType, evidence, context);

  return {
    headline,
    narrative,
    emotionalHook: template.emotionalHook,
    evidence,
    confidence: calculateNarrativeConfidence(evidence),
    urgency,
    actionStatement,
    whatIfNothing,
  };
}

/**
 * Build generic narrative when no template matches
 */
function buildGenericNarrative(
  insightType: string,
  evidence: Evidence[],
  context: Record<string, unknown>
): NarrativeInsight {
  const primaryEvidence = evidence[0];
  const changeDirection = primaryEvidence?.changePercent
    ? (primaryEvidence.changePercent > 0 ? 'increased' : 'decreased')
    : 'changed';

  const narrative = `${primaryEvidence?.metric || 'Performance'} ${changeDirection} by ${Math.abs(primaryEvidence?.changePercent || 0).toFixed(1)}%. ` +
    `Based on ${evidence.length} data points, this pattern ${evidence.length > 1 ? 'is corroborated' : 'needs more validation'}. ` +
    `${context['suggestedAction'] || 'Review and take action.'}`;

  return {
    headline: `${primaryEvidence?.metric || 'Metric'} ${changeDirection} ${Math.abs(primaryEvidence?.changePercent || 0).toFixed(0)}%`,
    narrative,
    emotionalHook: 'Data-backed pattern detected',
    evidence,
    confidence: calculateNarrativeConfidence(evidence),
    urgency: 'this_week',
    actionStatement: String(context['suggestedAction'] || 'Review the data and decide on next steps'),
    whatIfNothing: 'Pattern may continue or worsen without intervention.',
  };
}

/**
 * Calculate urgency from evidence
 */
function calculateUrgency(
  evidence: Evidence[],
  insightType: string
): NarrativeInsight['urgency'] {
  // Immediate urgency patterns
  const immediatePatterns = ['oos', 'out_of_stock', 'severe_fatigue', 'critical'];
  if (immediatePatterns.some(p => insightType.toLowerCase().includes(p))) {
    return 'act_now';
  }

  // Check for large changes
  const maxChange = Math.max(...evidence.map(e => Math.abs(e.changePercent || 0)));
  if (maxChange > 40) return 'act_now';
  if (maxChange > 25) return 'this_week';
  if (maxChange > 10) return 'this_month';

  return 'when_ready';
}

/**
 * Calculate confidence from evidence quality
 */
export function calculateNarrativeConfidence(evidence: Evidence[]): number {
  if (evidence.length === 0) return 30;

  let confidence = 50;

  // More evidence = more confidence
  confidence += Math.min(evidence.length * 10, 30);

  // Recent evidence = more confidence
  const freshCount = evidence.filter(e => {
    const age = Date.now() - new Date(e.timestamp).getTime();
    return age < 24 * 60 * 60 * 1000; // < 24 hours
  }).length;
  confidence += freshCount * 5;

  // Strong signals = more confidence
  const strongSignals = evidence.filter(e =>
    Math.abs(e.changePercent || 0) > 20
  ).length;
  confidence += strongSignals * 5;

  return Math.min(confidence, 95);
}

/**
 * Build cost of inaction statement
 */
function buildInactionCost(
  insightType: string,
  evidence: Evidence[],
  context: Record<string, unknown>
): string {
  const costTemplates: Record<string, string> = {
    cpa_spike: 'Every day of delay costs approximately {daily_cost} in wasted spend.',
    roas_decline: 'Current trajectory projects {projected_loss} in lost revenue this month.',
    creative_fatigue: 'Without refresh, expect {decline}% further decline in the next 7 days.',
    competitor_opportunity: 'Competitors may fill this gap within {window}, closing the opportunity.',
    oos_waste: 'Currently burning {daily_waste}/day on unconvertible clicks.',
    ltv_pattern: 'Missing {opportunity} in additional LTV by not optimizing for this pattern.',
    discount_leakage: 'Leaking approximately {daily_leak}/day in margin.',
  };

  let template = costTemplates[insightType] || 'Continued inaction may worsen the situation.';

  for (const [key, value] of Object.entries(context)) {
    template = template.replace(`{${key}}`, String(value));
  }

  return template.replace(/\{[^}]+\}/g, 'significant amounts');
}

/**
 * Weave multiple evidence points into a coherent story
 */
export function weaveNarrative(
  evidencePoints: Evidence[],
  playbook?: ClientPlaybook
): string {
  if (evidencePoints.length === 0) {
    return 'Insufficient data for narrative synthesis.';
  }

  const parts: string[] = [];

  // Group evidence by metric
  const byMetric = new Map<string, Evidence[]>();
  for (const e of evidencePoints) {
    const existing = byMetric.get(e.metric) || [];
    existing.push(e);
    byMetric.set(e.metric, existing);
  }

  // Build narrative flow
  parts.push('Here\'s what the data is telling us:');

  for (const [metric, evidenceList] of byMetric) {
    const latest = evidenceList[0];
    const direction = (latest.changePercent || 0) > 0 ? 'up' : 'down';
    const magnitude = Math.abs(latest.changePercent || 0);

    parts.push(`**${metric}** is ${direction} ${magnitude.toFixed(1)}% (${latest.currentValue} from ${latest.comparisonValue || 'baseline'}).`);
  }

  // Add cross-signal synthesis if multiple metrics
  if (byMetric.size > 1) {
    const metrics = Array.from(byMetric.keys());
    parts.push(`The combination of ${metrics.slice(0, -1).join(', ')} and ${metrics.slice(-1)} suggests a pattern worth investigating.`);
  }

  // Add playbook context if available
  if (playbook && playbook.winningPatterns.length > 0) {
    const topWinner = playbook.winningPatterns[0];
    parts.push(`Historical data shows ${topWinner.format} consistently outperforms (${topWinner.sampleSize} data points).`);
  }

  return parts.join('\n\n');
}
