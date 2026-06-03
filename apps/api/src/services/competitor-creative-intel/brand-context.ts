/**
 * Competitor Creative Intelligence — Brand Context & Competitor Discovery
 */

import { safeFetch } from '../../utils/safe-fetch.js';
import { logger } from '../../utils/logger.js';
import * as cheerio from 'cheerio';
import type { BrandContext, DiscoveredCompetitor, DiscoveryResult } from './types.js';
import { fetchAdLibrary } from './ad-library.js';
import { filterConversionAds } from './classifiers.js';

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
