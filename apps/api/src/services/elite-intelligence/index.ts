/**
 * Elite Intelligence System - Main Orchestrator
 *
 * Transforms raw data from multiple sources into strategic intelligence
 * with THE ONE THING prioritization.
 *
 * Architecture:
 * 1. Signal Collector - Gathers data from Meta, Shopify, Comments, etc.
 * 2. Synthesis Engine - Detects correlations, infers causation
 * 3. Psychology Engine - Analyzes audience mental state
 * 4. Predictor Engine - Forecasts with intervention windows
 * 5. Systemic Engine - Maps cascade effects
 * 6. Leverage Engine - Determines THE ONE THING
 */

import {
  SignalTaxonomy,
  EliteIntelligenceOutput,
  ExecutionPlaybook,
  ExecutionItem,
} from './types.js';

import { collectAllSignals } from './signal-collector.js';
import { synthesizeSignals, SynthesisResult } from './synthesis-engine.js';
import {
  analyzeAudiencePsychology,
  generateForecasts,
  mapSystemicEffects,
  determineTheOneThing,
} from './reasoning-engines.js';

import { logger } from '../../utils/logger.js';

// Re-export types for external use
export * from './types.js';
export { collectAllSignals } from './signal-collector.js';
export { synthesizeSignals } from './synthesis-engine.js';
export {
  analyzeAudiencePsychology,
  generateForecasts,
  mapSystemicEffects,
  determineTheOneThing,
} from './reasoning-engines.js';

export { generateHTMLReport } from './html-report.js';

// ============================================================================
// EXECUTION PLAYBOOK BUILDER
// ============================================================================

function buildExecutionPlaybook(
  theOneThing: EliteIntelligenceOutput['theOneThing'],
  forecasts: EliteIntelligenceOutput['predictions']['forecasts'],
  psychology: EliteIntelligenceOutput['audiencePsychology']
): ExecutionPlaybook {
  const immediate: ExecutionItem[] = [];
  const thisWeek: ExecutionItem[] = [];
  const thisMonth: ExecutionItem[] = [];
  const systemicChanges: ExecutionItem[] = [];

  // Add THE ONE THING actions
  theOneThing.execution.immediate.forEach((action, i) => {
    immediate.push({
      action,
      specifics: `Part of primary lever: ${theOneThing.statement}`,
      owner: 'Media Buyer',
      successCriteria: theOneThing.impact.estimatedImprovement,
      blocksWhat: i === 0 ? 'Everything else' : immediate[i - 1]?.action ?? 'Primary action',
      priority: 'critical',
    });
  });

  theOneThing.execution.thisWeek.forEach(action => {
    thisWeek.push({
      action,
      specifics: `Follow-up to primary lever`,
      owner: 'Media Buyer',
      successCriteria: 'Measurable progress on ' + theOneThing.impact.metricImproved,
      blocksWhat: 'Sustainable improvement',
      priority: 'high',
    });
  });

  theOneThing.execution.thisMonth.forEach(action => {
    thisMonth.push({
      action,
      specifics: `Consolidation action`,
      owner: 'Marketing Lead',
      successCriteria: 'System in place',
      blocksWhat: 'Long-term stability',
      priority: 'medium',
    });
  });

  theOneThing.execution.systemicChanges.forEach(action => {
    systemicChanges.push({
      action,
      specifics: `Process change for sustainability`,
      owner: 'Operations',
      successCriteria: 'Process documented and followed',
      blocksWhat: 'Recurrence of issue',
      priority: 'medium',
    });
  });

  // Add forecast-driven actions
  for (const forecast of forecasts.filter(f => f.impact[0]?.direction === 'negative')) {
    const interventionWindow = forecast.intervention.windowDays;

    if (interventionWindow <= 3) {
      forecast.intervention.toPrevent.forEach(action => {
        if (!immediate.find(i => i.action === action)) {
          immediate.push({
            action,
            specifics: `Prevent ${forecast.impact[0]?.metric} decline`,
            owner: 'Media Buyer',
            successCriteria: `${forecast.signal} stabilizes`,
            blocksWhat: forecast.impact[0]?.metric ?? 'Key metric',
            priority: 'high',
          });
        }
      });
    } else if (interventionWindow <= 7) {
      forecast.intervention.toPrevent.forEach(action => {
        if (!thisWeek.find(i => i.action === action)) {
          thisWeek.push({
            action,
            specifics: `Prevent ${forecast.impact[0]?.metric} decline within ${interventionWindow} days`,
            owner: 'Media Buyer',
            successCriteria: `${forecast.signal} stabilizes`,
            blocksWhat: forecast.impact[0]?.metric ?? 'Key metric',
            priority: 'high',
          });
        }
      });
    }
  }

  // Add psychology-driven actions for blockers
  for (const blocker of psychology.purchaseState.blockers.slice(0, 2)) {
    if (blocker.severity === 'critical') {
      immediate.push({
        action: blocker.removalStrategy.split('.')[0],
        specifics: `Address ${blocker.blocker} affecting ${blocker.affectedSegments.join(', ')}`,
        owner: 'Marketing Lead',
        successCriteria: `${blocker.blocker} frequency drops 50%`,
        blocksWhat: 'Conversion rate',
        priority: 'critical',
      });
    } else if (blocker.severity === 'high') {
      thisWeek.push({
        action: blocker.removalStrategy.split('.')[0],
        specifics: `Address ${blocker.blocker}`,
        owner: 'Marketing Lead',
        successCriteria: `${blocker.blocker} frequency drops 30%`,
        blocksWhat: 'Conversion rate',
        priority: 'high',
      });
    }
  }

  return {
    immediate: immediate.slice(0, 5),
    thisWeek: thisWeek.slice(0, 5),
    thisMonth: thisMonth.slice(0, 5),
    systemicChanges: systemicChanges.slice(0, 3),
  };
}

// ============================================================================
// STRATEGIC DIRECTION SYNTHESIZER
// ============================================================================

function synthesizeStrategicDirection(
  signals: SignalTaxonomy,
  synthesis: SynthesisResult,
  theOneThing: EliteIntelligenceOutput['theOneThing']
): EliteIntelligenceOutput['strategicDirection'] {
  // Determine current state
  const healthScores = {
    acquisition: signals.meta.ctrTrend?.value?.direction === 'declining' ? 'struggling' : 'stable',
    conversion: signals.shopify.conversionRate?.value?.direction === 'declining' ? 'struggling' : 'stable',
    economics: signals.meta.roasTrend?.value?.direction === 'declining' ? 'struggling' : 'stable',
  };

  const strugglingAreas = Object.entries(healthScores)
    .filter(([_, status]) => status === 'struggling')
    .map(([area]) => area);

  const currentState = strugglingAreas.length === 0 ?
    'Stable performance with optimization opportunities' :
    strugglingAreas.length === 1 ?
      `${strugglingAreas[0]} under pressure, other systems holding` :
      `Multiple systems stressed: ${strugglingAreas.join(', ')}`;

  // Determine desired state
  const desiredState = theOneThing.impact.metricImproved + ' improved by ' +
    theOneThing.impact.estimatedImprovement;

  // Determine transition
  const transition = `Execute ${theOneThing.statement.toLowerCase()} to unlock ${theOneThing.reasoning.cascadeEffect.toLowerCase()}`;

  // Timeframe
  const timeframe = theOneThing.impact.timeToImpact;

  // Confidence
  const confidence = theOneThing.confidenceBasis.score;

  return {
    currentState,
    desiredState,
    transition,
    timeframe,
    confidence,
  };
}

// ============================================================================
// GRANULAR INSIGHTS BUILDER
// ============================================================================

function buildGranularInsights(
  signals: SignalTaxonomy,
  synthesis: SynthesisResult
): EliteIntelligenceOutput['granular'] {
  const byProduct: EliteIntelligenceOutput['granular']['byProduct'] = [];
  const byCampaign: EliteIntelligenceOutput['granular']['byCampaign'] = [];
  const byCreative: EliteIntelligenceOutput['granular']['byCreative'] = [];

  // Product insights
  for (const product of signals.shopify.oosRisk ?? []) {
    byProduct.push({
      productId: product.id,
      insight: `${product.name} has ${product.daysToOOS} days until OOS with ₹${product.adSpend.toLocaleString()} ad spend`,
      action: product.daysToOOS && product.daysToOOS < 7 ?
        'Reduce ad spend or expedite restock' :
        'Monitor inventory and prepare restock',
    });
  }

  for (const product of signals.shopify.bestsellerVelocity?.slice(0, 3) ?? []) {
    if (product.trend === 'increasing') {
      byProduct.push({
        productId: product.id,
        insight: `${product.name} velocity is ${product.trend} - bestseller momentum`,
        action: 'Scale ads for this product, ensure inventory',
      });
    }
  }

  // Campaign insights
  for (const campaign of signals.meta.topCampaigns ?? []) {
    if (campaign.issues.length > 0) {
      byCampaign.push({
        campaignId: campaign.id,
        insight: `${campaign.name}: ${campaign.issues.join(', ')}`,
        action: campaign.trend === 'declining' ?
          'Review and potentially pause' :
          'Address issues while performance holds',
      });
    } else if (campaign.roas > 3 && campaign.trend === 'increasing') {
      byCampaign.push({
        campaignId: campaign.id,
        insight: `${campaign.name}: Strong performer (ROAS ${campaign.roas.toFixed(1)}x, ${campaign.trend})`,
        action: 'Scale budget 20-30%',
      });
    }
  }

  // Creative insights
  for (const creative of signals.meta.topCreatives ?? []) {
    if (creative.fatigueScore > 70) {
      byCreative.push({
        creativeId: creative.id,
        insight: `${creative.name}: Fatigue score ${creative.fatigueScore}%`,
        action: 'Reduce spend or pause, prepare replacement',
      });
    } else if (creative.clickToATC > 4) {
      byCreative.push({
        creativeId: creative.id,
        insight: `${creative.name}: Strong click-to-ATC (${creative.clickToATC.toFixed(1)}%)`,
        action: 'Scale this creative, create variations',
      });
    } else if (creative.clickToATC < 1 && creative.spend > 5000) {
      byCreative.push({
        creativeId: creative.id,
        insight: `${creative.name}: Poor click-to-ATC (${creative.clickToATC.toFixed(1)}%) with ₹${creative.spend.toLocaleString()} spend`,
        action: 'Pause immediately - traffic quality issue',
      });
    }
  }

  return {
    byProduct: byProduct.slice(0, 10),
    byCampaign: byCampaign.slice(0, 10),
    byCreative: byCreative.slice(0, 10),
  };
}

// ============================================================================
// CONFIDENCE REPORT BUILDER
// ============================================================================

function buildConfidenceReport(
  signals: SignalTaxonomy,
  synthesis: SynthesisResult,
  theOneThing: EliteIntelligenceOutput['theOneThing']
): EliteIntelligenceOutput['confidenceReport'] {
  const verifiedInsights: string[] = [];
  const strongInsights: string[] = [];
  const emergingPatterns: string[] = [];
  const uncertainties: string[] = [];

  // Categorize correlations by strength
  for (const corr of synthesis.correlations) {
    const insight = `${corr.signals[0]} and ${corr.signals[1]}: ${corr.hypothesis}`;
    if (corr.strength > 0.8) {
      verifiedInsights.push(insight);
    } else if (corr.strength > 0.6) {
      strongInsights.push(insight);
    } else {
      emergingPatterns.push(insight);
    }
  }

  // Add causal chain insights
  for (const chain of synthesis.causalChains) {
    if (chain.confidence > 80) {
      verifiedInsights.push(`${chain.trigger} is causing downstream effects (${chain.confidence}% confidence)`);
    } else if (chain.confidence > 60) {
      strongInsights.push(`${chain.trigger} likely causing effects (${chain.confidence}% confidence)`);
    }

    // Add uncertainties from contradicting evidence
    for (const contra of chain.contradictingEvidence) {
      uncertainties.push(contra);
    }
  }

  // Add THE ONE THING uncertainties
  uncertainties.push(...theOneThing.confidenceBasis.uncertainties);

  // Calculate overall confidence
  const overallConfidence = synthesis.summary.overallConfidence;

  return {
    overallConfidence,
    verifiedInsights: verifiedInsights.slice(0, 5),
    strongInsights: strongInsights.slice(0, 5),
    emergingPatterns: emergingPatterns.slice(0, 5),
    uncertainties: uncertainties.slice(0, 5),
    contradictions: synthesis.contradictions,
  };
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

export interface EliteIntelligenceInput {
  clientId: string;
  accountId: string;
  meta?: {
    campaigns?: any[];
    creatives?: any[];
    insights?: any;
    previousInsights?: any;
  };
  shopify?: {
    analytics?: any;
    previousAnalytics?: any;
    products?: any[];
    orders?: any[];
    customers?: any[];
  };
  comments?: {
    text: string;
    category: string;
    sentiment: string;
    emotionalTriggers: string[];
    createdAt?: string;
  }[];
  funnel?: any;
  operations?: any;
  competitive?: any;
  creator?: any;
}

export async function generateEliteIntelligence(
  input: EliteIntelligenceInput
): Promise<EliteIntelligenceOutput> {
  const startTime = Date.now();
  logger.info({ clientId: input.clientId, accountId: input.accountId }, '[EliteIntelligence] Starting intelligence generation');

  // Step 1: Collect all signals
  const signals = await collectAllSignals(input.clientId, input.accountId, {
    meta: input.meta,
    shopify: input.shopify,
    comments: input.comments,
    funnel: input.funnel,
    operations: input.operations,
    competitive: input.competitive,
    creator: input.creator,
  });

  // Step 2: Synthesize signals (correlations, causation, contradictions)
  const synthesis = synthesizeSignals(signals);

  // Step 3: Run reasoning engines
  const audiencePsychology = analyzeAudiencePsychology(signals, synthesis);
  const forecasts = generateForecasts(signals);
  const systemicMaps = mapSystemicEffects(signals, synthesis);

  // Step 4: Determine THE ONE THING
  const theOneThing = determineTheOneThing(
    signals,
    synthesis,
    audiencePsychology,
    forecasts,
    systemicMaps
  );

  // Step 5: Build strategic direction
  const strategicDirection = synthesizeStrategicDirection(signals, synthesis, theOneThing);

  // Step 6: Build execution playbook
  const executionPlaybook = buildExecutionPlaybook(theOneThing, forecasts, audiencePsychology);

  // Step 7: Build granular insights
  const granular = buildGranularInsights(signals, synthesis);

  // Step 8: Build confidence report
  const confidenceReport = buildConfidenceReport(signals, synthesis, theOneThing);

  // Step 9: Extract early warnings from forecasts
  const earlyWarnings = forecasts
    .filter(f => f.impact[0]?.direction === 'negative')
    .flatMap(f => f.earlyWarnings);

  // Step 10: Extract opportunity windows
  const windows = forecasts
    .filter(f => f.intervention.windowDays < 14)
    .map(f => ({
      opportunity: f.intervention.toPrevent[0] ?? f.intervention.toAccelerate[0] ?? 'Take action',
      closingDays: f.intervention.windowDays,
    }));

  const output: EliteIntelligenceOutput = {
    theOneThing,
    strategicDirection,
    audiencePsychology,
    predictions: {
      forecasts,
      earlyWarnings: [...new Set(earlyWarnings)],
      windows,
    },
    systemicAnalysis: {
      healthScores: systemicMaps[0]?.systemHealth ?? {
        acquisition: 'healthy',
        conversion: 'healthy',
        retention: 'healthy',
        economics: 'healthy',
        brand: 'healthy',
      },
      criticalConnections: synthesis.causalChains.slice(0, 3),
      cascadeRisks: systemicMaps,
    },
    granular,
    executionPlaybook,
    confidenceReport,
    generatedAt: new Date().toISOString(),
    clientId: input.clientId,
    signalSources: ['meta-api', 'shopify', 'comments'],
  };

  const duration = Date.now() - startTime;
  logger.info({
    clientId: input.clientId,
    duration,
    confidence: confidenceReport.overallConfidence,
    theOneThing: theOneThing.statement,
  }, '[EliteIntelligence] Intelligence generation complete');

  return output;
}

// ============================================================================
// QUICK SUMMARY GENERATOR (for alerts/briefings)
// ============================================================================

export function generateQuickSummary(output: EliteIntelligenceOutput): string {
  const lines: string[] = [];

  lines.push(`🎯 THE ONE THING: ${output.theOneThing.statement}`);
  lines.push('');
  lines.push(`📊 Why this matters: ${output.theOneThing.reasoning.cascadeEffect}`);
  lines.push(`⏱️ Impact: ${output.theOneThing.impact.estimatedImprovement} in ${output.theOneThing.impact.timeToImpact}`);
  lines.push(`🎯 Confidence: ${output.theOneThing.confidenceBasis.score}%`);
  lines.push('');

  if (output.predictions.earlyWarnings.length > 0) {
    lines.push('⚠️ EARLY WARNINGS:');
    output.predictions.earlyWarnings.slice(0, 3).forEach(w => {
      lines.push(`  • ${w}`);
    });
    lines.push('');
  }

  lines.push('🚀 IMMEDIATE ACTIONS:');
  output.executionPlaybook.immediate.slice(0, 3).forEach(item => {
    lines.push(`  • ${item.action}`);
  });

  if (output.confidenceReport.contradictions.length > 0) {
    lines.push('');
    lines.push('🔍 NEEDS INVESTIGATION:');
    output.confidenceReport.contradictions.slice(0, 2).forEach(c => {
      lines.push(`  • ${c.conflict}`);
    });
  }

  return lines.join('\n');
}

// ============================================================================
// FORMATTED REPORT GENERATOR
// ============================================================================

export function generateFormattedReport(output: EliteIntelligenceOutput): string {
  const sections: string[] = [];

  // Header
  sections.push('═'.repeat(60));
  sections.push('ELITE INTELLIGENCE REPORT');
  sections.push(`Generated: ${new Date(output.generatedAt).toLocaleString()}`);
  sections.push(`Client: ${output.clientId}`);
  sections.push(`Confidence: ${output.confidenceReport.overallConfidence}%`);
  sections.push('═'.repeat(60));
  sections.push('');

  // THE ONE THING
  sections.push('┌─ THE ONE THING ─────────────────────────────────────────┐');
  sections.push('│');
  sections.push(`│  ${output.theOneThing.statement}`);
  sections.push('│');
  sections.push(`│  LEVERAGE: ${output.theOneThing.reasoning.leverage}`);
  sections.push(`│  URGENCY: ${output.theOneThing.reasoning.urgency}`);
  sections.push('│');
  sections.push(`│  IMPACT: ${output.theOneThing.impact.metricImproved}`);
  sections.push(`│  ESTIMATE: ${output.theOneThing.impact.estimatedImprovement}`);
  sections.push(`│  TIMELINE: ${output.theOneThing.impact.timeToImpact}`);
  sections.push('│');
  sections.push('└───────────────────────────────────────────────────────────┘');
  sections.push('');

  // Strategic Direction
  sections.push('┌─ STRATEGIC DIRECTION ──────────────────────────────────────┐');
  sections.push(`│  FROM: ${output.strategicDirection.currentState}`);
  sections.push(`│  TO: ${output.strategicDirection.desiredState}`);
  sections.push(`│  HOW: ${output.strategicDirection.transition}`);
  sections.push('└───────────────────────────────────────────────────────────┘');
  sections.push('');

  // Audience Psychology
  sections.push('┌─ AUDIENCE PSYCHOLOGY ──────────────────────────────────────┐');
  sections.push(`│  Trust: ${output.audiencePsychology.trustState.overall.toUpperCase()} (${output.audiencePsychology.trustState.trajectory})`);
  sections.push(`│  Purchase State: ${output.audiencePsychology.purchaseState.dominant.replace(/_/g, ' ')}`);
  sections.push(`│  Skepticism: ${output.audiencePsychology.cognitiveState.skepticismLevel}`);
  if (output.audiencePsychology.purchaseState.blockers.length > 0) {
    sections.push('│');
    sections.push('│  BLOCKERS:');
    output.audiencePsychology.purchaseState.blockers.slice(0, 3).forEach(b => {
      sections.push(`│    • [${b.severity.toUpperCase()}] ${b.blocker}`);
    });
  }
  sections.push('└───────────────────────────────────────────────────────────┘');
  sections.push('');

  // Predictions
  if (output.predictions.forecasts.length > 0) {
    sections.push('┌─ PREDICTIONS ───────────────────────────────────────────────┐');
    output.predictions.forecasts.slice(0, 3).forEach(f => {
      const direction = f.impact[0]?.direction === 'positive' ? '↑' : '↓';
      sections.push(`│  ${direction} ${f.impact[0]?.metric}: ${f.impact[0]?.magnitude} impact in ${f.horizon}`);
      sections.push(`│    Confidence: ${f.confidence}%`);
    });
    sections.push('└───────────────────────────────────────────────────────────┘');
    sections.push('');
  }

  // System Health
  sections.push('┌─ SYSTEM HEALTH ─────────────────────────────────────────────┐');
  const health = output.systemicAnalysis.healthScores;
  sections.push(`│  Acquisition: ${health.acquisition.toUpperCase()}`);
  sections.push(`│  Conversion: ${health.conversion.toUpperCase()}`);
  sections.push(`│  Retention: ${health.retention.toUpperCase()}`);
  sections.push(`│  Economics: ${health.economics.toUpperCase()}`);
  sections.push(`│  Brand: ${health.brand.toUpperCase()}`);
  sections.push('└───────────────────────────────────────────────────────────┘');
  sections.push('');

  // Execution Playbook
  sections.push('┌─ EXECUTION PLAYBOOK ────────────────────────────────────────┐');
  sections.push('│');
  sections.push('│  🔴 IMMEDIATE:');
  output.executionPlaybook.immediate.forEach(item => {
    sections.push(`│    • ${item.action}`);
  });
  sections.push('│');
  sections.push('│  🟡 THIS WEEK:');
  output.executionPlaybook.thisWeek.forEach(item => {
    sections.push(`│    • ${item.action}`);
  });
  sections.push('│');
  sections.push('│  🟢 THIS MONTH:');
  output.executionPlaybook.thisMonth.forEach(item => {
    sections.push(`│    • ${item.action}`);
  });
  sections.push('│');
  sections.push('└───────────────────────────────────────────────────────────┘');
  sections.push('');

  // Confidence Report
  sections.push('┌─ CONFIDENCE REPORT ─────────────────────────────────────────┐');
  sections.push(`│  Overall Confidence: ${output.confidenceReport.overallConfidence}%`);
  sections.push('│');
  if (output.confidenceReport.verifiedInsights.length > 0) {
    sections.push('│  ✓ VERIFIED:');
    output.confidenceReport.verifiedInsights.slice(0, 2).forEach(i => {
      sections.push(`│    • ${i}`);
    });
  }
  if (output.confidenceReport.uncertainties.length > 0) {
    sections.push('│');
    sections.push('│  ? UNCERTAINTIES:');
    output.confidenceReport.uncertainties.slice(0, 2).forEach(u => {
      sections.push(`│    • ${u}`);
    });
  }
  sections.push('└───────────────────────────────────────────────────────────┘');

  return sections.join('\n');
}
