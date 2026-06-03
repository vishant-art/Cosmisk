/**
 * Operator Experience — 3. STRATEGIC TIMING
 *
 * Create urgency with time-sensitive windows.
 */

import type { Evidence } from '../quality-gate.js';
import type { TimedIntelligence } from './types.js';

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
