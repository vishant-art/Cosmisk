import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { encryptToken, decryptToken } from '../services/token-crypto.js';
import { safeFetch, safeJson, ExternalApiError } from '../utils/safe-fetch.js';
import { validate, oauthCodeSchema, tiktokAdsQuerySchema } from '../validation/schemas.js';
import { extractText } from '../utils/claude-helpers.js';
import Anthropic from '@anthropic-ai/sdk';
import { internalError } from '../utils/error-response.js';

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

const TIKTOK_AUTH_URL = 'https://business-api.tiktok.com/portal/auth';
const TIKTOK_API_URL = 'https://business-api.tiktok.com/open_api/v1.3';

/* ------------------------------------------------------------------ */
/*  TikTok OAuth                                                       */
/* ------------------------------------------------------------------ */

export function getTikTokOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    app_id: config.tiktokAppId,
    state,
    redirect_uri: `${config.appUrl}/app/settings/tiktok-callback`,
    scope: '["advertiser_management","campaign_read","campaign_write","ad_group_read","ad_read","report_read"]',
  });
  return `${TIKTOK_AUTH_URL}?${params.toString()}`;
}

async function exchangeTikTokCode(code: string): Promise<{ accessToken: string; advertiserId: string }> {
  const response = await safeFetch(`${TIKTOK_API_URL}/oauth2/access_token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: config.tiktokAppId,
      secret: config.tiktokAppSecret,
      auth_code: code,
    }),
    service: 'TikTok OAuth',
  });

  const data = await safeJson(response);
  if (!data || data.code !== 0) {
    throw new ExternalApiError('TikTok OAuth', response.status, data?.message || 'Token exchange failed');
  }

  return {
    accessToken: data.data.access_token,
    advertiserId: data.data.advertiser_ids?.[0] || '',
  };
}

/* ------------------------------------------------------------------ */
/*  TikTok API helpers                                                 */
/* ------------------------------------------------------------------ */

async function tiktokGet(path: string, accessToken: string, params: Record<string, any> = {}): Promise<any> {
  const url = new URL(`${TIKTOK_API_URL}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

  const response = await safeFetch(url.toString(), {
    headers: {
      'Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    service: 'TikTok Ads',
  });

  const data = await safeJson(response);
  if (!data) throw new ExternalApiError('TikTok Ads', response.status, 'Invalid JSON response');

  if (data.code !== 0) {
    throw new ExternalApiError('TikTok Ads', response.status, data.message || `API error code ${data.code}`);
  }

  return data.data;
}

/* ------------------------------------------------------------------ */
/*  DB helpers                                                         */
/* ------------------------------------------------------------------ */

// tiktok_tokens table is created centrally in db/schema.ts

function saveTikTokToken(userId: string, accessToken: string, advertiserId: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO tiktok_tokens (user_id, encrypted_access_token, advertiser_id)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      encrypted_access_token = excluded.encrypted_access_token,
      advertiser_id = excluded.advertiser_id,
      created_at = datetime('now')
  `).run(userId, encryptToken(accessToken), advertiserId);
}

/** Row shape for the tiktok_tokens table */
interface TikTokTokenRow {
  user_id: string;
  encrypted_access_token: string;
  advertiser_id: string;
  created_at: string;
}

function getTikTokToken(userId: string): { accessToken: string; advertiserId: string } | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM tiktok_tokens WHERE user_id = ?').get(userId) as TikTokTokenRow | undefined;
  if (!row) return null;
  return { accessToken: decryptToken(row.encrypted_access_token), advertiserId: row.advertiser_id };
}

/* ------------------------------------------------------------------ */
/*  Routes                                                            */
/* ------------------------------------------------------------------ */

export async function tiktokAdsRoutes(app: FastifyInstance) {

  // GET /tiktok-ads/oauth-url
  app.get('/oauth-url', { preHandler: [app.authenticate] }, async (request) => {
    if (!config.tiktokAppId) {
      return { success: false, error: 'TikTok Ads not configured' };
    }
    return { success: true, url: getTikTokOAuthUrl(request.user.id) };
  });

  // POST /tiktok-ads/oauth/exchange
  app.post('/oauth/exchange', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(oauthCodeSchema, request.body, reply);
    if (!parsed) return;
    const { code } = parsed;

    try {
      const { accessToken, advertiserId } = await exchangeTikTokCode(code);
      saveTikTokToken(request.user.id, accessToken, advertiserId);
      return { success: true, advertiser_id: advertiserId };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // GET /tiktok-ads/status
  app.get('/status', { preHandler: [app.authenticate] }, async (request) => {
    const tokenData = getTikTokToken(request.user.id);
    return { success: true, connected: !!tokenData, advertiser_id: tokenData?.advertiserId || null };
  });

  // GET /tiktok-ads/kpis — account-level KPIs
  app.get('/kpis', { preHandler: [app.authenticate] }, async (request, reply) => {
    const qParsed = validate(tiktokAdsQuerySchema, request.query, reply);
    if (!qParsed) return;
    const { date_preset } = qParsed;
    const tokenData = getTikTokToken(request.user.id);
    if (!tokenData) return reply.status(200).send({ success: false, error: 'TikTok not connected' });

    try {
      const dateRange = mapTikTokDateRange(date_preset);
      const data = await tiktokGet('/report/integrated/get/', tokenData.accessToken, {
        advertiser_id: tokenData.advertiserId,
        report_type: 'BASIC',
        data_level: 'AUCTION_ADVERTISER',
        dimensions: '["advertiser_id"]',
        metrics: '["spend","impressions","clicks","ctr","cpc","conversion","cost_per_conversion","total_complete_payment_rate"]',
        start_date: dateRange.start,
        end_date: dateRange.end,
      });

      const row = data?.list?.[0]?.metrics || {};
      return {
        success: true,
        platform: 'tiktok',
        kpis: {
          spend: parseFloat(row.spend) || 0,
          impressions: parseInt(row.impressions) || 0,
          clicks: parseInt(row.clicks) || 0,
          ctr: parseFloat(row.ctr) || 0,
          cpc: parseFloat(row.cpc) || 0,
          conversions: parseInt(row.conversion) || 0,
          cpa: parseFloat(row.cost_per_conversion) || 0,
        },
      };
    } catch (err: any) {
      return internalError(reply, err, 'tiktok-ads/kpis failed');
    }
  });

  // GET /tiktok-ads/campaigns — campaign performance
  app.get('/campaigns', { preHandler: [app.authenticate] }, async (request, reply) => {
    const qParsed = validate(tiktokAdsQuerySchema, request.query, reply);
    if (!qParsed) return;
    const { date_preset } = qParsed;
    const tokenData = getTikTokToken(request.user.id);
    if (!tokenData) return reply.status(200).send({ success: false, error: 'TikTok not connected' });

    try {
      const dateRange = mapTikTokDateRange(date_preset);
      const data = await tiktokGet('/report/integrated/get/', tokenData.accessToken, {
        advertiser_id: tokenData.advertiserId,
        report_type: 'BASIC',
        data_level: 'AUCTION_CAMPAIGN',
        dimensions: '["campaign_id"]',
        metrics: '["campaign_name","spend","impressions","clicks","ctr","conversion","cost_per_conversion"]',
        start_date: dateRange.start,
        end_date: dateRange.end,
        page_size: 50,
      });

      const campaigns = (data?.list || []).map((item: any) => ({
        id: item.dimensions?.campaign_id,
        name: item.metrics?.campaign_name || 'Unknown',
        spend: parseFloat(item.metrics?.spend) || 0,
        impressions: parseInt(item.metrics?.impressions) || 0,
        clicks: parseInt(item.metrics?.clicks) || 0,
        ctr: parseFloat(item.metrics?.ctr) || 0,
        conversions: parseInt(item.metrics?.conversion) || 0,
        cpa: parseFloat(item.metrics?.cost_per_conversion) || 0,
      }));

      return { success: true, platform: 'tiktok', campaigns };
    } catch (err: any) {
      return internalError(reply, err, 'tiktok-ads/campaigns failed');
    }
  });

  // GET /tiktok-ads/analyze — Claude analysis
  app.get('/analyze', { preHandler: [app.authenticate], config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const qParsed = validate(tiktokAdsQuerySchema, request.query, reply);
    if (!qParsed) return;
    const { date_preset } = qParsed;
    const tokenData = getTikTokToken(request.user.id);
    if (!tokenData) return reply.status(200).send({ success: false, error: 'TikTok not connected' });

    try {
      const dateRange = mapTikTokDateRange(date_preset);

      const [accountData, campaignData] = await Promise.all([
        tiktokGet('/report/integrated/get/', tokenData.accessToken, {
          advertiser_id: tokenData.advertiserId,
          report_type: 'BASIC',
          data_level: 'AUCTION_ADVERTISER',
          dimensions: '["advertiser_id"]',
          metrics: '["spend","impressions","clicks","ctr","cpc","conversion","cost_per_conversion"]',
          start_date: dateRange.start,
          end_date: dateRange.end,
        }),
        tiktokGet('/report/integrated/get/', tokenData.accessToken, {
          advertiser_id: tokenData.advertiserId,
          report_type: 'BASIC',
          data_level: 'AUCTION_CAMPAIGN',
          dimensions: '["campaign_id"]',
          metrics: '["campaign_name","spend","impressions","clicks","ctr","conversion","cost_per_conversion"]',
          start_date: dateRange.start,
          end_date: dateRange.end,
          page_size: 20,
        }),
      ]);

      const kpis = accountData?.list?.[0]?.metrics || {};
      const campaigns = (campaignData?.list || []).map((item: any) => ({
        name: item.metrics?.campaign_name || 'Unknown',
        spend: parseFloat(item.metrics?.spend) || 0,
        conversions: parseInt(item.metrics?.conversion) || 0,
        cpa: parseFloat(item.metrics?.cost_per_conversion) || 0,
        ctr: parseFloat(item.metrics?.ctr) || 0,
      }));

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        temperature: 0.7,
        system: 'You are a TikTok Ads strategist at Cosmisk. Analyze performance data and give specific, actionable advice. Reference actual campaign names and numbers. Under 400 words.',
        messages: [{
          role: 'user',
          content: `Analyze this TikTok Ads performance:\n\nAccount: ${JSON.stringify(kpis)}\n\nCampaigns: ${JSON.stringify(campaigns.slice(0, 10))}`,
        }],
      });

      return {
        success: true,
        platform: 'tiktok',
        kpis,
        campaigns: campaigns.slice(0, 10),
        analysis: extractText(response, 'Analysis unavailable.'),
      };
    } catch (err: any) {
      return internalError(reply, err, 'tiktok-ads/analyze failed');
    }
  });

  // POST /tiktok-ads/disconnect
  app.post('/disconnect', { preHandler: [app.authenticate] }, async (request) => {
    const db = getDb();
    db.prepare('DELETE FROM tiktok_tokens WHERE user_id = ?').run(request.user.id);
    return { success: true };
  });
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function mapTikTokDateRange(preset: string): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().split('T')[0];

  const daysMap: Record<string, number> = {
    'last_7d': 7,
    'last_14d': 14,
    'last_30d': 30,
  };

  const days = daysMap[preset] || 7;
  const start = new Date(now.getTime() - days * 86400000).toISOString().split('T')[0];

  return { start, end };
}
