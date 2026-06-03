/**
 * Operator Experience — TIER 2: ROLE-BASED INTELLIGENCE
 */

import type {
  OperatorPersona,
  PersonaConfig,
  RoleBriefing,
  NarrativeInsight,
  HiddenOpportunity,
  TimedIntelligence,
} from './types.js';

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
