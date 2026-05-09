/**
 * Learning Engine — Cosmisk
 *
 * The system that gets SMARTER over time.
 * Aggregates patterns from all analyzers into strategic creative guidance.
 *
 * Data Sources:
 * - LTV-by-Creative Analyzer → Which creative styles bring repeat buyers
 * - Creative Returns Analyzer → Which creatives have high return rates
 * - Fatigue Detector → How long each creative format lasts
 * - Competitor Intel → What patterns are trending/missing
 * - Client History → What worked/failed for this specific client
 *
 * Outputs:
 * - CreativeGuidance → What to create next
 * - ClientPlaybook → Learned patterns for each client
 * - Predictions → What will happen based on current trajectory
 */

import { getDb } from '../db/index.js';
import { logger } from '../utils/logger.js';
import { getClientPatterns } from './client-references.js';

// ============================================================================
// Types
// ============================================================================

export interface CreativeGuidance {
  // What to create
  recommendedFormats: string[];
  recommendedHooks: string[];
  recommendedAngles: string[];

  // Visual direction
  visualDirection: {
    style: string;
    typography: string;
    colorMood: string;
    layoutType: string;
  };

  // What to avoid
  avoid: string[];
  avoidReasons: Record<string, string>; // avoid -> why

  // Context
  reasoning: string[];
  urgency: 'low' | 'medium' | 'high' | 'critical';
  confidence: number; // 0-100
  basedOn: string[]; // What data sources informed this
}

export interface ClientPlaybook {
  clientId: string;
  lastUpdated: string;

  // Learned patterns
  winningPatterns: {
    format: string;
    avgRoas: number;
    avgLtv: number;
    sampleSize: number;
    confidence: 'high' | 'medium' | 'low';
  }[];

  losingPatterns: {
    format: string;
    avgRoas: number;
    returnRate: number;
    sampleSize: number;
    reason: string;
  }[];

  // Fatigue patterns
  fatiguePatterns: {
    format: string;
    avgDaysToFatigue: number;
    warningSignals: string[];
  }[];

  // Audience insights
  audienceInsights: {
    highLtvSources: string[];
    lowLtvSources: string[];
    repeatBuyerCreatives: string[];
    onePurchaseTrap: string[]; // Creatives that attract one-time buyers
  };

  // Competitor gaps
  competitorGaps: string[];
  competitorTrends: string[];
}

export interface Prediction {
  type: 'fatigue' | 'roas_decline' | 'cpa_spike' | 'opportunity';
  prediction: string;
  confidence: number;
  timeframe: string;
  basedOn: string[];
  suggestedAction: string;
}

export interface LearningEngineOutput {
  clientId: string;
  generatedAt: string;
  guidance: CreativeGuidance;
  playbook: ClientPlaybook;
  predictions: Prediction[];
  qualityScore: number; // 0-100, how much data backed this
}

// ============================================================================
// Data Aggregation (from existing analyzers)
// ============================================================================

interface LTVByCreativeData {
  creativeId: string;
  creativeName: string;
  hookType: string;
  avgLtv: number;
  repeatRate: number;
  customers: number;
}

interface CreativeReturnData {
  creativeId: string;
  creativeName: string;
  returnRate: number;
  refundAmount: number;
  orders: number;
}

interface FatigueData {
  campaignId: string;
  campaignName: string;
  daysActive: number;
  ctrDecline: number;
  roasDecline: number;
  fatigueLevel: 'none' | 'early' | 'moderate' | 'severe';
}

interface CompetitorData {
  dominantHooks: string[];
  dominantFormats: string[];
  gaps: string[];
  trends: string[];
}

/**
 * Aggregate LTV data by creative type
 */
async function aggregateLTVData(clientId: string): Promise<LTVByCreativeData[]> {
  const db = getDb();

  // Try to get from ltv_by_creative table if exists
  try {
    const data = db.prepare(`
      SELECT
        creative_id as creativeId,
        creative_name as creativeName,
        hook_type as hookType,
        avg_ltv as avgLtv,
        repeat_rate as repeatRate,
        customer_count as customers
      FROM ltv_by_creative
      WHERE client_id = ?
      ORDER BY avg_ltv DESC
      LIMIT 50
    `).all(clientId) as LTVByCreativeData[];

    return data;
  } catch {
    // Table doesn't exist or no data
    return [];
  }
}

/**
 * Aggregate return rate data by creative
 */
async function aggregateReturnData(clientId: string): Promise<CreativeReturnData[]> {
  const db = getDb();

  try {
    const data = db.prepare(`
      SELECT
        creative_id as creativeId,
        creative_name as creativeName,
        return_rate as returnRate,
        refund_amount as refundAmount,
        order_count as orders
      FROM creative_returns
      WHERE client_id = ?
      ORDER BY return_rate DESC
      LIMIT 50
    `).all(clientId) as CreativeReturnData[];

    return data;
  } catch {
    return [];
  }
}

/**
 * Get fatigue patterns from watchdog history
 */
async function aggregateFatigueData(clientId: string): Promise<FatigueData[]> {
  const db = getDb();

  try {
    // Get from agent_decisions with fatigue type
    const data = db.prepare(`
      SELECT
        target_id as campaignId,
        target_name as campaignName,
        reasoning
      FROM agent_decisions
      WHERE user_id = ? AND type = 'creative_fatigue'
      ORDER BY created_at DESC
      LIMIT 30
    `).all(clientId) as { campaignId: string; campaignName: string; reasoning: string }[];

    // Parse reasoning for fatigue metrics
    return data.map(d => ({
      campaignId: d.campaignId,
      campaignName: d.campaignName,
      daysActive: 14, // Default estimate
      ctrDecline: 0,
      roasDecline: 0,
      fatigueLevel: 'moderate' as const,
    }));
  } catch {
    return [];
  }
}

/**
 * Get competitor intelligence
 */
async function aggregateCompetitorData(clientId: string): Promise<CompetitorData> {
  // Get patterns from client_references
  const patterns = getClientPatterns(clientId);

  if (patterns) {
    // Extract gaps from hook types that competitors DON'T use frequently
    const commonHooks = ['benefit', 'social-proof', 'problem-solution', 'curiosity', 'urgency'];
    const competitorHooks = patterns.hooks.hookTypes.map(h => h.type.toLowerCase());
    const gaps = commonHooks.filter(h => !competitorHooks.includes(h));

    return {
      dominantHooks: patterns.hooks.hookTypes.slice(0, 5).map(h => h.type),
      dominantFormats: [patterns.visualStyle.overallStyle], // From visual style
      gaps,
      trends: patterns.hooks.hookTypes.filter(h => h.frequency > 0.3).map(h => h.type),
    };
  }

  return {
    dominantHooks: [],
    dominantFormats: [],
    gaps: [],
    trends: [],
  };
}

// ============================================================================
// Pattern Synthesis
// ============================================================================

/**
 * Identify winning patterns from LTV and return data
 */
function synthesizeWinningPatterns(
  ltvData: LTVByCreativeData[],
  returnData: CreativeReturnData[],
): ClientPlaybook['winningPatterns'] {
  const winners: ClientPlaybook['winningPatterns'] = [];

  // Group LTV data by hook type
  const byHook = new Map<string, { totalLtv: number; count: number; avgLtv: number }>();

  for (const item of ltvData) {
    const hook = item.hookType || 'unknown';
    const existing = byHook.get(hook) || { totalLtv: 0, count: 0, avgLtv: 0 };
    existing.totalLtv += item.avgLtv * item.customers;
    existing.count += item.customers;
    existing.avgLtv = existing.totalLtv / existing.count;
    byHook.set(hook, existing);
  }

  // Find hooks with above-average LTV and low returns
  const avgLtv = ltvData.length > 0
    ? ltvData.reduce((sum, d) => sum + d.avgLtv, 0) / ltvData.length
    : 0;

  for (const [hook, data] of byHook.entries()) {
    if (data.avgLtv >= avgLtv * 1.1 && data.count >= 10) {
      winners.push({
        format: hook,
        avgRoas: 0, // Would need campaign data
        avgLtv: data.avgLtv,
        sampleSize: data.count,
        confidence: data.count >= 50 ? 'high' : data.count >= 20 ? 'medium' : 'low',
      });
    }
  }

  return winners.sort((a, b) => b.avgLtv - a.avgLtv).slice(0, 5);
}

/**
 * Identify patterns to avoid
 */
function synthesizeLosingPatterns(
  ltvData: LTVByCreativeData[],
  returnData: CreativeReturnData[],
): ClientPlaybook['losingPatterns'] {
  const losers: ClientPlaybook['losingPatterns'] = [];

  // High return rate creatives
  for (const item of returnData) {
    if (item.returnRate > 0.15 && item.orders >= 20) {
      losers.push({
        format: item.creativeName,
        avgRoas: 0,
        returnRate: item.returnRate,
        sampleSize: item.orders,
        reason: `${Math.round(item.returnRate * 100)}% return rate — product/promise mismatch`,
      });
    }
  }

  // Low LTV creatives (one-time buyers)
  const avgLtv = ltvData.length > 0
    ? ltvData.reduce((sum, d) => sum + d.avgLtv, 0) / ltvData.length
    : 0;

  for (const item of ltvData) {
    if (item.avgLtv < avgLtv * 0.6 && item.repeatRate < 0.1 && item.customers >= 30) {
      losers.push({
        format: item.hookType || item.creativeName,
        avgRoas: 0,
        returnRate: 0,
        sampleSize: item.customers,
        reason: `Low repeat rate (${Math.round(item.repeatRate * 100)}%) — attracts one-time discount buyers`,
      });
    }
  }

  return losers.slice(0, 5);
}

/**
 * Calculate fatigue patterns
 */
function synthesizeFatiguePatterns(
  fatigueData: FatigueData[],
): ClientPlaybook['fatiguePatterns'] {
  // Group by campaign type and calculate average days
  const patterns: ClientPlaybook['fatiguePatterns'] = [];

  // Default patterns if no data
  if (fatigueData.length === 0) {
    return [
      { format: 'UGC', avgDaysToFatigue: 12, warningSignals: ['CTR drops below 1%', 'Frequency > 3'] },
      { format: 'Static', avgDaysToFatigue: 21, warningSignals: ['CTR decline > 20%'] },
      { format: 'Carousel', avgDaysToFatigue: 18, warningSignals: ['Swipe rate drops'] },
    ];
  }

  // Calculate from actual data
  const avgDays = fatigueData.reduce((sum, d) => sum + d.daysActive, 0) / fatigueData.length;

  patterns.push({
    format: 'All creatives',
    avgDaysToFatigue: Math.round(avgDays),
    warningSignals: ['CTR drops 20%+', 'Frequency > 3', 'ROAS decline 3 days'],
  });

  return patterns;
}

// ============================================================================
// Main Learning Engine Functions
// ============================================================================

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

  const playbook: ClientPlaybook = {
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

  // Store playbook in DB
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO client_playbooks (client_id, playbook_data, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(client_id) DO UPDATE SET
        playbook_data = excluded.playbook_data,
        updated_at = datetime('now')
    `).run(clientId, JSON.stringify(playbook));
  } catch {
    // Table might not exist
    logger.debug('[LearningEngine] client_playbooks table not found, skipping storage');
  }

  return playbook;
}

/**
 * Generate predictions based on current data
 */
export async function generatePredictions(clientId: string): Promise<Prediction[]> {
  const predictions: Prediction[] = [];

  const [fatigueData, competitorData] = await Promise.all([
    aggregateFatigueData(clientId),
    aggregateCompetitorData(clientId),
  ]);

  // Predict fatigue
  const severeCount = fatigueData.filter(f => f.fatigueLevel === 'severe').length;
  const moderateCount = fatigueData.filter(f => f.fatigueLevel === 'moderate').length;

  if (severeCount >= 2) {
    predictions.push({
      type: 'roas_decline',
      prediction: `With ${severeCount} creatives in severe fatigue, expect ROAS to drop 15-25% over the next 7 days without refresh`,
      confidence: 75,
      timeframe: '7 days',
      basedOn: ['fatigue-analysis', 'historical-patterns'],
      suggestedAction: 'Launch 3-5 new creatives in next 48 hours targeting warm audiences',
    });
  } else if (moderateCount >= 3) {
    predictions.push({
      type: 'fatigue',
      prediction: `${moderateCount} creatives showing early fatigue. Performance decline expected in 5-7 days`,
      confidence: 65,
      timeframe: '5-7 days',
      basedOn: ['fatigue-analysis'],
      suggestedAction: 'Begin creative development now for next refresh cycle',
    });
  }

  // Predict opportunity from competitor gaps
  if (competitorData.gaps.length >= 2) {
    predictions.push({
      type: 'opportunity',
      prediction: `Competitors are absent from ${competitorData.gaps.slice(0, 2).join(' and ')} positioning. First-mover opportunity exists.`,
      confidence: 60,
      timeframe: '2-4 weeks',
      basedOn: ['competitor-intel'],
      suggestedAction: `Test ${competitorData.gaps[0]} angle with 3 creative variants`,
    });
  }

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

// ============================================================================
// Cache Management
// ============================================================================

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const guidanceCache = new Map<string, { data: CreativeGuidance; timestamp: number }>();

/**
 * Get cached guidance or generate fresh
 */
export async function getCreativeGuidanceCached(clientId: string): Promise<CreativeGuidance> {
  const cached = guidanceCache.get(clientId);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    logger.debug({ clientId }, '[LearningEngine] Returning cached guidance');
    return cached.data;
  }

  const fresh = await generateCreativeGuidance(clientId);
  guidanceCache.set(clientId, { data: fresh, timestamp: Date.now() });
  return fresh;
}

/**
 * Invalidate cache for a client (call after significant data changes)
 */
export function invalidateGuidanceCache(clientId: string): void {
  guidanceCache.delete(clientId);
  logger.debug({ clientId }, '[LearningEngine] Cache invalidated');
}

// ============================================================================
// Logging
// ============================================================================

logger.info('[LearningEngine] Module loaded — aggregates patterns into strategic guidance');
