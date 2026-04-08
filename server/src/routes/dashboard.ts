import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import { decryptToken } from '../services/token-crypto.js';
import { MetaApiService } from '../services/meta-api.js';
import { parseChartData, parseInsightMetrics } from '../services/insights-parser.js';
import { fmt, setCurrency } from '../services/format-helpers.js';
import { computeTrend, assessConfidence } from '../services/trend-analyzer.js';
import type { MetaTokenRow, InsightItem } from '../types/index.js';
import { validate, accountQuerySchema, accountIdQuerySchema } from '../validation/schemas.js';
import { internalError } from '../utils/error-response.js';
import { logger } from '../utils/logger.js';

interface CountRow {
  c: number;
}

interface StatusCountRow {
  status: string;
  c: number;
}

function getUserMetaToken(userId: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(userId) as MetaTokenRow | undefined;
  if (!row) return null;
  return decryptToken(row.encrypted_access_token);
}

export async function dashboardRoutes(app: FastifyInstance) {

  // GET /dashboard/chart
  app.get('/chart', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(accountQuerySchema, request.query, reply);
    if (!parsed) return;
    const { account_id, date_preset } = parsed;

    if (!account_id) {
      return reply.status(400).send({ success: false, error: 'account_id required' });
    }

    try {
      const token = getUserMetaToken(request.user.id);
      if (!token) {
        return reply.status(200).send({ success: true, chart: [], meta_connected: false });
      }
      const meta = new MetaApiService(token);

      const data = await meta.get<any>(`/${account_id}/insights`, {
        fields: 'spend,impressions,clicks,ctr,actions,action_values,purchase_roas',
        time_increment: '1',
        date_preset,
        level: 'account',
      });

      const chart = parseChartData(data.data || []);
      return { success: true, chart };
    } catch (err: any) {
      return internalError(reply, err, 'dashboard/chart failed');
    }
  });

  // GET /dashboard/insights
  app.get('/insights', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(accountIdQuerySchema, request.query, reply);
    if (!parsed) return;
    const { account_id } = parsed;

    if (!account_id) {
      return reply.status(400).send({ success: false, error: 'account_id required' });
    }

    try {
      const token = getUserMetaToken(request.user.id);
      if (!token) {
        return reply.status(200).send({ success: true, insights: [], meta_connected: false });
      }
      const meta = new MetaApiService(token);

      // Detect currency
      try {
        const accInfo = await meta.get<any>(`/${account_id}`, { fields: 'currency' });
        if (accInfo?.currency) setCurrency(accInfo.currency);
      } catch (err) {
        logger.debug({ err: err instanceof Error ? err.message : err, account_id }, 'Currency detection failed, using default');
      }

      // Get account-level + campaign-level + daily trend data in parallel
      const [last7, last14, campaignData, dailyData] = await Promise.all([
        meta.get<any>(`/${account_id}/insights`, {
          fields: 'spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas',
          date_preset: 'last_7d',
          level: 'account',
        }),
        meta.get<any>(`/${account_id}/insights`, {
          fields: 'spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas',
          date_preset: 'last_14d',
          level: 'account',
        }),
        meta.get<any>(`/${account_id}/insights`, {
          fields: 'campaign_name,spend,impressions,clicks,ctr,actions,action_values,purchase_roas',
          level: 'campaign',
          date_preset: 'last_7d',
          limit: '20',
        }),
        // Daily account-level data for trend detection
        meta.get<any>(`/${account_id}/insights`, {
          fields: 'spend,ctr,actions,action_values,purchase_roas',
          date_preset: 'last_7d',
          time_increment: '1',
          level: 'account',
        }),
      ]);

      const curr = parseInsightMetrics(last7.data?.[0] || {});
      const prev = parseInsightMetrics(last14.data?.[0] || {});

      // Compute daily trends for key metrics
      const dailyRows = (dailyData.data || []).map((d: any) => parseInsightMetrics(d));
      const roasTrend = computeTrend(dailyRows.map((d: any) => d.roas));
      const ctrTrend = computeTrend(dailyRows.map((d: any) => d.ctr));
      const spendTrend = computeTrend(dailyRows.map((d: any) => d.spend));

      // Parse campaign data for strategic context
      const campaigns = (campaignData.data || []).map((c: any) => ({
        name: c.campaign_name,
        ...parseInsightMetrics(c),
      })).sort((a: any, b: any) => b.roas - a.roas);

      const totalAccountSpend = curr.spend;

      // Assess data confidence per campaign
      const assessedCampaigns = campaigns.map((c: any) => ({
        ...c,
        confidence: assessConfidence({ spend: c.spend, totalAccountSpend, conversions: c.conversions, impressions: c.impressions }),
      }));

      const topCampaign = assessedCampaigns[0];
      const worstCampaign = assessedCampaigns.length > 1 ? assessedCampaigns[assessedCampaigns.length - 1] : null;

      const insights: InsightItem[] = [];
      const now = new Date().toISOString();

      // Generate insights with trend awareness and data confidence

      if (curr.roas > 0 && curr.roas < 1) {
        const lossCampaigns = assessedCampaigns.filter((c: any) => c.roas < 1 && c.spend > 0 && c.confidence.shouldRecommendAction);
        const lossNames = lossCampaigns.slice(0, 3).map((c: any) => `'${c.name}'`);
        const trendNote = roasTrend.direction === 'improving'
          ? ` However, ROAS is ${roasTrend.label} over the last few days — the trend is positive.`
          : roasTrend.direction === 'declining' ? ` ROAS is ${roasTrend.label} — act quickly.` : '';
        insights.push({
          id: 'low-roas',
          priority: roasTrend.direction === 'improving' ? 'medium' : 'high',
          title: 'ROAS Below Breakeven',
          description: `Overall ROAS at ${curr.roas.toFixed(2)}x — you spent ${fmt(curr.spend)} but earned only ${fmt(curr.revenue)}.${lossNames.length > 0 ? ` Losing campaigns: ${lossNames.join(', ')}.` : ''}${trendNote} ${roasTrend.direction === 'improving' ? 'Monitor closely — it may recover.' : 'Pause underperformers and redirect budget to profitable campaigns.'}`,
          actionLabel: lossCampaigns.length > 0 ? 'Pause Losers' : 'View Campaigns',
          actionRoute: '/analytics',
          actionType: lossCampaigns.length > 0 ? 'pause' as const : 'navigate' as const,
          actionPayload: lossCampaigns.length > 0 ? { campaign_names: lossNames.map((n: string) => n.replace(/'/g, '')) } : undefined,
          createdAt: now,
        });
      }

      if (curr.ctr < 1 && curr.impressions > 1000) {
        const lowCtrCampaigns = assessedCampaigns.filter((c: any) => c.ctr < 1 && c.impressions > 500).slice(0, 2);
        const trendNote = ctrTrend.direction === 'improving'
          ? ` Good news: CTR is ${ctrTrend.label} recently.`
          : ctrTrend.direction === 'declining' ? ` CTR is ${ctrTrend.label} — creative fatigue accelerating.` : '';
        insights.push({
          id: 'low-ctr',
          priority: ctrTrend.direction === 'declining' ? 'high' : 'medium',
          title: 'Low Click-Through Rate',
          description: `CTR is ${curr.ctr.toFixed(2)}% across ${campaigns.length} campaigns.${lowCtrCampaigns.length > 0 ? ` Worst: ${lowCtrCampaigns.map((c: any) => `'${c.name}' (${c.ctr.toFixed(2)}%)`).join(', ')}.` : ''}${trendNote} ${ctrTrend.direction === 'improving' ? 'Recent improvements suggest new creatives are working.' : 'Refresh creatives — test new hooks and visuals.'}`,
          actionLabel: 'Refresh Creatives',
          actionRoute: '/creative-cockpit',
          createdAt: now,
        });
      }

      if (curr.spend > 0 && prev.spend > 0) {
        const spendChange = ((curr.spend - prev.spend) / prev.spend) * 100;
        if (spendChange > 30) {
          const dailyTrendNote = spendTrend.direction === 'improving'
            ? ' Daily spend is still climbing.'
            : spendTrend.direction === 'declining' ? ' Daily spend appears to be leveling off.' : '';
          insights.push({
            id: 'spend-spike',
            priority: 'high',
            title: 'Spend Increased Significantly',
            description: `Spend up ${spendChange.toFixed(0)}% to ${fmt(curr.spend)} (was ${fmt(prev.spend)}).${topCampaign ? ` Largest spender: '${topCampaign.name}' at ${fmt(topCampaign.spend)}.` : ''}${dailyTrendNote} Verify this increase is intentional.`,
            actionLabel: 'Review Budget',
            actionRoute: '/lighthouse',
            createdAt: now,
          });
        }
      }

      if (curr.roas >= 3) {
        const trendNote = roasTrend.direction === 'declining'
          ? ` But watch out: ROAS is ${roasTrend.label} — scale cautiously.`
          : roasTrend.direction === 'improving' ? ` ROAS is ${roasTrend.label} — momentum is strong.` : '';

        // Check if top campaign's data is reliable before recommending scaling
        const topConf = topCampaign?.confidence;
        const scaleAdvice = topCampaign
          ? (topConf?.shouldRecommendAction
            ? `Scale '${topCampaign.name}' (${topCampaign.roas.toFixed(2)}x) by 15-20% to maximize returns.`
            : `'${topCampaign.name}' shows ${topCampaign.roas.toFixed(2)}x but on limited data (${topCampaign.conversions} conversions). Let it run before scaling.`)
          : '';

        insights.push({
          id: 'high-roas',
          priority: 'low',
          title: 'Strong ROAS Performance',
          description: `${curr.roas.toFixed(2)}x ROAS — ${fmt(curr.revenue)} revenue on ${fmt(curr.spend)} spend.${trendNote} ${scaleAdvice}`,
          actionLabel: 'Scale Top Campaign',
          actionRoute: '/analytics',
          actionType: topConf?.shouldRecommendAction ? 'scale' as const : 'navigate' as const,
          actionPayload: topCampaign ? { campaign_name: topCampaign.name } : undefined,
          createdAt: now,
        });
      }

      if (curr.conversions === 0 && curr.spend > 50) {
        insights.push({
          id: 'no-conversions',
          priority: 'high',
          title: 'No Conversions Recorded',
          description: `${fmt(curr.spend)} spent with zero conversions across ${campaigns.length} campaign${campaigns.length !== 1 ? 's' : ''}. Check pixel installation and verify conversion events are firing correctly.`,
          actionLabel: 'Check Setup',
          actionRoute: '/settings',
          createdAt: now,
        });
      }

      // Weekly summary with trend context — never generic
      if (insights.length === 0) {
        const summaryParts = [];
        if (curr.revenue > 0) summaryParts.push(`${fmt(curr.revenue)} revenue`);
        if (curr.roas > 0) summaryParts.push(`${curr.roas.toFixed(2)}x ROAS`);
        if (curr.conversions > 0) summaryParts.push(`${curr.conversions} conversion${curr.conversions !== 1 ? 's' : ''}`);
        const summary = summaryParts.length > 0 ? summaryParts.join(', ') : `${fmt(curr.spend)} spent`;

        // Include trend direction in summary
        const trendParts = [];
        if (roasTrend.direction !== 'stable') trendParts.push(`ROAS ${roasTrend.label}`);
        if (ctrTrend.direction !== 'stable') trendParts.push(`CTR ${ctrTrend.label}`);
        const trendSummary = trendParts.length > 0 ? ` Trends: ${trendParts.join(', ')}.` : '';

        // Top campaign advice — with confidence awareness
        let topAdvice = '';
        if (topCampaign && topCampaign.roas > 0) {
          if (topCampaign.confidence.shouldRecommendAction) {
            topAdvice = ` Top performer '${topCampaign.name}' at ${topCampaign.roas.toFixed(2)}x — ${topCampaign.roas >= 3 ? 'scale this' : 'optimize creatives to improve'}.`;
          } else {
            topAdvice = ` '${topCampaign.name}' leads at ${topCampaign.roas.toFixed(2)}x but with limited data (${topCampaign.conversions} conversions) — let it run longer.`;
          }
        }

        const worstAdvice = worstCampaign && worstCampaign.roas < curr.roas && worstCampaign.confidence.shouldRecommendAction
          ? ` Review '${worstCampaign.name}' (${worstCampaign.roas.toFixed(2)}x) for improvement opportunities.`
          : ' Look for new audiences to test.';

        insights.push({
          id: 'weekly-summary',
          priority: 'low',
          title: 'Weekly Performance Summary',
          description: `${summary} across ${campaigns.length} campaign${campaigns.length !== 1 ? 's' : ''}.${trendSummary}${topAdvice}${worstAdvice}`,
          actionLabel: 'View Analytics',
          actionRoute: '/analytics',
          createdAt: now,
        });
      }

      return { success: true, insights };
    } catch (err: any) {
      return internalError(reply, err, 'dashboard/insights failed');
    }
  });

  // GET /dashboard/kpis (UGC dashboard variant — returns project/concept/script counts)
  app.get('/kpis', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const db = getDb();
      const userId = request.user.id;

      const projectTotal = (db.prepare('SELECT COUNT(*) as c FROM ugc_projects WHERE user_id = ?').get(userId) as CountRow | undefined)?.c || 0;
      const byStatus = db.prepare('SELECT status, COUNT(*) as c FROM ugc_projects WHERE user_id = ? GROUP BY status').all(userId) as StatusCountRow[];

      const conceptTotal = (db.prepare(`SELECT COUNT(*) as c FROM ugc_concepts c JOIN ugc_projects p ON c.project_id = p.id WHERE p.user_id = ?`).get(userId) as CountRow | undefined)?.c || 0;
      const conceptApproved = (db.prepare(`SELECT COUNT(*) as c FROM ugc_concepts c JOIN ugc_projects p ON c.project_id = p.id WHERE p.user_id = ? AND c.status = 'approved'`).get(userId) as CountRow | undefined)?.c || 0;
      const conceptPending = (db.prepare(`SELECT COUNT(*) as c FROM ugc_concepts c JOIN ugc_projects p ON c.project_id = p.id WHERE p.user_id = ? AND c.status = 'pending'`).get(userId) as CountRow | undefined)?.c || 0;
      const conceptRejected = (db.prepare(`SELECT COUNT(*) as c FROM ugc_concepts c JOIN ugc_projects p ON c.project_id = p.id WHERE p.user_id = ? AND c.status = 'rejected'`).get(userId) as CountRow | undefined)?.c || 0;

      const scriptTotal = (db.prepare(`SELECT COUNT(*) as c FROM ugc_scripts s JOIN ugc_projects p ON s.project_id = p.id WHERE p.user_id = ?`).get(userId) as CountRow | undefined)?.c || 0;
      const scriptDelivered = (db.prepare(`SELECT COUNT(*) as c FROM ugc_scripts s JOIN ugc_projects p ON s.project_id = p.id WHERE p.user_id = ? AND s.status = 'delivered'`).get(userId) as CountRow | undefined)?.c || 0;
      const scriptReview = (db.prepare(`SELECT COUNT(*) as c FROM ugc_scripts s JOIN ugc_projects p ON s.project_id = p.id WHERE p.user_id = ? AND s.status = 'in_review'`).get(userId) as CountRow | undefined)?.c || 0;
      const scriptDraft = (db.prepare(`SELECT COUNT(*) as c FROM ugc_scripts s JOIN ugc_projects p ON s.project_id = p.id WHERE p.user_id = ? AND s.status = 'draft'`).get(userId) as CountRow | undefined)?.c || 0;

      const statusMap: Record<string, number> = {};
      for (const s of byStatus) statusMap[s.status] = s.c;

      return {
        projects: { total: projectTotal, by_status: statusMap },
        concepts: { total: conceptTotal, approved: conceptApproved, pending: conceptPending, rejected: conceptRejected },
        scripts: { total: scriptTotal, delivered: scriptDelivered, in_review: scriptReview, draft: scriptDraft },
        recent_projects: [],
      };
    } catch (err: any) {
      return internalError(reply, err, 'dashboard/kpis failed');
    }
  });
}
