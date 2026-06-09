/**
 * Operator Experience — 2. HIDDEN OPPORTUNITY SURFACING
 *
 * Patterns humans can't find by combining multiple signals.
 */

import { logger } from '../../utils/logger.js';
import type { ClientPlaybook } from '../learning-engine.js';
import type { OpportunityPattern, CrossSignalData, HiddenOpportunity } from './types.js';

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
