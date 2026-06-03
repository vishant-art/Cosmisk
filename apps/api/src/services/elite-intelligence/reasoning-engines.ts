/**
 * Elite Intelligence - Reasoning Engines
 *
 * Four specialized reasoning engines:
 * 1. Psychology Engine - Audience mental state analysis
 * 2. Predictor Engine - Forecasting with intervention windows
 * 3. Systemic Engine - Cascade effects mapping
 * 4. Leverage Engine - THE ONE THING prioritization
 */

import {
  SignalTaxonomy,
  AudiencePsychologyProfile,
  TrustLevel,
  PurchaseState,
  PurchaseBlocker,
  Forecast,
  ForecastImpact,
  SystemicMap,
  SystemHealth,
  SystemEffect,
  TheOneThing,
  TrendDirection,
} from './types.js';

import { SynthesisResult } from './synthesis-engine.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// PSYCHOLOGY ENGINE
// ============================================================================

function assessTrustLevel(signals: SignalTaxonomy): TrustLevel {
  const trustQuestions = signals.comments.trustQuestioning?.value?.current ?? 0;
  const objections = signals.comments.objectionFrequency?.value?.current ?? 0;
  const sentiment = signals.comments.sentimentDistribution;

  const negativeRatio = sentiment.negative / (sentiment.positive + sentiment.negative + 0.01);

  if (trustQuestions > 25 || negativeRatio > 0.5) return 'contaminated';
  if (trustQuestions > 15 || negativeRatio > 0.3) return 'eroding';
  if (trustQuestions > 8 || objections > 15) return 'fragile';
  if (trustQuestions > 3) return 'stable';
  return 'strong';
}

function identifyPurchaseState(signals: SignalTaxonomy): PurchaseState {
  const buyingSignals = signals.comments.buyingSignals?.value?.current ?? 0;
  const objections = signals.comments.objectionFrequency?.value?.current ?? 0;
  const trustQuestions = signals.comments.trustQuestioning?.value?.current ?? 0;
  const comparisons = signals.comments.comparisonMentions?.value?.current ?? 0;

  // Priority order of states
  if (trustQuestions > 15) return 'legitimacy_verification';
  if (objections > 20) return 'objection_processing';
  if (comparisons > 10) return 'comparison_shopping';
  if (signals.shopify.cartAbandonRate?.value?.current > 70) return 'purchase_anxiety';
  if (buyingSignals > 20) return 'desire_active';
  if (objections > 10) return 'risk_mitigation';

  return 'value_assessment';
}

function identifyBlockers(signals: SignalTaxonomy, synthesis: SynthesisResult): PurchaseBlocker[] {
  const blockers: PurchaseBlocker[] = [];

  // Trust blocker
  const trustLevel = assessTrustLevel(signals);
  if (trustLevel === 'eroding' || trustLevel === 'contaminated' || trustLevel === 'fragile') {
    blockers.push({
      blocker: 'Trust deficit',
      severity: trustLevel === 'contaminated' ? 'critical' : trustLevel === 'eroding' ? 'high' : 'moderate',
      affectedSegments: ['new_visitors', 'cold_audience'],
      evidenceStrength: 85,
      removalStrategy: 'Add social proof, testimonials, trust badges. Address specific objections in creative.',
    });
  }

  // Price objection blocker
  const topObjections = signals.comments.topObjections ?? [];
  const priceObjection = topObjections.find(o =>
    o.pattern.toLowerCase().includes('price') ||
    o.pattern.toLowerCase().includes('expensive') ||
    o.pattern.toLowerCase().includes('cost')
  );
  if (priceObjection && priceObjection.frequency > 5) {
    blockers.push({
      blocker: 'Price resistance',
      severity: priceObjection.frequency > 15 ? 'high' : 'moderate',
      affectedSegments: ['price_sensitive', 'comparison_shoppers'],
      evidenceStrength: 75,
      removalStrategy: 'Value stack messaging, payment plans, ROI calculator, competitor price comparison.',
    });
  }

  // Checkout friction blocker
  const cartAbandon = signals.shopify.cartAbandonRate?.value?.current ?? 0;
  if (cartAbandon > 75) {
    blockers.push({
      blocker: 'Checkout friction',
      severity: cartAbandon > 85 ? 'critical' : 'high',
      affectedSegments: ['all_visitors'],
      evidenceStrength: 90,
      removalStrategy: 'Simplify checkout, add guest checkout, reduce form fields, add progress indicator.',
    });
  }

  // Traffic quality blocker
  const clickToATC = signals.meta.clickToATCRate?.value?.current ?? 0;
  if (clickToATC < 1.5) {
    blockers.push({
      blocker: 'Poor traffic quality',
      severity: clickToATC < 0.5 ? 'critical' : 'high',
      affectedSegments: ['ad_traffic'],
      evidenceStrength: 85,
      removalStrategy: 'Align creative messaging with product. Target intent-based audiences. Test new hooks.',
    });
  }

  // COD dependency blocker
  const codRate = signals.shopify.codRate?.value?.current ?? 0;
  const rtoRate = signals.shopify.codRTORate?.value?.current ?? 0;
  if (codRate > 60 && rtoRate > 20) {
    blockers.push({
      blocker: 'COD dependency with high RTO',
      severity: rtoRate > 35 ? 'critical' : 'high',
      affectedSegments: ['cod_customers'],
      evidenceStrength: 90,
      removalStrategy: 'Prepaid incentives, COD verification calls, partial prepaid option.',
    });
  }

  return blockers.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, moderate: 2, low: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

export function analyzeAudiencePsychology(
  signals: SignalTaxonomy,
  synthesis: SynthesisResult
): AudiencePsychologyProfile {
  logger.info({ clientId: signals.clientId }, '[PsychologyEngine] Analyzing audience psychology');

  const trustLevel = assessTrustLevel(signals);
  const purchaseState = identifyPurchaseState(signals);
  const blockers = identifyBlockers(signals, synthesis);

  // Determine trust trajectory
  const trustTrend = signals.comments.trustQuestioning?.value?.direction ?? 'stable';
  let trustTrajectory: 'building' | 'stable' | 'eroding' | 'contaminated' = 'stable';
  if (trustTrend === 'declining') trustTrajectory = 'building';
  if (trustTrend === 'increasing') trustTrajectory = trustLevel === 'contaminated' ? 'contaminated' : 'eroding';

  // Emotional state from triggers
  const emotionalTriggers = signals.comments.emotionalTriggers ?? [];
  const dominantEmotions = emotionalTriggers.slice(0, 3).map(e => e.emotion);
  const emergingEmotions = emotionalTriggers
    .filter(e => e.trend === 'increasing')
    .slice(0, 2)
    .map(e => e.emotion);
  const fadingEmotions = emotionalTriggers
    .filter(e => e.trend === 'declining')
    .slice(0, 2)
    .map(e => e.emotion);

  // Cognitive state
  const objectionRate = signals.comments.objectionFrequency?.value?.current ?? 0;
  const comparisonRate = signals.comments.comparisonMentions?.value?.current ?? 0;

  return {
    trustState: {
      overall: trustLevel,
      trajectory: trustTrajectory,
      primaryThreat: blockers[0]?.blocker ?? null,
      brandTrust: trustLevel,
      productTrust: trustLevel === 'contaminated' ? 'eroding' : trustLevel,
      operationalTrust: signals.shopify.codRTORate?.value?.current > 25 ? 'fragile' : 'stable',
    },
    purchaseState: {
      dominant: purchaseState,
      blockers,
      accelerators: identifyAccelerators(signals),
    },
    emotionalState: {
      dominant: dominantEmotions,
      emerging: emergingEmotions,
      fading: fadingEmotions,
      volatility: emotionalTriggers.filter(e => e.trend !== 'stable').length > 5 ? 'volatile' : 'stable',
    },
    cognitiveState: {
      informationSeeking: objectionRate > 15 ? 'extensive' : objectionRate > 5 ? 'moderate' : 'minimal',
      comparisonMode: comparisonRate > 5,
      skepticismLevel: trustLevel === 'contaminated' ? 'extreme' :
        trustLevel === 'eroding' ? 'high' :
        trustLevel === 'fragile' ? 'moderate' : 'low',
    },
  };
}

function identifyAccelerators(signals: SignalTaxonomy): string[] {
  const accelerators: string[] = [];

  if (signals.comments.buyingSignals?.value?.direction === 'increasing') {
    accelerators.push('Rising purchase intent in comments');
  }
  if (signals.shopify.conversionRate?.value?.direction === 'increasing') {
    accelerators.push('Improving conversion rate');
  }
  if (signals.meta.clickToATCRate?.value?.current > 5) {
    accelerators.push('Strong click-to-cart rate');
  }
  if (signals.comments.sentimentDistribution.positive > 60) {
    accelerators.push('Positive sentiment dominates');
  }

  return accelerators;
}

// ============================================================================
// PREDICTOR ENGINE
// ============================================================================

interface PredictionPattern {
  signal: string;
  condition: (current: number, direction: TrendDirection) => boolean;
  prediction: {
    metric: string;
    direction: 'positive' | 'negative';
    magnitude: ForecastImpact['magnitude'];
    horizon: '7d' | '14d' | '30d';
    confidence: number;
  };
  basis: string[];
  earlyWarnings: string[];
  interventions: {
    toPrevent: string[];
    toAccelerate: string[];
    windowDays: number;
  };
}

const PREDICTION_PATTERNS: PredictionPattern[] = [
  {
    signal: 'meta.frequency',
    condition: (v, d) => v > 2.5 && d === 'increasing',
    prediction: {
      metric: 'CTR',
      direction: 'negative',
      magnitude: 'moderate',
      horizon: '7d',
      confidence: 80,
    },
    basis: ['Frequency > 2.5 historically leads to CTR decline', 'Direction is accelerating'],
    earlyWarnings: ['Frequency crossed 2.0', 'CTR starting to flatten'],
    interventions: {
      toPrevent: ['Refresh creatives', 'Expand audience', 'Reduce budget on fatigued ad sets'],
      toAccelerate: [],
      windowDays: 5,
    },
  },
  {
    signal: 'comments.trustQuestions',
    condition: (v, d) => v > 10 && d === 'increasing',
    prediction: {
      metric: 'Conversion Rate',
      direction: 'negative',
      magnitude: 'major',
      horizon: '14d',
      confidence: 75,
    },
    basis: ['Trust questions correlate with conversion drops', 'Trend is worsening'],
    earlyWarnings: ['Trust questioning up 20% WoW', 'Negative sentiment increasing'],
    interventions: {
      toPrevent: ['Address objections in creative', 'Add testimonials', 'Review customer service'],
      toAccelerate: [],
      windowDays: 7,
    },
  },
  {
    signal: 'meta.clickToATC',
    condition: (v, d) => v > 4 && d === 'increasing',
    prediction: {
      metric: 'ROAS',
      direction: 'positive',
      magnitude: 'major',
      horizon: '7d',
      confidence: 85,
    },
    basis: ['Strong click-to-ATC predicts conversions', 'Traffic quality improving'],
    earlyWarnings: [],
    interventions: {
      toPrevent: [],
      toAccelerate: ['Scale winning creatives', 'Increase budget', 'Expand to lookalikes'],
      windowDays: 3,
    },
  },
  {
    signal: 'shopify.codRate',
    condition: (v, d) => v > 55 && d === 'increasing',
    prediction: {
      metric: 'RTO Rate',
      direction: 'negative',
      magnitude: 'major',
      horizon: '30d',
      confidence: 85,
    },
    basis: ['COD > 55% historically leads to RTO spikes', 'Trend is worsening'],
    earlyWarnings: ['COD rate crossed 50%', 'Prepaid conversions declining'],
    interventions: {
      toPrevent: ['Prepaid discount incentive', 'COD verification flow', 'Partial prepaid option'],
      toAccelerate: [],
      windowDays: 14,
    },
  },
  {
    signal: 'shopify.cartAbandon',
    condition: (v, d) => v > 80 && d === 'increasing',
    prediction: {
      metric: 'Revenue',
      direction: 'negative',
      magnitude: 'critical',
      horizon: '7d',
      confidence: 90,
    },
    basis: ['Cart abandonment > 80% indicates checkout friction', 'Immediate revenue impact'],
    earlyWarnings: ['Cart abandonment crossed 75%', 'Checkout time increasing'],
    interventions: {
      toPrevent: ['Audit checkout flow', 'Add cart recovery emails', 'Simplify payment options'],
      toAccelerate: [],
      windowDays: 3,
    },
  },
];

export function generateForecasts(signals: SignalTaxonomy): Forecast[] {
  logger.info({ clientId: signals.clientId }, '[PredictorEngine] Generating forecasts');

  const forecasts: Forecast[] = [];

  // Extract signal values
  const signalMap = new Map<string, { value: number; direction: TrendDirection }>();

  if (signals.meta.avgFrequency?.value) {
    signalMap.set('meta.frequency', {
      value: signals.meta.avgFrequency.value.current,
      direction: signals.meta.avgFrequency.value.direction,
    });
  }
  if (signals.comments.trustQuestioning?.value) {
    signalMap.set('comments.trustQuestions', {
      value: signals.comments.trustQuestioning.value.current,
      direction: signals.comments.trustQuestioning.value.direction,
    });
  }
  if (signals.meta.clickToATCRate?.value) {
    signalMap.set('meta.clickToATC', {
      value: signals.meta.clickToATCRate.value.current,
      direction: signals.meta.clickToATCRate.value.direction,
    });
  }
  if (signals.shopify.codRate?.value) {
    signalMap.set('shopify.codRate', {
      value: signals.shopify.codRate.value.current,
      direction: signals.shopify.codRate.value.direction,
    });
  }
  if (signals.shopify.cartAbandonRate?.value) {
    signalMap.set('shopify.cartAbandon', {
      value: signals.shopify.cartAbandonRate.value.current,
      direction: signals.shopify.cartAbandonRate.value.direction,
    });
  }

  for (const pattern of PREDICTION_PATTERNS) {
    const signal = signalMap.get(pattern.signal);
    if (!signal) continue;

    if (!pattern.condition(signal.value, signal.direction)) continue;

    // Calculate predicted value
    const currentValue = signal.value;
    const changeMultiplier = pattern.prediction.magnitude === 'critical' ? 0.3 :
      pattern.prediction.magnitude === 'major' ? 0.2 :
      pattern.prediction.magnitude === 'moderate' ? 0.1 : 0.05;

    const predictedChange = pattern.prediction.direction === 'positive' ?
      currentValue * changeMultiplier : -currentValue * changeMultiplier;

    forecasts.push({
      id: `forecast_${pattern.signal}_${Date.now()}`,
      signal: pattern.signal,
      currentValue,
      predictedValue: currentValue + predictedChange,
      horizon: pattern.prediction.horizon,
      confidence: pattern.prediction.confidence,
      basis: pattern.basis,
      earlyWarnings: pattern.earlyWarnings,
      impact: [{
        metric: pattern.prediction.metric,
        direction: pattern.prediction.direction,
        magnitude: pattern.prediction.magnitude,
        daysToImpact: pattern.prediction.horizon === '7d' ? 7 : pattern.prediction.horizon === '14d' ? 14 : 30,
      }],
      intervention: pattern.interventions,
    });
  }

  return forecasts.sort((a, b) => b.confidence - a.confidence);
}

// ============================================================================
// SYSTEMIC ENGINE
// ============================================================================

function assessSystemHealth(signals: SignalTaxonomy): SystemicMap['systemHealth'] {
  // Acquisition health
  const ctr = signals.meta.ctrTrend?.value?.direction ?? 'stable';
  const cpc = signals.meta.cpcTrend?.value?.direction ?? 'stable';
  const acquisitionHealth: SystemHealth =
    ctr === 'declining' && cpc === 'increasing' ? 'critical' :
    ctr === 'declining' || cpc === 'increasing' ? 'degrading' :
    ctr === 'stable' ? 'stressed' : 'healthy';

  // Conversion health
  const convRate = signals.shopify.conversionRate?.value?.direction ?? 'stable';
  const cartAbandon = signals.shopify.cartAbandonRate?.value?.current ?? 0;
  const conversionHealth: SystemHealth =
    convRate === 'declining' && cartAbandon > 80 ? 'critical' :
    convRate === 'declining' || cartAbandon > 70 ? 'degrading' :
    convRate === 'stable' ? 'stressed' : 'healthy';

  // Retention health
  const repeatRate = signals.shopify.repeatPurchaseRate?.value?.direction ?? 'stable';
  const retentionHealth: SystemHealth =
    repeatRate === 'declining' ? 'degrading' :
    repeatRate === 'stable' ? 'stressed' : 'healthy';

  // Economics health
  const roas = signals.meta.roasTrend?.value?.direction ?? 'stable';
  const cpa = signals.meta.cpaTrend?.value?.direction ?? 'stable';
  const economicsHealth: SystemHealth =
    roas === 'declining' && cpa === 'increasing' ? 'critical' :
    roas === 'declining' || cpa === 'increasing' ? 'degrading' :
    roas === 'stable' ? 'stressed' : 'healthy';

  // Brand health
  const trustLevel = assessTrustLevel(signals);
  const brandHealth: SystemHealth =
    trustLevel === 'contaminated' ? 'critical' :
    trustLevel === 'eroding' ? 'degrading' :
    trustLevel === 'fragile' ? 'stressed' : 'healthy';

  return {
    acquisition: acquisitionHealth,
    conversion: conversionHealth,
    retention: retentionHealth,
    economics: economicsHealth,
    brand: brandHealth,
  };
}

export function mapSystemicEffects(
  signals: SignalTaxonomy,
  synthesis: SynthesisResult
): SystemicMap[] {
  logger.info({ clientId: signals.clientId }, '[SystemicEngine] Mapping systemic effects');

  const systemicMaps: SystemicMap[] = [];
  const systemHealth = assessSystemHealth(signals);

  // Find the most critical causal chain and map its cascade
  for (const chain of synthesis.causalChains.slice(0, 3)) {
    const directEffects: SystemEffect[] = chain.effects.slice(0, 2).map(e => ({
      system: e.signal.split('.')[0],
      effect: `${e.signal} will ${e.direction}`,
      mechanism: e.mechanism,
      timelag: e.delay,
      certainty: chain.confidence / 100,
    }));

    // Infer indirect effects
    const indirectEffects: SystemEffect[] = [];
    for (const effect of chain.effects) {
      if (effect.signal.includes('roas') || effect.signal.includes('cpa')) {
        indirectEffects.push({
          system: 'economics',
          effect: 'Profitability will be impacted',
          mechanism: 'Cost-revenue ratio change',
          timelag: effect.delay + 7,
          certainty: (chain.confidence - 10) / 100,
        });
      }
      if (effect.signal.includes('conversion')) {
        indirectEffects.push({
          system: 'acquisition',
          effect: 'CPA will rise as conversions drop',
          mechanism: 'Same spend, fewer conversions',
          timelag: effect.delay + 3,
          certainty: (chain.confidence - 5) / 100,
        });
      }
    }

    // Hidden effects (second-order consequences)
    const hiddenEffects: SystemEffect[] = [];
    if (chain.trigger.includes('trust') || chain.trigger.includes('objection')) {
      hiddenEffects.push({
        system: 'brand',
        effect: 'Word-of-mouth will degrade',
        mechanism: 'Unhappy customers share experiences',
        timelag: 30,
        certainty: 0.5,
      });
    }
    if (chain.trigger.includes('frequency')) {
      hiddenEffects.push({
        system: 'brand',
        effect: 'Brand perception fatigue',
        mechanism: 'Overexposure leads to annoyance',
        timelag: 21,
        certainty: 0.6,
      });
    }

    // Determine intervention priority
    const criticalSystems = Object.entries(systemHealth)
      .filter(([_, health]) => health === 'critical' || health === 'degrading')
      .map(([system]) => system);

    const interventionPriority = criticalSystems.length > 0 ?
      `Fix ${criticalSystems[0]} system first` :
      'Optimize for growth';

    systemicMaps.push({
      triggerSignal: chain.trigger,
      triggerValue: chain.triggerValue,
      directEffects,
      indirectEffects,
      hiddenEffects,
      systemHealth,
      interventionPriority,
    });
  }

  return systemicMaps;
}

// ============================================================================
// LEVERAGE ENGINE - THE ONE THING
// ============================================================================

interface LeverageCandidate {
  action: string;
  leverage: number; // 1-100
  urgency: number; // 1-100
  cascadeEffect: string;
  metricImproved: string;
  estimatedImprovement: string;
  timeToImpact: string;
  execution: {
    immediate: string[];
    thisWeek: string[];
    thisMonth: string[];
    systemicChanges: string[];
  };
  downside: {
    whatHappens: string;
    timeline: string;
    severity: 'recoverable' | 'difficult' | 'permanent';
  };
  confidenceBasis: string[];
  uncertainties: string[];
}

export function determineTheOneThing(
  signals: SignalTaxonomy,
  synthesis: SynthesisResult,
  psychology: AudiencePsychologyProfile,
  forecasts: Forecast[],
  systemicMaps: SystemicMap[]
): TheOneThing {
  logger.info({ clientId: signals.clientId }, '[LeverageEngine] Determining THE ONE THING');

  const candidates: LeverageCandidate[] = [];

  // Candidate 1: Fix trust if eroding
  if (psychology.trustState.overall === 'eroding' || psychology.trustState.overall === 'contaminated') {
    candidates.push({
      action: 'Rebuild audience trust through testimonials and objection-addressing creative',
      leverage: 90,
      urgency: psychology.trustState.overall === 'contaminated' ? 95 : 80,
      cascadeEffect: 'Trust unlocks conversion, which unlocks ROAS, which enables scaling',
      metricImproved: 'Conversion Rate',
      estimatedImprovement: '20-40% in 14 days',
      timeToImpact: '7-14 days',
      execution: {
        immediate: ['Pause ads with high objection comments', 'Draft 3 testimonial-led creatives'],
        thisWeek: ['Launch trust-building creative test', 'Add trust badges to landing page'],
        thisMonth: ['Implement review collection flow', 'Create FAQ content for objections'],
        systemicChanges: ['Build objection monitoring into creative process'],
      },
      downside: {
        whatHappens: 'Conversion continues declining, ROAS crashes, brand perception hardens negative',
        timeline: '14-30 days',
        severity: 'difficult',
      },
      confidenceBasis: ['Trust questions correlate with conversion', 'Pattern seen in 3 similar accounts'],
      uncertainties: ['Time to trust recovery varies', 'May need product/service changes too'],
    });
  }

  // Candidate 2: Fix traffic quality if click-to-ATC is low
  const clickToATC = signals.meta.clickToATCRate?.value?.current ?? 0;
  if (clickToATC < 2) {
    candidates.push({
      action: 'Realign creative messaging with product value to fix traffic quality',
      leverage: 85,
      urgency: clickToATC < 1 ? 90 : 70,
      cascadeEffect: 'Better traffic quality → higher conversion → lower CPA → better ROAS',
      metricImproved: 'Click-to-ATC Rate',
      estimatedImprovement: 'From ' + clickToATC.toFixed(1) + '% to 3-4% in 7 days',
      timeToImpact: '3-7 days',
      execution: {
        immediate: ['Audit top-spending creatives for message-product alignment', 'Pause worst performers'],
        thisWeek: ['Create product-demo focused creatives', 'Test benefit-first vs feature-first hooks'],
        thisMonth: ['Implement creative scoring by click-to-ATC', 'Build creative brief template'],
        systemicChanges: ['Track click-to-ATC as primary creative KPI, not CTR'],
      },
      downside: {
        whatHappens: 'Continued budget waste on non-converting traffic',
        timeline: '7-14 days',
        severity: 'recoverable',
      },
      confidenceBasis: ['Click-to-ATC is strongest conversion predictor', 'Direct causal link'],
      uncertainties: ['Product-market fit could be the real issue'],
    });
  }

  // Candidate 3: Fix COD dependency
  const codRate = signals.shopify.codRate?.value?.current ?? 0;
  const rtoRate = signals.shopify.codRTORate?.value?.current ?? 0;
  if (codRate > 60 && rtoRate > 20) {
    candidates.push({
      action: 'Shift COD to prepaid with strategic incentives',
      leverage: 75,
      urgency: rtoRate > 35 ? 85 : 60,
      cascadeEffect: 'Lower RTO → actual revenue realized → real ROAS visible → better decisions',
      metricImproved: 'Realized Revenue (actual vs booked)',
      estimatedImprovement: '15-25% revenue recovery in 30 days',
      timeToImpact: '14-30 days',
      execution: {
        immediate: ['Calculate true COD cost (RTO + handling)', 'Design prepaid incentive'],
        thisWeek: ['Launch prepaid discount test', 'Add COD verification step'],
        thisMonth: ['Implement partial prepaid option', 'Test higher-value order prepaid-only'],
        systemicChanges: ['Track realized revenue not booked revenue'],
      },
      downside: {
        whatHappens: 'Continue losing 20-35% of COD orders to RTO, hidden loss compounds',
        timeline: '30-60 days',
        severity: 'difficult',
      },
      confidenceBasis: ['RTO rate directly measurable', 'Prepaid conversion impact testable'],
      uncertainties: ['Prepaid resistance in market segment'],
    });
  }

  // Candidate 4: Scale winning creative if click-to-ATC is strong
  if (clickToATC > 4) {
    candidates.push({
      action: 'Aggressively scale winning creatives with strong click-to-ATC',
      leverage: 80,
      urgency: 75,
      cascadeEffect: 'Scale winners → more conversions → better economics → growth capital',
      metricImproved: 'Total Purchases',
      estimatedImprovement: '30-50% volume increase in 14 days',
      timeToImpact: '3-7 days',
      execution: {
        immediate: ['Identify all creatives with click-to-ATC > 4%', 'Increase budget 30%'],
        thisWeek: ['Duplicate to new audiences', 'Create variations of winning hooks'],
        thisMonth: ['Build creative library around winning patterns', 'Test new formats with same messaging'],
        systemicChanges: ['Winner identification → scaling pipeline'],
      },
      downside: {
        whatHappens: 'Miss growth window while creative is still fresh',
        timeline: '7-14 days',
        severity: 'recoverable',
      },
      confidenceBasis: ['Strong click-to-ATC = proven traffic quality', 'Scaling math is straightforward'],
      uncertainties: ['Audience saturation timing', 'Frequency management'],
    });
  }

  // Candidate 5: Fix ad fatigue if frequency is high
  const frequency = signals.meta.avgFrequency?.value?.current ?? 0;
  if (frequency > 3 && signals.meta.ctrTrend?.value?.direction === 'declining') {
    candidates.push({
      action: 'Launch creative refresh to combat ad fatigue',
      leverage: 70,
      urgency: frequency > 4 ? 85 : 65,
      cascadeEffect: 'Fresh creatives → restored CTR → better CPC → improved ROAS',
      metricImproved: 'CTR',
      estimatedImprovement: 'CTR recovery of 20-40% in 7 days',
      timeToImpact: '5-10 days',
      execution: {
        immediate: ['Queue 5-10 new creatives for launch', 'Reduce budget on high-frequency ad sets'],
        thisWeek: ['Launch new creative test', 'Expand audience to reduce frequency'],
        thisMonth: ['Build creative calendar for regular refresh', 'Test iterative vs net-new creative approach'],
        systemicChanges: ['Frequency monitoring triggers creative refresh'],
      },
      downside: {
        whatHappens: 'CTR continues declining, CPC rises, ROAS degrades',
        timeline: '7-14 days',
        severity: 'recoverable',
      },
      confidenceBasis: ['Frequency-CTR correlation is strong', 'Refresh impact typically visible in days'],
      uncertainties: ['New creative performance unpredictable'],
    });
  }

  // Default candidate if nothing critical
  if (candidates.length === 0) {
    candidates.push({
      action: 'Optimize for incrementality by testing audience expansion',
      leverage: 50,
      urgency: 40,
      cascadeEffect: 'New audiences → incremental conversions → total growth',
      metricImproved: 'Total Conversions',
      estimatedImprovement: '10-20% incremental growth in 30 days',
      timeToImpact: '14-30 days',
      execution: {
        immediate: ['Identify best-performing audience for expansion test'],
        thisWeek: ['Launch lookalike expansion test', 'Test interest-based audiences'],
        thisMonth: ['Build audience testing framework'],
        systemicChanges: ['Incrementality measurement'],
      },
      downside: {
        whatHappens: 'Plateau at current performance level',
        timeline: '30-60 days',
        severity: 'recoverable',
      },
      confidenceBasis: ['Growth requires new audiences eventually'],
      uncertainties: ['New audience performance unpredictable'],
    });
  }

  // Sort by leverage * urgency and pick the best
  candidates.sort((a, b) => (b.leverage * b.urgency) - (a.leverage * a.urgency));
  const winner = candidates[0];
  const alternatives = candidates.slice(1, 4).map(c => c.action);

  return {
    statement: winner.action,
    reasoning: {
      leverage: `This has ${winner.leverage}% leverage because: ${winner.cascadeEffect}`,
      urgency: `Urgency is ${winner.urgency}% because of current trajectory`,
      cascadeEffect: winner.cascadeEffect,
      comparedTo: alternatives,
    },
    impact: {
      metricImproved: winner.metricImproved,
      estimatedImprovement: winner.estimatedImprovement,
      confidence: Math.round((winner.leverage + winner.urgency) / 2),
      timeToImpact: winner.timeToImpact,
    },
    execution: winner.execution,
    downside: winner.downside,
    confidenceBasis: {
      score: Math.round((winner.leverage + winner.urgency) / 2),
      basis: winner.confidenceBasis,
      uncertainties: winner.uncertainties,
    },
  };
}
