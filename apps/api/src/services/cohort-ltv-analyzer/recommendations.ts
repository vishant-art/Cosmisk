/**
 * Cohort LTV Analyzer — actionable recommendations
 */

import type { ChannelMetrics, ActionableRecommendation } from './types.js';

// ============ ACTIONABLE RECOMMENDATIONS ============

export function generateRecommendations(
  channels: ChannelMetrics[],
  avgLTV: number,
  avgRepeatRate: number,
  ltvGap: number
): string[] {
  const recs: string[] = [];
  const actions = generateActionableRecommendations(channels, avgLTV, avgRepeatRate, ltvGap);

  for (const action of actions) {
    recs.push(`${action.insight}\n→ ACTION: ${action.action}\n→ IMPACT: ${action.expectedImpact}`);
  }

  return recs;
}

export function generateActionableRecommendations(
  channels: ChannelMetrics[],
  avgLTV: number,
  avgRepeatRate: number,
  ltvGap: number
): ActionableRecommendation[] {
  const actions: ActionableRecommendation[] = [];

  // Find best and worst channels by LTV
  const sortedByLTV = [...channels].sort((a, b) => b.avgLTV - a.avgLTV);
  const metaChannel = channels.find(c => c.channel === 'meta_ads');
  const googleChannel = channels.find(c => c.channel === 'google_ads');
  const best = sortedByLTV[0];
  const worst = sortedByLTV[sortedByLTV.length - 1];

  // Budget shift recommendation (if significant LTV gap)
  if (best && worst && best.channel !== worst.channel) {
    const ltvDiff = best.avgLTV - worst.avgLTV;
    const ltvDiffPct = (ltvDiff / worst.avgLTV) * 100;

    if (ltvDiffPct > 10 && worst.customers > 100) {
      // Calculate how much to shift
      const shiftPct = Math.min(20, Math.round(ltvDiffPct / 2));
      const shiftCustomers = Math.round(worst.customers * (shiftPct / 100));
      const additionalRevenue = shiftCustomers * ltvDiff;

      actions.push({
        type: 'budget_shift',
        priority: ltvDiffPct > 20 ? 'high' : 'medium',
        insight: `${best.displayName} customers worth ₹${Math.round(ltvDiff).toLocaleString()} more (${ltvDiffPct.toFixed(0)}% higher LTV) than ${worst.displayName}.`,
        action: `Shift ${shiftPct}% of ${worst.displayName} budget to ${best.displayName}. Test with ₹50K over 2 weeks.`,
        expectedImpact: `+₹${Math.round(additionalRevenue).toLocaleString()} additional lifetime value from ~${shiftCustomers} customers`,
      });
    }
  }

  // Google vs Meta specific recommendation (common case)
  if (googleChannel && metaChannel && googleChannel.avgLTV > metaChannel.avgLTV) {
    const googleLTVAdvantage = googleChannel.avgLTV - metaChannel.avgLTV;
    const googleRepeatAdvantage = googleChannel.repeatRate - metaChannel.repeatRate;

    if (googleLTVAdvantage > 300 && googleChannel.customers > 50) {
      actions.push({
        type: 'budget_shift',
        priority: 'high',
        insight: `Google Ads customers have ₹${Math.round(googleLTVAdvantage).toLocaleString()} higher LTV and ${googleRepeatAdvantage.toFixed(0)}% higher repeat rate than Meta.`,
        action: `Increase Google Ads budget by 30%. Focus on Shopping campaigns and branded search. Current Google share: ${((googleChannel.customers / channels.reduce((s, c) => s + c.customers, 0)) * 100).toFixed(0)}%`,
        expectedImpact: `If 100 more customers come via Google instead of Meta: +₹${Math.round(googleLTVAdvantage * 100).toLocaleString()} in lifetime value`,
      });
    }
  }

  // Lookalike audience recommendation
  if (best && best.repeatRate > avgRepeatRate + 3) {
    actions.push({
      type: 'lookalike',
      priority: 'medium',
      insight: `${best.displayName} brings customers with ${best.repeatRate.toFixed(0)}% repeat rate (${(best.repeatRate - avgRepeatRate).toFixed(0)}% above average).`,
      action: `Export ${best.displayName} customer emails (last 6 months, 2+ orders). Create Meta Lookalike audience from this list. Exclude from prospecting.`,
      expectedImpact: `Better quality lookalikes → higher repeat rate → improved LTV`,
    });
  }

  // Retention recommendation
  if (avgRepeatRate < 15) {
    const potentialRevenue = channels.reduce((s, c) => s + c.customers, 0) * avgLTV * 0.1; // 10% improvement

    actions.push({
      type: 'retention',
      priority: 'medium',
      insight: `Only ${avgRepeatRate.toFixed(1)}% of customers buy again. Industry benchmark: 20-25%.`,
      action: `Set up post-purchase WhatsApp flow: Day 3 (delivery check), Day 14 (review ask + 10% next order), Day 30 (new arrivals). Use Klaviyo/Wigzo.`,
      expectedImpact: `5% improvement in repeat rate = +₹${Math.round(potentialRevenue).toLocaleString()} annual revenue`,
    });
  }

  // Attribution warning
  const directChannel = channels.find(c => c.channel === 'direct');
  const totalCustomers = channels.reduce((s, c) => s + c.customers, 0);
  if (directChannel && (directChannel.customers / totalCustomers) > 0.4) {
    actions.push({
      type: 'attribution',
      priority: 'low',
      insight: `${((directChannel.customers / totalCustomers) * 100).toFixed(0)}% of customers have no attribution. This limits optimization accuracy.`,
      action: `Add utm_ad_id={{ad.id}} to Meta URL parameters. Verify UTM tracking in GoKwik/checkout. Check: Shopify Admin → Orders → note_attributes.`,
      expectedImpact: `Better attribution → more accurate channel insights → smarter budget allocation`,
    });
  }

  // If no issues
  if (actions.length === 0) {
    actions.push({
      type: 'healthy',
      priority: 'low',
      insight: `Channels performing consistently with ${avgRepeatRate.toFixed(1)}% repeat rate and ₹${Math.round(avgLTV).toLocaleString()} average LTV.`,
      action: `Continue current strategy. Monitor for changes monthly.`,
      expectedImpact: `Maintain current performance`,
    });
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return actions;
}
