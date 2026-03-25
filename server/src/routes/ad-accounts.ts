import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import { decryptToken } from '../services/token-crypto.js';
import { MetaApiService } from '../services/meta-api.js';
import { parseInsightMetrics } from '../services/insights-parser.js';
import type { MetaTokenRow, AdAccount, TopAd } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { internalError } from '../utils/error-response.js';

function getUserMetaToken(userId: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(userId) as MetaTokenRow | undefined;
  if (!row) return null;
  return decryptToken(row.encrypted_access_token);
}

// In-memory cache for ad accounts list (expires after 5 minutes)
const accountsCache = new Map<string, { data: any[]; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function adAccountRoutes(app: FastifyInstance) {

  // GET /ad-accounts/list — FIXES BUG: "only 2-3 accounts visible"
  app.get('/list', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const userId = request.user.id;

      // Return cached data if fresh
      const cached = accountsCache.get(userId);
      if (cached && Date.now() - cached.ts < CACHE_TTL) {
        const accounts: AdAccount[] = cached.data.map((acc: any) => ({
          id: acc.id,
          account_id: acc.account_id,
          name: acc.name || 'Unnamed Account',
          business_name: acc.business_name || '',
          status: acc.account_status === 1 ? 'active' as const : 'inactive' as const,
          currency: acc.currency || 'USD',
          credential_group: 'oauth',
        }));
        return { success: true, accounts, total: accounts.length };
      }

      const token = getUserMetaToken(userId);
      if (!token) {
        return reply.status(200).send({ success: true, accounts: [], total: 0, meta_connected: false });
      }
      const meta = new MetaApiService(token);

      // Paginate through ALL ad accounts
      const rawAccounts = await meta.getAllPages<any>('/me/adaccounts', {
        fields: 'name,account_id,business_name,account_status,currency',
        limit: '500',
      });

      // Cache the raw response
      accountsCache.set(userId, { data: rawAccounts, ts: Date.now() });

      const accounts: AdAccount[] = rawAccounts.map((acc: any) => ({
        id: acc.id,                              // "act_XXX"
        account_id: acc.account_id,              // "XXX" numeric
        name: acc.name || 'Unnamed Account',
        business_name: acc.business_name || '',
        status: acc.account_status === 1 ? 'active' as const : 'inactive' as const,
        currency: acc.currency || 'USD',
        credential_group: 'oauth',
      }));

      return { success: true, accounts, total: accounts.length };
    } catch (err: any) {
      if (err.message?.includes('too many calls') || err.message?.includes('rate') || err.message?.includes('limit')) {
        logger.error({ err: err.message }, 'ad-accounts/list rate limited');
        return reply.status(429).send({ success: false, error: 'Meta API rate limited. Wait a few minutes and refresh.', accounts: [], total: 0 });
      }
      return internalError(reply, err, 'ad-accounts/list failed');
    }
  });

  // GET /ad-accounts/kpis — FIXES BUG: "data doesn't change on account switch"
  app.get('/kpis', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { account_id, date_preset = 'last_7d' } = request.query as {
      account_id: string; credential_group?: string; date_preset?: string;
    };

    if (!account_id) {
      return reply.status(400).send({ success: false, error: 'account_id required' });
    }

    try {
      const token = getUserMetaToken(request.user.id);
      if (!token) {
        return reply.status(200).send({ success: true, kpis: {}, meta_connected: false });
      }
      const meta = new MetaApiService(token);

      // Current period
      const currentData = await meta.get<any>(`/${account_id}/insights`, {
        fields: 'spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas',
        date_preset,
        level: 'account',
      });

      const currentRow = currentData.data?.[0] || {};
      const current = parseInsightMetrics(currentRow);

      // Previous period for change calculation
      const prevPreset = getPreviousPreset(date_preset);
      let previous = { spend: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, conversions: 0, revenue: 0, roas: 0, cpa: 0, aov: 0 };

      try {
        const prevData = await meta.get<any>(`/${account_id}/insights`, {
          fields: 'spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas',
          date_preset: prevPreset,
          level: 'account',
        });
        if (prevData.data?.[0]) {
          previous = parseInsightMetrics(prevData.data[0]);
        }
      } catch {
        // Previous period data not available
      }

      // Daily sparkline
      let sparklineData: any[] = [];
      try {
        const dailyData = await meta.get<any>(`/${account_id}/insights`, {
          fields: 'spend,actions,action_values,purchase_roas',
          date_preset,
          time_increment: '1',
          level: 'account',
        });
        sparklineData = dailyData.data || [];
      } catch {
        // Sparkline not critical
      }

      const spendSparkline = sparklineData.map((d: any) => parseFloat(d.spend || '0'));
      const revenueSparkline = sparklineData.map((d: any) => {
        const m = parseInsightMetrics(d);
        return m.revenue;
      });
      const roasSparkline = sparklineData.map((d: any) => {
        const m = parseInsightMetrics(d);
        return m.roas;
      });

      const change = (curr: number, prev: number) => {
        if (prev === 0) return curr > 0 ? 100 : 0;
        return Math.round(((curr - prev) / prev) * 100 * 10) / 10;
      };

      return {
        success: true,
        kpis: {
          spend: { value: round(current.spend, 2), change: change(current.spend, previous.spend), sparkline: spendSparkline },
          revenue: { value: round(current.revenue, 2), change: change(current.revenue, previous.revenue), sparkline: revenueSparkline },
          roas: { value: round(current.roas, 2), change: change(current.roas, previous.roas), sparkline: roasSparkline },
          cpa: { value: round(current.cpa, 2), change: change(current.cpa, previous.cpa) },
          ctr: { value: round(current.ctr, 2), change: change(current.ctr, previous.ctr) },
          impressions: { value: current.impressions, change: change(current.impressions, previous.impressions) },
          clicks: { value: current.clicks, change: change(current.clicks, previous.clicks) },
          conversions: { value: current.conversions, change: change(current.conversions, previous.conversions) },
          cpc: { value: round(current.cpc, 2), change: change(current.cpc, previous.cpc) },
          aov: { value: round(current.aov, 2), change: change(current.aov, previous.aov) },
        },
      };
    } catch (err: any) {
      return internalError(reply, err, 'ad-accounts/kpis failed');
    }
  });

  // GET /ad-accounts/top-ads — FIXES BUG: "data doesn't change on account switch"
  app.get('/top-ads', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { account_id, limit = '100', date_preset = 'last_7d' } = request.query as {
      account_id: string; credential_group?: string; limit?: string; date_preset?: string;
    };

    if (!account_id) {
      return reply.status(400).send({ success: false, error: 'account_id required' });
    }

    try {
      const token = getUserMetaToken(request.user.id);
      if (!token) {
        return reply.status(200).send({ success: true, ads: [], meta_connected: false });
      }
      const meta = new MetaApiService(token);

      // Fetch ads with a single request (no pagination to avoid "too much data" errors)
      const maxLimit = Math.min(parseInt(limit, 10) || 50, 100);
      const adsResp = await meta.get<any>(`/${account_id}/ads`, {
        fields: `id,name,creative{thumbnail_url,object_type,video_id},insights.date_preset(${date_preset}){spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas},campaign{name},adset{name},created_time`,
        limit: String(maxLimit),
        filtering: JSON.stringify([
          { field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] },
        ]),
      });
      const allAdsRaw = adsResp.data || [];

      const ads: TopAd[] = allAdsRaw.map((ad: any) => {
        const insight = ad.insights?.data?.[0] || {};
        const m = parseInsightMetrics(insight);
        const creative = ad.creative || {};
        const createdTime = ad.created_time || new Date().toISOString();
        const daysActive = Math.max(1, Math.floor((Date.now() - new Date(createdTime).getTime()) / 86400000));

        return {
          id: ad.id,
          name: ad.name || 'Unnamed Ad',
          object_type: creative.object_type || 'IMAGE',
          metrics: {
            roas: round(m.roas, 2),
            cpa: round(m.cpa, 2),
            ctr: round(m.ctr, 2),
            spend: round(m.spend, 2),
            impressions: m.impressions,
            clicks: m.clicks,
            conversions: m.conversions,
          },
          thumbnail_url: creative.thumbnail_url || '',
          video_id: creative.video_id || null,
          campaign_name: ad.campaign?.name || 'Unknown',
          adset_name: ad.adset?.name || 'Unknown',
          days_active: daysActive,
          created_time: createdTime,
        };
      });

      // Sort by spend descending
      ads.sort((a, b) => b.metrics.spend - a.metrics.spend);

      return { success: true, ads };
    } catch (err: any) {
      return internalError(reply, err, 'ad-accounts/top-ads failed');
    }
  });

  // GET /ad-accounts/video-source — FIXES BUG: "videos don't play"
  app.get('/video-source', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { video_id, account_id } = request.query as { video_id: string; account_id?: string; credential_group?: string };

    if (!video_id) {
      return reply.status(400).send({ success: false, error: 'video_id required' });
    }

    try {
      const token = getUserMetaToken(request.user.id);
      if (!token) {
        return reply.status(200).send({ success: false, video_url: '', error: 'Meta account not connected', meta_connected: false });
      }
      const meta = new MetaApiService(token);

      // Try multiple approaches to get video source URL
      // Approach 1: Direct video node with source field
      try {
        const data = await meta.get<any>(`/${video_id}`, { fields: 'source' });
        if (data.source) {
          return { success: true, video_url: data.source };
        }
      } catch {
        // Permission denied — try alternate approaches
      }

      // Approach 2: Get video thumbnails/source via ad account's advideos
      if (account_id) {
        try {
          const data = await meta.get<any>(`/${account_id}/advideos`, {
            filtering: JSON.stringify([{ field: 'id', operator: 'IN', value: [video_id] }]),
            fields: 'source,permalink_url,embeddable',
          });
          const video = data.data?.[0];
          if (video?.source) {
            return { success: true, video_url: video.source };
          }
        } catch {
          // Try next approach
        }
      }

      // Approach 3: Get the video permalink and embed URL
      try {
        const data = await meta.get<any>(`/${video_id}`, { fields: 'permalink_url,embed_html,format' });
        // format array contains quality variants with URLs
        if (data.format?.length) {
          // Pick the highest quality format with a direct URL
          const best = data.format.find((f: any) => f.filter === 'native') || data.format[data.format.length - 1];
          if (best?.picture) {
            // This is a thumbnail, not playable — but format sometimes has embed_html
          }
        }
        if (data.embed_html) {
          // Extract src from iframe embed_html
          const srcMatch = data.embed_html.match(/src="([^"]+)"/);
          if (srcMatch) {
            return { success: true, video_url: srcMatch[1] };
          }
        }
        if (data.permalink_url) {
          return { success: true, video_url: `https://www.facebook.com${data.permalink_url}` };
        }
      } catch {
        // All approaches failed
      }

      return { success: false, video_url: '', error: 'Could not retrieve video source. The app may need pages_read_engagement permission.' };
    } catch (err: any) {
      return internalError(reply, err, 'ad-accounts/video-source failed');
    }
  });

  // GET /ad-accounts/pages — list Facebook Pages the user manages
  app.get('/pages', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const token = getUserMetaToken(request.user.id);
      if (!token) {
        return reply.status(200).send({ success: true, pages: [] });
      }

      const meta = new MetaApiService(token);
      const resp = await meta.get<any>('/me/accounts', {
        fields: 'id,name,category,picture{url}',
        limit: '100',
      });

      const pages = (resp.data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        category: p.category || '',
        picture_url: p.picture?.data?.url || '',
      }));

      return { success: true, pages };
    } catch (err: any) {
      return internalError(reply, err, 'ad-accounts/pages failed');
    }
  });
}

function getPreviousPreset(preset: string): string {
  const map: Record<string, string> = {
    today: 'yesterday',
    yesterday: 'yesterday',
    last_7d: 'last_14d',
    last_14d: 'last_30d',
    last_30d: 'last_90d',
    this_month: 'last_month',
    last_month: 'last_month',
  };
  return map[preset] || 'last_14d';
}

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
