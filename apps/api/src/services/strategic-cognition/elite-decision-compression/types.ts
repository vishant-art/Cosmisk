/**
 * Elite Decision Compression — shared public types (leaf module).
 *
 * Extracted verbatim from the original elite-decision-compression.ts.
 * No behavior change.
 */

export interface AccountDecomposition {
  // Warm vs Cold Reality
  warmAudienceShare: number;           // % of conversions from retargeting/warm
  coldAcquisitionEfficiency: number;   // True prospecting ROAS
  warmAudienceRunway: number;          // Days until warm audience exhausted
  acquisitionHealthScore: number;      // 0-100: Are we actually acquiring?

  // Quality Decomposition
  blendedROAS: number;                 // What dashboard shows
  trueAcquisitionROAS: number;         // Cold audience only
  roasMirageScore: number;             // How much is warm recycling inflating reported ROAS

  // Retention Signal
  repeatPurchaseRate: number;
  firstPurchaseLTV: number;
  returnRate: number;
  netMarginPerAcquisition: number;
}

export interface GeographicAsymmetry {
  region: string;
  spendShare: number;
  roasMultiple: number;               // vs account average
  conversionVelocity: number;         // conversions per 1000 impressions
  competitionDensity: number;         // estimated from CPM
  untappedPotential: number;          // ₹/month opportunity
  scalingFriction: string;            // What blocks scaling here
}

export interface CreativeSystemHealth {
  winnerConcentration: number;        // % spend on top creative
  winnerFatigueDays: number;          // Days until top creative exhausts
  pipelineDepth: number;              // Proven backups ready
  testingVelocity: number;            // New creatives tested/week
  clickToATCSpread: number;           // Variance in Click→ATC across creatives
  persuasionSystemStrength: number;   // How differentiated is messaging
}

export interface AudienceQualityDecay {
  frequencyTrend: number[];           // Last 4 weeks
  ctrTrend: number[];                 // Last 4 weeks
  conversionRateTrend: number[];      // Last 4 weeks
  audienceExhaustionScore: number;    // 0-100
  daysUntilCritical: number;
  requiredAudienceExpansion: number;  // % increase needed
}

export interface HiddenContradiction {
  signal1: {
    metric: string;
    direction: 'improving' | 'stable' | 'declining';
    value: string;
  };
  signal2: {
    metric: string;
    direction: 'improving' | 'stable' | 'declining';
    value: string;
  };
  contradiction: string;              // What this tension reveals
  implications: string;               // Why this matters economically
  urgency: 'critical' | 'important' | 'monitor';
  economicImpact: number;             // ₹/month at risk or opportunity
}

export interface StrategicLeverage {
  id: string;
  type: 'geographic' | 'creative' | 'audience' | 'pricing' | 'retention' | 'trust';
  title: string;
  currentState: string;
  targetState: string;
  economicImpact: number;             // ₹/month
  implementationDifficulty: 'trivial' | 'moderate' | 'complex';
  timeToImpact: string;
  specificAction: string;             // Not "monitor" - actual operational change
  whyNotObvious: string;              // Why operator wouldn't see this manually
}

export interface TheOneThing {
  category: 'risk' | 'leverage' | 'blocker' | 'quality' | 'scaling';
  headline: string;                   // One sentence that changes thinking
  context: string;                    // Why this matters more than everything else
  economicMagnitude: number;          // ₹/month
  invisibilityReason: string;         // Why dashboards don't show this
  actionSystem: ActionSystem;         // Specific operational intervention
  confidenceLevel: 'high' | 'moderate' | 'hypothesis';
  verificationPath: string;           // How to validate this insight
}

export interface ActionSystem {
  type: 'budget_shift' | 'audience_reallocation' | 'creative_rotation' | 'geographic_expansion' | 'frequency_cap' | 'funnel_fix' | 'retention_workflow';
  parameters: Record<string, number | string>;
  expectedOutcome: string;
  measurementPlan: string;
  rollbackTrigger: string;
}

export interface EliteIntelligenceOutput {
  // The One Thing (most important)
  biggestRisk: TheOneThing | null;
  biggestLeverage: TheOneThing | null;
  biggestBlocker: TheOneThing | null;

  // Hidden Contradictions
  contradictions: HiddenContradiction[];

  // Decomposed Reality (not blended metrics)
  accountDecomposition: AccountDecomposition;

  // Asymmetric Opportunities
  geographicAsymmetries: GeographicAsymmetry[];

  // System Health
  creativeSystemHealth: CreativeSystemHealth;
  audienceQualityDecay: AudienceQualityDecay;

  // All Leverage Points (ranked)
  strategicLeverages: StrategicLeverage[];

  // Quality Gate
  founderWowScore: number;            // 0-100: Would this impress a ₹50L+/month founder?
  qualityGatePass: boolean;
  rejectionReasons: string[];

  // Meta
  analysisDepth: 'shallow' | 'standard' | 'deep';
  crossPlatformSynthesis: string[];   // What data sources were combined
  impossibleManuallyBecause: string;  // Why this insight requires automation
}

// ============================================================================
// Types for input data
// ============================================================================

export interface MetaAdsData {
  current: {
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    revenue: number;
    roas: number;
    cpa: number;
    ctr: number;
    frequency: number;
    reach: number;
  };
  changes: {
    roasChange: number;
    cpaChange: number;
    spendChange: number;
    frequencyChange?: number;
  };
  campaigns: Array<{
    name: string;
    spend: number;
    conversions: number;
    revenue: number;
    ctr: number;
    frequency: number;
    reach?: number;
  }>;
  ads: Array<{
    name: string;
    spend: number;
    conversions: number;
    revenue: number;
    ctr: number;
    frequency: number;
  }>;
  regions: Array<{
    name: string;
    spend: number;
    conversions: number;
    revenue: number;
    impressions: number;
  }>;
  dailyMetrics?: Array<{
    date: string;
    spend: number;
    ctr: number;
    reach: number;
    frequency: number;
  }>;
}

export interface ShopifyData {
  orders: any[];
  customers: any[];
  returnRate: number;
  repeatPurchaseRate: number;
}

export interface CompetitorData {
  competitors: any[];
  industryPatterns: any;
}

export interface CommentData {
  comments: any[];
  sentiment: any;
}

export interface HistoricalData {
  weeklyMetrics: any[];
  monthlyMetrics: any[];
}
