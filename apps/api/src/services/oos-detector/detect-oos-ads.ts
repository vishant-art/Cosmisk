/**
 * OOS Detector - Name-based ad detection
 *
 * Matches active Meta ads to fully-OOS Shopify products by fuzzy text matching.
 */

import { fetchFullyOOSProducts } from '../../audit/shopify-ingestion.js';
import { MetaApiService } from '../meta-api.js';
import { logger } from '../../utils/logger.js';
import { fuzzyMatch, extractAdText } from './fuzzy-match.js';
import type { OOSAdMatch, OOSReport, DetectOOSAdsOptions } from './types.js';

// ============ MAIN DETECTOR ============

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
