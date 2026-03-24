import { getDb } from '../db/index.js';
import { decryptToken } from './token-crypto.js';
import { MetaApiService } from './meta-api.js';
import { parseInsightMetrics, parseCampaignBreakdown } from './insights-parser.js';
import { assessConfidence, computeTrend } from './trend-analyzer.js';
import { round, fmt } from './format-helpers.js';
import Anthropic from '@anthropic-ai/sdk';
import { extractText } from '../utils/claude-helpers.js';
import { v4 as uuidv4 } from 'uuid';
import type { MetaTokenRow, UserRow } from '../types/index.js';
import { logger } from '../utils/logger.js';

const anthropic = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface Alert {
  user_id: string;
  account_id: string;
  type: string;
  title: string;
  content: string;
  severity: 'critical' | 'warning' | 'info' | 'success';
}

/* ------------------------------------------------------------------ */
/*  Core: analyze one ad account and generate alerts                   */
/* ------------------------------------------------------------------ */

async function analyzeAccount(userId: string, accountId: string, token: string): Promise<Alert[]> {
  const meta = new MetaApiService(token);
  const alerts: Alert[] = [];

  try {
    // Fetch today vs yesterday comparison data
    const [todayData, weekData, dailyData] = await Promise.all([
      meta.get<any>(`/${accountId}/insights`, {
        fields: 'spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas',
        date_preset: 'today',
        level: 'account',
      }),
      meta.get<any>(`/${accountId}/insights`, {
        fields: 'spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas',
        date_preset: 'last_7d',
        level: 'account',
      }),
      meta.get<any>(`/${accountId}/insights`, {
        fields: 'spend,impressions,clicks,actions,action_values,purchase_roas',
        date_preset: 'last_7d',
        time_increment: '1',
        level: 'account',
      }),
    ]);

    const today = parseInsightMetrics(todayData.data?.[0] || {});
    const weekMetrics = parseInsightMetrics(weekData.data?.[0] || {});
    const dailyRows = (dailyData.data || []).map((d: any) => parseInsightMetrics(d));

    // Campaign-level analysis
    const campaignData = await meta.get<any>(`/${accountId}/insights`, {
      fields: 'campaign_name,spend,impressions,clicks,ctr,actions,action_values,purchase_roas',
      level: 'campaign',
      date_preset: 'last_7d',
      limit: '50',
    });
    const campaigns = parseCampaignBreakdown(campaignData.data || []);
    const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);

    // Daily campaign data for trend detection
    const dailyCampaignData = await meta.get<any>(`/${accountId}/insights`, {
      fields: 'campaign_name,spend,purchase_roas,actions,ctr',
      level: 'campaign',
      date_preset: 'last_7d',
      time_increment: '1',
      limit: '200',
    });

    // Build daily trends per campaign
    const dailyRoasMap = new Map<string, number[]>();
    const dailyCpaMap = new Map<string, number[]>();
    const dailyCtrMap = new Map<string, number[]>();
    for (const row of (dailyCampaignData.data || [])) {
      const name = row.campaign_name;
      const m = parseInsightMetrics(row);
      if (!dailyRoasMap.has(name)) dailyRoasMap.set(name, []);
      if (!dailyCpaMap.has(name)) dailyCpaMap.set(name, []);
      if (!dailyCtrMap.has(name)) dailyCtrMap.set(name, []);
      dailyRoasMap.get(name)!.push(m.roas);
      if (m.cpa > 0) dailyCpaMap.get(name)!.push(m.cpa);
      dailyCtrMap.get(name)!.push(m.ctr);
    }

    // ROAS trend analysis
    const roasValues = dailyRows.map((d: any) => d.roas);
    const roasTrend = computeTrend(roasValues);

    // Alert 1: Overall ROAS declining
    if (roasTrend.direction === 'declining' && weekMetrics.roas > 0) {
      const weekAgo = roasValues[0] || 0;
      const latest = roasValues[roasValues.length - 1] || 0;
      if (weekAgo > 0 && latest > 0) {
        alerts.push({
          user_id: userId, account_id: accountId,
          type: 'roas_decline',
          title: `ROAS dropped from ${round(weekAgo, 1)}x to ${round(latest, 1)}x this week`,
          content: await generateAlertContent('roas_decline', {
            weekAgoRoas: weekAgo, currentRoas: latest,
            overallRoas: weekMetrics.roas, spend: weekMetrics.spend,
            campaigns: campaigns.slice(0, 5).map(c => ({ name: c.label, roas: c.roas, spend: c.spend })),
          }),
          severity: latest < 1 ? 'critical' : 'warning',
        });
      }
    }

    // Alert 2: CPA spikes per campaign
    for (const campaign of campaigns) {
      const cpaTrend = computeTrend(dailyCpaMap.get(campaign.label) || []);
      const cpaValues = dailyCpaMap.get(campaign.label) || [];
      if (cpaTrend.direction === 'declining' && cpaValues.length >= 3) {
        // "declining" CPA trend means CPA is increasing (worsening)
        const firstHalf = cpaValues.slice(0, Math.floor(cpaValues.length / 2));
        const secondHalf = cpaValues.slice(Math.floor(cpaValues.length / 2));
        const avgFirst = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
        const avgSecond = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
        const spikePercent = avgFirst > 0 ? ((avgSecond - avgFirst) / avgFirst) * 100 : 0;
        if (spikePercent > 30) {
          const conf = assessConfidence({ spend: campaign.spend, totalAccountSpend: totalSpend, conversions: campaign.conversions, impressions: campaign.impressions });
          if (conf.shouldRecommendAction) {
            alerts.push({
              user_id: userId, account_id: accountId,
              type: 'cpa_spike',
              title: `${campaign.label}: CPA spiked ${round(spikePercent, 0)}%`,
              content: await generateAlertContent('cpa_spike', {
                campaignName: campaign.label, spikePercent: round(spikePercent, 0),
                currentCpa: campaign.cpa, roas: campaign.roas, spend: campaign.spend,
              }),
              severity: spikePercent > 60 ? 'critical' : 'warning',
            });
          }
        }
      }
    }

    // Alert 3: Strong performer ready to scale
    for (const campaign of campaigns) {
      const conf = assessConfidence({ spend: campaign.spend, totalAccountSpend: totalSpend, conversions: campaign.conversions, impressions: campaign.impressions });
      if (campaign.roas >= 3 && conf.shouldRecommendAction && campaign.conversions >= 10) {
        const roasTrendC = computeTrend(dailyRoasMap.get(campaign.label) || []);
        if (roasTrendC.direction !== 'declining') {
          alerts.push({
            user_id: userId, account_id: accountId,
            type: 'scale_opportunity',
            title: `${campaign.label} hit ${round(campaign.roas, 1)}x ROAS — ready to scale`,
            content: await generateAlertContent('scale_opportunity', {
              campaignName: campaign.label, roas: campaign.roas,
              conversions: campaign.conversions, spend: campaign.spend,
              trend: roasTrendC.direction,
            }),
            severity: 'success',
          });
        }
      }
    }

    // Alert 4: Money being wasted on below-breakeven campaigns
    const belowBreakeven = campaigns.filter(c => c.roas < 1 && c.spend > 0);
    const wastedSpend = belowBreakeven.reduce((s, c) => s + c.spend, 0);
    if (belowBreakeven.length > 0 && wastedSpend > totalSpend * 0.15) {
      alerts.push({
        user_id: userId, account_id: accountId,
        type: 'wasted_spend',
        title: `${fmt(wastedSpend)} spent on ${belowBreakeven.length} below-breakeven campaigns`,
        content: await generateAlertContent('wasted_spend', {
          wastedSpend, totalSpend, count: belowBreakeven.length,
          campaigns: belowBreakeven.slice(0, 5).map(c => ({ name: c.label, roas: c.roas, spend: c.spend })),
        }),
        severity: wastedSpend > totalSpend * 0.3 ? 'critical' : 'warning',
      });
    }

    // Alert 5: Creative fatigue detection (CTR declining)
    for (const campaign of campaigns) {
      const ctrValues = dailyCtrMap.get(campaign.label) || [];
      const ctrTrend = computeTrend(ctrValues);
      if (ctrTrend.direction === 'declining' && ctrValues.length >= 4) {
        const avgCtr = ctrValues.reduce((s, v) => s + v, 0) / ctrValues.length;
        if (avgCtr < 1.0 && campaign.spend > totalSpend * 0.05) {
          alerts.push({
            user_id: userId, account_id: accountId,
            type: 'creative_fatigue',
            title: `Creative fatigue detected in ${campaign.label}`,
            content: await generateAlertContent('creative_fatigue', {
              campaignName: campaign.label, avgCtr: round(avgCtr, 2),
              trend: 'declining', spend: campaign.spend,
            }),
            severity: 'warning',
          });
        }
      }
    }

  } catch (err: any) {
    logger.error({ err: err.message }, `Autopilot error for account ${accountId}`);
  }

  return alerts;
}

/* ------------------------------------------------------------------ */
/*  Claude-powered alert content generation                            */
/* ------------------------------------------------------------------ */

async function generateAlertContent(type: string, data: any): Promise<string> {
  try {
    const systemPrompt = `You are Cosmisk Autopilot — a senior Meta Ads strategist delivering daily performance alerts to agency operators.

VOICE RULES:
- Write like a strategist briefing a colleague, not a dashboard notification.
- Be direct and specific. Reference exact campaign names, amounts, and percentages.
- 2-3 sentences max. No filler. Every word should earn its place.
- End with ONE concrete action the user should take today.
- Use plain prose — no bullet points, no markdown, no headers, no emojis.

BANNED WORDS: "optimize", "leverage", "significant", "notable", "I recommend", "consider exploring".
Instead of "optimize" say "fix", "cut", "scale", or "test". Instead of "I recommend" just state the action.

DATA CONFIDENCE AWARENESS:
- If total spend is under $50 or conversions are under 5, explicitly caveat that the data is too thin to act on confidently.
- A 20x ROAS on $10 spend is noise. A 3x ROAS on $500 spend is a real signal. Weight your urgency accordingly.
- Trends over 5+ days matter more than single-day spikes.`;

    const userContent = formatAlertData(type, data);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      temperature: 0.3,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    });
    return extractText(response) || generateFallbackContent(type, data);
  } catch {
    // Fallback to template-based content
    return generateFallbackContent(type, data);
  }
}

function formatAlertData(type: string, data: any): string {
  switch (type) {
    case 'roas_decline': {
      const campaignLines = (data.campaigns || [])
        .map((c: any) => `  - "${c.name}": ${round(c.roas, 2)}x ROAS on ${fmt(c.spend)} spend`)
        .join('\n');
      return `ALERT: ROAS Decline

Account-level ROAS dropped from ${round(data.weekAgoRoas, 2)}x to ${round(data.currentRoas, 2)}x over the past 7 days.
Overall 7-day average: ${round(data.overallRoas, 2)}x ROAS on ${fmt(data.spend)} total spend.
${data.spend < 50 ? '(Note: low spend — data confidence is limited.)\n' : ''}
Top campaigns by spend:
${campaignLines || '  (no campaign data)'}

Generate an alert explaining the decline and what to do about it.`;
    }

    case 'cpa_spike': {
      return `ALERT: CPA Spike

Campaign: "${data.campaignName}"
CPA increased ${data.spikePercent}% — now at ${fmt(data.currentCpa)} per acquisition.
Campaign ROAS: ${round(data.roas, 2)}x on ${fmt(data.spend)} spend.
${data.spend < 50 ? '(Note: low spend — this could be noise rather than a real trend.)\n' : ''}
Generate an alert explaining the CPA spike and what to do about it.`;
    }

    case 'scale_opportunity': {
      return `ALERT: Scale Opportunity

Campaign: "${data.campaignName}"
Delivering ${round(data.roas, 2)}x ROAS with ${data.conversions} conversions on ${fmt(data.spend)} spend.
ROAS trend: ${data.trend || 'stable'}.
${data.conversions < 10 ? '(Note: conversion volume is low — scaling may be premature.)\n' : ''}
Generate an alert explaining why this is ready to scale and by how much.`;
    }

    case 'wasted_spend': {
      const campaignLines = (data.campaigns || [])
        .map((c: any) => `  - "${c.name}": ${round(c.roas, 2)}x ROAS on ${fmt(c.spend)} spend`)
        .join('\n');
      return `ALERT: Wasted Spend

${fmt(data.wastedSpend)} spent on ${data.count} campaigns running below breakeven (< 1x ROAS).
That is ${round((data.wastedSpend / data.totalSpend) * 100, 0)}% of the total ${fmt(data.totalSpend)} weekly spend.

Below-breakeven campaigns:
${campaignLines || '  (no campaign data)'}

Generate an alert explaining the waste and which campaigns to cut or fix.`;
    }

    case 'creative_fatigue': {
      return `ALERT: Creative Fatigue

Campaign: "${data.campaignName}"
Average CTR has declined to ${data.avgCtr}% over the past 7 days (trend: ${data.trend}).
Campaign spend: ${fmt(data.spend)}.

Generate an alert explaining the creative fatigue signal and what to do next.`;
    }

    default:
      return `Alert type: ${type}\nData: ${JSON.stringify(data)}`;
  }
}

function generateFallbackContent(type: string, data: any): string {
  switch (type) {
    case 'roas_decline':
      return `Your overall ROAS dropped from ${round(data.weekAgoRoas, 1)}x to ${round(data.currentRoas, 1)}x this week on ${fmt(data.spend)} spend. Review your campaign mix and pause underperformers.`;
    case 'cpa_spike':
      return `${data.campaignName}'s CPA spiked ${data.spikePercent}% — now at ${fmt(data.currentCpa)}. Check for audience saturation or creative fatigue.`;
    case 'scale_opportunity':
      return `${data.campaignName} is delivering ${round(data.roas, 1)}x ROAS with ${data.conversions} conversions. Data is reliable — consider scaling budget by 15-20%.`;
    case 'wasted_spend':
      return `${fmt(data.wastedSpend)} is going to ${data.count} campaigns below breakeven. Cut these and reinvest in your profitable campaigns.`;
    case 'creative_fatigue':
      return `${data.campaignName} shows declining CTR (avg ${data.avgCtr}%). Creatives may be fatiguing — launch fresh concepts.`;
    default:
      return JSON.stringify(data);
  }
}

/* ------------------------------------------------------------------ */
/*  Main: run autopilot for all users                                  */
/* ------------------------------------------------------------------ */

export async function runAutopilot(): Promise<number> {
  const db = getDb();
  const users = db.prepare(`
    SELECT u.id, u.plan FROM users u
    WHERE u.onboarding_complete = 1
    AND EXISTS (SELECT 1 FROM meta_tokens mt WHERE mt.user_id = u.id)
  `).all() as Pick<UserRow, 'id' | 'plan'>[];

  let totalAlerts = 0;

  for (const user of users) {
    try {
      const tokenRow = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(user.id) as MetaTokenRow | undefined;
      if (!tokenRow) continue;
      if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
        logger.warn(`[autopilot] Skipping user ${user.id}: Meta token expired at ${tokenRow.expires_at}`);
        continue;
      }

      const token = decryptToken(tokenRow.encrypted_access_token);
      const meta = new MetaApiService(token);

      // Get all ad accounts
      const accountsResp = await meta.get<any>('/me/adaccounts', { fields: 'id,name', limit: '50' });
      const accounts = accountsResp.data || [];

      for (const account of accounts) {
        const alerts = await analyzeAccount(user.id, account.id, token);

        // Save alerts to DB
        for (const alert of alerts) {
          db.prepare(`
            INSERT INTO autopilot_alerts (id, user_id, account_id, type, title, content, severity)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(uuidv4(), alert.user_id, alert.account_id, alert.type, alert.title, alert.content, alert.severity);
          totalAlerts++;
        }
      }
    } catch (err: any) {
      logger.error({ err: err.message }, `Autopilot failed for user ${user.id}`);
    }
  }

  return totalAlerts;
}
