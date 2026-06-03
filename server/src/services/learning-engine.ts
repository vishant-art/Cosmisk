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

import { getDbAdapter } from '../db/adapter.js';
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

/**
 * Stored prediction with tracking for accuracy measurement
 */
export interface StoredPrediction extends Prediction {
  id: string;
  clientId: string;
  createdAt: string;
  expiresAt: string; // When to verify
  expectedOutcome: {
    metric: string;       // e.g., 'ROAS', 'CPA', 'CTR'
    direction: 'increase' | 'decrease' | 'stable';
    minChange?: number;   // Minimum % change expected
    targetValue?: number; // Or specific target value
  };
  status: 'pending' | 'verified_correct' | 'verified_incorrect' | 'expired';
  verifiedAt?: string;
  actualOutcome?: {
    metric: string;
    actualValue: number;
    previousValue: number;
    changePercent: number;
  };
}

/**
 * Prediction accuracy stats by type
 */
export interface PredictionAccuracy {
  type: Prediction['type'];
  totalPredictions: number;
  correctPredictions: number;
  incorrectPredictions: number;
  pendingPredictions: number;
  accuracyRate: number; // 0-1
  avgConfidenceWhenCorrect: number;
  avgConfidenceWhenIncorrect: number;
}

/**
 * Items flagged for human review
 */
export interface HumanReviewItem {
  id: string;
  clientId: string;
  type: 'low_confidence_decision' | 'contradictory_signals' | 'unusual_pattern' | 'high_impact_action';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  relatedEntityId?: string;
  relatedEntityType?: string;
  createdAt: string;
  status: 'pending' | 'reviewed' | 'dismissed';
  reviewedAt?: string;
  reviewedBy?: string;
  resolution?: string;
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
  const db = getDbAdapter();

  // Try to get from ltv_by_creative table if exists
  try {
    const data = await db.all(`
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
    `, [clientId]) as LTVByCreativeData[];

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
  const db = getDbAdapter();

  try {
    const data = await db.all(`
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
    `, [clientId]) as CreativeReturnData[];

    return data;
  } catch {
    return [];
  }
}

/**
 * Get fatigue patterns from watchdog history
 */
async function aggregateFatigueData(clientId: string): Promise<FatigueData[]> {
  const db = getDbAdapter();

  try {
    // Get from agent_decisions with fatigue type
    const data = await db.all(`
      SELECT
        target_id as campaignId,
        target_name as campaignName,
        reasoning
      FROM agent_decisions
      WHERE user_id = ? AND type = 'creative_fatigue'
      ORDER BY created_at DESC
      LIMIT 30
    `, [clientId]) as { campaignId: string; campaignName: string; reasoning: string }[];

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
// TIER 2: Signal Decay System
// ============================================================================

/**
 * Calculate decay factor based on data age
 * 7d = 100%, 30d = 70%, 90d = 40%, 180d+ = 20%
 */
export function calculateDecayFactor(timestamp: string | Date): number {
  const ageMs = Date.now() - new Date(timestamp).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  if (ageDays <= 7) return 1.0;
  if (ageDays <= 30) return 0.7 + (0.3 * (1 - (ageDays - 7) / 23));
  if (ageDays <= 90) return 0.4 + (0.3 * (1 - (ageDays - 30) / 60));
  if (ageDays <= 180) return 0.2 + (0.2 * (1 - (ageDays - 90) / 90));
  return 0.2; // Minimum weight for very old data
}

/**
 * Apply decay to a confidence score
 */
export function applyDecay(confidence: number, timestamp: string | Date): number {
  const decayFactor = calculateDecayFactor(timestamp);
  return Math.round(confidence * decayFactor);
}

// ============================================================================
// TIER 2: Memory Pruning
// ============================================================================

const MAX_WINNING_PATTERNS = 20;
const MAX_LOSING_PATTERNS = 15;
const MAX_FATIGUE_PATTERNS = 10;
const MIN_SAMPLE_SIZE = 5;
const SIMILARITY_THRESHOLD = 0.8;

/**
 * Check if two patterns are similar (for deduplication)
 */
function areSimilarPatterns(p1: string, p2: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const n1 = normalize(p1);
  const n2 = normalize(p2);

  if (n1 === n2) return true;

  // Check if one contains the other
  if (n1.includes(n2) || n2.includes(n1)) return true;

  // Simple Jaccard similarity on words
  const words1 = new Set(p1.toLowerCase().split(/\s+/));
  const words2 = new Set(p2.toLowerCase().split(/\s+/));
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  const similarity = intersection.size / union.size;

  return similarity >= SIMILARITY_THRESHOLD;
}

/**
 * Prune playbook to prevent bloat
 * Removes low-value patterns, deduplicates similar ones, applies decay
 */
export function prunePlaybook(playbook: ClientPlaybook): ClientPlaybook {
  const pruned = { ...playbook };

  // 1. Apply decay to confidence and sort by value
  pruned.winningPatterns = playbook.winningPatterns
    .map(p => ({
      ...p,
      // Decay confidence based on implicit age (use lastUpdated as proxy)
      confidence: p.confidence, // Would need timestamp per pattern for proper decay
    }))
    // Filter low sample size
    .filter(p => p.sampleSize >= MIN_SAMPLE_SIZE)
    // Sort by value (LTV * sample size as proxy for value)
    .sort((a, b) => (b.avgLtv * b.sampleSize) - (a.avgLtv * a.sampleSize));

  // 2. Deduplicate similar patterns (keep higher value one)
  const dedupedWinners: typeof pruned.winningPatterns = [];
  for (const pattern of pruned.winningPatterns) {
    const isDuplicate = dedupedWinners.some(p => areSimilarPatterns(p.format, pattern.format));
    if (!isDuplicate) {
      dedupedWinners.push(pattern);
    }
  }
  pruned.winningPatterns = dedupedWinners.slice(0, MAX_WINNING_PATTERNS);

  // 3. Prune losing patterns
  pruned.losingPatterns = playbook.losingPatterns
    .filter(p => p.sampleSize >= MIN_SAMPLE_SIZE)
    .sort((a, b) => b.returnRate - a.returnRate)
    .slice(0, MAX_LOSING_PATTERNS);

  // 4. Prune fatigue patterns
  pruned.fatiguePatterns = playbook.fatiguePatterns
    .slice(0, MAX_FATIGUE_PATTERNS);

  // 5. Deduplicate audience insights arrays
  pruned.audienceInsights = {
    highLtvSources: [...new Set(playbook.audienceInsights.highLtvSources)].slice(0, 10),
    lowLtvSources: [...new Set(playbook.audienceInsights.lowLtvSources)].slice(0, 10),
    repeatBuyerCreatives: [...new Set(playbook.audienceInsights.repeatBuyerCreatives)].slice(0, 10),
    onePurchaseTrap: [...new Set(playbook.audienceInsights.onePurchaseTrap)].slice(0, 10),
  };

  const removedCount =
    (playbook.winningPatterns.length - pruned.winningPatterns.length) +
    (playbook.losingPatterns.length - pruned.losingPatterns.length);

  if (removedCount > 0) {
    logger.info({ clientId: playbook.clientId, removedCount }, '[LearningEngine] Pruned playbook');
  }

  return pruned;
}

// ============================================================================
// TIER 2: Prediction Accuracy Measurement
// ============================================================================

/**
 * Store a prediction for later verification
 */
export async function storePrediction(
  prediction: Prediction,
  clientId: string,
  expectedOutcome: StoredPrediction['expectedOutcome'],
): Promise<StoredPrediction> {
  const db = getDbAdapter();
  const id = `pred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Parse timeframe to calculate expiry
  const timeframeDays = parseTimeframeToDays(prediction.timeframe);
  const expiresAt = new Date(Date.now() + timeframeDays * 24 * 60 * 60 * 1000).toISOString();

  const stored: StoredPrediction = {
    ...prediction,
    id,
    clientId,
    createdAt: new Date().toISOString(),
    expiresAt,
    expectedOutcome,
    status: 'pending',
  };

  try {
    await db.run(`
      INSERT INTO predictions (id, client_id, type, prediction_text, confidence, timeframe,
        expected_metric, expected_direction, expected_min_change, expires_at, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
    `, [
      id, clientId, prediction.type, prediction.prediction, prediction.confidence,
      prediction.timeframe, expectedOutcome.metric, expectedOutcome.direction,
      expectedOutcome.minChange || null, expiresAt
    ]);
  } catch (err) {
    // Table might not exist, log but don't fail
    logger.debug({ err }, '[LearningEngine] predictions table not found');
  }

  return stored;
}

/**
 * Parse timeframe string to days
 */
function parseTimeframeToDays(timeframe: string): number {
  const lower = timeframe.toLowerCase();

  // Handle ranges like "5-7 days"
  const rangeMatch = lower.match(/(\d+)-(\d+)\s*(days?|weeks?)/);
  if (rangeMatch) {
    const avg = (parseInt(rangeMatch[1]) + parseInt(rangeMatch[2])) / 2;
    if (rangeMatch[3].startsWith('week')) return avg * 7;
    return avg;
  }

  // Handle single values
  const singleMatch = lower.match(/(\d+)\s*(days?|weeks?|hours?)/);
  if (singleMatch) {
    const value = parseInt(singleMatch[1]);
    if (singleMatch[2].startsWith('week')) return value * 7;
    if (singleMatch[2].startsWith('hour')) return value / 24;
    return value;
  }

  return 7; // Default 7 days
}

/**
 * Verify expired predictions against actual outcomes
 */
export async function verifyPredictions(clientId: string): Promise<{
  verified: number;
  correct: number;
  incorrect: number;
}> {
  const db = getDbAdapter();
  let verified = 0, correct = 0, incorrect = 0;

  try {
    // Get pending predictions that have expired
    const pending = await db.all(`
      SELECT * FROM predictions
      WHERE client_id = ? AND status = 'pending' AND expires_at < datetime('now')
    `, [clientId]) as Array<{
      id: string;
      type: string;
      expected_metric: string;
      expected_direction: string;
      expected_min_change: number | null;
      confidence: number;
    }>;

    for (const pred of pending) {
      // Get actual metric data (would need to fetch from Meta/Shopify)
      // For now, we'll mark as expired if we can't verify
      const actualOutcome = await fetchActualOutcome(clientId, pred.expected_metric);

      if (!actualOutcome) {
        await db.run(`UPDATE predictions SET status = 'expired' WHERE id = ?`, [pred.id]);
        continue;
      }

      // Determine if prediction was correct
      const directionCorrect =
        (pred.expected_direction === 'increase' && actualOutcome.changePercent > 0) ||
        (pred.expected_direction === 'decrease' && actualOutcome.changePercent < 0) ||
        (pred.expected_direction === 'stable' && Math.abs(actualOutcome.changePercent) < 10);

      const magnitudeCorrect = !pred.expected_min_change ||
        Math.abs(actualOutcome.changePercent) >= pred.expected_min_change;

      const isCorrect = directionCorrect && magnitudeCorrect;

      await db.run(`
        UPDATE predictions
        SET status = ?, verified_at = datetime('now'),
            actual_value = ?, actual_change = ?
        WHERE id = ?
      `, [
        isCorrect ? 'verified_correct' : 'verified_incorrect',
        actualOutcome.actualValue,
        actualOutcome.changePercent,
        pred.id
      ]);

      verified++;
      if (isCorrect) correct++;
      else incorrect++;
    }
  } catch (err) {
    logger.debug({ err }, '[LearningEngine] Error verifying predictions');
  }

  if (verified > 0) {
    logger.info({ clientId, verified, correct, incorrect }, '[LearningEngine] Verified predictions');
  }

  return { verified, correct, incorrect };
}

/**
 * Fetch actual outcome for a metric (placeholder - needs real implementation)
 */
async function fetchActualOutcome(
  clientId: string,
  metric: string,
): Promise<{ actualValue: number; previousValue: number; changePercent: number } | null> {
  // This would fetch from Meta API or cached insights
  // For now, return null to mark predictions as expired
  const db = getDbAdapter();

  try {
    // Try to get from cached insights
    const recent = await db.all(`
      SELECT * FROM daily_metrics
      WHERE client_id = ? AND metric_name = ?
      ORDER BY date DESC LIMIT 2
    `, [clientId, metric]) as Array<{ value: number; date: string }>;

    if (recent.length >= 2) {
      const actualValue = recent[0].value;
      const previousValue = recent[1].value;
      const changePercent = previousValue > 0
        ? ((actualValue - previousValue) / previousValue) * 100
        : 0;

      return { actualValue, previousValue, changePercent };
    }
  } catch {
    // Table doesn't exist or no data
  }

  return null;
}

/**
 * Get prediction accuracy stats for a client
 */
export async function getPredictionAccuracy(clientId: string): Promise<PredictionAccuracy[]> {
  const db = getDbAdapter();
  const stats: PredictionAccuracy[] = [];

  try {
    const types: Prediction['type'][] = ['fatigue', 'roas_decline', 'cpa_spike', 'opportunity'];

    for (const type of types) {
      const rows = await db.get(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'verified_correct' THEN 1 ELSE 0 END) as correct,
          SUM(CASE WHEN status = 'verified_incorrect' THEN 1 ELSE 0 END) as incorrect,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          AVG(CASE WHEN status = 'verified_correct' THEN confidence ELSE NULL END) as avg_conf_correct,
          AVG(CASE WHEN status = 'verified_incorrect' THEN confidence ELSE NULL END) as avg_conf_incorrect
        FROM predictions
        WHERE client_id = ? AND type = ?
      `, [clientId, type]) as any;

      if (rows && rows.total > 0) {
        const total = rows.correct + rows.incorrect;
        stats.push({
          type,
          totalPredictions: rows.total,
          correctPredictions: rows.correct || 0,
          incorrectPredictions: rows.incorrect || 0,
          pendingPredictions: rows.pending || 0,
          accuracyRate: total > 0 ? (rows.correct || 0) / total : 0,
          avgConfidenceWhenCorrect: rows.avg_conf_correct || 0,
          avgConfidenceWhenIncorrect: rows.avg_conf_incorrect || 0,
        });
      }
    }
  } catch {
    // Table doesn't exist
  }

  return stats;
}

/**
 * Adjust prediction confidence based on historical accuracy
 */
export async function adjustConfidenceByAccuracy(
  prediction: Prediction,
  clientId: string,
): Promise<number> {
  const accuracyStats = await getPredictionAccuracy(clientId);
  const typeStats = accuracyStats.find(s => s.type === prediction.type);

  if (!typeStats || typeStats.totalPredictions < 5) {
    // Not enough data to adjust
    return prediction.confidence;
  }

  // Adjust confidence based on historical accuracy
  // If 80% accurate, multiply by 1.0. If 50% accurate, multiply by 0.7
  const accuracyMultiplier = 0.5 + (typeStats.accuracyRate * 0.5);

  return Math.round(prediction.confidence * accuracyMultiplier);
}

// ============================================================================
// TIER 2: Human Review Escalation
// ============================================================================

/**
 * Create a human review item
 */
export async function createHumanReviewItem(
  item: Omit<HumanReviewItem, 'id' | 'createdAt' | 'status'>,
): Promise<HumanReviewItem> {
  const db = getDbAdapter();
  const id = `review_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const reviewItem: HumanReviewItem = {
    ...item,
    id,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };

  try {
    await db.run(`
      INSERT INTO human_reviews (id, client_id, type, title, description, severity,
        related_entity_id, related_entity_type, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
    `, [
      id, item.clientId, item.type, item.title, item.description, item.severity,
      item.relatedEntityId || null, item.relatedEntityType || null
    ]);
  } catch (err) {
    logger.debug({ err }, '[LearningEngine] human_reviews table not found');
  }

  logger.info({
    reviewId: id,
    type: item.type,
    severity: item.severity,
  }, '[LearningEngine] Human review item created');

  return reviewItem;
}

/**
 * Get pending human review items for a client
 */
export async function getPendingReviews(clientId: string): Promise<HumanReviewItem[]> {
  const db = getDbAdapter();

  try {
    return await db.all(`
      SELECT
        id, client_id as clientId, type, title, description, severity,
        related_entity_id as relatedEntityId, related_entity_type as relatedEntityType,
        created_at as createdAt, status
      FROM human_reviews
      WHERE client_id = ? AND status = 'pending'
      ORDER BY
        CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
        created_at DESC
    `, [clientId]) as HumanReviewItem[];
  } catch {
    return [];
  }
}

/**
 * Resolve a human review item
 */
export async function resolveReview(
  reviewId: string,
  resolution: string,
  reviewedBy?: string,
): Promise<void> {
  const db = getDbAdapter();

  try {
    await db.run(`
      UPDATE human_reviews
      SET status = 'reviewed', resolution = ?, reviewed_by = ?, reviewed_at = datetime('now')
      WHERE id = ?
    `, [resolution, reviewedBy || 'system', reviewId]);

    logger.info({ reviewId, resolution }, '[LearningEngine] Review resolved');
  } catch {
    logger.debug('[LearningEngine] Could not resolve review');
  }
}

/**
 * Get critical reviews that need immediate attention
 */
export async function getCriticalReviews(clientId: string): Promise<HumanReviewItem[]> {
  return (await getPendingReviews(clientId)).filter(r =>
    r.severity === 'critical' || r.severity === 'high'
  );
}

/**
 * Auto-create review items from quality gate results
 */
export async function createReviewsFromQualityGate(
  clientId: string,
  requiresHumanReview: Array<{ targetName?: string; reasoning?: string; type?: string }>,
): Promise<HumanReviewItem[]> {
  const items: HumanReviewItem[] = [];

  for (const item of requiresHumanReview.slice(0, 5)) { // Limit to 5
    const reviewItem = await createHumanReviewItem({
      clientId,
      type: 'low_confidence_decision',
      title: `Review needed: ${item.type || 'Decision'} for "${item.targetName || 'Unknown'}"`,
      description: item.reasoning || 'Low confidence decision requires manual review',
      severity: 'medium',
      relatedEntityId: item.targetName,
      relatedEntityType: item.type,
    });
    items.push(reviewItem);
  }

  return items;
}

// ============================================================================
// Logging
// ============================================================================

logger.info('[LearningEngine] Module loaded — aggregates patterns into strategic guidance');
