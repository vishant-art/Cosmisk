import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import {
  getGoogleOAuthUrl, exchangeGoogleCode, refreshGoogleToken,
  GoogleAdsApiService, saveGoogleToken, getGoogleToken
} from '../services/google-ads-api.js';
import { validate, oauthCodeSchema, googleAdsQuerySchema } from '../validation/schemas.js';
import { extractText } from '../utils/claude-helpers.js';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });

/* ------------------------------------------------------------------ */
/*  Date range mapping                                                 */
/* ------------------------------------------------------------------ */

function mapDatePreset(preset: string): string {
  const map: Record<string, string> = {
    'last_7d': 'LAST_7_DAYS',
    'last_14d': 'LAST_14_DAYS',
    'last_30d': 'LAST_30_DAYS',
    'this_month': 'THIS_MONTH',
    'last_month': 'LAST_MONTH',
  };
  return map[preset] || 'LAST_7_DAYS';
}

/* ------------------------------------------------------------------ */
/*  Routes                                                            */
/* ------------------------------------------------------------------ */

export async function googleAdsRoutes(app: FastifyInstance) {

  // GET /google-ads/oauth-url — get OAuth URL for Google Ads
  app.get('/oauth-url', { preHandler: [app.authenticate] }, async (request) => {
    if (!config.googleAdsClientId) {
      return { success: false, error: 'Google Ads not configured' };
    }
    const url = getGoogleOAuthUrl(request.user.id);
    return { success: true, url };
  });

  // POST /google-ads/oauth/exchange — exchange code for tokens
  app.post('/oauth/exchange', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(oauthCodeSchema, request.body, reply);
    if (!parsed) return;
    const { code } = parsed;

    try {
      const { accessToken, refreshToken, expiresIn } = await exchangeGoogleCode(code);
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      // Get accessible customer IDs
      const service = new GoogleAdsApiService(accessToken, '');
      let customerIds: string[] = [];
      try {
        customerIds = await service.getAccessibleCustomers();
      } catch { /* may fail if no accounts */ }

      saveGoogleToken(request.user.id, accessToken, refreshToken, expiresAt, customerIds);

      return { success: true, customer_ids: customerIds };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // GET /google-ads/status — check connection status
  app.get('/status', { preHandler: [app.authenticate] }, async (request) => {
    const tokenData = getGoogleToken(request.user.id);
    if (!tokenData) {
      return { success: true, connected: false };
    }

    return {
      success: true,
      connected: true,
      customer_ids: tokenData.customerIds,
      expires_at: tokenData.expiresAt,
    };
  });

  // GET /google-ads/accounts — list accessible ad accounts
  app.get('/accounts', { preHandler: [app.authenticate] }, async (request, reply) => {
    const tokenData = getGoogleToken(request.user.id);
    if (!tokenData) {
      return reply.status(200).send({ success: true, accounts: [], connected: false });
    }

    try {
      // Refresh token if needed
      let accessToken = tokenData.accessToken;
      if (tokenData.expiresAt && new Date(tokenData.expiresAt) < new Date()) {
        const refreshed = await refreshGoogleToken(tokenData.refreshToken);
        accessToken = refreshed.accessToken;
        saveGoogleToken(request.user.id, accessToken, tokenData.refreshToken,
          new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(), tokenData.customerIds);
      }

      const service = new GoogleAdsApiService(accessToken, '');
      const customerIds = await service.getAccessibleCustomers();

      return { success: true, accounts: customerIds.map(id => ({ id, customer_id: id })) };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // GET /google-ads/kpis — KPIs for a Google Ads customer
  app.get('/kpis', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(googleAdsQuerySchema, request.query, reply);
    if (!parsed) return;
    const { customer_id, date_preset } = parsed;
    if (!customer_id) {
      return reply.status(400).send({ success: false, error: 'customer_id required' });
    }

    const tokenData = getGoogleToken(request.user.id);
    if (!tokenData) {
      return reply.status(200).send({ success: false, error: 'Google Ads not connected' });
    }

    try {
      let accessToken = tokenData.accessToken;
      if (tokenData.expiresAt && new Date(tokenData.expiresAt) < new Date()) {
        const refreshed = await refreshGoogleToken(tokenData.refreshToken);
        accessToken = refreshed.accessToken;
      }

      const service = new GoogleAdsApiService(accessToken, customer_id);
      const kpis = await service.getAccountPerformance(mapDatePreset(date_preset));

      return { success: true, platform: 'google', kpis };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // GET /google-ads/campaigns — campaign performance
  app.get('/campaigns', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(googleAdsQuerySchema, request.query, reply);
    if (!parsed) return;
    const { customer_id, date_preset } = parsed;
    if (!customer_id) {
      return reply.status(400).send({ success: false, error: 'customer_id required' });
    }

    const tokenData = getGoogleToken(request.user.id);
    if (!tokenData) {
      return reply.status(200).send({ success: false, error: 'Google Ads not connected' });
    }

    try {
      let accessToken = tokenData.accessToken;
      if (tokenData.expiresAt && new Date(tokenData.expiresAt) < new Date()) {
        const refreshed = await refreshGoogleToken(tokenData.refreshToken);
        accessToken = refreshed.accessToken;
      }

      const service = new GoogleAdsApiService(accessToken, customer_id);
      const campaigns = await service.getCampaignPerformance(mapDatePreset(date_preset));

      return { success: true, platform: 'google', campaigns };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // GET /google-ads/analyze — Claude analysis of Google Ads data
  app.get('/analyze', { preHandler: [app.authenticate], config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = validate(googleAdsQuerySchema, request.query, reply);
    if (!parsed) return;
    const { customer_id, date_preset } = parsed;
    if (!customer_id) {
      return reply.status(400).send({ success: false, error: 'customer_id required' });
    }

    const tokenData = getGoogleToken(request.user.id);
    if (!tokenData) {
      return reply.status(200).send({ success: false, error: 'Google Ads not connected' });
    }

    try {
      let accessToken = tokenData.accessToken;
      if (tokenData.expiresAt && new Date(tokenData.expiresAt) < new Date()) {
        const refreshed = await refreshGoogleToken(tokenData.refreshToken);
        accessToken = refreshed.accessToken;
      }

      const service = new GoogleAdsApiService(accessToken, customer_id);
      const [kpis, campaigns] = await Promise.all([
        service.getAccountPerformance(mapDatePreset(date_preset)),
        service.getCampaignPerformance(mapDatePreset(date_preset)),
      ]);

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        temperature: 0.7,
        system: `You are a Google Ads strategist at Cosmisk. Analyze the performance data and give specific, actionable advice. Reference actual campaign names and numbers. Be conversational, not report-like. Under 400 words.`,
        messages: [{
          role: 'user',
          content: `Analyze this Google Ads performance:\n\nAccount KPIs: ${JSON.stringify(kpis)}\n\nCampaigns: ${JSON.stringify(campaigns.slice(0, 10))}`,
        }],
      });

      return {
        success: true,
        platform: 'google',
        kpis,
        campaigns: campaigns.slice(0, 10),
        analysis: extractText(response, 'Analysis unavailable.'),
      };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // POST /google-ads/disconnect
  app.post('/disconnect', { preHandler: [app.authenticate] }, async (request) => {
    const { getDb } = await import('../db/index.js');
    const db = getDb();
    db.prepare('DELETE FROM google_tokens WHERE user_id = ?').run(request.user.id);
    return { success: true };
  });
}
