/**
 * OOS Detector - Cross-Platform Intelligence
 *
 * Matches out-of-stock Shopify products to active Meta ads
 * to identify wasted ad spend.
 *
 * Enhanced with:
 * - Per-product spend via Meta async reports (breakdowns=product_id)
 * - Shopify order verification to confirm true wasted spend
 * - Stockout timeline analysis
 *
 * Ported from Agency-automation-smashed CrossAnalyzer
 */

import { fetchFullyOOSProducts } from '../audit/shopify-ingestion.js';
import { MetaApiService } from './meta-api.js';
import { parseInsightMetrics } from './insights-parser.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';
import {
  getClient,
  getClientContext,
  getOOSAgentStore,
  updateOOSAgentStore,
  createRecommendation,
  getOOSAlertThreshold,
  type ServiceClient,
  type OOSAgentStore,
} from './service-clients.js';
// CLOSED-LOOP OPERATING SYSTEM
import { agentRecommend } from './recommendation-loop.js';
// STRATEGIC MEMORY - Week-to-week learning
import { recordEpisode } from './agent-memory.js';
import { getStrategicContextForAgent, recordReport, type ReportRecord } from './strategic-memory.js';
import { v4 as uuidv4 } from 'uuid';

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

// ============ PER-PRODUCT SPEND ANALYSIS (Async Reports) ============

export interface ProductSpendData {
  productId: string;
  productName: string;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
}

export interface ShopifySalesData {
  orders: number;
  quantity: number;
  revenue: number;
}

export interface EnhancedOOSProduct {
  productId: string;
  productName: string;
  issueType: 'SYNC_ISSUE' | 'TRUE_OOS' | 'CATALOG_ONLY';
  currentInventory: number | null;
  // Meta ad data
  metaSpend: number;
  metaImpressions: number;
  metaClicks: number;
  metaPurchases: number;
  metaRevenue: number;
  // Shopify verified data
  shopifyOrders: number;
  shopifyQuantity: number;
  shopifyRevenue: number;
  // Analysis
  verifiedWasted: boolean;
  wastedSpend: number;
  roas: number;
}

export interface EnhancedOOSReport {
  capturedAt: string;
  accountId: string;
  catalogId: string;
  dateRange: string;
  // Summary
  totalOOSProducts: number;
  totalAdSpend: number;
  verifiedWastedSpend: number;
  productsWithShopifySales: number;
  productsNoSales: number;
  syncIssues: number;
  trueOOS: number;
  // Details
  products: EnhancedOOSProduct[];
}

/**
 * Run async report with product_id breakdown to get actual per-product spend
 * This is the key loophole: standard insights don't support product_id,
 * but async reports with breakdowns=product_id work
 */
async function runAsyncReportWithProductBreakdown(
  accountId: string,
  token: string,
  startDate: string,
  endDate: string,
): Promise<ProductSpendData[]> {
  const graphBase = config.graphApiBase;

  // Create async report request
  const createUrl = `${graphBase}/${accountId}/insights`;
  const params = new URLSearchParams({
    fields: 'spend,impressions,clicks,actions,action_values',
    breakdowns: 'product_id',
    level: 'ad',
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    access_token: token,
  });

  const createResp = await fetch(createUrl, { method: 'POST', body: params });
  const createData = await createResp.json();

  if (createData.error) {
    logger.warn({ error: createData.error.message }, '[OOS] Async report creation failed');
    return [];
  }

  const reportId = createData.report_run_id;
  if (!reportId) {
    logger.warn('[OOS] No report_run_id returned');
    return [];
  }

  // Poll for completion (max 60 attempts, 3s each = 3 minutes)
  let attempts = 0;
  while (attempts < 60) {
    await new Promise(r => setTimeout(r, 3000));
    attempts++;

    const statusResp = await fetch(
      `${graphBase}/${reportId}?fields=async_status,async_percent_completion&access_token=${token}`
    );
    const statusData = await statusResp.json();

    if (statusData.async_status === 'Job Completed') {
      break;
    }
    if (statusData.async_status === 'Job Failed') {
      logger.warn('[OOS] Async report job failed');
      return [];
    }
  }

  // Fetch results with pagination
  const results: ProductSpendData[] = [];
  let url: string | null = `${graphBase}/${reportId}/insights?limit=500&access_token=${token}`;

  while (url) {
    const resp: Response = await fetch(url);
    const data: any = await resp.json();
    if (data.error) break;

    for (const row of data.data || []) {
      const productIdFull = row.product_id || '';
      const [productId, ...nameParts] = productIdFull.split(', ');
      const productName = nameParts.join(', ');

      const purchases = parseInt(row.actions?.find((a: any) => a.action_type === 'purchase')?.value || '0', 10);
      const revenue = parseFloat(row.action_values?.find((a: any) => a.action_type === 'purchase')?.value || '0');

      results.push({
        productId,
        productName,
        spend: parseFloat(row.spend || '0'),
        impressions: parseInt(row.impressions || '0', 10),
        clicks: parseInt(row.clicks || '0', 10),
        purchases,
        revenue,
      });
    }

    url = data.paging?.next || null;
  }

  return results;
}

/**
 * Fetch Shopify orders for the last N days and aggregate by product
 */
async function fetchShopifyOrdersByProduct(
  shopDomain: string,
  shopifyToken: string,
  days: number,
): Promise<Map<string, ShopifySalesData>> {
  const API_VERSION = '2024-01';
  const baseUrl = `https://${shopDomain}/admin/api/${API_VERSION}`;
  const headers = {
    'X-Shopify-Access-Token': shopifyToken,
    'Content-Type': 'application/json',
  };

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);

  const productSales = new Map<string, ShopifySalesData>();
  let pageInfo: string | null = null;
  let pageCount = 0;

  while (pageCount < 20) {
    const url: string = pageInfo
      ? `${baseUrl}/orders.json?limit=250&page_info=${pageInfo}`
      : `${baseUrl}/orders.json?limit=250&status=any&created_at_min=${sinceDate.toISOString()}`;

    const resp: Response = await fetch(url, { headers });
    if (!resp.ok) break;

    const data: any = await resp.json();
    const orders = data.orders || [];

    for (const order of orders) {
      for (const item of order.line_items || []) {
        const productId = String(item.product_id);
        const variantId = String(item.variant_id);
        const revenue = parseFloat(item.price || '0') * (item.quantity || 0);

        // Index by both product_id and variant_id for matching
        for (const id of [productId, variantId]) {
          const existing = productSales.get(id) || { orders: 0, quantity: 0, revenue: 0 };
          existing.orders++;
          existing.quantity += item.quantity || 0;
          existing.revenue += revenue;
          productSales.set(id, existing);
        }
      }
    }

    // Check for pagination
    const link: string | null = resp.headers.get('Link');
    if (link?.includes('rel="next"')) {
      const match: RegExpMatchArray | null = link.match(/<[^>]*page_info=([^>&]*)[^>]*>;\s*rel="next"/);
      pageInfo = match?.[1] || null;
    } else {
      pageInfo = null;
    }

    if (!pageInfo) break;
    pageCount++;
  }

  return productSales;
}

/**
 * Enhanced OOS detection with per-product spend and Shopify verification
 *
 * IMPORTANT LEARNINGS:
 * 1. Meta breakdown product_id = catalog retailer_id = Shopify variant_id
 * 2. Same product has multiple variants (sizes/colors) with different IDs
 * 3. Customer may see ad for variant A but buy variant B (same product)
 * 4. Must GROUP by product (retailer_product_group_id), not match by variant
 * 5. UGC/creative ads (~40% of spend) are NOT tracked per product - only catalog/DPA ads
 */
export interface EnhancedOOSOptions {
  catalogId: string;
  metaAccountId: string;
  metaToken: string;
  shopDomain?: string;
  shopifyToken?: string;
  days?: number;
}

interface CatalogProductData {
  id: string;
  name: string;
  retailer_id: string;         // Shopify variant_id
  retailer_product_group_id: string; // Shopify product_id (parent)
  availability: string;
}

interface ProductGroupSpend {
  productGroupId: string;        // Shopify product_id
  productName: string;
  variants: string[];            // All variant IDs in this product
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
}

export async function detectEnhancedOOS(options: EnhancedOOSOptions): Promise<EnhancedOOSReport> {
  const { catalogId, metaAccountId, metaToken, shopDomain, shopifyToken, days = 30 } = options;

  logger.info(`[OOS Enhanced] Starting PRODUCT-LEVEL scan for ${metaAccountId} / catalog ${catalogId}`);

  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - days);

  const start = startDate.toISOString().split('T')[0];
  const end = today.toISOString().split('T')[0];

  // Fetch data in parallel
  const [catalogProducts, variantSpend, shopifySales] = await Promise.all([
    // Catalog products with retailer_product_group_id for variant → product mapping
    (async () => {
      const products: CatalogProductData[] = [];
      let url: string | null = `${config.graphApiBase}/${catalogId}/products?fields=id,name,retailer_id,retailer_product_group_id,availability&limit=250&access_token=${metaToken}`;

      while (url && products.length < 30000) {
        const resp: Response = await fetch(url);
        const data: any = await resp.json();
        if (data.error) break;
        for (const item of data.data || []) {
          products.push(item);
        }
        url = data.paging?.next || null;
      }
      return products;
    })(),

    // Per-variant spend (Meta breakdown returns variant-level data)
    (async () => {
      const allSpend = new Map<string, ProductSpendData>();

      // Process in weekly chunks
      for (let i = 0; i < Math.ceil(days / 7); i++) {
        const chunkEnd = new Date(today);
        chunkEnd.setDate(today.getDate() - (i * 7));
        const chunkStart = new Date(chunkEnd);
        chunkStart.setDate(chunkEnd.getDate() - 6);

        // Don't go before overall start date
        if (chunkStart < startDate) chunkStart.setTime(startDate.getTime());

        try {
          const chunkData = await runAsyncReportWithProductBreakdown(
            metaAccountId,
            metaToken,
            chunkStart.toISOString().split('T')[0],
            chunkEnd.toISOString().split('T')[0],
          );

          for (const row of chunkData) {
            const existing = allSpend.get(row.productId) || {
              productId: row.productId,
              productName: row.productName,
              spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0,
            };
            existing.spend += row.spend;
            existing.impressions += row.impressions;
            existing.clicks += row.clicks;
            existing.purchases += row.purchases;
            existing.revenue += row.revenue;
            if (row.productName) existing.productName = row.productName;
            allSpend.set(row.productId, existing);
          }
        } catch (err: any) {
          logger.warn({ err: err.message }, `[OOS Enhanced] Week ${i + 1} failed`);
        }
      }

      return allSpend;
    })(),

    // Shopify sales by PRODUCT (not variant)
    shopDomain && shopifyToken
      ? fetchShopifyOrdersByProduct(shopDomain, shopifyToken, days)
      : Promise.resolve(new Map<string, ShopifySalesData>()),
  ]);

  // Build variant → product mapping from catalog
  const variantToProduct = new Map<string, string>(); // variant_id → product_id
  const productInfo = new Map<string, { name: string; availability: string }>();

  for (const p of catalogProducts) {
    if (p.retailer_id && p.retailer_product_group_id) {
      variantToProduct.set(p.retailer_id, p.retailer_product_group_id);
      // Store product info (may be updated by multiple variants, that's fine)
      const existing = productInfo.get(p.retailer_product_group_id);
      if (!existing || p.availability !== 'in stock') {
        // Keep OOS status if any variant is OOS
        productInfo.set(p.retailer_product_group_id, {
          name: p.name,
          availability: existing?.availability !== 'in stock' ? existing?.availability || p.availability : p.availability,
        });
      }
    }
  }

  logger.info(`[OOS Enhanced] Built mapping: ${variantToProduct.size} variants → ${productInfo.size} products`);

  // AGGREGATE spend by PRODUCT (group all variants)
  const productSpend = new Map<string, ProductGroupSpend>();

  for (const [variantId, spendData] of variantSpend) {
    const productId = variantToProduct.get(variantId) || variantId; // Fallback to variant if no mapping

    const existing = productSpend.get(productId) || {
      productGroupId: productId,
      productName: spendData.productName || 'Unknown',
      variants: [],
      spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0,
    };

    existing.variants.push(variantId);
    existing.spend += spendData.spend;
    existing.impressions += spendData.impressions;
    existing.clicks += spendData.clicks;
    existing.purchases += spendData.purchases;
    existing.revenue += spendData.revenue;
    if (spendData.productName) existing.productName = spendData.productName;

    productSpend.set(productId, existing);
  }

  logger.info(`[OOS Enhanced] Aggregated ${variantSpend.size} variants → ${productSpend.size} products`);

  // Build OOS product set (products where ANY variant is OOS in catalog)
  const oosProductIds = new Set<string>();
  for (const p of catalogProducts) {
    if (p.availability !== 'in stock' && p.retailer_product_group_id) {
      oosProductIds.add(p.retailer_product_group_id);
    }
  }

  // Match spend data to OOS products (at PRODUCT level, not variant)
  const oosProducts: EnhancedOOSProduct[] = [];

  for (const [productId, spendData] of productSpend) {
    if (!oosProductIds.has(productId)) continue; // Not OOS

    // Check Shopify sales by PRODUCT ID (not variant)
    const shopifySalesData = shopifySales.get(productId) || { orders: 0, quantity: 0, revenue: 0 };
    const hasShopifySales = shopifySalesData.orders > 0;
    const verifiedWasted = !hasShopifySales;

    const info = productInfo.get(productId);

    oosProducts.push({
      productId,
      productName: info?.name || spendData.productName || 'Unknown',
      issueType: 'TRUE_OOS',
      currentInventory: null,
      metaSpend: spendData.spend,
      metaImpressions: spendData.impressions,
      metaClicks: spendData.clicks,
      metaPurchases: spendData.purchases,
      metaRevenue: spendData.revenue,
      shopifyOrders: shopifySalesData.orders,
      shopifyQuantity: shopifySalesData.quantity,
      shopifyRevenue: shopifySalesData.revenue,
      verifiedWasted,
      wastedSpend: verifiedWasted ? spendData.spend : 0,
      roas: spendData.spend > 0 ? (shopifySalesData.revenue || spendData.revenue) / spendData.spend : 0,
    });
  }

  // Sort by spend
  oosProducts.sort((a, b) => b.metaSpend - a.metaSpend);

  const verifiedWastedProducts = oosProducts.filter(p => p.verifiedWasted);

  const report: EnhancedOOSReport = {
    capturedAt: new Date().toISOString(),
    accountId: metaAccountId,
    catalogId,
    dateRange: `${start} to ${end}`,
    totalOOSProducts: oosProducts.length,
    totalAdSpend: oosProducts.reduce((s, p) => s + p.metaSpend, 0),
    verifiedWastedSpend: verifiedWastedProducts.reduce((s, p) => s + p.wastedSpend, 0),
    productsWithShopifySales: oosProducts.filter(p => !p.verifiedWasted).length,
    productsNoSales: verifiedWastedProducts.length,
    syncIssues: oosProducts.filter(p => p.issueType === 'SYNC_ISSUE').length,
    trueOOS: oosProducts.filter(p => p.issueType === 'TRUE_OOS').length,
    products: oosProducts,
  };

  logger.info(`[OOS Enhanced] Found ${report.totalOOSProducts} OOS products, ${report.verifiedWastedSpend.toFixed(0)} verified wasted (product-level matching)`);

  return report;
}

// ============ WATCHDOG INTEGRATION ============

export interface OOSWatchdogResult {
  hasIssues: boolean;
  wastedSpend: number;
  verifiedWastedSpend: number;
  topMatches: OOSAdMatch[];
  summary: string;
  catalogOOS?: {
    oosCount: number;
    oosRate: number;
    hasCatalogAds: boolean;
  };
  enhanced?: {
    totalOOSProducts: number;
    productsWithShopifySales: number;
    productsNoSales: number;
    topWasted: Array<{
      productId: string;
      productName: string;
      wastedSpend: number;
      shopifyOrders: number;
    }>;
  };
}

interface RunOOSCheckOptions extends DetectOOSAdsOptions {
  catalogId?: string; // Optional: for DPA/catalog ads
}

/**
 * Quick OOS check for Watchdog integration
 * Returns simplified result for decision-making
 *
 * Detection modes:
 * 1. Enhanced (catalogId + shopify): Uses async reports with product_id breakdown + Shopify verification
 * 2. Catalog only: Checks catalog for OOS products + DPA ad status
 * 3. Name-based: Fuzzy matches ad text to OOS product titles
 */
export async function runOOSCheck(options: RunOOSCheckOptions): Promise<OOSWatchdogResult> {
  try {
    const hasShopify = !!(options.shopDomain && options.shopifyToken);
    const hasCatalog = !!options.catalogId;

    // Use enhanced detection when catalog + shopify available (the gold standard)
    if (hasCatalog && hasShopify) {
      return runEnhancedOOSCheck(options);
    }

    // Fallback: Run name-based detection
    const report = await detectOOSAds(options);

    let hasIssues = report.totalWastedSpend > 100; // Threshold: Rs 100
    const topMatches = report.matches.slice(0, 5);
    let catalogOOS: OOSWatchdogResult['catalogOOS'];

    // Also run catalog detection if catalogId provided (without Shopify verification)
    if (hasCatalog) {
      try {
        const catalogReport = await detectCatalogOOS({
          catalogId: options.catalogId!,
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
      verifiedWastedSpend: 0, // Not verified without Shopify
      topMatches,
      summary,
      catalogOOS,
    };
  } catch (err: any) {
    logger.error({ err: err.message }, '[OOS Detector] Check failed');
    return {
      hasIssues: false,
      wastedSpend: 0,
      verifiedWastedSpend: 0,
      topMatches: [],
      summary: `OOS check failed: ${err.message}`,
    };
  }
}

/**
 * Enhanced OOS check with per-product spend and Shopify verification
 * This is the most accurate method - verifies wasted spend against actual Shopify orders
 */
async function runEnhancedOOSCheck(options: RunOOSCheckOptions): Promise<OOSWatchdogResult> {
  logger.info('[OOS Detector] Running enhanced detection with Shopify verification');

  const enhancedReport = await detectEnhancedOOS({
    catalogId: options.catalogId!,
    metaAccountId: options.metaAccountId,
    metaToken: options.metaToken,
    shopDomain: options.shopDomain,
    shopifyToken: options.shopifyToken,
    days: options.days || 7,
  });

  // Build top wasted products for the enhanced result
  const topWasted = enhancedReport.products
    .filter(p => p.verifiedWasted)
    .slice(0, 10)
    .map(p => ({
      productId: p.productId,
      productName: p.productName,
      wastedSpend: p.wastedSpend,
      shopifyOrders: p.shopifyOrders,
    }));

  // Determine if there are issues worth alerting
  // Primary metric: verified wasted spend (confirmed no Shopify sales)
  const hasIssues = enhancedReport.verifiedWastedSpend > 100; // Rs 100 threshold

  // Build summary
  let summary = '';
  if (enhancedReport.totalOOSProducts === 0) {
    summary = 'No OOS products found with active ads.';
  } else if (enhancedReport.verifiedWastedSpend === 0) {
    summary = `${enhancedReport.totalOOSProducts} OOS products with ads, but all had Shopify sales (likely Meta pixel sync issue).`;
  } else {
    const pctVerified = ((enhancedReport.productsNoSales / enhancedReport.totalOOSProducts) * 100).toFixed(0);
    summary = `${enhancedReport.productsNoSales} products with Rs ${enhancedReport.verifiedWastedSpend.toFixed(0)} verified wasted spend (${pctVerified}% of ${enhancedReport.totalOOSProducts} OOS products).`;

    if (enhancedReport.productsWithShopifySales > 0) {
      summary += ` Note: ${enhancedReport.productsWithShopifySales} products had Shopify sales despite 0 Meta purchases (pixel sync issue).`;
    }
  }

  return {
    hasIssues,
    wastedSpend: enhancedReport.totalAdSpend,
    verifiedWastedSpend: enhancedReport.verifiedWastedSpend,
    topMatches: [], // Enhanced mode doesn't use ad-level matching
    summary,
    catalogOOS: {
      oosCount: enhancedReport.totalOOSProducts,
      oosRate: 0, // We don't have total catalog count in enhanced mode
      hasCatalogAds: true, // Implied by having OOS products with spend
    },
    enhanced: {
      totalOOSProducts: enhancedReport.totalOOSProducts,
      productsWithShopifySales: enhancedReport.productsWithShopifySales,
      productsNoSales: enhancedReport.productsNoSales,
      topWasted,
    },
  };
}

// ============================================================================
// CLIENT-AWARE OOS DETECTION
// ============================================================================

export interface ClientOOSReport extends OOSWatchdogResult {
  clientId: string;
  clientName: string;
  revenueLevel: string | null;
  alertThreshold: number;
  shouldAlert: boolean;
  newOOSProducts: string[];
  previouslyKnown: string[];
}

/**
 * Run OOS check for a specific client
 * - Uses client's alert threshold based on revenue level
 * - Tracks known OOS products to identify NEW issues
 * - Records history and cumulative waste
 */
export async function runOOSCheckForClient(
  clientId: string,
  options: {
    metaToken: string;
    days?: number;
  }
): Promise<ClientOOSReport | null> {
  // Get client context
  const ctx = await getClientContext(clientId);
  if (!ctx) {
    logger.error({ clientId }, '[OOS Client] Client not found');
    return null;
  }

  const { client } = ctx;
  const oosStore = await getOOSAgentStore(clientId);

  // === STRATEGIC MEMORY: Load context from previous runs ===
  const strategicContext = getStrategicContextForAgent(clientId);
  if (strategicContext) {
    logger.info({ contextLength: strategicContext.length }, '[OOS] Loaded strategic context');
  }

  logger.info({
    clientId,
    brandName: client.brandName,
    revenueLevel: client.revenueLevel
  }, '[OOS Client] Starting check');

  // Get alert threshold for this client
  const alertThreshold = getOOSAlertThreshold(client);
  logger.info({ alertThreshold }, '[OOS Client] Using alert threshold');

  // Parse Shopify store info
  let shopDomain: string | undefined;
  let shopifyToken: string | undefined;

  if (client.shopifyStore) {
    try {
      const shopifyData = JSON.parse(client.shopifyStore);
      // Could be { india: '...', global: '...' } or just a string
      if (typeof shopifyData === 'string') {
        shopDomain = shopifyData;
      } else if (shopifyData.india) {
        shopDomain = shopifyData.india;
      } else if (shopifyData.global) {
        shopDomain = shopifyData.global;
      }
    } catch {
      shopDomain = client.shopifyStore;
    }
  }

  // Validate required credentials
  if (!shopDomain) {
    logger.warn({ clientId }, '[OOS Client] No Shopify store configured');
    return null;
  }

  // Run the OOS check
  const result = await runOOSCheck({
    metaAccountId: client.metaAdAccountId || '',
    metaToken: options.metaToken,
    shopDomain,
    shopifyToken: shopifyToken || '', // Would need to get from credentials store
    days: options.days || 7,
  });

  // Identify NEW OOS products vs previously known
  const knownProducts = oosStore?.knownOOSProducts || [];
  const currentOOSProducts = result.enhanced?.topWasted?.map(p => p.productId) || [];
  const newOOSProducts = currentOOSProducts.filter(id => !knownProducts.includes(id));
  const previouslyKnown = currentOOSProducts.filter(id => knownProducts.includes(id));

  // Determine if we should alert
  // Alert if: verified waste > threshold AND there are NEW products
  const shouldAlert = result.verifiedWastedSpend > alertThreshold && newOOSProducts.length > 0;

  logger.info({
    verifiedWaste: result.verifiedWastedSpend,
    alertThreshold,
    newProducts: newOOSProducts.length,
    shouldAlert,
  }, '[OOS Client] Alert decision');

  // Update OOS store
  if (oosStore) {
    const allKnownProducts = [...new Set([...knownProducts, ...currentOOSProducts])];
    await updateOOSAgentStore(clientId, {
      lastCheckAt: new Date().toISOString(),
      knownOOSProducts: allKnownProducts,
      cumulativeWaste: (oosStore.cumulativeWaste || 0) + result.verifiedWastedSpend,
      alertsSent: shouldAlert ? (oosStore.alertsSent || 0) + 1 : oosStore.alertsSent,
      lastAlertAt: shouldAlert ? new Date().toISOString() : oosStore.lastAlertAt,
    });
  }

  // Create recommendation record if alerting
  if (shouldAlert) {
    await createRecommendation(clientId, 'oos_detector', 'pause_oos_ads', {
      wastedSpend: result.verifiedWastedSpend,
      productsCount: newOOSProducts.length,
      topProducts: result.enhanced?.topWasted?.slice(0, 5) || [],
      summary: result.summary,
    });

    // === CLOSED-LOOP OPERATING SYSTEM ===
    const topWasted = result.enhanced?.topWasted?.[0];
    if (topWasted) {
      try {
        agentRecommend(clientId, 'oos_detector', {
          type: 'fix_oos',
          entityType: 'product',
          entityId: topWasted.productId || topWasted.productName,
          entityName: topWasted.productName,
          action: 'Pause ads for out-of-stock products',
          reasoning: `${newOOSProducts.length} products are OOS with ₹${result.verifiedWastedSpend.toLocaleString()} wasted spend. Top: ${topWasted.productName} (₹${topWasted.wastedSpend?.toLocaleString() || 0})`,
          evidence: [
            `${newOOSProducts.length} new OOS products detected`,
            `₹${result.verifiedWastedSpend.toLocaleString()} wasted on OOS ads`,
            `Top product: ${topWasted.productName}`,
          ],
          confidence: 90,
          predictedSavings: result.verifiedWastedSpend,
        });
      } catch (loopErr) {
        logger.warn({ err: loopErr }, '[OOS] Closed-loop tracking failed');
      }
    }

    // === STRATEGIC MEMORY: Record episode for OOS detection ===
    recordEpisode(
      'system',
      'inventory',
      `OOS Alert: ${newOOSProducts.length} products wasting ₹${result.verifiedWastedSpend.toLocaleString()} for ${client.brandName}`,
      JSON.stringify({ newOOS: newOOSProducts.length, wastedSpend: result.verifiedWastedSpend }),
      'pending'
    ).catch(epErr => logger.warn({ err: epErr }, '[OOS] Episode recording failed'));
  }

  // === STRATEGIC MEMORY: Record report summary ===
  try {
    const now = new Date();
    const weekNumber = Math.ceil((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
    const reportRecord: ReportRecord = {
      id: uuidv4(),
      clientId,
      reportType: 'oos-detection',
      generatedAt: now.toISOString(),
      weekNumber,
      year: now.getFullYear(),
      headline: `OOS Report: ${result.enhanced?.totalOOSProducts || 0} products, ₹${result.verifiedWastedSpend.toLocaleString()} wasted`,
      keyInsights: [
        `${newOOSProducts.length} new OOS products detected`,
        `Alert threshold: ₹${alertThreshold.toLocaleString()}`,
        result.summary,
      ],
      recommendations: shouldAlert ? [`Pause ads for ${newOOSProducts.length} OOS products`] : [],
      metricsSnapshot: {
        totalOOS: result.enhanced?.totalOOSProducts || 0,
        wastedSpend: result.verifiedWastedSpend,
        alertThreshold
      },
      qualityScore: 85,
      wasShipped: shouldAlert,
      shipDecision: shouldAlert ? 'SHIP' : 'HOLD',
      deliveredVia: [],
    };
    recordReport(reportRecord);
  } catch (repErr) {
    logger.warn({ err: repErr }, '[OOS] Report recording failed');
  }

  return {
    ...result,
    clientId,
    clientName: client.brandName,
    revenueLevel: client.revenueLevel,
    alertThreshold,
    shouldAlert,
    newOOSProducts,
    previouslyKnown,
  };
}

/**
 * Generate Smashed-branded HTML report for OOS detection
 */
export function generateOOSReport(report: ClientOOSReport, client: ServiceClient): string {
  const topProducts = report.enhanced?.topWasted || [];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OOS Detection Report - ${client.brandName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e5e5e5; line-height: 1.6; }
    .container { max-width: 1000px; margin: 0 auto; padding: 40px 20px; }
    .header { text-align: center; padding: 60px 20px; background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%); border-bottom: 1px solid #333; }
    .logo { font-size: 14px; color: #EC8A23; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 20px; }
    h1 { font-size: 36px; font-weight: 700; background: linear-gradient(90deg, #EC8A23, #f5a623); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 16px; }
    .subtitle { font-size: 18px; color: #888; }
    .alert-box { background: ${report.shouldAlert ? '#7f1d1d' : '#065f46'}; border: 1px solid ${report.shouldAlert ? '#dc2626' : '#10b981'}; border-radius: 12px; padding: 24px; margin: 40px 0; text-align: center; }
    .alert-value { font-size: 48px; font-weight: 700; color: ${report.shouldAlert ? '#fca5a5' : '#6ee7b7'}; }
    .alert-label { font-size: 14px; color: #888; text-transform: uppercase; margin-top: 8px; }
    .section { padding: 40px 0; border-bottom: 1px solid #222; }
    .section-title { font-size: 24px; font-weight: 600; margin-bottom: 24px; display: flex; align-items: center; gap: 12px; }
    .section-title::before { content: ''; width: 4px; height: 24px; background: #EC8A23; border-radius: 2px; }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
    .stat-card { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 20px; text-align: center; }
    .stat-value { font-size: 28px; font-weight: 700; color: #EC8A23; }
    .stat-label { font-size: 12px; color: #666; text-transform: uppercase; margin-top: 4px; }
    .product-card { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 20px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
    .product-card.new { border-left: 4px solid #dc2626; }
    .product-name { font-weight: 600; color: #fff; margin-bottom: 4px; }
    .product-meta { font-size: 13px; color: #888; }
    .product-waste { font-size: 24px; font-weight: 700; color: #fca5a5; }
    .badge { display: inline-block; background: #dc2626; color: #fff; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px; margin-left: 8px; }
    .footer { text-align: center; padding: 60px 20px; color: #666; }
    .footer a { color: #EC8A23; text-decoration: none; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">The Bridge Service · Smashed Agency</div>
    <h1>OOS Detection Report</h1>
    <div class="subtitle">${client.brandName} — ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
  </div>

  <div class="container">
    <div class="alert-box">
      <div class="alert-value">₹${report.verifiedWastedSpend.toLocaleString('en-IN')}</div>
      <div class="alert-label">${report.shouldAlert ? 'Verified Wasted Spend — Action Required' : 'Below Alert Threshold (₹' + report.alertThreshold.toLocaleString('en-IN') + ')'}</div>
    </div>

    <div class="section">
      <h2 class="section-title">Summary</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${report.enhanced?.totalOOSProducts || 0}</div>
          <div class="stat-label">OOS Products</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${report.newOOSProducts.length}</div>
          <div class="stat-label">New This Check</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${report.enhanced?.productsNoSales || 0}</div>
          <div class="stat-label">Verified No Sales</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">₹${report.alertThreshold.toLocaleString('en-IN')}</div>
          <div class="stat-label">Alert Threshold</div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Top Wasted Products</h2>
      ${topProducts.length === 0 ? '<p style="color:#888">No products with verified wasted spend.</p>' : topProducts.map(p => `
        <div class="product-card ${report.newOOSProducts.includes(p.productId) ? 'new' : ''}">
          <div>
            <div class="product-name">
              ${p.productName}
              ${report.newOOSProducts.includes(p.productId) ? '<span class="badge">NEW</span>' : ''}
            </div>
            <div class="product-meta">ID: ${p.productId} · Shopify Orders: ${p.shopifyOrders}</div>
          </div>
          <div class="product-waste">₹${p.wastedSpend.toLocaleString('en-IN')}</div>
        </div>
      `).join('')}
    </div>

    <div class="section">
      <h2 class="section-title">Recommendation</h2>
      <div style="background:#151515;border:1px solid #2a2a2a;border-left:4px solid #EC8A23;border-radius:12px;padding:24px">
        ${report.shouldAlert ? `
          <p style="color:#fff;font-size:16px;margin-bottom:12px"><strong>Action Required:</strong> Pause ads for ${report.newOOSProducts.length} OOS products</p>
          <p style="color:#6ee7b7">→ Estimated daily savings: ₹${Math.round(report.verifiedWastedSpend / 7).toLocaleString('en-IN')}/day</p>
        ` : `
          <p style="color:#888">No immediate action required. Waste is below your ₹${report.alertThreshold.toLocaleString('en-IN')} alert threshold for ${report.revenueLevel || 'starter'} brands.</p>
        `}
      </div>
    </div>
  </div>

  <div class="footer">
    <p>Generated by <a href="https://smashed.agency/scan">The Bridge Service</a></p>
    <p style="margin-top:8px;font-size:12px">© ${new Date().getFullYear()} Smashed Agency · Confidential</p>
  </div>
</body>
</html>`;
}
