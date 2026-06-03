/**
 * Learning Engine — Main Learning Engine Functions
 */

import { getDbAdapter } from '../../db/adapter.js';
import { logger } from '../../utils/logger.js';
import {
  aggregateLTVData,
  aggregateReturnData,
  aggregateFatigueData,
  aggregateCompetitorData,
} from './aggregation.js';
import {
  synthesizeWinningPatterns,
  synthesizeLosingPatterns,
  synthesizeFatiguePatterns,
} from './synthesis.js';
import { prunePlaybook } from './pruning.js';
import {
  storePrediction,
  verifyPredictions,
  adjustConfidenceByAccuracy,
} from './predictions.js';
import type {
  CreativeGuidance,
  ClientPlaybook,
  Prediction,
  LearningEngineOutput,
} from './types.js';

/**
 * Generate guidance for a client
 */
export async function generateCreativeGuidance(clientId: string): Promise<CreativeGuidance> {
  logger.info({ clientId }, '[LearningEngine] Generating creative guidance');

  // Aggregate data from all sources in parallel
  const [ltvData, returnData, fatigueData, competitorData] = await Promise.all([
    aggregateLTVData(clientId),
    aggregateReturnData(clientId),
    aggregateFatigueData(clientId),
    aggregateCompetitorData(clientId),
  ]);

  // Synthesize patterns
  const winners = synthesizeWinningPatterns(ltvData, returnData);
  const losers = synthesizeLosingPatterns(ltvData, returnData);
  const fatiguePatterns = synthesizeFatiguePatterns(fatigueData);

  // Build guidance
  const recommendedFormats: string[] = [];
  const recommendedHooks: string[] = [];
  const recommendedAngles: string[] = [];
  const avoid: string[] = [];
  const avoidReasons: Record<string, string> = {};
  const reasoning: string[] = [];
  const basedOn: string[] = [];

  // From winning patterns
  for (const winner of winners) {
    recommendedHooks.push(winner.format);
    reasoning.push(`${winner.format} hooks have ${Math.round(winner.avgLtv)}% higher LTV (n=${winner.sampleSize})`);
  }
  if (winners.length > 0) basedOn.push('ltv-by-creative');

  // From losing patterns
  for (const loser of losers) {
    avoid.push(loser.format);
    avoidReasons[loser.format] = loser.reason;
  }
  if (losers.length > 0) basedOn.push('creative-returns');

  // From competitor gaps
  if (competitorData.gaps.length > 0) {
    recommendedAngles.push(...competitorData.gaps.slice(0, 3));
    reasoning.push(`Competitors missing: ${competitorData.gaps.slice(0, 3).join(', ')}`);
    basedOn.push('competitor-intel');
  }

  // From fatigue patterns
  const avgFatigueDays = fatiguePatterns[0]?.avgDaysToFatigue || 14;
  if (avgFatigueDays < 10) {
    reasoning.push(`Creatives fatigue fast (~${avgFatigueDays} days) — plan high refresh rate`);
    basedOn.push('fatigue-analysis');
  }

  // Determine urgency
  let urgency: CreativeGuidance['urgency'] = 'low';
  if (fatigueData.filter(f => f.fatigueLevel === 'severe').length > 2) {
    urgency = 'critical';
    reasoning.push('Multiple creatives showing severe fatigue — urgent refresh needed');
  } else if (fatigueData.filter(f => f.fatigueLevel === 'moderate').length > 3) {
    urgency = 'high';
  }

  // Defaults if no data
  if (recommendedFormats.length === 0) recommendedFormats.push('UGC', 'Static', 'Carousel');
  if (recommendedHooks.length === 0) recommendedHooks.push('benefit', 'social-proof', 'problem-solution');
  if (recommendedAngles.length === 0) recommendedAngles.push('product-focus', 'lifestyle', 'testimonial');

  // Calculate confidence based on data quality
  const dataPoints = ltvData.length + returnData.length + fatigueData.length;
  const confidence = Math.min(Math.round((dataPoints / 50) * 100), 95);

  return {
    recommendedFormats: [...new Set(recommendedFormats)],
    recommendedHooks: [...new Set(recommendedHooks)],
    recommendedAngles: [...new Set(recommendedAngles)],
    visualDirection: {
      style: 'casual', // Would come from competitor patterns
      typography: 'sans-serif',
      colorMood: 'neutral',
      layoutType: 'single-focus',
    },
    avoid: [...new Set(avoid)],
    avoidReasons,
    reasoning,
    urgency,
    confidence,
    basedOn,
  };
}

/**
 * Build/update the client playbook
 */
export async function buildClientPlaybook(clientId: string): Promise<ClientPlaybook> {
  logger.info({ clientId }, '[LearningEngine] Building client playbook');

  const [ltvData, returnData, fatigueData, competitorData] = await Promise.all([
    aggregateLTVData(clientId),
    aggregateReturnData(clientId),
    aggregateFatigueData(clientId),
    aggregateCompetitorData(clientId),
  ]);

  let playbook: ClientPlaybook = {
    clientId,
    lastUpdated: new Date().toISOString(),
    winningPatterns: synthesizeWinningPatterns(ltvData, returnData),
    losingPatterns: synthesizeLosingPatterns(ltvData, returnData),
    fatiguePatterns: synthesizeFatiguePatterns(fatigueData),
    audienceInsights: {
      highLtvSources: ltvData.filter(d => d.avgLtv > 2000).map(d => d.hookType),
      lowLtvSources: ltvData.filter(d => d.avgLtv < 1000 && d.repeatRate < 0.1).map(d => d.hookType),
      repeatBuyerCreatives: ltvData.filter(d => d.repeatRate > 0.25).map(d => d.creativeName),
      onePurchaseTrap: ltvData.filter(d => d.repeatRate < 0.08).map(d => d.creativeName),
    },
    competitorGaps: competitorData.gaps,
    competitorTrends: competitorData.trends,
  };

  // TIER 2: Prune playbook to prevent bloat
  playbook = prunePlaybook(playbook);

  // Store playbook in DB
  const db = getDbAdapter();
  try {
    await db.run(`
      INSERT INTO client_playbooks (client_id, playbook_data, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(client_id) DO UPDATE SET
        playbook_data = excluded.playbook_data,
        updated_at = datetime('now')
    `, [clientId, JSON.stringify(playbook)]);
  } catch {
    // Table might not exist
    logger.debug('[LearningEngine] client_playbooks table not found, skipping storage');
  }

  return playbook;
}

/**
 * Generate predictions based on current data
 * TIER 2: Adjusts confidence based on historical accuracy and stores for verification
 */
export async function generatePredictions(clientId: string, storeForVerification = true): Promise<Prediction[]> {
  const predictions: Prediction[] = [];

  const [fatigueData, competitorData] = await Promise.all([
    aggregateFatigueData(clientId),
    aggregateCompetitorData(clientId),
  ]);

  // Predict fatigue
  const severeCount = fatigueData.filter(f => f.fatigueLevel === 'severe').length;
  const moderateCount = fatigueData.filter(f => f.fatigueLevel === 'moderate').length;

  if (severeCount >= 2) {
    const basePrediction: Prediction = {
      type: 'roas_decline',
      prediction: `With ${severeCount} creatives in severe fatigue, expect ROAS to drop 15-25% over the next 7 days without refresh`,
      confidence: 75,
      timeframe: '7 days',
      basedOn: ['fatigue-analysis', 'historical-patterns'],
      suggestedAction: 'Launch 3-5 new creatives in next 48 hours targeting warm audiences',
    };

    // TIER 2: Adjust confidence based on historical accuracy
    basePrediction.confidence = await adjustConfidenceByAccuracy(basePrediction, clientId);

    predictions.push(basePrediction);

    // TIER 2: Store for later verification
    if (storeForVerification) {
      await storePrediction(basePrediction, clientId, {
        metric: 'ROAS',
        direction: 'decrease',
        minChange: 15,
      });
    }
  } else if (moderateCount >= 3) {
    const basePrediction: Prediction = {
      type: 'fatigue',
      prediction: `${moderateCount} creatives showing early fatigue. Performance decline expected in 5-7 days`,
      confidence: 65,
      timeframe: '5-7 days',
      basedOn: ['fatigue-analysis'],
      suggestedAction: 'Begin creative development now for next refresh cycle',
    };

    basePrediction.confidence = await adjustConfidenceByAccuracy(basePrediction, clientId);
    predictions.push(basePrediction);

    if (storeForVerification) {
      await storePrediction(basePrediction, clientId, {
        metric: 'CTR',
        direction: 'decrease',
        minChange: 10,
      });
    }
  }

  // Predict opportunity from competitor gaps
  if (competitorData.gaps.length >= 2) {
    const basePrediction: Prediction = {
      type: 'opportunity',
      prediction: `Competitors are absent from ${competitorData.gaps.slice(0, 2).join(' and ')} positioning. First-mover opportunity exists.`,
      confidence: 60,
      timeframe: '2-4 weeks',
      basedOn: ['competitor-intel'],
      suggestedAction: `Test ${competitorData.gaps[0]} angle with 3 creative variants`,
    };

    basePrediction.confidence = await adjustConfidenceByAccuracy(basePrediction, clientId);
    predictions.push(basePrediction);

    // Opportunity predictions are harder to verify automatically
    // Skip storage for now
  }

  // TIER 2: Verify any expired predictions while we're here
  verifyPredictions(clientId).catch(err =>
    logger.debug({ err }, '[LearningEngine] Background prediction verification failed')
  );

  return predictions;
}

/**
 * Full learning engine run — returns complete intelligence
 */
export async function runLearningEngine(clientId: string): Promise<LearningEngineOutput> {
  logger.info({ clientId }, '[LearningEngine] Running full analysis');

  const [guidance, playbook, predictions] = await Promise.all([
    generateCreativeGuidance(clientId),
    buildClientPlaybook(clientId),
    generatePredictions(clientId),
  ]);

  // Calculate overall quality score
  const dataQuality = Math.round(
    (playbook.winningPatterns.length * 10 +
     playbook.losingPatterns.length * 10 +
     playbook.fatiguePatterns.length * 5 +
     playbook.competitorGaps.length * 5) / 4
  );

  const output: LearningEngineOutput = {
    clientId,
    generatedAt: new Date().toISOString(),
    guidance,
    playbook,
    predictions,
    qualityScore: Math.min(dataQuality, 100),
  };

  logger.info({
    clientId,
    winningPatterns: playbook.winningPatterns.length,
    predictions: predictions.length,
    confidence: guidance.confidence,
    qualityScore: output.qualityScore,
  }, '[LearningEngine] Analysis complete');

  return output;
}
