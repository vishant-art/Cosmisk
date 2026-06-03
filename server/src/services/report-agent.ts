/**
 * Client Report Agent — auto-generates performance reports
 * with memory-aware commentary ("Last report noted declining video ROAS — check if trend continued").
 *
 * Runs weekly per user. Fetches Meta Ads data, builds strategic report via Claude,
 * stores in reports table, and records episodes for future context.
 */

import { getDbAdapter } from '../db/adapter.js';
import { decryptToken } from './token-crypto.js';
import { MetaApiService } from './meta-api.js';
import { parseInsightMetrics, parseCampaignBreakdown } from './insights-parser.js';
import { assessConfidence, computeTrend } from './trend-analyzer.js';
import { buildContextWindow, recordEpisode, recordDecisionEpisode } from './agent-memory.js';
import { notifyAlert } from './notifications.js';
import { createMessage } from './llm-gateway.js';
import { extractText } from '../utils/claude-helpers.js';
import { v4 as uuidv4 } from 'uuid';
import type { MetaTokenRow, UserRow } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { correlationStore } from '../utils/request-context.js';
import {
  reportDataToSignals,
  enhanceReportOutput,
  isStrategicEnough,
} from './intelligence-integration.js';
import { filterInsights, checkInsightQuality } from './quality-gate.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ReportData {
  accountId: string;
  accountName: string;
  period: { start: string; end: string };
  metrics: {
    week: { spend: number; roas: number; cpa: number; ctr: number; impressions: number; conversions: number; revenue: number };
    month: { spend: number; roas: number; cpa: number; ctr: number; impressions: number; conversions: number; revenue: number };
  };
  topCampaigns: Array<{ name: string; spend: number; roas: number; cpa: number; conversions: number; trend: string }>;
  topCreatives: Array<{ name: string; format: string; roas: number; hookDna: string[]; visualDna: string[] }>;
  strategicAnalysis: string;
  keyInsights: string[];
  recommendations: string[];
  memoryCommentary: string;
}

/* ------------------------------------------------------------------ */
/*  Run report for all users                                           */
/* ------------------------------------------------------------------ */

export async function runReportAgentAll(): Promise<number> {
  const db = getDbAdapter();
  const users = await db.all(`
    SELECT u.id FROM users u
    WHERE u.onboarding_complete = 1
    AND EXISTS (SELECT 1 FROM meta_tokens mt WHERE mt.user_id = u.id)
  `) as { id: string }[];

  let completed = 0;
  for (const user of users) {
    try {
      // Get user's ad accounts
      const tokenRow = await db.get('SELECT * FROM meta_tokens WHERE user_id = ?', [user.id]) as MetaTokenRow | undefined;
      if (!tokenRow) continue;

      const accessToken = decryptToken(tokenRow.encrypted_access_token);
      const meta = new MetaApiService(accessToken);

      // Fetch ad accounts
      const accountsResp = await meta.get<any>('/me/adaccounts', {
        fields: 'account_id,name',
        limit: '20',
      });
      const accounts = accountsResp.data || [];

      for (const acct of accounts.slice(0, 5)) {
        try {
          await runReportAgent(user.id, acct.account_id || acct.id, meta);
          completed++;
        } catch (err: unknown) {
          logger.error({ err }, `[ReportAgent] Failed for account ${acct.account_id}`);
        }
      }
    } catch (err: unknown) {
      logger.error({ err }, `[ReportAgent] Failed for user ${user.id}`);
    }
  }
  return completed;
}

/* ------------------------------------------------------------------ */
/*  Run report for a single user+account                               */
/* ------------------------------------------------------------------ */

export async function runReportAgent(userId: string, accountId: string, metaService?: MetaApiService): Promise<string> {
  const db = getDbAdapter();
  const runId = uuidv4();
  correlationStore.enterWith({ correlationId: runId });

  await db.run(`
    INSERT INTO agent_runs (id, agent_type, user_id, status, started_at)
    VALUES (?, 'report', ?, 'running', datetime('now'))
  `, [runId, userId]);

  try {
    // Build memory context for continuity between reports
    const memoryContext = await buildContextWindow(userId, 'report', {
      maxEpisodes: 10,
      entityTypes: ['campaign', 'metric', 'pattern'],
    });

    // Get Meta API service
    let meta = metaService;
    if (!meta) {
      const tokenRow = await db.get('SELECT * FROM meta_tokens WHERE user_id = ?', [userId]) as MetaTokenRow | undefined;
      if (!tokenRow) throw new Error('No Meta token found');
      meta = new MetaApiService(decryptToken(tokenRow.encrypted_access_token));
    }

    // Fetch performance data
    const [weekData, monthData, campaignData, accountInfo] = await Promise.all([
      meta.get<any>(`/${accountId}/insights`, {
        fields: 'spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas',
        date_preset: 'last_7d', level: 'account',
      }),
      meta.get<any>(`/${accountId}/insights`, {
        fields: 'spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas',
        date_preset: 'last_30d', level: 'account',
      }),
      meta.get<any>(`/${accountId}/insights`, {
        fields: 'campaign_name,campaign_id,spend,impressions,clicks,ctr,actions,action_values,purchase_roas',
        level: 'campaign', date_preset: 'last_7d', limit: '50',
      }),
      meta.get<any>(`/${accountId}`, { fields: 'name' }),
    ]);

    const weekMetrics = parseInsightMetrics(weekData.data?.[0] || {});
    const monthMetrics = parseInsightMetrics(monthData.data?.[0] || {});
    const campaigns = parseCampaignBreakdown(campaignData.data || []);

    // Fetch top creative DNA from cache
    const topCreatives = await db.all(`
      SELECT ad_name, hook, visual, audio, visual_analysis FROM dna_cache
      WHERE account_id = ? AND visual_analysis IS NOT NULL
      ORDER BY analyzed_at DESC LIMIT 10
    `, [accountId]) as Array<{ ad_name: string; hook: string; visual: string; audio: string; visual_analysis: string }>;

    // Get last report for comparison
    const lastReport = await db.get(`
      SELECT data, generated_at FROM reports
      WHERE user_id = ? AND account_id = ? AND type = 'agent_weekly'
      ORDER BY generated_at DESC LIMIT 1
    `, [userId, accountId]) as { data: string; generated_at: string } | undefined;

    // Build Claude prompt
    const prompt = buildReportPrompt(
      accountInfo.name || accountId,
      weekMetrics, monthMetrics, campaigns,
      topCreatives, lastReport, memoryContext,
    );

    const response = await createMessage({
      userId,
      operation: 'report-agent.generateAccountReport',
      request: {
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }],
      },
    });

    const rawText = extractText(response);
    let analysis = { insights: [] as string[], recommendations: [] as string[], commentary: '', summary: '' };

    try {
      const jsonStr = rawText.trim();
      const match = jsonStr.match(/\{[\s\S]*\}/);
      if (match) analysis = JSON.parse(match[0]);
    } catch {
      analysis.summary = rawText?.slice(0, 500) || 'Report generated';
    }

    // Build report data
    const reportData: ReportData = {
      accountId,
      accountName: accountInfo.name || accountId,
      period: { start: new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0], end: new Date().toISOString().split('T')[0] },
      metrics: {
        week: { spend: weekMetrics.spend, roas: weekMetrics.roas, cpa: weekMetrics.cpa, ctr: weekMetrics.ctr, impressions: weekMetrics.impressions, conversions: weekMetrics.conversions, revenue: weekMetrics.revenue },
        month: { spend: monthMetrics.spend, roas: monthMetrics.roas, cpa: monthMetrics.cpa, ctr: monthMetrics.ctr, impressions: monthMetrics.impressions, conversions: monthMetrics.conversions, revenue: monthMetrics.revenue },
      },
      topCampaigns: campaigns.slice(0, 5).map(c => ({
        name: c.label, spend: c.spend, roas: c.roas, cpa: c.cpa,
        conversions: c.conversions, trend: c.trend > 0 ? 'improving' : c.trend < 0 ? 'declining' : 'stable',
      })),
      topCreatives: topCreatives.slice(0, 5).map(c => ({
        name: c.ad_name || 'Unnamed',
        format: 'video',
        roas: 0,
        hookDna: c.hook ? JSON.parse(c.hook) : [],
        visualDna: c.visual ? JSON.parse(c.visual) : [],
      })),
      strategicAnalysis: analysis.summary || 'Report generated',
      keyInsights: analysis.insights || [],
      recommendations: analysis.recommendations || [],
      memoryCommentary: analysis.commentary || '',
    };

    // === INTELLIGENCE CORE ENHANCEMENT ===
    // Filter out generic insights and enhance with strategic intelligence
    try {
      const signals = reportDataToSignals(reportData);
      const enhanced = await enhanceReportOutput(
        {
          strategicAnalysis: reportData.strategicAnalysis,
          keyInsights: reportData.keyInsights,
          recommendations: reportData.recommendations,
        },
        userId, // Use userId as clientId
        signals
      );

      // Apply enhanced insights (filtering out generic ones)
      reportData.keyInsights = enhanced.keyInsights;
      reportData.recommendations = enhanced.recommendations;

      if (enhanced.qualityCheck.genericInsightsFiltered > 0) {
        logger.info({
          filtered: enhanced.qualityCheck.genericInsightsFiltered,
        }, '[ReportAgent] Filtered generic insights');
      }
    } catch (err) {
      logger.warn({ err }, '[ReportAgent] Intelligence enhancement failed, using original');
    }

    // === QUALITY GATE: Final filter for strategic depth ===
    const insightFiltered = filterInsights(
      reportData.keyInsights.map(text => ({ text })),
      { minScore: 50, requireSynthesis: false, allowObvious: false }
    );
    const recFiltered = filterInsights(
      reportData.recommendations.map(text => ({ text })),
      { minScore: 50, requireSynthesis: false, allowObvious: false }
    );

    reportData.keyInsights = insightFiltered.passed.map(i => i.text);
    reportData.recommendations = recFiltered.passed.map(r => r.text);

    if (insightFiltered.stats.filtered > 0 || recFiltered.stats.filtered > 0) {
      logger.info({
        insightsFiltered: insightFiltered.stats.filtered,
        recsFiltered: recFiltered.stats.filtered,
      }, '[ReportAgent] Quality gate filtered obvious content');
    }

    // Save to reports table
    const reportId = uuidv4();
    await db.run(`
      INSERT INTO reports (id, user_id, title, type, account_id, date_preset, status, data, generated_at)
      VALUES (?, ?, ?, 'agent_weekly', ?, 'last_7d', 'completed', ?, datetime('now'))
    `, [reportId, userId, `Weekly Report — ${reportData.accountName}`, accountId, JSON.stringify(reportData)]);

    // Update agent run
    const summary = `Weekly report for ${reportData.accountName}: ${reportData.keyInsights.length} insights, ${reportData.recommendations.length} recommendations. Week ROAS: ${weekMetrics.roas.toFixed(2)}x`;

    await db.run(`
      UPDATE agent_runs SET status = 'completed', completed_at = datetime('now'),
      summary = ?, raw_context = ? WHERE id = ?
    `, [summary, JSON.stringify(reportData), runId]);

    // Record episode for future reports
    await recordEpisode(
      userId, 'report',
      `Generated weekly report for ${reportData.accountName}. ROAS: ${weekMetrics.roas.toFixed(2)}x, Spend: $${weekMetrics.spend.toFixed(0)}. Top insight: ${(analysis.insights?.[0] || 'none')}`,
      memoryContext,
    ).catch((err) => logger.warn({ err: err instanceof Error ? err.message : err }, 'recordEpisode failed in report-agent'));

    // Notify user
    await notifyAlert(userId, {
      type: 'report',
      title: `Weekly Report Ready — ${reportData.accountName}`,
      content: summary,
      severity: 'info',
      accountId,
    }).catch((err) => logger.warn({ err: err instanceof Error ? err.message : err }, 'notifyAlert failed in report-agent'));

    logger.info(`[ReportAgent] Completed report for ${reportData.accountName} (${userId})`);
    return runId;

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await db.run(`
      UPDATE agent_runs SET status = 'failed', completed_at = datetime('now'),
      summary = ? WHERE id = ?
    `, [`Error: ${message}`, runId]);
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/*  Build Claude prompt                                                */
/* ------------------------------------------------------------------ */

function buildReportPrompt(
  accountName: string,
  weekMetrics: any,
  monthMetrics: any,
  campaigns: any[],
  creatives: any[],
  lastReport: { data: string; generated_at: string } | undefined,
  memoryContext: string,
): string {
  let lastReportContext = 'No previous report available.';
  if (lastReport) {
    try {
      const prev = JSON.parse(lastReport.data);
      lastReportContext = `Last report (${lastReport.generated_at}): ROAS was ${prev.metrics?.week?.roas?.toFixed(2) || '?'}x, Spend was $${prev.metrics?.week?.spend?.toFixed(0) || '?'}. Insights: ${(prev.keyInsights || []).join('; ')}`;
    } catch (err) {
      logger.debug({ err: err instanceof Error ? err.message : err }, 'Failed to parse last report data');
    }
  }

  const creativeDna = creatives.slice(0, 5).map(c => {
    const hook = c.hook ? JSON.parse(c.hook) : [];
    const visual = c.visual ? JSON.parse(c.visual) : [];
    return `- ${c.ad_name}: Hooks=[${hook.join(',')}], Visual=[${visual.join(',')}]`;
  }).join('\n');

  return `You are a senior performance marketing strategist analyzing ad account "${accountName}".

AGENT MEMORY (past context):
${memoryContext || 'No prior context.'}

LAST REPORT:
${lastReportContext}

THIS WEEK'S DATA:
- Spend: $${weekMetrics.spend.toFixed(2)} | ROAS: ${weekMetrics.roas.toFixed(2)}x | CPA: $${weekMetrics.cpa.toFixed(2)}
- CTR: ${(weekMetrics.ctr * 100).toFixed(2)}% | Impressions: ${weekMetrics.impressions.toLocaleString()} | Conversions: ${weekMetrics.conversions}

30-DAY DATA:
- Spend: $${monthMetrics.spend.toFixed(2)} | ROAS: ${monthMetrics.roas.toFixed(2)}x | CPA: $${monthMetrics.cpa.toFixed(2)}

TOP CAMPAIGNS (7d):
${campaigns.slice(0, 10).map(c => `- ${c.label}: Spend=$${c.spend.toFixed(0)}, ROAS=${c.roas.toFixed(2)}x, CPA=$${c.cpa.toFixed(2)}, CTR=${(c.ctr * 100).toFixed(2)}%`).join('\n')}

CREATIVE DNA (top ads):
${creativeDna || 'No creative DNA data available.'}

Generate a strategic weekly report. Compare to last report if available. Note trend continuations or reversals.

Respond in JSON:
{
  "summary": "2-3 sentence executive summary",
  "insights": ["insight 1", "insight 2", ...],
  "recommendations": ["recommendation 1", "recommendation 2", ...],
  "commentary": "Memory-aware commentary comparing to past reports and noting patterns"
}`;
}
