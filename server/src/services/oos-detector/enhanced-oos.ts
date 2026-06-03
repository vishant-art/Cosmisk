/**
 * OOS Detector - Enhanced (product-level) detection
 *
 * Per-product spend via Meta async reports (breakdowns=product_id) +
 * Shopify order verification to confirm true wasted spend.
 */

import { logger } from '../../utils/logger.js';
import { config } from '../../config.js';
import type {
  ProductSpendData,
  ShopifySalesData,
  EnhancedOOSProduct,
  EnhancedOOSReport,
  EnhancedOOSOptions,
  CatalogProductData,
  ProductGroupSpend,
} from './types.js';

// ============ PER-PRODUCT SPEND ANALYSIS (Async Reports) ============

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
