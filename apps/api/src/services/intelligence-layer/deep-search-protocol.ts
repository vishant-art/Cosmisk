/**
 * Deep Search Protocol
 *
 * Defines the MINIMUM searches required before concluding "no insight exists."
 * For high-spend accounts (₹10L+/month), hidden patterns ALWAYS exist.
 * The question is: Did we search deeply enough?
 *
 * This protocol ensures agents exhaust all signal sources before giving up.
 */

import type { SignalSource } from '../quality-governance/explainable-quality-engine.js';

// ============================================================================
// Search Depth Tiers (based on monthly ad spend)
// ============================================================================

export type SpendTier = 'starter' | 'growth' | 'scale' | 'enterprise';

export function getSpendTier(monthlySpend: number): SpendTier {
  if (monthlySpend >= 5000000) return 'enterprise'; // ₹50L+
  if (monthlySpend >= 1000000) return 'scale';      // ₹10L+
  if (monthlySpend >= 300000) return 'growth';      // ₹3L+
  return 'starter';
}

// ============================================================================
// Mandatory Search Requirements by Tier
// ============================================================================

export interface SearchRequirement {
  source: SignalSource;
  description: string;
  minDataPoints: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  fetchFunction: string; // Name of function to call
}

export const SEARCH_REQUIREMENTS: Record<SpendTier, SearchRequirement[]> = {
  enterprise: [
    // CRITICAL - Must search ALL of these
    { source: 'meta_ads', description: 'Ad performance by creative, audience, placement', minDataPoints: 50, priority: 'critical', fetchFunction: 'fetchMetaAdsPerformance' },
    { source: 'shopify_orders', description: 'Order patterns, AOV, product mix', minDataPoints: 100, priority: 'critical', fetchFunction: 'fetchShopifyOrders' },
    { source: 'shopify_customers', description: 'Customer cohorts, LTV, repeat rates', minDataPoints: 50, priority: 'critical', fetchFunction: 'fetchShopifyCustomers' },
    { source: 'ad_comments', description: 'Comment sentiment, trust signals, objections', minDataPoints: 20, priority: 'critical', fetchFunction: 'fetchAdComments' },
    { source: 'creative_performance', description: 'Hook performance, format effectiveness', minDataPoints: 20, priority: 'critical', fetchFunction: 'fetchCreativePerformance' },
    // HIGH - Should search these
    { source: 'cohort_analysis', description: 'Customer segments by acquisition source', minDataPoints: 10, priority: 'high', fetchFunction: 'fetchCohortAnalysis' },
    { source: 'inventory_data', description: 'Stock levels, velocity, OOS risk', minDataPoints: 20, priority: 'high', fetchFunction: 'fetchInventoryData' },
    { source: 'discount_tracking', description: 'Coupon usage, leakage, margin impact', minDataPoints: 10, priority: 'high', fetchFunction: 'fetchDiscountTracking' },
    { source: 'audience_overlap', description: 'Audience saturation, frequency caps', minDataPoints: 5, priority: 'high', fetchFunction: 'fetchAudienceOverlap' },
    // MEDIUM - Search if time permits
    { source: 'competitor_intel', description: 'Competitor ads, hooks, positioning', minDataPoints: 10, priority: 'medium', fetchFunction: 'fetchCompetitorIntel' },
    { source: 'attribution_data', description: 'Attribution windows, conversion paths', minDataPoints: 10, priority: 'medium', fetchFunction: 'fetchAttributionData' },
    { source: 'creator_performance', description: 'Creator effectiveness, trust decay', minDataPoints: 5, priority: 'medium', fetchFunction: 'fetchCreatorPerformance' },
    { source: 'funnel_behavior', description: 'Stage progression, drop-off points', minDataPoints: 10, priority: 'medium', fetchFunction: 'fetchFunnelBehavior' },
    { source: 'trust_signals', description: 'Payment methods, return rates, reviews', minDataPoints: 10, priority: 'medium', fetchFunction: 'fetchTrustSignals' },
    { source: 'pricing_data', description: 'Price sensitivity, discount effectiveness', minDataPoints: 5, priority: 'medium', fetchFunction: 'fetchPricingData' },
  ],
  scale: [
    { source: 'meta_ads', description: 'Ad performance by creative, audience', minDataPoints: 30, priority: 'critical', fetchFunction: 'fetchMetaAdsPerformance' },
    { source: 'shopify_orders', description: 'Order patterns, AOV', minDataPoints: 50, priority: 'critical', fetchFunction: 'fetchShopifyOrders' },
    { source: 'shopify_customers', description: 'Customer LTV, repeat rates', minDataPoints: 30, priority: 'critical', fetchFunction: 'fetchShopifyCustomers' },
    { source: 'creative_performance', description: 'Hook performance', minDataPoints: 10, priority: 'critical', fetchFunction: 'fetchCreativePerformance' },
    { source: 'ad_comments', description: 'Comment sentiment', minDataPoints: 10, priority: 'high', fetchFunction: 'fetchAdComments' },
    { source: 'inventory_data', description: 'Stock levels, OOS risk', minDataPoints: 10, priority: 'high', fetchFunction: 'fetchInventoryData' },
    { source: 'discount_tracking', description: 'Coupon usage', minDataPoints: 5, priority: 'high', fetchFunction: 'fetchDiscountTracking' },
    { source: 'cohort_analysis', description: 'Customer segments', minDataPoints: 5, priority: 'medium', fetchFunction: 'fetchCohortAnalysis' },
  ],
  growth: [
    { source: 'meta_ads', description: 'Ad performance', minDataPoints: 20, priority: 'critical', fetchFunction: 'fetchMetaAdsPerformance' },
    { source: 'shopify_orders', description: 'Order patterns', minDataPoints: 30, priority: 'critical', fetchFunction: 'fetchShopifyOrders' },
    { source: 'creative_performance', description: 'Creative effectiveness', minDataPoints: 5, priority: 'high', fetchFunction: 'fetchCreativePerformance' },
    { source: 'inventory_data', description: 'Stock levels', minDataPoints: 5, priority: 'high', fetchFunction: 'fetchInventoryData' },
  ],
  starter: [
    { source: 'meta_ads', description: 'Ad performance', minDataPoints: 10, priority: 'critical', fetchFunction: 'fetchMetaAdsPerformance' },
    { source: 'shopify_orders', description: 'Order patterns', minDataPoints: 10, priority: 'critical', fetchFunction: 'fetchShopifyOrders' },
  ],
};

// ============================================================================
// Cross-Correlation Requirements
// ============================================================================

export interface CrossCorrelation {
  sources: [SignalSource, SignalSource];
  description: string;
  insightType: string;
  priority: 'critical' | 'high' | 'medium';
}

export const MANDATORY_CORRELATIONS: Record<SpendTier, CrossCorrelation[]> = {
  enterprise: [
    // CRITICAL correlations - must attempt
    { sources: ['meta_ads', 'shopify_orders'], description: 'Ad spend vs actual revenue (not just ROAS)', insightType: 'revenue_attribution', priority: 'critical' },
    { sources: ['creative_performance', 'ad_comments'], description: 'Creative CTR vs audience sentiment', insightType: 'creative_trust', priority: 'critical' },
    { sources: ['meta_ads', 'inventory_data'], description: 'Ad spend vs stock availability (OOS waste)', insightType: 'oos_waste', priority: 'critical' },
    { sources: ['shopify_customers', 'discount_tracking'], description: 'LTV by discount usage (margin erosion)', insightType: 'discount_ltv', priority: 'critical' },
    // HIGH correlations
    { sources: ['creative_performance', 'audience_overlap'], description: 'Creative fatigue vs audience saturation', insightType: 'fatigue_saturation', priority: 'high' },
    { sources: ['shopify_orders', 'cohort_analysis'], description: 'Order value by acquisition cohort', insightType: 'cohort_value', priority: 'high' },
    { sources: ['ad_comments', 'trust_signals'], description: 'Comment sentiment vs payment/return behavior', insightType: 'trust_correlation', priority: 'high' },
    { sources: ['creator_performance', 'shopify_customers'], description: 'Creator audience vs customer LTV', insightType: 'creator_ltv', priority: 'high' },
    // MEDIUM correlations
    { sources: ['meta_ads', 'competitor_intel'], description: 'Performance vs competitor positioning', insightType: 'competitive_gap', priority: 'medium' },
    { sources: ['funnel_behavior', 'creative_performance'], description: 'Funnel stage vs creative type effectiveness', insightType: 'funnel_creative', priority: 'medium' },
  ],
  scale: [
    { sources: ['meta_ads', 'shopify_orders'], description: 'Ad spend vs revenue', insightType: 'revenue_attribution', priority: 'critical' },
    { sources: ['meta_ads', 'inventory_data'], description: 'Ad spend vs stock (OOS)', insightType: 'oos_waste', priority: 'critical' },
    { sources: ['creative_performance', 'ad_comments'], description: 'Creative vs sentiment', insightType: 'creative_trust', priority: 'high' },
    { sources: ['shopify_customers', 'discount_tracking'], description: 'LTV vs discounts', insightType: 'discount_ltv', priority: 'high' },
  ],
  growth: [
    { sources: ['meta_ads', 'shopify_orders'], description: 'Ad spend vs revenue', insightType: 'revenue_attribution', priority: 'critical' },
    { sources: ['meta_ads', 'inventory_data'], description: 'Ad spend vs stock', insightType: 'oos_waste', priority: 'high' },
  ],
  starter: [
    { sources: ['meta_ads', 'shopify_orders'], description: 'Ad spend vs revenue', insightType: 'revenue_attribution', priority: 'critical' },
  ],
};

// ============================================================================
// Hidden Pattern Areas (MUST search for high-spend accounts)
// ============================================================================

export interface HiddenPatternSearch {
  area: string;
  description: string;
  searchMethod: string;
  expectedFindRate: number; // How often this reveals something (0-1)
}

export const HIDDEN_PATTERN_SEARCHES: HiddenPatternSearch[] = [
  { area: 'audience_fatigue_microsegments', description: 'Specific audience segments showing fatigue while others thrive', searchMethod: 'Segment CTR by age/gender/location combos, find divergence', expectedFindRate: 0.85 },
  { area: 'creator_trust_decay', description: 'Creator effectiveness declining over time', searchMethod: 'Track creator CTR/CVR trajectory over 30 days', expectedFindRate: 0.70 },
  { area: 'pricing_elasticity_by_cohort', description: 'Different cohorts respond differently to pricing', searchMethod: 'Compare AOV by acquisition source', expectedFindRate: 0.60 },
  { area: 'attribution_leakage', description: 'Revenue not attributed to ads (branded search, direct)', searchMethod: 'Compare Shopify revenue to Meta attributed revenue', expectedFindRate: 0.90 },
  { area: 'discount_cannibalization', description: 'Discounts capturing sales that would happen anyway', searchMethod: 'Compare discount usage by new vs returning customers', expectedFindRate: 0.75 },
  { area: 'inventory_velocity_mismatch', description: 'Ad spend not aligned with stock velocity', searchMethod: 'Compare top ad spend products to top selling products', expectedFindRate: 0.80 },
  { area: 'weekend_weekday_behavioral_shift', description: 'Performance varies by day of week', searchMethod: 'Segment all metrics by day of week', expectedFindRate: 0.65 },
  { area: 'new_vs_returning_cpa_divergence', description: 'CPA for new customers diverging from returning', searchMethod: 'Calculate CPA by customer type', expectedFindRate: 0.70 },
  { area: 'geographic_profitability_variance', description: 'Some cities profitable, others not', searchMethod: 'Calculate ROAS/CPA by city', expectedFindRate: 0.80 },
  { area: 'hook_fatigue_by_audience', description: 'Same hook works for some audiences, not others', searchMethod: 'Cross-tab hook type by audience segment performance', expectedFindRate: 0.75 },
  { area: 'time_of_day_efficiency', description: 'Certain hours more efficient than others', searchMethod: 'Segment performance by hour', expectedFindRate: 0.60 },
  { area: 'product_category_margin_variance', description: 'Some categories have hidden margin issues', searchMethod: 'Calculate true profit by product category', expectedFindRate: 0.70 },
  { area: 'return_rate_by_creative', description: 'Certain creatives driving high returns', searchMethod: 'Match creative IDs to return rates', expectedFindRate: 0.55 },
  { area: 'payment_method_trust_signal', description: 'COD vs prepaid reveals trust state', searchMethod: 'Track payment method ratio trends', expectedFindRate: 0.65 },
  { area: 'comment_sentiment_leading_indicator', description: 'Negative comments predict performance drop', searchMethod: 'Correlate comment sentiment to 7-day forward performance', expectedFindRate: 0.50 },
];

// ============================================================================
// Search Protocol Tracker
// ============================================================================

export interface SearchAttempt {
  source: SignalSource;
  attempted: boolean;
  successful: boolean;
  dataPointsFound: number;
  errorMessage?: string;
  timestamp: Date;
}

export interface CorrelationAttempt {
  sources: [SignalSource, SignalSource];
  attempted: boolean;
  successful: boolean;
  insightFound: boolean;
  insight?: string;
  timestamp: Date;
}

export interface HiddenPatternAttempt {
  area: string;
  attempted: boolean;
  successful: boolean;
  patternFound: boolean;
  finding?: string;
  timestamp: Date;
}

export interface SearchProtocolState {
  clientId: string;
  spendTier: SpendTier;
  monthlySpend: number;
  searchAttempts: SearchAttempt[];
  correlationAttempts: CorrelationAttempt[];
  hiddenPatternAttempts: HiddenPatternAttempt[];
  startedAt: Date;
  completedAt?: Date;
  currentDepth: number;
  maxDepth: number;
}

export function createSearchProtocol(clientId: string, monthlySpend: number): SearchProtocolState {
  const spendTier = getSpendTier(monthlySpend);
  const requirements = SEARCH_REQUIREMENTS[spendTier];

  return {
    clientId,
    spendTier,
    monthlySpend,
    searchAttempts: requirements.map(req => ({
      source: req.source,
      attempted: false,
      successful: false,
      dataPointsFound: 0,
      timestamp: new Date(),
    })),
    correlationAttempts: MANDATORY_CORRELATIONS[spendTier].map(corr => ({
      sources: corr.sources,
      attempted: false,
      successful: false,
      insightFound: false,
      timestamp: new Date(),
    })),
    hiddenPatternAttempts: spendTier === 'enterprise' || spendTier === 'scale'
      ? HIDDEN_PATTERN_SEARCHES.map(hp => ({
          area: hp.area,
          attempted: false,
          successful: false,
          patternFound: false,
          timestamp: new Date(),
        }))
      : [],
    startedAt: new Date(),
    currentDepth: 0,
    maxDepth: spendTier === 'enterprise' ? 5 : spendTier === 'scale' ? 3 : 2,
  };
}

// ============================================================================
// Protocol Evaluation
// ============================================================================

export interface ProtocolEvaluation {
  isComplete: boolean;
  completionPercentage: number;
  criticalSearchesDone: number;
  criticalSearchesRequired: number;
  correlationsAttempted: number;
  correlationsRequired: number;
  hiddenPatternsSearched: number;
  missedSearches: SearchRequirement[];
  missedCorrelations: CrossCorrelation[];
  recommendation: 'SHIP' | 'GO_DEEPER' | 'MAX_DEPTH_REACHED';
  nextSearches: SearchRequirement[];
  reasoning: string;
}

export function evaluateProtocol(state: SearchProtocolState): ProtocolEvaluation {
  const requirements = SEARCH_REQUIREMENTS[state.spendTier];
  const correlations = MANDATORY_CORRELATIONS[state.spendTier];

  // Count critical searches
  const criticalRequired = requirements.filter(r => r.priority === 'critical');
  const criticalDone = state.searchAttempts.filter(
    s => s.attempted && s.successful &&
    criticalRequired.some(r => r.source === s.source)
  );

  // Count correlations
  const correlationsAttempted = state.correlationAttempts.filter(c => c.attempted).length;
  const correlationsRequired = correlations.filter(c => c.priority === 'critical').length;

  // Count hidden patterns
  const hiddenPatternsSearched = state.hiddenPatternAttempts.filter(h => h.attempted).length;

  // Find missed searches
  const missedSearches = requirements.filter(req => {
    const attempt = state.searchAttempts.find(s => s.source === req.source);
    return !attempt?.attempted || !attempt?.successful;
  });

  // Find missed correlations
  const missedCorrelations = correlations.filter(corr => {
    const attempt = state.correlationAttempts.find(
      c => c.sources[0] === corr.sources[0] && c.sources[1] === corr.sources[1]
    );
    return !attempt?.attempted;
  });

  // Calculate completion
  const totalRequired = criticalRequired.length + correlationsRequired;
  const totalDone = criticalDone.length + Math.min(correlationsAttempted, correlationsRequired);
  const completionPercentage = Math.round((totalDone / totalRequired) * 100);

  // Determine recommendation
  let recommendation: 'SHIP' | 'GO_DEEPER' | 'MAX_DEPTH_REACHED';
  let reasoning: string;

  if (state.currentDepth >= state.maxDepth) {
    recommendation = 'MAX_DEPTH_REACHED';
    reasoning = `Reached maximum search depth (${state.maxDepth}). ${missedSearches.length} sources still not searched. Shipping with available data.`;
  } else if (criticalDone.length < criticalRequired.length) {
    recommendation = 'GO_DEEPER';
    reasoning = `Only ${criticalDone.length}/${criticalRequired.length} critical sources searched. Must search: ${missedSearches.filter(m => m.priority === 'critical').map(m => m.source).join(', ')}`;
  } else if (correlationsAttempted < correlationsRequired) {
    recommendation = 'GO_DEEPER';
    reasoning = `Only ${correlationsAttempted}/${correlationsRequired} critical correlations attempted. Missing cross-source synthesis.`;
  } else if (completionPercentage >= 80) {
    recommendation = 'SHIP';
    reasoning = `${completionPercentage}% search protocol complete. All critical sources and correlations covered.`;
  } else {
    recommendation = 'GO_DEEPER';
    reasoning = `Only ${completionPercentage}% complete. More sources available to search.`;
  }

  // Determine next searches (prioritized)
  const nextSearches = missedSearches
    .sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    })
    .slice(0, 3);

  return {
    isComplete: recommendation === 'SHIP' || recommendation === 'MAX_DEPTH_REACHED',
    completionPercentage,
    criticalSearchesDone: criticalDone.length,
    criticalSearchesRequired: criticalRequired.length,
    correlationsAttempted,
    correlationsRequired,
    hiddenPatternsSearched,
    missedSearches,
    missedCorrelations,
    recommendation,
    nextSearches,
    reasoning,
  };
}

// ============================================================================
// Update Protocol State
// ============================================================================

export function recordSearchAttempt(
  state: SearchProtocolState,
  source: SignalSource,
  success: boolean,
  dataPoints: number,
  error?: string
): SearchProtocolState {
  const attempts = state.searchAttempts.map(s =>
    s.source === source
      ? { ...s, attempted: true, successful: success, dataPointsFound: dataPoints, errorMessage: error, timestamp: new Date() }
      : s
  );

  return { ...state, searchAttempts: attempts };
}

export function recordCorrelationAttempt(
  state: SearchProtocolState,
  sources: [SignalSource, SignalSource],
  success: boolean,
  insightFound: boolean,
  insight?: string
): SearchProtocolState {
  const attempts = state.correlationAttempts.map(c =>
    c.sources[0] === sources[0] && c.sources[1] === sources[1]
      ? { ...c, attempted: true, successful: success, insightFound, insight, timestamp: new Date() }
      : c
  );

  return { ...state, correlationAttempts: attempts };
}

export function recordHiddenPatternAttempt(
  state: SearchProtocolState,
  area: string,
  success: boolean,
  patternFound: boolean,
  finding?: string
): SearchProtocolState {
  const attempts = state.hiddenPatternAttempts.map(h =>
    h.area === area
      ? { ...h, attempted: true, successful: success, patternFound, finding, timestamp: new Date() }
      : h
  );

  return { ...state, hiddenPatternAttempts: attempts };
}

export function incrementDepth(state: SearchProtocolState): SearchProtocolState {
  return { ...state, currentDepth: state.currentDepth + 1 };
}

export function completeProtocol(state: SearchProtocolState): SearchProtocolState {
  return { ...state, completedAt: new Date() };
}
