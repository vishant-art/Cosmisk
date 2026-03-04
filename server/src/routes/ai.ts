import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import { decryptToken } from '../services/token-crypto.js';
import { MetaApiService } from '../services/meta-api.js';
import { parseInsightMetrics, parseCampaignBreakdown, parseAudienceBreakdown } from '../services/insights-parser.js';
import type { MetaTokenRow } from '../types/index.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function getUserMetaToken(userId: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(userId) as MetaTokenRow | undefined;
  if (!row) return null;
  return decryptToken(row.encrypted_access_token);
}

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function fmt(value: number): string {
  return `$${round(value, 2).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtNum(value: number): string {
  return round(value, 2).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtInt(value: number): string {
  return value.toLocaleString('en-US');
}

const INSIGHT_FIELDS = 'spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas';

/* ------------------------------------------------------------------ */
/*  Response interfaces                                               */
/* ------------------------------------------------------------------ */

interface ChartItem { label: string; value: number }
interface AiChart { type: string; data: ChartItem[] }
interface AiTable { headers: string[]; rows: string[][] }
interface AiResponse { content: string; chart?: AiChart; table?: AiTable }

/* ------------------------------------------------------------------ */
/*  Intent detection                                                  */
/* ------------------------------------------------------------------ */

type Intent =
  | 'roas'
  | 'spend'
  | 'audience'
  | 'creative'
  | 'cpa'
  | 'forecast'
  | 'help'
  | 'overview';

function detectIntent(message: string): Intent {
  const lower = message.toLowerCase();

  if (lower.includes('help') || lower.includes('what can you do')) return 'help';
  if (lower.includes('predict') || lower.includes('forecast') || lower.includes('next week') || lower.includes('project')) return 'forecast';
  if (lower.includes('audience') || lower.includes('who') || lower.includes('demographic') || lower.includes('age') || lower.includes('gender')) return 'audience';
  if (lower.includes('creative') || lower.includes('hook') || lower.includes('which ads') || lower.includes('top ads') || lower.includes('ad copy')) return 'creative';
  if (lower.includes('cpa') || lower.includes('cost per') || lower.includes('acquisition')) return 'cpa';
  if (lower.includes('roas') || lower.includes('return on') || lower.includes('performance') || lower.includes('best performing')) return 'roas';
  if (lower.includes('spend') || lower.includes('budget') || lower.includes('spending')) return 'spend';

  return 'overview';
}

/* ------------------------------------------------------------------ */
/*  Intent handlers                                                   */
/* ------------------------------------------------------------------ */

async function handleRoas(meta: MetaApiService, accountId: string, datePreset: string): Promise<AiResponse> {
  const [accountData, campaignData] = await Promise.all([
    meta.get<any>(`/${accountId}/insights`, {
      fields: INSIGHT_FIELDS,
      date_preset: datePreset,
      level: 'account',
    }),
    meta.get<any>(`/${accountId}/insights`, {
      fields: `campaign_name,${INSIGHT_FIELDS}`,
      level: 'campaign',
      date_preset: datePreset,
      limit: '50',
    }),
  ]);

  const acct = parseInsightMetrics(accountData.data?.[0] || {});
  const campaigns = parseCampaignBreakdown(campaignData.data || []);
  const sorted = [...campaigns].sort((a, b) => b.roas - a.roas);
  const top5 = sorted.slice(0, 5);

  let content = `Your account-level ROAS is ${fmtNum(acct.roas)}x for the selected period (spend: ${fmt(acct.spend)}, revenue: ${fmt(acct.revenue)}).`;

  if (top5.length > 0) {
    const best = top5[0];
    const aboveAvg = acct.roas > 0 ? round(((best.roas - acct.roas) / acct.roas) * 100, 1) : 0;
    content += `\n\nYour best performing campaign is "${best.label}" with a ${fmtNum(best.roas)}x ROAS`;
    if (aboveAvg > 0) {
      content += `, which is ${aboveAvg}% above your account average`;
    }
    content += `.`;

    if (sorted.length > 1) {
      const underperformers = sorted.filter(c => c.roas < acct.roas && c.spend > 0);
      if (underperformers.length > 0) {
        content += ` Meanwhile, ${underperformers.length} campaign${underperformers.length > 1 ? 's are' : ' is'} performing below your account average ROAS and may be worth reviewing.`;
      }
    }
  } else {
    content += '\n\nNo campaign-level data is available for this period.';
  }

  const chart: AiChart = {
    type: 'bar',
    data: top5.map(c => ({ label: c.label, value: round(c.roas, 2) })),
  };

  const table: AiTable = {
    headers: ['Campaign', 'ROAS', 'Spend', 'CPA', 'CTR %', 'Conversions'],
    rows: top5.map(c => [
      c.label,
      `${fmtNum(c.roas)}x`,
      fmt(c.spend),
      fmt(c.cpa),
      fmtNum(c.ctr),
      fmtInt(c.conversions),
    ]),
  };

  return { content, chart, table };
}

async function handleSpend(meta: MetaApiService, accountId: string, datePreset: string): Promise<AiResponse> {
  const [accountData, campaignData] = await Promise.all([
    meta.get<any>(`/${accountId}/insights`, {
      fields: INSIGHT_FIELDS,
      date_preset: datePreset,
      level: 'account',
    }),
    meta.get<any>(`/${accountId}/insights`, {
      fields: `campaign_name,${INSIGHT_FIELDS}`,
      level: 'campaign',
      date_preset: datePreset,
      limit: '50',
    }),
  ]);

  const acct = parseInsightMetrics(accountData.data?.[0] || {});
  const campaigns = parseCampaignBreakdown(campaignData.data || []);
  const sorted = [...campaigns].sort((a, b) => b.spend - a.spend);
  const top5 = sorted.slice(0, 5);
  const totalCampaignSpend = campaigns.reduce((s, c) => s + c.spend, 0);

  let content = `Your total spend for the selected period is ${fmt(acct.spend)}, generating ${fmt(acct.revenue)} in revenue (${fmtNum(acct.roas)}x ROAS).`;

  if (top5.length > 0) {
    const topSpender = top5[0];
    const topPct = totalCampaignSpend > 0 ? round((topSpender.spend / totalCampaignSpend) * 100, 1) : 0;
    content += `\n\nYour highest-spend campaign is "${topSpender.label}" at ${fmt(topSpender.spend)} (${topPct}% of total spend) with a ${fmtNum(topSpender.roas)}x ROAS.`;

    const inefficient = sorted.filter(c => c.spend > 0 && c.roas < 1);
    if (inefficient.length > 0) {
      const wastedSpend = inefficient.reduce((s, c) => s + c.spend, 0);
      content += ` You have ${inefficient.length} campaign${inefficient.length > 1 ? 's' : ''} with a sub-1x ROAS, totaling ${fmt(wastedSpend)} in spend that may not be profitable.`;
    }
  }

  const chart: AiChart = {
    type: 'bar',
    data: top5.map(c => ({ label: c.label, value: round(c.spend, 2) })),
  };

  const table: AiTable = {
    headers: ['Campaign', 'Spend', 'Revenue', 'ROAS', 'CPA'],
    rows: top5.map(c => {
      const rev = c.conversions > 0 && c.cpa > 0 ? c.spend * c.roas : 0;
      return [
        c.label,
        fmt(c.spend),
        fmt(rev),
        `${fmtNum(c.roas)}x`,
        fmt(c.cpa),
      ];
    }),
  };

  return { content, chart, table };
}

async function handleAudience(meta: MetaApiService, accountId: string, datePreset: string): Promise<AiResponse> {
  const audienceData = await meta.get<any>(`/${accountId}/insights`, {
    fields: 'spend,impressions,clicks,actions,action_values,purchase_roas',
    breakdowns: 'age,gender',
    date_preset: datePreset,
    limit: '100',
  });

  const segments = parseAudienceBreakdown(audienceData.data || []);
  const sorted = [...segments].sort((a, b) => b.roas - a.roas);
  const top8 = sorted.slice(0, 8);

  let content: string;
  if (sorted.length === 0) {
    content = 'No audience breakdown data is available for the selected period. Make sure your campaigns have been running and accumulating delivery data.';
    return { content };
  }

  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const totalSpend = segments.reduce((s, seg) => s + seg.spend, 0);

  content = `Here is your audience performance breakdown.\n\nYour best-performing audience segment is "${best.label}" with a ${fmtNum(best.roas)}x ROAS and ${fmt(best.spend)} in spend.`;

  if (worst.roas < best.roas && worst.spend > 0) {
    content += ` Your weakest segment is "${worst.label}" at ${fmtNum(worst.roas)}x ROAS.`;
  }

  const highSpendLowRoas = segments.filter(s => s.spend > totalSpend * 0.1 && s.roas < 1);
  if (highSpendLowRoas.length > 0) {
    content += `\n\nConsider reducing spend on ${highSpendLowRoas.map(s => `"${s.label}"`).join(', ')} -- these segments represent significant spend but are generating sub-1x ROAS.`;
  }

  const chart: AiChart = {
    type: 'bar',
    data: top8.map(s => ({ label: s.label, value: round(s.roas, 2) })),
  };

  const table: AiTable = {
    headers: ['Segment', 'ROAS', 'Spend', 'CPA', 'CTR %', 'Impressions', 'Conversions'],
    rows: top8.map(s => [
      s.label,
      `${fmtNum(s.roas)}x`,
      fmt(s.spend),
      fmt(s.cpa),
      fmtNum(s.ctr),
      fmtInt(s.impressions),
      fmtInt(s.conversions),
    ]),
  };

  return { content, chart, table };
}

async function handleCreative(meta: MetaApiService, accountId: string, datePreset: string): Promise<AiResponse> {
  const adData = await meta.get<any>(`/${accountId}/insights`, {
    fields: `ad_name,campaign_name,${INSIGHT_FIELDS}`,
    level: 'ad',
    date_preset: datePreset,
    limit: '50',
  });

  const rows = (adData.data || []) as any[];

  if (rows.length === 0) {
    return { content: 'No ad-level data is available for the selected period. Make sure you have active ads with delivery data.' };
  }

  const parsed = rows.map(row => {
    const m = parseInsightMetrics(row);
    return {
      adName: row.ad_name || 'Unknown',
      campaignName: row.campaign_name || 'Unknown',
      ...m,
    };
  });

  const sorted = [...parsed].sort((a, b) => b.roas - a.roas);
  const top5 = sorted.slice(0, 5);
  const avgCtr = parsed.reduce((s, p) => s + p.ctr, 0) / parsed.length;

  let content = `You have ${parsed.length} ads running in the selected period.\n\nYour top ad is "${top5[0].adName}" in campaign "${top5[0].campaignName}" with a ${fmtNum(top5[0].roas)}x ROAS and ${fmtNum(top5[0].ctr)}% CTR.`;

  const highCtr = parsed.filter(p => p.ctr > avgCtr * 1.5);
  if (highCtr.length > 0 && highCtr.length < parsed.length) {
    content += `\n\n${highCtr.length} ad${highCtr.length > 1 ? 's have' : ' has'} a CTR significantly above your average of ${fmtNum(avgCtr)}%, suggesting strong creative engagement. Consider using similar hooks and formats in new creatives.`;
  }

  const fatigued = parsed.filter(p => p.ctr < avgCtr * 0.5 && p.impressions > 1000);
  if (fatigued.length > 0) {
    content += ` ${fatigued.length} ad${fatigued.length > 1 ? 's have' : ' has'} a below-average CTR with significant impressions, which may indicate creative fatigue.`;
  }

  const table: AiTable = {
    headers: ['Ad Name', 'Campaign', 'ROAS', 'CTR %', 'CPA', 'Spend', 'Conversions'],
    rows: top5.map(a => [
      a.adName,
      a.campaignName,
      `${fmtNum(a.roas)}x`,
      fmtNum(a.ctr),
      fmt(a.cpa),
      fmt(a.spend),
      fmtInt(a.conversions),
    ]),
  };

  return { content, table };
}

async function handleCpa(meta: MetaApiService, accountId: string, datePreset: string): Promise<AiResponse> {
  const [accountData, campaignData] = await Promise.all([
    meta.get<any>(`/${accountId}/insights`, {
      fields: INSIGHT_FIELDS,
      date_preset: datePreset,
      level: 'account',
    }),
    meta.get<any>(`/${accountId}/insights`, {
      fields: `campaign_name,${INSIGHT_FIELDS}`,
      level: 'campaign',
      date_preset: datePreset,
      limit: '50',
    }),
  ]);

  const acct = parseInsightMetrics(accountData.data?.[0] || {});
  const campaigns = parseCampaignBreakdown(campaignData.data || []);
  const withConversions = campaigns.filter(c => c.conversions > 0);
  const sorted = [...withConversions].sort((a, b) => a.cpa - b.cpa);
  const top5 = sorted.slice(0, 5);

  let content = `Your account-level CPA is ${fmt(acct.cpa)} (${fmtInt(acct.conversions)} conversions from ${fmt(acct.spend)} in spend).`;

  if (top5.length > 0) {
    const best = top5[0];
    const savingsVsAvg = acct.cpa > 0 ? round(((acct.cpa - best.cpa) / acct.cpa) * 100, 1) : 0;
    content += `\n\nYour most efficient campaign is "${best.label}" at ${fmt(best.cpa)} per acquisition, which is ${savingsVsAvg}% below your account average.`;

    const expensive = sorted.slice(-3).reverse();
    if (expensive.length > 0 && expensive[0].cpa > acct.cpa * 1.5) {
      content += ` Your most expensive campaign is "${expensive[0].label}" at ${fmt(expensive[0].cpa)} CPA -- consider optimizing its targeting or pausing it.`;
    }
  } else {
    content += '\n\nNo campaigns with recorded conversions were found. Check that your Meta pixel is properly configured and firing conversion events.';
  }

  const chart: AiChart = {
    type: 'bar',
    data: top5.map(c => ({ label: c.label, value: round(c.cpa, 2) })),
  };

  const table: AiTable = {
    headers: ['Campaign', 'CPA', 'Conversions', 'Spend', 'ROAS', 'CTR %'],
    rows: top5.map(c => [
      c.label,
      fmt(c.cpa),
      fmtInt(c.conversions),
      fmt(c.spend),
      `${fmtNum(c.roas)}x`,
      fmtNum(c.ctr),
    ]),
  };

  return { content, chart, table };
}

async function handleForecast(meta: MetaApiService, accountId: string): Promise<AiResponse> {
  // Fetch daily data for last 14 days to build a trend
  const dailyData = await meta.get<any>(`/${accountId}/insights`, {
    fields: INSIGHT_FIELDS,
    date_preset: 'last_14d',
    time_increment: '1',
    level: 'account',
  });

  const days = (dailyData.data || []) as any[];

  if (days.length < 3) {
    return { content: 'Not enough historical data to generate a forecast. At least 3 days of spending data is needed. Please make sure your campaigns have been active recently.' };
  }

  const dailyMetrics = days.map(d => {
    const m = parseInsightMetrics(d);
    return { date: d.date_start || '', spend: m.spend, revenue: m.revenue, roas: m.roas, conversions: m.conversions };
  });

  const totalSpend = dailyMetrics.reduce((s, d) => s + d.spend, 0);
  const totalRevenue = dailyMetrics.reduce((s, d) => s + d.revenue, 0);
  const totalConversions = dailyMetrics.reduce((s, d) => s + d.conversions, 0);
  const avgDailySpend = totalSpend / dailyMetrics.length;
  const avgDailyRevenue = totalRevenue / dailyMetrics.length;
  const avgDailyConversions = totalConversions / dailyMetrics.length;
  const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  // Simple linear trend using last 7 days vs first 7 days
  const midpoint = Math.floor(dailyMetrics.length / 2);
  const firstHalf = dailyMetrics.slice(0, midpoint);
  const secondHalf = dailyMetrics.slice(midpoint);

  const firstAvgSpend = firstHalf.reduce((s, d) => s + d.spend, 0) / firstHalf.length;
  const secondAvgSpend = secondHalf.reduce((s, d) => s + d.spend, 0) / secondHalf.length;
  const spendTrend = firstAvgSpend > 0 ? (secondAvgSpend - firstAvgSpend) / firstAvgSpend : 0;

  const projectedWeeklySpend = round(avgDailySpend * 7 * (1 + spendTrend), 2);
  const projectedWeeklyRevenue = round(avgDailyRevenue * 7 * (1 + spendTrend), 2);
  const projectedWeeklyConversions = Math.round(avgDailyConversions * 7 * (1 + spendTrend));

  const trendDirection = spendTrend > 0.05 ? 'upward' : spendTrend < -0.05 ? 'downward' : 'stable';
  const trendPct = round(Math.abs(spendTrend) * 100, 1);

  let content = `Based on the last ${dailyMetrics.length} days of data, here is your 7-day forecast:\n\n`;
  content += `Projected weekly spend: ${fmt(projectedWeeklySpend)}\n`;
  content += `Projected weekly revenue: ${fmt(projectedWeeklyRevenue)}\n`;
  content += `Projected conversions: ~${fmtInt(projectedWeeklyConversions)}\n`;
  content += `Expected ROAS: ${fmtNum(avgRoas)}x\n\n`;
  content += `Your spending trend is ${trendDirection}`;
  if (trendDirection !== 'stable') {
    content += ` (${trendPct}% ${trendDirection === 'upward' ? 'increase' : 'decrease'} in the recent period)`;
  }
  content += `.`;

  if (avgRoas < 1) {
    content += ' At the current ROAS, you are spending more than you are earning. Consider pausing underperformers or reducing budgets before scaling further.';
  } else if (avgRoas >= 3) {
    content += ' Your ROAS is strong -- this could be a good time to test scaling your top campaigns by 15-20%.';
  }

  const chart: AiChart = {
    type: 'line',
    data: dailyMetrics.map(d => ({ label: d.date, value: round(d.spend, 2) })),
  };

  return { content, chart };
}

async function handleOverview(meta: MetaApiService, accountId: string, datePreset: string): Promise<AiResponse> {
  const [accountData, campaignData] = await Promise.all([
    meta.get<any>(`/${accountId}/insights`, {
      fields: INSIGHT_FIELDS,
      date_preset: datePreset,
      level: 'account',
    }),
    meta.get<any>(`/${accountId}/insights`, {
      fields: `campaign_name,${INSIGHT_FIELDS}`,
      level: 'campaign',
      date_preset: datePreset,
      limit: '20',
    }),
  ]);

  const acct = parseInsightMetrics(accountData.data?.[0] || {});
  const campaigns = parseCampaignBreakdown(campaignData.data || []);

  if (acct.spend === 0 && acct.impressions === 0) {
    return {
      content: 'No data found for the selected period. This could mean your campaigns were paused or not running. Try selecting a different date range, or check that your ad account has active campaigns.',
    };
  }

  const activeCampaigns = campaigns.filter(c => c.spend > 0);
  const profitableCampaigns = campaigns.filter(c => c.roas >= 1);

  let content = `Here is your account overview for the selected period:\n\n`;
  content += `Total Spend: ${fmt(acct.spend)}\n`;
  content += `Total Revenue: ${fmt(acct.revenue)}\n`;
  content += `ROAS: ${fmtNum(acct.roas)}x\n`;
  content += `CPA: ${fmt(acct.cpa)}\n`;
  content += `CTR: ${fmtNum(acct.ctr)}%\n`;
  content += `Impressions: ${fmtInt(acct.impressions)}\n`;
  content += `Clicks: ${fmtInt(acct.clicks)}\n`;
  content += `Conversions: ${fmtInt(acct.conversions)}\n\n`;

  content += `You have ${activeCampaigns.length} active campaign${activeCampaigns.length !== 1 ? 's' : ''}, of which ${profitableCampaigns.length} ${profitableCampaigns.length !== 1 ? 'are' : 'is'} profitable (ROAS >= 1x).`;

  if (acct.roas >= 3) {
    content += ' Overall performance is strong. Consider scaling your top campaigns gradually.';
  } else if (acct.roas >= 1) {
    content += ' You are profitable overall, but there may be room to optimize underperforming campaigns to improve returns.';
  } else if (acct.roas > 0) {
    content += ' Your overall ROAS is below breakeven. Review your campaign targeting and creatives, and consider pausing your lowest performers.';
  }

  content += '\n\nAsk me about ROAS, CPA, spend, audience, creatives, or forecasting for deeper analysis.';

  const chart: AiChart = {
    type: 'bar',
    data: [
      { label: 'Spend', value: round(acct.spend, 2) },
      { label: 'Revenue', value: round(acct.revenue, 2) },
    ],
  };

  const topCampaigns = [...campaigns].sort((a, b) => b.spend - a.spend).slice(0, 5);
  const table: AiTable = {
    headers: ['Campaign', 'Spend', 'ROAS', 'CPA', 'CTR %', 'Conversions'],
    rows: topCampaigns.map(c => [
      c.label,
      fmt(c.spend),
      `${fmtNum(c.roas)}x`,
      fmt(c.cpa),
      fmtNum(c.ctr),
      fmtInt(c.conversions),
    ]),
  };

  return { content, chart, table };
}

/* ------------------------------------------------------------------ */
/*  Route                                                             */
/* ------------------------------------------------------------------ */

export async function aiRoutes(app: FastifyInstance) {

  // POST /ai/chat
  app.post('/chat', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { message, account_id, date_preset = 'last_7d' } = request.body as {
      message: string;
      account_id?: string;
      credential_group?: string;
      date_preset?: string;
    };

    const intent = detectIntent(message);

    // Handle help intent without needing an account
    if (intent === 'help') {
      return {
        content: 'I can analyze your Meta Ads data in real time. Here is what you can ask me:\n\n' +
          '- "How is my ROAS?" -- see your top campaigns by return on ad spend\n' +
          '- "Where is my budget going?" -- get a spend breakdown by campaign\n' +
          '- "Who is my best audience?" -- see performance by age and gender\n' +
          '- "Which ads are performing best?" -- view your top creatives with metrics\n' +
          '- "What is my CPA?" -- find your most and least efficient campaigns\n' +
          '- "Forecast next week" -- get a projected spend and revenue estimate\n\n' +
          'Just make sure you have an ad account selected to get started.',
      };
    }

    // Require an account for data-driven responses
    if (!account_id) {
      return {
        content: 'I need an ad account to pull your data. Please select an ad account from the dropdown above, then ask me your question again.',
      };
    }

    const token = getUserMetaToken(request.user.id);
    if (!token) {
      return {
        content: 'Your Meta account is not connected. Please go to Settings and connect your Meta account so I can access your ad data.',
      };
    }

    const meta = new MetaApiService(token);

    try {
      switch (intent) {
        case 'roas':
          return await handleRoas(meta, account_id, date_preset);
        case 'spend':
          return await handleSpend(meta, account_id, date_preset);
        case 'audience':
          return await handleAudience(meta, account_id, date_preset);
        case 'creative':
          return await handleCreative(meta, account_id, date_preset);
        case 'cpa':
          return await handleCpa(meta, account_id, date_preset);
        case 'forecast':
          return await handleForecast(meta, account_id);
        case 'overview':
        default:
          return await handleOverview(meta, account_id, date_preset);
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Unknown error';

      // Provide user-friendly error messages
      if (errorMsg.includes('OAuthException') || errorMsg.includes('token')) {
        return {
          content: 'Your Meta access token appears to have expired or become invalid. Please reconnect your Meta account in Settings to continue using data-driven insights.',
        };
      }

      if (errorMsg.includes('permission') || errorMsg.includes('(#10)')) {
        return {
          content: `I do not have permission to access data for this ad account (${account_id}). Please make sure the connected Meta account has access to this ad account.`,
        };
      }

      return {
        content: `I ran into an issue fetching your data: ${errorMsg}. Please try again, or check that your ad account is active and accessible.`,
      };
    }
  });
}
