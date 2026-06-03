/**
 * Strategic Intelligence Engine — Main Generation Function
 */

import type {
  CategoryIntelligence,
  StrategicIntelligenceOutput,
  CommentSignalInput,
  FatigueSignalInput,
  PerformanceSignalInput
} from './types.js';
import { analyzeAudiencePsychology } from './audience-psychology.js';
import { detectStrategicRisks } from './risk-detection.js';
import { detectStrategicOpportunities } from './opportunity-detection.js';

export function generateStrategicIntelligence(
  clientId: string,
  inputs: {
    commentSignals: CommentSignalInput[];
    fatigueSignals: FatigueSignalInput[];
    performanceSignals: PerformanceSignalInput;
    competitorGaps: string[];
    categoryContext: { name: string; pricePoint: 'premium' | 'mid' | 'value' };
  }
): StrategicIntelligenceOutput {

  // Analyze audience psychology
  const audiencePsychology = analyzeAudiencePsychology(
    inputs.commentSignals,
    inputs.categoryContext
  );

  // Detect strategic risks
  const risks = detectStrategicRisks(
    audiencePsychology,
    inputs.fatigueSignals,
    inputs.performanceSignals,
    inputs.commentSignals
  );

  // Detect strategic opportunities
  const opportunities = detectStrategicOpportunities(
    audiencePsychology,
    inputs.commentSignals,
    inputs.competitorGaps
  );

  // Build category intelligence
  const categoryIntelligence: CategoryIntelligence = {
    persuasionSaturation: {
      saturatedApproaches: audiencePsychology.dominantState === 'aspiration_fatigue'
        ? ['Lifestyle aspiration', 'Influencer endorsement', 'Trend-riding']
        : [],
      emergingApproaches: audiencePsychology.trustLandscape.overallTrust !== 'strong'
        ? ['Trust-first messaging', 'Proof-density content', 'Operational transparency']
        : ['Customer advocacy', 'Community building'],
      underexploitedApproaches: ['Objection-first acquisition', 'Customer language creative', 'Founder accessibility']
    },
    narrativeShifts: {
      decliningNarratives: audiencePsychology.buyingFriction.frictionTrend === 'increasing'
        ? ['Pure aspiration without proof', 'Price-justified messaging']
        : [],
      risingNarratives: ['Authenticity and transparency', 'Specificity over generality', 'Customer voice over brand voice'],
      categoryGaps: inputs.competitorGaps
    },
    audienceEvolution: {
      sophisticationLevel: audiencePsychology.dominantState === 'legitimacy_skepticism' ? 'skeptical' :
                          audiencePsychology.dominantState === 'trust_contamination' ? 'cynical' : 'aware',
      trustRequirements: audiencePsychology.trustLandscape.trustThreats.length > 0
        ? ['Proof before promise', 'Operational visibility', 'Customer verification']
        : ['Consistent quality', 'Brand reliability'],
      authenticityExpectations: ['Imperfection over polish', 'Founder visibility', 'Behind-the-scenes access']
    }
  };

  // Build executive summary
  const criticalRisk = risks.find(r => r.severity === 'critical');
  const topOpportunity = opportunities[0];

  let headline: string;
  let strategicSituation: string;
  let recommendedDirection: string;

  if (criticalRisk) {
    headline = `Critical: ${audiencePsychology.dominantState.replace(/_/g, ' ')} requires immediate strategic response`;
    strategicSituation = criticalRisk.interpretation;
    recommendedDirection = `Priority: ${criticalRisk.strategicDirection[0]}. ${criticalRisk.strategicImplication}`;
  } else if (topOpportunity?.leverage === 'transformational') {
    headline = `Transformational opportunity: ${topOpportunity.opportunityType} positioning available`;
    strategicSituation = topOpportunity.interpretation;
    recommendedDirection = topOpportunity.founderInsight;
  } else {
    headline = `Audience state: ${audiencePsychology.dominantState.replace(/_/g, ' ')}`;
    strategicSituation = audiencePsychology.strategicInterpretation;
    recommendedDirection = opportunities[0]?.founderInsight || 'Continue monitoring for state transitions.';
  }

  // Build strategic direction
  const strategicDirection = {
    narrativeEvolution: categoryIntelligence.narrativeShifts.risingNarratives[0] || 'Maintain current narrative',
    trustStrategy: audiencePsychology.trustLandscape.overallTrust === 'strong'
      ? 'Leverage existing trust for advocacy amplification'
      : 'Trust-first creative systems required before scaling',
    emotionalTerritory: topOpportunity?.emotionalTerritory || 'Confidence and validation',
    creativeSystemPriorities: [
      ...(criticalRisk?.creativeSystemsNeeded.slice(0, 2) || []),
      ...(topOpportunity?.creativeSystemRecommendation.slice(0, 2) || [])
    ],
    whatToStopDoing: categoryIntelligence.persuasionSaturation.saturatedApproaches.slice(0, 2),
    whatToStartDoing: categoryIntelligence.persuasionSaturation.emergingApproaches.slice(0, 3)
  };

  return {
    clientId,
    generatedAt: new Date().toISOString(),
    executiveSummary: {
      headline,
      strategicSituation,
      criticalRisk: criticalRisk?.observation || null,
      highestLeverageOpportunity: topOpportunity?.signal || null,
      recommendedDirection
    },
    audiencePsychology,
    categoryIntelligence,
    risks,
    opportunities,
    strategicDirection
  };
}
