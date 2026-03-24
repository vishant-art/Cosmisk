import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import { decryptToken } from '../services/token-crypto.js';
import { MetaApiService } from '../services/meta-api.js';
import { parseInsightMetrics, parseCampaignBreakdown, parseAudienceBreakdown } from '../services/insights-parser.js';
import { round, fmt, fmtNum, fmtInt, setCurrency, getCurrency, avgVal, CURRENCY_SYMBOLS } from '../services/format-helpers.js';
import { assessConfidence, computeTrend } from '../services/trend-analyzer.js';
import type { MetaTokenRow } from '../types/index.js';
import { validate, aiChatSchema } from '../validation/schemas.js';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function getUserMetaToken(userId: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(userId) as MetaTokenRow | undefined;
  if (!row) return null;
  return decryptToken(row.encrypted_access_token);
}

const INSIGHT_FIELDS = 'spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas';

const CLAUDE_FALLBACK = "I couldn't generate a detailed analysis right now. Here's the raw data in the chart and table below.";

function buildSystemPrompt(): string {
  return `You are a Meta Ads strategist at Cosmisk. You analyze real campaign data and give specific, actionable advice.

Rules:
- Use actual campaign names, computed amounts, and specific numbers from the data provided
- Never be generic — reference the exact campaigns, segments, and metrics in the data
- Write conversationally like a strategist talking to a client, not a report
- Assess data confidence — if a campaign has high ROAS but tiny spend (e.g. <$50) or few conversions (<5), mention the data is thin
- Always identify trends (improving/declining/stable) when daily data is available
- End every response with a specific next action the user should take
- Use the currency symbol ${CURRENCY_SYMBOLS[getCurrency()] || getCurrency()} (${getCurrency()}) for all monetary values — never use $ unless the account currency is USD
- Never use bullet points or numbered lists unless specifically generating hooks/scripts
- Keep responses focused and under 400 words`;
}

async function askClaude(
  userMessage: string,
  dataContext: Record<string, any>,
  analysisType: string,
  history?: { role: 'user' | 'ai'; content: string }[]
): Promise<string | null> {
  try {
    const systemPrompt = buildSystemPrompt()
      + `\n\nAnalysis type: ${analysisType}\n\nData:\n${JSON.stringify(dataContext, null, 2)}`;

    const historyMessages: { role: 'user' | 'assistant'; content: string }[] = [];
    if (history && history.length > 0) {
      const recent = history.slice(-4);
      for (const msg of recent) {
        historyMessages.push({
          role: msg.role === 'ai' ? 'assistant' : 'user',
          content: msg.content,
        });
      }
    }

    const messages: { role: 'user' | 'assistant'; content: string }[] = [
      ...historyMessages,
      { role: 'user', content: userMessage },
    ];

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      temperature: 0.7,
      system: systemPrompt,
      messages,
    });

    const textBlock = response.content.find((b: any) => b.type === 'text');
    return textBlock ? (textBlock as any).text : null;
  } catch (err: unknown) {
    console.error('askClaude error:', err);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Response interfaces                                               */
/* ------------------------------------------------------------------ */

interface ChartItem { label: string; value: number }
interface AiChart { type: string; data: ChartItem[] }
interface AiTable { headers: string[]; rows: string[][] }
interface AiResponse { content: string; chart?: AiChart; table?: AiTable }

/* ------------------------------------------------------------------ */
/*  Intent detection — Claude-powered with regex fallback              */
/* ------------------------------------------------------------------ */

type Intent =
  | 'roas'
  | 'spend'
  | 'audience'
  | 'creative'
  | 'cpa'
  | 'forecast'
  | 'script'
  | 'help'
  | 'overview'
  | 'comparison';

function detectIntentRegex(message: string): Intent {
  const lower = message.toLowerCase();
  if (lower.includes('help') || lower.includes('what can you do')) return 'help';
  if (lower.includes('script') || lower.includes('hook') || lower.includes('ad copy')
    || lower.includes('write me') || lower.includes('write a')
    || lower.includes('create a') || lower.includes('new ad') || lower.includes('brief')
    || (lower.includes('give me') && (lower.includes('hook') || lower.includes('script') || lower.includes('copy') || lower.includes('ad') || lower.includes('new') || lower.includes('idea')))
    || (lower.includes('generate') && !lower.includes('overview'))) return 'script';
  if (lower.includes('overview') || lower.includes('how is my account') || lower.includes('how am i doing') || lower.includes('account performance') || lower.includes('summary') || lower.includes('report') || lower.includes('how are my ads')) return 'overview';
  if (lower.includes('predict') || lower.includes('forecast') || lower.includes('next week') || lower.includes('project')) return 'forecast';
  if (lower.includes('compar') || lower.includes('vs') || lower.includes('versus') || lower.includes('last week vs')) return 'comparison';
  if (lower.includes('audience') || lower.includes('who') || lower.includes('demographic') || lower.includes('age') || lower.includes('gender') || lower.includes('segment')) return 'audience';
  if (lower.includes('creative') || lower.includes('which ads') || lower.includes('top ads') || /top \d+ ads/.test(lower) || lower.includes('best ads') || (lower.includes('performing') && lower.includes('ads')) || (lower.includes('my') && lower.includes('ads') && !lower.includes('how are'))) return 'creative';
  if (lower.includes('cpa') || lower.includes('cost per') || lower.includes('acquisition')) return 'cpa';
  if (lower.includes('roas') || lower.includes('return on') || lower.includes('best performing') || lower.includes('best campaign')) return 'roas';
  if (lower.includes('spend') || lower.includes('budget') || lower.includes('spending') || lower.includes('where is my money')) return 'spend';
  return 'overview';
}

async function detectIntentWithClaude(
  message: string,
  conversationContext: string,
): Promise<{ intent: Intent; params: Record<string, any> }> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      temperature: 0,
      system: `You are an intent classifier for a Meta Ads analytics platform. Classify the user's message into exactly one intent and extract any parameters.

Intents: roas, spend, audience, creative, cpa, forecast, script, help, overview, comparison

Parameters to extract (if present):
- date_range: specific date range mentioned (e.g., "last week", "this month", "last 3 days")
- campaign_name: specific campaign mentioned
- comparison_periods: if comparing time periods (e.g., ["last_week", "this_week"])
- metric_focus: specific metric they're asking about

Respond ONLY with valid JSON: {"intent": "...", "params": {...}}`,
      messages: [{
        role: 'user',
        content: conversationContext
          ? `Previous context: ${conversationContext}\n\nUser message: ${message}`
          : message,
      }],
    });

    const text = response.content.find((b: any) => b.type === 'text');
    if (text) {
      const parsed = JSON.parse((text as any).text);
      const validIntents: Intent[] = ['roas', 'spend', 'audience', 'creative', 'cpa', 'forecast', 'script', 'help', 'overview', 'comparison'];
      if (validIntents.includes(parsed.intent)) {
        return { intent: parsed.intent, params: parsed.params || {} };
      }
    }
  } catch {
    // Fallback to regex
  }

  return { intent: detectIntentRegex(message), params: {} };
}

function detectIntentWithContext(message: string, lastAiResponse: string): Intent {
  const lower = message.toLowerCase();

  // "based on this" / "from this" + generation keywords → script
  if ((lower.includes('based on this') || lower.includes('from this') || lower.includes('using this') || lower.includes('with this data'))
    && (lower.includes('script') || lower.includes('hook') || lower.includes('ad') || lower.includes('copy') || lower.includes('create') || lower.includes('give me') || lower.includes('write') || lower.includes('generate'))) {
    return 'script';
  }

  // "next step" / "suggestion" / "what should I do"
  if (/next step|suggestion|what.?s next|what (should|do) i do|what now|now what|recommend/i.test(lower)) {
    return 'script';
  }

  // Follow-up detection
  const isFollowUp = /^(tell me more|dig deeper|more detail|what about|explain|can you|go deeper|elaborate|break.?down|expand|what do you mean|and the|how about)/i.test(lower)
    || (lower.length < 40 && !/roas|spend|cpa|audience|creative|forecast|script|hook|help|overview|give me|write|create|generate|compar|vs/i.test(lower));

  if (isFollowUp && lastAiResponse) {
    const lastLower = lastAiResponse.toLowerCase();
    if (lastLower.includes('roas') && lastLower.includes('campaign')) return 'roas';
    if (lastLower.includes('spend') && lastLower.includes('budget')) return 'spend';
    if (lastLower.includes('cpa') && lastLower.includes('conversion')) return 'cpa';
    if (lastLower.includes('audience') && lastLower.includes('segment')) return 'audience';
    if (lastLower.includes('creative') && lastLower.includes('ad')) return 'creative';
    if (lastLower.includes('forecast') || lastLower.includes('project')) return 'forecast';
  }

  return detectIntentRegex(message);
}

/* ------------------------------------------------------------------ */
/*  Intent handlers                                                   */
/* ------------------------------------------------------------------ */

async function handleRoas(meta: MetaApiService, accountId: string, datePreset: string, userMessage: string, history?: { role: 'user' | 'ai'; content: string }[]): Promise<AiResponse> {
  const [accountData, campaignData, dailyCampaignData] = await Promise.all([
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
    meta.get<any>(`/${accountId}/insights`, {
      fields: 'campaign_name,spend,purchase_roas,actions,action_values',
      level: 'campaign',
      date_preset: datePreset,
      time_increment: '1',
      limit: '200',
    }),
  ]);

  const acct = parseInsightMetrics(accountData.data?.[0] || {});
  const campaigns = parseCampaignBreakdown(campaignData.data || []);
  const sorted = [...campaigns].sort((a, b) => b.roas - a.roas);
  const top5 = sorted.slice(0, 5);
  const withSpend = campaigns.filter(c => c.spend > 0);
  const profitable = withSpend.filter(c => c.roas >= 1);
  const unprofitable = withSpend.filter(c => c.roas < 1);
  const totalSpend = withSpend.reduce((s, c) => s + c.spend, 0);

  // Build trend map per campaign
  const dailyRoasMap = new Map<string, number[]>();
  for (const row of (dailyCampaignData.data || [])) {
    const name = row.campaign_name;
    if (!dailyRoasMap.has(name)) dailyRoasMap.set(name, []);
    const m = parseInsightMetrics(row);
    dailyRoasMap.get(name)!.push(m.roas);
  }

  const dataContext = {
    account: { roas: acct.roas, spend: acct.spend, revenue: acct.revenue, conversions: acct.conversions },
    campaigns: sorted.slice(0, 10).map(c => ({
      name: c.label, roas: c.roas, spend: c.spend, cpa: c.cpa, ctr: c.ctr, conversions: c.conversions,
      trend: computeTrend(dailyRoasMap.get(c.label) || []),
      confidence: assessConfidence({ spend: c.spend, totalAccountSpend: totalSpend, conversions: c.conversions, impressions: c.impressions }),
    })),
    summary: { totalCampaigns: withSpend.length, profitable: profitable.length, unprofitable: unprofitable.length, totalSpend },
  };

  const claudeContent = await askClaude(userMessage, dataContext, 'roas', history);
  const content = claudeContent || CLAUDE_FALLBACK;

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

async function handleSpend(meta: MetaApiService, accountId: string, datePreset: string, userMessage: string, history?: { role: 'user' | 'ai'; content: string }[]): Promise<AiResponse> {
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
  const withSpend = campaigns.filter(c => c.spend > 0);
  const totalCampaignSpend = withSpend.reduce((s, c) => s + c.spend, 0);

  const efficient = withSpend.filter(c => c.roas >= 2).sort((a, b) => b.roas - a.roas);
  const inefficient = withSpend.filter(c => c.roas < 1);
  const wastedSpend = inefficient.reduce((s, c) => s + c.spend, 0);

  const dataContext = {
    account: { spend: acct.spend, revenue: acct.revenue, roas: acct.roas, conversions: acct.conversions },
    campaigns: sorted.slice(0, 10).map(c => ({
      name: c.label, spend: c.spend, roas: c.roas, cpa: c.cpa,
      percentOfTotal: totalCampaignSpend > 0 ? round((c.spend / totalCampaignSpend) * 100, 1) : 0,
    })),
    wasteAnalysis: {
      inefficientCount: inefficient.length,
      wastedSpend,
      wastedPercent: totalCampaignSpend > 0 ? round((wastedSpend / totalCampaignSpend) * 100, 1) : 0,
      topInefficient: inefficient.slice(0, 3).map(c => ({ name: c.label, roas: c.roas, spend: c.spend })),
      topEfficient: efficient.slice(0, 3).map(c => ({ name: c.label, roas: c.roas, spend: c.spend })),
    },
    summary: { totalCampaigns: withSpend.length, totalSpend: totalCampaignSpend },
  };

  const claudeContent = await askClaude(userMessage, dataContext, 'spend', history);
  const content = claudeContent || CLAUDE_FALLBACK;

  const chart: AiChart = {
    type: 'bar',
    data: top5.map(c => ({ label: c.label, value: round(c.spend, 2) })),
  };

  const table: AiTable = {
    headers: ['Campaign', 'Spend', '% of Total', 'Revenue', 'ROAS', 'CPA'],
    rows: top5.map(c => {
      const rev = c.spend * c.roas;
      const pct = totalCampaignSpend > 0 ? round((c.spend / totalCampaignSpend) * 100, 1) : 0;
      return [
        c.label,
        fmt(c.spend),
        `${pct}%`,
        fmt(rev),
        `${fmtNum(c.roas)}x`,
        fmt(c.cpa),
      ];
    }),
  };

  return { content, chart, table };
}

async function handleAudience(meta: MetaApiService, accountId: string, datePreset: string, userMessage: string, history?: { role: 'user' | 'ai'; content: string }[]): Promise<AiResponse> {
  const audienceData = await meta.get<any>(`/${accountId}/insights`, {
    fields: 'spend,impressions,clicks,actions,action_values,purchase_roas',
    breakdowns: 'age,gender',
    date_preset: datePreset,
    limit: '100',
  });

  const segments = parseAudienceBreakdown(audienceData.data || []);
  const sorted = [...segments].sort((a, b) => b.roas - a.roas);
  const top8 = sorted.slice(0, 8);

  if (sorted.length === 0) {
    return { content: 'No audience breakdown data for this period. Your campaigns need to be running and delivering for me to see who\'s converting.' };
  }

  const best = sorted[0];
  const totalSpend = segments.reduce((s, seg) => s + seg.spend, 0);
  const totalConversions = segments.reduce((s, seg) => s + seg.conversions, 0);
  const withConversions = segments.filter(s => s.conversions > 0);
  const avgCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;

  // Gender and age pattern analysis
  const genderMap: Record<string, { spend: number; conversions: number; roas: number[] }> = {};
  const ageMap: Record<string, { spend: number; conversions: number; roas: number[] }> = {};
  for (const seg of segments) {
    const parts = seg.label.split(' ');
    const gender = parts[0] || 'unknown';
    const age = parts.slice(1).join(' ') || 'unknown';
    if (!genderMap[gender]) genderMap[gender] = { spend: 0, conversions: 0, roas: [] };
    genderMap[gender].spend += seg.spend;
    genderMap[gender].conversions += seg.conversions;
    if (seg.roas > 0) genderMap[gender].roas.push(seg.roas);
    if (!ageMap[age]) ageMap[age] = { spend: 0, conversions: 0, roas: [] };
    ageMap[age].spend += seg.spend;
    ageMap[age].conversions += seg.conversions;
    if (seg.roas > 0) ageMap[age].roas.push(seg.roas);
  }

  const moneyPits = segments.filter(s => s.spend > totalSpend * 0.08 && s.roas < 1);
  const hiddenGems = segments.filter(s => s.spend < totalSpend * 0.05 && s.roas > 1.5 && s.conversions > 0);

  const genderBreakdown = Object.entries(genderMap).map(([gender, data]) => ({
    gender,
    spend: data.spend,
    conversions: data.conversions,
    avgRoas: data.roas.length > 0 ? round(data.roas.reduce((s, r) => s + r, 0) / data.roas.length, 2) : 0,
  }));
  const ageBreakdown = Object.entries(ageMap).map(([age, data]) => ({
    age,
    spend: data.spend,
    conversions: data.conversions,
    avgRoas: data.roas.length > 0 ? round(data.roas.reduce((s, r) => s + r, 0) / data.roas.length, 2) : 0,
  }));

  const dataContext = {
    segments: sorted.slice(0, 10).map(s => ({
      name: s.label, roas: s.roas, spend: s.spend, cpa: s.cpa, ctr: s.ctr, conversions: s.conversions,
      confidence: assessConfidence({ spend: s.spend, totalAccountSpend: totalSpend, conversions: s.conversions, impressions: s.impressions }),
    })),
    genderBreakdown,
    ageBreakdown,
    moneyPits: moneyPits.map(s => ({ name: s.label, roas: s.roas, spend: s.spend })),
    hiddenGems: hiddenGems.map(s => ({ name: s.label, roas: s.roas, spend: s.spend, conversions: s.conversions })),
    summary: { totalSegments: segments.length, totalSpend, totalConversions, avgCpa },
  };

  const claudeContent = await askClaude(userMessage, dataContext, 'audience', history);
  const content = claudeContent || CLAUDE_FALLBACK;

  const chart: AiChart = {
    type: 'bar',
    data: top8.map(s => ({ label: s.label, value: round(s.roas, 2) })),
  };

  const table: AiTable = {
    headers: ['Segment', 'ROAS', 'Spend', 'CPA', 'CTR %', 'Conversions'],
    rows: top8.map(s => [
      s.label,
      `${fmtNum(s.roas)}x`,
      fmt(s.spend),
      fmt(s.cpa),
      fmtNum(s.ctr),
      fmtInt(s.conversions),
    ]),
  };

  return { content, chart, table };
}

async function handleCreative(meta: MetaApiService, accountId: string, datePreset: string, userMessage: string, history?: { role: 'user' | 'ai'; content: string }[]): Promise<AiResponse> {
  const adData = await meta.get<any>(`/${accountId}/insights`, {
    fields: `ad_name,campaign_name,${INSIGHT_FIELDS}`,
    level: 'ad',
    date_preset: datePreset,
    limit: '50',
  });

  const rows = (adData.data || []) as any[];

  if (rows.length === 0) {
    return { content: 'I don\'t see any ad-level data for this period. Your ads need to be running and delivering for me to analyze creative performance.' };
  }

  const parsed = rows.map(row => {
    const m = parseInsightMetrics(row);
    return {
      adName: row.ad_name || 'Unknown',
      campaignName: row.campaign_name || 'Unknown',
      ...m,
    };
  });

  const sortedByRoas = [...parsed].sort((a, b) => b.roas - a.roas);
  const sortedByCtr = [...parsed].sort((a, b) => b.ctr - a.ctr);
  const top5 = sortedByRoas.slice(0, 5);
  const totalAds = parsed.length;
  const avgCtr = parsed.reduce((s, p) => s + p.ctr, 0) / totalAds;
  const avgRoas = parsed.reduce((s, p) => s + p.roas, 0) / totalAds;
  const totalSpend = parsed.reduce((s, p) => s + p.spend, 0);

  const hero = top5[0];
  const heroConf = assessConfidence({ spend: hero.spend, totalAccountSpend: totalSpend, conversions: hero.conversions, impressions: hero.impressions });

  const fatigued = parsed.filter(p => p.ctr < avgCtr * 0.5 && p.impressions > 1000);
  const deadWeight = parsed.filter(p => p.roas < 0.5 && p.spend > totalSpend * 0.02);
  const highPerformers = parsed.filter(p => p.roas >= avgRoas * 1.3 && p.conversions > 0);

  const dataContext = {
    ads: sortedByRoas.slice(0, 10).map(a => ({
      adName: a.adName, campaign: a.campaignName, roas: a.roas, ctr: a.ctr, cpa: a.cpa, spend: a.spend, conversions: a.conversions,
      confidence: assessConfidence({ spend: a.spend, totalAccountSpend: totalSpend, conversions: a.conversions, impressions: a.impressions }),
    })),
    topByCtr: sortedByCtr.slice(0, 3).map(a => ({ adName: a.adName, ctr: a.ctr, roas: a.roas })),
    fatigueDetection: {
      fatiguedCount: fatigued.length,
      fatiguedAds: fatigued.slice(0, 3).map(f => ({ adName: f.adName, ctr: f.ctr, impressions: f.impressions, spend: f.spend })),
    },
    portfolioHealth: {
      totalAds, avgCtr: round(avgCtr, 2), avgRoas: round(avgRoas, 2),
      highPerformers: highPerformers.length, deadWeight: deadWeight.length, totalSpend,
    },
  };

  const claudeContent = await askClaude(userMessage, dataContext, 'creative', history);
  const content = claudeContent || CLAUDE_FALLBACK;

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

async function handleCpa(meta: MetaApiService, accountId: string, datePreset: string, userMessage: string, history?: { role: 'user' | 'ai'; content: string }[]): Promise<AiResponse> {
  const [accountData, campaignData, dailyCampaignData] = await Promise.all([
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
    meta.get<any>(`/${accountId}/insights`, {
      fields: 'campaign_name,spend,actions',
      level: 'campaign',
      date_preset: datePreset,
      time_increment: '1',
      limit: '200',
    }),
  ]);

  const acct = parseInsightMetrics(accountData.data?.[0] || {});
  const campaigns = parseCampaignBreakdown(campaignData.data || []);
  const withConversions = campaigns.filter(c => c.conversions > 0);
  const noConversions = campaigns.filter(c => c.conversions === 0 && c.spend > 0);
  const sorted = [...withConversions].sort((a, b) => a.cpa - b.cpa);
  const top5 = sorted.slice(0, 5);
  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);

  // Build daily CPA map for trend
  const dailyCpaMap = new Map<string, number[]>();
  for (const row of (dailyCampaignData.data || [])) {
    const name = row.campaign_name;
    if (!dailyCpaMap.has(name)) dailyCpaMap.set(name, []);
    const m = parseInsightMetrics(row);
    if (m.cpa > 0) dailyCpaMap.get(name)!.push(m.cpa);
  }

  const dataContext = {
    account: { cpa: acct.cpa, conversions: acct.conversions, spend: acct.spend, roas: acct.roas },
    campaigns: sorted.slice(0, 10).map(c => ({
      name: c.label, cpa: c.cpa, conversions: c.conversions, spend: c.spend, roas: c.roas,
      trend: computeTrend(dailyCpaMap.get(c.label) || []),
      confidence: assessConfidence({ spend: c.spend, totalAccountSpend: totalSpend, conversions: c.conversions, impressions: c.impressions }),
    })),
    zeroConversionCampaigns: noConversions.map(c => ({ name: c.label, spend: c.spend })),
    summary: {
      totalCampaigns: campaigns.length,
      withConversions: withConversions.length,
      zeroConversions: noConversions.length,
      deadSpend: noConversions.reduce((s, c) => s + c.spend, 0),
      totalSpend,
    },
  };

  const claudeContent = await askClaude(userMessage, dataContext, 'cpa', history);
  const content = claudeContent || CLAUDE_FALLBACK;

  const chart: AiChart = {
    type: 'bar',
    data: top5.map(c => ({ label: c.label, value: round(c.cpa, 2) })),
  };

  const table: AiTable = {
    headers: ['Campaign', 'CPA', 'Conversions', 'Spend', 'ROAS', 'Efficiency'],
    rows: top5.map(c => {
      const efficiency = acct.cpa > 0 ? round(((acct.cpa - c.cpa) / acct.cpa) * 100, 1) : 0;
      return [
        c.label,
        fmt(c.cpa),
        fmtInt(c.conversions),
        fmt(c.spend),
        `${fmtNum(c.roas)}x`,
        efficiency > 0 ? `${efficiency}% below avg` : `${Math.abs(efficiency)}% above avg`,
      ];
    }),
  };

  return { content, chart, table };
}

async function handleForecast(meta: MetaApiService, accountId: string, userMessage: string, history?: { role: 'user' | 'ai'; content: string }[]): Promise<AiResponse> {
  const dailyData = await meta.get<any>(`/${accountId}/insights`, {
    fields: INSIGHT_FIELDS,
    date_preset: 'last_14d',
    time_increment: '1',
    level: 'account',
  });

  const days = (dailyData.data || []) as any[];

  if (days.length < 3) {
    return { content: 'I need at least 3 days of data to project anything meaningful. Your account doesn\'t have enough history in this window yet.' };
  }

  const dailyMetrics = days.map(d => {
    const m = parseInsightMetrics(d);
    return { date: d.date_start || '', spend: m.spend, revenue: m.revenue, roas: m.roas, conversions: m.conversions, cpa: m.cpa };
  });

  const totalSpend = dailyMetrics.reduce((s, d) => s + d.spend, 0);
  const totalRevenue = dailyMetrics.reduce((s, d) => s + d.revenue, 0);
  const totalConversions = dailyMetrics.reduce((s, d) => s + d.conversions, 0);
  const avgDailySpend = totalSpend / dailyMetrics.length;
  const avgDailyRevenue = totalRevenue / dailyMetrics.length;
  const avgDailyConversions = totalConversions / dailyMetrics.length;
  const avgCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;

  // Use computeTrend for consistent trend detection
  const spendTrendResult = computeTrend(dailyMetrics.map(d => d.spend));
  const roasTrendResult = computeTrend(dailyMetrics.map(d => d.roas));
  const revenueTrendResult = computeTrend(dailyMetrics.map(d => d.revenue));

  // Still compute raw trend percentages for projections
  const midpoint = Math.floor(dailyMetrics.length / 2);
  const firstHalf = dailyMetrics.slice(0, midpoint);
  const secondHalf = dailyMetrics.slice(midpoint);
  const firstAvgSpend = firstHalf.reduce((s, d) => s + d.spend, 0) / firstHalf.length;
  const secondAvgSpend = secondHalf.reduce((s, d) => s + d.spend, 0) / secondHalf.length;
  const spendTrend = firstAvgSpend > 0 ? (secondAvgSpend - firstAvgSpend) / firstAvgSpend : 0;
  const firstAvgRoas = firstHalf.reduce((s, d) => s + d.spend, 0) > 0
    ? firstHalf.reduce((s, d) => s + d.revenue, 0) / firstHalf.reduce((s, d) => s + d.spend, 0) : 0;
  const secondAvgRoas = secondHalf.reduce((s, d) => s + d.spend, 0) > 0
    ? secondHalf.reduce((s, d) => s + d.revenue, 0) / secondHalf.reduce((s, d) => s + d.spend, 0) : 0;
  const roasTrend = firstAvgRoas > 0 ? (secondAvgRoas - firstAvgRoas) / firstAvgRoas : 0;

  const projectedWeeklySpend = round(avgDailySpend * 7 * (1 + spendTrend), 2);
  const projectedWeeklyRevenue = round(avgDailyRevenue * 7 * (1 + spendTrend * (1 + roasTrend)), 2);
  const projectedWeeklyConversions = Math.round(avgDailyConversions * 7 * (1 + spendTrend));
  const projectedRoas = projectedWeeklySpend > 0 ? projectedWeeklyRevenue / projectedWeeklySpend : 0;

  // Volatility check
  const spendStdDev = Math.sqrt(dailyMetrics.reduce((s, d) => s + Math.pow(d.spend - avgDailySpend, 2), 0) / dailyMetrics.length);
  const spendCV = avgDailySpend > 0 ? spendStdDev / avgDailySpend : 0;

  const bestDay = [...dailyMetrics].sort((a, b) => b.revenue - a.revenue)[0];

  const dataContext = {
    dailyMetrics: dailyMetrics.map(d => ({ date: d.date, spend: d.spend, revenue: d.revenue, roas: d.roas, conversions: d.conversions })),
    trends: {
      spend: spendTrendResult,
      roas: roasTrendResult,
      revenue: revenueTrendResult,
      rawSpendTrend: round(spendTrend * 100, 1),
      rawRoasTrend: round(roasTrend * 100, 1),
    },
    projections: {
      weeklySpend: projectedWeeklySpend,
      weeklyRevenue: projectedWeeklyRevenue,
      weeklyConversions: projectedWeeklyConversions,
      projectedRoas: round(projectedRoas, 2),
    },
    volatility: { spendCV: round(spendCV, 2), daysOfData: dailyMetrics.length },
    bestDay: bestDay ? { date: bestDay.date, revenue: bestDay.revenue, roas: bestDay.roas } : null,
    averages: { dailySpend: round(avgDailySpend, 2), dailyRevenue: round(avgDailyRevenue, 2), dailyConversions: round(avgDailyConversions, 1), cpa: round(avgCpa, 2) },
  };

  const claudeContent = await askClaude(userMessage, dataContext, 'forecast', history);
  const content = claudeContent || CLAUDE_FALLBACK;

  const chart: AiChart = {
    type: 'line',
    data: dailyMetrics.map(d => ({ label: d.date, value: round(d.spend, 2) })),
  };

  return { content, chart };
}

async function handleScript(meta: MetaApiService, accountId: string, datePreset: string, userMessage: string, history?: { role: 'user' | 'ai'; content: string }[]): Promise<AiResponse> {
  const [adData, campaignData, audienceData] = await Promise.all([
    meta.get<any>(`/${accountId}/insights`, {
      fields: `ad_name,campaign_name,${INSIGHT_FIELDS}`,
      level: 'ad',
      date_preset: datePreset,
      limit: '20',
    }),
    meta.get<any>(`/${accountId}/insights`, {
      fields: `campaign_name,${INSIGHT_FIELDS}`,
      level: 'campaign',
      date_preset: datePreset,
      limit: '20',
    }),
    meta.get<any>(`/${accountId}/insights`, {
      fields: 'spend,impressions,clicks,actions,action_values,purchase_roas',
      breakdowns: 'age,gender',
      date_preset: datePreset,
      limit: '50',
    }),
  ]);

  const ads = (adData.data || []).map((row: any) => ({
    name: row.ad_name || 'Unknown',
    campaign: row.campaign_name || 'Unknown',
    ...parseInsightMetrics(row),
  }));
  const campaigns = parseCampaignBreakdown(campaignData.data || []);
  const audiences = parseAudienceBreakdown(audienceData.data || []);
  const topAds = [...ads].sort((a: any, b: any) => b.roas - a.roas).slice(0, 5);
  const topCampaigns = [...campaigns].sort((a, b) => b.roas - a.roas).slice(0, 3);
  const topAudience = [...audiences].sort((a, b) => b.conversions - a.conversions)[0];

  const avgRoas = ads.length > 0 ? ads.reduce((s: number, a: any) => s + a.roas, 0) / ads.length : 0;
  const avgCtr = ads.length > 0 ? ads.reduce((s: number, a: any) => s + a.ctr, 0) / ads.length : 0;
  const highCtrAds = [...ads].sort((a: any, b: any) => b.ctr - a.ctr).slice(0, 3);

  const lower = userMessage.toLowerCase();
  const wantsAdCopy = lower.includes('ad copy') || lower.includes('facebook ad') || lower.includes('copy');
  const wantsHooks = lower.includes('hook');
  const contentType = wantsHooks ? 'hooks' : wantsAdCopy ? 'ad copy' : 'video script';

  const dataContext = {
    topAds: topAds.map((a: any) => ({ name: a.name, campaign: a.campaign, roas: a.roas, ctr: a.ctr, spend: a.spend, conversions: a.conversions })),
    topCampaigns: topCampaigns.map(c => ({ name: c.label, roas: c.roas, spend: c.spend })),
    topAudience: topAudience ? { name: topAudience.label, roas: topAudience.roas, conversions: topAudience.conversions } : null,
    highCtrAds: highCtrAds.map((a: any) => ({ name: a.name, ctr: a.ctr, roas: a.roas })),
    averages: { roas: round(avgRoas, 2), ctr: round(avgCtr, 2) },
    totalAds: ads.length,
    requestedContentType: contentType,
  };

  const claudeContent = await askClaude(userMessage, dataContext, 'script', history);
  const content = claudeContent || CLAUDE_FALLBACK;

  if (topAds.length > 0) {
    const table: AiTable = {
      headers: ['Your Top Ads (Reference)', 'Campaign', 'ROAS', 'CTR %', 'Spend'],
      rows: topAds.slice(0, 5).map((a: any) => [
        a.name,
        a.campaign,
        `${fmtNum(a.roas)}x`,
        fmtNum(a.ctr),
        fmt(a.spend),
      ]),
    };
    return { content, table };
  }

  return { content };
}

async function handleOverview(meta: MetaApiService, accountId: string, datePreset: string, userMessage: string, history?: { role: 'user' | 'ai'; content: string }[]): Promise<AiResponse> {
  const [accountData, campaignData, adData, dailyData] = await Promise.all([
    meta.get<any>(`/${accountId}/insights`, {
      fields: INSIGHT_FIELDS,
      date_preset: datePreset,
      level: 'account',
    }),
    meta.get<any>(`/${accountId}/insights`, {
      fields: `campaign_name,${INSIGHT_FIELDS}`,
      level: 'campaign',
      date_preset: datePreset,
      limit: '30',
    }),
    meta.get<any>(`/${accountId}/insights`, {
      fields: `ad_name,${INSIGHT_FIELDS}`,
      level: 'ad',
      date_preset: datePreset,
      limit: '20',
    }),
    meta.get<any>(`/${accountId}/insights`, {
      fields: 'spend,ctr,actions,action_values,purchase_roas',
      date_preset: datePreset,
      time_increment: '1',
      level: 'account',
    }),
  ]);

  const acct = parseInsightMetrics(accountData.data?.[0] || {});
  const campaigns = parseCampaignBreakdown(campaignData.data || []);
  const ads = (adData.data || []).map((row: any) => ({
    name: row.ad_name || 'Unknown',
    ...parseInsightMetrics(row),
  }));

  if (acct.spend === 0 && acct.impressions === 0) {
    return {
      content: 'I don\'t see any data for this period. Your campaigns might be paused, or this date range has no activity. Try switching to a different time window and let\'s take another look.',
    };
  }

  // Compute trends
  const dailyRows = (dailyData.data || []).map((d: any) => parseInsightMetrics(d));
  const roasTrend = computeTrend(dailyRows.map((d: any) => d.roas));
  const spendTrend = computeTrend(dailyRows.map((d: any) => d.spend));

  const activeCampaigns = campaigns.filter(c => c.spend > 0);
  const profitable = campaigns.filter(c => c.roas >= 1 && c.spend > 0);
  const unprofitable = campaigns.filter(c => c.roas < 1 && c.spend > 0);
  const totalSpend = activeCampaigns.reduce((s, c) => s + c.spend, 0);
  const wastedSpend = unprofitable.reduce((s, c) => s + c.spend, 0);
  const sortedByRoas = [...campaigns].sort((a, b) => b.roas - a.roas);
  const topCampaign = sortedByRoas[0];
  const worstCampaign = [...activeCampaigns].sort((a, b) => a.roas - b.roas)[0];
  const topAd = [...ads].sort((a: any, b: any) => b.roas - a.roas)[0];

  // Assess data confidence for key recommendations
  const topConf = topCampaign ? assessConfidence({ spend: topCampaign.spend, totalAccountSpend: totalSpend, conversions: topCampaign.conversions, impressions: topCampaign.impressions }) : null;
  const topAdConf = topAd ? assessConfidence({ spend: topAd.spend, totalAccountSpend: totalSpend, conversions: topAd.conversions, impressions: topAd.impressions }) : null;

  const dataContext = {
    account: { spend: acct.spend, revenue: acct.revenue, roas: acct.roas, conversions: acct.conversions, cpa: acct.cpa, ctr: acct.ctr, impressions: acct.impressions },
    campaignLandscape: {
      active: activeCampaigns.length, profitable: profitable.length, unprofitable: unprofitable.length, totalSpend, wastedSpend,
      topCampaign: topCampaign ? { name: topCampaign.label, roas: topCampaign.roas, spend: topCampaign.spend, conversions: topCampaign.conversions, confidence: topConf } : null,
      worstCampaign: worstCampaign ? { name: worstCampaign.label, roas: worstCampaign.roas, spend: worstCampaign.spend } : null,
    },
    topCreative: topAd ? { name: topAd.name, roas: topAd.roas, ctr: topAd.ctr, conversions: topAd.conversions, confidence: topAdConf } : null,
    totalAds: ads.length,
    trends: { roas: roasTrend, spend: spendTrend },
  };

  const claudeContent = await askClaude(userMessage, dataContext, 'overview', history);
  const content = claudeContent || CLAUDE_FALLBACK;

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

async function handleComparison(meta: MetaApiService, accountId: string, datePreset: string, userMessage: string, params: Record<string, any>, history?: { role: 'user' | 'ai'; content: string }[]): Promise<AiResponse> {
  // Fetch two periods for comparison — current period and previous period
  const currentPreset = datePreset;
  const previousPreset = datePreset === 'last_7d' ? 'last_14d' : 'last_30d';

  const [currentData, previousData, campaignCurrent] = await Promise.all([
    meta.get<any>(`/${accountId}/insights`, {
      fields: INSIGHT_FIELDS,
      date_preset: currentPreset,
      level: 'account',
    }),
    meta.get<any>(`/${accountId}/insights`, {
      fields: INSIGHT_FIELDS,
      date_preset: previousPreset,
      level: 'account',
    }),
    meta.get<any>(`/${accountId}/insights`, {
      fields: `campaign_name,${INSIGHT_FIELDS}`,
      level: 'campaign',
      date_preset: currentPreset,
      limit: '30',
    }),
  ]);

  const current = parseInsightMetrics(currentData.data?.[0] || {});
  const previous = parseInsightMetrics(previousData.data?.[0] || {});
  const campaigns = parseCampaignBreakdown(campaignCurrent.data || []);

  const dataContext = {
    current_period: { preset: currentPreset, ...current },
    previous_period: { preset: previousPreset, ...previous },
    changes: {
      roas: current.roas - previous.roas,
      spend: current.spend - previous.spend,
      revenue: current.revenue - previous.revenue,
      cpa: current.cpa - previous.cpa,
      ctr: current.ctr - previous.ctr,
    },
    top_campaigns: campaigns.slice(0, 5).map(c => ({ name: c.label, roas: c.roas, spend: c.spend, cpa: c.cpa })),
    user_params: params,
  };

  const claudeContent = await askClaude(userMessage, dataContext, 'comparison', history);
  const content = claudeContent || CLAUDE_FALLBACK;

  const table: AiTable = {
    headers: ['Metric', currentPreset, previousPreset, 'Change'],
    rows: [
      ['ROAS', `${fmtNum(current.roas)}x`, `${fmtNum(previous.roas)}x`, `${current.roas > previous.roas ? '+' : ''}${fmtNum(current.roas - previous.roas)}x`],
      ['Spend', fmt(current.spend), fmt(previous.spend), `${current.spend > previous.spend ? '+' : ''}${fmt(current.spend - previous.spend)}`],
      ['Revenue', fmt(current.revenue), fmt(previous.revenue), `${current.revenue > previous.revenue ? '+' : ''}${fmt(current.revenue - previous.revenue)}`],
      ['CPA', fmt(current.cpa), fmt(previous.cpa), `${current.cpa > previous.cpa ? '+' : ''}${fmt(current.cpa - previous.cpa)}`],
      ['CTR', `${fmtNum(current.ctr)}%`, `${fmtNum(previous.ctr)}%`, `${current.ctr > previous.ctr ? '+' : ''}${fmtNum(current.ctr - previous.ctr)}%`],
    ],
  };

  return { content, table };
}

/* ------------------------------------------------------------------ */
/*  Route                                                             */
/* ------------------------------------------------------------------ */

export async function aiRoutes(app: FastifyInstance) {

  // POST /ai/chat
  app.post('/chat', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(aiChatSchema, request.body, reply);
    if (!parsed) return;

    const { message, account_id, date_preset = 'last_7d', currency = 'USD', history } = parsed;

    setCurrency(currency);

    // Use Claude-based intent detection for complex queries, regex fallback for simple ones
    const lastAiMessage = history?.filter(m => m.role === 'ai').pop()?.content || '';
    const conversationContext = lastAiMessage ? lastAiMessage.slice(0, 300) : '';

    // For short/simple messages, use regex. For complex natural language, use Claude.
    const isComplex = message.length > 50
      || message.includes('?')
      || /why|how come|what happened|compare|versus|difference|between/i.test(message);

    let intent: Intent;
    let intentParams: Record<string, any> = {};

    if (isComplex) {
      const claudeResult = await detectIntentWithClaude(message, conversationContext);
      intent = claudeResult.intent;
      intentParams = claudeResult.params;
    } else {
      intent = detectIntentWithContext(message, lastAiMessage);
    }

    // Handle help intent without needing an account
    if (intent === 'help') {
      return {
        content: `Hey! I'm your Meta Ads strategist. I pull your live data and tell you what's actually going on — not generic advice, but specific recommendations based on your campaigns.\n\n` +
          `Here's the kind of stuff you can ask me:\n\n` +
          `"How is my account doing?" — I'll break down your performance, flag what's working and what's burning money, and tell you what to do about it.\n\n` +
          `"What's my best campaign by ROAS?" — I'll rank your campaigns, check if the top performer's data is actually reliable, and look at trends to see if it's improving or declining.\n\n` +
          `"Where is my budget going?" — I'll show you where every dollar is being spent and whether it's earning its keep.\n\n` +
          `"What's my CPA?" — Cost efficiency across campaigns with trend direction so you know if things are getting better or worse.\n\n` +
          `"Who is my best audience?" — Segment breakdown by age and gender with spend-to-conversion analysis.\n\n` +
          `"Which ads are performing best?" — Creative health check with fatigue detection.\n\n` +
          `"Write me a video script" or "Give me hooks" — I'll build creative based on what's actually converting in your account.\n\n` +
          `"Predict next week" — Trend-adjusted forecast based on your recent trajectory.\n\n` +
          `Select an ad account from the dropdown and ask away.`,
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
          return await handleRoas(meta, account_id, date_preset, message, history);
        case 'spend':
          return await handleSpend(meta, account_id, date_preset, message, history);
        case 'audience':
          return await handleAudience(meta, account_id, date_preset, message, history);
        case 'creative':
          return await handleCreative(meta, account_id, date_preset, message, history);
        case 'cpa':
          return await handleCpa(meta, account_id, date_preset, message, history);
        case 'forecast':
          return await handleForecast(meta, account_id, message, history);
        case 'script':
          return await handleScript(meta, account_id, date_preset, message, history);
        case 'comparison':
          return await handleComparison(meta, account_id, date_preset, message, intentParams, history);
        case 'overview':
        default:
          return await handleOverview(meta, account_id, date_preset, message, history);
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
