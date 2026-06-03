/**
 * Operator Experience — COMBINED: Full Tier 2 Package
 */

import type {
  OperatorPersona,
  RoleBriefing,
  Tier2IntelligencePackage,
  DisclosureDepth,
  NarrativeInsight,
  HiddenOpportunity,
  TimedIntelligence,
} from './types.js';
import { generateRoleBriefing } from './roles.js';
import { compressDecisions, generateFiveMinuteBrief } from './decisions.js';
import { generateProgressiveDisclosure } from './disclosure.js';

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
