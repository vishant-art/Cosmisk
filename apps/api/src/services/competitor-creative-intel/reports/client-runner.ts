/**
 * Competitor Creative Intelligence — Client-Aware Report Runner
 */

import { logger } from '../../../utils/logger.js';
import {
  getClientContext,
  updateCompetitorIntelStore,
  addReferenceShown,
  hasReferenceBeenShown,
  createRecommendation,
  isAdRelevantForClient,
  getSearchQueriesForClient,
} from '../../service-clients.js';
import { agentRecommend } from '../../recommendation-loop.js';
import { analyzeAdWithGemini } from '../ai-analysis.js';
import { scrapeMetaAdsBulk, convertScrapedAd } from '../bulk-scraper.js';
import {
  buildCompetitorProfile,
  countPatterns,
  generateRecommendations,
} from '../analysis-core.js';
import type {
  BrandContext,
  ClientIntelReport,
  CreativeAnalysis,
} from '../types.js';

// ============================================================================
// CLIENT-AWARE COMPETITOR INTEL
// ============================================================================

/**
 * Run competitor intelligence for a specific client
 * - Uses client's category for search queries
 * - Filters ads by client's revenue level (scaled brands get scaled references)
 * - Tracks shown references to avoid duplicates
 * - Records recommendations for outcome tracking
 */
export async function runCompetitorIntelForClient(
  clientId: string,
  options: { extraQueries?: string[]; limit?: number; analyzeTop?: number } = {}
): Promise<ClientIntelReport | null> {
  const { extraQueries = [], limit = 300, analyzeTop = 25 } = options;

  // Get client context
  const ctx = await getClientContext(clientId);
  if (!ctx) {
    logger.error({ clientId }, '[ClientIntel] Client not found');
    return null;
  }

  const { client, competitorIntel } = ctx;
  logger.info({ clientId, brandName: client.brandName, revenueLevel: client.revenueLevel }, '[ClientIntel] Starting for client');

  // Build search queries for this client
  const baseQueries = getSearchQueriesForClient(client);
  const allQueries = [...new Set([...baseQueries, ...extraQueries])];

  if (allQueries.length === 0) {
    logger.warn({ clientId }, '[ClientIntel] No search queries available for client');
    return null;
  }

  logger.info({ queries: allQueries }, '[ClientIntel] Search queries');

  // Scrape ads for all queries
  let allAds: CreativeAnalysis[] = [];
  const usedQueries: string[] = [];

  for (const query of allQueries.slice(0, 5)) { // Max 5 queries to avoid rate limits
    try {
      const scrapeResult = await scrapeMetaAdsBulk({ query, country: 'IN', limit: Math.ceil(limit / allQueries.length), activeOnly: true });
      if (scrapeResult.success && scrapeResult.ads.length > 0) {
        const converted = scrapeResult.ads.map(convertScrapedAd);
        allAds.push(...converted);
        usedQueries.push(query);
        logger.info({ query, count: converted.length }, '[ClientIntel] Scraped ads');
      }
      await new Promise(r => setTimeout(r, 500)); // Rate limit between queries
    } catch (e) {
      logger.warn({ query, error: String(e) }, '[ClientIntel] Query failed');
    }
  }

  // Dedupe by adId
  const adMap = new Map<string, CreativeAnalysis>();
  for (const ad of allAds) {
    if (!adMap.has(ad.adId)) adMap.set(ad.adId, ad);
  }
  allAds = Array.from(adMap.values());

  logger.info({ total: allAds.length }, '[ClientIntel] Total unique ads scraped');

  // Filter to conversion ads only
  allAds = allAds.filter(ad => ad.campaignType === 'conversion');

  // Sort by longevity (best ads first)
  allAds.sort((a, b) => b.daysRunning - a.daysRunning);

  // Filter by client level and already-shown
  const beforeFilterCount = allAds.length;
  const filteredAds: CreativeAnalysis[] = [];
  const alreadyShownCount = { count: 0 };

  for (const ad of allAds) {
    // Skip already shown references
    if (await hasReferenceBeenShown(clientId, ad.adId)) {
      alreadyShownCount.count++;
      continue;
    }

    // Estimate ad scale based on impressions/spend
    let estimatedScale: 'small' | 'medium' | 'large' = 'medium';
    if (ad.spendUpper && ad.spendUpper > 500000) estimatedScale = 'large';
    else if (ad.spendUpper && ad.spendUpper < 50000) estimatedScale = 'small';
    else if (ad.daysRunning > 90) estimatedScale = 'large';
    else if (ad.daysRunning < 30) estimatedScale = 'small';

    // Apply client-level filtering
    if (!isAdRelevantForClient(client, ad.daysRunning, estimatedScale)) {
      continue;
    }

    filteredAds.push(ad);
  }

  const filteredOutCount = beforeFilterCount - filteredAds.length - alreadyShownCount.count;
  logger.info({
    beforeFilter: beforeFilterCount,
    afterFilter: filteredAds.length,
    alreadyShown: alreadyShownCount.count,
    filteredOut: filteredOutCount
  }, '[ClientIntel] Filtering complete');

  // Analyze top N with AI (include brand context)
  const brandContext: BrandContext = {
    url: '',
    title: client.brandName,
    description: client.notes || '',
    industry: client.category || 'fashion',
    keywords: [client.brandName, client.category || ''].filter(Boolean),
    suggestedSearchTerms: usedQueries,
  };

  const analyzedAds: CreativeAnalysis[] = [];
  for (const ad of filteredAds.slice(0, analyzeTop)) {
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
  // Add remaining unanalyzed ads
  analyzedAds.push(...filteredAds.slice(analyzeTop));

  // Track these as shown references
  for (const ad of analyzedAds) {
    await addReferenceShown(clientId, ad.adId);
  }

  // Update search queries used in store
  if (competitorIntel) {
    const updatedQueries = [...new Set([...(competitorIntel.searchQueriesUsed || []), ...usedQueries])];
    await updateCompetitorIntelStore(clientId, {
      searchQueriesUsed: updatedQueries,
      lastScrapeAt: new Date().toISOString(),
      lastReportAt: new Date().toISOString(),
    });
  }

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

  // Create recommendation records for tracking
  for (const rec of recommendations.slice(0, 5)) {
    await createRecommendation(clientId, 'competitor_intel', rec.category, {
      insight: rec.insight,
      action: rec.action,
      basedOn: rec.basedOn,
      priority: rec.priority,
    });

    // === CLOSED-LOOP OPERATING SYSTEM ===
    try {
      await agentRecommend(clientId, 'competitor_intel', {
        type: 'test_creative',
        entityType: 'creative',
        entityId: `competitor-insight-${rec.category}`,
        entityName: rec.category,
        action: rec.action,
        reasoning: rec.insight,
        evidence: [
          `Based on: ${rec.basedOn}`,
          `Priority: ${rec.priority}`,
          `Category: ${rec.category}`,
        ],
        confidence: rec.priority === 'high' ? 85 : rec.priority === 'medium' ? 70 : 55,
        predictedSavings: 0, // Competitor intel doesn't have direct savings
      });
    } catch (loopErr) {
      logger.warn({ err: loopErr }, '[CompetitorIntel] Closed-loop tracking failed');
    }
  }

  // Build swipe file
  const swipeFile = [
    { category: 'Long-Running Winners (60+ days)', count: analyzedAds.filter(a => a.daysRunning >= 60).length, description: 'Proven winners for scaled brands', ads: analyzedAds.filter(a => a.daysRunning >= 60).slice(0, 10) },
    { category: 'Aspiration Hooks', count: aiAnalyzedAds.filter(a => a.hookType === 'aspiration').length, description: 'Dream, achieve, luxury messaging', ads: aiAnalyzedAds.filter(a => a.hookType === 'aspiration').slice(0, 10) },
    { category: 'Problem-First Hooks', count: aiAnalyzedAds.filter(a => a.hookType === 'problem_first').length, description: 'Pain points, frustrations', ads: aiAnalyzedAds.filter(a => a.hookType === 'problem_first').slice(0, 10) },
    { category: 'Social Proof Hooks', count: aiAnalyzedAds.filter(a => a.hookType === 'social_proof').length, description: 'Reviews, testimonials', ads: aiAnalyzedAds.filter(a => a.hookType === 'social_proof').slice(0, 10) },
    { category: 'Direct Competitors', count: aiAnalyzedAds.filter(a => a.competitorType === 'direct').length, description: 'Same product category - copy messaging', ads: aiAnalyzedAds.filter(a => a.competitorType === 'direct').slice(0, 10) },
  ].filter(cat => cat.count > 0);

  logger.info({
    clientId,
    brandName: client.brandName,
    adsAnalyzed: analyzedAds.length,
    newReferences: analyzedAds.length,
    competitors: competitors.length
  }, '[ClientIntel] Report complete');

  return {
    searchQuery: usedQueries.join(', '),
    analyzedAt: new Date().toISOString(),
    totalAdsAnalyzed: analyzedAds.length,
    competitors,
    industryPatterns,
    recommendations,
    swipeFile,
    // Client-specific fields
    clientId,
    clientName: client.brandName,
    revenueLevel: client.revenueLevel,
    newReferencesCount: analyzedAds.length,
    filteredOutCount,
    searchQueriesUsed: usedQueries,
  };
}
