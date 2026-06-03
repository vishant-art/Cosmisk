/**
 * Elite Intelligence - Signal Collector
 *
 * Unified collection of signals from all data sources.
 * Normalizes data and calculates signal strength.
 */

import {
  SignalTaxonomy,
  MetaSignals,
  ShopifySignals,
  CommentSignals,
  FunnelSignals,
  OperationalSignals,
  CompetitiveSignals,
  CreatorSignals,
  Signal,
  SignalMeta,
  SignalStrength,
  TrendSignal,
  TrendDirection,
} from './types.js';

import { logger } from '../../utils/logger.js';

// ============================================================================
// SIGNAL STRENGTH CALCULATION
// ============================================================================

function calculateStrength(
  confidence: number,
  sampleSize: number,
  sourceCount: number
): SignalStrength {
  if (confidence >= 90 && sampleSize >= 1000 && sourceCount >= 3) return 'verified';
  if (confidence >= 75 && sampleSize >= 500 && sourceCount >= 2) return 'strong';
  if (confidence >= 60 && sampleSize >= 100) return 'moderate';
  if (confidence >= 40 && sampleSize >= 20) return 'weak';
  return 'emerging';
}

function createSignal<T>(
  value: T,
  options: {
    confidence?: number;
    sampleSize?: number;
    sources?: string[];
    timespan?: '7d' | '14d' | '30d' | '90d';
  } = {}
): Signal<T> {
  const confidence = options.confidence ?? 70;
  const sampleSize = options.sampleSize ?? 100;
  const sources = options.sources ?? ['meta-api'];

  return {
    value,
    meta: {
      strength: calculateStrength(confidence, sampleSize, sources.length),
      confidence,
      sampleSize,
      timespan: options.timespan ?? '7d',
      sources,
      lastUpdated: new Date().toISOString(),
    },
  };
}

function calculateTrend(current: number, previous: number): TrendSignal {
  const change = previous !== 0 ? ((current - previous) / previous) * 100 : 0;
  const velocity = Math.abs(change) / 7; // Change per day assuming 7-day window

  let direction: TrendDirection = 'stable';
  if (change > 5) direction = 'increasing';
  if (change < -5) direction = 'declining';

  return { current, previous, change, direction, velocity };
}

// ============================================================================
// META SIGNALS COLLECTOR
// ============================================================================

export async function collectMetaSignals(
  accountId: string,
  metaData: {
    campaigns?: any[];
    creatives?: any[];
    insights?: any;
    previousInsights?: any;
  }
): Promise<MetaSignals> {
  const { campaigns = [], creatives = [], insights = {}, previousInsights = {} } = metaData;

  // Calculate trends from insights
  const ctrCurrent = insights.ctr ?? 0;
  const ctrPrevious = previousInsights.ctr ?? ctrCurrent;

  const cpcCurrent = insights.cpc ?? 0;
  const cpcPrevious = previousInsights.cpc ?? cpcCurrent;

  const roasCurrent = insights.roas ?? 0;
  const roasPrevious = previousInsights.roas ?? roasCurrent;

  const cpaCurrent = insights.cpa ?? 0;
  const cpaPrevious = previousInsights.cpa ?? cpaCurrent;

  const cpmCurrent = insights.cpm ?? 0;
  const cpmPrevious = previousInsights.cpm ?? cpmCurrent;

  // Click to ATC
  const clicks = insights.clicks ?? 0;
  const atc = insights.addToCart ?? 0;
  const clickToATCCurrent = clicks > 0 ? (atc / clicks) * 100 : 0;
  const clickToATCPrevious = previousInsights.clickToATC ?? clickToATCCurrent;

  // Audience quality (purchases / reach * 1000)
  const purchases = insights.purchases ?? 0;
  const reach = insights.reach ?? 1;
  const audienceQualityCurrent = (purchases / reach) * 1000;
  const audienceQualityPrevious = previousInsights.audienceQuality ?? audienceQualityCurrent;

  // Frequency
  const frequencyCurrent = insights.frequency ?? 1;
  const frequencyPrevious = previousInsights.frequency ?? frequencyCurrent;

  return {
    ctrTrend: createSignal(calculateTrend(ctrCurrent, ctrPrevious), {
      confidence: 85,
      sampleSize: insights.impressions ?? 1000,
      sources: ['meta-api'],
    }),
    cpcTrend: createSignal(calculateTrend(cpcCurrent, cpcPrevious), {
      confidence: 85,
      sampleSize: insights.clicks ?? 100,
      sources: ['meta-api'],
    }),
    cpmTrend: createSignal(calculateTrend(cpmCurrent, cpmPrevious), {
      confidence: 85,
      sampleSize: insights.impressions ?? 1000,
      sources: ['meta-api'],
    }),
    roasTrend: createSignal(calculateTrend(roasCurrent, roasPrevious), {
      confidence: 80,
      sampleSize: purchases,
      sources: ['meta-api', 'shopify'],
    }),
    cpaTrend: createSignal(calculateTrend(cpaCurrent, cpaPrevious), {
      confidence: 80,
      sampleSize: purchases,
      sources: ['meta-api'],
    }),

    creativeVelocity: createSignal(creatives.filter(c => c.status === 'ACTIVE').length, {
      confidence: 90,
      sources: ['meta-api'],
    }),
    hookRetention: createSignal(insights.videoThruplay ?? 0, {
      confidence: 75,
      sources: ['meta-api'],
    }),
    avgWatchTime: createSignal(
      calculateTrend(insights.avgWatchTime ?? 0, previousInsights.avgWatchTime ?? 0),
      { confidence: 70, sources: ['meta-api'] }
    ),

    avgFrequency: createSignal(calculateTrend(frequencyCurrent, frequencyPrevious), {
      confidence: 85,
      sources: ['meta-api'],
    }),
    audienceOverlap: createSignal(insights.audienceOverlap ?? 0, {
      confidence: 60,
      sources: ['meta-api'],
    }),
    audienceQualityIndex: createSignal(
      calculateTrend(audienceQualityCurrent, audienceQualityPrevious),
      { confidence: 70, sources: ['meta-api', 'shopify'] }
    ),
    coldWarmRatio: createSignal(insights.coldWarmRatio ?? 0.7, {
      confidence: 65,
      sources: ['meta-api'],
    }),

    clickToATCRate: createSignal(calculateTrend(clickToATCCurrent, clickToATCPrevious), {
      confidence: 80,
      sampleSize: clicks,
      sources: ['meta-api', 'shopify'],
    }),
    clickToPurchaseRate: createSignal(
      calculateTrend(
        clicks > 0 ? (purchases / clicks) * 100 : 0,
        previousInsights.clickToPurchase ?? 0
      ),
      { confidence: 80, sources: ['meta-api', 'shopify'] }
    ),

    topCampaigns: campaigns.slice(0, 10).map(c => ({
      id: c.id,
      name: c.name,
      spend: c.spend ?? 0,
      roas: c.roas ?? 0,
      cpa: c.cpa ?? 0,
      trend: c.trend ?? 'stable',
      issues: c.issues ?? [],
    })),

    topCreatives: creatives.slice(0, 10).map(c => ({
      id: c.id,
      name: c.name ?? 'Unnamed',
      spend: c.spend ?? 0,
      ctr: c.ctr ?? 0,
      clickToATC: c.clickToATC ?? 0,
      fatigueScore: c.fatigueScore ?? 0,
      format: c.format ?? 'unknown',
    })),
  };
}

// ============================================================================
// SHOPIFY SIGNALS COLLECTOR
// ============================================================================

export async function collectShopifySignals(
  shopifyData: {
    analytics?: any;
    previousAnalytics?: any;
    products?: any[];
    orders?: any[];
    customers?: any[];
  }
): Promise<ShopifySignals> {
  const { analytics = {}, previousAnalytics = {}, products = [], orders = [], customers = [] } = shopifyData;

  // Calculate COD rate
  const codOrders = orders.filter(o => o.paymentMethod === 'COD').length;
  const totalOrders = orders.length || 1;
  const codRateCurrent = (codOrders / totalOrders) * 100;
  const codRatePrevious = previousAnalytics.codRate ?? codRateCurrent;

  // Calculate repeat purchase rate
  const repeatCustomers = customers.filter(c => c.ordersCount > 1).length;
  const totalCustomers = customers.length || 1;
  const repeatRateCurrent = (repeatCustomers / totalCustomers) * 100;
  const repeatRatePrevious = previousAnalytics.repeatRate ?? repeatRateCurrent;

  // AOV
  const totalRevenue = orders.reduce((sum, o) => sum + (o.total ?? 0), 0);
  const aovCurrent = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const aovPrevious = previousAnalytics.aov ?? aovCurrent;

  return {
    conversionRate: createSignal(
      calculateTrend(analytics.conversionRate ?? 0, previousAnalytics.conversionRate ?? 0),
      { confidence: 80, sources: ['shopify'] }
    ),
    aov: createSignal(calculateTrend(aovCurrent, aovPrevious), {
      confidence: 85,
      sampleSize: totalOrders,
      sources: ['shopify'],
    }),
    cartAbandonRate: createSignal(
      calculateTrend(analytics.cartAbandonRate ?? 0, previousAnalytics.cartAbandonRate ?? 0),
      { confidence: 75, sources: ['shopify'] }
    ),

    bestsellerVelocity: products.slice(0, 10).map(p => ({
      id: p.id,
      name: p.title ?? 'Unknown',
      velocity: p.salesVelocity ?? 0,
      trend: p.trend ?? 'stable',
      daysToOOS: p.daysToOOS ?? null,
      adSpend: p.adSpend ?? 0,
    })),
    oosRisk: products.filter(p => p.daysToOOS && p.daysToOOS < 14).map(p => ({
      id: p.id,
      name: p.title ?? 'Unknown',
      velocity: p.salesVelocity ?? 0,
      trend: 'declining',
      daysToOOS: p.daysToOOS,
      adSpend: p.adSpend ?? 0,
    })),

    repeatPurchaseRate: createSignal(calculateTrend(repeatRateCurrent, repeatRatePrevious), {
      confidence: 80,
      sampleSize: totalCustomers,
      sources: ['shopify'],
    }),
    cohortLTV: [], // Would be calculated from customer data
    returnsRate: createSignal(
      calculateTrend(analytics.returnsRate ?? 0, previousAnalytics.returnsRate ?? 0),
      { confidence: 75, sources: ['shopify'] }
    ),

    codRate: createSignal(calculateTrend(codRateCurrent, codRatePrevious), {
      confidence: 85,
      sampleSize: totalOrders,
      sources: ['shopify'],
    }),
    codRTORate: createSignal(
      calculateTrend(analytics.codRTORate ?? 0, previousAnalytics.codRTORate ?? 0),
      { confidence: 70, sources: ['shopify', 'logistics'] }
    ),
    prepaidRate: createSignal(
      calculateTrend(100 - codRateCurrent, 100 - codRatePrevious),
      { confidence: 85, sampleSize: totalOrders, sources: ['shopify'] }
    ),
  };
}

// ============================================================================
// COMMENT SIGNALS COLLECTOR
// ============================================================================

export async function collectCommentSignals(
  comments: {
    text: string;
    category: string;
    sentiment: string;
    emotionalTriggers: string[];
    createdAt?: string;
  }[],
  previousCommentStats?: any
): Promise<CommentSignals> {
  const totalComments = comments.length;

  // Sentiment distribution
  const positive = comments.filter(c => c.sentiment === 'positive').length;
  const negative = comments.filter(c => c.sentiment === 'negative').length;
  const neutral = totalComments - positive - negative;

  // Trust questioning
  const trustKeywords = ['legit', 'real', 'fake', 'scam', 'genuine', 'authentic', 'trust'];
  const trustQuestions = comments.filter(c =>
    trustKeywords.some(k => c.text.toLowerCase().includes(k))
  ).length;
  const trustRateCurrent = totalComments > 0 ? (trustQuestions / totalComments) * 100 : 0;
  const trustRatePrevious = previousCommentStats?.trustRate ?? trustRateCurrent;

  // Buying signals
  const buyKeywords = ['buy', 'order', 'price', 'link', 'where', 'want', 'need'];
  const buyingComments = comments.filter(c =>
    buyKeywords.some(k => c.text.toLowerCase().includes(k))
  ).length;
  const buyingRateCurrent = totalComments > 0 ? (buyingComments / totalComments) * 100 : 0;
  const buyingRatePrevious = previousCommentStats?.buyingRate ?? buyingRateCurrent;

  // Objections
  const objectionCategories = ['complaint', 'objection', 'price_objection'];
  const objectionComments = comments.filter(c => objectionCategories.includes(c.category));
  const objectionRateCurrent = totalComments > 0 ? (objectionComments.length / totalComments) * 100 : 0;
  const objectionRatePrevious = previousCommentStats?.objectionRate ?? objectionRateCurrent;

  // Extract patterns for objections
  const objectionPatterns = new Map<string, { count: number; examples: string[] }>();
  objectionComments.forEach(c => {
    const key = c.text.substring(0, 50);
    const existing = objectionPatterns.get(key) || { count: 0, examples: [] };
    existing.count++;
    if (existing.examples.length < 3) existing.examples.push(c.text);
    objectionPatterns.set(key, existing);
  });

  // Emotional triggers aggregation
  const emotionCounts = new Map<string, number>();
  comments.forEach(c => {
    c.emotionalTriggers.forEach(e => {
      emotionCounts.set(e, (emotionCounts.get(e) || 0) + 1);
    });
  });

  return {
    totalComments,
    commentsPerDay: createSignal(
      calculateTrend(totalComments / 7, previousCommentStats?.commentsPerDay ?? totalComments / 7),
      { confidence: 80, sampleSize: totalComments, sources: ['meta-api'] }
    ),

    sentimentDistribution: {
      positive: totalComments > 0 ? (positive / totalComments) * 100 : 0,
      negative: totalComments > 0 ? (negative / totalComments) * 100 : 0,
      neutral: totalComments > 0 ? (neutral / totalComments) * 100 : 0,
    },
    sentimentTrend: createSignal(
      negative > positive ? 'declining' : positive > negative ? 'increasing' : 'stable',
      { confidence: 75, sampleSize: totalComments, sources: ['meta-api'] }
    ),

    trustQuestioning: createSignal(calculateTrend(trustRateCurrent, trustRatePrevious), {
      confidence: 80,
      sampleSize: totalComments,
      sources: ['meta-api'],
    }),
    legitimacyVerification: createSignal(
      calculateTrend(trustRateCurrent * 0.8, trustRatePrevious * 0.8),
      { confidence: 70, sources: ['meta-api'] }
    ),
    socialProofSeeking: createSignal(
      calculateTrend(
        comments.filter(c => c.text.toLowerCase().includes('anyone')).length,
        previousCommentStats?.socialProofSeeking ?? 0
      ),
      { confidence: 65, sources: ['meta-api'] }
    ),

    buyingSignals: createSignal(calculateTrend(buyingRateCurrent, buyingRatePrevious), {
      confidence: 75,
      sampleSize: totalComments,
      sources: ['meta-api'],
    }),
    objectionFrequency: createSignal(calculateTrend(objectionRateCurrent, objectionRatePrevious), {
      confidence: 80,
      sampleSize: totalComments,
      sources: ['meta-api'],
    }),
    comparisonMentions: createSignal(
      calculateTrend(
        comments.filter(c => c.text.toLowerCase().includes('vs') || c.text.toLowerCase().includes('better than')).length,
        previousCommentStats?.comparisonMentions ?? 0
      ),
      { confidence: 60, sources: ['meta-api'] }
    ),

    topObjections: Array.from(objectionPatterns.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([pattern, data]) => ({
        pattern,
        frequency: data.count,
        trend: 'stable' as TrendDirection,
        severity: data.count > 10 ? 'high' : data.count > 5 ? 'moderate' : 'low',
        exampleComments: data.examples,
      })),

    emergingObjections: [], // Would compare to historical data

    topPraise: comments
      .filter(c => c.sentiment === 'positive')
      .slice(0, 5)
      .map(c => ({
        pattern: c.text.substring(0, 50),
        frequency: 1,
        sentiment: 0.8,
      })),

    emotionalTriggers: Array.from(emotionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([emotion, count]) => ({
        emotion,
        frequency: count,
        trend: 'stable' as TrendDirection,
        intensity: count / totalComments,
      })),
  };
}

// ============================================================================
// FUNNEL SIGNALS COLLECTOR (Placeholder)
// ============================================================================

export async function collectFunnelSignals(funnelData: any = {}): Promise<FunnelSignals> {
  return {
    adToSiteRate: createSignal(calculateTrend(funnelData.adToSite ?? 80, 80), { confidence: 50 }),
    siteToProductRate: createSignal(calculateTrend(funnelData.siteToProduct ?? 60, 60), { confidence: 50 }),
    productToCartRate: createSignal(calculateTrend(funnelData.productToCart ?? 15, 15), { confidence: 50 }),
    cartToCheckoutRate: createSignal(calculateTrend(funnelData.cartToCheckout ?? 50, 50), { confidence: 50 }),
    checkoutToPurchaseRate: createSignal(calculateTrend(funnelData.checkoutToPurchase ?? 70, 70), { confidence: 50 }),

    avgSessionDuration: createSignal(calculateTrend(funnelData.sessionDuration ?? 120, 120), { confidence: 50 }),
    pagesPerSession: createSignal(calculateTrend(funnelData.pagesPerSession ?? 3, 3), { confidence: 50 }),
    bounceRate: createSignal(calculateTrend(funnelData.bounceRate ?? 40, 40), { confidence: 50 }),

    productPageScrollDepth: createSignal(funnelData.scrollDepth ?? 60, { confidence: 40 }),
    reviewReadRate: createSignal(funnelData.reviewReadRate ?? 30, { confidence: 40 }),
    sizeGuideUsage: createSignal(funnelData.sizeGuideUsage ?? 10, { confidence: 40 }),
  };
}

// ============================================================================
// OPERATIONAL SIGNALS COLLECTOR (Placeholder)
// ============================================================================

export async function collectOperationalSignals(opsData: any = {}): Promise<OperationalSignals> {
  return {
    avgDeliveryDays: createSignal(calculateTrend(opsData.deliveryDays ?? 5, 5), { confidence: 60 }),
    deliveryComplaintRate: createSignal(calculateTrend(opsData.deliveryComplaints ?? 5, 5), { confidence: 60 }),
    shippingCostComplaints: createSignal(calculateTrend(opsData.shippingComplaints ?? 10, 10), { confidence: 60 }),

    supportTicketVolume: createSignal(calculateTrend(opsData.tickets ?? 20, 20), { confidence: 60 }),
    topSupportIssues: [],
    satisfactionScore: createSignal(calculateTrend(opsData.satisfaction ?? 80, 80), { confidence: 50 }),

    returnReasons: [],
    avgDaysToReturn: createSignal(opsData.daysToReturn ?? 14, { confidence: 50 }),
  };
}

// ============================================================================
// COMPETITIVE SIGNALS COLLECTOR (Placeholder)
// ============================================================================

export async function collectCompetitiveSignals(competitorData: any = {}): Promise<CompetitiveSignals> {
  return {
    competitorAdVolume: createSignal(calculateTrend(competitorData.adVolume ?? 50, 50), { confidence: 40 }),
    competitors: competitorData.competitors ?? [],
    unaddressedObjections: competitorData.gaps ?? [],
    narrativeWhitespace: [],
    pricingGaps: [],
  };
}

// ============================================================================
// CREATOR SIGNALS COLLECTOR (Placeholder)
// ============================================================================

export async function collectCreatorSignals(creatorData: any = {}): Promise<CreatorSignals> {
  return {
    creatorPerformance: creatorData.creators ?? [],
    trustTransferability: createSignal(calculateTrend(creatorData.trustTransfer ?? 70, 70), { confidence: 50 }),
    avgCreatorROAS: createSignal(calculateTrend(creatorData.avgROAS ?? 3, 3), { confidence: 50 }),
    fatiguedCreators: [],
    bestPerformingStyles: [],
  };
}

// ============================================================================
// MAIN COLLECTOR
// ============================================================================

export async function collectAllSignals(
  clientId: string,
  accountId: string,
  dataSources: {
    meta?: any;
    shopify?: any;
    comments?: any[];
    funnel?: any;
    operations?: any;
    competitive?: any;
    creator?: any;
  }
): Promise<SignalTaxonomy> {
  logger.info({ clientId, accountId }, '[EliteIntelligence] Collecting signals from all sources');

  const [meta, shopify, comments, funnel, operations, competitive, creator] = await Promise.all([
    collectMetaSignals(accountId, dataSources.meta ?? {}),
    collectShopifySignals(dataSources.shopify ?? {}),
    collectCommentSignals(dataSources.comments ?? []),
    collectFunnelSignals(dataSources.funnel),
    collectOperationalSignals(dataSources.operations),
    collectCompetitiveSignals(dataSources.competitive),
    collectCreatorSignals(dataSources.creator),
  ]);

  logger.info({ clientId, accountId }, '[EliteIntelligence] Signal collection complete');

  return {
    meta,
    shopify,
    comments,
    funnel,
    operations,
    competitive,
    creator,
    collectedAt: new Date().toISOString(),
    clientId,
    accountId,
  };
}
