/**
 * Adaptive Audit System - Type Definitions
 */

// ============ BRAND ============

export interface Brand {
  id: string;
  name: string;
  domain: string;
  category: BrandCategory;
  stage: BrandStage;
  metaAdAccountId: string | null;
  googleAdsCustomerId: string | null;
  pixelId: string | null;
  shopifyDomain: string | null;
  createdAt: string;
}

export type BrandCategory =
  | 'fashion'
  | 'beauty'
  | 'perfume'
  | 'food'
  | 'electronics'
  | 'home'
  | 'health'
  | 'jewelry'
  | 'other';

export type BrandStage = 'early' | 'scaling' | 'mature';

export interface BrandContext {
  brandId: string;
  pricePoint: 'budget' | 'mid' | 'premium' | 'luxury';
  targetAudience: string | null;
  winningCreativePatterns: string[];
  failedApproaches: string[];
  updatedAt: string;
}

// ============ META DATA SNAPSHOTS ============

export interface MetaSnapshot {
  capturedAt: string;
  dateRange: { start: string; end: string };
  adAccountId: string;

  // Account level
  totalSpend: number;
  totalPurchases: number;
  totalRevenue: number;
  overallRoas: number;
  overallCpa: number;

  // Creative breakdown (THE KEY DATA)
  creatives: CreativePerformance[];

  // Pixel health
  pixelHealth: {
    advancedMatchingEnabled: boolean;
    lastFiredTime: string | null;
  };

  // Audiences
  customAudienceCount: number;
  lookalikeCount: number;
}

export interface CreativePerformance {
  adId: string;
  adName: string;
  creativeType: 'image' | 'video' | 'carousel' | 'unknown';

  // Core metrics
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;

  // Calculated
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;

  // Funnel metrics
  landingPageViews: number;
  addToCarts: number;
  checkouts: number;

  // Rates
  clickToLpvRate: number;
  lpvToAtcRate: number;
  atcToPurchaseRate: number;

  // Creative copy (if available)
  primaryText: string | null;
  headline: string | null;
}

// ============ AUDIT ============

export interface AuditInput {
  brandId: string;
  brand: Brand;
  context: BrandContext | null;
  metaData: MetaSnapshot | null;
  googleAdsData: GoogleAdsSnapshot | null;
  shopifyData: ShopifySnapshot | null;
  websiteData: WebsiteSnapshot | null;
  dateRange: { start: string; end: string };
}

export interface AuditOutput {
  auditId: string;
  brandId: string;
  brandName: string;
  createdAt: string;
  dateRange: { start: string; end: string };

  // Summary
  summary: AuditSummary;

  // Sections
  creativeAnalysis: CreativeAnalysisSection;

  // Comparison with previous audit (if available)
  comparison?: AuditComparison;

  // Confidence
  confidence: {
    level: 'high' | 'medium' | 'low';
    reason: string;
  };
}

export interface AuditComparison {
  previousAuditId: string;
  previousAuditDate: string;
  previousDateRange: { start: string; end: string };

  // Metric deltas (positive = improvement, negative = regression)
  deltas: {
    healthScore: number;
    wastedSpend: number; // negative = improved (less waste)
    bestCpa: number; // negative = improved (lower CPA)
    worstCpa: number;
    winnerCount: number;
    loserCount: number; // negative = improved (fewer losers)
  };

  // Summary of changes
  improvements: string[];
  regressions: string[];
  overallTrend: 'improving' | 'stable' | 'declining';
}

export interface AuditSummary {
  healthScore: number; // 0-100
  topFindings: string[];
  topPriority: string;
  wastedSpend: number;
  bestCpa: number;
  worstCpa: number;
}

export interface CreativeAnalysisSection {
  // Winners and losers
  winners: {
    creative: CreativePerformance;
    whyItWorks: string;
  }[];

  losers: {
    creative: CreativePerformance;
    whyItFails: string;
    recommendation: string;
  }[];

  // Wasted spend
  wastedSpend: {
    total: number;
    creatives: { adId: string; adName: string; amount: number }[];
  };

  // Insights
  insights: AuditInsight[];

  // Recommendations
  recommendations: AuditRecommendation[];
}

export interface AuditInsight {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  dataPoints: Record<string, number | string>;
}

export interface AuditRecommendation {
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  expectedImpact: string;
  effort: 'low' | 'medium' | 'high';
}

// ============ SHOPIFY DATA ============

export interface ShopifySnapshot {
  capturedAt: string;
  dateRange: { start: string; end: string };
  shopDomain: string;

  // Revenue metrics
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;

  // Customer metrics
  newCustomers: number;
  returningCustomers: number;
  repeatPurchaseRate: number;

  // Product performance
  topProducts: ProductPerformance[];

  // Conversion metrics (if available)
  cartAbandonmentRate: number | null;
  checkoutAbandonmentRate: number | null;
}

export interface ProductPerformance {
  productId: string;
  title: string;
  revenue: number;
  unitsSold: number;
  averagePrice: number;
  variantCount: number;
}

// ============ GOOGLE ADS DATA ============

export interface GoogleAdsSnapshot {
  capturedAt: string;
  dateRange: { start: string; end: string };
  customerId: string;

  // Account level
  totalSpend: number;
  totalConversions: number;
  totalRevenue: number;
  overallRoas: number;
  overallCpa: number;

  // Campaign breakdown
  campaigns: CampaignPerformance[];

  // Ad performance (top ads)
  topAds: AdPerformance[];
}

export interface CampaignPerformance {
  campaignId: string;
  campaignName: string;
  status: string;
  channelType: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  ctr: number;
  cpa: number;
  roas: number;
}

export interface AdPerformance {
  adId: string;
  adName: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpa: number;
}

// ============ WEBSITE ANALYSIS ============

export interface WebsiteSnapshot {
  capturedAt: string;
  domain: string;

  // Pricing analysis
  priceRange: {
    min: number;
    max: number;
    average: number;
  };
  pricePoint: 'budget' | 'mid' | 'premium' | 'luxury';

  // Product catalog
  productCount: number;
  categoryCount: number;
  topCategories: string[];

  // Homepage messaging
  headline: string | null;
  valueProposition: string | null;
  trustSignals: string[];

  // Technical signals
  hasReviews: boolean;
  hasSizeGuide: boolean;
  hasFreeShipping: boolean;
  hasEasyReturns: boolean;
}

// ============ CATEGORY BENCHMARKS ============

export interface CategoryBenchmark {
  category: BrandCategory;
  stage: BrandStage;

  // Performance targets
  targetCpa: { low: number; mid: number; high: number };
  targetRoas: { low: number; mid: number; high: number };
  targetCtr: { low: number; mid: number; high: number };

  // Funnel benchmarks
  avgLpvToAtcRate: number;
  avgAtcToPurchaseRate: number;

  // Creative insights
  topCreativeTypes: ('video' | 'image' | 'carousel')[];
  avgCreativeLifespan: number; // days before fatigue
}

export const CATEGORY_BENCHMARKS: Record<BrandCategory, CategoryBenchmark> = {
  fashion: {
    category: 'fashion',
    stage: 'scaling',
    targetCpa: { low: 400, mid: 700, high: 1200 },
    targetRoas: { low: 1.5, mid: 2.5, high: 4.0 },
    targetCtr: { low: 0.8, mid: 1.5, high: 2.5 },
    avgLpvToAtcRate: 8,
    avgAtcToPurchaseRate: 25,
    topCreativeTypes: ['video', 'carousel'],
    avgCreativeLifespan: 14,
  },
  beauty: {
    category: 'beauty',
    stage: 'scaling',
    targetCpa: { low: 300, mid: 500, high: 900 },
    targetRoas: { low: 2.0, mid: 3.0, high: 5.0 },
    targetCtr: { low: 1.0, mid: 1.8, high: 3.0 },
    avgLpvToAtcRate: 10,
    avgAtcToPurchaseRate: 30,
    topCreativeTypes: ['video', 'image'],
    avgCreativeLifespan: 10,
  },
  perfume: {
    category: 'perfume',
    stage: 'scaling',
    targetCpa: { low: 500, mid: 800, high: 1500 },
    targetRoas: { low: 1.8, mid: 2.8, high: 4.5 },
    targetCtr: { low: 0.7, mid: 1.3, high: 2.2 },
    avgLpvToAtcRate: 6,
    avgAtcToPurchaseRate: 20,
    topCreativeTypes: ['video', 'carousel'],
    avgCreativeLifespan: 21,
  },
  jewelry: {
    category: 'jewelry',
    stage: 'scaling',
    targetCpa: { low: 600, mid: 1000, high: 2000 },
    targetRoas: { low: 2.0, mid: 3.5, high: 6.0 },
    targetCtr: { low: 0.6, mid: 1.2, high: 2.0 },
    avgLpvToAtcRate: 5,
    avgAtcToPurchaseRate: 18,
    topCreativeTypes: ['carousel', 'video'],
    avgCreativeLifespan: 21,
  },
  food: {
    category: 'food',
    stage: 'scaling',
    targetCpa: { low: 150, mid: 300, high: 500 },
    targetRoas: { low: 2.5, mid: 4.0, high: 7.0 },
    targetCtr: { low: 1.2, mid: 2.0, high: 3.5 },
    avgLpvToAtcRate: 12,
    avgAtcToPurchaseRate: 35,
    topCreativeTypes: ['video', 'image'],
    avgCreativeLifespan: 7,
  },
  electronics: {
    category: 'electronics',
    stage: 'scaling',
    targetCpa: { low: 800, mid: 1500, high: 3000 },
    targetRoas: { low: 1.5, mid: 2.5, high: 4.0 },
    targetCtr: { low: 0.5, mid: 1.0, high: 1.8 },
    avgLpvToAtcRate: 4,
    avgAtcToPurchaseRate: 15,
    topCreativeTypes: ['video', 'carousel'],
    avgCreativeLifespan: 30,
  },
  home: {
    category: 'home',
    stage: 'scaling',
    targetCpa: { low: 500, mid: 900, high: 1800 },
    targetRoas: { low: 1.8, mid: 3.0, high: 5.0 },
    targetCtr: { low: 0.7, mid: 1.3, high: 2.2 },
    avgLpvToAtcRate: 6,
    avgAtcToPurchaseRate: 22,
    topCreativeTypes: ['carousel', 'video'],
    avgCreativeLifespan: 21,
  },
  health: {
    category: 'health',
    stage: 'scaling',
    targetCpa: { low: 400, mid: 700, high: 1200 },
    targetRoas: { low: 2.0, mid: 3.5, high: 6.0 },
    targetCtr: { low: 0.9, mid: 1.6, high: 2.8 },
    avgLpvToAtcRate: 8,
    avgAtcToPurchaseRate: 28,
    topCreativeTypes: ['video', 'image'],
    avgCreativeLifespan: 14,
  },
  other: {
    category: 'other',
    stage: 'scaling',
    targetCpa: { low: 500, mid: 900, high: 1500 },
    targetRoas: { low: 1.5, mid: 2.5, high: 4.0 },
    targetCtr: { low: 0.8, mid: 1.4, high: 2.3 },
    avgLpvToAtcRate: 7,
    avgAtcToPurchaseRate: 25,
    topCreativeTypes: ['video', 'carousel'],
    avgCreativeLifespan: 14,
  },
};

// ============ CONFIG ============

export interface AuditConfig {
  // Kill threshold: spend with no purchase = wasted
  killThresholdMultiplier: number; // e.g., 5x target CPA

  // Minimum spend to include in analysis
  minSpendForAnalysis: number;

  // Date range
  datePreset: 'last_7d' | 'last_14d' | 'last_30d' | 'last_90d' | 'maximum';
}

export const DEFAULT_AUDIT_CONFIG: AuditConfig = {
  killThresholdMultiplier: 5,
  minSpendForAnalysis: 500, // ₹500 minimum
  datePreset: 'last_30d',
};
