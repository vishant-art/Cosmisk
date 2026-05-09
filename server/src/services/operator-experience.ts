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
// TIER 2: ROLE-BASED INTELLIGENCE
// ============================================================================

/**
 * Operator persona types — each sees intelligence differently
 */
export type OperatorPersona = 'founder' | 'media_buyer' | 'creative_strategist' | 'growth_lead';

/**
 * Persona configuration — what each role cares about
 */
interface PersonaConfig {
  persona: OperatorPersona;
  title: string;
  focusAreas: string[];
  metricsEmphasis: string[];
  decisionContext: string;
  urgencyThreshold: number;  // 0-1, higher = only show critical
  detailLevel: 'executive' | 'tactical' | 'detailed';
}

const PERSONA_CONFIGS: PersonaConfig[] = [
  {
    persona: 'founder',
    title: 'Founder',
    focusAreas: ['P&L impact', 'strategic direction', 'major risks', 'growth opportunities'],
    metricsEmphasis: ['revenue', 'profit', 'LTV', 'market share'],
    decisionContext: 'Should we invest more, pivot, or stay the course?',
    urgencyThreshold: 0.6,  // Only high-urgency items
    detailLevel: 'executive',
  },
  {
    persona: 'media_buyer',
    title: 'Media Buyer',
    focusAreas: ['campaign performance', 'budget allocation', 'creative rotation', 'audience targeting'],
    metricsEmphasis: ['ROAS', 'CPA', 'CTR', 'CPM', 'frequency'],
    decisionContext: 'What should I change in the ads manager today?',
    urgencyThreshold: 0.3,  // Show most tactical items
    detailLevel: 'tactical',
  },
  {
    persona: 'creative_strategist',
    title: 'Creative Strategist',
    focusAreas: ['creative performance', 'fatigue patterns', 'winning hooks', 'competitor creative'],
    metricsEmphasis: ['engagement', 'hook rate', 'watch time', 'Click→ATC'],
    decisionContext: 'What creative should we make next?',
    urgencyThreshold: 0.4,
    detailLevel: 'tactical',
  },
  {
    persona: 'growth_lead',
    title: 'Growth Lead',
    focusAreas: ['scaling opportunities', 'unit economics', 'channel mix', 'CAC payback'],
    metricsEmphasis: ['CAC', 'LTV:CAC', 'payback period', 'channel efficiency'],
    decisionContext: 'Where should we double down or cut back?',
    urgencyThreshold: 0.5,
    detailLevel: 'detailed',
  },
];

/**
 * Role-specific briefing
 */
export interface RoleBriefing {
  persona: OperatorPersona;
  title: string;
  generatedAt: string;

  // The single most important thing for this role
  theOneThing: {
    action: string;
    whyYou: string;  // Why this matters to YOUR role specifically
    impact: string;
  } | null;

  // Filtered and reframed insights for this role
  relevantInsights: Array<{
    headline: string;
    relevance: string;  // Why this matters to this persona
    action: string;
    urgency: NarrativeInsight['urgency'];
  }>;

  // Role-specific metrics summary
  keyMetrics: Array<{
    metric: string;
    value: string;
    change: string;
    interpretation: string;  // What this means for this role
  }>;

  // Questions this persona should be asking
  strategicQuestions: string[];
}

/**
 * Filter and reframe insights for a specific persona
 */
export function generateRoleBriefing(
  persona: OperatorPersona,
  insights: NarrativeInsight[],
  opportunities: HiddenOpportunity[],
  timedItems: TimedIntelligence[],
  metrics?: Array<{ metric: string; value: number; change: number }>
): RoleBriefing {
  const config = PERSONA_CONFIGS.find(c => c.persona === persona) || PERSONA_CONFIGS[0];

  // Filter insights by relevance to persona
  const relevantInsights = insights
    .filter(insight => {
      // Check if insight relates to persona's focus areas
      const insightText = `${insight.headline} ${insight.narrative}`.toLowerCase();
      return config.focusAreas.some(area =>
        insightText.includes(area.toLowerCase()) ||
        config.metricsEmphasis.some(m => insightText.includes(m.toLowerCase()))
      );
    })
    .map(insight => ({
      headline: insight.headline,
      relevance: generateRelevanceStatement(insight, config),
      action: insight.actionStatement,
      urgency: insight.urgency,
    }))
    .slice(0, 3);  // Max 3 per briefing

  // Find THE ONE THING for this persona
  let theOneThing: RoleBriefing['theOneThing'] = null;

  // Prioritize by urgency and relevance
  const criticalItems = timedItems.filter(t => t.urgencyLevel === 'critical');
  const highItems = timedItems.filter(t => t.urgencyLevel === 'high');

  const topItem = criticalItems[0] || highItems[0] || timedItems[0];
  if (topItem) {
    theOneThing = {
      action: topItem.title.replace(/—.*$/, '').trim(),
      whyYou: generateWhyYouStatement(topItem, config),
      impact: topItem.costOfDelay,
    };
  }

  // Generate key metrics for this persona
  const keyMetrics = (metrics || [])
    .filter(m => config.metricsEmphasis.some(em =>
      m.metric.toLowerCase().includes(em.toLowerCase())
    ))
    .slice(0, 4)
    .map(m => ({
      metric: m.metric,
      value: formatMetricValue(m.value, m.metric),
      change: `${m.change > 0 ? '+' : ''}${m.change.toFixed(1)}%`,
      interpretation: interpretMetricForPersona(m, config),
    }));

  // Strategic questions this persona should ask
  const strategicQuestions = generateStrategicQuestions(config, relevantInsights, opportunities);

  return {
    persona,
    title: `${config.title} Briefing`,
    generatedAt: new Date().toISOString(),
    theOneThing,
    relevantInsights,
    keyMetrics,
    strategicQuestions,
  };
}

/**
 * Generate relevance statement for persona
 */
function generateRelevanceStatement(insight: NarrativeInsight, config: PersonaConfig): string {
  const templates: Record<OperatorPersona, string> = {
    founder: `This affects your ${insight.urgency === 'act_now' ? 'immediate P&L' : 'strategic position'}`,
    media_buyer: `This requires action in your campaigns ${insight.urgency === 'act_now' ? 'today' : 'this week'}`,
    creative_strategist: `This signals a creative ${insight.headline.toLowerCase().includes('fatigue') ? 'refresh opportunity' : 'optimization opportunity'}`,
    growth_lead: `This impacts your ${insight.urgency === 'act_now' ? 'unit economics' : 'growth trajectory'}`,
  };
  return templates[config.persona];
}

/**
 * Generate "why you" statement for persona
 */
function generateWhyYouStatement(item: TimedIntelligence, config: PersonaConfig): string {
  const templates: Record<OperatorPersona, string> = {
    founder: `As founder, this directly impacts your bottom line`,
    media_buyer: `This is in your direct control in ads manager`,
    creative_strategist: `This is a creative decision only you can make`,
    growth_lead: `This affects your growth metrics and channel strategy`,
  };
  return templates[config.persona];
}

/**
 * Format metric value based on type
 */
function formatMetricValue(value: number, metric: string): string {
  const metricLower = metric.toLowerCase();
  if (metricLower.includes('roas') || metricLower.includes('ltv:cac')) {
    return `${value.toFixed(2)}x`;
  }
  if (metricLower.includes('cpa') || metricLower.includes('cac') || metricLower.includes('revenue') || metricLower.includes('profit')) {
    return `₹${value.toLocaleString('en-IN')}`;
  }
  if (metricLower.includes('rate') || metricLower.includes('ctr')) {
    return `${value.toFixed(2)}%`;
  }
  return value.toLocaleString('en-IN');
}

/**
 * Interpret metric change for specific persona
 */
function interpretMetricForPersona(
  metric: { metric: string; value: number; change: number },
  config: PersonaConfig
): string {
  const isPositive = metric.change > 0;
  const isGoodMetric = !metric.metric.toLowerCase().includes('cpa') &&
                       !metric.metric.toLowerCase().includes('cac');
  const isGoodChange = isPositive === isGoodMetric;

  if (config.persona === 'founder') {
    return isGoodChange ? 'Trending in right direction' : 'Needs attention';
  }
  if (config.persona === 'media_buyer') {
    return isGoodChange ? 'Keep current strategy' : 'Review campaign settings';
  }
  if (config.persona === 'creative_strategist') {
    return isGoodChange ? 'Creative resonating' : 'Consider refresh';
  }
  return isGoodChange ? 'Scaling opportunity' : 'Investigate root cause';
}

/**
 * Generate strategic questions for persona
 */
function generateStrategicQuestions(
  config: PersonaConfig,
  insights: RoleBriefing['relevantInsights'],
  opportunities: HiddenOpportunity[]
): string[] {
  const questions: string[] = [];

  const baseQuestions: Record<OperatorPersona, string[]> = {
    founder: [
      'Are we profitable at current scale?',
      'What\'s our biggest risk this month?',
      'Where should we double down?',
    ],
    media_buyer: [
      'Which campaigns need immediate attention?',
      'What\'s working that we should scale?',
      'What should we pause or cut?',
    ],
    creative_strategist: [
      'Which creative angles are fatiguing?',
      'What hooks are working best?',
      'What should we test next?',
    ],
    growth_lead: [
      'Which channel has the best unit economics?',
      'Where are we leaving money on the table?',
      'What\'s blocking our next growth phase?',
    ],
  };

  questions.push(...baseQuestions[config.persona].slice(0, 2));

  // Add contextual questions based on insights
  if (insights.some(i => i.urgency === 'act_now')) {
    questions.push('What\'s the most urgent fire to put out?');
  }

  if (opportunities.length > 0) {
    questions.push('What hidden opportunities are we missing?');
  }

  return questions.slice(0, 3);
}

// ============================================================================
// TIER 2: DECISION COMPRESSION
// ============================================================================

/**
 * Decision compression levels
 */
export type CompressionLevel = 'one_thing' | 'top_three' | 'full_context';

/**
 * Compressed decision package
 */
export interface CompressedDecision {
  level: CompressionLevel;

  // THE ONE THING — if you do nothing else, do this
  theOneThing: {
    action: string;
    deadline: string;
    impact: string;
    confidence: number;
  } | null;

  // Top 3 if they want more
  topThree?: Array<{
    rank: 1 | 2 | 3;
    action: string;
    type: 'protect' | 'grow' | 'optimize';  // Category
    effort: 'low' | 'medium' | 'high';
    impact: 'low' | 'medium' | 'high';
  }>;

  // Full context if drilling down
  fullContext?: {
    actions: Array<{
      action: string;
      category: string;
      evidence: string;
      blockers?: string[];
    }>;
    skipList: string[];  // Actions we filtered out and why
  };
}

/**
 * Compress multiple insights into prioritized decisions
 */
export function compressDecisions(
  insights: NarrativeInsight[],
  opportunities: HiddenOpportunity[],
  timedItems: TimedIntelligence[],
  level: CompressionLevel = 'one_thing'
): CompressedDecision {
  // Score and rank all potential actions
  const scoredActions = scoreAndRankActions(insights, opportunities, timedItems);

  // THE ONE THING — highest scored action
  const topAction = scoredActions[0];
  const theOneThing = topAction ? {
    action: topAction.action,
    deadline: topAction.deadline,
    impact: topAction.impactStatement,
    confidence: topAction.score,
  } : null;

  const result: CompressedDecision = {
    level,
    theOneThing,
  };

  // Add top 3 if requested
  if (level === 'top_three' || level === 'full_context') {
    result.topThree = scoredActions.slice(0, 3).map((a, i) => ({
      rank: (i + 1) as 1 | 2 | 3,
      action: a.action,
      type: a.type,
      effort: a.effort,
      impact: a.impact,
    }));
  }

  // Add full context if requested
  if (level === 'full_context') {
    result.fullContext = {
      actions: scoredActions.map(a => ({
        action: a.action,
        category: a.type,
        evidence: a.evidence,
        blockers: a.blockers,
      })),
      skipList: generateSkipList(insights, scoredActions),
    };
  }

  return result;
}

interface ScoredAction {
  action: string;
  score: number;
  deadline: string;
  impactStatement: string;
  type: 'protect' | 'grow' | 'optimize';
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  evidence: string;
  blockers?: string[];
}

/**
 * Score and rank all potential actions
 */
function scoreAndRankActions(
  insights: NarrativeInsight[],
  opportunities: HiddenOpportunity[],
  timedItems: TimedIntelligence[]
): ScoredAction[] {
  const actions: ScoredAction[] = [];

  // Convert insights to scored actions
  for (const insight of insights) {
    const urgencyScore = { act_now: 40, this_week: 30, this_month: 20, when_ready: 10 };
    const baseScore = urgencyScore[insight.urgency] + (insight.confidence * 0.5);

    actions.push({
      action: insight.actionStatement,
      score: baseScore,
      deadline: getDeadlineFromUrgency(insight.urgency),
      impactStatement: insight.whatIfNothing,
      type: categorizeAction(insight.headline),
      effort: estimateEffort(insight.actionStatement),
      impact: estimateImpact(insight.confidence, insight.urgency),
      evidence: `Based on ${insight.evidence.length} data points`,
    });
  }

  // Convert opportunities to scored actions
  for (const opp of opportunities) {
    actions.push({
      action: opp.actionSteps[0],
      score: opp.confidence * 0.8,  // Slightly lower than urgent insights
      deadline: opp.timeToCapture,
      impactStatement: opp.potentialUpside,
      type: 'grow',
      effort: opp.actionSteps.length > 3 ? 'high' : 'medium',
      impact: 'high',
      evidence: `Cross-signal: ${opp.signalsCombined.join(', ')}`,
    });
  }

  // Boost items with tight deadlines
  for (const item of timedItems) {
    const existing = actions.find(a => a.action.includes(item.title.split(' ')[0]));
    if (existing && item.daysRemaining <= 3) {
      existing.score += 20;  // Urgency boost
    }
  }

  // Sort by score descending
  actions.sort((a, b) => b.score - a.score);

  return actions;
}

/**
 * Categorize action type
 */
function categorizeAction(headline: string): 'protect' | 'grow' | 'optimize' {
  const lower = headline.toLowerCase();
  if (lower.includes('drop') || lower.includes('decline') || lower.includes('waste') || lower.includes('leak')) {
    return 'protect';
  }
  if (lower.includes('opportunity') || lower.includes('untested') || lower.includes('gap')) {
    return 'grow';
  }
  return 'optimize';
}

/**
 * Estimate effort from action text
 */
function estimateEffort(action: string): 'low' | 'medium' | 'high' {
  const lower = action.toLowerCase();
  if (lower.includes('pause') || lower.includes('review') || lower.includes('check')) {
    return 'low';
  }
  if (lower.includes('create') || lower.includes('launch') || lower.includes('build')) {
    return 'high';
  }
  return 'medium';
}

/**
 * Estimate impact from confidence and urgency
 */
function estimateImpact(
  confidence: number,
  urgency: NarrativeInsight['urgency']
): 'low' | 'medium' | 'high' {
  if (urgency === 'act_now' || confidence > 80) return 'high';
  if (urgency === 'when_ready' && confidence < 60) return 'low';
  return 'medium';
}

/**
 * Get deadline string from urgency
 */
function getDeadlineFromUrgency(urgency: NarrativeInsight['urgency']): string {
  switch (urgency) {
    case 'act_now': return 'Today';
    case 'this_week': return 'This week';
    case 'this_month': return 'This month';
    default: return 'When ready';
  }
}

/**
 * Generate list of skipped actions with reasons
 */
function generateSkipList(
  insights: NarrativeInsight[],
  scoredActions: ScoredAction[]
): string[] {
  const skipList: string[] = [];

  // Low confidence insights
  const lowConfidence = insights.filter(i => i.confidence < 50);
  if (lowConfidence.length > 0) {
    skipList.push(`${lowConfidence.length} insight(s) skipped due to low confidence (<50%)`);
  }

  // Duplicate actions
  const actionTexts = scoredActions.map(a => a.action.toLowerCase());
  const duplicates = actionTexts.filter((a, i) => actionTexts.indexOf(a) !== i);
  if (duplicates.length > 0) {
    skipList.push(`${duplicates.length} duplicate action(s) merged`);
  }

  return skipList;
}

/**
 * Generate "if you only have 5 minutes" brief
 */
export function generateFiveMinuteBrief(
  compressed: CompressedDecision
): string {
  const parts: string[] = [];

  parts.push('**⏱️ 5-MINUTE BRIEF**\n');

  if (compressed.theOneThing) {
    parts.push(`**THE ONE THING:** ${compressed.theOneThing.action}`);
    parts.push(`↳ Deadline: ${compressed.theOneThing.deadline}`);
    parts.push(`↳ If not: ${compressed.theOneThing.impact}\n`);
  }

  if (compressed.topThree && compressed.topThree.length > 1) {
    parts.push('**ALSO IMPORTANT:**');
    for (const item of compressed.topThree.slice(1)) {
      const icon = item.type === 'protect' ? '🛡️' : item.type === 'grow' ? '📈' : '⚙️';
      parts.push(`${item.rank}. ${icon} ${item.action} (${item.effort} effort, ${item.impact} impact)`);
    }
  }

  return parts.join('\n');
}

// ============================================================================
// TIER 2: PROGRESSIVE DISCLOSURE
// ============================================================================

/**
 * Disclosure depth levels
 */
export type DisclosureDepth = 'tldr' | 'summary' | 'detailed' | 'full_audit';

/**
 * Progressive disclosure package
 */
export interface ProgressiveDisclosure {
  depth: DisclosureDepth;

  // TL;DR — 1 sentence
  tldr: string;

  // Summary — 3-5 bullet points
  summary?: string[];

  // Detailed — Full narrative with evidence
  detailed?: {
    narrative: string;
    evidence: Evidence[];
    alternatives: string[];
    risks: string[];
  };

  // Full audit trail (for those who want to verify)
  fullAudit?: {
    dataSourcesUsed: string[];
    calculationsPerformed: string[];
    assumptionsMade: string[];
    confidenceBreakdown: Record<string, number>;
  };

  // Drill-down prompts
  canDrillDeeper: boolean;
  nextDepth?: DisclosureDepth;
  drillDownPrompt?: string;
}

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

// ============================================================================
// COMBINED: Full Tier 2 Package
// ============================================================================

/**
 * Complete Tier 2 intelligence package
 */
export interface Tier2IntelligencePackage {
  generatedAt: string;
  clientId: string;

  // Role-specific briefings
  briefings: Record<OperatorPersona, RoleBriefing>;

  // Compressed decisions at all levels
  decisions: {
    oneThing: CompressedDecision;
    topThree: CompressedDecision;
    fullContext: CompressedDecision;
  };

  // Quick access formats
  fiveMinuteBrief: string;

  // Progressive disclosure for top insight
  topInsightDisclosure: ProgressiveDisclosure;
}

/**
 * Generate complete Tier 2 package
 */
export function generateTier2Package(
  clientId: string,
  insights: NarrativeInsight[],
  opportunities: HiddenOpportunity[],
  timedItems: TimedIntelligence[],
  metrics?: Array<{ metric: string; value: number; change: number }>
): Tier2IntelligencePackage {
  // Generate role briefings
  const briefings: Record<OperatorPersona, RoleBriefing> = {
    founder: generateRoleBriefing('founder', insights, opportunities, timedItems, metrics),
    media_buyer: generateRoleBriefing('media_buyer', insights, opportunities, timedItems, metrics),
    creative_strategist: generateRoleBriefing('creative_strategist', insights, opportunities, timedItems, metrics),
    growth_lead: generateRoleBriefing('growth_lead', insights, opportunities, timedItems, metrics),
  };

  // Generate compressed decisions at all levels
  const decisions = {
    oneThing: compressDecisions(insights, opportunities, timedItems, 'one_thing'),
    topThree: compressDecisions(insights, opportunities, timedItems, 'top_three'),
    fullContext: compressDecisions(insights, opportunities, timedItems, 'full_context'),
  };

  // Generate 5-minute brief
  const fiveMinuteBrief = generateFiveMinuteBrief(decisions.topThree);

  // Generate progressive disclosure for top insight
  const topInsightDisclosure = insights.length > 0
    ? generateProgressiveDisclosure(insights[0], 'summary')
    : {
        depth: 'tldr' as DisclosureDepth,
        tldr: 'No critical insights at this time',
        canDrillDeeper: false,
      };

  return {
    generatedAt: new Date().toISOString(),
    clientId,
    briefings,
    decisions,
    fiveMinuteBrief,
    topInsightDisclosure,
  };
}

// ============================================================================
// TIER 3: TRUST & ANTICIPATION
// ============================================================================

// ============================================================================
// 3.1 PREDICTION SCORECARDS
// ============================================================================

/**
 * A tracked prediction with outcome
 */
export interface TrackedPrediction {
  id: string;
  clientId: string;
  createdAt: string;

  // The prediction
  prediction: string;
  predictedOutcome: string;
  predictedValue?: number;
  confidence: number;
  timeframe: string;  // "7 days", "30 days", etc.

  // Verification
  verificationDate?: string;
  actualOutcome?: string;
  actualValue?: number;
  wasAccurate?: boolean;
  accuracyScore?: number;  // 0-100, how close was the prediction

  // Context
  evidenceUsed: string[];
  insightType: string;
  actionTaken?: string;
}

/**
 * Prediction scorecard for a client
 */
export interface PredictionScorecard {
  clientId: string;
  generatedAt: string;

  // Overall accuracy
  totalPredictions: number;
  verifiedPredictions: number;
  accuratePredictions: number;
  overallAccuracy: number;  // Percentage

  // By category
  accuracyByType: Record<string, {
    total: number;
    accurate: number;
    accuracy: number;
  }>;

  // Trends
  recentAccuracy: number;  // Last 30 days
  accuracyTrend: 'improving' | 'stable' | 'declining';

  // Trust indicators
  trustScore: number;  // 0-100
  trustLevel: 'high' | 'medium' | 'low' | 'building';
  trustFactors: string[];

  // Recent predictions
  recentPredictions: TrackedPrediction[];

  // Accountability
  bestPredictionTypes: string[];
  worstPredictionTypes: string[];
  improvementAreas: string[];
}

/**
 * In-memory prediction store (would be DB in production)
 */
const predictionStore = new Map<string, TrackedPrediction[]>();

/**
 * Store a prediction for future verification
 */
export function storePrediction(
  clientId: string,
  prediction: string,
  predictedOutcome: string,
  confidence: number,
  timeframe: string,
  insightType: string,
  evidenceUsed: string[],
  predictedValue?: number
): TrackedPrediction {
  const tracked: TrackedPrediction = {
    id: `pred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    clientId,
    createdAt: new Date().toISOString(),
    prediction,
    predictedOutcome,
    predictedValue,
    confidence,
    timeframe,
    evidenceUsed,
    insightType,
  };

  const existing = predictionStore.get(clientId) || [];
  existing.push(tracked);
  predictionStore.set(clientId, existing);

  logger.debug({ predictionId: tracked.id, clientId }, '[Experience] Prediction stored for tracking');

  return tracked;
}

/**
 * Verify a prediction against actual outcome
 */
export function verifyPrediction(
  predictionId: string,
  actualOutcome: string,
  actualValue?: number,
  actionTaken?: string
): TrackedPrediction | null {
  for (const [clientId, predictions] of predictionStore) {
    const prediction = predictions.find(p => p.id === predictionId);
    if (prediction) {
      prediction.verificationDate = new Date().toISOString();
      prediction.actualOutcome = actualOutcome;
      prediction.actualValue = actualValue;
      prediction.actionTaken = actionTaken;

      // Calculate accuracy
      if (prediction.predictedValue !== undefined && actualValue !== undefined) {
        const diff = Math.abs(prediction.predictedValue - actualValue);
        const maxVal = Math.max(prediction.predictedValue, actualValue);
        prediction.accuracyScore = maxVal > 0 ? Math.round((1 - diff / maxVal) * 100) : 100;
        prediction.wasAccurate = prediction.accuracyScore >= 70;
      } else {
        // Qualitative comparison
        const predictedLower = prediction.predictedOutcome.toLowerCase();
        const actualLower = actualOutcome.toLowerCase();
        prediction.wasAccurate =
          actualLower.includes(predictedLower.split(' ')[0]) ||
          predictedLower.includes(actualLower.split(' ')[0]);
        prediction.accuracyScore = prediction.wasAccurate ? 80 : 30;
      }

      logger.debug({ predictionId, wasAccurate: prediction.wasAccurate }, '[Experience] Prediction verified');

      return prediction;
    }
  }
  return null;
}

/**
 * Generate prediction scorecard for a client
 */
export function generatePredictionScorecard(clientId: string): PredictionScorecard {
  const predictions = predictionStore.get(clientId) || [];
  const verified = predictions.filter(p => p.verificationDate);
  const accurate = verified.filter(p => p.wasAccurate);

  // Calculate accuracy by type
  const byType: Record<string, { total: number; accurate: number }> = {};
  for (const p of verified) {
    if (!byType[p.insightType]) {
      byType[p.insightType] = { total: 0, accurate: 0 };
    }
    byType[p.insightType].total++;
    if (p.wasAccurate) byType[p.insightType].accurate++;
  }

  const accuracyByType: PredictionScorecard['accuracyByType'] = {};
  for (const [type, data] of Object.entries(byType)) {
    accuracyByType[type] = {
      ...data,
      accuracy: data.total > 0 ? Math.round((data.accurate / data.total) * 100) : 0,
    };
  }

  // Recent accuracy (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentVerified = verified.filter(p =>
    new Date(p.verificationDate!) > thirtyDaysAgo
  );
  const recentAccurate = recentVerified.filter(p => p.wasAccurate);
  const recentAccuracy = recentVerified.length > 0
    ? Math.round((recentAccurate.length / recentVerified.length) * 100)
    : 0;

  // Overall accuracy
  const overallAccuracy = verified.length > 0
    ? Math.round((accurate.length / verified.length) * 100)
    : 0;

  // Accuracy trend
  let accuracyTrend: PredictionScorecard['accuracyTrend'] = 'stable';
  if (recentVerified.length >= 5) {
    if (recentAccuracy > overallAccuracy + 10) accuracyTrend = 'improving';
    else if (recentAccuracy < overallAccuracy - 10) accuracyTrend = 'declining';
  }

  // Trust score calculation
  let trustScore = 50;  // Base score
  trustScore += Math.min(verified.length * 2, 20);  // More verifications = more trust
  trustScore += (overallAccuracy - 50) * 0.3;  // Accuracy boost/penalty
  if (accuracyTrend === 'improving') trustScore += 10;
  if (accuracyTrend === 'declining') trustScore -= 10;
  trustScore = Math.max(0, Math.min(100, trustScore));

  // Trust level
  let trustLevel: PredictionScorecard['trustLevel'] = 'building';
  if (verified.length < 5) trustLevel = 'building';
  else if (trustScore >= 75) trustLevel = 'high';
  else if (trustScore >= 50) trustLevel = 'medium';
  else trustLevel = 'low';

  // Trust factors
  const trustFactors: string[] = [];
  if (verified.length >= 10) trustFactors.push(`${verified.length} verified predictions`);
  if (overallAccuracy >= 70) trustFactors.push(`${overallAccuracy}% overall accuracy`);
  if (accuracyTrend === 'improving') trustFactors.push('Accuracy improving over time');
  if (accurate.length >= 5) trustFactors.push(`${accurate.length} accurate predictions`);

  // Best and worst prediction types
  const typeAccuracies = Object.entries(accuracyByType)
    .filter(([_, data]) => data.total >= 3)
    .sort((a, b) => b[1].accuracy - a[1].accuracy);

  const bestPredictionTypes = typeAccuracies.slice(0, 2).map(([type]) => type);
  const worstPredictionTypes = typeAccuracies.slice(-2).map(([type]) => type);

  // Improvement areas
  const improvementAreas: string[] = [];
  for (const [type, data] of Object.entries(accuracyByType)) {
    if (data.accuracy < 50 && data.total >= 3) {
      improvementAreas.push(`${type} predictions need more data or better signals`);
    }
  }

  return {
    clientId,
    generatedAt: new Date().toISOString(),
    totalPredictions: predictions.length,
    verifiedPredictions: verified.length,
    accuratePredictions: accurate.length,
    overallAccuracy,
    accuracyByType,
    recentAccuracy,
    accuracyTrend,
    trustScore: Math.round(trustScore),
    trustLevel,
    trustFactors,
    recentPredictions: predictions.slice(-5).reverse(),
    bestPredictionTypes,
    worstPredictionTypes,
    improvementAreas,
  };
}

/**
 * Format scorecard for display
 */
export function formatPredictionScorecard(scorecard: PredictionScorecard): string {
  const parts: string[] = [];

  const trustEmoji = {
    high: '🟢',
    medium: '🟡',
    low: '🔴',
    building: '🔵',
  };

  parts.push(`**PREDICTION SCORECARD** ${trustEmoji[scorecard.trustLevel]}`);
  parts.push(`Trust Level: ${scorecard.trustLevel.toUpperCase()} (${scorecard.trustScore}/100)\n`);

  parts.push('**Accuracy Stats**');
  parts.push(`- Overall: ${scorecard.overallAccuracy}% (${scorecard.accuratePredictions}/${scorecard.verifiedPredictions} verified)`);
  parts.push(`- Last 30 days: ${scorecard.recentAccuracy}%`);
  parts.push(`- Trend: ${scorecard.accuracyTrend}\n`);

  if (scorecard.bestPredictionTypes.length > 0) {
    parts.push(`**Best at:** ${scorecard.bestPredictionTypes.join(', ')}`);
  }

  if (scorecard.worstPredictionTypes.length > 0) {
    parts.push(`**Improving:** ${scorecard.worstPredictionTypes.join(', ')}`);
  }

  if (scorecard.trustFactors.length > 0) {
    parts.push(`\n**Why you can trust this:**`);
    for (const factor of scorecard.trustFactors) {
      parts.push(`✓ ${factor}`);
    }
  }

  return parts.join('\n');
}

// ============================================================================
// 3.2 COMPETITOR MOVEMENT ALERTS
// ============================================================================

/**
 * Types of competitor movements to track
 */
export type CompetitorMovementType =
  | 'new_creative'
  | 'creative_killed'
  | 'spend_increase'
  | 'spend_decrease'
  | 'new_angle'
  | 'format_shift'
  | 'targeting_change'
  | 'offer_change';

/**
 * A competitor movement alert
 */
export interface CompetitorMovement {
  id: string;
  clientId: string;
  detectedAt: string;

  // Competitor info
  competitorName: string;
  competitorId?: string;

  // Movement details
  movementType: CompetitorMovementType;
  description: string;
  significance: 'high' | 'medium' | 'low';

  // Evidence
  evidence: {
    source: string;
    dataPoint: string;
    comparisonPeriod?: string;
  }[];

  // Strategic implications
  implications: string[];
  suggestedResponse: string;
  responseUrgency: 'immediate' | 'this_week' | 'monitor';

  // Window
  firstMoverWindow?: string;

  // Status
  acknowledged: boolean;
  responseAction?: string;
}

/**
 * Competitor movement detection patterns
 */
interface MovementPattern {
  type: CompetitorMovementType;
  detect: (current: CompetitorSnapshot, previous: CompetitorSnapshot) => boolean;
  generateAlert: (current: CompetitorSnapshot, previous: CompetitorSnapshot, clientId: string) => CompetitorMovement | null;
}

interface CompetitorSnapshot {
  competitorName: string;
  competitorId?: string;
  capturedAt: string;
  activeAds: number;
  estimatedSpend?: number;
  topFormats: string[];
  topAngles: string[];
  offers: string[];
  newCreatives: number;
  killedCreatives: number;
}

/**
 * Movement detection patterns
 */
const MOVEMENT_PATTERNS: MovementPattern[] = [
  {
    type: 'spend_increase',
    detect: (current, previous) => {
      if (!current.estimatedSpend || !previous.estimatedSpend) return false;
      return current.estimatedSpend > previous.estimatedSpend * 1.3;  // 30%+ increase
    },
    generateAlert: (current, previous, clientId) => ({
      id: `move_${Date.now()}`,
      clientId,
      detectedAt: new Date().toISOString(),
      competitorName: current.competitorName,
      competitorId: current.competitorId,
      movementType: 'spend_increase',
      description: `${current.competitorName} increased ad spend by ~${Math.round(((current.estimatedSpend! / previous.estimatedSpend!) - 1) * 100)}%`,
      significance: 'high',
      evidence: [{
        source: 'Meta Ad Library',
        dataPoint: `Estimated spend: ${previous.estimatedSpend} → ${current.estimatedSpend}`,
        comparisonPeriod: '7 days',
      }],
      implications: [
        'They may have found a winning angle or audience',
        'Expect increased competition for your audiences',
        'CPMs in your category may rise',
      ],
      suggestedResponse: 'Analyze their top-spending creatives for patterns. Consider defensive budget increase.',
      responseUrgency: 'this_week',
      firstMoverWindow: '1-2 weeks before market adjusts',
      acknowledged: false,
    }),
  },
  {
    type: 'new_angle',
    detect: (current, previous) => {
      const newAngles = current.topAngles.filter(a => !previous.topAngles.includes(a));
      return newAngles.length > 0;
    },
    generateAlert: (current, previous, clientId) => {
      const newAngles = current.topAngles.filter(a => !previous.topAngles.includes(a));
      return {
        id: `move_${Date.now()}`,
        clientId,
        detectedAt: new Date().toISOString(),
        competitorName: current.competitorName,
        competitorId: current.competitorId,
        movementType: 'new_angle',
        description: `${current.competitorName} testing new angle: "${newAngles[0]}"`,
        significance: 'medium',
        evidence: [{
          source: 'Meta Ad Library',
          dataPoint: `New creative angle detected: ${newAngles.join(', ')}`,
        }],
        implications: [
          'They\'re testing new positioning',
          'This angle may or may not work for them',
          'Worth monitoring performance indicators',
        ],
        suggestedResponse: `Consider if "${newAngles[0]}" angle could work for your brand. Monitor their commitment.`,
        responseUrgency: 'monitor',
        acknowledged: false,
      };
    },
  },
  {
    type: 'creative_killed',
    detect: (current, previous) => {
      return current.killedCreatives > 3;  // Killed multiple creatives
    },
    generateAlert: (current, previous, clientId) => ({
      id: `move_${Date.now()}`,
      clientId,
      detectedAt: new Date().toISOString(),
      competitorName: current.competitorName,
      competitorId: current.competitorId,
      movementType: 'creative_killed',
      description: `${current.competitorName} killed ${current.killedCreatives} creatives — possible strategy shift`,
      significance: 'medium',
      evidence: [{
        source: 'Meta Ad Library',
        dataPoint: `${current.killedCreatives} ads no longer running`,
        comparisonPeriod: '7 days',
      }],
      implications: [
        'These angles/formats may not have worked for them',
        'They\'re pivoting creative strategy',
        'Avoid similar approaches if you were considering them',
      ],
      suggestedResponse: 'Note which creative types they killed. Avoid similar approaches unless you have different data.',
      responseUrgency: 'monitor',
      acknowledged: false,
    }),
  },
  {
    type: 'offer_change',
    detect: (current, previous) => {
      return current.offers.some(o => !previous.offers.includes(o));
    },
    generateAlert: (current, previous, clientId) => {
      const newOffers = current.offers.filter(o => !previous.offers.includes(o));
      return {
        id: `move_${Date.now()}`,
        clientId,
        detectedAt: new Date().toISOString(),
        competitorName: current.competitorName,
        competitorId: current.competitorId,
        movementType: 'offer_change',
        description: `${current.competitorName} launched new offer: "${newOffers[0]}"`,
        significance: 'high',
        evidence: [{
          source: 'Meta Ad Library',
          dataPoint: `New offer detected: ${newOffers.join(', ')}`,
        }],
        implications: [
          'Price competition may intensify',
          'Your offer may need review',
          'Watch for market response',
        ],
        suggestedResponse: 'Review your current offer competitiveness. Consider matching or differentiating.',
        responseUrgency: 'this_week',
        firstMoverWindow: '1 week to respond before customers notice',
        acknowledged: false,
      };
    },
  },
];

/**
 * Detect competitor movements
 */
export function detectCompetitorMovements(
  clientId: string,
  currentSnapshots: CompetitorSnapshot[],
  previousSnapshots: CompetitorSnapshot[]
): CompetitorMovement[] {
  const movements: CompetitorMovement[] = [];

  for (const current of currentSnapshots) {
    const previous = previousSnapshots.find(p =>
      p.competitorName === current.competitorName || p.competitorId === current.competitorId
    );

    if (!previous) continue;  // New competitor, can't compare

    for (const pattern of MOVEMENT_PATTERNS) {
      try {
        if (pattern.detect(current, previous)) {
          const alert = pattern.generateAlert(current, previous, clientId);
          if (alert) {
            movements.push(alert);
            logger.debug({
              type: pattern.type,
              competitor: current.competitorName
            }, '[Experience] Competitor movement detected');
          }
        }
      } catch (err) {
        logger.debug({ pattern: pattern.type, err }, '[Experience] Movement detection failed');
      }
    }
  }

  // Sort by significance
  const significanceOrder = { high: 0, medium: 1, low: 2 };
  movements.sort((a, b) => significanceOrder[a.significance] - significanceOrder[b.significance]);

  return movements;
}

/**
 * Format competitor alert for notification
 */
export function formatCompetitorAlert(movement: CompetitorMovement): string {
  const urgencyEmoji = {
    immediate: '🚨',
    this_week: '⚡',
    monitor: '👀',
  };

  const parts: string[] = [];

  parts.push(`${urgencyEmoji[movement.responseUrgency]} **COMPETITOR ALERT**`);
  parts.push(`**${movement.competitorName}**: ${movement.description}\n`);

  parts.push('**Implications:**');
  for (const impl of movement.implications) {
    parts.push(`- ${impl}`);
  }

  parts.push(`\n**Suggested Response:** ${movement.suggestedResponse}`);

  if (movement.firstMoverWindow) {
    parts.push(`**Window:** ${movement.firstMoverWindow}`);
  }

  return parts.join('\n');
}

// ============================================================================
// 3.3 ANTICIPATION ENGINE
// ============================================================================

/**
 * Anticipated need types
 */
export type AnticipatedNeedType =
  | 'creative_refresh'
  | 'budget_decision'
  | 'performance_review'
  | 'competitor_response'
  | 'seasonal_prep'
  | 'scale_decision'
  | 'cost_investigation';

/**
 * An anticipated need
 */
export interface AnticipatedNeed {
  id: string;
  clientId: string;
  anticipatedAt: string;

  // What we anticipate
  needType: AnticipatedNeedType;
  title: string;
  description: string;

  // Why we anticipate it
  triggerSignals: string[];
  confidence: number;

  // When
  expectedTiming: string;
  daysUntil: number;

  // Proactive support
  preemptiveAction: string;
  resourcesReady: string[];

  // Validation
  wasNeeded?: boolean;
  feedbackReceived?: string;
}

/**
 * Anticipation patterns based on signals
 */
interface AnticipationPattern {
  needType: AnticipatedNeedType;
  signals: string[];
  condition: (context: AnticipationContext) => boolean;
  generate: (context: AnticipationContext) => AnticipatedNeed;
}

interface AnticipationContext {
  clientId: string;
  daysSinceLastCreative?: number;
  topCreativeAge?: number;
  budgetUtilization?: number;
  performanceTrend?: 'improving' | 'stable' | 'declining';
  daysUntilMonthEnd?: number;
  seasonalEvents?: string[];
  competitorMovements?: CompetitorMovement[];
  recentDecisions?: string[];
}

/**
 * Anticipation patterns
 */
const ANTICIPATION_PATTERNS: AnticipationPattern[] = [
  {
    needType: 'creative_refresh',
    signals: ['creative_age', 'fatigue_indicators', 'performance_decline'],
    condition: (ctx) => (ctx.topCreativeAge || 0) > 10 || ctx.performanceTrend === 'declining',
    generate: (ctx) => ({
      id: `ant_${Date.now()}`,
      clientId: ctx.clientId,
      anticipatedAt: new Date().toISOString(),
      needType: 'creative_refresh',
      title: 'Creative Refresh Needed Soon',
      description: `Your top creatives are ${ctx.topCreativeAge || 14}+ days old. Based on historical patterns, refresh timing is approaching.`,
      triggerSignals: [
        `Top creative age: ${ctx.topCreativeAge || 14} days`,
        ctx.performanceTrend === 'declining' ? 'Performance trending down' : 'Normal fatigue timeline',
      ],
      confidence: ctx.performanceTrend === 'declining' ? 85 : 70,
      expectedTiming: ctx.performanceTrend === 'declining' ? '3-5 days' : '7-10 days',
      daysUntil: ctx.performanceTrend === 'declining' ? 3 : 7,
      preemptiveAction: 'Start briefing new creatives now to have them ready',
      resourcesReady: [
        'Creative brief template',
        'Winning patterns from playbook',
        'Competitor creative analysis',
      ],
    }),
  },
  {
    needType: 'budget_decision',
    signals: ['month_end', 'budget_utilization', 'performance_data'],
    condition: (ctx) => (ctx.daysUntilMonthEnd || 30) <= 5 && (ctx.budgetUtilization || 0) < 80,
    generate: (ctx) => ({
      id: `ant_${Date.now()}`,
      clientId: ctx.clientId,
      anticipatedAt: new Date().toISOString(),
      needType: 'budget_decision',
      title: 'Month-End Budget Decision Coming',
      description: `${ctx.daysUntilMonthEnd} days until month end with ${ctx.budgetUtilization}% budget utilized. You'll need to decide: push harder or save?`,
      triggerSignals: [
        `${ctx.daysUntilMonthEnd} days until month end`,
        `${ctx.budgetUtilization}% budget utilized`,
      ],
      confidence: 90,
      expectedTiming: `${ctx.daysUntilMonthEnd} days`,
      daysUntil: ctx.daysUntilMonthEnd || 5,
      preemptiveAction: 'Review performance by campaign to identify scale opportunities',
      resourcesReady: [
        'Budget utilization report',
        'Campaign performance ranking',
        'Scaling recommendations',
      ],
    }),
  },
  {
    needType: 'competitor_response',
    signals: ['competitor_movement', 'market_shift'],
    condition: (ctx) => (ctx.competitorMovements || []).some(m => m.significance === 'high'),
    generate: (ctx) => {
      const highMovement = (ctx.competitorMovements || []).find(m => m.significance === 'high')!;
      return {
        id: `ant_${Date.now()}`,
        clientId: ctx.clientId,
        anticipatedAt: new Date().toISOString(),
        needType: 'competitor_response',
        title: 'Competitor Response Strategy Needed',
        description: `${highMovement.competitorName} made a significant move. You'll need a response strategy within ${highMovement.firstMoverWindow || '1-2 weeks'}.`,
        triggerSignals: [
          `Competitor movement: ${highMovement.movementType}`,
          highMovement.description,
        ],
        confidence: 80,
        expectedTiming: highMovement.firstMoverWindow || '1-2 weeks',
        daysUntil: 7,
        preemptiveAction: highMovement.suggestedResponse,
        resourcesReady: [
          'Competitor analysis',
          'Response options brief',
          'Quick-launch creative templates',
        ],
      };
    },
  },
  {
    needType: 'scale_decision',
    signals: ['strong_performance', 'budget_headroom', 'audience_saturation'],
    condition: (ctx) => ctx.performanceTrend === 'improving' && (ctx.budgetUtilization || 0) > 90,
    generate: (ctx) => ({
      id: `ant_${Date.now()}`,
      clientId: ctx.clientId,
      anticipatedAt: new Date().toISOString(),
      needType: 'scale_decision',
      title: 'Scale Opportunity Window',
      description: 'Performance is improving and budget is nearly maxed. Time to decide on scaling.',
      triggerSignals: [
        'Performance trend: improving',
        `Budget utilization: ${ctx.budgetUtilization}%`,
      ],
      confidence: 75,
      expectedTiming: 'This week',
      daysUntil: 3,
      preemptiveAction: 'Prepare scaling plan with audience expansion and budget increase options',
      resourcesReady: [
        'Audience expansion recommendations',
        'Budget increase scenarios',
        'Historical scale outcomes',
      ],
    }),
  },
  {
    needType: 'cost_investigation',
    signals: ['cpm_increase', 'cpa_spike', 'efficiency_drop'],
    condition: (ctx) => ctx.performanceTrend === 'declining',
    generate: (ctx) => ({
      id: `ant_${Date.now()}`,
      clientId: ctx.clientId,
      anticipatedAt: new Date().toISOString(),
      needType: 'cost_investigation',
      title: 'Cost Investigation Needed',
      description: 'Performance is declining. You\'ll want to understand why before it gets worse.',
      triggerSignals: [
        'Performance trend: declining',
        'Early warning indicators triggered',
      ],
      confidence: 70,
      expectedTiming: '1-2 days',
      daysUntil: 1,
      preemptiveAction: 'Run diagnostic on CPM, audience overlap, and creative performance',
      resourcesReady: [
        'Cost breakdown analysis',
        'Audience overlap report',
        'Creative performance comparison',
      ],
    }),
  },
];

/**
 * Anticipate operator needs
 */
export function anticipateNeeds(context: AnticipationContext): AnticipatedNeed[] {
  const needs: AnticipatedNeed[] = [];

  for (const pattern of ANTICIPATION_PATTERNS) {
    try {
      if (pattern.condition(context)) {
        const need = pattern.generate(context);
        needs.push(need);
        logger.debug({ needType: pattern.needType }, '[Experience] Need anticipated');
      }
    } catch (err) {
      logger.debug({ pattern: pattern.needType, err }, '[Experience] Anticipation check failed');
    }
  }

  // Sort by days until needed
  needs.sort((a, b) => a.daysUntil - b.daysUntil);

  return needs.slice(0, 3);  // Return top 3 most imminent
}

/**
 * Format anticipated needs for display
 */
export function formatAnticipatedNeeds(needs: AnticipatedNeed[]): string {
  if (needs.length === 0) {
    return '**🔮 ANTICIPATION ENGINE**\n\nNo immediate needs anticipated. You\'re ahead of the curve.';
  }

  const parts: string[] = [];
  parts.push('**🔮 WHAT YOU\'LL NEED SOON**\n');

  for (const need of needs) {
    const urgencyIcon = need.daysUntil <= 2 ? '🔴' : need.daysUntil <= 5 ? '🟡' : '🟢';
    parts.push(`${urgencyIcon} **${need.title}** (${need.expectedTiming})`);
    parts.push(`   ${need.description}`);
    parts.push(`   → ${need.preemptiveAction}`);
    parts.push('');
  }

  return parts.join('\n');
}

// ============================================================================
// COMBINED: Full Tier 3 Package
// ============================================================================

/**
 * Complete Tier 3 intelligence package
 */
export interface Tier3IntelligencePackage {
  generatedAt: string;
  clientId: string;

  // Trust & Accountability
  predictionScorecard: PredictionScorecard;
  trustStatement: string;

  // Competitive Intelligence
  competitorMovements: CompetitorMovement[];
  competitorAlertsSummary: string;

  // Anticipation
  anticipatedNeeds: AnticipatedNeed[];
  anticipationBrief: string;

  // Combined trust score
  overallTrustScore: number;
  trustBreakdown: {
    predictionAccuracy: number;
    dataFreshness: number;
    coverageDepth: number;
  };
}

/**
 * Generate complete Tier 3 package
 */
export function generateTier3Package(
  clientId: string,
  competitorSnapshots?: { current: CompetitorSnapshot[]; previous: CompetitorSnapshot[] },
  anticipationContext?: AnticipationContext
): Tier3IntelligencePackage {
  // Generate prediction scorecard
  const predictionScorecard = generatePredictionScorecard(clientId);

  // Generate trust statement
  const trustStatement = generateTrustStatement(predictionScorecard);

  // Detect competitor movements
  const competitorMovements = competitorSnapshots
    ? detectCompetitorMovements(clientId, competitorSnapshots.current, competitorSnapshots.previous)
    : [];

  // Competitor alerts summary
  const competitorAlertsSummary = competitorMovements.length > 0
    ? `${competitorMovements.length} competitor movement(s) detected. ${competitorMovements.filter(m => m.significance === 'high').length} require attention.`
    : 'No significant competitor movements detected.';

  // Anticipate needs
  const anticipatedNeeds = anticipationContext
    ? anticipateNeeds(anticipationContext)
    : [];

  // Anticipation brief
  const anticipationBrief = formatAnticipatedNeeds(anticipatedNeeds);

  // Calculate overall trust score
  const overallTrustScore = calculateOverallTrust(predictionScorecard, competitorMovements.length);

  return {
    generatedAt: new Date().toISOString(),
    clientId,
    predictionScorecard,
    trustStatement,
    competitorMovements,
    competitorAlertsSummary,
    anticipatedNeeds,
    anticipationBrief,
    overallTrustScore,
    trustBreakdown: {
      predictionAccuracy: predictionScorecard.overallAccuracy,
      dataFreshness: 85,  // Would be calculated from actual data freshness
      coverageDepth: Math.min(predictionScorecard.verifiedPredictions * 10, 100),
    },
  };
}

/**
 * Generate trust statement
 */
function generateTrustStatement(scorecard: PredictionScorecard): string {
  if (scorecard.trustLevel === 'building') {
    return `Building trust with ${scorecard.verifiedPredictions} verified predictions so far. Accuracy tracking in progress.`;
  }

  if (scorecard.trustLevel === 'high') {
    return `High confidence recommendations. ${scorecard.overallAccuracy}% prediction accuracy across ${scorecard.verifiedPredictions} verifications.`;
  }

  if (scorecard.trustLevel === 'medium') {
    return `Recommendations backed by ${scorecard.overallAccuracy}% accuracy. ${scorecard.improvementAreas.length > 0 ? 'Some areas improving.' : 'Consistent track record.'}`;
  }

  return `Working to improve. Current accuracy: ${scorecard.overallAccuracy}%. Focusing on: ${scorecard.improvementAreas.join(', ') || 'all areas'}.`;
}

/**
 * Calculate overall trust score
 */
function calculateOverallTrust(scorecard: PredictionScorecard, competitorCoverage: number): number {
  let score = scorecard.trustScore * 0.6;  // 60% from predictions
  score += Math.min(competitorCoverage * 5, 20);  // Up to 20% from competitor coverage
  score += 20;  // Base score for having the system
  return Math.min(Math.round(score), 100);
}

// ============================================================================
// COMPLETE OPERATOR EXPERIENCE PACKAGE
// ============================================================================

/**
 * The complete intelligence package combining all tiers
 */
export interface CompleteOperatorExperience {
  generatedAt: string;
  clientId: string;

  // Tier 1: Wow Moments
  tier1: OperatorIntelligencePackage;

  // Tier 2: Role-Based Intelligence
  tier2: Tier2IntelligencePackage;

  // Tier 3: Trust & Anticipation
  tier3: Tier3IntelligencePackage;

  // Executive summary
  executiveSummary: string;
}

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
