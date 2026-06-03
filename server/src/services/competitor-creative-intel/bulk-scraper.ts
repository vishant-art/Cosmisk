/**
 * Competitor Creative Intelligence — Bulk Scraper (MetaAdsCollector)
 *
 * Uses Python MetaAdsCollector which reverse-engineers Meta's GraphQL API.
 * Can scrape 500+ ads per query vs 10-50 from official API.
 */

import { spawn } from 'node:child_process';
import * as nodePath from 'node:path';
import { fileURLToPath as nodeFileURLToPath } from 'node:url';
import { logger } from '../../utils/logger.js';
import type { BulkScrapeResult, CreativeAnalysis, ScrapedAd } from './types.js';

const __dirnameLocal = nodePath.dirname(nodeFileURLToPath(import.meta.url));
const PYTHON_SCRIPT = nodePath.join(__dirnameLocal, '../../../scripts/meta-ads-scraper.py');
const PYTHON_VENV = nodePath.join(__dirnameLocal, '../../../.venv/bin/python3');

/**
 * Scrape Meta Ad Library using Python MetaAdsCollector
 * Reverse-engineers Meta's GraphQL API - no API key required
 */
export async function scrapeMetaAdsBulk(options: {
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

    const proc = spawn(PYTHON_VENV, args, { cwd: nodePath.join(__dirnameLocal, '../../..') });

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
export function convertScrapedAd(ad: ScrapedAd): CreativeAnalysis {
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
