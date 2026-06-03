/**
 * Competitor Creative Intelligence — Bulk Report Runner
 *
 * Scrapes 500+ ads via the Python MetaAdsCollector (reverse-engineered GraphQL API).
 */

import { logger } from '../../../utils/logger.js';
import { analyzeAdWithGemini } from '../ai-analysis.js';
import { scrapeMetaAdsBulk, convertScrapedAd } from '../bulk-scraper.js';
import {
  buildCompetitorProfile,
  countPatterns,
  generateRecommendations,
} from '../analysis-core.js';
import type {
  BrandContext,
  CreativeAnalysis,
  CreativeIntelReport,
} from '../types.js';

/**
 * Run BULK competitor intelligence - scrapes 500+ ads
 * Uses Python MetaAdsCollector (reverse-engineered GraphQL API)
 */
export async function runCompetitorCreativeIntelBulk(
  query: string,
  options: { country?: string; limit?: number; analyzeTop?: number; brandContext?: BrandContext } = {}
): Promise<CreativeIntelReport> {
  const { country = 'IN', limit = 500, analyzeTop = 30, brandContext } = options;

  logger.info({ query, country, limit }, '[BulkCreativeIntel] Starting bulk analysis');

  const scrapeResult = await scrapeMetaAdsBulk({ query, country, limit, activeOnly: true });

  if (!scrapeResult.success || scrapeResult.ads.length === 0) {
    return {
      searchQuery: query,
      analyzedAt: new Date().toISOString(),
      totalAdsAnalyzed: 0,
      competitors: [],
      industryPatterns: { dominantHooks: [], dominantCtas: [], dominantOffers: [], avgAdAge: 0, longestRunningAds: [] },
      recommendations: [{ priority: 'high', category: 'No Data', insight: scrapeResult.error || `No ads found for "${query}"`, action: 'Try different search terms.', basedOn: 'Bulk scraper returned 0 results' }],
      swipeFile: [],
    };
  }

  logger.info({ total: scrapeResult.ads.length }, '[BulkCreativeIntel] Converting scraped ads...');

  // Convert and filter
  let allAds = scrapeResult.ads.map(convertScrapedAd);
  allAds = allAds.filter(ad => ad.campaignType === 'conversion');
  allAds.sort((a, b) => b.daysRunning - a.daysRunning);

  logger.info({ conversionAds: allAds.length }, '[BulkCreativeIntel] Filtered to conversion ads');

  // Analyze top N with AI
  const analyzedAds: CreativeAnalysis[] = [];
  for (const ad of allAds.slice(0, analyzeTop)) {
    try {
      if (ad.primaryText || ad.headline) {
        const aiAnalysis = await analyzeAdWithGemini(ad, brandContext);
        analyzedAds.push({ ...ad, ...aiAnalysis });
      } else {
        analyzedAds.push(ad);
      }
      await new Promise(r => setTimeout(r, 100));
    } catch {
      analyzedAds.push(ad);
    }
  }
  analyzedAds.push(...allAds.slice(analyzeTop));

  logger.info({ analyzed: analyzedAds.length }, '[BulkCreativeIntel] Analysis complete');

  // Build competitor profiles
  const pageMap = new Map<string, CreativeAnalysis[]>();
  for (const ad of analyzedAds) {
    if (!pageMap.has(ad.pageId)) pageMap.set(ad.pageId, []);
    pageMap.get(ad.pageId)!.push(ad);
  }
  const competitors = Array.from(pageMap.entries()).map(([pageId, ads]) => buildCompetitorProfile(pageId, ads));

  // Build industry patterns
  const aiAnalyzedAds = analyzedAds.filter(a => a.hookType !== 'unknown');
  const industryPatterns = {
    dominantHooks: countPatterns(aiAnalyzedAds.map(a => a.hookType)).slice(0, 5),
    dominantCtas: countPatterns(aiAnalyzedAds.map(a => a.ctaType)).slice(0, 5),
    dominantOffers: countPatterns(aiAnalyzedAds.map(a => a.offerType)).slice(0, 5),
    avgAdAge: analyzedAds.length > 0 ? Math.round(analyzedAds.reduce((sum, a) => sum + a.daysRunning, 0) / analyzedAds.length) : 0,
    longestRunningAds: [...analyzedAds].sort((a, b) => b.daysRunning - a.daysRunning).slice(0, 5),
  };

  // Generate recommendations
  const recommendations = generateRecommendations(competitors, aiAnalyzedAds);

  // Build swipe file
  const swipeFile = [
    { category: 'Long-Running Winners (30+ days)', count: analyzedAds.filter(a => a.daysRunning >= 30).length, description: 'Ads running 30+ days are likely profitable', ads: analyzedAds.filter(a => a.daysRunning >= 30).slice(0, 10) },
    { category: 'Aspiration Hooks', count: aiAnalyzedAds.filter(a => a.hookType === 'aspiration').length, description: 'Dream, achieve, luxury messaging', ads: aiAnalyzedAds.filter(a => a.hookType === 'aspiration').slice(0, 10) },
    { category: 'Problem-First Hooks', count: aiAnalyzedAds.filter(a => a.hookType === 'problem_first').length, description: 'Pain points, frustrations', ads: aiAnalyzedAds.filter(a => a.hookType === 'problem_first').slice(0, 10) },
    { category: 'Social Proof Hooks', count: aiAnalyzedAds.filter(a => a.hookType === 'social_proof').length, description: 'Reviews, testimonials', ads: aiAnalyzedAds.filter(a => a.hookType === 'social_proof').slice(0, 10) },
    { category: 'Discount-Led Hooks', count: aiAnalyzedAds.filter(a => a.hookType === 'discount_lead').length, description: 'Offer-first messaging', ads: aiAnalyzedAds.filter(a => a.hookType === 'discount_lead').slice(0, 10) },
  ].filter(cat => cat.count > 0);

  return { searchQuery: query, analyzedAt: new Date().toISOString(), totalAdsAnalyzed: analyzedAds.length, competitors, industryPatterns, recommendations, swipeFile };
}
