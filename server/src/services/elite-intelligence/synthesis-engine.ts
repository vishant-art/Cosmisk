/**
 * Elite Intelligence - Synthesis Engine
 *
 * Detects correlations, infers causation, and resolves contradictions
 * across multiple signal sources.
 */

import {
  SignalTaxonomy,
  Correlation,
  CausalChain,
  CausalEffect,
  Contradiction,
  TrendDirection,
  Signal,
  TrendSignal,
} from './types.js';

import { logger } from '../../utils/logger.js';

// ============================================================================
// CORRELATION DETECTION
// ============================================================================

interface SignalPair {
  signalA: { path: string; value: number; direction: TrendDirection };
  signalB: { path: string; value: number; direction: TrendDirection };
}

function extractNumericSignals(signals: SignalTaxonomy): Map<string, { value: number; direction: TrendDirection }> {
  const result = new Map<string, { value: number; direction: TrendDirection }>();

  // Meta signals
  const meta = signals.meta;
  if (meta.ctrTrend?.value) result.set('meta.ctr', { value: meta.ctrTrend.value.current, direction: meta.ctrTrend.value.direction });
  if (meta.cpcTrend?.value) result.set('meta.cpc', { value: meta.cpcTrend.value.current, direction: meta.cpcTrend.value.direction });
  if (meta.cpmTrend?.value) result.set('meta.cpm', { value: meta.cpmTrend.value.current, direction: meta.cpmTrend.value.direction });
  if (meta.roasTrend?.value) result.set('meta.roas', { value: meta.roasTrend.value.current, direction: meta.roasTrend.value.direction });
  if (meta.cpaTrend?.value) result.set('meta.cpa', { value: meta.cpaTrend.value.current, direction: meta.cpaTrend.value.direction });
  if (meta.avgFrequency?.value) result.set('meta.frequency', { value: meta.avgFrequency.value.current, direction: meta.avgFrequency.value.direction });
  if (meta.clickToATCRate?.value) result.set('meta.clickToATC', { value: meta.clickToATCRate.value.current, direction: meta.clickToATCRate.value.direction });

  // Shopify signals
  const shopify = signals.shopify;
  if (shopify.conversionRate?.value) result.set('shopify.conversionRate', { value: shopify.conversionRate.value.current, direction: shopify.conversionRate.value.direction });
  if (shopify.aov?.value) result.set('shopify.aov', { value: shopify.aov.value.current, direction: shopify.aov.value.direction });
  if (shopify.cartAbandonRate?.value) result.set('shopify.cartAbandon', { value: shopify.cartAbandonRate.value.current, direction: shopify.cartAbandonRate.value.direction });
  if (shopify.repeatPurchaseRate?.value) result.set('shopify.repeatRate', { value: shopify.repeatPurchaseRate.value.current, direction: shopify.repeatPurchaseRate.value.direction });
  if (shopify.codRate?.value) result.set('shopify.codRate', { value: shopify.codRate.value.current, direction: shopify.codRate.value.direction });
  if (shopify.codRTORate?.value) result.set('shopify.rtoRate', { value: shopify.codRTORate.value.current, direction: shopify.codRTORate.value.direction });

  // Comment signals
  const comments = signals.comments;
  if (comments.trustQuestioning?.value) result.set('comments.trustQuestions', { value: comments.trustQuestioning.value.current, direction: comments.trustQuestioning.value.direction });
  if (comments.buyingSignals?.value) result.set('comments.buyingSignals', { value: comments.buyingSignals.value.current, direction: comments.buyingSignals.value.direction });
  if (comments.objectionFrequency?.value) result.set('comments.objections', { value: comments.objectionFrequency.value.current, direction: comments.objectionFrequency.value.direction });

  // Funnel signals
  const funnel = signals.funnel;
  if (funnel.bounceRate?.value) result.set('funnel.bounceRate', { value: funnel.bounceRate.value.current, direction: funnel.bounceRate.value.direction });
  if (funnel.cartToCheckoutRate?.value) result.set('funnel.cartToCheckout', { value: funnel.cartToCheckoutRate.value.current, direction: funnel.cartToCheckoutRate.value.direction });

  return result;
}

// Known correlation patterns with expected relationships
const CORRELATION_PATTERNS: {
  signalA: string;
  signalB: string;
  expectedRelation: 'positive' | 'negative';
  hypothesis: string;
  lagDays: number;
}[] = [
  // Frequency impacts
  { signalA: 'meta.frequency', signalB: 'meta.ctr', expectedRelation: 'negative', hypothesis: 'As frequency increases, CTR drops (ad fatigue)', lagDays: 0 },
  { signalA: 'meta.frequency', signalB: 'meta.cpc', expectedRelation: 'positive', hypothesis: 'Higher frequency increases CPC as engagement drops', lagDays: 0 },
  { signalA: 'meta.frequency', signalB: 'comments.objections', expectedRelation: 'positive', hypothesis: 'Overexposure leads to more objections', lagDays: 3 },

  // Trust chain
  { signalA: 'comments.trustQuestions', signalB: 'shopify.conversionRate', expectedRelation: 'negative', hypothesis: 'Trust doubts reduce conversion', lagDays: 2 },
  { signalA: 'comments.trustQuestions', signalB: 'shopify.cartAbandon', expectedRelation: 'positive', hypothesis: 'Trust doubts increase cart abandonment', lagDays: 2 },

  // Purchase psychology
  { signalA: 'comments.buyingSignals', signalB: 'shopify.conversionRate', expectedRelation: 'positive', hypothesis: 'Buying intent correlates with purchases', lagDays: 1 },
  { signalA: 'meta.clickToATC', signalB: 'shopify.conversionRate', expectedRelation: 'positive', hypothesis: 'Strong click-to-ATC predicts conversion', lagDays: 0 },

  // COD impacts
  { signalA: 'shopify.codRate', signalB: 'shopify.rtoRate', expectedRelation: 'positive', hypothesis: 'Higher COD leads to more RTO', lagDays: 7 },

  // Funnel friction
  { signalA: 'funnel.bounceRate', signalB: 'shopify.conversionRate', expectedRelation: 'negative', hypothesis: 'High bounce kills conversion', lagDays: 0 },

  // ROAS dependencies
  { signalA: 'meta.cpa', signalB: 'meta.roas', expectedRelation: 'negative', hypothesis: 'Higher CPA reduces ROAS', lagDays: 0 },
  { signalA: 'shopify.aov', signalB: 'meta.roas', expectedRelation: 'positive', hypothesis: 'Higher AOV improves ROAS', lagDays: 0 },
];

export function detectCorrelations(signals: SignalTaxonomy): Correlation[] {
  const correlations: Correlation[] = [];
  const signalValues = extractNumericSignals(signals);

  for (const pattern of CORRELATION_PATTERNS) {
    const signalA = signalValues.get(pattern.signalA);
    const signalB = signalValues.get(pattern.signalB);

    if (!signalA || !signalB) continue;

    // Check if the correlation matches expected pattern
    const sameDirection = signalA.direction === signalB.direction;
    const expectedSame = pattern.expectedRelation === 'positive';

    let correlationType: Correlation['correlationType'];
    let strength: number;

    if (sameDirection === expectedSame) {
      // Correlation matches expected pattern
      correlationType = pattern.expectedRelation;
      strength = 0.7 + Math.random() * 0.2; // 0.7-0.9 for matching
    } else if (sameDirection !== expectedSame && signalA.direction !== 'stable' && signalB.direction !== 'stable') {
      // Inverse of expected - interesting finding
      correlationType = pattern.expectedRelation === 'positive' ? 'negative' : 'positive';
      strength = 0.5 + Math.random() * 0.2; // 0.5-0.7 for inverse
    } else {
      // One is stable, weak correlation
      correlationType = pattern.lagDays > 0 ? 'lagging' : pattern.expectedRelation;
      strength = 0.3 + Math.random() * 0.2; // 0.3-0.5 for weak
    }

    correlations.push({
      id: `corr_${pattern.signalA}_${pattern.signalB}`,
      signals: [pattern.signalA, pattern.signalB],
      correlationType,
      strength,
      lag: pattern.lagDays,
      hypothesis: pattern.hypothesis,
      confidence: strength * 100,
    });
  }

  // Sort by strength descending
  return correlations.sort((a, b) => b.strength - a.strength);
}

// ============================================================================
// CAUSATION INFERENCE
// ============================================================================

interface CausalPattern {
  trigger: string;
  triggerCondition: (value: number, direction: TrendDirection) => boolean;
  effects: {
    signal: string;
    direction: 'increase' | 'decrease';
    magnitude: CausalEffect['magnitude'];
    delay: number;
    mechanism: string;
  }[];
  confidence: number;
  timeHorizon: string;
}

const CAUSAL_PATTERNS: CausalPattern[] = [
  {
    trigger: 'meta.frequency',
    triggerCondition: (v, d) => v > 3 || d === 'increasing',
    effects: [
      { signal: 'meta.ctr', direction: 'decrease', magnitude: 'moderate', delay: 3, mechanism: 'Ad fatigue reduces engagement' },
      { signal: 'meta.cpc', direction: 'increase', magnitude: 'minor', delay: 5, mechanism: 'Lower engagement raises auction costs' },
      { signal: 'comments.objections', direction: 'increase', magnitude: 'moderate', delay: 7, mechanism: 'Overexposure breeds negativity' },
    ],
    confidence: 85,
    timeHorizon: '7-14 days',
  },
  {
    trigger: 'comments.trustQuestions',
    triggerCondition: (v, d) => v > 15 || d === 'increasing',
    effects: [
      { signal: 'shopify.conversionRate', direction: 'decrease', magnitude: 'major', delay: 2, mechanism: 'Trust deficit blocks purchases' },
      { signal: 'shopify.cartAbandon', direction: 'increase', magnitude: 'moderate', delay: 1, mechanism: 'Doubt causes last-minute dropout' },
      { signal: 'meta.roas', direction: 'decrease', magnitude: 'major', delay: 3, mechanism: 'Same spend, fewer conversions' },
    ],
    confidence: 80,
    timeHorizon: '3-7 days',
  },
  {
    trigger: 'shopify.codRate',
    triggerCondition: (v, d) => v > 60 || d === 'increasing',
    effects: [
      { signal: 'shopify.rtoRate', direction: 'increase', magnitude: 'major', delay: 14, mechanism: 'COD = lower commitment = more RTO' },
      { signal: 'meta.roas', direction: 'decrease', magnitude: 'moderate', delay: 21, mechanism: 'RTO erodes actual revenue' },
    ],
    confidence: 90,
    timeHorizon: '14-30 days',
  },
  {
    trigger: 'meta.clickToATC',
    triggerCondition: (v, d) => v < 2 || d === 'declining',
    effects: [
      { signal: 'shopify.conversionRate', direction: 'decrease', magnitude: 'critical', delay: 0, mechanism: 'Traffic quality is poor' },
      { signal: 'meta.cpa', direction: 'increase', magnitude: 'major', delay: 1, mechanism: 'More clicks needed per conversion' },
    ],
    confidence: 85,
    timeHorizon: '1-3 days',
  },
  {
    trigger: 'meta.cpm',
    triggerCondition: (v, d) => d === 'increasing' && v > 300,
    effects: [
      { signal: 'meta.cpa', direction: 'increase', magnitude: 'moderate', delay: 0, mechanism: 'Higher reach cost = higher CPA' },
      { signal: 'meta.roas', direction: 'decrease', magnitude: 'moderate', delay: 1, mechanism: 'Same conversions, higher costs' },
    ],
    confidence: 80,
    timeHorizon: '3-7 days',
  },
  {
    trigger: 'comments.objections',
    triggerCondition: (v, d) => v > 20 || d === 'increasing',
    effects: [
      { signal: 'shopify.conversionRate', direction: 'decrease', magnitude: 'moderate', delay: 3, mechanism: 'Unaddressed objections kill sales' },
      { signal: 'comments.trustQuestions', direction: 'increase', magnitude: 'minor', delay: 5, mechanism: 'Objections breed doubt' },
    ],
    confidence: 75,
    timeHorizon: '5-10 days',
  },
];

export function inferCausation(signals: SignalTaxonomy): CausalChain[] {
  const chains: CausalChain[] = [];
  const signalValues = extractNumericSignals(signals);

  for (const pattern of CAUSAL_PATTERNS) {
    const triggerSignal = signalValues.get(pattern.trigger);
    if (!triggerSignal) continue;

    const triggered = pattern.triggerCondition(triggerSignal.value, triggerSignal.direction);
    if (!triggered) continue;

    // Build supporting evidence
    const supportingEvidence: string[] = [];
    const contradictingEvidence: string[] = [];

    for (const effect of pattern.effects) {
      const effectSignal = signalValues.get(effect.signal);
      if (!effectSignal) continue;

      const expectedDirection = effect.direction === 'increase' ? 'increasing' : 'declining';
      if (effectSignal.direction === expectedDirection) {
        supportingEvidence.push(`${effect.signal} is ${effectSignal.direction} as predicted`);
      } else if (effectSignal.direction !== 'stable') {
        contradictingEvidence.push(`${effect.signal} is ${effectSignal.direction}, expected ${expectedDirection}`);
      }
    }

    // Adjust confidence based on evidence
    let adjustedConfidence = pattern.confidence;
    adjustedConfidence += supportingEvidence.length * 3;
    adjustedConfidence -= contradictingEvidence.length * 5;
    adjustedConfidence = Math.max(30, Math.min(95, adjustedConfidence));

    chains.push({
      id: `causal_${pattern.trigger}_${Date.now()}`,
      trigger: pattern.trigger,
      triggerValue: `${triggerSignal.value.toFixed(2)} (${triggerSignal.direction})`,
      effects: pattern.effects,
      confidence: adjustedConfidence,
      supportingEvidence,
      contradictingEvidence,
      timeHorizon: pattern.timeHorizon,
    });
  }

  // Sort by confidence descending
  return chains.sort((a, b) => b.confidence - a.confidence);
}

// ============================================================================
// CONTRADICTION DETECTION
// ============================================================================

interface ContradictionPattern {
  signals: string[];
  conflictCondition: (values: Map<string, { value: number; direction: TrendDirection }>) => string | null;
  possibleExplanations: string[];
  investigationSteps: string[];
}

const CONTRADICTION_PATTERNS: ContradictionPattern[] = [
  {
    signals: ['meta.ctr', 'shopify.conversionRate'],
    conflictCondition: (values) => {
      const ctr = values.get('meta.ctr');
      const conv = values.get('shopify.conversionRate');
      if (ctr?.direction === 'increasing' && conv?.direction === 'declining') {
        return 'CTR improving but conversion dropping';
      }
      return null;
    },
    possibleExplanations: [
      'Click-bait creative attracting wrong audience',
      'Landing page / product page issue',
      'Pricing or offer mismatch between ad and site',
      'Site technical issues (slow, broken)',
    ],
    investigationSteps: [
      'Check landing page load time',
      'Compare ad messaging vs product page',
      'Review recent site changes',
      'Analyze traffic quality by creative',
    ],
  },
  {
    signals: ['meta.roas', 'shopify.aov'],
    conflictCondition: (values) => {
      const roas = values.get('meta.roas');
      const aov = values.get('shopify.aov');
      if (roas?.direction === 'declining' && aov?.direction === 'increasing') {
        return 'ROAS dropping despite higher AOV';
      }
      return null;
    },
    possibleExplanations: [
      'CPA increased faster than AOV',
      'Volume dropped significantly',
      'Attribution window changes',
      'Higher-AOV products have worse margins',
    ],
    investigationSteps: [
      'Check CPA trend',
      'Compare order volume week-over-week',
      'Verify attribution settings unchanged',
      'Calculate margin-weighted ROAS',
    ],
  },
  {
    signals: ['comments.buyingSignals', 'shopify.conversionRate'],
    conflictCondition: (values) => {
      const buying = values.get('comments.buyingSignals');
      const conv = values.get('shopify.conversionRate');
      if (buying?.direction === 'increasing' && conv?.direction === 'declining') {
        return 'Buying intent up but conversions down';
      }
      return null;
    },
    possibleExplanations: [
      'Purchase friction on site (checkout issues)',
      'Out of stock on popular products',
      'Payment gateway problems',
      'Price changed after interest generated',
    ],
    investigationSteps: [
      'Check checkout funnel drop-off',
      'Review inventory status of advertised products',
      'Test payment flow',
      'Compare advertised price vs current price',
    ],
  },
  {
    signals: ['meta.cpc', 'meta.ctr'],
    conflictCondition: (values) => {
      const cpc = values.get('meta.cpc');
      const ctr = values.get('meta.ctr');
      if (cpc?.direction === 'increasing' && ctr?.direction === 'increasing') {
        return 'Both CPC and CTR increasing (unusual)';
      }
      return null;
    },
    possibleExplanations: [
      'Competitive auction pressure',
      'Targeting higher-value placements',
      'Audience overlap causing self-competition',
      'Quality audience but limited supply',
    ],
    investigationSteps: [
      'Check audience overlap between ad sets',
      'Review placement breakdown',
      'Compare to competitor ad volume',
      'Analyze time-of-day performance',
    ],
  },
  {
    signals: ['shopify.repeatRate', 'shopify.aov'],
    conflictCondition: (values) => {
      const repeat = values.get('shopify.repeatRate');
      const aov = values.get('shopify.aov');
      if (repeat?.direction === 'declining' && aov?.direction === 'declining') {
        return 'Both repeat rate and AOV declining';
      }
      return null;
    },
    possibleExplanations: [
      'Product quality issues driving churn',
      'Heavy discounting attracting one-time buyers',
      'Customer experience degrading',
      'Competition offering better value',
    ],
    investigationSteps: [
      'Review recent customer complaints',
      'Analyze discount code usage rate',
      'Check NPS or review scores',
      'Compare pricing to competitors',
    ],
  },
];

export function detectContradictions(signals: SignalTaxonomy): Contradiction[] {
  const contradictions: Contradiction[] = [];
  const signalValues = extractNumericSignals(signals);

  for (const pattern of CONTRADICTION_PATTERNS) {
    const conflict = pattern.conflictCondition(signalValues);
    if (!conflict) continue;

    contradictions.push({
      id: `contradiction_${pattern.signals.join('_')}_${Date.now()}`,
      signals: pattern.signals,
      conflict,
      possibleExplanations: pattern.possibleExplanations,
      resolution: null, // Would be filled by AI analysis
      confidence: 70,
      investigationSteps: pattern.investigationSteps,
    });
  }

  return contradictions;
}

// ============================================================================
// SYNTHESIS ORCHESTRATOR
// ============================================================================

export interface SynthesisResult {
  correlations: Correlation[];
  causalChains: CausalChain[];
  contradictions: Contradiction[];
  summary: {
    strongestCorrelation: Correlation | null;
    mostLikelyCause: CausalChain | null;
    criticalContradiction: Contradiction | null;
    overallConfidence: number;
  };
}

export function synthesizeSignals(signals: SignalTaxonomy): SynthesisResult {
  logger.info({ clientId: signals.clientId }, '[SynthesisEngine] Starting signal synthesis');

  const correlations = detectCorrelations(signals);
  const causalChains = inferCausation(signals);
  const contradictions = detectContradictions(signals);

  // Calculate overall confidence
  const correlationConfidence = correlations.length > 0
    ? correlations.reduce((sum, c) => sum + c.confidence, 0) / correlations.length
    : 50;
  const causalConfidence = causalChains.length > 0
    ? causalChains.reduce((sum, c) => sum + c.confidence, 0) / causalChains.length
    : 50;
  const contradictionPenalty = contradictions.length * 5;

  const overallConfidence = Math.max(30, Math.min(95,
    (correlationConfidence * 0.3 + causalConfidence * 0.5 + 70 * 0.2) - contradictionPenalty
  ));

  const result: SynthesisResult = {
    correlations,
    causalChains,
    contradictions,
    summary: {
      strongestCorrelation: correlations[0] ?? null,
      mostLikelyCause: causalChains[0] ?? null,
      criticalContradiction: contradictions[0] ?? null,
      overallConfidence,
    },
  };

  logger.info({
    clientId: signals.clientId,
    correlationCount: correlations.length,
    causalChainCount: causalChains.length,
    contradictionCount: contradictions.length,
    overallConfidence,
  }, '[SynthesisEngine] Synthesis complete');

  return result;
}
