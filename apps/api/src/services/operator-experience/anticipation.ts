/**
 * Operator Experience — TIER 3.3: ANTICIPATION ENGINE
 */

import { logger } from '../../utils/logger.js';
import type { AnticipationPattern, AnticipationContext, AnticipatedNeed } from './types.js';

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
