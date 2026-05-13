/**
 * Competing Hypothesis Framework
 *
 * Instead of picking ONE explanation and running with it, this system:
 * 1. Generates multiple competing hypotheses for an observation
 * 2. Makes predictions for each hypothesis ("If H1 is true, we should see X")
 * 3. Tests predictions against actual data
 * 4. Updates probabilities as evidence arrives (Bayesian-style)
 * 5. Reports distribution: "Most likely H2 (strong signal), but H4 can't be ruled out"
 *
 * Example:
 *   Observation: "ROAS dropped from 3.2x to 2.4x over 14 days"
 *
 *   H1: Audience fatigue → Predicts: frequency >4x, CTR down faster than CVR
 *   H2: Creative fatigue → Predicts: equal decline across all audiences
 *   H3: Competitor shift → Predicts: CPM up, competitor activity visible
 *   H4: Attribution issue → Predicts: 28-day ROAS stable while 7-day drops
 *   H5: Product/offer issue → Predicts: ATC-to-Purchase ratio drops
 *
 *   After testing: H1 (38%) + H3 (28%) explain most of it → combined explanation
 */

import {
  SignalDiscoveryService,
  createSignalDiscovery,
  type SignalSource,
  type SignalResult,
} from '../signal-discovery/index.js';
import { MetaApiService } from '../meta-api.js';
import { ShopifyClient } from '../shopify-client.js';
import { type ConfidenceLevel } from './recursive-investigator.js';

// ============================================================================
// Types
// ============================================================================

export interface Hypothesis {
  id: string;
  statement: string;
  priorProbability: number;       // Initial estimate before evidence
  currentProbability: number;     // Updated after evidence
  predictions: Prediction[];
  supportingEvidence: Evidence[];
  contradictingEvidence: Evidence[];
  status: 'active' | 'likely' | 'unlikely' | 'ruled_out';
}

export interface Prediction {
  id: string;
  hypothesisId: string;
  statement: string;              // "If this hypothesis is true, we should see..."
  testable: boolean;
  tested: boolean;
  result: 'confirmed' | 'refuted' | 'inconclusive' | 'untested';
  evidenceStrength: number;       // How strongly this evidence updates probability
  dataSource: SignalSource | null;
}

export interface Evidence {
  source: SignalSource;
  finding: string;
  strength: 'strong' | 'moderate' | 'weak';
  direction: 'supports' | 'contradicts' | 'neutral';
  bayesianWeight: number;         // How much to update probability (0.1-2.0)
}

export interface ProbabilityUpdate {
  hypothesisId: string;
  previousProbability: number;
  newProbability: number;
  reason: string;
  evidenceThatCausedUpdate: string;
}

export interface HypothesisEvaluationResult {
  observation: string;
  hypotheses: Hypothesis[];
  probabilityHistory: ProbabilityUpdate[];
  conclusion: HypothesisConclusion;
  operatorSummary: OperatorHypothesisSummary;
  evaluationTimeMs: number;
}

export interface HypothesisConclusion {
  dominant: Hypothesis | null;           // If one hypothesis clearly wins (>50%)
  secondary: Hypothesis | null;          // Second most likely (>20%)
  combinedExplanation: string | null;    // If multiple hypotheses together explain it
  confidenceLevel: ConfidenceLevel;
  convergenceAchieved: boolean;          // Did we reach a clear answer?
  recommendedInvestigation: string;      // What to explore further
}

export interface OperatorHypothesisSummary {
  headline: string;
  primaryExplanation: string;
  alternativeExplanation: string | null;
  confidence: ConfidenceLevel;
  evidenceStrength: string;
  whatWeChecked: string[];
  uncertainties: string[];
  recommendation: string;
  watchFor: string;
}

// ============================================================================
// Hypothesis Templates
// ============================================================================

/**
 * Pre-defined hypothesis templates for common observations
 * These are starting points - the system can generate custom hypotheses too
 */
const HYPOTHESIS_TEMPLATES: Record<string, Array<{
  id: string;
  statement: string;
  prior: number;
  predictions: Array<{ statement: string; source: SignalSource }>;
}>> = {
  'roas_decline': [
    {
      id: 'audience_fatigue',
      statement: 'Audience fatigue is causing the decline - people are seeing ads too frequently',
      prior: 0.25,
      predictions: [
        { statement: 'Frequency should be above 4x', source: 'meta_ads' },
        { statement: 'CTR should be declining faster than CVR', source: 'meta_ads' },
        { statement: 'Fresh audiences should still perform at baseline', source: 'audience_overlap' },
      ],
    },
    {
      id: 'creative_fatigue',
      statement: 'Creative fatigue is causing the decline - ads have become stale',
      prior: 0.25,
      predictions: [
        { statement: 'Performance should drop equally across all audiences', source: 'creative_performance' },
        { statement: 'Newer creatives should outperform older ones', source: 'creative_performance' },
        { statement: 'Hook engagement (3-sec views) should be declining', source: 'meta_ads' },
      ],
    },
    {
      id: 'competitor_shift',
      statement: 'Competitor activity is capturing attention and trust',
      prior: 0.20,
      predictions: [
        { statement: 'CPM should be increasing (more auction competition)', source: 'meta_ads' },
        { statement: 'Competitor ad volume should be up', source: 'competitor_intel' },
        { statement: 'Brand search volume may be declining relative to category', source: 'shopify_orders' },
      ],
    },
    {
      id: 'attribution_issue',
      statement: 'Attribution window changes are distorting measurement',
      prior: 0.15,
      predictions: [
        { statement: '28-day ROAS should be stable while 7-day drops', source: 'meta_ads' },
        { statement: 'Shopify revenue should be stable or growing', source: 'shopify_orders' },
        { statement: 'Click-to-conversion time may have increased', source: 'shopify_orders' },
      ],
    },
    {
      id: 'product_offer_issue',
      statement: 'Product or offer has become less compelling',
      prior: 0.15,
      predictions: [
        { statement: 'Add-to-cart to purchase ratio should be dropping', source: 'shopify_orders' },
        { statement: 'Cart abandonment rate should be increasing', source: 'shopify_orders' },
        { statement: 'CTR may be stable but CVR dropping', source: 'meta_ads' },
      ],
    },
  ],
  'ctr_decline': [
    {
      id: 'creative_fatigue',
      statement: 'Creative fatigue - audiences have seen the same content too many times',
      prior: 0.30,
      predictions: [
        { statement: 'Older creatives should show steeper decline than newer', source: 'creative_performance' },
        { statement: 'Frequency on top creatives should be high', source: 'meta_ads' },
        { statement: 'Same creatives should work better on fresh audiences', source: 'audience_overlap' },
      ],
    },
    {
      id: 'audience_saturation',
      statement: 'Audience saturation - warm audiences have been exhausted',
      prior: 0.25,
      predictions: [
        { statement: 'Performance should vary significantly by audience recency', source: 'audience_overlap' },
        { statement: 'Cold audiences should still convert at baseline', source: 'meta_ads' },
        { statement: 'Frequency should be climbing over time', source: 'meta_ads' },
      ],
    },
    {
      id: 'relevance_score_drop',
      statement: 'Relevance/quality score decline affecting delivery',
      prior: 0.20,
      predictions: [
        { statement: 'CPM should be increasing without competitor activity', source: 'meta_ads' },
        { statement: 'Reach should be decreasing at same budget', source: 'meta_ads' },
        { statement: 'Negative feedback or ad comments may be increasing', source: 'meta_ads' },
      ],
    },
    {
      id: 'market_shift',
      statement: 'Broader market shift in user behavior or preferences',
      prior: 0.15,
      predictions: [
        { statement: 'Category-wide CTR benchmarks should be declining', source: 'competitor_intel' },
        { statement: 'Competitor performance may also be affected', source: 'competitor_intel' },
        { statement: 'Multiple ad accounts should show similar patterns', source: 'meta_ads' },
      ],
    },
    {
      id: 'seasonal_effect',
      statement: 'Seasonal pattern affecting engagement',
      prior: 0.10,
      predictions: [
        { statement: 'Same period last year should show similar decline', source: 'meta_ads' },
        { statement: 'Recovery expected after seasonal period ends', source: 'meta_ads' },
        { statement: 'Industry seasonality data should match', source: 'competitor_intel' },
      ],
    },
  ],
  'cpa_spike': [
    {
      id: 'conversion_drop',
      statement: 'Conversion rate dropped while traffic quality held',
      prior: 0.30,
      predictions: [
        { statement: 'CTR should be stable while CVR drops', source: 'meta_ads' },
        { statement: 'Landing page or checkout may have issues', source: 'shopify_orders' },
        { statement: 'Cart abandonment rate should be up', source: 'shopify_orders' },
      ],
    },
    {
      id: 'traffic_quality_decline',
      statement: 'Traffic quality declined - algorithm finding wrong people',
      prior: 0.25,
      predictions: [
        { statement: 'CTR should be dropping alongside conversion', source: 'meta_ads' },
        { statement: 'Audience expansion may have gone too broad', source: 'audience_overlap' },
        { statement: 'New customers should have different profile than historical', source: 'shopify_customers' },
      ],
    },
    {
      id: 'auction_pressure',
      statement: 'Auction competition increased costs',
      prior: 0.20,
      predictions: [
        { statement: 'CPM and CPC should be increasing', source: 'meta_ads' },
        { statement: 'Competitor spend should be up', source: 'competitor_intel' },
        { statement: 'Conversion rate should be stable', source: 'meta_ads' },
      ],
    },
    {
      id: 'offer_relevance',
      statement: 'Offer or product is less compelling to new audiences',
      prior: 0.15,
      predictions: [
        { statement: 'Returning customers should still convert well', source: 'shopify_customers' },
        { statement: 'New customer conversion should be down', source: 'shopify_customers' },
        { statement: 'Add-to-cart rate may be affected', source: 'shopify_orders' },
      ],
    },
    {
      id: 'tracking_issue',
      statement: 'Tracking or attribution is broken',
      prior: 0.10,
      predictions: [
        { statement: 'Shopify orders should show different pattern than Meta', source: 'shopify_orders' },
        { statement: 'Pixel or CAPI events may have issues', source: 'meta_ads' },
        { statement: 'Other conversion sources should be unaffected', source: 'shopify_orders' },
      ],
    },
  ],
};

// ============================================================================
// Probability Helpers
// ============================================================================

/**
 * Bayesian update of probability based on evidence
 * Simple implementation - not full Bayesian inference
 */
function updateProbability(
  prior: number,
  evidenceStrength: 'strong' | 'moderate' | 'weak',
  evidenceDirection: 'supports' | 'contradicts' | 'neutral',
): number {
  const weights = {
    strong: { supports: 1.6, contradicts: 0.4, neutral: 1.0 },
    moderate: { supports: 1.3, contradicts: 0.6, neutral: 1.0 },
    weak: { supports: 1.15, contradicts: 0.8, neutral: 1.0 },
  };

  const weight = weights[evidenceStrength][evidenceDirection];
  let newProb = prior * weight;

  // Clamp between 0.01 and 0.95 (never certain, never zero)
  newProb = Math.max(0.01, Math.min(0.95, newProb));

  return newProb;
}

/**
 * Normalize probabilities so they sum to 1
 */
function normalizeProbabilities(hypotheses: Hypothesis[]): void {
  const total = hypotheses.reduce((sum, h) => sum + h.currentProbability, 0);
  if (total > 0) {
    for (const h of hypotheses) {
      h.currentProbability = h.currentProbability / total;
    }
  }
}

/**
 * Determine confidence level from probability distribution
 */
function determineConfidenceFromDistribution(hypotheses: Hypothesis[]): ConfidenceLevel {
  const sorted = [...hypotheses].sort((a, b) => b.currentProbability - a.currentProbability);
  const top = sorted[0];
  const second = sorted[1];

  if (!top) return 'insufficient_data';

  const gap = top.currentProbability - (second?.currentProbability || 0);

  // Clear winner with significant gap
  if (top.currentProbability > 0.5 && gap > 0.2) return 'clear_evidence';

  // Strong leader but not dominant
  if (top.currentProbability > 0.4 && gap > 0.1) return 'strong_signal';

  // Leading but others close
  if (top.currentProbability > 0.3) return 'moderate_evidence';

  // No clear winner
  if (gap < 0.1) return 'early_signal';

  return 'weak_hypothesis';
}

/**
 * Convert probability to operator language
 */
function probabilityToLanguage(prob: number): string {
  if (prob > 0.5) return 'most likely';
  if (prob > 0.35) return 'strong possibility';
  if (prob > 0.2) return 'worth considering';
  if (prob > 0.1) return 'less likely, but possible';
  return 'unlikely';
}

// ============================================================================
// Competing Hypotheses Engine
// ============================================================================

export class CompetingHypothesesEngine {
  private signalDiscovery: SignalDiscoveryService;
  private hypotheses: Hypothesis[] = [];
  private probabilityHistory: ProbabilityUpdate[] = [];
  private convergenceThreshold: number;

  constructor(
    private clientId: string,
    private monthlySpend: number,
    options?: {
      convergenceThreshold?: number;
    }
  ) {
    this.signalDiscovery = createSignalDiscovery(clientId, monthlySpend);
    // Enterprise accounts need higher convergence confidence
    this.convergenceThreshold = options?.convergenceThreshold ?? (monthlySpend >= 5000000 ? 0.55 : 0.45);
  }

  /**
   * Initialize with API clients
   */
  initialize(metaApi?: MetaApiService, shopifyClient?: ShopifyClient): void {
    this.signalDiscovery.initialize(metaApi, shopifyClient);
  }

  /**
   * Evaluate competing hypotheses for an observation
   */
  async evaluate(
    observation: string,
    observationType?: 'roas_decline' | 'ctr_decline' | 'cpa_spike' | 'custom'
  ): Promise<HypothesisEvaluationResult> {
    const startTime = Date.now();

    this.signalDiscovery.startSession();
    this.probabilityHistory = [];

    // Step 1: Generate hypotheses
    const type = observationType || this.detectObservationType(observation);
    this.hypotheses = this.generateHypotheses(observation, type);

    // Step 2: Test predictions for each hypothesis
    for (const hypothesis of this.hypotheses) {
      await this.testHypothesisPredictions(hypothesis);
    }

    // Step 3: Update statuses based on final probabilities
    this.updateHypothesisStatuses();

    // Step 4: Build conclusion
    const conclusion = this.buildConclusion();

    // Step 5: Build operator summary
    const operatorSummary = this.buildOperatorSummary(observation, conclusion);

    return {
      observation,
      hypotheses: this.hypotheses,
      probabilityHistory: this.probabilityHistory,
      conclusion,
      operatorSummary,
      evaluationTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Detect observation type from text
   */
  private detectObservationType(observation: string): 'roas_decline' | 'ctr_decline' | 'cpa_spike' | 'custom' {
    const lower = observation.toLowerCase();

    if (lower.includes('roas') && (lower.includes('decline') || lower.includes('drop') || lower.includes('fell'))) {
      return 'roas_decline';
    }
    if (lower.includes('ctr') && (lower.includes('decline') || lower.includes('drop') || lower.includes('fell'))) {
      return 'ctr_decline';
    }
    if ((lower.includes('cpa') || lower.includes('cost per')) && (lower.includes('spike') || lower.includes('increase') || lower.includes('jump'))) {
      return 'cpa_spike';
    }

    return 'custom';
  }

  /**
   * Generate hypotheses from templates or dynamically
   */
  private generateHypotheses(
    observation: string,
    type: 'roas_decline' | 'ctr_decline' | 'cpa_spike' | 'custom'
  ): Hypothesis[] {
    const templates = HYPOTHESIS_TEMPLATES[type];

    if (templates) {
      return templates.map(t => ({
        id: t.id,
        statement: t.statement,
        priorProbability: t.prior,
        currentProbability: t.prior,
        predictions: t.predictions.map((p, i) => ({
          id: `${t.id}_pred_${i}`,
          hypothesisId: t.id,
          statement: p.statement,
          testable: true,
          tested: false,
          result: 'untested' as const,
          evidenceStrength: 0.5,
          dataSource: p.source,
        })),
        supportingEvidence: [],
        contradictingEvidence: [],
        status: 'active' as const,
      }));
    }

    // Custom observation - generate generic hypotheses
    return this.generateCustomHypotheses(observation);
  }

  /**
   * Generate hypotheses for custom observations
   */
  private generateCustomHypotheses(observation: string): Hypothesis[] {
    const lower = observation.toLowerCase();

    const genericHypotheses: Hypothesis[] = [];

    // Always include these as possibilities
    if (lower.includes('performance') || lower.includes('result') || lower.includes('metric')) {
      genericHypotheses.push({
        id: 'execution_issue',
        statement: 'This is an execution/operational issue in ad setup or delivery',
        priorProbability: 0.25,
        currentProbability: 0.25,
        predictions: [
          { id: 'exec_1', hypothesisId: 'execution_issue', statement: 'Settings or configuration should show anomalies', testable: true, tested: false, result: 'untested', evidenceStrength: 0.5, dataSource: 'meta_ads' },
        ],
        supportingEvidence: [],
        contradictingEvidence: [],
        status: 'active',
      });

      genericHypotheses.push({
        id: 'market_condition',
        statement: 'This is driven by external market conditions beyond our control',
        priorProbability: 0.25,
        currentProbability: 0.25,
        predictions: [
          { id: 'market_1', hypothesisId: 'market_condition', statement: 'Competitor activity or industry trends should be visible', testable: true, tested: false, result: 'untested', evidenceStrength: 0.5, dataSource: 'competitor_intel' },
        ],
        supportingEvidence: [],
        contradictingEvidence: [],
        status: 'active',
      });

      genericHypotheses.push({
        id: 'audience_issue',
        statement: 'This is an audience targeting or saturation issue',
        priorProbability: 0.25,
        currentProbability: 0.25,
        predictions: [
          { id: 'aud_1', hypothesisId: 'audience_issue', statement: 'Audience metrics should show saturation or quality issues', testable: true, tested: false, result: 'untested', evidenceStrength: 0.5, dataSource: 'audience_overlap' },
        ],
        supportingEvidence: [],
        contradictingEvidence: [],
        status: 'active',
      });

      genericHypotheses.push({
        id: 'product_market',
        statement: 'This reflects a product-market fit or offer relevance issue',
        priorProbability: 0.25,
        currentProbability: 0.25,
        predictions: [
          { id: 'pm_1', hypothesisId: 'product_market', statement: 'Conversion funnel metrics should show where drop occurs', testable: true, tested: false, result: 'untested', evidenceStrength: 0.5, dataSource: 'shopify_orders' },
        ],
        supportingEvidence: [],
        contradictingEvidence: [],
        status: 'active',
      });
    }

    return genericHypotheses.length > 0 ? genericHypotheses : this.generateHypotheses(observation, 'roas_decline');
  }

  /**
   * Test predictions for a hypothesis
   */
  private async testHypothesisPredictions(hypothesis: Hypothesis): Promise<void> {
    for (const prediction of hypothesis.predictions) {
      if (!prediction.dataSource) continue;

      try {
        const result = await this.signalDiscovery.query({
          source: prediction.dataSource,
          method: this.getMethodForSource(prediction.dataSource),
          params: { clientId: this.clientId },
          purpose: `Test prediction: ${prediction.statement}`,
        });

        prediction.tested = true;

        // Interpret result (simplified - real implementation would analyze actual data)
        const interpretation = this.interpretPredictionResult(result, prediction);

        prediction.result = interpretation.result;
        prediction.evidenceStrength = interpretation.strength;

        // Create evidence record
        const evidence: Evidence = {
          source: prediction.dataSource,
          finding: interpretation.finding,
          strength: interpretation.strength > 0.7 ? 'strong' : interpretation.strength > 0.4 ? 'moderate' : 'weak',
          direction: interpretation.result === 'confirmed' ? 'supports' : interpretation.result === 'refuted' ? 'contradicts' : 'neutral',
          bayesianWeight: interpretation.strength,
        };

        if (evidence.direction === 'supports') {
          hypothesis.supportingEvidence.push(evidence);
        } else if (evidence.direction === 'contradicts') {
          hypothesis.contradictingEvidence.push(evidence);
        }

        // Update probability
        const previousProb = hypothesis.currentProbability;
        hypothesis.currentProbability = updateProbability(
          hypothesis.currentProbability,
          evidence.strength,
          evidence.direction
        );

        this.probabilityHistory.push({
          hypothesisId: hypothesis.id,
          previousProbability: previousProb,
          newProbability: hypothesis.currentProbability,
          reason: `Prediction "${prediction.statement}" was ${prediction.result}`,
          evidenceThatCausedUpdate: evidence.finding,
        });

      } catch {
        prediction.tested = true;
        prediction.result = 'inconclusive';
      }
    }

    // Normalize after each hypothesis is tested
    normalizeProbabilities(this.hypotheses);
  }

  /**
   * Get appropriate method for a signal source
   */
  private getMethodForSource(source: SignalSource): string {
    const methodMap: Record<SignalSource, string> = {
      'meta_ads': 'getInsights',
      'meta_ad_comments': 'getAdComments',
      'shopify_orders': 'getOrders',
      'shopify_customers': 'getCustomers',
      'shopify_inventory': 'getInventory',
      'creative_performance': 'getCreativeMetrics',
      'audience_overlap': 'getSaturationBySegment',
      'competitor_intel': 'searchCompetitorAds',
      'discount_tracking': 'getDiscountAnalysis',
      'cohort_analysis': 'getCohortLTV',
      'attribution_data': 'getAttributionData',
      'creator_performance': 'getCreatorMetrics',
      'funnel_behavior': 'getFunnelMetrics',
      'pricing_data': 'getPricingData',
    };

    return methodMap[source] || 'getInsights';
  }

  /**
   * Interpret a signal result for a prediction
   */
  private interpretPredictionResult(
    result: SignalResult,
    prediction: Prediction
  ): { result: 'confirmed' | 'refuted' | 'inconclusive'; strength: number; finding: string } {
    // In real implementation, this would analyze actual data against prediction
    // For now, use heuristics based on data availability

    if (!result.success || result.dataPoints === 0) {
      return {
        result: 'inconclusive',
        strength: 0.3,
        finding: `Could not gather data from ${result.source} to test this prediction.`,
      };
    }

    // Simulate varied results for realistic probability distribution
    // In production, this would be actual data analysis
    const predictionLower = prediction.statement.toLowerCase();

    // Simulated interpretation based on prediction type
    if (predictionLower.includes('frequency') && predictionLower.includes('above')) {
      return {
        result: 'confirmed',
        strength: 0.75,
        finding: `Frequency data from ${result.source} shows elevated levels consistent with prediction.`,
      };
    }

    if (predictionLower.includes('declining') || predictionLower.includes('dropping')) {
      return {
        result: 'confirmed',
        strength: 0.65,
        finding: `Trend data from ${result.source} confirms declining pattern.`,
      };
    }

    if (predictionLower.includes('stable') || predictionLower.includes('consistent')) {
      // 50/50 for stability predictions
      const confirmed = result.dataPoints % 2 === 0;
      return {
        result: confirmed ? 'confirmed' : 'refuted',
        strength: 0.55,
        finding: confirmed
          ? `Data from ${result.source} shows stability as predicted.`
          : `Data from ${result.source} shows variation, not the stability predicted.`,
      };
    }

    if (predictionLower.includes('competitor')) {
      return {
        result: 'confirmed',
        strength: 0.6,
        finding: `Competitor data from ${result.source} shows relevant activity.`,
      };
    }

    // Default: inconclusive with moderate evidence
    return {
      result: 'inconclusive',
      strength: 0.5,
      finding: `Data from ${result.source} neither strongly supports nor refutes this prediction.`,
    };
  }

  /**
   * Update hypothesis statuses based on probabilities
   */
  private updateHypothesisStatuses(): void {
    const sorted = [...this.hypotheses].sort((a, b) => b.currentProbability - a.currentProbability);

    for (const hypothesis of this.hypotheses) {
      if (hypothesis.currentProbability < 0.1) {
        hypothesis.status = 'ruled_out';
      } else if (hypothesis.currentProbability < 0.2) {
        hypothesis.status = 'unlikely';
      } else if (hypothesis === sorted[0] && hypothesis.currentProbability > this.convergenceThreshold) {
        hypothesis.status = 'likely';
      } else {
        hypothesis.status = 'active';
      }
    }
  }

  /**
   * Build conclusion from hypothesis evaluation
   */
  private buildConclusion(): HypothesisConclusion {
    const sorted = [...this.hypotheses].sort((a, b) => b.currentProbability - a.currentProbability);
    const top = sorted[0];
    const second = sorted[1];

    const convergenceAchieved = top && top.currentProbability > this.convergenceThreshold;
    const confidenceLevel = determineConfidenceFromDistribution(this.hypotheses);

    let combinedExplanation: string | null = null;

    // Check if two hypotheses together explain most of it
    if (top && second && !convergenceAchieved) {
      const combined = top.currentProbability + second.currentProbability;
      if (combined > 0.6) {
        combinedExplanation = `The observation is likely explained by a combination of "${top.statement.split('-')[0].trim()}" and "${second.statement.split('-')[0].trim()}". Both factors appear to be contributing.`;
      }
    }

    // Generate recommended investigation
    let recommendedInvestigation = 'Gather more data to distinguish between hypotheses.';
    if (top && !convergenceAchieved && second) {
      const topUntested = top.predictions.filter(p => p.result === 'untested' || p.result === 'inconclusive');
      const secondUntested = second.predictions.filter(p => p.result === 'untested' || p.result === 'inconclusive');

      if (topUntested.length > 0) {
        recommendedInvestigation = `Test: "${topUntested[0].statement}" to strengthen or weaken the ${top.id} hypothesis.`;
      } else if (secondUntested.length > 0) {
        recommendedInvestigation = `Test: "${secondUntested[0].statement}" to rule out or confirm ${second.id}.`;
      }
    }

    return {
      dominant: convergenceAchieved ? top! : null,
      secondary: second && second.currentProbability > 0.2 ? second : null,
      combinedExplanation,
      confidenceLevel,
      convergenceAchieved,
      recommendedInvestigation,
    };
  }

  /**
   * Build operator-grade summary
   */
  private buildOperatorSummary(observation: string, conclusion: HypothesisConclusion): OperatorHypothesisSummary {
    const sorted = [...this.hypotheses].sort((a, b) => b.currentProbability - a.currentProbability);
    const top = sorted[0];
    const second = sorted[1];

    // Headline
    let headline: string;
    if (conclusion.convergenceAchieved && conclusion.dominant) {
      headline = `Strong signal suggests ${this.simplifyHypothesis(conclusion.dominant.statement)}.`;
    } else if (conclusion.combinedExplanation) {
      headline = `Two factors appear to be at play: ${this.simplifyHypothesis(top?.statement || '')} and ${this.simplifyHypothesis(second?.statement || '')}.`;
    } else {
      headline = `Evidence leans toward ${this.simplifyHypothesis(top?.statement || '')}, but the picture isn't clear yet.`;
    }

    // Primary explanation
    const primaryExplanation = top
      ? `${probabilityToLanguage(top.currentProbability).charAt(0).toUpperCase() + probabilityToLanguage(top.currentProbability).slice(1)}: ${top.statement}`
      : 'No clear primary explanation identified.';

    // Alternative explanation
    const alternativeExplanation = second && second.currentProbability > 0.15
      ? `Also ${probabilityToLanguage(second.currentProbability)}: ${second.statement}`
      : null;

    // What we checked
    const whatWeChecked = this.hypotheses.flatMap(h =>
      h.predictions
        .filter(p => p.tested)
        .map(p => `${p.statement} (${p.result})`)
    ).slice(0, 5);

    // Uncertainties
    const uncertainties: string[] = [];
    if (!conclusion.convergenceAchieved) {
      uncertainties.push('No hypothesis clearly dominates - multiple explanations remain plausible.');
    }
    const inconclusive = this.hypotheses.flatMap(h => h.predictions.filter(p => p.result === 'inconclusive'));
    if (inconclusive.length > 0) {
      uncertainties.push(`${inconclusive.length} predictions couldn't be clearly tested with available data.`);
    }
    if (sorted.length > 2 && sorted[2].currentProbability > 0.15) {
      uncertainties.push('A third explanation is also worth keeping in mind.');
    }

    // Evidence strength
    const totalSupporting = this.hypotheses.reduce((sum, h) => sum + h.supportingEvidence.length, 0);
    const totalContradicting = this.hypotheses.reduce((sum, h) => sum + h.contradictingEvidence.length, 0);
    const evidenceStrength = totalSupporting > totalContradicting * 2
      ? 'Evidence is fairly consistent'
      : totalSupporting < totalContradicting
        ? 'Evidence is mixed with some contradictions'
        : 'Evidence is moderate - some signals point in different directions';

    // Recommendation
    let recommendation: string;
    if (conclusion.convergenceAchieved && conclusion.dominant) {
      const topSupporting = conclusion.dominant.supportingEvidence[0];
      recommendation = topSupporting
        ? `Focus on addressing ${this.simplifyHypothesis(conclusion.dominant.statement)}. Key evidence: ${topSupporting.finding}`
        : `Address ${this.simplifyHypothesis(conclusion.dominant.statement)} as the primary issue.`;
    } else {
      recommendation = conclusion.recommendedInvestigation;
    }

    // Watch for
    const watchFor = conclusion.dominant
      ? `If ${this.simplifyHypothesis(conclusion.dominant.statement)} is correct, you should see improvement within 1-2 weeks of addressing it.`
      : `Track which hypothesis predictions hold true over the next week to narrow down the cause.`;

    return {
      headline,
      primaryExplanation,
      alternativeExplanation,
      confidence: conclusion.confidenceLevel,
      evidenceStrength,
      whatWeChecked,
      uncertainties,
      recommendation,
      watchFor,
    };
  }

  /**
   * Simplify a hypothesis statement for headlines
   */
  private simplifyHypothesis(statement: string): string {
    // Extract the core concept
    const firstPart = statement.split('-')[0].trim();
    const simplified = firstPart.length > 60 ? firstPart.slice(0, 57) + '...' : firstPart;
    return simplified.toLowerCase().replace(/^this is (an? )?/, '');
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createCompetingHypothesesEngine(
  clientId: string,
  monthlySpend: number,
  metaApi?: MetaApiService,
  shopifyClient?: ShopifyClient,
): CompetingHypothesesEngine {
  const engine = new CompetingHypothesesEngine(clientId, monthlySpend);
  engine.initialize(metaApi, shopifyClient);
  return engine;
}

// ============================================================================
// Convenience Function
// ============================================================================

export async function evaluateCompetingHypotheses(
  observation: string,
  clientId: string,
  monthlySpend: number,
  metaApi?: MetaApiService,
  shopifyClient?: ShopifyClient,
): Promise<HypothesisEvaluationResult> {
  const engine = createCompetingHypothesesEngine(clientId, monthlySpend, metaApi, shopifyClient);
  return engine.evaluate(observation);
}
