import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index.js';
import { decryptToken } from '../services/token-crypto.js';
import { MetaApiService } from '../services/meta-api.js';
import { parseInsightMetrics, parseCampaignBreakdown, parseAudienceBreakdown } from '../services/insights-parser.js';
import { round, fmt, fmtInt, setCurrency } from '../services/format-helpers.js';
import { assessConfidence } from '../services/trend-analyzer.js';
import type { MetaTokenRow, ReportRow, UserRow } from '../types/index.js';
import { validate, reportGenerateSchema, reportWeeklySchema } from '../validation/schemas.js';
import { extractText } from '../utils/claude-helpers.js';
import { logger } from '../utils/logger.js';
import { internalError } from '../utils/error-response.js';
import { safeJsonParse } from '../utils/safe-json.js';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import cron from 'node-cron';

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

/* ------------------------------------------------------------------ */
/*  Helper: get user's decrypted Meta token                           */
/* ------------------------------------------------------------------ */
function getUserMetaToken(userId: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(userId) as MetaTokenRow | undefined;
  if (!row) return null;
  return decryptToken(row.encrypted_access_token);
}

/* ------------------------------------------------------------------ */
/*  Narrative generation per report type                               */
/* ------------------------------------------------------------------ */
function datePresetLabel(preset: string): string {
  const map: Record<string, string> = {
    last_7d: 'this week', last_14d: 'last 14 days', last_30d: 'last 30 days',
    this_month: 'this month', last_month: 'last month',
  };
  return map[preset] || preset.replace(/_/g, ' ');
}

function generatePerformanceNarrative(kpis: any, campaigns: any[], datePreset: string): any {
  const period = datePresetLabel(datePreset);
  const totalAccountSpend = kpis.spend || 0;

  // Assess confidence for each campaign
  const assessed = campaigns.map((c: any) => ({
    ...c,
    confidence: assessConfidence({
      spend: c.spend || 0,
      totalAccountSpend,
      conversions: c.conversions || 0,
      impressions: c.impressions || 0,
    }),
  }));

  const sorted = [...assessed].sort((a, b) => (b.roas || 0) - (a.roas || 0));
  const topCampaign = sorted[0];
  const worstCampaign = sorted[sorted.length - 1];
  const totalCampaigns = campaigns.length;

  let topAdvice = '';
  if (topCampaign) {
    if (topCampaign.confidence.shouldRecommendAction) {
      topAdvice = ` Top performer '${topCampaign.label}' at ${(topCampaign.roas || 0).toFixed(2)}x — scale this by 15-20%.`;
    } else {
      topAdvice = ` '${topCampaign.label}' leads at ${(topCampaign.roas || 0).toFixed(2)}x but with limited data (${topCampaign.conversions || 0} conversions) — let it run longer before scaling.`;
    }
  }

  const executive_summary = `${period.charAt(0).toUpperCase() + period.slice(1)} you invested ${fmt(kpis.spend)} across ${totalCampaigns} campaign${totalCampaigns !== 1 ? 's' : ''}, generating ${fmt(kpis.revenue)} at ${kpis.roas.toFixed(2)}x ROAS.${topAdvice}`;

  const key_takeaways: string[] = [];
  if (topCampaign && topCampaign.roas > 3 && topCampaign.confidence.shouldRecommendAction) {
    key_takeaways.push(`Scale '${topCampaign.label}' — at ${topCampaign.roas.toFixed(2)}x ROAS with ${topCampaign.conversions || 0} conversions, it's reliably profitable. Increase budget by 15-20%.`);
  } else if (topCampaign && topCampaign.roas > 3 && !topCampaign.confidence.shouldRecommendAction) {
    key_takeaways.push(`'${topCampaign.label}' shows ${topCampaign.roas.toFixed(2)}x ROAS — promising but based on ${topCampaign.conversions || 0} conversions. Wait for 20+ conversions before scaling.`);
  }
  if (worstCampaign && worstCampaign.roas < 1 && worstCampaign.spend > 0 && worstCampaign.confidence.shouldRecommendAction) {
    key_takeaways.push(`Pause or restructure '${worstCampaign.label}' — at ${worstCampaign.roas.toFixed(2)}x ROAS it's losing money (${fmt(worstCampaign.spend)} spent, ${worstCampaign.conversions || 0} conversions).`);
  }
  if (kpis.ctr < 1 && kpis.impressions > 1000) {
    key_takeaways.push(`Overall CTR is ${kpis.ctr.toFixed(2)}% — below the 1% benchmark. Refresh creatives across campaigns.`);
  }
  if (kpis.roas >= 3) {
    key_takeaways.push(`Strong ${kpis.roas.toFixed(2)}x overall ROAS — you're profitable. Focus on scaling top performers.`);
  }
  if (key_takeaways.length === 0) {
    key_takeaways.push(`Monitor performance closely. Current ROAS of ${kpis.roas.toFixed(2)}x ${kpis.roas >= 1 ? 'is above breakeven' : 'is below breakeven — review targeting and creatives'}.`);
  }

  const campaign_narratives = assessed.slice(0, 5).map((c: any) => {
    let verdict: string;
    if (!c.confidence.shouldRecommendAction) {
      verdict = `${(c.roas || 0).toFixed(2)}x ROAS on ${c.conversions || 0} conversions — insufficient data to judge`;
    } else if ((c.roas || 0) >= 3) {
      verdict = 'Top performer — scale';
    } else if ((c.roas || 0) >= 1) {
      verdict = 'Profitable — maintain';
    } else {
      verdict = 'Below breakeven — review';
    }
    return {
      name: c.label,
      spend: fmt(c.spend || 0),
      roas: (c.roas || 0).toFixed(2) + 'x',
      cpa: fmt(c.cpa || 0),
      conversions: c.conversions || 0,
      verdict,
    };
  });

  return { executive_summary, campaign_narratives, key_takeaways };
}

function generateCreativeNarrative(topAds: any[]): any {
  const sorted = [...topAds].sort((a, b) => (b.metrics?.roas || 0) - (a.metrics?.roas || 0));
  const winner = sorted[0];
  const totalAds = topAds.length;
  const videoCount = topAds.filter(a => a.object_type === 'VIDEO').length;

  const executive_summary = winner
    ? `Analyzed ${totalAds} creatives. Top performer '${winner.name}' drives ${winner.metrics.roas.toFixed(2)}x ROAS at ${winner.metrics.ctr.toFixed(2)}% CTR. ${videoCount > 0 ? `${videoCount} video vs ${totalAds - videoCount} static ads active.` : 'All static ads — consider adding video.'}`
    : `No creative performance data available.`;

  const key_takeaways: string[] = [];
  if (winner) {
    key_takeaways.push(`Create 3-5 variations of '${winner.name}' — it has your highest ROAS at ${winner.metrics.roas.toFixed(2)}x.`);
  }
  const fatigued = topAds.filter(a => (a.metrics?.ctr || 0) < 0.5 && (a.metrics?.spend || 0) > 100);
  if (fatigued.length > 0) {
    key_takeaways.push(`${fatigued.length} creatives showing fatigue (CTR < 0.5%). Consider pausing: ${fatigued.slice(0, 3).map((a: any) => `'${a.name}'`).join(', ')}.`);
  }
  if (key_takeaways.length === 0) {
    key_takeaways.push('Creative performance is adequate. Test new hook styles and formats to find breakthrough winners.');
  }

  return { executive_summary, key_takeaways };
}

function generateAudienceNarrative(breakdown: any[]): any {
  if (!breakdown || breakdown.length === 0) {
    return {
      executive_summary: 'No audience breakdown data available for this period.',
      key_takeaways: ['Ensure the Meta pixel is properly installed to capture audience data.'],
    };
  }

  const sorted = [...breakdown].sort((a, b) => (b.spend || 0) - (a.spend || 0));
  const topSegment = sorted[0];
  const totalSpend = breakdown.reduce((s, a) => s + (a.spend || 0), 0);
  const topShare = totalSpend > 0 ? ((topSegment.spend || 0) / totalSpend * 100).toFixed(0) : '0';

  const executive_summary = `${breakdown.length} audience segments analyzed. Top segment '${topSegment.label}' accounts for ${topShare}% of spend (${fmt(topSegment.spend || 0)}).`;

  const key_takeaways: string[] = [];
  if (Number(topShare) > 60) {
    key_takeaways.push(`'${topSegment.label}' consumes ${topShare}% of budget — diversify targeting to reduce concentration risk.`);
  }
  const lowPerformers = breakdown.filter(a => (a.roas || 0) < 1 && (a.spend || 0) > 0);
  if (lowPerformers.length > 0) {
    key_takeaways.push(`${lowPerformers.length} segments below breakeven ROAS. Consider excluding: ${lowPerformers.slice(0, 3).map((a: any) => `'${a.label}'`).join(', ')}.`);
  }
  if (key_takeaways.length === 0) {
    key_takeaways.push('Audience targeting appears balanced. Test expanding top-performing segments with lookalikes.');
  }

  return { executive_summary, key_takeaways };
}

/* ------------------------------------------------------------------ */
/*  Report templates                                                   */
/* ------------------------------------------------------------------ */
const REPORT_TEMPLATES = [
  {
    id: 'weekly-performance',
    name: 'Weekly Performance Summary',
    type: 'performance',
    description: 'Key metrics overview: ROAS, CPA, spend, revenue for the past week',
    sections: ['kpis', 'trends', 'top-campaigns'],
  },
  {
    id: 'creative-analysis',
    name: 'Creative Performance Report',
    type: 'creative',
    description: 'Top performing ads, creative fatigue analysis, format breakdown',
    sections: ['top-ads', 'format-analysis', 'recommendations'],
  },
  {
    id: 'audience-insights',
    name: 'Audience Breakdown Report',
    type: 'audience',
    description: 'Demographics, age/gender performance, audience segment analysis',
    sections: ['demographics', 'segments', 'targeting'],
  },
  {
    id: 'monthly-client',
    name: 'Monthly Client Report',
    type: 'full',
    description: 'Comprehensive monthly report with all metrics, suitable for client presentations',
    sections: ['kpis', 'trends', 'top-ads', 'demographics', 'recommendations'],
  },
  {
    id: 'roas-deep-dive',
    name: 'ROAS Deep Dive',
    type: 'performance',
    description: 'Detailed ROAS analysis by campaign, adset, and creative',
    sections: ['roas-by-campaign', 'roas-trends', 'top-performers'],
  },
];

/* ------------------------------------------------------------------ */
/*  Data-fetching helpers                                              */
/* ------------------------------------------------------------------ */
async function fetchPerformanceData(meta: MetaApiService, accountId: string, datePreset: string) {
  // Account-level KPIs
  const kpiData = await meta.get<any>(`/${accountId}/insights`, {
    fields: 'spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas',
    date_preset: datePreset,
  });

  const kpiRow = kpiData.data?.[0] || {};
  const kpis = parseInsightMetrics(kpiRow);

  // Campaign breakdown
  const campaignData = await meta.get<any>(`/${accountId}/insights`, {
    fields: 'campaign_name,spend,impressions,clicks,ctr,actions,action_values,purchase_roas',
    level: 'campaign',
    date_preset: datePreset,
    limit: '100',
  });

  const campaigns = parseCampaignBreakdown(campaignData.data || []);

  return {
    kpis: {
      spend: round(kpis.spend, 2),
      revenue: round(kpis.revenue, 2),
      roas: round(kpis.roas, 2),
      cpa: round(kpis.cpa, 2),
      ctr: round(kpis.ctr, 2),
      impressions: kpis.impressions,
      clicks: kpis.clicks,
      conversions: kpis.conversions,
    },
    campaigns,
  };
}

async function fetchCreativeData(meta: MetaApiService, accountId: string, datePreset: string) {
  const adsData = await meta.get<any>(`/${accountId}/ads`, {
    fields: `id,name,creative{thumbnail_url,object_type},insights.date_preset(${datePreset}){spend,impressions,clicks,ctr,actions,action_values,purchase_roas}`,
    limit: '20',
    filtering: JSON.stringify([
      { field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] },
    ]),
  });

  const ads = (adsData.data || []).map((ad: any) => {
    const insight = ad.insights?.data?.[0] || {};
    const m = parseInsightMetrics(insight);
    const creative = ad.creative || {};
    return {
      id: ad.id,
      name: ad.name || 'Unnamed Ad',
      object_type: creative.object_type || 'IMAGE',
      thumbnail_url: creative.thumbnail_url || '',
      metrics: {
        spend: round(m.spend, 2),
        roas: round(m.roas, 2),
        cpa: round(m.cpa, 2),
        ctr: round(m.ctr, 2),
        impressions: m.impressions,
        clicks: m.clicks,
        conversions: m.conversions,
      },
    };
  });

  // Sort by spend descending to get top performers
  ads.sort((a: any, b: any) => b.metrics.spend - a.metrics.spend);

  return { top_ads: ads };
}

async function fetchAudienceData(meta: MetaApiService, accountId: string, datePreset: string) {
  const audienceData = await meta.get<any>(`/${accountId}/insights`, {
    fields: 'spend,impressions,clicks,actions,action_values,purchase_roas',
    breakdowns: 'age,gender',
    date_preset: datePreset,
    limit: '100',
  });

  const breakdown = parseAudienceBreakdown(audienceData.data || []);

  return { audience_breakdown: breakdown };
}

/* ------------------------------------------------------------------ */
/*  Routes                                                             */
/* ------------------------------------------------------------------ */
export async function reportRoutes(app: FastifyInstance) {
  // Start weekly report cron
  startWeeklyReportCron();

  // GET /reports/templates
  app.get('/templates', { preHandler: [app.authenticate] }, async () => {
    return { success: true, templates: REPORT_TEMPLATES };
  });

  // GET /reports/list
  app.get('/list', { preHandler: [app.authenticate] }, async (request) => {
    const { limit = '50', offset = '0' } = request.query as { limit?: string; offset?: string };
    const limitNum = Math.min(parseInt(limit, 10) || 50, 100); // Max 100 per page
    const offsetNum = parseInt(offset, 10) || 0;

    const db = getDb();

    // Get total count for pagination
    const countRow = db.prepare('SELECT COUNT(*) as total FROM reports WHERE user_id = ?').get(request.user.id) as { total: number };

    const reports = db.prepare(
      'SELECT * FROM reports WHERE user_id = ? ORDER BY generated_at DESC LIMIT ? OFFSET ?'
    ).all(request.user.id, limitNum, offsetNum) as ReportRow[];

    return {
      success: true,
      pagination: {
        total: countRow.total,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + reports.length < countRow.total,
      },
      reports: reports.map(r => {
        const parsedData = safeJsonParse(r.data, null);
        const dataSize = r.data ? Buffer.byteLength(r.data, 'utf-8') : 0;
        return {
          id: r.id,
          name: r.title,
          type: r.type || 'performance',
          dateRange: r.date_preset || 'last_7d',
          status: r.status,
          createdAt: r.generated_at,
          size: formatBytes(dataSize),
          data: parsedData,
        };
      }),
    };
  });

  // POST /reports/generate-weekly — manually trigger weekly strategy report
  app.post('/generate-weekly', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(reportWeeklySchema, request.body, reply);
    if (!parsed) return;
    const account_id = parsed.account_id;

    const token = getUserMetaToken(request.user.id);
    if (!token) {
      return reply.status(200).send({ success: false, error: 'Meta account not connected' });
    }

    const reportContent = await generateWeeklyStrategyReport(request.user.id, account_id, token);
    if (!reportContent) {
      return reply.status(500).send({ success: false, error: 'Failed to generate weekly report' });
    }

    const db = getDb();
    const id = uuidv4();
    const title = `Weekly Strategy Report — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    const reportData = JSON.stringify({
      type: 'weekly-strategy',
      account_id,
      generated_at: new Date().toISOString(),
      strategy_report: reportContent,
      auto_generated: false,
    });

    db.prepare(
      'INSERT INTO reports (id, user_id, title, type, account_id, date_preset, status, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, request.user.id, title, 'weekly-strategy', account_id, 'last_7d', 'Ready', reportData);

    return { success: true, report_id: id, strategy_report: reportContent };
  });

  // POST /reports/generate
  app.post('/generate', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(reportGenerateSchema, request.body, reply);
    if (!parsed) return;

    const {
      name,
      type,
      date_range,
      brand,
      sections,
      include_branding,
      include_ai_summary,
      account_id,
      credential_group,
    } = parsed;

    const db = getDb();
    const id = uuidv4();
    const reportName = name || `${type.charAt(0).toUpperCase() + type.slice(1)} Report — ${new Date().toLocaleDateString()}`;

    try {
      const token = getUserMetaToken(request.user.id);
      if (!token) {
        return reply.status(200).send({ success: false, error: 'Meta account not connected', meta_connected: false });
      }
      const meta = new MetaApiService(token);

      let reportData: any = {
        type,
        date_range,
        account_id,
        brand: brand || null,
        sections: sections || [],
        include_branding: include_branding ?? false,
        include_ai_summary: include_ai_summary ?? false,
        generated_at: new Date().toISOString(),
      };

      // Detect account currency from account metadata
      try {
        const accInfo = await meta.get<any>(`/${account_id}`, { fields: 'currency' });
        if (accInfo?.currency) setCurrency(accInfo.currency);
      } catch (err) {
        logger.debug({ err: err instanceof Error ? err.message : err, account_id }, 'Currency detection failed, using default');
      }

      // Fetch real data based on report type and generate narratives
      switch (type) {
        case 'performance': {
          const perfData = await fetchPerformanceData(meta, account_id, date_range);
          const narrative = generatePerformanceNarrative(perfData.kpis, perfData.campaigns, date_range);
          reportData = { ...reportData, ...perfData, narrative };
          break;
        }
        case 'creative': {
          const creativeData = await fetchCreativeData(meta, account_id, date_range);
          const narrative = generateCreativeNarrative(creativeData.top_ads);
          reportData = { ...reportData, ...creativeData, narrative };
          break;
        }
        case 'audience': {
          const audienceData = await fetchAudienceData(meta, account_id, date_range);
          const narrative = generateAudienceNarrative(audienceData.audience_breakdown);
          reportData = { ...reportData, ...audienceData, narrative };
          break;
        }
        case 'full': {
          // Fetch all data types in parallel
          const [perfData, creativeData, audienceData] = await Promise.all([
            fetchPerformanceData(meta, account_id, date_range),
            fetchCreativeData(meta, account_id, date_range),
            fetchAudienceData(meta, account_id, date_range),
          ]);
          const narrative = {
            performance: generatePerformanceNarrative(perfData.kpis, perfData.campaigns, date_range),
            creative: generateCreativeNarrative(creativeData.top_ads),
            audience: generateAudienceNarrative(audienceData.audience_breakdown),
          };
          reportData = { ...reportData, ...perfData, ...creativeData, ...audienceData, narrative };
          break;
        }
        default: {
          // Default to performance
          const defaultData = await fetchPerformanceData(meta, account_id, date_range);
          const narrative = generatePerformanceNarrative(defaultData.kpis, defaultData.campaigns, date_range);
          reportData = { ...reportData, ...defaultData, narrative };
        }
      }

      const dataJson = JSON.stringify(reportData);
      const dataSize = formatBytes(Buffer.byteLength(dataJson, 'utf-8'));

      db.prepare(
        'INSERT INTO reports (id, user_id, title, type, account_id, date_preset, status, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(id, request.user.id, reportName, type, account_id, date_range, 'Ready', dataJson);

      return { success: true, report_id: id, size: dataSize };
    } catch (err: any) {
      // Still save the report but mark as failed
      db.prepare(
        'INSERT INTO reports (id, user_id, title, type, account_id, date_preset, status, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(id, request.user.id, reportName, type, account_id, date_range, 'Failed', JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));

      return internalError(reply, err, 'reports/generate failed');
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Weekly strategy report — auto-generated via Claude                 */
/* ------------------------------------------------------------------ */

async function generateWeeklyStrategyReport(userId: string, accountId: string, token: string): Promise<string | null> {
  try {
    const meta = new MetaApiService(token);

    // Detect currency
    try {
      const accInfo = await meta.get<any>(`/${accountId}`, { fields: 'currency' });
      if (accInfo?.currency) setCurrency(accInfo.currency);
    } catch (err) {
      logger.debug({ err: err instanceof Error ? err.message : err, accountId }, 'Currency detection failed, using default');
    }

    // Fetch this week + last week for comparison
    const [thisWeekData, lastWeekData, campaignData, dailyData] = await Promise.all([
      meta.get<any>(`/${accountId}/insights`, {
        fields: 'spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas',
        date_preset: 'last_7d',
        level: 'account',
      }),
      meta.get<any>(`/${accountId}/insights`, {
        fields: 'spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas',
        date_preset: 'last_14d',
        level: 'account',
      }),
      meta.get<any>(`/${accountId}/insights`, {
        fields: 'campaign_name,spend,impressions,clicks,ctr,actions,action_values,purchase_roas',
        level: 'campaign',
        date_preset: 'last_7d',
        limit: '50',
      }),
      meta.get<any>(`/${accountId}/insights`, {
        fields: 'spend,purchase_roas,actions,action_values,ctr',
        date_preset: 'last_7d',
        time_increment: '1',
        level: 'account',
      }),
    ]);

    const thisWeek = parseInsightMetrics(thisWeekData.data?.[0] || {});
    const lastWeekRaw = parseInsightMetrics(lastWeekData.data?.[0] || {});
    const campaigns = parseCampaignBreakdown(campaignData.data || []);
    const dailyRows = (dailyData.data || []).map((d: any) => ({ date: d.date_start, ...parseInsightMetrics(d) }));

    const sorted = [...campaigns].sort((a, b) => b.roas - a.roas);
    const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
    const profitable = campaigns.filter(c => c.roas >= 1 && c.spend > 0);
    const unprofitable = campaigns.filter(c => c.roas < 1 && c.spend > 0);
    const wastedSpend = unprofitable.reduce((s, c) => s + c.spend, 0);

    const dataContext = {
      this_week: { spend: thisWeek.spend, revenue: thisWeek.revenue, roas: thisWeek.roas, cpa: thisWeek.cpa, ctr: thisWeek.ctr, conversions: thisWeek.conversions, impressions: thisWeek.impressions },
      comparison: {
        spend_change: thisWeek.spend - lastWeekRaw.spend,
        roas_change: thisWeek.roas - lastWeekRaw.roas,
        cpa_change: thisWeek.cpa - lastWeekRaw.cpa,
      },
      top_campaigns: sorted.slice(0, 5).map(c => ({
        name: c.label, roas: c.roas, spend: c.spend, cpa: c.cpa, conversions: c.conversions,
        confidence: assessConfidence({ spend: c.spend, totalAccountSpend: totalSpend, conversions: c.conversions, impressions: c.impressions }),
      })),
      worst_campaigns: [...unprofitable].sort((a, b) => a.roas - b.roas).slice(0, 3).map(c => ({
        name: c.label, roas: c.roas, spend: c.spend,
      })),
      summary: {
        total_campaigns: campaigns.filter(c => c.spend > 0).length,
        profitable: profitable.length, unprofitable: unprofitable.length,
        wasted_spend: wastedSpend, total_spend: totalSpend,
      },
      daily_trend: dailyRows.map((d: any) => ({ date: d.date, roas: round(d.roas, 2), spend: round(d.spend, 2) })),
    };

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      temperature: 0.5,
      system: `You are Cosmisk's AI strategist writing a weekly strategy report for a Meta Ads manager. Write a professional but conversational report.

Structure:
1. **Executive Summary** (2-3 sentences: what happened this week, overall health)
2. **What Worked** (campaigns/segments that performed well, with specific numbers)
3. **What Didn't Work** (underperformers, wasted spend, with amounts)
4. **Key Trends** (improving/declining metrics, directional insights)
5. **Action Items for This Week** (3-5 specific things to do, prioritized)

Rules:
- Use actual campaign names and computed amounts
- Assess data confidence for recommendations
- Be specific, not generic
- Write like a strategist talking to a client
- Use currency consistent with the data`,
      messages: [{ role: 'user', content: `Generate weekly strategy report:\n${JSON.stringify(dataContext, null, 2)}` }],
    });

    return extractText(response) || null;
  } catch (err: any) {
    logger.error({ err: err.message }, `Weekly report generation failed for account ${accountId}`);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Weekly report cron — every Monday at 7 AM UTC                      */
/* ------------------------------------------------------------------ */

let weeklyReportCronStarted = false;

function startWeeklyReportCron() {
  if (weeklyReportCronStarted) return;
  weeklyReportCronStarted = true;

  cron.schedule('0 7 * * 1', async () => {
    const MAX_BATCH_SIZE = 50;
    const DELAY_BETWEEN_USERS_MS = 2000;

    logger.info('[Weekly Reports] Starting generation...');
    const db = getDb();

    const users = db.prepare(`
      SELECT u.id, u.name, u.email FROM users u
      WHERE u.onboarding_complete = 1
      AND EXISTS (SELECT 1 FROM meta_tokens mt WHERE mt.user_id = u.id)
    `).all() as Pick<UserRow, 'id' | 'name' | 'email'>[];

    const totalEligible = users.length;
    const batch = users.slice(0, MAX_BATCH_SIZE);
    const skipped = totalEligible - batch.length;

    if (skipped > 0) {
      logger.warn(`[Weekly Reports] ${totalEligible} eligible users, processing ${batch.length}, skipping ${skipped} (batch limit ${MAX_BATCH_SIZE})`);
    }

    let generated = 0;
    let processed = 0;

    for (const user of batch) {
      try {
        // Delay between users to avoid overwhelming external APIs (Anthropic, Meta)
        if (processed > 0) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_USERS_MS));
        }
        processed++;

        const tokenRow = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(user.id) as MetaTokenRow | undefined;
        if (!tokenRow) continue;

        const token = decryptToken(tokenRow.encrypted_access_token);
        const meta = new MetaApiService(token);

        // Get first active ad account
        const accountsResp = await meta.get<any>('/me/adaccounts', { fields: 'id,name', limit: '5' });
        const accounts = accountsResp.data || [];
        if (accounts.length === 0) continue;

        for (const account of accounts.slice(0, 3)) { // Max 3 accounts per user
          const reportContent = await generateWeeklyStrategyReport(user.id, account.id, token);
          if (!reportContent) continue;

          const id = uuidv4();
          const title = `Weekly Strategy Report — ${account.name || account.id} — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

          const reportData = JSON.stringify({
            type: 'weekly-strategy',
            account_id: account.id,
            account_name: account.name,
            generated_at: new Date().toISOString(),
            strategy_report: reportContent,
            auto_generated: true,
          });

          db.prepare(
            'INSERT INTO reports (id, user_id, title, type, account_id, date_preset, status, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(id, user.id, title, 'weekly-strategy', account.id, 'last_7d', 'Ready', reportData);

          generated++;
        }
      } catch (err: any) {
        logger.error({ err: err.message }, `Weekly report failed for user ${user.id}`);
      }
    }

    logger.info(`[Weekly Reports] Done — ${generated} reports generated, ${processed}/${totalEligible} users processed, ${skipped} skipped.`);
  });

  logger.info('[Weekly Reports] Cron scheduled for Monday 7:00 AM UTC');
}

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${round(value, 1)} ${units[i]}`;
}
