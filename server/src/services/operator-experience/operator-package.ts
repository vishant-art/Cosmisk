/**
 * Operator Experience — COMBINED: Full Operator Intelligence Package (Tier 1)
 */

import type { Evidence } from '../quality-gate.js';
import type { ClientPlaybook } from '../learning-engine.js';
import type { CrossSignalData, OperatorIntelligencePackage } from './types.js';
import { buildNarrative, calculateNarrativeConfidence } from './narrative.js';
import { surfaceHiddenOpportunities } from './opportunities.js';
import { calculateOpportunityWindow, generateTimingBrief } from './timing.js';

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
