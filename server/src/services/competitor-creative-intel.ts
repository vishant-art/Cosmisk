/**
 * Competitor Creative Intelligence Agent — Cosmisk
 *
 * Deep analysis of competitor ads from Meta Ad Library.
 * Tracks ad longevity, extracts creative patterns, and generates
 * actionable recommendations for DTC brands.
 *
 * Features:
 * 1. Deep creative analysis (hooks, CTAs, offers, formats)
 * 2. Longevity tracking (ads running 30+ days = profitable)
 * 3. Pattern extraction across competitors
 * 4. Searchable creative database
 * 5. Actionable recommendations
 */

import { getDb } from '../db/index.js';
import { config } from '../config.js';
import { safeFetch, safeJson } from '../utils/safe-fetch.js';
import { decryptToken } from './token-crypto.js';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { extractText } from '../utils/claude-helpers.js';
import { logger } from '../utils/logger.js';

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
const gemini = config.geminiApiKey ? new GoogleGenerativeAI(config.geminiApiKey) : null;

// ============ TYPES ============

export interface CreativeAnalysis {
  // Basic info
  adId: string;
  pageId: string;
  pageName: string;
  snapshotUrl: string;

  // Timing
  startDate: string;
  endDate: string | null;
  daysRunning: number;
  isActive: boolean;

  // Spend/Reach estimates
  spendLower: number | null;
  spendUpper: number | null;
  impressionsLower: number | null;
  impressionsUpper: number | null;

  // Creative content
  primaryText: string | null;
  headline: string | null;
  caption: string | null;
  platforms: string[];

  // AI-extracted patterns
  hookType: string;
  hookText: string;
  ctaType: string;
  ctaText: string;
  offerType: string;
  offerDetails: string;
  creativeFormat: string;
  emotionalTriggers: string[];
  targetAudience: string;

  // Scoring
  longevityScore: number; // 0-100 based on days running
  estimatedPerformance: 'high' | 'medium' | 'low' | 'unknown';
}

export interface CompetitorProfile {
  pageName: string;
  pageId: string;
  totalAdsFound: number;
  activeAds: number;
  avgAdAge: number;
  longestRunningAd: CreativeAnalysis | null;

  // Pattern summary
  topHookTypes: Array<{ type: string; count: number; percentage: number }>;
  topCtaTypes: Array<{ type: string; count: number; percentage: number }>;
  topOfferTypes: Array<{ type: string; count: number; percentage: number }>;
  topFormats: Array<{ type: string; count: number; percentage: number }>;

  // Platforms
  platformBreakdown: Record<string, number>;

  // Sample creatives (top performing)
  topCreatives: CreativeAnalysis[];
}

export interface CreativeIntelReport {
  // Query info
  searchQuery: string;
  analyzedAt: string;
  totalAdsAnalyzed: number;

  // Competitors
  competitors: CompetitorProfile[];

  // Cross-competitor patterns
  industryPatterns: {
    dominantHooks: Array<{ type: string; count: number; percentage: number }>;
    dominantCtas: Array<{ type: string; count: number; percentage: number }>;
    dominantOffers: Array<{ type: string; count: number; percentage: number }>;
    avgAdAge: number;
    longestRunningAds: CreativeAnalysis[];
  };

  // Recommendations
  recommendations: Array<{
    priority: 'high' | 'medium' | 'low';
    category: string;
    insight: string;
    action: string;
    basedOn: string;
  }>;

  // Swipe file
  swipeFile: Array<{
    category: string;
    ads: CreativeAnalysis[];
  }>;
}

// ============ META AD LIBRARY ============

interface AdLibraryAd {
  id: string;
  ad_creation_time: string;
  ad_creative_bodies?: string[];
  ad_creative_link_captions?: string[];
  ad_creative_link_titles?: string[];
  ad_delivery_start_time: string;
  ad_delivery_stop_time?: string;
  ad_snapshot_url: string;
  byline?: string;
  currency?: string;
  impressions?: { lower_bound: string; upper_bound: string };
  spend?: { lower_bound: string; upper_bound: string };
  page_id: string;
  page_name: string;
  publisher_platforms?: string[];
}

async function fetchAdLibrary(
  query: string,
  country: string = 'IN',
  limit: number = 50,
  userToken?: string
): Promise<AdLibraryAd[]> {
  const fields = 'id,ad_creation_time,ad_creative_bodies,ad_creative_link_captions,ad_creative_link_titles,ad_delivery_start_time,ad_delivery_stop_time,ad_snapshot_url,byline,currency,impressions,spend,page_id,page_name,publisher_platforms';

  const baseParams = {
    search_terms: query,
    ad_type: 'ALL',
    ad_reached_countries: `["${country}"]`,
    ad_active_status: 'ACTIVE',
    fields,
    limit: String(limit),
  };

  // Ad Library API prioritizes user tokens (more likely to have ads_read permission)
  // App tokens only work if the app is verified for Ad Library access
  const tokens: string[] = [];
  if (userToken) {
    tokens.push(userToken);
  }
  // Only add app token as fallback - most apps won't have Ad Library verification
  if (config.metaAppId && config.metaAppSecret) {
    tokens.push(`${config.metaAppId}|${config.metaAppSecret}`);
  }

  if (tokens.length === 0) {
    logger.warn('[CreativeIntel] No tokens available for Ad Library API');
    return [];
  }

  let lastError: string | null = null;

  for (const token of tokens) {
    const params = new URLSearchParams({ ...baseParams, access_token: token });
    const url = `${config.graphApiBase}/ads_archive?${params.toString()}`;

    try {
      const response = await safeFetch(url, { service: 'Meta Ad Library' });
      const data = await safeJson(response);

      if (data?.error) {
        lastError = data.error.message || 'Unknown API error';
        logger.warn({ error: data.error }, '[CreativeIntel] Ad Library API error, trying next token');
        continue;
      }

      if (response.ok && data?.data) {
        return data.data;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Fetch failed';
      logger.warn({ err }, '[CreativeIntel] Ad Library fetch failed, trying next token');
    }
  }

  if (lastError) {
    logger.error({ lastError }, '[CreativeIntel] All tokens failed for Ad Library');
  }

  return [];
}

// ============ AI ANALYSIS ============

const CREATIVE_ANALYSIS_PROMPT = `You are a creative strategist analyzing competitor ads. Extract patterns from this ad.

Return a JSON object with these fields:
{
  "hookType": "problem_first|social_proof|discount_lead|curiosity|fear|aspiration|transformation|testimonial|question|statistic|story|other",
  "hookText": "The actual hook text (first line that grabs attention)",
  "ctaType": "urgency|benefit|curiosity|social_proof|scarcity|free_offer|discount|learn_more|shop_now|other",
  "ctaText": "The actual CTA text",
  "offerType": "percentage_discount|flat_discount|free_shipping|bundle|trial|gift|bogo|none|other",
  "offerDetails": "Specific offer (e.g., '20% off', 'Free shipping over ₹499')",
  "creativeFormat": "ugc_video|studio_video|static_image|carousel|gif|catalog_dpa|other",
  "emotionalTriggers": ["fomo", "trust", "excitement", "fear", "aspiration", "belonging", "curiosity"],
  "targetAudience": "Brief description of who this ad targets"
}

Be precise. If unsure, use "other" or "unknown".`;

async function analyzeCreativeWithAI(ad: AdLibraryAd): Promise<Partial<CreativeAnalysis>> {
  const adContent = {
    primaryText: ad.ad_creative_bodies?.[0] || '',
    headline: ad.ad_creative_link_titles?.[0] || '',
    caption: ad.ad_creative_link_captions?.[0] || '',
    platforms: ad.publisher_platforms || [],
  };

  // Skip if no content to analyze
  if (!adContent.primaryText && !adContent.headline) {
    return {
      hookType: 'unknown',
      hookText: '',
      ctaType: 'unknown',
      ctaText: '',
      offerType: 'none',
      offerDetails: '',
      creativeFormat: 'unknown',
      emotionalTriggers: [],
      targetAudience: 'unknown',
    };
  }

  const userPrompt = `Analyze this ad:\n\nPrimary Text: ${adContent.primaryText}\n\nHeadline: ${adContent.headline}\n\nCaption: ${adContent.caption}\n\nPlatforms: ${adContent.platforms.join(', ')}`;

  // Try Anthropic first
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      temperature: 0,
      system: CREATIVE_ANALYSIS_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = extractText(response, '{}');
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parseAnalysisResult(parsed);
    }
  } catch (err) {
    logger.warn({ err }, '[CreativeIntel] Anthropic analysis failed, trying Gemini');
  }

  // Fallback to Gemini
  if (gemini) {
    try {
      const model = gemini.getGenerativeModel({ model: 'gemini-1.5-pro-latest' });
      const result = await model.generateContent(`${CREATIVE_ANALYSIS_PROMPT}\n\n${userPrompt}`);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parseAnalysisResult(parsed);
      }
    } catch (err) {
      logger.warn({ err }, '[CreativeIntel] Gemini analysis also failed');
    }
  }

  return {
    hookType: 'unknown',
    hookText: '',
    ctaType: 'unknown',
    ctaText: '',
    offerType: 'none',
    offerDetails: '',
    creativeFormat: 'unknown',
    emotionalTriggers: [],
    targetAudience: 'unknown',
  };
}

function parseAnalysisResult(parsed: Record<string, unknown>): Partial<CreativeAnalysis> {
  return {
    hookType: (parsed['hookType'] as string) || 'unknown',
    hookText: (parsed['hookText'] as string) || '',
    ctaType: (parsed['ctaType'] as string) || 'unknown',
    ctaText: (parsed['ctaText'] as string) || '',
    offerType: (parsed['offerType'] as string) || 'none',
    offerDetails: (parsed['offerDetails'] as string) || '',
    creativeFormat: (parsed['creativeFormat'] as string) || 'unknown',
    emotionalTriggers: (parsed['emotionalTriggers'] as string[]) || [],
    targetAudience: (parsed['targetAudience'] as string) || 'unknown',
  };
}

// ============ MAIN FUNCTIONS ============

function calculateLongevityScore(daysRunning: number): number {
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

function estimatePerformance(daysRunning: number, spend: number | null): CreativeAnalysis['estimatedPerformance'] {
  if (daysRunning >= 30 && (spend === null || spend > 10000)) return 'high';
  if (daysRunning >= 14 && (spend === null || spend > 5000)) return 'medium';
  if (daysRunning < 7) return 'unknown';
  return 'low';
}

async function analyzeAd(ad: AdLibraryAd): Promise<CreativeAnalysis> {
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
    primaryText: ad.ad_creative_bodies?.[0] || null,
    headline: ad.ad_creative_link_titles?.[0] || null,
    caption: ad.ad_creative_link_captions?.[0] || null,
    platforms: ad.publisher_platforms || [],
    hookType: aiAnalysis.hookType || 'unknown',
    hookText: aiAnalysis.hookText || '',
    ctaType: aiAnalysis.ctaType || 'unknown',
    ctaText: aiAnalysis.ctaText || '',
    offerType: aiAnalysis.offerType || 'none',
    offerDetails: aiAnalysis.offerDetails || '',
    creativeFormat: aiAnalysis.creativeFormat || 'unknown',
    emotionalTriggers: aiAnalysis.emotionalTriggers || [],
    targetAudience: aiAnalysis.targetAudience || 'unknown',
    longevityScore: calculateLongevityScore(daysRunning),
    estimatedPerformance: estimatePerformance(daysRunning, spendUpper),
  };
}

function countPatterns<T extends string>(items: T[]): Array<{ type: T; count: number; percentage: number }> {
  const counts = new Map<T, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }

  const total = items.length;
  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, count, percentage: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);
}

function buildCompetitorProfile(pageId: string, ads: CreativeAnalysis[]): CompetitorProfile {
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

function generateRecommendations(
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
      const db = getDb();
      const row = db.prepare('SELECT encrypted_access_token FROM meta_tokens WHERE user_id = ?').get(userId) as { encrypted_access_token: string } | undefined;
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

  if (rawAds.length === 0) {
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
  const sortedAds = [...rawAds].sort((a, b) =>
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
      primaryText: ad.ad_creative_bodies?.[0] || null,
      headline: ad.ad_creative_link_titles?.[0] || null,
      caption: ad.ad_creative_link_captions?.[0] || null,
      platforms: ad.publisher_platforms || [],
      hookType: 'not_analyzed',
      hookText: '',
      ctaType: 'not_analyzed',
      ctaText: '',
      offerType: 'not_analyzed',
      offerDetails: '',
      creativeFormat: 'not_analyzed',
      emotionalTriggers: [],
      targetAudience: 'not_analyzed',
      longevityScore: calculateLongevityScore(daysRunning),
      estimatedPerformance: estimatePerformance(daysRunning, ad.spend ? parseInt(ad.spend.upper_bound) : null),
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

  // Build swipe file
  const swipeFile = [
    {
      category: 'Long-Running (30+ days)',
      ads: analyzedAds.filter(a => a.daysRunning >= 30).slice(0, 10),
    },
    {
      category: 'High Spend',
      ads: analyzedAds.filter(a => a.spendUpper && a.spendUpper > 50000).slice(0, 10),
    },
    {
      category: 'UGC Style',
      ads: aiAnalyzedAds.filter(a => a.creativeFormat === 'ugc_video').slice(0, 10),
    },
    {
      category: 'Problem-First Hooks',
      ads: aiAnalyzedAds.filter(a => a.hookType === 'problem_first').slice(0, 10),
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

// ============ FORMATTED OUTPUT ============

export function formatCreativeIntelReport(report: CreativeIntelReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('              COMPETITOR CREATIVE INTELLIGENCE REPORT');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(`Search: "${report.searchQuery}"`);
  lines.push(`Analyzed: ${report.totalAdsAnalyzed} ads from ${report.competitors.length} competitors`);
  lines.push(`Date: ${new Date(report.analyzedAt).toLocaleString()}`);
  lines.push('');

  // Industry Patterns
  lines.push('┌──────────────────────────────────────────────────────────────────────┐');
  lines.push('│                      INDUSTRY PATTERNS                               │');
  lines.push('└──────────────────────────────────────────────────────────────────────┘');
  lines.push('');

  lines.push('Top Hook Types:');
  for (const hook of report.industryPatterns.dominantHooks.slice(0, 3)) {
    lines.push(`  • ${hook.type}: ${hook.percentage}% (${hook.count} ads)`);
  }
  lines.push('');

  lines.push('Top Offer Types:');
  for (const offer of report.industryPatterns.dominantOffers.slice(0, 3)) {
    lines.push(`  • ${offer.type}: ${offer.percentage}% (${offer.count} ads)`);
  }
  lines.push('');

  lines.push(`Average Ad Age: ${report.industryPatterns.avgAdAge} days`);
  lines.push('');

  // Longest Running Ads
  if (report.industryPatterns.longestRunningAds.length > 0) {
    lines.push('Longest Running Ads (Likely Profitable):');
    for (const ad of report.industryPatterns.longestRunningAds.slice(0, 3)) {
      lines.push(`  • ${ad.pageName} - ${ad.daysRunning} days`);
      lines.push(`    Hook: "${ad.hookText || ad.primaryText?.slice(0, 50) || 'N/A'}..."`);
      lines.push(`    ${ad.snapshotUrl}`);
    }
    lines.push('');
  }

  // Competitors
  lines.push('┌──────────────────────────────────────────────────────────────────────┐');
  lines.push('│                      COMPETITOR BREAKDOWN                            │');
  lines.push('└──────────────────────────────────────────────────────────────────────┘');
  lines.push('');

  for (const comp of report.competitors.slice(0, 5)) {
    lines.push(`📊 ${comp.pageName}`);
    lines.push(`   Active Ads: ${comp.activeAds} | Avg Age: ${comp.avgAdAge} days`);
    lines.push(`   Top Hook: ${comp.topHookTypes[0]?.type || 'N/A'} (${comp.topHookTypes[0]?.percentage || 0}%)`);
    lines.push(`   Top Offer: ${comp.topOfferTypes[0]?.type || 'N/A'}`);
    if (comp.longestRunningAd) {
      lines.push(`   Best Performer: Running ${comp.longestRunningAd.daysRunning} days`);
    }
    lines.push('');
  }

  // Recommendations
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('                      RECOMMENDATIONS');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  for (const rec of report.recommendations) {
    const priority = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
    lines.push(`${priority} [${rec.category}]`);
    lines.push(`   ${rec.insight}`);
    lines.push(`   → ACTION: ${rec.action}`);
    lines.push('');
  }

  // Swipe File Summary
  if (report.swipeFile.length > 0) {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('                      SWIPE FILE');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');

    for (const category of report.swipeFile) {
      lines.push(`📁 ${category.category} (${category.ads.length} ads)`);
      for (const ad of category.ads.slice(0, 3)) {
        lines.push(`   • ${ad.pageName}: ${ad.snapshotUrl}`);
      }
      lines.push('');
    }
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  return lines.join('\n');
}
