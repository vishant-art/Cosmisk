/**
 * Competitor Creative Intelligence — Meta Ad Library API
 */

import { config } from '../../config.js';
import { safeFetch, safeJson } from '../../utils/safe-fetch.js';
import { logger } from '../../utils/logger.js';
import type { AdLibraryAd } from './types.js';

export async function fetchAdLibrary(
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
