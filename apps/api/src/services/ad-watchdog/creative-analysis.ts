import { getDbAdapter } from '../../db/adapter.js';
import { MetaApiService } from '../meta-api.js';
import { config } from '../../config.js';
import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import type { CreativeAnalysisRow } from './types.js';

/* ------------------------------------------------------------------ */
/*  Creative Analysis: Store ad-level creative data for other agents   */
/* ------------------------------------------------------------------ */

/**
 * Categorize hook text into a strategic pattern
 */
export function categorizeHookPattern(hookText: string): string {
  const lower = hookText.toLowerCase();

  if (lower.includes('founder') || lower.includes('started') || lower.includes('years')) {
    return 'founder-story';
  }
  if (lower.includes('handcraft') || lower.includes('artisan') || lower.includes('made')) {
    return 'artisan-craft';
  }
  if (lower.includes('women') || lower.includes('customers') || lower.includes('love')) {
    return 'social-proof';
  }
  if (lower.includes('selling out') || lower.includes('only') || lower.includes('left')) {
    return 'scarcity';
  }
  if (lower.includes('₹') || lower.includes('off') || lower.includes('%') || lower.includes('hours')) {
    return 'discount-urgency';
  }
  if (lower.includes('new') || lower.includes('collection') || lower.includes('launch')) {
    return 'new-arrival';
  }

  return 'other';
}

/**
 * Detect creative type from ad name and creative data
 */
export function detectCreativeType(adName: string, creative: any): CreativeAnalysisRow['creativeType'] {
  const nameLower = (adName || '').toLowerCase();

  // Check ad name first (most reliable for catalog detection)
  if (nameLower.includes('catalog') ||
      nameLower.includes('dpa') ||
      nameLower.includes('dynamic') ||
      nameLower.includes('all products') ||
      nameLower.match(/- all\s*$/)) {
    return 'catalog';
  }
  if (nameLower.includes('carousel')) {
    return 'carousel';
  }
  if (nameLower.includes('reel') || nameLower.includes('video')) {
    return 'video';
  }
  if (nameLower.includes('static')) {
    return 'static';
  }

  // Fall back to creative data
  if (creative?.video_id) {
    return 'video';
  }
  if (creative?.asset_feed_spec?.images?.length > 1) {
    return 'carousel';
  }
  if (creative?.object_story_spec?.link_data?.retailer_item_ids) {
    return 'catalog';
  }
  if (creative?.image_url || creative?.thumbnail_url) {
    return 'static';
  }

  return 'unknown';
}

/**
 * Gather and store creative-level analysis data for an ad account
 * Called after each watchdog scan to keep creative_analysis table fresh
 */
export async function gatherCreativeAnalysis(
  meta: MetaApiService,
  accountId: string,
  clientId: string
): Promise<{ analyzed: number; stored: number }> {
  const db = getDbAdapter();

  logger.info({ accountId, clientId }, '[Watchdog] Gathering creative analysis...');

  try {
    // Ensure table exists
    await db.exec(`
      CREATE TABLE IF NOT EXISTS creative_analysis (
        id TEXT PRIMARY KEY,
        client_id TEXT,
        ad_id TEXT,
        ad_name TEXT,
        creative_type TEXT,
        hook_text TEXT,
        hook_pattern TEXT,
        ctr REAL,
        spend REAL,
        impressions INTEGER,
        image_url TEXT,
        video_id TEXT,
        analyzed_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Create index for faster lookups
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_creative_analysis_client
      ON creative_analysis(client_id)
    `);

    // Fetch ads with creative data (paginated)
    let allAds: any[] = [];
    let page = 1;

    const adsUrl = new URL(`${config.graphApiBase}/${accountId}/ads`);
    adsUrl.searchParams.set('fields', 'id,name,effective_status,creative{id,body,title,thumbnail_url,video_id,image_url}');
    adsUrl.searchParams.set('limit', '100');
    adsUrl.searchParams.set('filtering', JSON.stringify([
      { field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] }
    ]));

    let currentUrl: string | null = adsUrl.toString();

    // Fetch up to 20 pages (2000 ads) to avoid timeout
    while (currentUrl && page <= 20) {
      const adsData: { data?: any[]; paging?: { next?: string } } = await meta.get<any>(currentUrl.replace(config.graphApiBase, ''));
      const ads = adsData.data || [];
      allAds.push(...ads);

      currentUrl = adsData.paging?.next || null;
      page++;
    }

    logger.info({ adsFound: allAds.length }, '[Watchdog] Fetched ads for creative analysis');

    if (allAds.length === 0) {
      return { analyzed: 0, stored: 0 };
    }

    // Fetch insights in batches
    const adIds = allAds.map(a => a.id);

    for (let i = 0; i < adIds.length; i += 50) {
      const batch = adIds.slice(i, i + 50);

      try {
        const insightsUrl = `/${accountId}/insights`;
        const insightsData = await meta.get<any>(insightsUrl, {
          level: 'ad',
          filtering: JSON.stringify([{ field: 'ad.id', operator: 'IN', value: batch }]),
          fields: 'ad_id,impressions,clicks,ctr,spend',
          date_preset: 'last_30d',
          limit: '100',
        });

        const insights = insightsData.data || [];

        // Attach insights to ads
        for (const insight of insights) {
          const ad = allAds.find(a => a.id === insight.ad_id);
          if (ad) {
            ad.insights = { data: [insight] };
          }
        }
      } catch (err) {
        logger.warn({ batch: i / 50 + 1 }, '[Watchdog] Insights fetch failed for batch, continuing');
      }
    }

    // Clear old data for this client and insert new
    await db.run('DELETE FROM creative_analysis WHERE client_id = ?', [clientId]);

    const insertSql = `
      INSERT INTO creative_analysis (id, client_id, ad_id, ad_name, creative_type, hook_text, hook_pattern, ctr, spend, impressions, image_url, video_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    let stored = 0;

    for (const ad of allAds) {
      const creative = ad.creative || {};
      const insights = ad.insights?.data?.[0] || {};

      const ctr = parseFloat(insights.ctr) || 0;
      const spend = parseFloat(insights.spend) || 0;
      const impressions = parseInt(insights.impressions) || 0;

      // Determine creative type
      const creativeType = detectCreativeType(ad.name, creative);

      // Extract hook (first line of body text)
      const bodyText = creative.body || creative.title || '';
      const hookText = bodyText.split('\n')[0].trim().substring(0, 150);

      // Categorize hook pattern
      const hookPattern = categorizeHookPattern(hookText);

      await db.run(insertSql, [
        crypto.randomUUID(),
        clientId,
        ad.id,
        ad.name,
        creativeType,
        hookText,
        hookPattern,
        ctr,
        spend,
        impressions,
        creative.image_url || creative.thumbnail_url || null,
        creative.video_id || null
      ]);
      stored++;
    }

    logger.info({
      clientId,
      analyzed: allAds.length,
      stored,
    }, '[Watchdog] Creative analysis stored');

    return { analyzed: allAds.length, stored };

  } catch (err: any) {
    logger.error({ err: err.message, clientId }, '[Watchdog] Creative analysis failed');
    return { analyzed: 0, stored: 0 };
  }
}
