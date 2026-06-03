// ============================================================================
// 2. CREATIVE REASONING ENGINE
// ============================================================================

import type { CrossAgentCreativeContext } from './types.js';
import { saveCreativeContext } from './persistence.js';

/**
 * Build cross-agent creative context from all intelligence sources
 */
export async function buildCreativeContext(
  clientId: string,
  agentData: {
    fatigue?: any;
    ltv?: any;
    cohort?: any;
    competitor?: any;
    audience?: any;
    retention?: any;
    emotional?: any;
    pricing?: any;
    product?: any;
    performance?: any;
  }
): Promise<CrossAgentCreativeContext> {
  const context: CrossAgentCreativeContext = {
    clientId,
    lastUpdated: new Date().toISOString(),

    fatigueSignals: {
      fatiguedCreatives: agentData.fatigue?.fatiguedCreatives || [],
      daysToFatigue: agentData.fatigue?.avgDaysToFatigue || 14,
      urgentRefreshNeeded: agentData.fatigue?.urgentRefreshNeeded || false,
    },

    ltvSignals: {
      highLtvHookTypes: agentData.ltv?.highLtvHookTypes || [],
      lowLtvHookTypes: agentData.ltv?.lowLtvHookTypes || [],
      ltvMultiplierByFormat: agentData.ltv?.multiplierByFormat || {},
    },

    cohortSignals: {
      repeatBuyerCreatives: agentData.cohort?.repeatBuyerCreatives || [],
      onePurchaseTrapCreatives: agentData.cohort?.onePurchaseTrapCreatives || [],
      bestCohortFormats: agentData.cohort?.bestFormats || [],
    },

    competitorSignals: {
      competitorGaps: agentData.competitor?.gaps || [],
      emergingAngles: agentData.competitor?.emergingAngles || [],
      saturatedAngles: agentData.competitor?.saturatedAngles || [],
    },

    audienceSignals: {
      shiftingPreferences: agentData.audience?.shiftingPreferences || [],
      emergingDemographics: agentData.audience?.emergingDemographics || [],
      decliningSentiments: agentData.audience?.decliningSentiments || [],
    },

    retentionSignals: {
      highRetentionHooks: agentData.retention?.highRetentionHooks || [],
      lowRetentionHooks: agentData.retention?.lowRetentionHooks || [],
    },

    emotionalSignals: {
      resonatingEmotions: agentData.emotional?.resonating || [],
      failingEmotions: agentData.emotional?.failing || [],
      untestedEmotions: agentData.emotional?.untested || [],
    },

    pricingSignals: {
      effectivePriceFraming: agentData.pricing?.effective || [],
      failingPriceFraming: agentData.pricing?.failing || [],
    },

    productSignals: {
      trendingProducts: agentData.product?.trending || [],
      understockedProducts: agentData.product?.understocked || [],
      highMarginProducts: agentData.product?.highMargin || [],
    },

    performanceSignals: {
      winningPatterns: agentData.performance?.winning || [],
      losingPatterns: agentData.performance?.losing || [],
      untestedCombinations: agentData.performance?.untested || [],
    },

    synthesisOutput: {
      nextCreativeRecommendation: '',
      confidence: 0,
      reasoning: '',
    },
  };

  // Synthesize the recommendation
  context.synthesisOutput = synthesizeCreativeRecommendation(context);

  // Save to DB
  await saveCreativeContext(context);

  return context;
}

/**
 * Synthesize creative recommendation from all signals
 */
function synthesizeCreativeRecommendation(
  context: CrossAgentCreativeContext
): CrossAgentCreativeContext['synthesisOutput'] {
  const recommendations: Array<{ rec: string; confidence: number; reason: string }> = [];

  // Priority 1: Urgent fatigue refresh
  if (context.fatigueSignals.urgentRefreshNeeded) {
    const highLtvHook = context.ltvSignals.highLtvHookTypes[0];
    const competitorGap = context.competitorSignals.competitorGaps[0];

    recommendations.push({
      rec: `Urgent creative refresh needed. Use ${highLtvHook || 'proven'} hook with ${competitorGap || 'differentiated'} angle.`,
      confidence: 85,
      reason: 'Fatigue detected + high-LTV hooks available',
    });
  }

  // Priority 2: High-LTV untested combination
  if (context.performanceSignals.untestedCombinations.length > 0 &&
      context.ltvSignals.highLtvHookTypes.length > 0) {
    const untested = context.performanceSignals.untestedCombinations[0];
    recommendations.push({
      rec: `Test untested combination: ${untested} — historical data suggests high LTV potential.`,
      confidence: 75,
      reason: 'Untested pattern with correlated high-LTV signals',
    });
  }

  // Priority 3: Competitor gap opportunity
  if (context.competitorSignals.competitorGaps.length > 0 &&
      !context.competitorSignals.saturatedAngles.includes(context.competitorSignals.competitorGaps[0])) {
    const gap = context.competitorSignals.competitorGaps[0];
    recommendations.push({
      rec: `Competitor gap: "${gap}" is uncontested. Test with ${context.cohortSignals.bestCohortFormats[0] || 'UGC'} format.`,
      confidence: 70,
      reason: 'Uncontested competitor territory',
    });
  }

  // Priority 4: Emotional angle shift
  if (context.emotionalSignals.untestedEmotions.length > 0) {
    const emotion = context.emotionalSignals.untestedEmotions[0];
    recommendations.push({
      rec: `Test untested emotional angle: "${emotion}" — avoiding ${context.emotionalSignals.failingEmotions.slice(0, 2).join(', ') || 'saturated'} emotions.`,
      confidence: 65,
      reason: 'Fresh emotional territory available',
    });
  }

  // Select top recommendation
  recommendations.sort((a, b) => b.confidence - a.confidence);
  const top = recommendations[0];

  if (!top) {
    return {
      nextCreativeRecommendation: 'Maintain current creative strategy. No urgent signals detected.',
      confidence: 50,
      reasoning: 'No strong signals from any agent',
    };
  }

  return {
    nextCreativeRecommendation: top.rec,
    confidence: top.confidence,
    reasoning: top.reason,
  };
}
