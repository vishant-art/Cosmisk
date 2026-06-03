/**
 * Cohort LTV Analyzer — shared types (leaf module)
 */

// ============ TYPES ============

export interface AcquisitionSource {
  key: string;         // Normalized key (meta_ads, google_ads, direct, etc.)
  displayName: string; // Display name (Meta Ads, Google Ads, Direct/Organic)
  rawSources: string[]; // Original UTM sources grouped under this
}

export interface ChannelMetrics {
  channel: string;
  displayName: string;
  customers: number;
  totalRevenue: number;
  avgLTV: number;
  repeatCustomers: number;
  repeatRate: number;
  avgOrdersPerCustomer: number;
  avgOrderValue: number;
  // Comparison
  ltvVsAverage: number; // % above/below average
  repeatVsAverage: number; // % above/below average
}

export interface MonthlyCohort {
  month: string;      // YYYY-MM
  newCustomers: number;
  totalRevenue: number;
  avgLTV: number;
  repeatCustomers: number;
  repeatRate: number;
}

export interface CohortLTVAnalysis {
  // Period info
  period: string;
  daysAnalyzed: number;

  // Overall metrics
  totalOrders: number;
  totalCustomers: number;
  totalRevenue: number;
  avgAccountLTV: number;
  avgRepeatRate: number;

  // Channel breakdown
  channels: ChannelMetrics[];
  bestChannel: ChannelMetrics | null;
  worstChannel: ChannelMetrics | null;

  // Monthly cohorts
  monthlyCohorts: MonthlyCohort[];

  // LTV gap (opportunity)
  ltvGap: number;
  ltvGapExplanation: string;

  // Recommendations
  recommendations: string[];

  // Data quality
  dataQuality: 'high' | 'medium' | 'low';
  attributionRate: number; // % of customers with known acquisition source

  // Metadata
  analyzedAt: string;
}

export interface ActionableRecommendation {
  type: 'budget_shift' | 'retention' | 'attribution' | 'lookalike' | 'healthy';
  priority: 'high' | 'medium' | 'low';
  insight: string;
  action: string;
  expectedImpact: string;
}

export interface CohortLTVQuickCheck {
  hasSignificantGap: boolean;
  bestChannel: string;
  worstChannel: string;
  ltvGap: number;
  ltvGapPercent: number;
  topAction: ActionableRecommendation | null;
  summary: string;
}

export interface ClientCohortLTVReport extends CohortLTVAnalysis {
  clientId: string;
  clientName: string;
  revenueLevel: string;
  gapThreshold: number;
  shouldAlert: boolean;
  alertReason?: string;
}
