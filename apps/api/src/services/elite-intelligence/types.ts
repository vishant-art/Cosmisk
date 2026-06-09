/**
 * Elite Intelligence System - Type Definitions
 *
 * Core types for the multi-signal strategic intelligence system.
 */

// ============================================================================
// SIGNAL STRENGTH & CONFIDENCE
// ============================================================================

export type SignalStrength = 'verified' | 'strong' | 'moderate' | 'weak' | 'emerging';

export interface SignalMeta {
  strength: SignalStrength;
  confidence: number;        // 0-100
  sampleSize: number;
  timespan: '7d' | '14d' | '30d' | '90d';
  sources: string[];
  lastUpdated: string;
}

export interface Signal<T> {
  value: T;
  meta: SignalMeta;
}

export type TrendDirection = 'increasing' | 'stable' | 'declining';

export interface TrendSignal {
  current: number;
  previous: number;
  change: number;            // Percentage change
  direction: TrendDirection;
  velocity: number;          // Rate of change
}

// ============================================================================
// META SIGNALS (Ad Platform)
// ============================================================================

export interface MetaSignals {
  // Performance trajectory
  ctrTrend: Signal<TrendSignal>;
  cpcTrend: Signal<TrendSignal>;
  cpmTrend: Signal<TrendSignal>;
  roasTrend: Signal<TrendSignal>;
  cpaTrend: Signal<TrendSignal>;

  // Creative health
  creativeVelocity: Signal<number>;
  hookRetention: Signal<number>;          // 3-second view rate
  avgWatchTime: Signal<TrendSignal>;

  // Audience signals
  avgFrequency: Signal<TrendSignal>;
  audienceOverlap: Signal<number>;
  audienceQualityIndex: Signal<TrendSignal>;
  coldWarmRatio: Signal<number>;

  // Click to action
  clickToATCRate: Signal<TrendSignal>;
  clickToPurchaseRate: Signal<TrendSignal>;

  // By breakdown
  topCampaigns: CampaignSignal[];
  topCreatives: CreativeSignal[];
}

export interface CampaignSignal {
  id: string;
  name: string;
  spend: number;
  roas: number;
  cpa: number;
  trend: TrendDirection;
  issues: string[];
}

export interface CreativeSignal {
  id: string;
  name: string;
  spend: number;
  ctr: number;
  clickToATC: number;
  fatigueScore: number;
  format: string;
}

// ============================================================================
// SHOPIFY SIGNALS (Store Behavior)
// ============================================================================

export interface ShopifySignals {
  // Purchase behavior
  conversionRate: Signal<TrendSignal>;
  aov: Signal<TrendSignal>;
  cartAbandonRate: Signal<TrendSignal>;

  // Product signals
  bestsellerVelocity: ProductSignal[];
  oosRisk: ProductSignal[];

  // Customer quality
  repeatPurchaseRate: Signal<TrendSignal>;
  cohortLTV: CohortSignal[];
  returnsRate: Signal<TrendSignal>;

  // Payment signals
  codRate: Signal<TrendSignal>;
  codRTORate: Signal<TrendSignal>;
  prepaidRate: Signal<TrendSignal>;
}

export interface ProductSignal {
  id: string;
  name: string;
  velocity: number;
  trend: TrendDirection;
  daysToOOS: number | null;
  adSpend: number;
}

export interface CohortSignal {
  month: string;
  customers: number;
  avgLTV: number;
  repeatRate: number;
  discountFirstPurchase: number;
}

// ============================================================================
// COMMENT SIGNALS (Audience Psychology)
// ============================================================================

export interface CommentSignals {
  // Volume
  totalComments: number;
  commentsPerDay: Signal<TrendSignal>;

  // Sentiment
  sentimentDistribution: {
    positive: number;
    negative: number;
    neutral: number;
  };
  sentimentTrend: Signal<TrendDirection>;

  // Trust signals
  trustQuestioning: Signal<TrendSignal>;      // "Is this legit?" frequency
  legitimacyVerification: Signal<TrendSignal>;
  socialProofSeeking: Signal<TrendSignal>;

  // Purchase psychology
  buyingSignals: Signal<TrendSignal>;
  objectionFrequency: Signal<TrendSignal>;
  comparisonMentions: Signal<TrendSignal>;

  // Specific patterns
  topObjections: ObjectionSignal[];
  emergingObjections: ObjectionSignal[];
  topPraise: PraiseSignal[];
  emotionalTriggers: EmotionSignal[];
}

export interface ObjectionSignal {
  pattern: string;
  frequency: number;
  trend: TrendDirection;
  severity: 'critical' | 'high' | 'moderate' | 'low';
  exampleComments: string[];
}

export interface PraiseSignal {
  pattern: string;
  frequency: number;
  sentiment: number;
}

export interface EmotionSignal {
  emotion: string;
  frequency: number;
  trend: TrendDirection;
  intensity: number;
}

// ============================================================================
// FUNNEL SIGNALS (Conversion Path)
// ============================================================================

export interface FunnelSignals {
  // Drop-off rates
  adToSiteRate: Signal<TrendSignal>;
  siteToProductRate: Signal<TrendSignal>;
  productToCartRate: Signal<TrendSignal>;
  cartToCheckoutRate: Signal<TrendSignal>;
  checkoutToPurchaseRate: Signal<TrendSignal>;

  // Session quality
  avgSessionDuration: Signal<TrendSignal>;
  pagesPerSession: Signal<TrendSignal>;
  bounceRate: Signal<TrendSignal>;

  // Engagement depth
  productPageScrollDepth: Signal<number>;
  reviewReadRate: Signal<number>;
  sizeGuideUsage: Signal<number>;
}

// ============================================================================
// OPERATIONAL SIGNALS (Fulfillment & Support)
// ============================================================================

export interface OperationalSignals {
  // Delivery
  avgDeliveryDays: Signal<TrendSignal>;
  deliveryComplaintRate: Signal<TrendSignal>;
  shippingCostComplaints: Signal<TrendSignal>;

  // Support
  supportTicketVolume: Signal<TrendSignal>;
  topSupportIssues: IssueSignal[];
  satisfactionScore: Signal<TrendSignal>;

  // Returns
  returnReasons: ReturnReasonSignal[];
  avgDaysToReturn: Signal<number>;
}

export interface IssueSignal {
  issue: string;
  frequency: number;
  trend: TrendDirection;
  avgResolutionTime: number;
}

export interface ReturnReasonSignal {
  reason: string;
  frequency: number;
  percentOfReturns: number;
}

// ============================================================================
// COMPETITIVE SIGNALS (Market Position)
// ============================================================================

export interface CompetitiveSignals {
  // Ad activity
  competitorAdVolume: Signal<TrendSignal>;
  competitors: CompetitorSignal[];

  // Positioning gaps
  unaddressedObjections: string[];
  narrativeWhitespace: string[];
  pricingGaps: string[];
}

export interface CompetitorSignal {
  name: string;
  adCount: number;
  hookStyles: string[];
  priceRange: string;
  recentChanges: string[];
}

// ============================================================================
// CREATOR SIGNALS (UGC/Influencer)
// ============================================================================

export interface CreatorSignals {
  // Performance
  creatorPerformance: CreatorPerformanceSignal[];
  trustTransferability: Signal<TrendSignal>;
  avgCreatorROAS: Signal<TrendSignal>;

  // Fatigue
  fatiguedCreators: string[];
  bestPerformingStyles: string[];
}

export interface CreatorPerformanceSignal {
  creatorId: string;
  creatorName: string;
  spend: number;
  roas: number;
  trustScore: number;
  fatigueScore: number;
}

// ============================================================================
// UNIFIED SIGNAL TAXONOMY
// ============================================================================

export interface SignalTaxonomy {
  meta: MetaSignals;
  shopify: ShopifySignals;
  comments: CommentSignals;
  funnel: FunnelSignals;
  operations: OperationalSignals;
  competitive: CompetitiveSignals;
  creator: CreatorSignals;

  // Metadata
  collectedAt: string;
  clientId: string;
  accountId: string;
}

// ============================================================================
// SYNTHESIS TYPES
// ============================================================================

export interface Correlation {
  id: string;
  signals: [string, string];
  correlationType: 'positive' | 'negative' | 'lagging' | 'leading';
  strength: number;           // 0-1
  lag: number;                // Days
  hypothesis: string;
  confidence: number;
}

export interface CausalChain {
  id: string;
  trigger: string;
  triggerValue: string;
  effects: CausalEffect[];
  confidence: number;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  timeHorizon: string;
}

export interface CausalEffect {
  signal: string;
  direction: 'increase' | 'decrease';
  magnitude: 'minor' | 'moderate' | 'major' | 'critical';
  delay: number;
  mechanism: string;
}

export interface Contradiction {
  id: string;
  signals: string[];
  conflict: string;
  possibleExplanations: string[];
  resolution: string | null;
  confidence: number;
  investigationSteps: string[];
}

// ============================================================================
// PSYCHOLOGY TYPES
// ============================================================================

export type TrustLevel = 'strong' | 'stable' | 'fragile' | 'eroding' | 'contaminated';

export type PurchaseState =
  | 'desire_active'
  | 'legitimacy_verification'
  | 'value_assessment'
  | 'risk_mitigation'
  | 'social_validation'
  | 'objection_processing'
  | 'comparison_shopping'
  | 'purchase_anxiety';

export interface AudiencePsychologyProfile {
  // Trust architecture
  trustState: {
    overall: TrustLevel;
    trajectory: 'building' | 'stable' | 'eroding' | 'contaminated';
    primaryThreat: string | null;
    brandTrust: TrustLevel;
    productTrust: TrustLevel;
    operationalTrust: TrustLevel;
  };

  // Purchase state
  purchaseState: {
    dominant: PurchaseState;
    blockers: PurchaseBlocker[];
    accelerators: string[];
  };

  // Emotional state
  emotionalState: {
    dominant: string[];
    emerging: string[];
    fading: string[];
    volatility: 'stable' | 'shifting' | 'volatile';
  };

  // Cognitive state
  cognitiveState: {
    informationSeeking: 'minimal' | 'moderate' | 'extensive';
    comparisonMode: boolean;
    skepticismLevel: 'low' | 'moderate' | 'high' | 'extreme';
  };
}

export interface PurchaseBlocker {
  blocker: string;
  severity: 'critical' | 'high' | 'moderate' | 'low';
  affectedSegments: string[];
  evidenceStrength: number;
  removalStrategy: string;
}

// ============================================================================
// PREDICTION TYPES
// ============================================================================

export interface Forecast {
  id: string;
  signal: string;
  currentValue: number;
  predictedValue: number;
  horizon: '7d' | '14d' | '30d';
  confidence: number;
  basis: string[];
  earlyWarnings: string[];

  impact: ForecastImpact[];
  intervention: {
    toPrevent: string[];
    toAccelerate: string[];
    windowDays: number;
  };
}

export interface ForecastImpact {
  metric: string;
  direction: 'positive' | 'negative';
  magnitude: 'minor' | 'moderate' | 'major' | 'critical';
  daysToImpact: number;
}

// ============================================================================
// SYSTEMIC TYPES
// ============================================================================

export type SystemHealth = 'healthy' | 'stressed' | 'degrading' | 'critical';

export interface SystemicMap {
  triggerSignal: string;
  triggerValue: string;

  directEffects: SystemEffect[];
  indirectEffects: SystemEffect[];
  hiddenEffects: SystemEffect[];

  systemHealth: {
    acquisition: SystemHealth;
    conversion: SystemHealth;
    retention: SystemHealth;
    economics: SystemHealth;
    brand: SystemHealth;
  };

  interventionPriority: string;
}

export interface SystemEffect {
  system: string;
  effect: string;
  mechanism: string;
  timelag: number;
  certainty: number;
}

// ============================================================================
// THE ONE THING
// ============================================================================

export interface TheOneThing {
  statement: string;

  reasoning: {
    leverage: string;
    urgency: string;
    cascadeEffect: string;
    comparedTo: string[];
  };

  impact: {
    metricImproved: string;
    estimatedImprovement: string;
    confidence: number;
    timeToImpact: string;
  };

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

  confidenceBasis: {
    score: number;
    basis: string[];
    uncertainties: string[];
  };
}

// ============================================================================
// FINAL OUTPUT
// ============================================================================

export interface EliteIntelligenceOutput {
  // Executive summary
  theOneThing: TheOneThing;

  // Strategic direction
  strategicDirection: {
    currentState: string;
    desiredState: string;
    transition: string;
    timeframe: string;
    confidence: number;
  };

  // Psychology
  audiencePsychology: AudiencePsychologyProfile;

  // Predictions
  predictions: {
    forecasts: Forecast[];
    earlyWarnings: string[];
    windows: { opportunity: string; closingDays: number }[];
  };

  // Systemic
  systemicAnalysis: {
    healthScores: SystemicMap['systemHealth'];
    criticalConnections: CausalChain[];
    cascadeRisks: SystemicMap[];
  };

  // Granular
  granular: {
    byProduct: { productId: string; insight: string; action: string }[];
    byCampaign: { campaignId: string; insight: string; action: string }[];
    byCreative: { creativeId: string; insight: string; action: string }[];
  };

  // Execution
  executionPlaybook: ExecutionPlaybook;

  // Confidence
  confidenceReport: {
    overallConfidence: number;
    verifiedInsights: string[];
    strongInsights: string[];
    emergingPatterns: string[];
    uncertainties: string[];
    contradictions: Contradiction[];
  };

  // Metadata
  generatedAt: string;
  clientId: string;
  signalSources: string[];
}

export interface ExecutionPlaybook {
  immediate: ExecutionItem[];
  thisWeek: ExecutionItem[];
  thisMonth: ExecutionItem[];
  systemicChanges: ExecutionItem[];
}

export interface ExecutionItem {
  action: string;
  specifics: string;
  owner: string;
  successCriteria: string;
  blocksWhat: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}
