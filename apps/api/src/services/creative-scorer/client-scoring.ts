/* ------------------------------------------------------------------ */
/*  Client-aware Creative Scoring                                      */
/* ------------------------------------------------------------------ */

import {
  getClientContext, getCreativeScorerStore, updateCreativeScorerStore,
  getCreativeScoreThreshold, createRecommendation,
} from '../service-clients.js';
import { logger } from '../../utils/logger.js';
// CLOSED-LOOP OPERATING SYSTEM
import { agentRecommend } from '../recommendation-loop.js';
// STRATEGIC MEMORY - Week-to-week learning
import { recordEpisode } from '../agent-memory.js';
import { getStrategicContextForAgent, recordReport, type ReportRecord } from '../strategic-memory.js';
import { v4 as uuidv4 } from 'uuid';
import { scoreCreative } from './scorer.js';
import type { ClientCreativeScoreReport, CreativeScoreInput } from './types.js';

/**
 * Score multiple creatives for a specific client
 * - Uses client context and revenue-level thresholds
 * - Tracks scoring history in client store
 * - Identifies top performing patterns for client
 */
export async function scoreCreativesForClient(
  clientId: string,
  creatives: Array<Omit<CreativeScoreInput, 'userId'>>,
): Promise<ClientCreativeScoreReport | null> {
  const ctx = await getClientContext(clientId);
  if (!ctx) {
    logger.error({ clientId }, '[CreativeScorer Client] Client not found');
    return null;
  }

  const { client } = ctx;
  const scorerStore = await getCreativeScorerStore(clientId);

  // === STRATEGIC MEMORY: Load context from previous runs ===
  const strategicContext = await getStrategicContextForAgent(clientId);
  if (strategicContext) {
    logger.info({ contextLength: strategicContext.length }, '[CreativeScorer] Loaded strategic context');
  }

  logger.info({
    clientId,
    brandName: client.brandName,
    revenueLevel: client.revenueLevel,
    creativesCount: creatives.length,
  }, '[CreativeScorer Client] Starting scoring');

  // Get score threshold for this client
  const scoreThreshold = getCreativeScoreThreshold(client);
  logger.info({ scoreThreshold }, '[CreativeScorer Client] Using score threshold');

  // Score each creative
  const scores: ClientCreativeScoreReport['scores'] = [];
  const allPatterns: string[] = [];
  const formatCounts: Record<string, number[]> = {};

  for (const creative of creatives) {
    try {
      const input: CreativeScoreInput = {
        ...creative,
        userId: clientId, // Use clientId as userId for scoring context
      };

      const score = await scoreCreative(input);
      const meetsThreshold = score.total >= scoreThreshold;

      scores.push({ input, score, meetsThreshold });
      allPatterns.push(...score.matchedPatterns);

      // Track format performance
      if (!formatCounts[creative.format]) {
        formatCounts[creative.format] = [];
      }
      formatCounts[creative.format].push(score.total);
    } catch (err: any) {
      logger.warn({ err: err.message, format: creative.format }, '[CreativeScorer Client] Scoring failed for creative');
    }
  }

  // Calculate summary
  const totalScored = scores.length;
  const avgScore = totalScored > 0
    ? Math.round(scores.reduce((s, x) => s + x.score.total, 0) / totalScored)
    : 0;
  const aboveThreshold = scores.filter(s => s.meetsThreshold).length;
  const belowThreshold = totalScored - aboveThreshold;

  // Find top format by average score
  let topFormat = 'unknown';
  let topFormatAvg = 0;
  for (const [format, formatScores] of Object.entries(formatCounts)) {
    const avg = formatScores.reduce((s, x) => s + x, 0) / formatScores.length;
    if (avg > topFormatAvg) {
      topFormatAvg = avg;
      topFormat = format;
    }
  }

  // Find most common winning patterns
  const patternCounts = new Map<string, number>();
  for (const p of allPatterns) {
    patternCounts.set(p, (patternCounts.get(p) || 0) + 1);
  }
  const winningPatterns = [...patternCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([p]) => p);

  // Determine if we should alert (more than half below threshold)
  const shouldAlert = belowThreshold > aboveThreshold && totalScored >= 3;
  const alertReason = shouldAlert
    ? `${belowThreshold}/${totalScored} creatives below ${scoreThreshold} threshold`
    : undefined;

  logger.info({
    totalScored,
    avgScore,
    aboveThreshold,
    belowThreshold,
    shouldAlert,
  }, '[CreativeScorer Client] Scoring complete');

  // Update scorer store
  const existingAvg = scorerStore?.avgScore || 0;
  const existingCount = scorerStore?.totalCreativesScored || 0;
  const newAvg = existingCount > 0
    ? Math.round(((existingAvg * existingCount) + (avgScore * totalScored)) / (existingCount + totalScored))
    : avgScore;

  await updateCreativeScorerStore(clientId, {
    lastScoredAt: new Date().toISOString(),
    totalCreativesScored: existingCount + totalScored,
    avgScore: newAvg,
    topPerformingFormats: [topFormat, ...(scorerStore?.topPerformingFormats || [])].slice(0, 5),
    winningPatterns: [...new Set([...winningPatterns, ...(scorerStore?.winningPatterns || [])])].slice(0, 10),
    alertsSent: shouldAlert ? (scorerStore?.alertsSent || 0) + 1 : scorerStore?.alertsSent || 0,
    lastAlertAt: shouldAlert ? new Date().toISOString() : scorerStore?.lastAlertAt,
  });

  // Create recommendation if quality is low
  if (shouldAlert) {
    await createRecommendation(clientId, 'creative_scorer', 'improve_creative_quality', {
      avgScore,
      threshold: scoreThreshold,
      belowThreshold,
      topFormat,
      winningPatterns,
      insight: `${belowThreshold} creatives scored below the ${scoreThreshold} quality threshold. Focus on ${topFormat} format and patterns: ${winningPatterns.slice(0, 3).join(', ')}`,
    });

    // === CLOSED-LOOP OPERATING SYSTEM ===
    const worstCreative = scores.sort((a, b) => a.score.total - b.score.total)[0];
    if (worstCreative) {
      try {
        await agentRecommend(clientId, 'creative_scorer', {
          type: 'refresh_creative',
          entityType: 'creative',
          entityId: worstCreative.input.userId,
          entityName: `Creative ${worstCreative.input.format}`,
          action: 'Improve or replace low-scoring creatives',
          reasoning: `${belowThreshold} creatives below ${scoreThreshold} threshold. Avg score: ${avgScore}. Use ${topFormat} format and patterns: ${winningPatterns.slice(0, 3).join(', ')}`,
          evidence: [
            `${belowThreshold} creatives below threshold`,
            `Average score: ${avgScore}`,
            `Top format: ${topFormat}`,
            `Winning patterns: ${winningPatterns.slice(0, 3).join(', ')}`,
            `Worst creative: ${worstCreative.input.format} (score: ${worstCreative.score.total})`,
          ],
          confidence: 70,
          predictedSavings: 0, // Quality improvements don't have direct savings
        });
      } catch (loopErr) {
        logger.warn({ err: loopErr }, '[CreativeScorer] Closed-loop tracking failed');
      }
    }

    // === STRATEGIC MEMORY: Record episode for creative scoring alert ===
    recordEpisode(
      'system',
      'creative_strategist',
      `Creative Alert: ${belowThreshold} of ${totalScored} creatives below ${scoreThreshold} threshold for ${client.brandName}`,
      JSON.stringify({ totalScored, avgScore, belowThreshold, scoreThreshold }),
      'pending'
    ).catch(epErr => logger.warn({ err: epErr }, '[CreativeScorer] Episode recording failed'));
  }

  // === STRATEGIC MEMORY: Record report summary ===
  try {
    const now = new Date();
    const weekNumber = Math.ceil((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
    const reportRecord: ReportRecord = {
      id: uuidv4(),
      clientId,
      reportType: 'creative-scoring',
      generatedAt: now.toISOString(),
      weekNumber,
      year: now.getFullYear(),
      headline: `Creative Report: ${totalScored} scored, avg ${avgScore.toFixed(1)}, ${belowThreshold} below threshold`,
      keyInsights: [
        `Average score: ${avgScore.toFixed(1)}`,
        `Above threshold (${scoreThreshold}): ${aboveThreshold}`,
        `Below threshold: ${belowThreshold}`,
      ],
      recommendations: shouldAlert ? [`Replace ${belowThreshold} low-scoring creatives`] : [],
      metricsSnapshot: {
        totalScored,
        avgScore,
        aboveThreshold,
        belowThreshold,
        scoreThreshold
      },
      qualityScore: 80,
      wasShipped: shouldAlert,
      shipDecision: shouldAlert ? 'SHIP' : 'HOLD',
      deliveredVia: [],
    };
    await recordReport(reportRecord);
  } catch (repErr) {
    logger.warn({ err: repErr }, '[CreativeScorer] Report recording failed');
  }

  return {
    clientId,
    clientName: client.brandName,
    revenueLevel: client.revenueLevel || 'unknown',
    scoreThreshold,
    scores,
    summary: {
      totalScored,
      avgScore,
      aboveThreshold,
      belowThreshold,
      topFormat,
      winningPatterns,
    },
    shouldAlert,
    alertReason,
    scoredAt: new Date().toISOString(),
  };
}
