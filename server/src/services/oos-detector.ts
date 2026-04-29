/**
 * OOS Detector - Cross-Platform Intelligence
 *
 * Matches out-of-stock Shopify products to active Meta ads
 * to identify wasted ad spend.
 *
 * Ported from Agency-automation-smashed CrossAnalyzer
 */

import { fetchFullyOOSProducts } from '../audit/shopify-ingestion.js';
import { MetaApiService } from './meta-api.js';
import { parseInsightMetrics } from './insights-parser.js';
import { logger } from '../utils/logger.js';

// ============ TYPES ============

export interface OOSAdMatch {
  adId: string;
  adName: string;
  campaignId: string;
  campaignName: string;
  productId: string;
  productTitle: string;
  productUrl: string;
  spend: number;
  impressions: number;
  clicks: number;
  matchConfidence: 'high' | 'medium' | 'low';
  matchReason: string;
}

export interface OOSReport {
  capturedAt: string;
  shopDomain: string;
  accountId: string;
  totalOOSProducts: number;
  totalAdsChecked: number;
  oosAdsFound: number;
  totalWastedSpend: number;
  matches: OOSAdMatch[];
}

// ============ FUZZY MATCHING ============

/**
 * Fuzzy match ad text to product title
 * Ported from Agency-automation-smashed/services/lib/cross-analyzer.mjs
 */
function fuzzyMatch(adText: string | null | undefined, productTitle: string): { matches: boolean; confidence: 'high' | 'medium' | 'low'; reason: string } {
  if (!adText || !productTitle) {
    return { matches: false, confidence: 'low', reason: 'missing_text' };
  }

  const adLower = adText.toLowerCase().trim();
  const prodLower = productTitle.toLowerCase().trim();

  // Exact substring match = high confidence
  if (adLower.includes(prodLower) || prodLower.includes(adLower)) {
    return { matches: true, confidence: 'high', reason: 'exact_substring' };
  }

  // Word-based matching
  const prodWords = prodLower
    .split(/\s+/)
    .filter(w => w.length > 3) // Skip short words like "the", "and"
    .filter(w => !['with', 'for', 'from', 'pack', 'size'].includes(w)); // Skip common fillers

  if (prodWords.length === 0) {
    return { matches: false, confidence: 'low', reason: 'no_significant_words' };
  }

  const matchCount = prodWords.filter(w => adLower.includes(w)).length;
  const matchRatio = matchCount / prodWords.length;

  // High confidence: 80%+ words match
  if (matchRatio >= 0.8) {
    return { matches: true, confidence: 'high', reason: `word_match_${matchCount}/${prodWords.length}` };
  }

  // Medium confidence: 50%+ words match or at least 2 words
  if (matchRatio >= 0.5 || matchCount >= 2) {
    return { matches: true, confidence: 'medium', reason: `word_match_${matchCount}/${prodWords.length}` };
  }

  // Low confidence: single keyword match for single-word products
  if (prodWords.length === 1 && matchCount === 1) {
    return { matches: true, confidence: 'low', reason: 'single_word_match' };
  }

  return { matches: false, confidence: 'low', reason: 'insufficient_match' };
}

/**
 * Extract product-related text from ad data
 */
function extractAdText(ad: any): string {
  const parts: string[] = [];

  // Ad name often contains product info
  if (ad.name) parts.push(ad.name);

  // Creative body/title if available
  if (ad.creative?.title) parts.push(ad.creative.title);
  if (ad.creative?.body) parts.push(ad.creative.body);

  // Object story spec for link ads
  if (ad.creative?.object_story_spec?.link_data?.message) {
    parts.push(ad.creative.object_story_spec.link_data.message);
  }
  if (ad.creative?.object_story_spec?.link_data?.name) {
    parts.push(ad.creative.object_story_spec.link_data.name);
  }

  return parts.join(' ');
}

// ============ MAIN DETECTOR ============

interface DetectOOSAdsOptions {
  shopDomain: string;
  shopifyToken: string;
  metaAccountId: string;
  metaToken: string;
  days?: number;
}

/**
 * Detect ads spending on out-of-stock products
 */
export async function detectOOSAds(options: DetectOOSAdsOptions): Promise<OOSReport> {
  const { shopDomain, shopifyToken, metaAccountId, metaToken, days = 7 } = options;

  logger.info(`[OOS Detector] Starting scan for ${shopDomain} / ${metaAccountId}`);

  // Fetch OOS products and ads in parallel
  const [oosResult, adsResult] = await Promise.all([
    fetchFullyOOSProducts({ shopDomain, accessToken: shopifyToken }),
    fetchActiveAds(metaAccountId, metaToken, days),
  ]);

  const oosProducts = oosResult.products;
  const ads = adsResult.ads;

  logger.info(`[OOS Detector] Found ${oosProducts.length} OOS products, ${ads.length} active ads`);

  // Build product title index for faster matching
  const matches: OOSAdMatch[] = [];

  for (const ad of ads) {
    const adText = extractAdText(ad);
    if (!adText) continue;

    for (const product of oosProducts) {
      const match = fuzzyMatch(adText, product.title);

      if (match.matches) {
        matches.push({
          adId: ad.id,
          adName: ad.name || 'Unnamed Ad',
          campaignId: ad.campaign_id || '',
          campaignName: ad.campaign_name || 'Unknown Campaign',
          productId: product.productId,
          productTitle: product.title,
          productUrl: product.productUrl,
          spend: ad.spend || 0,
          impressions: ad.impressions || 0,
          clicks: ad.clicks || 0,
          matchConfidence: match.confidence,
          matchReason: match.reason,
        });
        break; // One product match per ad is enough
      }
    }
  }

  // Sort by spend (highest wasted first)
  matches.sort((a, b) => b.spend - a.spend);

  const totalWastedSpend = matches.reduce((sum, m) => sum + m.spend, 0);

  logger.info(`[OOS Detector] Found ${matches.length} OOS ads, ${totalWastedSpend.toFixed(2)} wasted spend`);

  return {
    capturedAt: new Date().toISOString(),
    shopDomain,
    accountId: metaAccountId,
    totalOOSProducts: oosProducts.length,
    totalAdsChecked: ads.length,
    oosAdsFound: matches.length,
    totalWastedSpend,
    matches,
  };
}

/**
 * Fetch active ads with spend data
 */
async function fetchActiveAds(
  accountId: string,
  token: string,
  days: number
): Promise<{ ads: any[] }> {
  const meta = new MetaApiService(token);

  try {
    // Get ads with insights
    const datePreset = days <= 7 ? 'last_7d' : days <= 14 ? 'last_14d' : 'last_30d';

    const adsResponse = await meta.get<any>(`/${accountId}/ads`, {
      fields: 'id,name,campaign_id,creative{title,body,object_story_spec},effective_status',
      filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]),
      limit: '500',
    });

    const ads = adsResponse.data || [];

    if (ads.length === 0) {
      return { ads: [] };
    }

    // Get insights for these ads
    const adIds = ads.map((a: any) => a.id);

    // Batch insights request
    const insightsResponse = await meta.get<any>(`/${accountId}/insights`, {
      fields: 'ad_id,ad_name,campaign_id,campaign_name,spend,impressions,clicks',
      level: 'ad',
      date_preset: datePreset,
      filtering: JSON.stringify([{ field: 'ad.id', operator: 'IN', value: adIds }]),
      limit: '500',
    });

    const insightsMap = new Map<string, any>();
    for (const row of insightsResponse.data || []) {
      insightsMap.set(row.ad_id, row);
    }

    // Merge ads with insights
    const adsWithInsights = ads.map((ad: any) => {
      const insights = insightsMap.get(ad.id) || {};
      return {
        ...ad,
        campaign_name: insights.campaign_name || '',
        spend: parseFloat(insights.spend || '0'),
        impressions: parseInt(insights.impressions || '0', 10),
        clicks: parseInt(insights.clicks || '0', 10),
      };
    }).filter((ad: any) => ad.spend > 0); // Only ads with spend

    return { ads: adsWithInsights };
  } catch (err: any) {
    logger.error({ err: err.message }, '[OOS Detector] Failed to fetch ads');
    return { ads: [] };
  }
}

// ============ CATALOG-BASED OOS DETECTION ============

export interface CatalogOOSProduct {
  productId: string;
  retailerId: string;
  name: string;
  availability: string;
}

export interface CatalogOOSReport {
  capturedAt: string;
  catalogId: string;
  totalProducts: number;
  oosProducts: CatalogOOSProduct[];
  oosCount: number;
  oosRate: number;
  hasCatalogAds: boolean;
  estimatedWastedImpressions: number;
}

interface CatalogOOSOptions {
  catalogId: string;
  metaAccountId: string;
  metaToken: string;
}

/**
 * Detect OOS products in Facebook Catalog
 * For DPA/catalog ads where products are dynamically shown
 */
export async function detectCatalogOOS(options: CatalogOOSOptions): Promise<CatalogOOSReport> {
  const { catalogId, metaAccountId, metaToken } = options;
  const meta = new MetaApiService(metaToken);

  logger.info(`[OOS Detector] Checking catalog ${catalogId} for OOS products`);

  // Fetch catalog products
  const allProducts: any[] = [];
  let nextPageParams: string | null = null;

  try {
    do {
      const params: Record<string, string> = {
        fields: 'id,name,retailer_id,availability',
        limit: '250',
      };

      const response = await meta.get<any>(`/${catalogId}/products`, params);
      const products = response.data || [];
      allProducts.push(...products);

      // Check for pagination
      nextPageParams = response.paging?.cursors?.after || null;
      if (nextPageParams && allProducts.length < 2000) {
        params['after'] = nextPageParams;
      } else {
        nextPageParams = null;
      }
    } while (nextPageParams);
  } catch (err: any) {
    logger.error({ err: err.message }, '[OOS Detector] Failed to fetch catalog products');
    throw err;
  }

  // Find OOS products
  const oosProducts: CatalogOOSProduct[] = allProducts
    .filter(p => p.availability !== 'in stock')
    .map(p => ({
      productId: p.id,
      retailerId: p.retailer_id || '',
      name: p.name || 'Unknown',
      availability: p.availability || 'unknown',
    }));

  // Check if catalog ads are running
  let hasCatalogAds = false;
  let catalogAdSpend = 0;

  try {
    const adsResponse = await meta.get<any>(`/${metaAccountId}/ads`, {
      fields: 'id,name,effective_status',
      filtering: JSON.stringify([
        { field: 'effective_status', operator: 'IN', value: ['ACTIVE'] },
      ]),
      limit: '100',
    });

    const ads = adsResponse.data || [];
    // Check if any ads look like catalog/DPA ads (name contains CATALOG or template syntax)
    hasCatalogAds = ads.some((ad: any) =>
      ad.name?.toLowerCase().includes('catalog') ||
      ad.name?.includes('{{')
    );

    if (hasCatalogAds) {
      // Get spend for catalog ads
      const catalogAds = ads.filter((ad: any) =>
        ad.name?.toLowerCase().includes('catalog') ||
        ad.name?.includes('{{')
      );

      if (catalogAds.length > 0) {
        const insightsResponse = await meta.get<any>(`/${metaAccountId}/insights`, {
          fields: 'spend,impressions',
          level: 'ad',
          date_preset: 'last_7d',
          filtering: JSON.stringify([
            { field: 'ad.id', operator: 'IN', value: catalogAds.map((a: any) => a.id) },
          ]),
          limit: '100',
        });

        catalogAdSpend = (insightsResponse.data || []).reduce(
          (sum: number, row: any) => sum + parseFloat(row.spend || '0'),
          0
        );
      }
    }
  } catch (err: any) {
    logger.warn({ err: err.message }, '[OOS Detector] Failed to check for catalog ads');
  }

  const oosRate = allProducts.length > 0 ? (oosProducts.length / allProducts.length) * 100 : 0;

  // Estimate wasted impressions (OOS rate * catalog ad spend)
  const estimatedWastedImpressions = hasCatalogAds ? Math.round(catalogAdSpend * (oosRate / 100)) : 0;

  logger.info(`[OOS Detector] Catalog ${catalogId}: ${oosProducts.length}/${allProducts.length} OOS (${oosRate.toFixed(1)}%)`);

  return {
    capturedAt: new Date().toISOString(),
    catalogId,
    totalProducts: allProducts.length,
    oosProducts: oosProducts.slice(0, 50), // Limit to top 50
    oosCount: oosProducts.length,
    oosRate,
    hasCatalogAds,
    estimatedWastedImpressions,
  };
}

// ============ WATCHDOG INTEGRATION ============

export interface OOSWatchdogResult {
  hasIssues: boolean;
  wastedSpend: number;
  topMatches: OOSAdMatch[];
  summary: string;
  catalogOOS?: {
    oosCount: number;
    oosRate: number;
    hasCatalogAds: boolean;
  };
}

interface RunOOSCheckOptions extends DetectOOSAdsOptions {
  catalogId?: string; // Optional: for DPA/catalog ads
}

/**
 * Quick OOS check for Watchdog integration
 * Returns simplified result for decision-making
 * Supports both name-based matching and catalog-based detection
 */
export async function runOOSCheck(options: RunOOSCheckOptions): Promise<OOSWatchdogResult> {
  try {
    // Run name-based detection
    const report = await detectOOSAds(options);

    let hasIssues = report.totalWastedSpend > 100; // Threshold: Rs 100
    const topMatches = report.matches.slice(0, 5);
    let catalogOOS: OOSWatchdogResult['catalogOOS'];

    // Also run catalog detection if catalogId provided
    if (options.catalogId) {
      try {
        const catalogReport = await detectCatalogOOS({
          catalogId: options.catalogId,
          metaAccountId: options.metaAccountId,
          metaToken: options.metaToken,
        });

        catalogOOS = {
          oosCount: catalogReport.oosCount,
          oosRate: catalogReport.oosRate,
          hasCatalogAds: catalogReport.hasCatalogAds,
        };

        // If catalog has OOS products AND catalog ads are running, flag as issue
        if (catalogReport.oosCount > 0 && catalogReport.hasCatalogAds) {
          hasIssues = true;
        }
      } catch (err: any) {
        logger.warn({ err: err.message }, '[OOS Detector] Catalog check failed, continuing');
      }
    }

    let summary = '';
    if (report.oosAdsFound === 0 && (!catalogOOS || catalogOOS.oosCount === 0)) {
      summary = 'No OOS issues detected.';
    } else {
      const parts: string[] = [];

      if (report.oosAdsFound > 0) {
        parts.push(`${report.oosAdsFound} ads on OOS products (Rs ${report.totalWastedSpend.toFixed(0)} wasted)`);
      }

      if (catalogOOS && catalogOOS.oosCount > 0 && catalogOOS.hasCatalogAds) {
        parts.push(`${catalogOOS.oosCount} OOS products in catalog (${catalogOOS.oosRate.toFixed(1)}%) with active DPA ads`);
      }

      summary = parts.join('. ');
    }

    return {
      hasIssues,
      wastedSpend: report.totalWastedSpend,
      topMatches,
      summary,
      catalogOOS,
    };
  } catch (err: any) {
    logger.error({ err: err.message }, '[OOS Detector] Check failed');
    return {
      hasIssues: false,
      wastedSpend: 0,
      topMatches: [],
      summary: `OOS check failed: ${err.message}`,
    };
  }
}
