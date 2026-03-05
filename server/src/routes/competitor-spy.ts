import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { safeFetch, safeJson } from '../utils/safe-fetch.js';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/* ------------------------------------------------------------------ */
/*  Meta Ad Library API (public, no auth required)                     */
/* ------------------------------------------------------------------ */

interface AdLibraryAd {
  id: string;
  ad_creation_time: string;
  ad_creative_bodies?: string[];
  ad_creative_link_captions?: string[];
  ad_creative_link_titles?: string[];
  ad_delivery_start_time: string;
  ad_delivery_stop_time?: string;
  ad_snapshot_url: string;
  byline?: string;
  currency?: string;
  impressions?: { lower_bound: string; upper_bound: string };
  spend?: { lower_bound: string; upper_bound: string };
  page_id: string;
  page_name: string;
  publisher_platforms?: string[];
}

async function searchAdLibrary(query: string, country: string = 'IN', limit: number = 25): Promise<AdLibraryAd[]> {
  const params = new URLSearchParams({
    search_terms: query,
    ad_type: 'ALL',
    ad_reached_countries: `["${country}"]`,
    ad_active_status: 'ACTIVE',
    fields: 'id,ad_creation_time,ad_creative_bodies,ad_creative_link_captions,ad_creative_link_titles,ad_delivery_start_time,ad_delivery_stop_time,ad_snapshot_url,byline,currency,impressions,spend,page_id,page_name,publisher_platforms',
    limit: String(limit),
    access_token: config.metaAppId + '|' + config.metaAppSecret,
  });

  const url = `${config.graphApiBase}/ads_archive?${params.toString()}`;

  const response = await safeFetch(url, { service: 'Meta Ad Library' });
  if (!response.ok) {
    const error = await response.text().catch(() => 'Unknown error');
    throw new Error(`Ad Library API error: ${response.status} - ${error}`);
  }

  const data = await safeJson(response);
  return data?.data || [];
}

/* ------------------------------------------------------------------ */
/*  Claude analysis of competitor ads                                  */
/* ------------------------------------------------------------------ */

async function analyzeCompetitorAds(brandName: string, ads: AdLibraryAd[]): Promise<string> {
  if (ads.length === 0) {
    return `No active ads found for "${brandName}" in the Meta Ad Library. They may not be running ads currently, or the brand name might be different from their Facebook page name. Try searching with variations.`;
  }

  const adSummaries = ads.slice(0, 15).map((ad, i) => ({
    index: i + 1,
    page: ad.page_name,
    body: ad.ad_creative_bodies?.[0]?.slice(0, 200) || 'No copy',
    headline: ad.ad_creative_link_titles?.[0] || 'No headline',
    caption: ad.ad_creative_link_captions?.[0] || '',
    platforms: ad.publisher_platforms?.join(', ') || 'unknown',
    running_since: ad.ad_delivery_start_time,
    est_spend: ad.spend ? `${ad.spend.lower_bound}-${ad.spend.upper_bound} ${ad.currency || ''}` : 'unknown',
    est_impressions: ad.impressions ? `${ad.impressions.lower_bound}-${ad.impressions.upper_bound}` : 'unknown',
  }));

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      temperature: 0.7,
      system: `You are a competitive intelligence analyst at Cosmisk. Analyze competitor ads from the Meta Ad Library and provide strategic insights.

Rules:
- Identify messaging patterns, hook styles, CTAs, and creative strategies
- Note estimated spend levels and ad longevity (longer-running ads = likely profitable)
- Suggest what the user can learn from these ads
- Be specific — reference actual ad copy and patterns
- Keep under 500 words
- End with 2-3 actionable takeaways`,
      messages: [{
        role: 'user',
        content: `Analyze these ${ads.length} active ads from "${brandName}":\n\n${JSON.stringify(adSummaries, null, 2)}`,
      }],
    });

    const text = response.content.find((b: any) => b.type === 'text');
    return text ? (text as any).text : 'Analysis unavailable.';
  } catch {
    return `Found ${ads.length} active ads from "${brandName}". The longest-running ads (those active for weeks/months) are likely their best performers. Review their copy patterns and hooks for inspiration.`;
  }
}

/* ------------------------------------------------------------------ */
/*  Routes                                                            */
/* ------------------------------------------------------------------ */

export async function competitorSpyRoutes(app: FastifyInstance) {

  // GET /competitor-spy/search — search Meta Ad Library
  app.get('/search', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { query, country = 'IN', limit = '25' } = request.query as {
      query?: string; country?: string; limit?: string;
    };

    if (!query) {
      return reply.status(400).send({ success: false, error: 'query parameter required' });
    }

    try {
      const ads = await searchAdLibrary(query, country, parseInt(limit, 10) || 25);

      // Group by page
      const pageMap = new Map<string, { page_name: string; page_id: string; ads: any[] }>();
      for (const ad of ads) {
        if (!pageMap.has(ad.page_id)) {
          pageMap.set(ad.page_id, { page_name: ad.page_name, page_id: ad.page_id, ads: [] });
        }
        pageMap.get(ad.page_id)!.ads.push({
          id: ad.id,
          body: ad.ad_creative_bodies?.[0] || null,
          headline: ad.ad_creative_link_titles?.[0] || null,
          caption: ad.ad_creative_link_captions?.[0] || null,
          snapshot_url: ad.ad_snapshot_url,
          platforms: ad.publisher_platforms || [],
          running_since: ad.ad_delivery_start_time,
          stopped: ad.ad_delivery_stop_time || null,
          est_spend: ad.spend ? { lower: ad.spend.lower_bound, upper: ad.spend.upper_bound, currency: ad.currency } : null,
          est_impressions: ad.impressions ? { lower: ad.impressions.lower_bound, upper: ad.impressions.upper_bound } : null,
        });
      }

      return {
        success: true,
        total_ads: ads.length,
        pages: Array.from(pageMap.values()),
      };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // GET /competitor-spy/analyze — search + Claude analysis
  app.get('/analyze', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { query, country = 'IN' } = request.query as { query?: string; country?: string };

    if (!query) {
      return reply.status(400).send({ success: false, error: 'query parameter required' });
    }

    try {
      const ads = await searchAdLibrary(query, country, 25);
      const analysis = await analyzeCompetitorAds(query, ads);

      // Build summary stats
      const totalAds = ads.length;
      const uniquePages = new Set(ads.map(a => a.page_id)).size;
      const platforms = new Set(ads.flatMap(a => a.publisher_platforms || []));
      const oldestAd = ads.reduce((oldest, ad) => {
        const date = new Date(ad.ad_delivery_start_time);
        return date < new Date(oldest) ? ad.ad_delivery_start_time : oldest;
      }, ads[0]?.ad_delivery_start_time || '');

      // Sample ads for display
      const sampleAds = ads.slice(0, 10).map(ad => ({
        id: ad.id,
        page_name: ad.page_name,
        body: ad.ad_creative_bodies?.[0]?.slice(0, 300) || null,
        headline: ad.ad_creative_link_titles?.[0] || null,
        snapshot_url: ad.ad_snapshot_url,
        running_since: ad.ad_delivery_start_time,
        est_spend: ad.spend ? `${ad.spend.lower_bound}-${ad.spend.upper_bound} ${ad.currency || ''}` : null,
      }));

      return {
        success: true,
        query,
        stats: {
          total_ads: totalAds,
          unique_pages: uniquePages,
          platforms: Array.from(platforms),
          oldest_ad_date: oldestAd,
        },
        analysis,
        sample_ads: sampleAds,
      };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });
}
