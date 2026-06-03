/**
 * OOS Detector - Catalog-based detection
 *
 * Detects OOS products inside a Facebook/Meta Catalog (for DPA/catalog ads).
 */

import { MetaApiService } from '../meta-api.js';
import { logger } from '../../utils/logger.js';
import type { CatalogOOSProduct, CatalogOOSReport, CatalogOOSOptions } from './types.js';

// ============ CATALOG-BASED OOS DETECTION ============

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
