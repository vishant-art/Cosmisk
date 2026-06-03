/**
 * Competitor Creative Intelligence — Core Analysis & Aggregation
 *
 * Per-ad analysis, relevance scoring orchestration, pattern counting,
 * competitor-profile building, and recommendation generation.
 */

import { logger } from '../../utils/logger.js';
import { analyzeCreativeWithAI } from './ai-analysis.js';
import { classifyCampaignType } from './classifiers.js';
import { classifyCreativeFormat } from './creative-format.js';
import { scoreRelevance } from './relevance.js';
import type {
  AdLibraryAd,
  BrandContext,
  CompetitorProfile,
  CreativeAnalysis,
  CreativeIntelReport,
} from './types.js';

export function calculateLongevityScore(daysRunning: number): number {
  // 0-7 days: 0-20 score
  // 7-14 days: 20-40 score
  // 14-30 days: 40-70 score
  // 30-60 days: 70-90 score
  // 60+ days: 90-100 score
  if (daysRunning < 7) return Math.round((daysRunning / 7) * 20);
  if (daysRunning < 14) return Math.round(20 + ((daysRunning - 7) / 7) * 20);
  if (daysRunning < 30) return Math.round(40 + ((daysRunning - 14) / 16) * 30);
  if (daysRunning < 60) return Math.round(70 + ((daysRunning - 30) / 30) * 20);
  return Math.min(100, Math.round(90 + ((daysRunning - 60) / 60) * 10));
}

export function estimatePerformance(daysRunning: number, spend: number | null): CreativeAnalysis['estimatedPerformance'] {
  if (daysRunning >= 30 && (spend === null || spend > 10000)) return 'high';
  if (daysRunning >= 14 && (spend === null || spend > 5000)) return 'medium';
  if (daysRunning < 7) return 'unknown';
  return 'low';
}

export async function analyzeAd(ad: AdLibraryAd): Promise<CreativeAnalysis> {
  const startDate = new Date(ad.ad_delivery_start_time);
  const endDate = ad.ad_delivery_stop_time ? new Date(ad.ad_delivery_stop_time) : null;
  const now = new Date();
  const daysRunning = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  const spendLower = ad.spend ? parseInt(ad.spend.lower_bound) : null;
  const spendUpper = ad.spend ? parseInt(ad.spend.upper_bound) : null;
  const impressionsLower = ad.impressions ? parseInt(ad.impressions.lower_bound) : null;
  const impressionsUpper = ad.impressions ? parseInt(ad.impressions.upper_bound) : null;

  // Get AI analysis
  const aiAnalysis = await analyzeCreativeWithAI(ad);

  // Classify campaign type (conversion vs boost post)
  const primaryText = ad.ad_creative_bodies?.[0] || '';
  const headline = ad.ad_creative_link_titles?.[0] || '';
  const caption = ad.ad_creative_link_captions?.[0] || '';
  const ctaText = aiAnalysis.ctaText || '';
  const campaignType = classifyCampaignType(ctaText, primaryText, headline);

  // Classify creative format with detailed categories
  const creativeFormatDetailed = classifyCreativeFormat(primaryText, headline, caption);

  return {
    adId: ad.id,
    pageId: ad.page_id,
    pageName: ad.page_name,
    snapshotUrl: ad.ad_snapshot_url,
    startDate: ad.ad_delivery_start_time,
    endDate: ad.ad_delivery_stop_time || null,
    daysRunning,
    isActive: !ad.ad_delivery_stop_time,
    spendLower,
    spendUpper,
    impressionsLower,
    impressionsUpper,
    primaryText: primaryText || null,
    headline: headline || null,
    caption: caption || null,
    platforms: ad.publisher_platforms || [],
    hookType: aiAnalysis.hookType || 'unknown',
    hookText: aiAnalysis.hookText || '',
    ctaType: aiAnalysis.ctaType || 'unknown',
    ctaText: aiAnalysis.ctaText || '',
    offerType: aiAnalysis.offerType || 'none',
    offerDetails: aiAnalysis.offerDetails || '',
    creativeFormat: aiAnalysis.creativeFormat || 'unknown',
    creativeFormatDetailed,
    emotionalTriggers: aiAnalysis.emotionalTriggers || [],
    targetAudience: aiAnalysis.targetAudience || 'unknown',
    longevityScore: calculateLongevityScore(daysRunning),
    estimatedPerformance: estimatePerformance(daysRunning, spendUpper),
    campaignType,
    // Relevance scoring - will be updated after analysis if brandContext is available
    relevanceScore: 50, // Default middle score
    competitorType: 'indirect' as const, // Default to indirect until scored
    relevanceReason: 'Not yet scored',
  };
}

/**
 * Add relevance scoring to analyzed ads
 * Call this after analyzeAd when brandContext is available
 */
export async function addRelevanceScoring(
  ads: CreativeAnalysis[],
  brandContext: BrandContext
): Promise<CreativeAnalysis[]> {
  const scored: CreativeAnalysis[] = [];

  for (const ad of ads) {
    try {
      const relevance = await scoreRelevance(
        {
          pageName: ad.pageName,
          primaryText: ad.primaryText || '',
          headline: ad.headline || '',
          caption: ad.caption || '',
          creativeFormat: ad.creativeFormatDetailed,
        },
        brandContext
      );

      scored.push({
        ...ad,
        relevanceScore: relevance.score,
        competitorType: relevance.type,
        relevanceReason: relevance.reason,
        creativeInsight: relevance.creativeInsight,
      });

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (err) {
      logger.warn({ adId: ad.adId, err }, '[CreativeIntel] Failed to score relevance');
      scored.push(ad); // Keep with default values
    }
  }

  // Log summary
  const direct = scored.filter(a => a.competitorType === 'direct').length;
  const indirect = scored.filter(a => a.competitorType === 'indirect').length;
  const irrelevant = scored.filter(a => a.competitorType === 'irrelevant').length;
  logger.info({ direct, indirect, irrelevant }, '[CreativeIntel] Relevance scoring complete');

  return scored;
}

export function countPatterns<T extends string>(items: T[]): Array<{ type: T; count: number; percentage: number }> {
  const counts = new Map<T, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }

  const total = items.length;
  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, count, percentage: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);
}

export function buildCompetitorProfile(pageId: string, ads: CreativeAnalysis[]): CompetitorProfile {
  const activeAds = ads.filter(a => a.isActive);
  const avgAdAge = ads.length > 0
    ? Math.round(ads.reduce((sum, a) => sum + a.daysRunning, 0) / ads.length)
    : 0;

  const longestRunning = ads.reduce((longest, ad) =>
    ad.daysRunning > (longest?.daysRunning || 0) ? ad : longest
  , ads[0] || null);

  // Platform breakdown
  const platformCounts: Record<string, number> = {};
  for (const ad of ads) {
    for (const platform of ad.platforms) {
      platformCounts[platform] = (platformCounts[platform] || 0) + 1;
    }
  }

  // Top creatives (by longevity score)
  const topCreatives = [...ads]
    .sort((a, b) => b.longevityScore - a.longevityScore)
    .slice(0, 5);

  return {
    pageName: ads[0]?.pageName || 'Unknown',
    pageId,
    totalAdsFound: ads.length,
    activeAds: activeAds.length,
    avgAdAge,
    longestRunningAd: longestRunning,
    topHookTypes: countPatterns(ads.map(a => a.hookType)),
    topCtaTypes: countPatterns(ads.map(a => a.ctaType)),
    topOfferTypes: countPatterns(ads.map(a => a.offerType)),
    topFormats: countPatterns(ads.map(a => a.creativeFormat)),
    platformBreakdown: platformCounts,
    topCreatives,
  };
}

export function generateRecommendations(
  competitors: CompetitorProfile[],
  allAds: CreativeAnalysis[]
): CreativeIntelReport['recommendations'] {
  const recommendations: CreativeIntelReport['recommendations'] = [];

  // Analyze dominant patterns
  const allHooks = allAds.map(a => a.hookType);
  const allCtas = allAds.map(a => a.ctaType);
  const allOffers = allAds.map(a => a.offerType);
  const allFormats = allAds.map(a => a.creativeFormat);

  const hookPatterns = countPatterns(allHooks);
  const ctaPatterns = countPatterns(allCtas);
  const offerPatterns = countPatterns(allOffers);
  const formatPatterns = countPatterns(allFormats);

  // Top hook recommendation
  if (hookPatterns[0] && hookPatterns[0].percentage > 30) {
    recommendations.push({
      priority: 'high',
      category: 'Hook Strategy',
      insight: `${hookPatterns[0].percentage}% of competitor ads use "${hookPatterns[0].type}" hooks`,
      action: `Test ${hookPatterns[0].type} hook style in your next 3 creatives. Example: "${allAds.find(a => a.hookType === hookPatterns[0].type)?.hookText || 'N/A'}"`,
      basedOn: `${hookPatterns[0].count} ads analyzed`,
    });
  }

  // Gap opportunity (underused hook)
  const underusedHook = hookPatterns.find(h => h.percentage < 10 && h.type !== 'unknown' && h.type !== 'other');
  if (underusedHook) {
    recommendations.push({
      priority: 'medium',
      category: 'Differentiation',
      insight: `Only ${underusedHook.percentage}% use "${underusedHook.type}" hooks — opportunity to stand out`,
      action: `Test ${underusedHook.type} hook as a differentiator. Less competition for attention.`,
      basedOn: 'Pattern gap analysis',
    });
  }

  // Long-running ad insights
  const topPerformers = allAds.filter(a => a.daysRunning >= 30);
  if (topPerformers.length > 0) {
    const topHook = countPatterns(topPerformers.map(a => a.hookType))[0];
    const topOffer = countPatterns(topPerformers.map(a => a.offerType))[0];

    recommendations.push({
      priority: 'high',
      category: 'Proven Patterns',
      insight: `Ads running 30+ days commonly use "${topHook?.type}" hooks with "${topOffer?.type}" offers`,
      action: `Combine ${topHook?.type} hook + ${topOffer?.type} offer in your next campaign. This pattern has proven longevity.`,
      basedOn: `${topPerformers.length} long-running ads`,
    });
  }

  // Format recommendation
  if (formatPatterns[0] && formatPatterns[0].type !== 'unknown') {
    recommendations.push({
      priority: 'medium',
      category: 'Creative Format',
      insight: `${formatPatterns[0].type} is the dominant format (${formatPatterns[0].percentage}% of ads)`,
      action: `Ensure you have ${formatPatterns[0].type} creatives in your mix. Also test the second format: ${formatPatterns[1]?.type || 'N/A'}`,
      basedOn: 'Format analysis',
    });
  }

  // Offer strategy
  if (offerPatterns[0] && offerPatterns[0].type !== 'none') {
    recommendations.push({
      priority: 'medium',
      category: 'Offer Structure',
      insight: `"${offerPatterns[0].type}" is the most common offer type (${offerPatterns[0].percentage}%)`,
      action: `Match competitor offer structure or differentiate with a unique offer type they're not using.`,
      basedOn: 'Offer analysis',
    });
  }

  return recommendations;
}
