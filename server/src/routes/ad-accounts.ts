import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import { decryptToken } from '../services/token-crypto.js';
import { MetaApiService } from '../services/meta-api.js';
import { parseInsightMetrics } from '../services/insights-parser.js';
import { computeTrend } from '../services/trend-analyzer.js';
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

  // GET /ad-accounts/portfolio-health — health scores for all accounts
  const portfolioCache = new Map<string, { data: any; ts: number }>();
  const PORTFOLIO_CACHE_TTL = 3 * 60 * 1000; // 3 minutes

  app.get('/portfolio-health', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const userId = request.user.id;

      // Check cache
      const cached = portfolioCache.get(userId);
      if (cached && Date.now() - cached.ts < PORTFOLIO_CACHE_TTL) {
        return cached.data;
      }

      const token = getUserMetaToken(userId);
      if (!token) {
        return reply.status(200).send({ success: true, portfolio: null, accounts: [], meta_connected: false });
      }
      const meta = new MetaApiService(token);

      // Get all ad accounts (reuse accountsCache)
      let rawAccounts: any[];
      const accCached = accountsCache.get(userId);
      if (accCached && Date.now() - accCached.ts < CACHE_TTL) {
        rawAccounts = accCached.data;
      } else {
        rawAccounts = await meta.getAllPages<any>('/me/adaccounts', {
          fields: 'name,account_id,business_name,account_status,currency',
          limit: '500',
        });
        accountsCache.set(userId, { data: rawAccounts, ts: Date.now() });
      }

      // Only process active accounts
      const activeAccounts = rawAccounts.filter((a: any) => a.account_status === 1);

      // Batch SQLite queries
      const db = getDb();
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

      const sprintRows = db.prepare(`
        SELECT account_id, MAX(created_at) as latest_sprint,
          COUNT(*) as total_sprints,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_sprints
        FROM creative_sprints WHERE account_id IS NOT NULL
        GROUP BY account_id
      `).all() as any[];

      const alertRows = db.prepare(`
        SELECT account_id, COUNT(*) as alert_count,
          MAX(CASE WHEN severity = 'critical' THEN 4 WHEN severity = 'high' THEN 3 WHEN severity = 'medium' THEN 2 ELSE 1 END) as max_severity
        FROM autopilot_alerts WHERE created_at >= ? AND account_id IS NOT NULL
        GROUP BY account_id
      `).all(sevenDaysAgo) as any[];

      const decisionRows = db.prepare(`
        SELECT account_id, COUNT(*) as pending_count
        FROM agent_decisions WHERE status = 'pending' AND account_id IS NOT NULL
        GROUP BY account_id
      `).all() as any[];

      // Index by account_id
      const sprintMap = new Map(sprintRows.map((r: any) => [r.account_id, r]));
      const alertMap = new Map(alertRows.map((r: any) => [r.account_id, r]));
      const decisionMap = new Map(decisionRows.map((r: any) => [r.account_id, r]));

      // Fetch insights in parallel (max 5 concurrent)
      const CONCURRENCY = 5;
      const accountResults: any[] = [];

      for (let i = 0; i < activeAccounts.length; i += CONCURRENCY) {
        const batch = activeAccounts.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map(async (acc: any) => {
            const accountId = acc.id; // "act_XXX"

            // Fetch aggregate + daily insights in parallel
            const [aggregateRes, dailyRes] = await Promise.allSettled([
              meta.get<any>(`/${accountId}/insights`, {
                fields: 'spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas',
                date_preset: 'last_7d',
                level: 'account',
              }),
              meta.get<any>(`/${accountId}/insights`, {
                fields: 'spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas',
                date_preset: 'last_7d',
                time_increment: '1',
                level: 'account',
              }),
            ]);

            const aggregateRow = aggregateRes.status === 'fulfilled' ? aggregateRes.value.data?.[0] : null;
            const dailyRows = dailyRes.status === 'fulfilled' ? dailyRes.value.data || [] : [];

            if (!aggregateRow) {
              return {
                accountId, accountName: acc.name || 'Unnamed', businessName: acc.business_name || '',
                currency: acc.currency || 'USD',
                spend: 0, revenue: 0, roas: 0, cpa: 0, ctr: 0, conversions: 0,
                roasTrend: { direction: 'stable', pctChange: 0, label: 'No data' },
                cpaTrend: { direction: 'stable', pctChange: 0, label: 'No data' },
                spendTrend: { direction: 'stable', pctChange: 0, label: 'No data' },
                healthScore: 0, healthGrade: 'red' as const, healthFactors: {},
                healthSummary: 'No insights data available',
                daysSinceNewCreative: null, recentAlertCount: 0, pendingDecisions: 0,
              };
            }

            const metrics = parseInsightMetrics(aggregateRow);
            const dailyMetrics = dailyRows.map((d: any) => parseInsightMetrics(d));

            // Compute trends from daily data
            const roasTrend = computeTrend(dailyMetrics.map((m: any) => m.roas));
            const cpaTrend = computeTrend(dailyMetrics.map((m: any) => m.cpa));
            const spendTrend = computeTrend(dailyMetrics.map((m: any) => m.spend));

            // SQLite supplementary data
            const sprintData = sprintMap.get(acc.account_id) || sprintMap.get(accountId);
            const alertData = alertMap.get(acc.account_id) || alertMap.get(accountId);
            const decisionData = decisionMap.get(acc.account_id) || decisionMap.get(accountId);

            let daysSinceNewCreative: number | null = null;
            let completionRate = -1;
            if (sprintData) {
              daysSinceNewCreative = Math.floor((Date.now() - new Date(sprintData.latest_sprint).getTime()) / 86400000);
              completionRate = sprintData.total_sprints > 0 ? (sprintData.completed_sprints / sprintData.total_sprints) * 100 : 0;
            }

            const recentAlertCount = alertData?.alert_count ?? 0;
            const maxSeverity = alertData?.max_severity ?? 0;
            const pendingDecisions = decisionData?.pending_count ?? 0;

            // Compute health score
            const factors = computeHealthFactors(metrics, roasTrend, cpaTrend, spendTrend, daysSinceNewCreative, completionRate, maxSeverity, recentAlertCount, pendingDecisions);
            const healthScore = factors.roasScore + factors.cpaScore + factors.budgetPacingScore + factors.creativeFreshnessScore + factors.pipelineHealthScore + factors.alertSeverityScore;
            const healthGrade = healthScore >= 80 ? 'green' : healthScore >= 50 ? 'yellow' : 'red';
            const healthSummary = buildHealthSummary(factors, metrics, roasTrend, cpaTrend, daysSinceNewCreative);

            return {
              accountId, accountName: acc.name || 'Unnamed', businessName: acc.business_name || '',
              currency: acc.currency || 'USD',
              spend: round(metrics.spend, 2), revenue: round(metrics.revenue, 2),
              roas: round(metrics.roas, 2), cpa: round(metrics.cpa, 2),
              ctr: round(metrics.ctr, 2), conversions: metrics.conversions,
              roasTrend, cpaTrend, spendTrend,
              healthScore, healthGrade, healthFactors: factors,
              healthSummary, daysSinceNewCreative, recentAlertCount, pendingDecisions,
            };
          })
        );

        for (const r of results) {
          if (r.status === 'fulfilled') {
            accountResults.push(r.value);
          }
        }
      }

      // Portfolio summary
      const totalSpend = accountResults.reduce((s, a) => s + a.spend, 0);
      const totalRevenue = accountResults.reduce((s, a) => s + a.revenue, 0);
      const validRoas = accountResults.filter(a => a.spend > 0);
      const avgRoas = validRoas.length > 0 ? round(validRoas.reduce((s, a) => s + a.roas, 0) / validRoas.length, 2) : 0;
      const avgHealthScore = accountResults.length > 0 ? Math.round(accountResults.reduce((s, a) => s + a.healthScore, 0) / accountResults.length) : 0;
      const needsAttention = accountResults.filter(a => a.healthGrade === 'red').length;

      const response = {
        success: true,
        portfolio: {
          totalSpend: round(totalSpend, 2), totalRevenue: round(totalRevenue, 2),
          avgRoas, totalAccounts: accountResults.length, needsAttention, avgHealthScore,
        },
        accounts: accountResults,
      };

      portfolioCache.set(userId, { data: response, ts: Date.now() });
      return response;
    } catch (err: any) {
      if (err.message?.includes('too many calls') || err.message?.includes('rate') || err.message?.includes('limit')) {
        logger.error({ err: err.message }, 'portfolio-health rate limited');
        return reply.status(429).send({ success: false, error: 'Meta API rate limited. Wait a few minutes and refresh.' });
      }
      return internalError(reply, err, 'ad-accounts/portfolio-health failed');
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

function computeHealthFactors(
  metrics: any, roasTrend: any, cpaTrend: any, spendTrend: any,
  daysSinceNewCreative: number | null, completionRate: number,
  maxSeverity: number, recentAlertCount: number, pendingDecisions: number,
) {
  // ROAS Health (0-25)
  let roasScore = 0;
  if (metrics.roas >= 3) roasScore = 20;
  else if (metrics.roas >= 2) roasScore = 15;
  else if (metrics.roas >= 1) roasScore = 10;
  else if (metrics.roas > 0) roasScore = 5;
  if (roasTrend.direction === 'improving') roasScore = Math.min(25, roasScore + 5);
  else if (roasTrend.direction === 'declining') roasScore = Math.max(0, roasScore - 5);

  // CPA Health (0-20)
  let cpaScore = 0;
  if (metrics.conversions > 0) {
    cpaScore = 15;
    if (cpaTrend.direction === 'declining') cpaScore = 20; // declining CPA = improving
    else if (cpaTrend.direction === 'improving') cpaScore = 10; // improving CPA = worsening
  } else {
    cpaScore = 5;
  }

  // Budget Pacing (0-15)
  let budgetPacingScore = 0;
  if (metrics.spend > 0) {
    if (spendTrend.direction === 'stable' || spendTrend.direction === 'improving') budgetPacingScore = 15;
    else budgetPacingScore = 10;
  }

  // Creative Freshness (0-20)
  let creativeFreshnessScore = 10; // default when no data
  if (daysSinceNewCreative !== null) {
    if (daysSinceNewCreative <= 7) creativeFreshnessScore = 20;
    else if (daysSinceNewCreative <= 14) creativeFreshnessScore = 15;
    else if (daysSinceNewCreative <= 30) creativeFreshnessScore = 10;
    else if (daysSinceNewCreative <= 60) creativeFreshnessScore = 5;
    else creativeFreshnessScore = 0;
  }

  // Pipeline Health (0-10)
  let pipelineHealthScore = 5; // default
  if (completionRate >= 0) {
    if (completionRate >= 80) pipelineHealthScore = 10;
    else if (completionRate >= 50) pipelineHealthScore = 7;
    else pipelineHealthScore = 3;
  }

  // Alert Severity (0-10)
  let alertSeverityScore = 10;
  if (maxSeverity >= 4) alertSeverityScore = 0; // critical
  else if (maxSeverity >= 3) alertSeverityScore = 3; // high
  else if (maxSeverity >= 2) alertSeverityScore = 6; // medium
  else if (recentAlertCount > 0) alertSeverityScore = 8; // low
  if (pendingDecisions > 3) alertSeverityScore = Math.max(0, alertSeverityScore - 3);

  return { roasScore, cpaScore, budgetPacingScore, creativeFreshnessScore, pipelineHealthScore, alertSeverityScore };
}

function buildHealthSummary(
  factors: any, metrics: any, roasTrend: any, cpaTrend: any, daysSinceNewCreative: number | null,
): string {
  const issues: string[] = [];

  if (metrics.spend > 0 && metrics.roas === 0) {
    issues.push('spending with no tracked revenue');
  } else if (factors.roasScore < 15 && metrics.roas > 0) {
    const dir = roasTrend.direction === 'declining' ? `declining ${Math.round(Math.abs(roasTrend.pctChange))}%` : `at ${metrics.roas.toFixed(1)}x`;
    issues.push(`ROAS ${dir}`);
  }
  if (factors.cpaScore < 15 && metrics.conversions > 0) {
    issues.push(`CPA ${cpaTrend.direction === 'improving' ? 'rising' : 'unstable'}`);
  }
  if (factors.creativeFreshnessScore <= 5 && daysSinceNewCreative !== null) {
    issues.push(`no new creatives in ${daysSinceNewCreative}d`);
  }
  if (factors.budgetPacingScore < 10) {
    issues.push('spend declining');
  }
  if (factors.alertSeverityScore < 5) {
    issues.push('critical alerts pending');
  }

  if (issues.length === 0) return 'All metrics healthy';
  return issues.join(', ');
}
