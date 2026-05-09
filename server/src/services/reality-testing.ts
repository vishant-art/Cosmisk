/**
 * Reality Testing Phase — Cosmisk
 *
 * Validates that intelligence actually works in the real world.
 * Not building impressive AI demos — creating systems that genuinely
 * improve how elite D2C operators think and execute.
 *
 * Core Risk: "Reality failure instead of architecture failure."
 *
 * Contains:
 * 1. Intelligence Validation — Measure actual usefulness
 * 2. Fake Intelligence Detection — Catch useless/obvious/repetitive outputs
 * 3. Human Feedback Loops — Learn from operator corrections
 * 4. Operator Behavior Learning — Adapt to how operators actually work
 * 5. Deployment Risk Mitigation — Handle trust calibration issues
 */

import { logger } from '../utils/logger.js';

// ============================================================================
// 1. INTELLIGENCE VALIDATION SYSTEMS
// ============================================================================

/**
 * Metrics we track to validate intelligence quality
 */
export interface IntelligenceMetrics {
  clientId: string;
  period: string;  // "2024-01", "2024-W15", etc.
  generatedAt: string;

  // Core metrics
  recommendationUsefulness: number;     // 0-100, based on operator ratings
  strategicAccuracy: number;            // 0-100, predictions that came true
  operatorTrust: number;                // 0-100, explicit trust signals
  wowFactorScore: number;               // 0-100, insights marked as "non-obvious"
  insightUniqueness: number;            // 0-100, not available elsewhere
  predictionUsefulness: number;         // 0-100, predictions that led to action
  executionLeverage: number;            // 0-100, time saved / value created
  decisionQualityImprovement: number;   // 0-100, before/after comparison

  // Behavioral metrics
  insightAdoptionRate: number;          // % of insights acted upon
  recommendationFollowThrough: number;  // % of recommendations completed
  decisionSpeedImprovement: number;     // % faster decisions
  creativeHitRateImprovement: number;   // % better creative performance

  // Engagement metrics
  sessionFrequency: number;             // Sessions per week
  timeInPlatform: number;               // Minutes per session
  featureUsageDepth: number;            // Features used / features available
  returnAfterInsight: number;           // % return within 24h of insight

  // Overall health
  overallScore: number;
  trend: 'improving' | 'stable' | 'declining';
  riskFlags: string[];
}

/**
 * A single recommendation with tracking
 */
export interface TrackedRecommendation {
  id: string;
  clientId: string;
  createdAt: string;

  // The recommendation
  type: string;
  headline: string;
  recommendation: string;
  confidence: number;
  urgency: string;

  // Tracking
  wasViewed: boolean;
  viewedAt?: string;
  wasActedUpon?: boolean;
  actedUponAt?: string;
  actionTaken?: string;

  // Outcome
  outcomeTracked?: boolean;
  outcomePositive?: boolean;
  outcomeNotes?: string;

  // Operator feedback
  operatorRating?: 1 | 2 | 3 | 4 | 5;
  operatorFeedback?: string;
  markedAsObvious?: boolean;
  markedAsUseless?: boolean;
  markedAsNonObvious?: boolean;

  // Validation
  validatedAt?: string;
  validationScore?: number;
}

/**
 * In-memory stores (would be DB in production)
 */
const recommendationStore = new Map<string, TrackedRecommendation[]>();
const metricsStore = new Map<string, IntelligenceMetrics[]>();

/**
 * Track a recommendation for validation
 */
export function trackRecommendation(
  clientId: string,
  type: string,
  headline: string,
  recommendation: string,
  confidence: number,
  urgency: string
): TrackedRecommendation {
  const tracked: TrackedRecommendation = {
    id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    clientId,
    createdAt: new Date().toISOString(),
    type,
    headline,
    recommendation,
    confidence,
    urgency,
    wasViewed: false,
  };

  const existing = recommendationStore.get(clientId) || [];
  existing.push(tracked);
  recommendationStore.set(clientId, existing);

  logger.debug({ recId: tracked.id, type }, '[Reality] Recommendation tracked');

  return tracked;
}

/**
 * Record that a recommendation was viewed
 */
export function recordView(recommendationId: string): void {
  for (const [_, recs] of recommendationStore) {
    const rec = recs.find(r => r.id === recommendationId);
    if (rec) {
      rec.wasViewed = true;
      rec.viewedAt = new Date().toISOString();
      logger.debug({ recId: recommendationId }, '[Reality] View recorded');
      return;
    }
  }
}

/**
 * Record that a recommendation was acted upon
 */
export function recordAction(
  recommendationId: string,
  actionTaken: string
): void {
  for (const [_, recs] of recommendationStore) {
    const rec = recs.find(r => r.id === recommendationId);
    if (rec) {
      rec.wasActedUpon = true;
      rec.actedUponAt = new Date().toISOString();
      rec.actionTaken = actionTaken;
      logger.debug({ recId: recommendationId, action: actionTaken }, '[Reality] Action recorded');
      return;
    }
  }
}

/**
 * Record the outcome of a recommendation
 */
export function recordOutcome(
  recommendationId: string,
  positive: boolean,
  notes?: string
): void {
  for (const [_, recs] of recommendationStore) {
    const rec = recs.find(r => r.id === recommendationId);
    if (rec) {
      rec.outcomeTracked = true;
      rec.outcomePositive = positive;
      rec.outcomeNotes = notes;
      logger.debug({ recId: recommendationId, positive }, '[Reality] Outcome recorded');
      return;
    }
  }
}

/**
 * Calculate intelligence metrics for a client
 */
export function calculateIntelligenceMetrics(
  clientId: string,
  period: string
): IntelligenceMetrics {
  const recs = recommendationStore.get(clientId) || [];
  const periodRecs = filterByPeriod(recs, period);

  // Calculate core metrics
  const viewed = periodRecs.filter(r => r.wasViewed);
  const actedUpon = periodRecs.filter(r => r.wasActedUpon);
  const withOutcome = periodRecs.filter(r => r.outcomeTracked);
  const positive = withOutcome.filter(r => r.outcomePositive);
  const rated = periodRecs.filter(r => r.operatorRating !== undefined);
  const nonObvious = periodRecs.filter(r => r.markedAsNonObvious);

  // Recommendation usefulness (average rating)
  const avgRating = rated.length > 0
    ? rated.reduce((sum, r) => sum + (r.operatorRating || 3), 0) / rated.length
    : 3;
  const recommendationUsefulness = Math.round((avgRating / 5) * 100);

  // Strategic accuracy (positive outcomes / tracked outcomes)
  const strategicAccuracy = withOutcome.length > 0
    ? Math.round((positive.length / withOutcome.length) * 100)
    : 50;

  // Insight adoption rate (acted upon / viewed)
  const insightAdoptionRate = viewed.length > 0
    ? Math.round((actedUpon.length / viewed.length) * 100)
    : 0;

  // Wow factor (non-obvious / total)
  const wowFactorScore = periodRecs.length > 0
    ? Math.round((nonObvious.length / periodRecs.length) * 100)
    : 50;

  // Calculate overall score
  const overallScore = Math.round(
    (recommendationUsefulness * 0.25) +
    (strategicAccuracy * 0.25) +
    (insightAdoptionRate * 0.25) +
    (wowFactorScore * 0.25)
  );

  // Detect risk flags
  const riskFlags: string[] = [];
  if (insightAdoptionRate < 20) riskFlags.push('Low adoption — insights may not be actionable');
  if (strategicAccuracy < 50) riskFlags.push('Low accuracy — predictions need calibration');
  if (wowFactorScore < 30) riskFlags.push('Low wow factor — insights may be too obvious');
  if (viewed.length < periodRecs.length * 0.5) riskFlags.push('Low engagement — insights not being seen');

  // Determine trend (would compare to previous period)
  const trend: IntelligenceMetrics['trend'] = 'stable';

  const metrics: IntelligenceMetrics = {
    clientId,
    period,
    generatedAt: new Date().toISOString(),
    recommendationUsefulness,
    strategicAccuracy,
    operatorTrust: calculateTrustScore(periodRecs),
    wowFactorScore,
    insightUniqueness: 70,  // Would be calculated from comparison
    predictionUsefulness: strategicAccuracy,
    executionLeverage: calculateExecutionLeverage(actedUpon),
    decisionQualityImprovement: strategicAccuracy,
    insightAdoptionRate,
    recommendationFollowThrough: insightAdoptionRate,
    decisionSpeedImprovement: 0,  // Would need timing data
    creativeHitRateImprovement: 0,  // Would need creative performance data
    sessionFrequency: 0,
    timeInPlatform: 0,
    featureUsageDepth: 0,
    returnAfterInsight: 0,
    overallScore,
    trend,
    riskFlags,
  };

  // Store metrics
  const existing = metricsStore.get(clientId) || [];
  existing.push(metrics);
  metricsStore.set(clientId, existing);

  return metrics;
}

/**
 * Filter recommendations by period
 */
function filterByPeriod(recs: TrackedRecommendation[], period: string): TrackedRecommendation[] {
  // Simple period filtering (would be more sophisticated)
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  return recs.filter(r => new Date(r.createdAt) > thirtyDaysAgo);
}

/**
 * Calculate trust score from recommendations
 */
function calculateTrustScore(recs: TrackedRecommendation[]): number {
  if (recs.length === 0) return 50;

  let score = 50;

  // Positive ratings increase trust
  const highRated = recs.filter(r => (r.operatorRating || 0) >= 4);
  score += (highRated.length / recs.length) * 25;

  // Actions taken increase trust
  const actedUpon = recs.filter(r => r.wasActedUpon);
  score += (actedUpon.length / recs.length) * 15;

  // Positive outcomes increase trust
  const positive = recs.filter(r => r.outcomePositive);
  const tracked = recs.filter(r => r.outcomeTracked);
  if (tracked.length > 0) {
    score += (positive.length / tracked.length) * 10;
  }

  return Math.min(Math.round(score), 100);
}

/**
 * Calculate execution leverage
 */
function calculateExecutionLeverage(actedUpon: TrackedRecommendation[]): number {
  if (actedUpon.length === 0) return 50;

  // Based on positive outcomes from acted recommendations
  const positive = actedUpon.filter(r => r.outcomePositive);
  return Math.round((positive.length / actedUpon.length) * 100);
}

// ============================================================================
// 2. FAKE INTELLIGENCE DETECTION
// ============================================================================

/**
 * Fake intelligence indicators
 */
export interface FakeIntelligenceAlert {
  id: string;
  clientId: string;
  detectedAt: string;

  // What we detected
  alertType: FakeIntelligenceType;
  severity: 'warning' | 'critical';
  description: string;

  // Evidence
  indicators: string[];
  affectedInsights: string[];

  // Remediation
  suggestedAction: string;
  autoAction?: string;
}

export type FakeIntelligenceType =
  | 'sounds_smart_useless'
  | 'too_obvious'
  | 'repetitive'
  | 'generic_predictions'
  | 'fluff_narratives'
  | 'no_action_taken';

/**
 * Detection patterns for fake intelligence
 */
interface FakeIntelligencePattern {
  type: FakeIntelligenceType;
  detect: (context: FakeIntelligenceContext) => boolean;
  severity: 'warning' | 'critical';
  description: string;
  suggestedAction: string;
}

interface FakeIntelligenceContext {
  clientId: string;
  recentRecommendations: TrackedRecommendation[];
  metrics?: IntelligenceMetrics;
  recentInsightTexts?: string[];
}

const FAKE_INTELLIGENCE_PATTERNS: FakeIntelligencePattern[] = [
  {
    type: 'sounds_smart_useless',
    detect: (ctx) => {
      // High view rate but low action rate = sounds smart but useless
      const viewed = ctx.recentRecommendations.filter(r => r.wasViewed);
      const actedUpon = ctx.recentRecommendations.filter(r => r.wasActedUpon);
      if (viewed.length < 5) return false;
      const actionRate = actedUpon.length / viewed.length;
      return actionRate < 0.15;  // Less than 15% acted upon
    },
    severity: 'critical',
    description: 'Insights are being viewed but not acted upon. They may sound smart but lack actionable value.',
    suggestedAction: 'Review insight format. Focus on specific, actionable recommendations with clear next steps.',
  },
  {
    type: 'too_obvious',
    detect: (ctx) => {
      // Many marked as obvious
      const obviousCount = ctx.recentRecommendations.filter(r => r.markedAsObvious).length;
      if (ctx.recentRecommendations.length < 5) return false;
      return (obviousCount / ctx.recentRecommendations.length) > 0.3;
    },
    severity: 'warning',
    description: 'Over 30% of insights are being marked as obvious. The system may be stating what operators already know.',
    suggestedAction: 'Increase insight threshold. Filter out patterns that experienced media buyers would already know.',
  },
  {
    type: 'repetitive',
    detect: (ctx) => {
      if (!ctx.recentInsightTexts || ctx.recentInsightTexts.length < 5) return false;

      // Check for repetitive patterns
      const uniqueStarts = new Set(
        ctx.recentInsightTexts.map(t => t.slice(0, 50).toLowerCase())
      );
      const repetitionRate = 1 - (uniqueStarts.size / ctx.recentInsightTexts.length);
      return repetitionRate > 0.4;  // Over 40% similar starts
    },
    severity: 'warning',
    description: 'Insights are becoming repetitive. Same patterns appearing too frequently.',
    suggestedAction: 'Implement insight deduplication. Track what\'s been shown and vary recommendations.',
  },
  {
    type: 'generic_predictions',
    detect: (ctx) => {
      // Low confidence scores across the board
      const avgConfidence = ctx.recentRecommendations.reduce(
        (sum, r) => sum + r.confidence, 0
      ) / ctx.recentRecommendations.length;
      return avgConfidence < 50 && ctx.recentRecommendations.length >= 5;
    },
    severity: 'warning',
    description: 'Predictions are too generic. Low confidence across recommendations suggests hedging.',
    suggestedAction: 'Require minimum confidence threshold. Only surface predictions with strong signals.',
  },
  {
    type: 'fluff_narratives',
    detect: (ctx) => {
      // Low usefulness ratings
      const rated = ctx.recentRecommendations.filter(r => r.operatorRating !== undefined);
      if (rated.length < 3) return false;
      const avgRating = rated.reduce((sum, r) => sum + (r.operatorRating || 3), 0) / rated.length;
      return avgRating < 2.5;
    },
    severity: 'critical',
    description: 'Narratives rated poorly by operators. Content may be fluffy without substance.',
    suggestedAction: 'Review narrative templates. Ensure every insight has concrete data and specific actions.',
  },
  {
    type: 'no_action_taken',
    detect: (ctx) => {
      // Very low action rate overall
      if (ctx.recentRecommendations.length < 10) return false;
      const actedUpon = ctx.recentRecommendations.filter(r => r.wasActedUpon);
      return (actedUpon.length / ctx.recentRecommendations.length) < 0.1;
    },
    severity: 'critical',
    description: 'Operators have stopped taking action on recommendations. System may have lost credibility.',
    suggestedAction: 'Urgent: Review recent recommendations for quality. Consider operator feedback session.',
  },
];

/**
 * Detect fake intelligence in recent outputs
 */
export function detectFakeIntelligence(
  clientId: string,
  recentRecommendations: TrackedRecommendation[],
  metrics?: IntelligenceMetrics,
  recentInsightTexts?: string[]
): FakeIntelligenceAlert[] {
  const alerts: FakeIntelligenceAlert[] = [];

  const context: FakeIntelligenceContext = {
    clientId,
    recentRecommendations,
    metrics,
    recentInsightTexts,
  };

  for (const pattern of FAKE_INTELLIGENCE_PATTERNS) {
    try {
      if (pattern.detect(context)) {
        alerts.push({
          id: `fake_${Date.now()}_${pattern.type}`,
          clientId,
          detectedAt: new Date().toISOString(),
          alertType: pattern.type,
          severity: pattern.severity,
          description: pattern.description,
          indicators: extractIndicators(context, pattern.type),
          affectedInsights: recentRecommendations.slice(0, 5).map(r => r.id),
          suggestedAction: pattern.suggestedAction,
        });

        logger.warn({ clientId, type: pattern.type }, '[Reality] Fake intelligence detected');
      }
    } catch (err) {
      logger.debug({ pattern: pattern.type, err }, '[Reality] Pattern detection failed');
    }
  }

  return alerts;
}

/**
 * Extract indicators for a fake intelligence type
 */
function extractIndicators(
  context: FakeIntelligenceContext,
  type: FakeIntelligenceType
): string[] {
  const indicators: string[] = [];

  switch (type) {
    case 'sounds_smart_useless': {
      const viewed = context.recentRecommendations.filter(r => r.wasViewed).length;
      const actedUpon = context.recentRecommendations.filter(r => r.wasActedUpon).length;
      indicators.push(`${viewed} viewed, only ${actedUpon} acted upon`);
      indicators.push(`Action rate: ${((actedUpon / viewed) * 100).toFixed(1)}%`);
      break;
    }
    case 'too_obvious': {
      const obvious = context.recentRecommendations.filter(r => r.markedAsObvious).length;
      indicators.push(`${obvious}/${context.recentRecommendations.length} marked obvious`);
      break;
    }
    case 'repetitive': {
      indicators.push('Similar insight patterns detected');
      indicators.push('Variation score below threshold');
      break;
    }
    case 'generic_predictions': {
      const avgConf = context.recentRecommendations.reduce((s, r) => s + r.confidence, 0)
        / context.recentRecommendations.length;
      indicators.push(`Average confidence: ${avgConf.toFixed(1)}%`);
      break;
    }
    case 'fluff_narratives': {
      const rated = context.recentRecommendations.filter(r => r.operatorRating);
      const avgRating = rated.reduce((s, r) => s + (r.operatorRating || 0), 0) / rated.length;
      indicators.push(`Average rating: ${avgRating.toFixed(1)}/5`);
      break;
    }
    case 'no_action_taken': {
      const actedUpon = context.recentRecommendations.filter(r => r.wasActedUpon).length;
      indicators.push(`Only ${actedUpon}/${context.recentRecommendations.length} acted upon`);
      break;
    }
  }

  return indicators;
}

/**
 * Format fake intelligence alert
 */
export function formatFakeIntelligenceAlert(alert: FakeIntelligenceAlert): string {
  const emoji = alert.severity === 'critical' ? '🚨' : '⚠️';

  const parts: string[] = [];
  parts.push(`${emoji} **INTELLIGENCE QUALITY ALERT**`);
  parts.push(`**Type:** ${alert.alertType.replace(/_/g, ' ')}`);
  parts.push(`**Issue:** ${alert.description}\n`);

  parts.push('**Indicators:**');
  for (const indicator of alert.indicators) {
    parts.push(`- ${indicator}`);
  }

  parts.push(`\n**Action:** ${alert.suggestedAction}`);

  return parts.join('\n');
}

// ============================================================================
// 3. HUMAN FEEDBACK LOOPS
// ============================================================================

/**
 * Operator feedback on a recommendation
 */
export interface OperatorFeedback {
  id: string;
  recommendationId: string;
  clientId: string;
  operatorId: string;
  submittedAt: string;

  // Rating
  rating: 1 | 2 | 3 | 4 | 5;
  ratingDimensions?: {
    actionability: 1 | 2 | 3 | 4 | 5;
    accuracy: 1 | 2 | 3 | 4 | 5;
    timeliness: 1 | 2 | 3 | 4 | 5;
    uniqueness: 1 | 2 | 3 | 4 | 5;
  };

  // Qualitative
  feedbackType: 'helpful' | 'not_helpful' | 'obvious' | 'wrong' | 'late' | 'other';
  freeformFeedback?: string;

  // Corrections
  operatorCorrection?: string;
  operatorAlternative?: string;

  // Disagreement
  disagreedWith?: string;
  disagreementReason?: string;

  // Learning signals
  shouldHaveKnown?: boolean;
  alreadyDidThis?: boolean;
  willTryThis?: boolean;
}

/**
 * Aggregated feedback insights
 */
export interface FeedbackInsights {
  clientId: string;
  period: string;
  generatedAt: string;

  // Summary stats
  totalFeedback: number;
  averageRating: number;
  positivePercent: number;
  negativePercent: number;

  // By dimension
  dimensionScores: {
    actionability: number;
    accuracy: number;
    timeliness: number;
    uniqueness: number;
  };

  // Common issues
  topIssues: Array<{
    issue: string;
    count: number;
    percent: number;
  }>;

  // Corrections received
  correctionsCount: number;
  topCorrections: string[];

  // Learning recommendations
  learningSignals: string[];
}

const feedbackStore = new Map<string, OperatorFeedback[]>();

/**
 * Submit operator feedback
 */
export function submitFeedback(
  recommendationId: string,
  clientId: string,
  operatorId: string,
  rating: 1 | 2 | 3 | 4 | 5,
  feedbackType: OperatorFeedback['feedbackType'],
  options?: {
    ratingDimensions?: OperatorFeedback['ratingDimensions'];
    freeformFeedback?: string;
    operatorCorrection?: string;
    operatorAlternative?: string;
    disagreedWith?: string;
    disagreementReason?: string;
    shouldHaveKnown?: boolean;
    alreadyDidThis?: boolean;
    willTryThis?: boolean;
  }
): OperatorFeedback {
  const feedback: OperatorFeedback = {
    id: `fb_${Date.now()}`,
    recommendationId,
    clientId,
    operatorId,
    submittedAt: new Date().toISOString(),
    rating,
    feedbackType,
    ...options,
  };

  // Store feedback
  const existing = feedbackStore.get(clientId) || [];
  existing.push(feedback);
  feedbackStore.set(clientId, existing);

  // Update the recommendation
  for (const [_, recs] of recommendationStore) {
    const rec = recs.find(r => r.id === recommendationId);
    if (rec) {
      rec.operatorRating = rating;
      rec.operatorFeedback = options?.freeformFeedback;
      rec.markedAsObvious = feedbackType === 'obvious';
      rec.markedAsUseless = feedbackType === 'not_helpful';
      break;
    }
  }

  logger.info({ feedbackId: feedback.id, rating, feedbackType }, '[Reality] Feedback received');

  return feedback;
}

/**
 * Record operator correction/override
 */
export function recordCorrection(
  recommendationId: string,
  clientId: string,
  operatorId: string,
  correction: string,
  reason?: string
): void {
  submitFeedback(recommendationId, clientId, operatorId, 2, 'wrong', {
    operatorCorrection: correction,
    disagreementReason: reason,
  });

  logger.info({ recommendationId, correction }, '[Reality] Correction recorded');
}

/**
 * Generate feedback insights
 */
export function generateFeedbackInsights(
  clientId: string,
  period: string
): FeedbackInsights {
  const feedback = feedbackStore.get(clientId) || [];
  const periodFeedback = feedback;  // Would filter by period

  if (periodFeedback.length === 0) {
    return {
      clientId,
      period,
      generatedAt: new Date().toISOString(),
      totalFeedback: 0,
      averageRating: 0,
      positivePercent: 0,
      negativePercent: 0,
      dimensionScores: { actionability: 0, accuracy: 0, timeliness: 0, uniqueness: 0 },
      topIssues: [],
      correctionsCount: 0,
      topCorrections: [],
      learningSignals: [],
    };
  }

  // Calculate averages
  const avgRating = periodFeedback.reduce((s, f) => s + f.rating, 0) / periodFeedback.length;
  const positive = periodFeedback.filter(f => f.rating >= 4).length;
  const negative = periodFeedback.filter(f => f.rating <= 2).length;

  // Dimension scores
  const withDimensions = periodFeedback.filter(f => f.ratingDimensions);
  const dimensionScores = {
    actionability: calculateDimensionAvg(withDimensions, 'actionability'),
    accuracy: calculateDimensionAvg(withDimensions, 'accuracy'),
    timeliness: calculateDimensionAvg(withDimensions, 'timeliness'),
    uniqueness: calculateDimensionAvg(withDimensions, 'uniqueness'),
  };

  // Top issues
  const issueCounts = new Map<string, number>();
  for (const f of periodFeedback) {
    const count = issueCounts.get(f.feedbackType) || 0;
    issueCounts.set(f.feedbackType, count + 1);
  }
  const topIssues = Array.from(issueCounts.entries())
    .map(([issue, count]) => ({
      issue,
      count,
      percent: Math.round((count / periodFeedback.length) * 100),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Corrections
  const corrections = periodFeedback.filter(f => f.operatorCorrection);
  const topCorrections = corrections
    .slice(0, 5)
    .map(c => c.operatorCorrection!)
    .filter(Boolean);

  // Learning signals
  const learningSignals: string[] = [];
  if (dimensionScores.actionability < 3) {
    learningSignals.push('Improve actionability — make recommendations more specific');
  }
  if (dimensionScores.uniqueness < 3) {
    learningSignals.push('Increase uniqueness — filter out obvious insights');
  }
  if (negative / periodFeedback.length > 0.3) {
    learningSignals.push('High negative feedback — review recommendation quality');
  }
  const alreadyDid = periodFeedback.filter(f => f.alreadyDidThis).length;
  if (alreadyDid / periodFeedback.length > 0.2) {
    learningSignals.push('Many "already did this" — speed up insight delivery');
  }

  return {
    clientId,
    period,
    generatedAt: new Date().toISOString(),
    totalFeedback: periodFeedback.length,
    averageRating: Math.round(avgRating * 10) / 10,
    positivePercent: Math.round((positive / periodFeedback.length) * 100),
    negativePercent: Math.round((negative / periodFeedback.length) * 100),
    dimensionScores,
    topIssues,
    correctionsCount: corrections.length,
    topCorrections,
    learningSignals,
  };
}

function calculateDimensionAvg(
  feedback: OperatorFeedback[],
  dimension: keyof NonNullable<OperatorFeedback['ratingDimensions']>
): number {
  const withDim = feedback.filter(f => f.ratingDimensions?.[dimension]);
  if (withDim.length === 0) return 0;
  return withDim.reduce((s, f) => s + (f.ratingDimensions![dimension] || 0), 0) / withDim.length;
}

// ============================================================================
// 4. OPERATOR BEHAVIOR LEARNING
// ============================================================================

/**
 * Operator behavior event
 */
export interface BehaviorEvent {
  id: string;
  clientId: string;
  operatorId: string;
  timestamp: string;

  // Event type
  eventType: BehaviorEventType;
  context: string;

  // Details
  itemId?: string;
  itemType?: string;
  action?: string;
  duration?: number;  // ms
  metadata?: Record<string, unknown>;
}

export type BehaviorEventType =
  | 'view_insight'
  | 'dismiss_insight'
  | 'act_on_insight'
  | 'ignore_insight'
  | 'expand_detail'
  | 'collapse_detail'
  | 'rate_insight'
  | 'share_insight'
  | 'session_start'
  | 'session_end'
  | 'feature_use'
  | 'search'
  | 'filter_change';

/**
 * Operator behavior profile
 */
export interface OperatorProfile {
  operatorId: string;
  clientId: string;
  lastUpdated: string;

  // Engagement patterns
  preferredTimes: string[];  // Hours of day
  avgSessionDuration: number;  // minutes
  sessionsPerWeek: number;

  // Content preferences
  preferredInsightTypes: string[];
  ignoredInsightTypes: string[];
  preferredDetailLevel: 'tldr' | 'summary' | 'detailed';
  urgencyThreshold: 'all' | 'high_only' | 'critical_only';

  // Decision patterns
  avgDecisionTime: number;  // ms from view to action
  actionRate: number;  // % of viewed insights acted upon
  feedbackRate: number;  // % of insights rated

  // Learning signals
  learningVelocity: 'fast' | 'moderate' | 'slow';
  trustLevel: 'high' | 'growing' | 'skeptical';

  // Personalization signals
  shouldSimplify: boolean;
  wantsMoreDetail: boolean;
  prefersVisual: boolean;
  needsUrgency: boolean;
}

const behaviorStore = new Map<string, BehaviorEvent[]>();
const profileStore = new Map<string, OperatorProfile>();

/**
 * Track a behavior event
 */
export function trackBehavior(
  clientId: string,
  operatorId: string,
  eventType: BehaviorEventType,
  context: string,
  options?: {
    itemId?: string;
    itemType?: string;
    action?: string;
    duration?: number;
    metadata?: Record<string, unknown>;
  }
): BehaviorEvent {
  const event: BehaviorEvent = {
    id: `bev_${Date.now()}`,
    clientId,
    operatorId,
    timestamp: new Date().toISOString(),
    eventType,
    context,
    ...options,
  };

  const key = `${clientId}:${operatorId}`;
  const existing = behaviorStore.get(key) || [];
  existing.push(event);
  behaviorStore.set(key, existing);

  // Keep only last 1000 events
  if (existing.length > 1000) {
    behaviorStore.set(key, existing.slice(-1000));
  }

  return event;
}

/**
 * Build/update operator profile
 */
export function updateOperatorProfile(
  clientId: string,
  operatorId: string
): OperatorProfile {
  const key = `${clientId}:${operatorId}`;
  const events = behaviorStore.get(key) || [];

  // Get existing profile or create new
  let profile = profileStore.get(key);
  if (!profile) {
    profile = createDefaultProfile(operatorId, clientId);
  }

  // Update based on recent behavior
  const recentEvents = events.filter(e => {
    const age = Date.now() - new Date(e.timestamp).getTime();
    return age < 30 * 24 * 60 * 60 * 1000;  // Last 30 days
  });

  if (recentEvents.length === 0) {
    return profile;
  }

  // Calculate preferred times
  const hourCounts = new Map<number, number>();
  for (const e of recentEvents) {
    const hour = new Date(e.timestamp).getHours();
    hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
  }
  const topHours = Array.from(hourCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([h]) => `${h}:00`);
  profile.preferredTimes = topHours;

  // Calculate action rate
  const viewEvents = recentEvents.filter(e => e.eventType === 'view_insight');
  const actionEvents = recentEvents.filter(e => e.eventType === 'act_on_insight');
  profile.actionRate = viewEvents.length > 0
    ? Math.round((actionEvents.length / viewEvents.length) * 100)
    : 0;

  // Determine detail preference
  const expandEvents = recentEvents.filter(e => e.eventType === 'expand_detail').length;
  const collapseEvents = recentEvents.filter(e => e.eventType === 'collapse_detail').length;
  if (expandEvents > collapseEvents * 2) {
    profile.preferredDetailLevel = 'detailed';
    profile.wantsMoreDetail = true;
  } else if (collapseEvents > expandEvents * 2) {
    profile.preferredDetailLevel = 'tldr';
    profile.shouldSimplify = true;
  } else {
    profile.preferredDetailLevel = 'summary';
  }

  // Identify ignored insight types
  const dismissed = recentEvents.filter(e => e.eventType === 'dismiss_insight' || e.eventType === 'ignore_insight');
  const ignoredTypes = new Map<string, number>();
  for (const d of dismissed) {
    if (d.itemType) {
      ignoredTypes.set(d.itemType, (ignoredTypes.get(d.itemType) || 0) + 1);
    }
  }
  profile.ignoredInsightTypes = Array.from(ignoredTypes.entries())
    .filter(([_, count]) => count >= 3)
    .map(([type]) => type);

  // Identify preferred insight types
  const actedOn = recentEvents.filter(e => e.eventType === 'act_on_insight');
  const preferredTypes = new Map<string, number>();
  for (const a of actedOn) {
    if (a.itemType) {
      preferredTypes.set(a.itemType, (preferredTypes.get(a.itemType) || 0) + 1);
    }
  }
  profile.preferredInsightTypes = Array.from(preferredTypes.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type]) => type);

  // Determine trust level
  const feedbackEvents = recentEvents.filter(e => e.eventType === 'rate_insight');
  profile.feedbackRate = viewEvents.length > 0
    ? Math.round((feedbackEvents.length / viewEvents.length) * 100)
    : 0;

  if (profile.actionRate > 40 && profile.feedbackRate > 20) {
    profile.trustLevel = 'high';
  } else if (profile.actionRate > 20) {
    profile.trustLevel = 'growing';
  } else {
    profile.trustLevel = 'skeptical';
  }

  // Urgency threshold based on what they act on
  const urgentActions = actedOn.filter(e =>
    e.metadata && (e.metadata['urgency'] === 'critical' || e.metadata['urgency'] === 'high')
  );
  if (urgentActions.length > actedOn.length * 0.8) {
    profile.urgencyThreshold = 'critical_only';
  } else if (urgentActions.length > actedOn.length * 0.5) {
    profile.urgencyThreshold = 'high_only';
  } else {
    profile.urgencyThreshold = 'all';
  }

  profile.lastUpdated = new Date().toISOString();
  profileStore.set(key, profile);

  return profile;
}

/**
 * Create default operator profile
 */
function createDefaultProfile(operatorId: string, clientId: string): OperatorProfile {
  return {
    operatorId,
    clientId,
    lastUpdated: new Date().toISOString(),
    preferredTimes: [],
    avgSessionDuration: 0,
    sessionsPerWeek: 0,
    preferredInsightTypes: [],
    ignoredInsightTypes: [],
    preferredDetailLevel: 'summary',
    urgencyThreshold: 'all',
    avgDecisionTime: 0,
    actionRate: 0,
    feedbackRate: 0,
    learningVelocity: 'moderate',
    trustLevel: 'growing',
    shouldSimplify: false,
    wantsMoreDetail: false,
    prefersVisual: false,
    needsUrgency: false,
  };
}

/**
 * Get personalization recommendations for an operator
 */
export function getPersonalizationRecommendations(
  profile: OperatorProfile
): string[] {
  const recommendations: string[] = [];

  if (profile.shouldSimplify) {
    recommendations.push('Show TL;DR by default, hide details');
  }

  if (profile.wantsMoreDetail) {
    recommendations.push('Show detailed view by default');
  }

  if (profile.ignoredInsightTypes.length > 0) {
    recommendations.push(`Deprioritize: ${profile.ignoredInsightTypes.join(', ')}`);
  }

  if (profile.preferredInsightTypes.length > 0) {
    recommendations.push(`Prioritize: ${profile.preferredInsightTypes.join(', ')}`);
  }

  if (profile.urgencyThreshold === 'critical_only') {
    recommendations.push('Only show critical urgency items');
  }

  if (profile.trustLevel === 'skeptical') {
    recommendations.push('Include more evidence and reasoning');
  }

  if (profile.preferredTimes.length > 0) {
    recommendations.push(`Best delivery times: ${profile.preferredTimes.join(', ')}`);
  }

  return recommendations;
}

// ============================================================================
// 5. DEPLOYMENT RISK MITIGATION
// ============================================================================

/**
 * Deployment risk types
 */
export type DeploymentRisk =
  | 'overtrust'
  | 'undertrust'
  | 'insight_fatigue'
  | 'recommendation_overload'
  | 'strategic_confusion'
  | 'false_confidence'
  | 'prediction_drift'
  | 'intelligence_decay'
  | 'operator_dependency'
  | 'organizational_resistance';

/**
 * Risk assessment for a client
 */
export interface RiskAssessment {
  clientId: string;
  assessedAt: string;

  // Overall risk level
  overallRisk: 'low' | 'moderate' | 'high' | 'critical';

  // Individual risks
  risks: Array<{
    type: DeploymentRisk;
    level: 'low' | 'moderate' | 'high';
    indicators: string[];
    mitigation: string;
  }>;

  // Recommendations
  priorityActions: string[];
}

/**
 * Assess deployment risks for a client
 */
export function assessDeploymentRisks(
  clientId: string,
  metrics: IntelligenceMetrics,
  profile?: OperatorProfile,
  feedback?: FeedbackInsights
): RiskAssessment {
  const risks: RiskAssessment['risks'] = [];

  // Check for overtrust
  if (metrics.insightAdoptionRate > 90 && metrics.strategicAccuracy < 70) {
    risks.push({
      type: 'overtrust',
      level: 'high',
      indicators: [
        `${metrics.insightAdoptionRate}% adoption rate`,
        `Only ${metrics.strategicAccuracy}% accuracy`,
        'Acting without verification',
      ],
      mitigation: 'Add confidence warnings. Require manual verification for low-confidence recommendations.',
    });
  }

  // Check for undertrust
  if (metrics.insightAdoptionRate < 15 && metrics.strategicAccuracy > 60) {
    risks.push({
      type: 'undertrust',
      level: 'moderate',
      indicators: [
        `Only ${metrics.insightAdoptionRate}% adoption`,
        `${metrics.strategicAccuracy}% accuracy (good)`,
        'Missing valid opportunities',
      ],
      mitigation: 'Build trust through prediction scorecards. Highlight successful past predictions.',
    });
  }

  // Check for insight fatigue
  if (profile && profile.actionRate < 10 && feedback && feedback.averageRating < 3) {
    risks.push({
      type: 'insight_fatigue',
      level: 'high',
      indicators: [
        'Declining engagement',
        'Low ratings',
        'Reduced session frequency',
      ],
      mitigation: 'Reduce insight volume. Focus on highest-impact only. Add novelty.',
    });
  }

  // Check for recommendation overload
  const recsCount = recommendationStore.get(clientId)?.length || 0;
  if (recsCount > 50 && metrics.insightAdoptionRate < 20) {
    risks.push({
      type: 'recommendation_overload',
      level: 'moderate',
      indicators: [
        `${recsCount} recommendations in queue`,
        'Low action rate',
        'Decision paralysis signals',
      ],
      mitigation: 'Implement THE ONE THING prioritization. Hide lower-priority items.',
    });
  }

  // Check for prediction drift
  if (metrics.strategicAccuracy < 50) {
    risks.push({
      type: 'prediction_drift',
      level: 'high',
      indicators: [
        `${metrics.strategicAccuracy}% accuracy`,
        'Below 50% threshold',
        'Predictions losing calibration',
      ],
      mitigation: 'Recalibrate prediction models. Increase evidence requirements.',
    });
  }

  // Check for intelligence decay
  if (metrics.wowFactorScore < 30) {
    risks.push({
      type: 'intelligence_decay',
      level: 'moderate',
      indicators: [
        `${metrics.wowFactorScore}% wow factor`,
        'Insights becoming routine',
        'No new patterns detected',
      ],
      mitigation: 'Introduce new signal sources. Refresh pattern detection algorithms.',
    });
  }

  // Check for operator dependency
  if (profile && profile.trustLevel === 'high' && profile.actionRate > 80) {
    risks.push({
      type: 'operator_dependency',
      level: 'low',
      indicators: [
        'High reliance on system',
        'Reduced independent analysis',
      ],
      mitigation: 'Encourage critical thinking. Show reasoning for all recommendations.',
    });
  }

  // Calculate overall risk
  const highRisks = risks.filter(r => r.level === 'high').length;
  const moderateRisks = risks.filter(r => r.level === 'moderate').length;

  let overallRisk: RiskAssessment['overallRisk'] = 'low';
  if (highRisks >= 2) overallRisk = 'critical';
  else if (highRisks >= 1) overallRisk = 'high';
  else if (moderateRisks >= 2) overallRisk = 'moderate';

  // Priority actions
  const priorityActions = risks
    .filter(r => r.level === 'high')
    .map(r => r.mitigation)
    .slice(0, 3);

  return {
    clientId,
    assessedAt: new Date().toISOString(),
    overallRisk,
    risks,
    priorityActions,
  };
}

/**
 * Format risk assessment
 */
export function formatRiskAssessment(assessment: RiskAssessment): string {
  const riskEmoji = {
    low: '🟢',
    moderate: '🟡',
    high: '🟠',
    critical: '🔴',
  };

  const parts: string[] = [];

  parts.push(`**DEPLOYMENT RISK ASSESSMENT** ${riskEmoji[assessment.overallRisk]}`);
  parts.push(`Overall Risk: ${assessment.overallRisk.toUpperCase()}\n`);

  if (assessment.risks.length === 0) {
    parts.push('No significant risks detected.');
  } else {
    for (const risk of assessment.risks) {
      parts.push(`**${risk.type.replace(/_/g, ' ')}** (${risk.level})`);
      parts.push(`- Indicators: ${risk.indicators.slice(0, 2).join(', ')}`);
      parts.push(`- Mitigation: ${risk.mitigation}\n`);
    }
  }

  if (assessment.priorityActions.length > 0) {
    parts.push('**Priority Actions:**');
    for (const action of assessment.priorityActions) {
      parts.push(`→ ${action}`);
    }
  }

  return parts.join('\n');
}

// ============================================================================
// COMBINED: Reality Testing Package
// ============================================================================

/**
 * Complete reality testing package
 */
export interface RealityTestingPackage {
  clientId: string;
  generatedAt: string;

  // Validation
  intelligenceMetrics: IntelligenceMetrics;
  validationSummary: string;

  // Quality
  fakeIntelligenceAlerts: FakeIntelligenceAlert[];
  qualityStatus: 'healthy' | 'warning' | 'critical';

  // Feedback
  feedbackInsights: FeedbackInsights;
  learningSignals: string[];

  // Behavior
  operatorProfile?: OperatorProfile;
  personalizationRecommendations: string[];

  // Risk
  riskAssessment: RiskAssessment;

  // Action items
  priorityActions: string[];
}

/**
 * Generate complete reality testing package
 */
export function generateRealityTestingPackage(
  clientId: string,
  operatorId?: string
): RealityTestingPackage {
  // Calculate metrics
  const metrics = calculateIntelligenceMetrics(clientId, 'current');

  // Detect fake intelligence
  const recs = recommendationStore.get(clientId) || [];
  const fakeAlerts = detectFakeIntelligence(clientId, recs, metrics);

  // Get feedback insights
  const feedbackInsights = generateFeedbackInsights(clientId, 'current');

  // Get operator profile
  let operatorProfile: OperatorProfile | undefined;
  let personalizationRecs: string[] = [];
  if (operatorId) {
    operatorProfile = updateOperatorProfile(clientId, operatorId);
    personalizationRecs = getPersonalizationRecommendations(operatorProfile);
  }

  // Assess risks
  const riskAssessment = assessDeploymentRisks(clientId, metrics, operatorProfile, feedbackInsights);

  // Determine quality status
  let qualityStatus: RealityTestingPackage['qualityStatus'] = 'healthy';
  if (fakeAlerts.some(a => a.severity === 'critical')) {
    qualityStatus = 'critical';
  } else if (fakeAlerts.length > 0) {
    qualityStatus = 'warning';
  }

  // Generate validation summary
  const validationSummary = generateValidationSummary(metrics, fakeAlerts, riskAssessment);

  // Compile priority actions
  const priorityActions: string[] = [
    ...fakeAlerts.filter(a => a.severity === 'critical').map(a => a.suggestedAction),
    ...riskAssessment.priorityActions,
    ...feedbackInsights.learningSignals.slice(0, 2),
  ].slice(0, 5);

  return {
    clientId,
    generatedAt: new Date().toISOString(),
    intelligenceMetrics: metrics,
    validationSummary,
    fakeIntelligenceAlerts: fakeAlerts,
    qualityStatus,
    feedbackInsights,
    learningSignals: feedbackInsights.learningSignals,
    operatorProfile,
    personalizationRecommendations: personalizationRecs,
    riskAssessment,
    priorityActions,
  };
}

/**
 * Generate validation summary
 */
function generateValidationSummary(
  metrics: IntelligenceMetrics,
  alerts: FakeIntelligenceAlert[],
  risk: RiskAssessment
): string {
  const parts: string[] = [];

  parts.push(`**Intelligence Score:** ${metrics.overallScore}/100`);

  if (alerts.length === 0 && risk.overallRisk === 'low') {
    parts.push('✅ System performing well. Intelligence quality validated.');
  } else if (alerts.some(a => a.severity === 'critical') || risk.overallRisk === 'critical') {
    parts.push('🚨 Critical issues detected. Immediate attention required.');
  } else {
    parts.push('⚠️ Some issues detected. Review recommended.');
  }

  parts.push(`\n**Key Stats:**`);
  parts.push(`- Adoption Rate: ${metrics.insightAdoptionRate}%`);
  parts.push(`- Accuracy: ${metrics.strategicAccuracy}%`);
  parts.push(`- Wow Factor: ${metrics.wowFactorScore}%`);

  return parts.join('\n');
}

// ============================================================================
// Logging
// ============================================================================

logger.info('[RealityTesting] Systems loaded — Validation, Fake Detection, Feedback, Behavior Learning, Risk Assessment');
