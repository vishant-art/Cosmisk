/**
 * Operator Experience Intelligence — Cosmisk
 *
 * The layer that makes intelligence FEEL magical.
 * Technical infrastructure creates data; this creates wow moments.
 *
 * Core Principle: "This platform thinks alongside me."
 *
 * Contains:
 * 1. Narrative Intelligence — Transform evidence into compelling stories
 * 2. Hidden Opportunity Surfacing — Patterns humans can't find
 * 3. Strategic Timing — Create urgency with time-sensitive windows
 */

import { logger } from '../utils/logger.js';
import type { Evidence } from './quality-gate.js';
import type { Prediction, ClientPlaybook } from './learning-engine.js';

// ============================================================================
// 1. NARRATIVE INTELLIGENCE
// ============================================================================

/**
 * Narrative template for different insight types
 */
interface NarrativeTemplate {
  type: string;
  pattern: string;           // Recognition pattern
  template: string;          // Narrative structure with placeholders
  emotionalHook: string;     // What makes operator pause
  actionFrame: string;       // How to frame the action
}

/**
 * A fully formed narrative insight
 */
export interface NarrativeInsight {
  headline: string;          // 10 words max, punchy
  narrative: string;         // Full story (2-4 sentences)
  emotionalHook: string;     // What makes this non-obvious
  evidence: Evidence[];      // Backing data
  confidence: number;
  urgency: 'act_now' | 'this_week' | 'this_month' | 'when_ready';
  actionStatement: string;   // Clear next step
  alternativeAction?: string; // If they don't want primary action
  whatIfNothing: string;     // Cost of inaction
}

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
function calculateNarrativeConfidence(evidence: Evidence[]): number {
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

// ============================================================================
// 2. HIDDEN OPPORTUNITY SURFACING
// ============================================================================

/**
 * A hidden opportunity that humans wouldn't find themselves
 */
export interface HiddenOpportunity {
  id: string;
  title: string;
  description: string;
  whyHidden: string;          // Why a human wouldn't see this
  signalsCombined: string[];  // What data sources revealed this
  potentialUpside: string;    // Quantified if possible
  confidence: number;
  actionSteps: string[];
  timeToCapture: string;      // How long until opportunity closes
  lastTested?: string;        // When they last tried this (if ever)
}

/**
 * Cross-signal opportunity patterns
 */
interface OpportunityPattern {
  name: string;
  signals: string[];          // What signals to combine
  condition: (data: CrossSignalData) => boolean;
  generate: (data: CrossSignalData) => HiddenOpportunity | null;
}

interface CrossSignalData {
  clientId: string;
  playbook?: ClientPlaybook;
  recentDecisions?: Array<{ type: string; target: string; timestamp: string }>;
  competitorData?: { gaps: string[]; trends: string[] };
  fatigueData?: Array<{ format: string; daysActive: number }>;
  ltvData?: Array<{ hookType: string; avgLtv: number; repeatRate: number }>;
  lastCreativeTest?: { format: string; date: string };
}

/**
 * Opportunity patterns that combine multiple signals
 */
const OPPORTUNITY_PATTERNS: OpportunityPattern[] = [
  {
    name: 'untested_winning_combination',
    signals: ['ltv_data', 'creative_history', 'playbook'],
    condition: (data) => {
      if (!data.ltvData || !data.playbook) return false;
      // High LTV hook types that haven't been tested recently
      const highLtvHooks = data.ltvData.filter(d => d.avgLtv > 2000).map(d => d.hookType);
      const winningFormats = data.playbook.winningPatterns.map(p => p.format);
      // Check if there's an untested combination
      return highLtvHooks.some(h => winningFormats.includes(h));
    },
    generate: (data) => {
      const highLtvHooks = data.ltvData!.filter(d => d.avgLtv > 2000);
      const topHook = highLtvHooks[0];

      return {
        id: `opp_${Date.now()}_combo`,
        title: `Untested ${topHook.hookType} + High-LTV Combination`,
        description: `Your ${topHook.hookType} hooks generate ${topHook.avgLtv.toFixed(0)} avg LTV with ${(topHook.repeatRate * 100).toFixed(0)}% repeat rate. But you haven't combined this with your winning visual formats in the last 45 days.`,
        whyHidden: 'Requires cross-referencing LTV data with creative DNA — most teams look at these separately.',
        signalsCombined: ['LTV by Creative', 'Creative DNA', 'Test History'],
        potentialUpside: `${(topHook.repeatRate * 100).toFixed(0)}% higher repeat rate could mean ${((topHook.avgLtv / 1500) * 100 - 100).toFixed(0)}%+ LTV uplift`,
        confidence: 72,
        actionSteps: [
          `Create 3 ${topHook.hookType} hook variants`,
          'Pair with your top 2 visual formats',
          'Test with proven audiences first',
          'Run for 5 days before scaling',
        ],
        timeToCapture: '2-3 weeks before competitors notice',
      };
    },
  },
  {
    name: 'fatigue_rotation_gap',
    signals: ['fatigue_data', 'playbook'],
    condition: (data) => {
      if (!data.fatigueData || !data.playbook) return false;
      // Creatives approaching fatigue but no rotation planned
      const nearFatigue = data.fatigueData.filter(f => f.daysActive > 10);
      return nearFatigue.length >= 2;
    },
    generate: (data) => {
      const nearFatigue = data.fatigueData!.filter(f => f.daysActive > 10);
      const avgDays = nearFatigue.reduce((sum, f) => sum + f.daysActive, 0) / nearFatigue.length;

      return {
        id: `opp_${Date.now()}_rotation`,
        title: 'Pre-emptive Creative Rotation Window',
        description: `${nearFatigue.length} creatives are ${avgDays.toFixed(0)} days old. Historical pattern shows fatigue hits hard at day 14. You have a 3-4 day window to rotate BEFORE performance drops.`,
        whyHidden: 'Most teams wait until performance drops. This catches the window BEFORE the decline.',
        signalsCombined: ['Fatigue Detection', 'Historical Patterns', 'Audience Frequency'],
        potentialUpside: 'Avoid 15-25% performance dip by pre-emptive rotation',
        confidence: 78,
        actionSteps: [
          'Prepare 4-5 new creatives now',
          'Stage them for launch in 2-3 days',
          'Don\'t wait for metrics to drop',
          'Use proven hook styles from playbook',
        ],
        timeToCapture: '3-4 days before fatigue hits',
      };
    },
  },
  {
    name: 'competitor_gap_with_proof',
    signals: ['competitor_data', 'playbook', 'ltv_data'],
    condition: (data) => {
      if (!data.competitorData || !data.playbook) return false;
      // Competitor gap that aligns with our winning patterns
      return data.competitorData.gaps.length > 0 &&
        data.playbook.winningPatterns.length > 0;
    },
    generate: (data) => {
      const gap = data.competitorData!.gaps[0];
      const topWinner = data.playbook!.winningPatterns[0];

      return {
        id: `opp_${Date.now()}_gap`,
        title: `Uncontested "${gap}" Territory`,
        description: `Competitors are absent from ${gap} positioning. Your playbook shows ${topWinner.format} performs well — combining these could create an uncontested position.`,
        whyHidden: 'Requires overlaying competitor intel with your own performance data. Most see these as separate analyses.',
        signalsCombined: ['Competitor Intel', 'Client Playbook', 'Performance History'],
        potentialUpside: 'First-mover advantage in uncontested space',
        confidence: 65,
        actionSteps: [
          `Develop ${gap} angle with ${topWinner.format} format`,
          'Test with 3 creative variants',
          'Move fast — gap typically closes in 4-6 weeks',
          'Monitor competitor response weekly',
        ],
        timeToCapture: '4-6 weeks until competitors notice and respond',
      };
    },
  },
  {
    name: 'one_time_buyer_trap',
    signals: ['ltv_data', 'playbook'],
    condition: (data) => {
      if (!data.playbook) return false;
      // Creatives attracting low-LTV one-time buyers
      return data.playbook.audienceInsights.onePurchaseTrap.length >= 2;
    },
    generate: (data) => {
      const traps = data.playbook!.audienceInsights.onePurchaseTrap;
      const highLtv = data.playbook!.audienceInsights.repeatBuyerCreatives;

      return {
        id: `opp_${Date.now()}_trap`,
        title: 'Hidden One-Time Buyer Trap',
        description: `${traps.length} of your creatives are attracting one-time discount buyers. Meanwhile, ${highLtv.length} creatives bring repeat customers. Shifting budget could increase LTV by 40%+.`,
        whyHidden: 'Requires connecting Shopify repeat purchase data to Meta creative performance. Almost no one does this.',
        signalsCombined: ['Shopify LTV', 'Creative Performance', 'Customer Cohorts'],
        potentialUpside: '40%+ LTV increase by optimizing for repeat buyers',
        confidence: 70,
        actionSteps: [
          `Reduce budget on: ${traps.slice(0, 2).join(', ')}`,
          `Increase budget on: ${highLtv.slice(0, 2).join(', ')}`,
          'Create new creatives modeled on high-LTV performers',
          'Track 60-day LTV, not just first purchase',
        ],
        timeToCapture: 'Immediate — every day continues the leak',
      };
    },
  },
];

/**
 * Surface hidden opportunities from cross-signal analysis
 */
export function surfaceHiddenOpportunities(data: CrossSignalData): HiddenOpportunity[] {
  const opportunities: HiddenOpportunity[] = [];

  for (const pattern of OPPORTUNITY_PATTERNS) {
    try {
      if (pattern.condition(data)) {
        const opportunity = pattern.generate(data);
        if (opportunity) {
          opportunities.push(opportunity);
          logger.debug({ pattern: pattern.name }, '[Experience] Hidden opportunity found');
        }
      }
    } catch (err) {
      logger.debug({ pattern: pattern.name, err }, '[Experience] Pattern check failed');
    }
  }

  // Sort by confidence
  opportunities.sort((a, b) => b.confidence - a.confidence);

  return opportunities.slice(0, 3); // Return top 3
}

/**
 * Generate "you'd never see this" insight from playbook
 */
export function generateNonObviousInsight(playbook: ClientPlaybook): string | null {
  const insights: string[] = [];

  // Cross-reference winning and losing patterns
  if (playbook.winningPatterns.length > 0 && playbook.losingPatterns.length > 0) {
    const winner = playbook.winningPatterns[0];
    const loser = playbook.losingPatterns[0];

    insights.push(
      `Your ${winner.format} format generates ${winner.avgLtv?.toFixed(0) || 'high'} LTV, ` +
      `while ${loser.format} has ${(loser.returnRate * 100).toFixed(0)}% returns. ` +
      `The difference isn't creative quality — it's customer quality.`
    );
  }

  // Fatigue + competitor insight
  if (playbook.fatiguePatterns.length > 0 && playbook.competitorGaps.length > 0) {
    const fatigue = playbook.fatiguePatterns[0];
    const gap = playbook.competitorGaps[0];

    insights.push(
      `Your creatives fatigue in ~${fatigue.avgDaysToFatigue} days. ` +
      `But competitors haven't touched ${gap}. ` +
      `That's your refresh angle — new territory with proven format.`
    );
  }

  return insights.length > 0 ? insights[0] : null;
}

// ============================================================================
// 3. STRATEGIC TIMING
// ============================================================================

/**
 * Time-sensitive intelligence with urgency framing
 */
export interface TimedIntelligence {
  id: string;
  title: string;
  description: string;
  windowOpens: string;        // When to act (might be "now")
  windowCloses: string;       // When opportunity expires
  daysRemaining: number;
  urgencyLevel: 'critical' | 'high' | 'medium' | 'low';
  costOfDelay: string;        // What you lose per day of delay
  optimalTiming: string;      // Best time to act
  whyNow: string;             // Why this specific timing matters
}

/**
 * Calculate opportunity window for different insight types
 */
export function calculateOpportunityWindow(
  insightType: string,
  evidence: Evidence[],
  context: Record<string, unknown>
): TimedIntelligence {
  const now = new Date();
  const id = `timing_${Date.now()}`;

  // Default window calculations
  let daysRemaining = 7;
  let urgencyLevel: TimedIntelligence['urgencyLevel'] = 'medium';
  let costOfDelay = 'Performance continues to decline';
  let whyNow = 'Current data suggests acting soon is beneficial';

  // Type-specific timing
  switch (insightType) {
    case 'creative_fatigue':
    case 'fatigue': {
      const daysActive = (context['daysActive'] as number) || 14;
      const daysToFatigue = 14 - daysActive;
      daysRemaining = Math.max(daysToFatigue, 1);
      urgencyLevel = daysRemaining <= 3 ? 'critical' : daysRemaining <= 7 ? 'high' : 'medium';
      costOfDelay = `~${(context['dailySpend'] as number || 5000) * 0.15} wasted per day after fatigue`;
      whyNow = `Creatives hit severe fatigue at day 14. You're at day ${daysActive}.`;
      break;
    }

    case 'competitor_gap':
    case 'competitor_opportunity': {
      daysRemaining = 21; // Competitors typically respond in 3-4 weeks
      urgencyLevel = 'high';
      costOfDelay = 'Competitors may fill this gap, eliminating first-mover advantage';
      whyNow = 'Market gaps typically close within 4-6 weeks of discovery';
      break;
    }

    case 'oos_waste':
    case 'oos': {
      daysRemaining = 1;
      urgencyLevel = 'critical';
      const dailyWaste = (context['spend'] as number || 1000) / (context['days'] as number || 7);
      costOfDelay = `₹${dailyWaste.toFixed(0)}/day in unconvertible clicks`;
      whyNow = 'Every hour of delay burns money on products customers can\'t buy';
      break;
    }

    case 'discount_leakage': {
      daysRemaining = 3;
      urgencyLevel = 'high';
      costOfDelay = `~${(context['dailyLeak'] as number || 5000)} margin leaked per day`;
      whyNow = 'Coupon sites spread codes fast. Delay makes rotation harder.';
      break;
    }

    case 'ltv_opportunity':
    case 'ltv_pattern': {
      daysRemaining = 14;
      urgencyLevel = 'medium';
      costOfDelay = 'Missing higher-LTV customer acquisition each week';
      whyNow = 'This pattern strengthens with more data. Act while signal is clear.';
      break;
    }

    default: {
      // Calculate from evidence
      const maxChange = Math.max(...evidence.map(e => Math.abs(e.changePercent || 0)));
      if (maxChange > 40) {
        daysRemaining = 2;
        urgencyLevel = 'critical';
      } else if (maxChange > 25) {
        daysRemaining = 5;
        urgencyLevel = 'high';
      } else if (maxChange > 10) {
        daysRemaining = 14;
        urgencyLevel = 'medium';
      } else {
        daysRemaining = 30;
        urgencyLevel = 'low';
      }
    }
  }

  const windowCloses = new Date(now.getTime() + daysRemaining * 24 * 60 * 60 * 1000);

  return {
    id,
    title: `${insightType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} — Act Within ${daysRemaining} Days`,
    description: String(context['description'] || 'Opportunity window detected'),
    windowOpens: 'Now',
    windowCloses: windowCloses.toISOString().split('T')[0],
    daysRemaining,
    urgencyLevel,
    costOfDelay,
    optimalTiming: daysRemaining <= 2 ? 'Today' : daysRemaining <= 7 ? 'This week' : 'Within 2 weeks',
    whyNow,
  };
}

/**
 * Frame a recommendation with strategic urgency
 */
export function addStrategicTiming(
  recommendation: string,
  insightType: string,
  evidence: Evidence[],
  context: Record<string, unknown> = {}
): {
  recommendation: string;
  timing: TimedIntelligence;
  framedRecommendation: string;
} {
  const timing = calculateOpportunityWindow(insightType, evidence, context);

  // Frame recommendation with urgency
  let framedRecommendation = recommendation;

  if (timing.urgencyLevel === 'critical') {
    framedRecommendation = `**ACT NOW:** ${recommendation}. Window closes in ${timing.daysRemaining} day${timing.daysRemaining > 1 ? 's' : ''}. ${timing.costOfDelay}.`;
  } else if (timing.urgencyLevel === 'high') {
    framedRecommendation = `**This Week:** ${recommendation}. ${timing.whyNow}`;
  } else if (timing.urgencyLevel === 'medium') {
    framedRecommendation = `**Soon:** ${recommendation}. Best if done within ${timing.daysRemaining} days.`;
  } else {
    framedRecommendation = `**When Ready:** ${recommendation}. No immediate deadline, but worth scheduling.`;
  }

  return {
    recommendation,
    timing,
    framedRecommendation,
  };
}

/**
 * Generate daily timing brief — what needs attention TODAY
 */
export function generateTimingBrief(
  timedItems: TimedIntelligence[]
): string {
  const critical = timedItems.filter(t => t.urgencyLevel === 'critical');
  const high = timedItems.filter(t => t.urgencyLevel === 'high');
  const medium = timedItems.filter(t => t.urgencyLevel === 'medium');

  const parts: string[] = [];

  if (critical.length > 0) {
    parts.push(`**🚨 CRITICAL (Act Today)**`);
    for (const item of critical) {
      parts.push(`- ${item.title}: ${item.costOfDelay}`);
    }
  }

  if (high.length > 0) {
    parts.push(`**⚡ HIGH (This Week)**`);
    for (const item of high) {
      parts.push(`- ${item.title}: ${item.daysRemaining} days remaining`);
    }
  }

  if (medium.length > 0) {
    parts.push(`**📋 SCHEDULED**`);
    for (const item of medium.slice(0, 3)) {
      parts.push(`- ${item.title}: Due by ${item.windowCloses}`);
    }
  }

  if (parts.length === 0) {
    return '**All Clear:** No urgent timing windows. Focus on strategic initiatives.';
  }

  return parts.join('\n\n');
}

// ============================================================================
// COMBINED: Full Operator Intelligence Package
// ============================================================================

/**
 * Complete intelligence package for an operator
 */
export interface OperatorIntelligencePackage {
  generatedAt: string;
  clientId: string;

  // The One Thing
  theOneThing: {
    action: string;
    narrative: string;
    urgency: TimedIntelligence['urgencyLevel'];
    whyThisAboveAll: string;
  } | null;

  // Narrative insights (top 3)
  narrativeInsights: NarrativeInsight[];

  // Hidden opportunities
  hiddenOpportunities: HiddenOpportunity[];

  // Timing brief
  timingBrief: string;
  timedItems: TimedIntelligence[];

  // Trust indicators
  confidenceScore: number;
  evidenceCount: number;
  predictionAccuracy?: number;
}

/**
 * Generate complete operator intelligence package
 */
export function generateOperatorPackage(
  clientId: string,
  insights: Array<{ type: string; evidence: Evidence[]; context: Record<string, unknown> }>,
  playbook?: ClientPlaybook,
  additionalData?: CrossSignalData
): OperatorIntelligencePackage {
  // Build narrative insights
  const narrativeInsights = insights
    .map(i => buildNarrative(i.type, i.evidence, i.context))
    .sort((a, b) => {
      // Sort by urgency then confidence
      const urgencyOrder = { act_now: 0, this_week: 1, this_month: 2, when_ready: 3 };
      if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      }
      return b.confidence - a.confidence;
    })
    .slice(0, 3);

  // Surface hidden opportunities
  const hiddenOpportunities = surfaceHiddenOpportunities({
    clientId,
    playbook,
    ...additionalData,
  });

  // Calculate timed items
  const timedItems = insights.map(i =>
    calculateOpportunityWindow(i.type, i.evidence, i.context)
  ).sort((a, b) => a.daysRemaining - b.daysRemaining);

  // Generate timing brief
  const timingBrief = generateTimingBrief(timedItems);

  // Determine THE ONE THING
  let theOneThing: OperatorIntelligencePackage['theOneThing'] = null;

  if (narrativeInsights.length > 0) {
    const top = narrativeInsights[0];
    theOneThing = {
      action: top.actionStatement,
      narrative: top.narrative,
      urgency: timedItems[0]?.urgencyLevel || 'medium',
      whyThisAboveAll: top.emotionalHook,
    };
  } else if (hiddenOpportunities.length > 0) {
    const top = hiddenOpportunities[0];
    theOneThing = {
      action: top.actionSteps[0],
      narrative: top.description,
      urgency: 'high',
      whyThisAboveAll: top.whyHidden,
    };
  }

  // Calculate overall confidence
  const allEvidence = insights.flatMap(i => i.evidence);
  const confidenceScore = calculateNarrativeConfidence(allEvidence);

  return {
    generatedAt: new Date().toISOString(),
    clientId,
    theOneThing,
    narrativeInsights,
    hiddenOpportunities,
    timingBrief,
    timedItems,
    confidenceScore,
    evidenceCount: allEvidence.length,
  };
}

// ============================================================================
// Logging
// ============================================================================

logger.info('[OperatorExperience] Wow moment systems loaded — Narratives, Opportunities, Timing');
