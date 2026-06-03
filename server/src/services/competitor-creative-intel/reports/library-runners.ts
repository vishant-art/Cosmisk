/**
 * Competitor Creative Intelligence — Ad Library Report Runners
 *
 * Query-based and discovery-based orchestration entry points.
 */

import { getDbAdapter } from '../../../db/adapter.js';
import { decryptToken } from '../../token-crypto.js';
import { logger } from '../../../utils/logger.js';
import { fetchAdLibrary } from '../ad-library.js';
import { filterConversionAds, classifyCampaignType } from '../classifiers.js';
import { classifyCreativeFormat } from '../creative-format.js';
import {
  analyzeAd,
  addRelevanceScoring,
  buildCompetitorProfile,
  calculateLongevityScore,
  countPatterns,
  estimatePerformance,
  generateRecommendations,
} from '../analysis-core.js';
import type {
  AdLibraryAd,
  CreativeAnalysis,
  CreativeIntelReport,
  DiscoveryResult,
} from '../types.js';

// ============ MAIN EXPORT ============

export async function runCompetitorCreativeIntel(
  query: string,
  options: {
    country?: string;
    limit?: number;
    userId?: string;
    analyzeTop?: number; // Analyze top N ads with AI (rate limited)
  } = {}
): Promise<CreativeIntelReport> {
  const { country = 'IN', limit = 50, userId, analyzeTop = 15 } = options;

  logger.info({ query, country, limit }, '[CreativeIntel] Starting competitor analysis');

  // Get user token if available
  let userToken: string | undefined;
  if (userId) {
    try {
      const db = getDbAdapter();
      const row = await db.get('SELECT encrypted_access_token FROM meta_tokens WHERE user_id = ?', [userId]) as { encrypted_access_token: string } | undefined;
      if (row) {
        userToken = decryptToken(row.encrypted_access_token);
      }
    } catch {
      // Continue without user token
    }
  }

  // Fetch ads from Meta Ad Library
  const rawAds = await fetchAdLibrary(query, country, limit, userToken);
  logger.info({ count: rawAds.length }, '[CreativeIntel] Fetched ads from Ad Library');

  // Filter out boosted posts (ads linking to Instagram/Facebook profiles)
  // Only keep conversion ads (linking to external websites)
  const conversionAds = filterConversionAds(rawAds);

  if (conversionAds.length === 0) {
    return {
      searchQuery: query,
      analyzedAt: new Date().toISOString(),
      totalAdsAnalyzed: 0,
      competitors: [],
      industryPatterns: {
        dominantHooks: [],
        dominantCtas: [],
        dominantOffers: [],
        avgAdAge: 0,
        longestRunningAds: [],
      },
      recommendations: [{
        priority: 'high',
        category: 'No Data',
        insight: `No active ads found for "${query}"`,
        action: 'Try different search terms or check if competitors use a different brand name on Meta.',
        basedOn: 'Search returned 0 results',
      }],
      swipeFile: [],
    };
  }

  // Sort by longevity (oldest first) and analyze top N with AI
  const sortedAds = [...conversionAds].sort((a, b) =>
    new Date(a.ad_delivery_start_time).getTime() - new Date(b.ad_delivery_start_time).getTime()
  );

  const adsToAnalyze = sortedAds.slice(0, analyzeTop);
  const analyzedAds: CreativeAnalysis[] = [];

  // Analyze ads (with rate limiting)
  for (const ad of adsToAnalyze) {
    try {
      const analysis = await analyzeAd(ad);
      analyzedAds.push(analysis);

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (err) {
      logger.warn({ adId: ad.id, err }, '[CreativeIntel] Failed to analyze ad');
    }
  }

  // Add remaining ads without AI analysis
  for (const ad of sortedAds.slice(analyzeTop)) {
    const startDate = new Date(ad.ad_delivery_start_time);
    const daysRunning = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const primaryText = ad.ad_creative_bodies?.[0] || '';
    const headline = ad.ad_creative_link_titles?.[0] || '';
    const caption = ad.ad_creative_link_captions?.[0] || '';

    analyzedAds.push({
      adId: ad.id,
      pageId: ad.page_id,
      pageName: ad.page_name,
      snapshotUrl: ad.ad_snapshot_url,
      startDate: ad.ad_delivery_start_time,
      endDate: ad.ad_delivery_stop_time || null,
      daysRunning,
      isActive: !ad.ad_delivery_stop_time,
      spendLower: ad.spend ? parseInt(ad.spend.lower_bound) : null,
      spendUpper: ad.spend ? parseInt(ad.spend.upper_bound) : null,
      impressionsLower: ad.impressions ? parseInt(ad.impressions.lower_bound) : null,
      impressionsUpper: ad.impressions ? parseInt(ad.impressions.upper_bound) : null,
      primaryText: primaryText || null,
      headline: headline || null,
      caption: caption || null,
      platforms: ad.publisher_platforms || [],
      hookType: 'not_analyzed',
      hookText: '',
      ctaType: 'not_analyzed',
      ctaText: '',
      offerType: 'not_analyzed',
      offerDetails: '',
      creativeFormat: 'not_analyzed',
      creativeFormatDetailed: classifyCreativeFormat(primaryText, headline, caption), // Still classify format
      emotionalTriggers: [],
      targetAudience: 'not_analyzed',
      longevityScore: calculateLongevityScore(daysRunning),
      estimatedPerformance: estimatePerformance(daysRunning, ad.spend ? parseInt(ad.spend.upper_bound) : null),
      campaignType: classifyCampaignType('', primaryText, headline),
      relevanceScore: 50,
      competitorType: 'indirect' as const,
      relevanceReason: 'Not scored (no brand context)',
    });
  }

  logger.info({ analyzed: analyzedAds.length }, '[CreativeIntel] Completed ad analysis');

  // Group by competitor
  const pageMap = new Map<string, CreativeAnalysis[]>();
  for (const ad of analyzedAds) {
    if (!pageMap.has(ad.pageId)) {
      pageMap.set(ad.pageId, []);
    }
    pageMap.get(ad.pageId)!.push(ad);
  }

  const competitors = Array.from(pageMap.entries()).map(([pageId, ads]) =>
    buildCompetitorProfile(pageId, ads)
  );

  // Industry patterns (from AI-analyzed ads only)
  const aiAnalyzedAds = analyzedAds.filter(a => a.hookType !== 'not_analyzed');
  const industryPatterns = {
    dominantHooks: countPatterns(aiAnalyzedAds.map(a => a.hookType)).slice(0, 5),
    dominantCtas: countPatterns(aiAnalyzedAds.map(a => a.ctaType)).slice(0, 5),
    dominantOffers: countPatterns(aiAnalyzedAds.map(a => a.offerType)).slice(0, 5),
    avgAdAge: Math.round(analyzedAds.reduce((sum, a) => sum + a.daysRunning, 0) / analyzedAds.length),
    longestRunningAds: [...analyzedAds].sort((a, b) => b.daysRunning - a.daysRunning).slice(0, 5),
  };

  // Generate recommendations
  const recommendations = generateRecommendations(competitors, aiAnalyzedAds);

  // Build swipe file - organized by hook type AND creative format for easy browsing
  const swipeFile = [
    // Winners
    {
      category: 'Long-Running Winners (30+ days)',
      count: analyzedAds.filter(a => a.daysRunning >= 30).length,
      description: 'Ads running 30+ days are likely profitable - study these closely',
      ads: analyzedAds.filter(a => a.daysRunning >= 30).slice(0, 10),
    },
    // Hook-based categories
    {
      category: 'Aspiration Hooks',
      count: aiAnalyzedAds.filter(a => a.hookType === 'aspiration').length,
      description: 'Dream, achieve, glow, luxury messaging',
      ads: aiAnalyzedAds.filter(a => a.hookType === 'aspiration').slice(0, 10),
    },
    {
      category: 'Problem-First Hooks',
      count: aiAnalyzedAds.filter(a => a.hookType === 'problem_first').length,
      description: 'Pain points, frustrations, struggles',
      ads: aiAnalyzedAds.filter(a => a.hookType === 'problem_first').slice(0, 10),
    },
    {
      category: 'Social Proof Hooks',
      count: aiAnalyzedAds.filter(a => a.hookType === 'social_proof').length,
      description: 'Reviews, testimonials, numbers',
      ads: aiAnalyzedAds.filter(a => a.hookType === 'social_proof').slice(0, 10),
    },
    {
      category: 'Transformation Hooks',
      count: aiAnalyzedAds.filter(a => a.hookType === 'transformation').length,
      description: 'Before/after, visible results',
      ads: aiAnalyzedAds.filter(a => a.hookType === 'transformation').slice(0, 10),
    },
    {
      category: 'Question Hooks',
      count: aiAnalyzedAds.filter(a => a.hookType === 'question').length,
      description: 'Engaging questions that pull readers in',
      ads: aiAnalyzedAds.filter(a => a.hookType === 'question').slice(0, 10),
    },
    {
      category: 'Discount-Led Hooks',
      count: aiAnalyzedAds.filter(a => a.hookType === 'discount_lead').length,
      description: 'Offer-first messaging',
      ads: aiAnalyzedAds.filter(a => a.hookType === 'discount_lead').slice(0, 10),
    },
    // Creative Format categories (new!)
    {
      category: 'Before/After Transformations',
      count: analyzedAds.filter(a => a.creativeFormatDetailed === 'before_after').length,
      description: 'Transformation content showing results',
      ads: analyzedAds.filter(a => a.creativeFormatDetailed === 'before_after').slice(0, 10),
    },
    {
      category: 'Founder Story Ads',
      count: analyzedAds.filter(a => a.creativeFormatDetailed === 'founder_story').length,
      description: 'Brand founders sharing their journey',
      ads: analyzedAds.filter(a => a.creativeFormatDetailed === 'founder_story').slice(0, 10),
    },
    {
      category: 'Podcast/Interview Style',
      count: analyzedAds.filter(a => a.creativeFormatDetailed === 'podcast_interview').length,
      description: 'Conversation and interview format',
      ads: analyzedAds.filter(a => a.creativeFormatDetailed === 'podcast_interview').slice(0, 10),
    },
    {
      category: 'UGC Testimonials',
      count: analyzedAds.filter(a => a.creativeFormatDetailed === 'ugc_testimonial').length,
      description: 'Customer reviews and testimonials',
      ads: analyzedAds.filter(a => a.creativeFormatDetailed === 'ugc_testimonial').slice(0, 10),
    },
    {
      category: 'UGC Talking Head',
      count: analyzedAds.filter(a => a.creativeFormatDetailed === 'ugc_talking_head').length,
      description: 'Person talking directly to camera (POV style)',
      ads: analyzedAds.filter(a => a.creativeFormatDetailed === 'ugc_talking_head').slice(0, 10),
    },
    {
      category: 'Product Demos',
      count: analyzedAds.filter(a => a.creativeFormatDetailed === 'product_demo').length,
      description: 'How-to-use and demonstration content',
      ads: analyzedAds.filter(a => a.creativeFormatDetailed === 'product_demo').slice(0, 10),
    },
    {
      category: 'Comparison Ads',
      count: analyzedAds.filter(a => a.creativeFormatDetailed === 'comparison').length,
      description: 'Us vs them, differentiation content',
      ads: analyzedAds.filter(a => a.creativeFormatDetailed === 'comparison').slice(0, 10),
    },
    {
      category: 'Unboxing',
      count: analyzedAds.filter(a => a.creativeFormatDetailed === 'unboxing').length,
      description: 'Package reveals and unboxing experiences',
      ads: analyzedAds.filter(a => a.creativeFormatDetailed === 'unboxing').slice(0, 10),
    },
    {
      category: 'Meme/Relatable',
      count: analyzedAds.filter(a => a.creativeFormatDetailed === 'meme_relatable').length,
      description: 'Meme format and relatable content',
      ads: analyzedAds.filter(a => a.creativeFormatDetailed === 'meme_relatable').slice(0, 10),
    },
    // Spend-based
    {
      category: 'High Spend Ads',
      count: analyzedAds.filter(a => a.spendUpper && a.spendUpper > 50000).length,
      description: 'Ads with significant budget behind them',
      ads: analyzedAds.filter(a => a.spendUpper && a.spendUpper > 50000).slice(0, 10),
    },
  ].filter(s => s.ads.length > 0);

  return {
    searchQuery: query,
    analyzedAt: new Date().toISOString(),
    totalAdsAnalyzed: analyzedAds.length,
    competitors,
    industryPatterns,
    recommendations,
    swipeFile,
  };
}

// ============ DISCOVERY-BASED INTEL ============

/**
 * Run competitor intel starting from discovered competitors
 * This is the "brand context first" workflow
 */
export async function runCompetitorIntelFromDiscovery(
  discovery: DiscoveryResult,
  options: {
    country?: string;
    limit?: number;
    userId?: string;
    analyzeTop?: number;
  } = {}
): Promise<CreativeIntelReport> {
  const { country = 'IN', limit = 50, userId, analyzeTop = 15 } = options;

  logger.info({
    brand: discovery.brand.title,
    competitors: discovery.competitors.length
  }, '[CreativeIntel] Running intel from discovery');

  // Get user token if available
  let userToken: string | undefined;
  if (userId) {
    try {
      const db = getDbAdapter();
      const row = await db.get('SELECT encrypted_access_token FROM meta_tokens WHERE user_id = ?', [userId]) as { encrypted_access_token: string } | undefined;
      if (row) {
        userToken = decryptToken(row.encrypted_access_token);
      }
    } catch {
      // Continue without user token
    }
  }

  // Fetch ads from top discovered competitors (by page ID)
  const allRawAds: AdLibraryAd[] = [];
  const topCompetitors = discovery.competitors.slice(0, 10);

  for (const competitor of topCompetitors) {
    try {
      // Search by page name to get their ads
      const ads = await fetchAdLibrary(competitor.pageName, country, Math.ceil(limit / topCompetitors.length), userToken);
      // Filter to only include ads from this specific page
      const pageAds = ads.filter(ad => ad.page_id === competitor.pageId);
      allRawAds.push(...pageAds);

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (err) {
      logger.warn({ err, competitor: competitor.pageName }, '[CreativeIntel] Failed to fetch ads for competitor');
    }
  }

  logger.info({ count: allRawAds.length }, '[CreativeIntel] Fetched ads from discovered competitors');

  if (allRawAds.length === 0) {
    // Fallback: search by industry terms
    for (const term of discovery.brand.suggestedSearchTerms.slice(0, 2)) {
      const ads = await fetchAdLibrary(term, country, 25, userToken);
      allRawAds.push(...ads);
    }
  }

  if (allRawAds.length === 0) {
    return {
      searchQuery: `Discovery: ${discovery.brand.title}`,
      analyzedAt: new Date().toISOString(),
      totalAdsAnalyzed: 0,
      competitors: [],
      industryPatterns: {
        dominantHooks: [],
        dominantCtas: [],
        dominantOffers: [],
        avgAdAge: 0,
        longestRunningAds: [],
      },
      recommendations: [{
        priority: 'high',
        category: 'No Data',
        insight: `No active ads found for competitors in ${discovery.brand.industry} industry`,
        action: 'Try different search terms or verify competitors are running Meta ads.',
        basedOn: 'Discovery returned 0 ads',
      }],
      swipeFile: [],
    };
  }

  // Dedupe ads by ID
  const seenIds = new Set<string>();
  const dedupedAds = allRawAds.filter(ad => {
    if (seenIds.has(ad.id)) return false;
    seenIds.add(ad.id);
    return true;
  });

  // Filter out boosted posts - only keep conversion ads
  const conversionAds = filterConversionAds(dedupedAds);

  if (conversionAds.length === 0) {
    return {
      searchQuery: `Discovery: ${discovery.brand.title}`,
      analyzedAt: new Date().toISOString(),
      totalAdsAnalyzed: 0,
      competitors: [],
      industryPatterns: {
        dominantHooks: [],
        dominantCtas: [],
        dominantOffers: [],
        avgAdAge: 0,
        longestRunningAds: [],
      },
      recommendations: [{
        priority: 'medium',
        category: 'No Conversion Ads',
        insight: `Found ${dedupedAds.length} ads but all were boosted posts (linking to Instagram/Facebook profiles). No conversion ads found.`,
        action: 'These competitors may only be running engagement campaigns, not direct-response ads. Try searching for different competitors or industry terms.',
        basedOn: 'All ads filtered as boosted posts',
      }],
      swipeFile: [],
    };
  }

  // Sort by longevity and analyze
  const sortedAds = [...conversionAds].sort((a, b) =>
    new Date(a.ad_delivery_start_time).getTime() - new Date(b.ad_delivery_start_time).getTime()
  );

  const adsToAnalyze = sortedAds.slice(0, analyzeTop);
  const analyzedAds: CreativeAnalysis[] = [];

  // Analyze ads with AI
  for (const ad of adsToAnalyze) {
    try {
      const analysis = await analyzeAd(ad);
      analyzedAds.push(analysis);
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (err) {
      logger.warn({ adId: ad.id, err }, '[CreativeIntel] Failed to analyze ad');
    }
  }

  // Add remaining ads without AI analysis
  for (const ad of sortedAds.slice(analyzeTop)) {
    const startDate = new Date(ad.ad_delivery_start_time);
    const daysRunning = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const primaryText = ad.ad_creative_bodies?.[0] || '';
    const headline = ad.ad_creative_link_titles?.[0] || '';
    const caption = ad.ad_creative_link_captions?.[0] || '';

    analyzedAds.push({
      adId: ad.id,
      pageId: ad.page_id,
      pageName: ad.page_name,
      snapshotUrl: ad.ad_snapshot_url,
      startDate: ad.ad_delivery_start_time,
      endDate: ad.ad_delivery_stop_time || null,
      daysRunning,
      isActive: !ad.ad_delivery_stop_time,
      spendLower: ad.spend ? parseInt(ad.spend.lower_bound) : null,
      spendUpper: ad.spend ? parseInt(ad.spend.upper_bound) : null,
      impressionsLower: ad.impressions ? parseInt(ad.impressions.lower_bound) : null,
      impressionsUpper: ad.impressions ? parseInt(ad.impressions.upper_bound) : null,
      primaryText: primaryText || null,
      headline: headline || null,
      caption: caption || null,
      platforms: ad.publisher_platforms || [],
      hookType: 'not_analyzed',
      hookText: '',
      ctaType: 'not_analyzed',
      ctaText: '',
      offerType: 'not_analyzed',
      offerDetails: '',
      creativeFormat: 'not_analyzed',
      creativeFormatDetailed: classifyCreativeFormat(primaryText, headline, caption),
      emotionalTriggers: [],
      targetAudience: 'not_analyzed',
      longevityScore: calculateLongevityScore(daysRunning),
      estimatedPerformance: estimatePerformance(daysRunning, ad.spend ? parseInt(ad.spend.upper_bound) : null),
      campaignType: classifyCampaignType('', primaryText, headline),
      relevanceScore: 50,
      competitorType: 'indirect' as const,
      relevanceReason: 'Not yet scored',
    });
  }

  // Score relevance for all ads using brand context
  logger.info('[CreativeIntel] Scoring ad relevance...');
  const scoredAds = await addRelevanceScoring(analyzedAds, discovery.brand);

  // Filter out irrelevant ads (score < 40) but keep direct and indirect
  const relevantAds = scoredAds.filter(a => a.competitorType !== 'irrelevant');
  const directAds = scoredAds.filter(a => a.competitorType === 'direct');
  const indirectAds = scoredAds.filter(a => a.competitorType === 'indirect');

  logger.info({
    total: scoredAds.length,
    direct: directAds.length,
    indirect: indirectAds.length,
    irrelevant: scoredAds.length - relevantAds.length,
  }, '[CreativeIntel] Relevance filtering complete');

  // Group by competitor (using relevant ads only)
  const pageMap = new Map<string, CreativeAnalysis[]>();
  for (const ad of relevantAds) {
    if (!pageMap.has(ad.pageId)) {
      pageMap.set(ad.pageId, []);
    }
    pageMap.get(ad.pageId)!.push(ad);
  }

  const competitors = Array.from(pageMap.entries()).map(([pageId, ads]) =>
    buildCompetitorProfile(pageId, ads)
  );

  // Industry patterns (using only direct competitors for messaging insights)
  const directAdsWithAnalysis = directAds.filter(a => a.hookType !== 'not_analyzed');
  const industryPatterns = {
    dominantHooks: countPatterns(directAdsWithAnalysis.map(a => a.hookType)).slice(0, 5),
    dominantCtas: countPatterns(directAdsWithAnalysis.map(a => a.ctaType)).slice(0, 5),
    dominantOffers: countPatterns(directAdsWithAnalysis.map(a => a.offerType)).slice(0, 5),
    avgAdAge: relevantAds.length > 0
      ? Math.round(relevantAds.reduce((sum, a) => sum + a.daysRunning, 0) / relevantAds.length)
      : 0,
    longestRunningAds: [...relevantAds].sort((a, b) => b.daysRunning - a.daysRunning).slice(0, 5),
  };

  // Generate recommendations
  const recommendations = generateRecommendations(competitors, directAdsWithAnalysis);

  // Build swipe file - DIRECT competitors (copy messaging)
  const directSwipeFile = [
    {
      category: '🎯 Direct: Long-Running Winners (30+ days)',
      count: directAds.filter(a => a.daysRunning >= 30).length,
      description: 'Same product category - copy their hooks and offers',
      ads: directAds.filter(a => a.daysRunning >= 30).slice(0, 10),
    },
    {
      category: '🎯 Direct: UGC Testimonials',
      count: directAds.filter(a => a.creativeFormatDetailed === 'ugc_testimonial').length,
      description: 'Customer reviews from similar brands',
      ads: directAds.filter(a => a.creativeFormatDetailed === 'ugc_testimonial').slice(0, 10),
    },
    {
      category: '🎯 Direct: Product Demos',
      count: directAds.filter(a => a.creativeFormatDetailed === 'product_demo').length,
      description: 'How competitors showcase their products',
      ads: directAds.filter(a => a.creativeFormatDetailed === 'product_demo').slice(0, 10),
    },
  ].filter(s => s.ads.length > 0);

  // Build swipe file - INDIRECT competitors (experiment with format)
  const indirectSwipeFile = [
    {
      category: '💡 Indirect: Creative Format Inspiration',
      count: indirectAds.filter(a => a.daysRunning >= 30).length,
      description: 'Different product but proven creative techniques - experiment with these formats',
      ads: indirectAds.filter(a => a.daysRunning >= 30).slice(0, 10),
    },
    {
      category: '💡 Indirect: Transition & Editing Styles',
      count: indirectAds.filter(a => a.creativeFormatDetailed === 'before_after').length,
      description: 'Visual techniques to adapt for your products',
      ads: indirectAds.filter(a => a.creativeFormatDetailed === 'before_after').slice(0, 10),
    },
    {
      category: '💡 Indirect: Founder Stories',
      count: indirectAds.filter(a => a.creativeFormatDetailed === 'founder_story').length,
      description: 'Storytelling formats from other industries',
      ads: indirectAds.filter(a => a.creativeFormatDetailed === 'founder_story').slice(0, 10),
    },
  ].filter(s => s.ads.length > 0);

  const swipeFile = [...directSwipeFile, ...indirectSwipeFile];

  return {
    searchQuery: `Discovery: ${discovery.brand.title} (${discovery.brand.industry})`,
    analyzedAt: new Date().toISOString(),
    totalAdsAnalyzed: relevantAds.length,
    competitors,
    industryPatterns,
    recommendations,
    swipeFile,
  };
}
