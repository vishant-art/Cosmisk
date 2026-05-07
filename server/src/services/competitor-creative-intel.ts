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
 * 6. Brand URL → Auto-discover competitors
 * 7. Creative format classification (before/after, founder, podcast, UGC, etc.)
 */

import { getDb } from '../db/index.js';
import { config } from '../config.js';
import { safeFetch, safeJson } from '../utils/safe-fetch.js';
import { decryptToken } from './token-crypto.js';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { extractText } from '../utils/claude-helpers.js';
import { logger } from '../utils/logger.js';
import * as cheerio from 'cheerio';
import {
  getClient,
  getClientContext,
  getCompetitorIntelStore,
  updateCompetitorIntelStore,
  addReferenceShown,
  hasReferenceBeenShown,
  createRecommendation,
  isAdRelevantForClient,
  getSearchQueriesForClient,
  type ServiceClient,
} from './service-clients.js';

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
  creativeFormatDetailed: CreativeFormatDetailed; // Enhanced format classification
  emotionalTriggers: string[];
  targetAudience: string;

  // Scoring
  longevityScore: number; // 0-100 based on days running
  estimatedPerformance: 'high' | 'medium' | 'low' | 'unknown';

  // Campaign type - CRITICAL: filters boost posts from real conversion ads
  campaignType: 'conversion' | 'engagement' | 'awareness' | 'unknown';

  // Relevance scoring - filters out unrelated competitors
  relevanceScore: number; // 0-100, how relevant is this to the client's products
  competitorType: 'direct' | 'indirect' | 'irrelevant';
  // direct = same product category (copy messaging, hooks, offers)
  // indirect = different product but great creative execution (copy format, transitions, editing)
  relevanceReason: string; // Why this score was assigned

  // For indirect competitors: what creative technique to learn
  creativeInsight?: string; // e.g., "Smooth product reveal transition", "Split-screen before/after"
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

  // Swipe file - organized by hook type with visual links
  swipeFile: Array<{
    category: string;
    count: number;
    description: string;
    ads: CreativeAnalysis[];
  }>;
}

// ============ BRAND CONTEXT & COMPETITOR DISCOVERY ============

export interface BrandContext {
  url: string;
  title: string;
  description: string;
  keywords: string[];
  industry: string;
  suggestedSearchTerms: string[];
}

export interface DiscoveredCompetitor {
  pageId: string;
  pageName: string;
  keywordHits: number;
  matchedKeywords: string[];
}

export interface DiscoveryResult {
  brand: BrandContext;
  competitors: DiscoveredCompetitor[];
  searchTermsUsed: string[];
  totalAdsScanned: number;
}

/**
 * Extract brand context from a website URL
 * Similar to meta-ads-spy discover_competitors.py
 */
export async function extractBrandContext(url: string): Promise<BrandContext> {
  logger.info({ url }, '[CreativeIntel] Extracting brand context from URL');

  try {
    const response = await safeFetch(url, {
      service: 'Brand Website',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract title
    const title = $('title').text().trim() || '';

    // Extract meta description
    let description = '';
    $('meta').each((_, el) => {
      const name = ($(el).attr('name') || $(el).attr('property') || '').toLowerCase();
      if (['description', 'og:description', 'twitter:description'].includes(name)) {
        description = $(el).attr('content') || description;
      }
    });

    // Fallback to first paragraph if no meta description
    if (!description) {
      $('p').each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 60) {
          description = text.slice(0, 300);
          return false; // break
        }
      });
    }

    // Extract keywords from title and description
    const keywords = extractKeywords(title, description);

    // Detect industry from content
    const industry = detectIndustry(title + ' ' + description);

    // Generate search terms for Meta Ad Library
    const suggestedSearchTerms = generateSearchTerms(title, description, industry);

    return {
      url,
      title,
      description,
      keywords,
      industry,
      suggestedSearchTerms,
    };
  } catch (err) {
    logger.error({ err, url }, '[CreativeIntel] Failed to extract brand context');
    throw err;
  }
}

/**
 * Extract keywords from text (similar to discover_competitors.py)
 */
function extractKeywords(title: string, description: string): string[] {
  const text = `${title} ${description}`.toLowerCase();
  const cleanText = text.replace(/[^a-z0-9\s]/g, ' ');
  const words = cleanText.split(/\s+/).filter(w => w.length > 3);

  const stopWords = new Set([
    'with', 'that', 'this', 'from', 'your', 'into', 'about', 'will', 'have',
    'they', 'been', 'more', 'make', 'most', 'best', 'just', 'like', 'what',
    'when', 'where', 'https', 'http', 'www', 'com', 'website', 'official',
    'home', 'page', 'shop', 'store', 'online', 'india', 'free', 'shipping',
  ]);

  const filteredWords = words.filter(w => !stopWords.has(w));

  // Generate bigrams as keyword candidates
  const bigrams: string[] = [];
  for (let i = 0; i < filteredWords.length - 1; i++) {
    bigrams.push(`${filteredWords[i]} ${filteredWords[i + 1]}`);
  }

  // Count occurrences
  const counts = new Map<string, number>();
  for (const bigram of bigrams) {
    counts.set(bigram, (counts.get(bigram) || 0) + 1);
  }

  // Top bigrams
  const topBigrams = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([bigram]) => bigram);

  // Top single words
  const wordCounts = new Map<string, number>();
  for (const word of filteredWords) {
    wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
  }
  const topWords = Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([word]) => word);

  return [...topBigrams, ...topWords];
}

/**
 * Detect industry from content
 */
function detectIndustry(text: string): string {
  const lower = text.toLowerCase();

  const industries: Record<string, string[]> = {
    'skincare': ['skincare', 'skin care', 'serum', 'moisturizer', 'cleanser', 'acne', 'anti-aging', 'glow', 'face wash', 'sunscreen', 'spf'],
    'haircare': ['hair', 'shampoo', 'conditioner', 'hair oil', 'hair growth', 'hair fall', 'dandruff', 'scalp'],
    'fashion': ['clothing', 'fashion', 'apparel', 'dress', 'kurta', 'saree', 'ethnic', 'western', 'jeans', 't-shirt', 'wear'],
    'jewelry': ['jewelry', 'jewellery', 'gold', 'silver', 'diamond', 'necklace', 'earring', 'ring', 'bracelet'],
    'fitness': ['fitness', 'gym', 'workout', 'protein', 'supplement', 'weight loss', 'muscle', 'whey'],
    'food': ['food', 'snack', 'healthy', 'organic', 'nutrition', 'diet', 'vegan', 'gluten'],
    'electronics': ['electronics', 'gadget', 'phone', 'laptop', 'headphone', 'smart', 'tech'],
    'home': ['home', 'decor', 'furniture', 'kitchen', 'bedding', 'mattress', 'pillow'],
    'baby': ['baby', 'kids', 'children', 'toddler', 'infant', 'parenting', 'mother'],
    'pet': ['pet', 'dog', 'cat', 'puppy', 'kitten', 'pet food'],
    'wellness': ['wellness', 'ayurveda', 'natural', 'herbal', 'health', 'immunity', 'sleep'],
  };

  for (const [industry, keywords] of Object.entries(industries)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return industry;
      }
    }
  }

  return 'general';
}

/**
 * Generate search terms for Meta Ad Library
 */
function generateSearchTerms(title: string, description: string, industry: string): string[] {
  const terms: string[] = [];

  // Brand name from title (usually first part)
  const brandMatch = title.match(/^([A-Za-z0-9]+)/);
  if (brandMatch) {
    terms.push(brandMatch[1].toLowerCase());
  }

  // Industry-specific search terms
  const industryTerms: Record<string, string[]> = {
    'skincare': ['skincare india', 'face serum india', 'skin care brand'],
    'haircare': ['hair care india', 'hair oil india', 'shampoo brand'],
    'fashion': ['fashion brand india', 'clothing brand india', 'ethnic wear'],
    'jewelry': ['jewelry brand india', 'gold jewelry online', 'artificial jewelry'],
    'fitness': ['fitness supplement india', 'protein powder india', 'gym supplement'],
    'food': ['healthy snacks india', 'organic food india', 'health food brand'],
    'wellness': ['ayurveda brand india', 'wellness brand india', 'natural health'],
    'general': ['d2c brand india', 'online shopping india'],
  };

  terms.push(...(industryTerms[industry] || industryTerms['general']));

  // Extract keywords from description
  const keywords = extractKeywords(title, description);
  terms.push(...keywords.slice(0, 3));

  // Dedupe and return
  return [...new Set(terms)];
}

/**
 * Discover competitors by searching Meta Ad Library with multiple keywords
 */
export async function discoverCompetitors(
  brandContext: BrandContext,
  options: {
    country?: string;
    maxCompetitors?: number;
    userToken?: string;
  } = {}
): Promise<DiscoveryResult> {
  const { country = 'IN', maxCompetitors = 15, userToken } = options;

  logger.info({ brand: brandContext.title, terms: brandContext.suggestedSearchTerms }, '[CreativeIntel] Discovering competitors');

  const pageHits = new Map<string, { name: string; hits: number; keywords: string[] }>();
  let totalAdsScanned = 0;

  // Search with each suggested term
  for (const term of brandContext.suggestedSearchTerms.slice(0, 5)) {
    try {
      const rawAds = await fetchAdLibrary(term, country, 30, userToken);
      // Filter out boosted posts - only count real conversion ads
      const ads = filterConversionAds(rawAds);
      totalAdsScanned += ads.length;

      for (const ad of ads) {
        const existing = pageHits.get(ad.page_id);
        if (existing) {
          existing.hits++;
          if (!existing.keywords.includes(term)) {
            existing.keywords.push(term);
          }
        } else {
          pageHits.set(ad.page_id, {
            name: ad.page_name,
            hits: 1,
            keywords: [term],
          });
        }
      }

      // Small delay between searches
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (err) {
      logger.warn({ err, term }, '[CreativeIntel] Search failed for term');
    }
  }

  // Sort by hits and return top competitors
  const competitors: DiscoveredCompetitor[] = Array.from(pageHits.entries())
    .map(([pageId, data]) => ({
      pageId,
      pageName: data.name,
      keywordHits: data.hits,
      matchedKeywords: data.keywords,
    }))
    .sort((a, b) => b.keywordHits - a.keywordHits)
    .slice(0, maxCompetitors);

  logger.info({ found: competitors.length }, '[CreativeIntel] Competitors discovered');

  return {
    brand: brandContext,
    competitors,
    searchTermsUsed: brandContext.suggestedSearchTerms.slice(0, 5),
    totalAdsScanned,
  };
}

// ============ ENHANCED CREATIVE FORMATS ============

// More specific creative format types for better analysis
export type CreativeFormatDetailed =
  | 'ugc_talking_head'      // Person talking to camera
  | 'ugc_testimonial'       // Customer review/testimonial
  | 'before_after'          // Before/after transformation
  | 'founder_story'         // Founder talking about brand
  | 'podcast_interview'     // Podcast/interview style
  | 'product_demo'          // Product demonstration
  | 'unboxing'              // Unboxing experience
  | 'comparison'            // Us vs them comparison
  | 'tutorial_howto'        // How-to/tutorial
  | 'lifestyle'             // Lifestyle/aspirational
  | 'static_product'        // Static product image
  | 'carousel'              // Multiple images
  | 'catalog_dpa'           // Dynamic product ad
  | 'meme_relatable'        // Meme/relatable content
  | 'influencer'            // Influencer endorsement
  | 'unknown';

/**
 * Classify creative format based on text content
 */
function classifyCreativeFormat(primaryText: string, headline: string, caption: string): CreativeFormatDetailed {
  const allText = `${primaryText} ${headline} ${caption}`.toLowerCase();

  // Before/After transformation
  if (/(?:before.{0,20}after|transformation|results? in|days? challenge|week.{0,10}journey|progress|glow up)/i.test(allText)) {
    return 'before_after';
  }

  // Founder story
  if (/(?:founder|i started|my journey|why i created|built this|our story|from my kitchen|small batch)/i.test(allText)) {
    return 'founder_story';
  }

  // Podcast/interview style
  if (/(?:podcast|episode|interview|conversation with|talked to|speaking with|guest|listen to)/i.test(allText)) {
    return 'podcast_interview';
  }

  // Testimonial/review
  if (/(?:^[""]|customer.{0,10}say|review|testimonial|real results|honest opinion|my experience|i've been using|changed my life)/i.test(allText)) {
    return 'ugc_testimonial';
  }

  // UGC talking head
  if (/(?:pov:|literally|omg|obsessed|need this|game changer|no cap|not sponsored|honest review)/i.test(allText)) {
    return 'ugc_talking_head';
  }

  // Product demo
  if (/(?:how to use|apply|step by step|watch how|see how|demonstration|in action|works like)/i.test(allText)) {
    return 'product_demo';
  }

  // Unboxing
  if (/(?:unbox|what's inside|package|arrived|mail day|haul|got my order)/i.test(allText)) {
    return 'unboxing';
  }

  // Comparison
  if (/(?:vs\.|versus|compared to|better than|unlike|difference between|why we're different|other brands)/i.test(allText)) {
    return 'comparison';
  }

  // Tutorial/how-to
  if (/(?:tutorial|how to|guide|tips for|routine|steps to|hack|trick)/i.test(allText)) {
    return 'tutorial_howto';
  }

  // Meme/relatable
  if (/(?:when you|me when|nobody:|that feeling|relatable|tag someone|who else|anyone else)/i.test(allText)) {
    return 'meme_relatable';
  }

  // Influencer
  if (/(?:collab|partnered|ambassador|featuring|with @|ft\.|sponsored by)/i.test(allText)) {
    return 'influencer';
  }

  // Lifestyle/aspirational
  if (/(?:lifestyle|living|vibe|aesthetic|mood|energy|feeling|dream|goals|luxury|premium)/i.test(allText)) {
    return 'lifestyle';
  }

  // Static product (default for product-focused copy)
  if (/(?:shop now|buy now|order|available|launch|new arrival|collection|limited)/i.test(allText)) {
    return 'static_product';
  }

  return 'unknown';
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

  const fullText = `${adContent.primaryText} ${adContent.headline} ${adContent.caption}`.trim();
  const contentForRules = { text: fullText, platforms: adContent.platforms };

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
      return parseAnalysisResult(parsed, contentForRules);
    }
  } catch (err) {
    logger.warn({ err }, '[CreativeIntel] Anthropic analysis failed, trying Gemini');
  }

  // Fallback to Gemini
  if (gemini) {
    try {
      const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent(`${CREATIVE_ANALYSIS_PROMPT}\n\n${userPrompt}`);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parseAnalysisResult(parsed, contentForRules);
      }
    } catch (err) {
      logger.warn({ err }, '[CreativeIntel] Gemini analysis also failed');
    }
  }

  // Pure rule-based fallback when AI completely fails
  return parseAnalysisResult({}, contentForRules);
}

// Valid types for normalization
const VALID_HOOK_TYPES = ['problem_first', 'social_proof', 'discount_lead', 'curiosity', 'fear', 'aspiration', 'transformation', 'testimonial', 'question', 'statistic', 'story', 'other'];
const VALID_OFFER_TYPES = ['percentage_discount', 'flat_discount', 'free_shipping', 'bundle', 'trial', 'gift', 'bogo', 'none', 'other'];
const VALID_CTA_TYPES = ['urgency', 'benefit', 'curiosity', 'social_proof', 'scarcity', 'free_offer', 'discount', 'learn_more', 'shop_now', 'other'];
const VALID_FORMAT_TYPES = ['ugc_video', 'studio_video', 'static_image', 'carousel', 'gif', 'catalog_dpa', 'other'];

// Campaign type classification - CRITICAL for filtering boost posts from real ads
type CampaignType = 'conversion' | 'engagement' | 'awareness' | 'unknown';

// CTAs that indicate conversion-focused campaigns (actual sales intent)
const CONVERSION_CTAS = [
  'shop now', 'shop_now', 'buy now', 'buy_now', 'order now', 'order_now',
  'get offer', 'get_offer', 'get quote', 'get_quote', 'sign up', 'sign_up',
  'subscribe', 'book now', 'book_now', 'download', 'install now', 'install_now',
  'apply now', 'apply_now', 'get started', 'get_started', 'claim offer',
  'add to cart', 'add_to_cart', 'buy', 'purchase', 'checkout'
];

// CTAs that indicate engagement/boost posts (not real conversion campaigns)
const ENGAGEMENT_CTAS = [
  'visit instagram', 'visit_instagram_profile', 'send message', 'send_message',
  'send whatsapp', 'send_whatsapp_message', 'like page', 'like_page',
  'follow', 'watch more', 'watch_more', 'see more', 'see_more',
  'comment', 'share', 'react', 'view profile', 'view_profile'
];

// Domains/patterns in captions that indicate boosted posts (NOT conversion ads)
// The ad_creative_link_captions field shows the domain the ad links to
const ENGAGEMENT_CAPTION_PATTERNS = [
  'instagram.com',
  'facebook.com',
  'fb.com',
  'wa.me',
  'whatsapp.com',
  'messenger.com',
  'm.me',
];

/**
 * Check if an ad is a boosted post based on its link caption
 *
 * Meta Ad Library shows the destination domain in ad_creative_link_captions:
 * - Boosted posts show: "instagram.com", "facebook.com"
 * - Conversion ads show: "brandname.com", "shopify.com/store", etc.
 *
 * Note: ad_creative_link_destinations is NOT returned by Ad Library API
 */
function isBoostedPost(ad: AdLibraryAd): boolean {
  const caption = (ad.ad_creative_link_captions?.[0] || '').toLowerCase().trim();

  // No caption = might be a simple image boost, but give benefit of doubt
  if (!caption) {
    return false;
  }

  // Check if caption shows an engagement platform domain
  for (const pattern of ENGAGEMENT_CAPTION_PATTERNS) {
    if (caption.includes(pattern)) {
      return true; // Links to social platform = boosted post
    }
  }

  // Has a caption but it's not a social platform = conversion ad
  return false;
}

/**
 * Filter out boosted posts from ad results
 * Returns only conversion-focused ads (linking to external websites)
 */
function filterConversionAds(ads: AdLibraryAd[]): AdLibraryAd[] {
  const filtered = ads.filter(ad => !isBoostedPost(ad));
  const removedCount = ads.length - filtered.length;

  if (removedCount > 0) {
    logger.info(`[CreativeIntel] Filtered ${removedCount} boosted posts, keeping ${filtered.length} conversion ads`);
  }

  return filtered;
}

// ============ RELEVANCE SCORING ============

interface RelevanceResult {
  score: number; // 0-100
  type: 'direct' | 'indirect' | 'irrelevant';
  reason: string;
  creativeInsight?: string; // For indirect: what technique to learn
}

/**
 * AI AGENT: The Brain for Ad Relevance Analysis
 *
 * Instead of hardcoded rules, uses AI to understand:
 * 1. What product/service is the ad selling?
 * 2. Who is the target audience?
 * 3. How does this relate to the client's brand?
 * 4. What can be learned (messaging vs creative technique)?
 *
 * Classifications:
 * - DIRECT: Same product category → Copy their hooks, offers, messaging
 * - INDIRECT: Different product, same audience OR great creative → Experiment with their format
 * - IRRELEVANT: Wrong audience, wrong product, nothing useful
 */
async function scoreRelevance(
  ad: { pageName: string; primaryText: string; headline: string; caption: string; creativeFormat: string },
  brandContext: { industry: string; keywords: string[]; description: string }
): Promise<RelevanceResult> {
  const adContent = `Page: ${ad.pageName}\nHeadline: ${ad.headline}\nText: ${ad.primaryText}\nCaption: ${ad.caption}`;
  const brandInfo = `Industry: ${brandContext.industry}\nProducts/Keywords: ${brandContext.keywords.join(', ')}\nDescription: ${brandContext.description}`;

  const prompt = `You are a competitive intelligence analyst for D2C brands. Analyze this ad's relevance to a client's brand.

## CLIENT BRAND
${brandInfo}

## AD TO ANALYZE
${adContent}

## YOUR TASK
1. What product/service is this ad selling?
2. Who is the target audience?
3. Is this relevant to the client?

## CLASSIFICATION RULES
- **DIRECT** (score 75-100): Ad sells SAME or very similar product category as client.
  Example: Client sells sarees → Ad sells sarees/lehengas = DIRECT
  Example: Client sells skincare → Ad sells skincare/beauty = DIRECT
  Action: Copy their messaging, hooks, offers, CTAs

- **INDIRECT** (score 45-70): Ad sells DIFFERENT product but:
  a) Targets the SAME audience (brides, moms, professionals, etc.), OR
  b) Has a creative TECHNIQUE worth adapting (transition, hook style, storytelling)
  Example: Client sells sarees → Ad sells bridal jewelry = INDIRECT (same bride audience)
  Example: Client sells skincare → Ad has great before/after transition = INDIRECT (creative technique)
  Action: Experiment with their creative format, not their messaging

- **IRRELEVANT** (score 0-40): Different product AND different audience. Nothing to learn.
  Example: Client sells sarees → Ad sells men's tuxedos = IRRELEVANT
  Example: Client sells skincare → Ad sells car insurance = IRRELEVANT

## RESPOND WITH JSON ONLY
{
  "productSold": "<what the ad is selling>",
  "targetAudience": "<who the ad targets>",
  "score": <number 0-100>,
  "type": "direct" | "indirect" | "irrelevant",
  "reason": "<1 sentence explaining why this classification>",
  "creativeInsight": "<for INDIRECT: specific technique to learn, e.g. 'Product reveal zoom transition' or 'Before/after split screen'. For DIRECT: leave empty>"
}`;

  try {
    // Use Gemini for cost efficiency (this runs per ad)
    if (gemini) {
      const model = gemini.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          score: Math.min(100, Math.max(0, Number(parsed.score) || 50)),
          type: ['direct', 'indirect', 'irrelevant'].includes(parsed.type) ? parsed.type : 'irrelevant',
          reason: parsed.reason || 'No reason provided',
          creativeInsight: parsed.creativeInsight,
        };
      }
    }

    // Fallback to Anthropic if Gemini fails
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = extractText(response, '{}');
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        score: Math.min(100, Math.max(0, Number(parsed.score) || 50)),
        type: ['direct', 'indirect', 'irrelevant'].includes(parsed.type) ? parsed.type : 'irrelevant',
        reason: parsed.reason || 'No reason provided',
        creativeInsight: parsed.creativeInsight,
      };
    }
  } catch (err) {
    logger.warn({ err }, '[CreativeIntel] Relevance scoring failed');
  }

  // Rule-based fallback
  return scoreRelevanceByRules(ad, brandContext);
}

/**
 * Rule-based relevance scoring (fast fallback)
 *
 * SCALABLE APPROACH:
 * - Uses client's keywords dynamically (no hardcoded industry rules)
 * - Direct: Ad contains 2+ client keywords OR same product category
 * - Indirect: Different product but same target audience/occasion
 * - Irrelevant: No meaningful overlap
 */
function scoreRelevanceByRules(
  ad: { pageName: string; primaryText: string; headline: string; caption: string },
  brandContext: { industry: string; keywords: string[] }
): RelevanceResult {
  const adText = `${ad.pageName} ${ad.primaryText} ${ad.headline} ${ad.caption}`.toLowerCase();
  const clientKeywords = brandContext.keywords.map(k => k.toLowerCase());
  const industry = brandContext.industry.toLowerCase();

  // Step 1: Count keyword matches (most reliable signal)
  let keywordMatches = 0;
  const matchedKeywords: string[] = [];
  for (const kw of clientKeywords) {
    // Only match if keyword is 3+ chars (avoid matching "a", "an", etc.)
    if (kw.length >= 3 && adText.includes(kw)) {
      keywordMatches++;
      matchedKeywords.push(kw);
    }
  }

  // Step 2: DIRECT - Strong keyword match (2+ keywords OR industry name in ad)
  if (keywordMatches >= 2 || adText.includes(industry)) {
    return {
      score: 70 + (keywordMatches * 5),
      type: 'direct',
      reason: `Matches keywords: ${matchedKeywords.join(', ')}`,
    };
  }

  // Step 3: Check if ad mentions a DIFFERENT product category
  // This is a generic approach - extract what the ad is selling
  const productSignals = extractProductSignals(adText);
  const clientProductSignals = extractProductSignals(clientKeywords.join(' '));

  // If ad is clearly selling something different, mark as irrelevant
  if (productSignals.category && clientProductSignals.category &&
      productSignals.category !== clientProductSignals.category) {
    // But check if same target audience (could be indirect)
    if (productSignals.audience && clientProductSignals.audience &&
        productSignals.audience === clientProductSignals.audience) {
      return {
        score: 50,
        type: 'indirect',
        reason: `Different product (${productSignals.category}) but same audience (${productSignals.audience})`,
        creativeInsight: 'Study their creative format and audience messaging',
      };
    }
    return {
      score: 20,
      type: 'irrelevant',
      reason: `Different product category: ${productSignals.category} vs ${clientProductSignals.category}`,
    };
  }

  // Step 4: Single keyword match - could be indirect
  if (keywordMatches === 1) {
    return {
      score: 45,
      type: 'indirect',
      reason: `Partial match: ${matchedKeywords[0]}`,
      creativeInsight: 'May have transferable creative techniques',
    };
  }

  // Step 5: No keyword match - default to irrelevant
  return {
    score: 15,
    type: 'irrelevant',
    reason: 'No keyword or audience overlap detected',
  };
}

/**
 * Extract product category and target audience signals from text
 * This is generic and works for any industry
 */
function extractProductSignals(text: string): { category?: string; audience?: string } {
  const lower = text.toLowerCase();
  const result: { category?: string; audience?: string } = {};

  // Product category detection (generic)
  const categories: Record<string, RegExp> = {
    'ethnic_wear': /saree|lehenga|kurti|salwar|ethnic|traditional indian|dupatta|anarkali/i,
    'western_wear': /tuxedo|suit|blazer|formal wear|western|gown|dress|jeans|shirt/i,
    'jewelry': /jewelry|jewellery|gold|diamond|necklace|earring|ring|bangle|pendant/i,
    'beauty': /skincare|makeup|cosmetic|serum|cream|lipstick|foundation|beauty/i,
    'electronics': /phone|laptop|computer|gadget|electronics|camera|headphone/i,
    'home': /furniture|decor|mattress|sofa|table|chair|home/i,
    'food': /food|restaurant|snack|beverage|drink|meal|recipe/i,
  };

  for (const [cat, regex] of Object.entries(categories)) {
    if (regex.test(lower)) {
      result.category = cat;
      break;
    }
  }

  // Target audience detection (generic)
  const audiences: Record<string, RegExp> = {
    'brides': /bridal|bride|wedding|shaadi|vivah|dulhan|mehendi/i,
    'mothers': /mom|mother|maternity|baby|kids|parenting/i,
    'professionals': /office|work|professional|corporate|business/i,
    'youth': /teen|college|student|young|gen.?z/i,
    'luxury': /premium|luxury|exclusive|high.?end|elite/i,
  };

  for (const [aud, regex] of Object.entries(audiences)) {
    if (regex.test(lower)) {
      result.audience = aud;
      break;
    }
  }

  return result;
}

// Classify campaign type based on CTA and content
function classifyCampaignType(ctaText: string, primaryText: string, headline: string): CampaignType {
  const allText = `${ctaText} ${primaryText} ${headline}`.toLowerCase();
  const ctaLower = ctaText.toLowerCase();

  // Check for conversion CTAs
  for (const cta of CONVERSION_CTAS) {
    if (ctaLower.includes(cta) || allText.includes(cta)) {
      return 'conversion';
    }
  }

  // Check for engagement CTAs (boost posts)
  for (const cta of ENGAGEMENT_CTAS) {
    if (ctaLower.includes(cta) || allText.includes(cta)) {
      return 'engagement';
    }
  }

  // Check content for conversion signals
  if (/(?:shop|buy|order|₹|rs\.|inr|price|discount|%\s*off|free shipping|add to cart|checkout)/i.test(allText)) {
    return 'conversion';
  }

  // Check content for engagement signals
  if (/(?:follow us|dm for|comment below|tag a friend|share this|link in bio)/i.test(allText)) {
    return 'engagement';
  }

  // Learn more could be either - check context
  if (/learn more|learn_more/i.test(ctaLower)) {
    // If has pricing/offer language, it's conversion
    if (/(?:₹|rs\.|price|offer|discount|sale|buy|shop)/i.test(allText)) {
      return 'conversion';
    }
    return 'awareness';
  }

  return 'unknown';
}

// Normalize AI response to valid type
function normalizeType(value: string | undefined, validTypes: string[], fallback: string): string {
  if (!value) return fallback;
  const normalized = value.toLowerCase().replace(/[^a-z_]/g, '').replace(/ /g, '_');
  if (validTypes.includes(normalized)) return normalized;
  // Try partial match
  for (const valid of validTypes) {
    if (normalized.includes(valid) || valid.includes(normalized)) return valid;
  }
  return fallback;
}

// Rule-based hook classifier (fallback when AI returns unknown)
function classifyHookByRules(text: string): string {
  const lower = text.toLowerCase();

  // Problem-first: pain points, struggles, frustrations
  if (/(?:tired of|sick of|struggling|problem|hate|can't|won't|doesn't work|stop wasting|frustrated|annoying|hard to)/i.test(lower)) {
    return 'problem_first';
  }

  // Question hooks
  if (/^(?:do you|are you|have you|want to|looking for|need|what if|why do|how do|ever wonder)/i.test(lower)) {
    return 'question';
  }

  // Social proof: numbers, testimonials, reviews
  if (/(?:\d+[,\d]*\+?\s*(?:customers?|users?|people|women|men|reviews?|sold|happy)|trusted by|as seen|featured in|rated|#1|best seller|everyone)/i.test(lower)) {
    return 'social_proof';
  }

  // Testimonial: quotes, personal stories
  if (/(?:^[""]|^i was|^i used|^my skin|^my hair|^after using|^before i|^this product|^i've been|^finally found|^game changer|^life changing)/i.test(lower)) {
    return 'testimonial';
  }

  // Transformation: before/after, results
  if (/(?:transform|before.{0,20}after|results in|days? to|weeks? to|in just|within \d|see the difference|visible results|real results|glow up)/i.test(lower)) {
    return 'transformation';
  }

  // Discount lead: starts with offer
  if (/^(?:flat|extra|\d+%|save|free|bogo|buy \d|limited time|today only|sale|offer|deal|discount)/i.test(lower)) {
    return 'discount_lead';
  }

  // Curiosity: secrets, reveals, surprising
  if (/(?:secret|nobody tells|they don't want|little known|surprising|shocking|unbelievable|discover|revealed|truth about|the real reason|what nobody|you won't believe)/i.test(lower)) {
    return 'curiosity';
  }

  // Fear/urgency
  if (/(?:don't miss|last chance|running out|limited stock|selling fast|almost gone|hurry|act now|before it's|ends soon|final hours)/i.test(lower)) {
    return 'fear';
  }

  // Aspiration: dreams, goals
  if (/(?:dream|achieve|become|unlock|level up|elevate|premium|luxury|deserve|treat yourself|self.?care|pamper|indulge|glow|radiant|flawless)/i.test(lower)) {
    return 'aspiration';
  }

  // Statistic: numbers and data
  if (/(?:\d+%\s+(?:of|more|less|better|faster|improvement)|clinical|proven|study|research|dermatologist|doctor)/i.test(lower)) {
    return 'statistic';
  }

  // Story: narrative structure
  if (/(?:^when i|^last year|^one day|^it all started|my journey|my story|^i never thought|^years ago)/i.test(lower)) {
    return 'story';
  }

  return 'other';
}

// Rule-based offer classifier
function classifyOfferByRules(text: string): string {
  const lower = text.toLowerCase();

  if (/\d+%\s*off/i.test(lower)) return 'percentage_discount';
  if (/(?:flat|₹|rs\.?|inr)\s*\d+\s*off/i.test(lower)) return 'flat_discount';
  if (/free\s*(?:shipping|delivery)/i.test(lower)) return 'free_shipping';
  if (/(?:buy\s*\d|bundle|combo|pack of|set of)/i.test(lower)) return 'bundle';
  if (/(?:free\s*(?:trial|sample)|try\s*(?:free|for))/i.test(lower)) return 'trial';
  if (/(?:free\s*gift|gift\s*(?:with|on)|bonus|freebie)/i.test(lower)) return 'gift';
  if (/(?:buy\s*\d+\s*get|bogo|b\d+g\d+)/i.test(lower)) return 'bogo';

  // Check if there's any offer mention
  if (/(?:offer|deal|discount|save|sale|off|free)/i.test(lower)) return 'other';

  return 'none';
}

// Rule-based format classifier
function classifyFormatByRules(platforms: string[], text: string): string {
  const lower = text.toLowerCase();

  // Check for catalog indicators
  if (/(?:shop now|view product|add to cart|see more)/i.test(lower) && platforms.includes('facebook')) {
    return 'catalog_dpa';
  }

  // Default to static for text-heavy content
  return 'static_image';
}

function parseAnalysisResult(parsed: Record<string, unknown>, adContent?: { text: string; platforms: string[] }): Partial<CreativeAnalysis> {
  let hookType = normalizeType(parsed['hookType'] as string, VALID_HOOK_TYPES, 'unknown');
  let offerType = normalizeType(parsed['offerType'] as string, VALID_OFFER_TYPES, 'none');
  let creativeFormat = normalizeType(parsed['creativeFormat'] as string, VALID_FORMAT_TYPES, 'unknown');

  // Apply rule-based fallbacks when AI returns unknown/other
  if (adContent?.text) {
    if (hookType === 'unknown' || hookType === 'other') {
      hookType = classifyHookByRules(adContent.text);
    }
    if (offerType === 'none' || offerType === 'other') {
      const ruleOffer = classifyOfferByRules(adContent.text);
      if (ruleOffer !== 'none') offerType = ruleOffer;
    }
    if (creativeFormat === 'unknown' || creativeFormat === 'other') {
      creativeFormat = classifyFormatByRules(adContent.platforms, adContent.text);
    }
  }

  return {
    hookType,
    hookText: (parsed['hookText'] as string) || '',
    ctaType: normalizeType(parsed['ctaType'] as string, VALID_CTA_TYPES, 'unknown'),
    ctaText: (parsed['ctaText'] as string) || '',
    offerType,
    offerDetails: (parsed['offerDetails'] as string) || '',
    creativeFormat,
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
async function addRelevanceScoring(
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
      const db = getDb();
      const row = db.prepare('SELECT encrypted_access_token FROM meta_tokens WHERE user_id = ?').get(userId) as { encrypted_access_token: string } | undefined;
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
    lines.push(`   ├─ Active Ads: ${comp.activeAds} | Avg Age: ${comp.avgAdAge} days`);
    lines.push(`   ├─ Top Hook: ${comp.topHookTypes[0]?.type || 'N/A'} (${comp.topHookTypes[0]?.percentage || 0}%)`);
    lines.push(`   ├─ Top Offer: ${comp.topOfferTypes[0]?.type || 'N/A'}`);
    if (comp.longestRunningAd) {
      lines.push(`   ├─ Best Performer: Running ${comp.longestRunningAd.daysRunning} days`);
      if (comp.longestRunningAd.hookText || comp.longestRunningAd.primaryText) {
        const text = comp.longestRunningAd.hookText || comp.longestRunningAd.primaryText || '';
        lines.push(`   │  "${text.slice(0, 55)}${text.length > 55 ? '...' : ''}"`);
      }
      lines.push(`   └─ 👁️ VIEW: ${comp.longestRunningAd.snapshotUrl}`);
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

  // Swipe File - Visual Gallery with Links
  if (report.swipeFile.length > 0) {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('                 🎨 CREATIVE SWIPE FILE (Click to View)');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');

    for (const category of report.swipeFile) {
      lines.push(`┌─────────────────────────────────────────────────────────────────────┐`);
      lines.push(`│ 📁 ${category.category.padEnd(50)} (${String(category.count).padStart(2)} ads) │`);
      lines.push(`│    ${category.description.padEnd(61)} │`);
      lines.push(`└─────────────────────────────────────────────────────────────────────┘`);
      lines.push('');

      for (const ad of category.ads.slice(0, 5)) {
        lines.push(`  🖼️  ${ad.pageName}`);
        lines.push(`      ├─ Running: ${ad.daysRunning} days | Hook: ${ad.hookType}`);
        if (ad.hookText) {
          lines.push(`      ├─ "${ad.hookText.slice(0, 60)}${ad.hookText.length > 60 ? '...' : ''}"`);
        } else if (ad.primaryText) {
          lines.push(`      ├─ "${ad.primaryText.slice(0, 60)}${ad.primaryText.length > 60 ? '...' : ''}"`);
        }
        lines.push(`      └─ 👁️ VIEW AD: ${ad.snapshotUrl}`);
        lines.push('');
      }
    }
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push('💡 TIP: Click any "VIEW AD" link to see the actual creative on Meta Ad Library');
  lines.push('');

  return lines.join('\n');
}

// ============ BULK SCRAPER (MetaAdsCollector) ============
// Uses Python MetaAdsCollector which reverse-engineers Meta's GraphQL API
// Can scrape 500+ ads per query vs 10-50 from official API

import { spawn } from 'node:child_process';
import * as nodePath from 'node:path';
import { fileURLToPath as nodeFileURLToPath } from 'node:url';

const __dirnameLocal = nodePath.dirname(nodeFileURLToPath(import.meta.url));
const PYTHON_SCRIPT = nodePath.join(__dirnameLocal, '../../scripts/meta-ads-scraper.py');
const PYTHON_VENV = nodePath.join(__dirnameLocal, '../../.venv/bin/python3');

interface ScrapedAd {
  id: string;
  page: { id: string; name: string; likes?: number };
  is_active: boolean;
  delivery_start_time: string;
  delivery_stop_time?: string | null;
  creatives?: Array<{
    body?: string;
    title?: string;
    link_url?: string;
    link_caption?: string;
    call_to_action?: string;
    image_url?: string;
    video_url?: string;
  }>;
  impressions?: { lower: number; upper: number };
  spend?: { lower: number; upper: number; currency: string };
  platforms?: string[];
  days_running?: number;
}

interface BulkScrapeResult {
  success: boolean;
  query: string | null;
  country: string;
  total_ads: number;
  scraped_at: string;
  ads: ScrapedAd[];
  error?: string;
}

/**
 * Scrape Meta Ad Library using Python MetaAdsCollector
 * Reverse-engineers Meta's GraphQL API - no API key required
 */
async function scrapeMetaAdsBulk(options: {
  query?: string;
  country?: string;
  limit?: number;
  activeOnly?: boolean;
  minDays?: number;
}): Promise<BulkScrapeResult> {
  const { query, country = 'IN', limit = 500, activeOnly = true, minDays = 0 } = options;

  if (!query) throw new Error('Query is required');

  const args: string[] = [PYTHON_SCRIPT, '--query', query, '--country', country, '--limit', limit.toString()];
  if (activeOnly) args.push('--active-only');
  if (minDays > 0) args.push('--min-days', minDays.toString());

  logger.info(`[BulkScraper] Running: python3 meta-ads-scraper.py --query "${query}" --limit ${limit}`);

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';

    const proc = spawn(PYTHON_VENV, args, { cwd: nodePath.join(__dirnameLocal, '../..') });

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      if (data.toString().includes('Scraped')) {
        logger.info(`[BulkScraper] ${data.toString().trim()}`);
      }
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve({ success: false, query, country, total_ads: 0, scraped_at: new Date().toISOString(), ads: [], error: stderr });
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        resolve({ success: false, query, country, total_ads: 0, scraped_at: new Date().toISOString(), ads: [], error: `Parse error: ${e}` });
      }
    });

    proc.on('error', (err) => {
      resolve({ success: false, query, country, total_ads: 0, scraped_at: new Date().toISOString(), ads: [], error: `Process error: ${err}` });
    });

    setTimeout(() => { proc.kill(); resolve({ success: false, query, country, total_ads: 0, scraped_at: new Date().toISOString(), ads: [], error: 'Timeout after 5 min' }); }, 5 * 60 * 1000);
  });
}

/** Convert scraped ad to CreativeAnalysis format */
function convertScrapedAd(ad: ScrapedAd): CreativeAnalysis {
  const creative = ad.creatives?.[0] || {};
  const days = ad.days_running || 0;
  const linkUrl = creative.link_url || '';
  const isConversion = linkUrl && !linkUrl.includes('instagram.com') && !linkUrl.includes('facebook.com');

  return {
    adId: ad.id,
    pageId: ad.page?.id || '',
    pageName: ad.page?.name || '',
    snapshotUrl: `https://www.facebook.com/ads/library/?id=${ad.id}`,
    startDate: ad.delivery_start_time,
    endDate: ad.delivery_stop_time || null,
    daysRunning: days,
    isActive: ad.is_active,
    spendLower: ad.spend?.lower || null,
    spendUpper: ad.spend?.upper || null,
    impressionsLower: ad.impressions?.lower || null,
    impressionsUpper: ad.impressions?.upper || null,
    primaryText: creative.body || null,
    headline: creative.title || null,
    caption: creative.link_caption || null,
    platforms: ad.platforms || [],
    hookType: 'unknown',
    hookText: creative.body?.split('\n')[0] || '',
    ctaType: creative.call_to_action || 'unknown',
    ctaText: creative.call_to_action || '',
    offerType: 'unknown',
    offerDetails: '',
    creativeFormat: creative.video_url ? 'ugc_video' : 'static_image',
    creativeFormatDetailed: creative.video_url ? 'ugc_talking_head' : 'product_demo',
    emotionalTriggers: [],
    targetAudience: '',
    longevityScore: Math.min(100, days * 2),
    estimatedPerformance: days >= 30 ? 'high' : days >= 14 ? 'medium' : 'unknown',
    campaignType: isConversion ? 'conversion' : 'engagement',
    relevanceScore: 50,
    competitorType: 'direct',
    relevanceReason: 'Pending AI analysis',
  };
}

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

/** Analyze ad text with Gemini AI */
async function analyzeAdWithGemini(ad: CreativeAnalysis, brandContext?: BrandContext): Promise<Partial<CreativeAnalysis>> {
  if (!gemini) return {};

  const prompt = `Analyze this ad. Return JSON only:
TEXT: ${ad.primaryText || ''}
HEADLINE: ${ad.headline || ''}
${brandContext ? `BRAND: ${brandContext.industry}, Keywords: ${brandContext.keywords?.slice(0, 3).join(', ')}` : ''}

{"hookType":"problem_first|social_proof|discount_lead|curiosity|aspiration|transformation|question|other","hookText":"first line","ctaType":"urgency|benefit|scarcity|discount|shop_now|other","offerType":"percentage_discount|flat_discount|free_shipping|bundle|none","emotionalTriggers":["fomo","trust","excitement"],"relevanceScore":0-100,"competitorType":"direct|indirect|irrelevant","relevanceReason":"why"}`;

  try {
    const model = gemini.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch { /* ignore */ }
  return {};
}

// ============================================================================
// CLIENT-AWARE COMPETITOR INTEL
// ============================================================================

export interface ClientIntelReport extends CreativeIntelReport {
  clientId: string;
  clientName: string;
  revenueLevel: string | null;
  newReferencesCount: number;
  filteredOutCount: number;
  searchQueriesUsed: string[];
}

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
  const ctx = getClientContext(clientId);
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
    if (hasReferenceBeenShown(clientId, ad.adId)) {
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
    addReferenceShown(clientId, ad.adId);
  }

  // Update search queries used in store
  if (competitorIntel) {
    const updatedQueries = [...new Set([...(competitorIntel.searchQueriesUsed || []), ...usedQueries])];
    updateCompetitorIntelStore(clientId, {
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
    createRecommendation(clientId, 'competitor_intel', rec.category, {
      insight: rec.insight,
      action: rec.action,
      basedOn: rec.basedOn,
      priority: rec.priority,
    });
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
