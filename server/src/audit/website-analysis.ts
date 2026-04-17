/**
 * Website Analysis Service - Scrapes and analyzes brand websites
 */

import type { WebsiteSnapshot } from './types.js';

interface WebsiteAnalysisOptions {
  domain: string;
  timeout?: number;
}

/**
 * Analyze a brand's website
 */
export async function analyzeWebsite(options: WebsiteAnalysisOptions): Promise<WebsiteSnapshot> {
  const { domain, timeout = 10000 } = options;

  const url = domain.startsWith('http') ? domain : `https://${domain}`;

  try {
    // Fetch homepage
    const homepageHtml = await fetchPage(url, timeout);

    // Fetch collections/products page for pricing
    const productsHtml = await fetchPage(`${url}/collections/all`, timeout).catch(() => null);

    // Parse homepage
    const homepage = parseHomepage(homepageHtml);

    // Parse products for pricing
    const pricing = productsHtml ? parseProducts(productsHtml) : getDefaultPricing();

    return {
      capturedAt: new Date().toISOString(),
      domain,
      priceRange: pricing.priceRange,
      pricePoint: determinePricePoint(pricing.priceRange.average),
      productCount: pricing.productCount,
      categoryCount: homepage.categoryCount,
      topCategories: homepage.topCategories,
      headline: homepage.headline,
      valueProposition: homepage.valueProposition,
      trustSignals: homepage.trustSignals,
      hasReviews: homepage.hasReviews,
      hasSizeGuide: homepage.hasSizeGuide,
      hasFreeShipping: homepage.hasFreeShipping,
      hasEasyReturns: homepage.hasEasyReturns,
    };
  } catch (error) {
    console.error(`Website analysis failed for ${domain}:`, error);
    return getDefaultSnapshot(domain);
  }
}

/**
 * Fetch a page with timeout
 */
async function fetchPage(url: string, timeout: number): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CosmiskBot/1.0; +https://cosmisk.ai)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Parse homepage for key signals
 */
function parseHomepage(html: string): {
  headline: string | null;
  valueProposition: string | null;
  trustSignals: string[];
  topCategories: string[];
  categoryCount: number;
  hasReviews: boolean;
  hasSizeGuide: boolean;
  hasFreeShipping: boolean;
  hasEasyReturns: boolean;
} {
  const lowerHtml = html.toLowerCase();

  // Extract headline (first h1)
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const headline = h1Match ? cleanText(h1Match[1]) : null;

  // Extract value proposition (common patterns)
  let valueProposition: string | null = null;
  const valuePatterns = [
    /<p[^>]*class="[^"]*hero[^"]*"[^>]*>([^<]+)<\/p>/i,
    /<p[^>]*class="[^"]*tagline[^"]*"[^>]*>([^<]+)<\/p>/i,
    /<span[^>]*class="[^"]*subtitle[^"]*"[^>]*>([^<]+)<\/span>/i,
  ];
  for (const pattern of valuePatterns) {
    const match = html.match(pattern);
    if (match) {
      valueProposition = cleanText(match[1]);
      break;
    }
  }

  // Detect trust signals
  const trustSignals: string[] = [];
  if (lowerHtml.includes('free shipping') || lowerHtml.includes('free delivery')) {
    trustSignals.push('Free Shipping');
  }
  if (lowerHtml.includes('easy return') || lowerHtml.includes('easy exchange') || lowerHtml.includes('hassle-free return')) {
    trustSignals.push('Easy Returns');
  }
  if (lowerHtml.includes('cod') || lowerHtml.includes('cash on delivery')) {
    trustSignals.push('COD Available');
  }
  if (lowerHtml.includes('secure payment') || lowerHtml.includes('ssl') || lowerHtml.includes('100% secure')) {
    trustSignals.push('Secure Payment');
  }
  if (lowerHtml.includes('24/7') || lowerHtml.includes('customer support')) {
    trustSignals.push('Customer Support');
  }

  // Extract categories from nav
  const navMatches = html.match(/<a[^>]*href="\/collections\/([^"]+)"[^>]*>([^<]+)<\/a>/gi) || [];
  const categories = navMatches
    .map(m => {
      const match = m.match(/>([^<]+)</);
      return match ? cleanText(match[1]) : null;
    })
    .filter((c): c is string => c !== null && c.length > 2 && c.length < 30);

  const uniqueCategories = [...new Set(categories)].slice(0, 5);

  return {
    headline,
    valueProposition,
    trustSignals,
    topCategories: uniqueCategories,
    categoryCount: uniqueCategories.length,
    hasReviews: lowerHtml.includes('review') || lowerHtml.includes('rating') || lowerHtml.includes('stars'),
    hasSizeGuide: lowerHtml.includes('size guide') || lowerHtml.includes('size chart'),
    hasFreeShipping: lowerHtml.includes('free shipping') || lowerHtml.includes('free delivery'),
    hasEasyReturns: lowerHtml.includes('easy return') || lowerHtml.includes('exchange'),
  };
}

/**
 * Parse products page for pricing
 */
function parseProducts(html: string): {
  priceRange: { min: number; max: number; average: number };
  productCount: number;
} {
  // Extract prices (INR format: ₹1,999 or Rs. 1999)
  const priceMatches = html.match(/(?:₹|Rs\.?)\s*([0-9,]+(?:\.[0-9]{2})?)/gi) || [];

  const prices = priceMatches
    .map(p => {
      const numStr = p.replace(/[₹Rs.\s,]/g, '');
      return parseFloat(numStr);
    })
    .filter(p => p > 0 && p < 100000); // Filter outliers

  if (prices.length === 0) {
    return getDefaultPricing();
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const average = prices.reduce((a, b) => a + b, 0) / prices.length;

  // Estimate product count from price occurrences (rough)
  const productCount = Math.min(prices.length / 2, 100); // Each product has ~2 price mentions

  return {
    priceRange: { min, max, average },
    productCount: Math.round(productCount),
  };
}

/**
 * Determine price point from average price
 */
function determinePricePoint(avgPrice: number): WebsiteSnapshot['pricePoint'] {
  if (avgPrice < 500) return 'budget';
  if (avgPrice < 1500) return 'mid';
  if (avgPrice < 5000) return 'premium';
  return 'luxury';
}

/**
 * Clean text content
 */
function cleanText(text: string): string {
  return text
    .replace(/[\n\r\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Default pricing when products page can't be parsed
 */
function getDefaultPricing() {
  return {
    priceRange: { min: 0, max: 0, average: 0 },
    productCount: 0,
  };
}

/**
 * Default snapshot when website can't be analyzed
 */
function getDefaultSnapshot(domain: string): WebsiteSnapshot {
  return {
    capturedAt: new Date().toISOString(),
    domain,
    priceRange: { min: 0, max: 0, average: 0 },
    pricePoint: 'mid',
    productCount: 0,
    categoryCount: 0,
    topCategories: [],
    headline: null,
    valueProposition: null,
    trustSignals: [],
    hasReviews: false,
    hasSizeGuide: false,
    hasFreeShipping: false,
    hasEasyReturns: false,
  };
}
