import { getDb } from '../db/index.js';
import { decryptToken } from './token-crypto.js';
import { MetaApiService } from './meta-api.js';
import { parseInsightMetrics, parseCampaignBreakdown } from './insights-parser.js';
import { assessConfidence, computeTrend } from './trend-analyzer.js';
import { round, fmt } from './format-helpers.js';
import { notifyAlert } from './notifications.js';
import { safeFetch, safeJson } from '../utils/safe-fetch.js';
import { config } from '../config.js';
import Anthropic from '@anthropic-ai/sdk';
import { extractText } from '../utils/claude-helpers.js';
import { v4 as uuidv4 } from 'uuid';
import { buildContextWindow, recordDecisionEpisode, reinforceEpisode, penalizeEpisode } from './agent-memory.js';
import type { MetaTokenRow, ShopifyTokenRow, UserRow, AgentRunRow, AgentDecisionRow } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { runOOSCheck, runOOSCheckForClient } from './oos-detector.js';
import { runDiscountLeakageCheck, runDiscountLeakageForClient } from './discount-leakage-detector.js';
import { quickCohortLTVCheck } from './cohort-ltv-analyzer.js';
import {
  getClientContext, getWatchdogStore, updateWatchdogStore, getWatchdogUrgencyThreshold,
  getOOSAlertThreshold, getDiscountLeakageAlertThreshold, createRecommendation,
  type ServiceClient,
} from './service-clients.js';
import {
  watchdogSnapshotToSignals,
  buildStrategicPromptSection,
  enhanceWatchdogDecisions,
} from './intelligence-integration.js';
import { filterDecisions, type DecisionInput } from './quality-gate.js';
import { saveRecommendation } from './intelligence-persistence.js';
import { trackRecommendation } from './reality-testing.js';

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AccountSnapshot {
  accountId: string;
  accountName: string;
  week: {
    spend: number; roas: number; cpa: number; ctr: number;
    impressions: number; conversions: number; revenue: number;
  };
  month: {
    spend: number; roas: number; cpa: number; ctr: number;
    impressions: number; conversions: number; revenue: number;
  };
  campaigns: Array<{
    name: string; spend: number; roas: number; cpa: number;
    ctr: number; conversions: number; impressions: number;
    roasTrend: string; cpaTrend: string; ctrTrend: string;
    confidence: string;
  }>;
  dailyRoas: number[];
  dailySpend: number[];
}

interface WatchdogDecision {
  type: string;
  targetId: string;
  targetName: string;
  reasoning: string;
  confidence: 'high' | 'moderate' | 'low';
  urgency: 'low' | 'medium' | 'high' | 'critical';
  suggestedAction: string;
  estimatedImpact: string;
}

const VALID_ACTIONS = new Set(['pause', 'reduce_budget', 'increase_budget', 'new_creative', 'monitor']);
const VALID_CONFIDENCES = new Set(['high', 'moderate', 'low']);
const VALID_URGENCIES = new Set(['low', 'medium', 'high', 'critical']);

/* ------------------------------------------------------------------ */
/*  Validate Claude's decision output (#9)                             */
/* ------------------------------------------------------------------ */

function validateDecision(d: any): WatchdogDecision | null {
  if (!d || typeof d !== 'object') return null;
  if (!d.reasoning || typeof d.reasoning !== 'string') return null;
  if (!d.suggestedAction || !VALID_ACTIONS.has(d.suggestedAction)) return null;

  return {
    type: String(d.type || 'unknown'),
    targetId: String(d.targetId || ''),
    targetName: String(d.targetName || 'Unknown'),
    reasoning: String(d.reasoning),
    confidence: VALID_CONFIDENCES.has(d.confidence) ? d.confidence : 'low',
    urgency: VALID_URGENCIES.has(d.urgency) ? d.urgency : 'medium',
    suggestedAction: d.suggestedAction,
    estimatedImpact: String(d.estimatedImpact || ''),
  };
}

/* ------------------------------------------------------------------ */
/*  Gather account snapshot                                            */
/* ------------------------------------------------------------------ */

async function gatherAccountSnapshot(
  meta: MetaApiService,
  accountId: string,
): Promise<AccountSnapshot> {
  // Parallel fetch: 7d account, 30d account, 7d daily, 7d campaigns, 7d daily campaigns
  const [weekData, monthData, dailyData, campaignData, dailyCampaignData, accountInfo] = await Promise.all([
    meta.get<any>(`/${accountId}/insights`, {
      fields: 'spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas',
      date_preset: 'last_7d',
      level: 'account',
    }),
    meta.get<any>(`/${accountId}/insights`, {
      fields: 'spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas',
      date_preset: 'last_30d',
      level: 'account',
    }),
    meta.get<any>(`/${accountId}/insights`, {
      fields: 'spend,impressions,clicks,actions,action_values,purchase_roas',
      date_preset: 'last_7d',
      time_increment: '1',
      level: 'account',
    }),
    meta.get<any>(`/${accountId}/insights`, {
      fields: 'campaign_name,campaign_id,spend,impressions,clicks,ctr,actions,action_values,purchase_roas',
      level: 'campaign',
      date_preset: 'last_7d',
      limit: '50',
    }),
    meta.get<any>(`/${accountId}/insights`, {
      fields: 'campaign_name,spend,purchase_roas,actions,ctr',
      level: 'campaign',
      date_preset: 'last_7d',
      time_increment: '1',
      limit: '200',
    }),
    meta.get<any>(`/${accountId}`, { fields: 'name' }),
  ]);

  const weekMetrics = parseInsightMetrics(weekData.data?.[0] || {});
  const monthMetrics = parseInsightMetrics(monthData.data?.[0] || {});
  const dailyRows = (dailyData.data || []).map((d: any) => parseInsightMetrics(d));
  const campaigns = parseCampaignBreakdown(campaignData.data || []);
  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);

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

  return {
    accountId,
    accountName: accountInfo.name || accountId,
    week: {
      spend: weekMetrics.spend, roas: weekMetrics.roas, cpa: weekMetrics.cpa,
      ctr: weekMetrics.ctr, impressions: weekMetrics.impressions,
      conversions: weekMetrics.conversions, revenue: weekMetrics.revenue,
    },
    month: {
      spend: monthMetrics.spend, roas: monthMetrics.roas, cpa: monthMetrics.cpa,
      ctr: monthMetrics.ctr, impressions: monthMetrics.impressions,
      conversions: monthMetrics.conversions, revenue: monthMetrics.revenue,
    },
    campaigns: campaigns.map(c => {
      const conf = assessConfidence({
        spend: c.spend, totalAccountSpend: totalSpend,
        conversions: c.conversions, impressions: c.impressions,
      });
      return {
        name: c.label, spend: c.spend, roas: c.roas, cpa: c.cpa,
        ctr: c.ctr, conversions: c.conversions, impressions: c.impressions,
        roasTrend: computeTrend(dailyRoasMap.get(c.label) || []).label,
        cpaTrend: computeTrend(dailyCpaMap.get(c.label) || []).label,
        ctrTrend: computeTrend(dailyCtrMap.get(c.label) || []).label,
        confidence: conf.level,
      };
    }),
    dailyRoas: dailyRows.map((d: any) => d.roas),
    dailySpend: dailyRows.map((d: any) => d.spend),
  };
}

/* ------------------------------------------------------------------ */
/*  Compare to past decisions for learning context                     */
/* ------------------------------------------------------------------ */

function getPastDecisions(userId: string, accountId: string): AgentDecisionRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM agent_decisions
    WHERE user_id = ? AND account_id = ?
    ORDER BY rowid DESC LIMIT 20
  `).all(userId, accountId) as AgentDecisionRow[];
}

/* ------------------------------------------------------------------ */
/*  Claude-powered reasoning                                           */
/* ------------------------------------------------------------------ */

async function reasonAboutPerformance(
  snapshot: AccountSnapshot,
  pastDecisions: AgentDecisionRow[],
  memoryContext: string,
  clientId?: string,
): Promise<WatchdogDecision[]> {
  const pastContext = pastDecisions.length > 0
    ? `\n\nPAST DECISIONS (learn from these):\n${pastDecisions.map(d =>
        `- ${d.type} on "${d.target_name}": ${d.suggested_action} (${d.status}${d.outcome ? `, outcome: ${d.outcome}` : ''})`
      ).join('\n')}`
    : '';

  const memorySection = memoryContext
    ? `\n\nAGENT MEMORY:\n${memoryContext}`
    : '';

  // === INTELLIGENCE CORE INTEGRATION ===
  // Convert snapshot to signals and get strategic context
  let strategicSection = '';
  if (clientId) {
    try {
      const signals = watchdogSnapshotToSignals(snapshot);
      strategicSection = await buildStrategicPromptSection(clientId, signals);
    } catch (err) {
      logger.warn({ err }, '[Watchdog] Intelligence integration failed, continuing without');
    }
  }

  const prompt = `You are the Ad Watchdog, an elite performance intelligence agent (NOT a dashboard).

CRITICAL: You are advising experienced media buyers spending ₹30L+/month. They already know basic metrics.
- Do NOT state obvious observations like "CTR dropped" or "CPA increased"
- DO explain WHY patterns exist and WHAT strategic action to take
- Every insight must synthesize multiple signals, not just report one metric
- If you can't provide strategic value, return an empty array []
${strategicSection}
You are monitoring Meta Ads performance.

ACCOUNT SNAPSHOT:
- Account: ${snapshot.accountName} (${snapshot.accountId})
- 7-day: ${fmt(snapshot.week.spend)} spend, ${round(snapshot.week.roas, 2)}x ROAS, ${fmt(snapshot.week.cpa)} CPA, ${round(snapshot.week.ctr, 2)}% CTR, ${snapshot.week.conversions} conversions
- 30-day: ${fmt(snapshot.month.spend)} spend, ${round(snapshot.month.roas, 2)}x ROAS, ${fmt(snapshot.month.cpa)} CPA, ${round(snapshot.month.ctr, 2)}% CTR, ${snapshot.month.conversions} conversions
- Daily ROAS trend: [${snapshot.dailyRoas.map(r => round(r, 2)).join(', ')}]

CAMPAIGNS:
${snapshot.campaigns.map(c =>
  `- "${c.name}": ${fmt(c.spend)} spend, ${round(c.roas, 2)}x ROAS, ${fmt(c.cpa)} CPA, ${round(c.ctr, 2)}% CTR, ${c.conversions} conv | ROAS ${c.roasTrend} | CPA ${c.cpaTrend} | CTR ${c.ctrTrend} | confidence: ${c.confidence}`
).join('\n')}
${pastContext}${memorySection}

RULES:
1. Think like an elite D2C operator, not a rule engine. Consider trends, confidence, and context.
2. NEVER state obvious metrics without explaining WHY and WHAT TO DO ABOUT IT.
3. Every decision must synthesize at least 2 signals (e.g., "ROAS declining + frequency increasing = audience fatigue").
4. Be specific: name the campaign/ad, state the action, quantify the impact.
5. Consider data confidence: 1 conversion on $5 spend means nothing. 50 conversions on $500 is a real pattern.
6. If you recommended something before and the outcome was bad, learn from it.
7. For each recommendation, specify ONE action: pause, reduce_budget, increase_budget, new_creative, or monitor.
8. Quality check: Would an experienced media buyer already know this? If yes, don't include it.

Respond with a JSON array of decisions. Each decision:
{
  "type": "roas_decline" | "cpa_spike" | "scale_opportunity" | "creative_fatigue" | "wasted_spend" | "budget_reallocation",
  "targetId": "campaign_id or account_id",
  "targetName": "human readable name",
  "reasoning": "2-3 sentence explanation of WHY, referencing specific data",
  "confidence": "high" | "moderate" | "low",
  "urgency": "low" | "medium" | "high" | "critical",
  "suggestedAction": "pause" | "reduce_budget" | "increase_budget" | "new_creative" | "monitor",
  "estimatedImpact": "e.g. 'Save $X/day' or 'Potential +Y% ROAS'"
}

If the account is performing well and no action is needed, return an empty array [].
Return ONLY the JSON array, no other text.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText = extractText(response);
    if (!rawText) return [];

    const jsonStr = rawText.trim();

    // Try direct parse first, then regex extraction (#8)
    let parsed: any[];
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      const match = jsonStr.match(/\[[\s\S]*?\]/);
      if (!match) return [];
      parsed = JSON.parse(match[0]);
    }

    if (!Array.isArray(parsed)) return [];

    // Validate each decision (#9)
    return parsed.map(validateDecision).filter((d): d is WatchdogDecision => d !== null);
  } catch (err: any) {
    logger.error({ err: err.message }, '[Watchdog] Claude reasoning failed');
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Execute approved decision (with user-scoping #6)                   */
/* ------------------------------------------------------------------ */

export async function executeDecision(decisionId: string, userId?: string): Promise<{ success: boolean; message: string }> {
  const db = getDb();

  // User-scoped query when userId provided (#6)
  const decision = userId
    ? db.prepare('SELECT * FROM agent_decisions WHERE id = ? AND user_id = ?').get(decisionId, userId) as AgentDecisionRow | undefined
    : db.prepare('SELECT * FROM agent_decisions WHERE id = ?').get(decisionId) as AgentDecisionRow | undefined;

  if (!decision) return { success: false, message: 'Decision not found' };
  if (decision.status !== 'approved') return { success: false, message: `Decision status is ${decision.status}, expected approved` };

  const tokenRow = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(decision.user_id) as MetaTokenRow | undefined;
  if (!tokenRow) return { success: false, message: 'No Meta token found' };

  const token = decryptToken(tokenRow.encrypted_access_token);
  const meta = new MetaApiService(token);

  try {
    switch (decision.suggested_action) {
      case 'pause': {
        // Use MetaApiService instead of raw fetch (#2)
        const resp = await safeFetch(`${config.graphApiBase}/${decision.target_id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: token, status: 'PAUSED' }),
          service: 'Meta Marketing API',
        });
        if (!resp.ok) {
          const err = await safeJson(resp);
          return { success: false, message: `Meta API error: ${err?.error?.message || 'Unknown'}` };
        }
        break;
      }

      case 'reduce_budget':
      case 'increase_budget': {
        const adsetsResp = await meta.get<any>(`/${decision.target_id}/adsets`, {
          fields: 'id,daily_budget',
          limit: '10',
        });
        const adsets = adsetsResp.data || [];
        const pct = decision.suggested_action === 'reduce_budget' ? 0.8 : 1.2;

        // Parallel budget adjustments with error checking (#3, #12)
        const results = await Promise.allSettled(
          adsets.map(async (adset: any) => {
            const currentBudget = parseInt(adset.daily_budget || '0', 10);
            if (!currentBudget) return { skipped: true };
            const newBudget = Math.max(100, Math.round(currentBudget * pct));
            const resp = await safeFetch(`${config.graphApiBase}/${adset.id}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ access_token: token, daily_budget: newBudget }),
              service: 'Meta Marketing API',
            });
            if (!resp.ok) {
              const err = await safeJson(resp);
              throw new Error(`Adset ${adset.id}: ${err?.error?.message || 'Unknown error'}`);
            }
            return { adsetId: adset.id, newBudget };
          })
        );

        const failures = results.filter(r => r.status === 'rejected');
        if (failures.length > 0 && failures.length === adsets.length) {
          return { success: false, message: `All budget changes failed: ${(failures[0] as PromiseRejectedResult).reason}` };
        }
        if (failures.length > 0) {
          logger.warn(`[Watchdog] ${failures.length}/${adsets.length} budget changes failed for ${decision.target_name}`);
        }
        break;
      }

      case 'new_creative':
      case 'monitor':
        break;

      default:
        return { success: false, message: `Unknown action: ${decision.suggested_action}` };
    }

    db.prepare(`
      UPDATE agent_decisions SET status = 'executed', executed_at = datetime('now')
      WHERE id = ?
    `).run(decisionId);

    return { success: true, message: `Executed: ${decision.suggested_action} on "${decision.target_name}"` };
  } catch (err: any) {
    return { success: false, message: `Execution failed: ${err.message}` };
  }
}

/* ------------------------------------------------------------------ */
/*  Check outcomes of past decisions (weekly)                          */
/* ------------------------------------------------------------------ */

export async function checkOutcomes(): Promise<number> {
  const db = getDb();
  const decisions = db.prepare(`
    SELECT * FROM agent_decisions
    WHERE status = 'executed'
    AND outcome_checked_at IS NULL
    AND executed_at < datetime('now', '-7 days')
    LIMIT 50
  `).all() as AgentDecisionRow[];

  let checked = 0;

  for (const decision of decisions) {
    try {
      const tokenRow = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(decision.user_id) as MetaTokenRow | undefined;
      if (!tokenRow) continue;

      const token = decryptToken(tokenRow.encrypted_access_token);
      const meta = new MetaApiService(token);

      const currentData = await meta.get<any>(`/${decision.target_id}/insights`, {
        fields: 'spend,impressions,clicks,ctr,actions,action_values,purchase_roas',
        date_preset: 'last_7d',
      }).catch(() => ({ data: [] }));

      const current = parseInsightMetrics(currentData.data?.[0] || {});

      let outcome = 'unknown';
      let isPositive = false;

      if (decision.suggested_action === 'pause') {
        outcome = current.spend === 0 ? 'positive: confirmed_paused' : 'neutral: still_spending';
        isPositive = current.spend === 0;
      } else if (decision.suggested_action === 'reduce_budget') {
        // Positive if ROAS improved post-reduction (#1 — fixed: compare to breakeven, not phantom field)
        outcome = `post_reduction: ${round(current.roas, 2)}x ROAS, ${fmt(current.spend)} spend`;
        isPositive = current.roas > 1.0; // profitable after reduction = good decision
      } else if (decision.suggested_action === 'increase_budget') {
        outcome = `post_increase: ${round(current.roas, 2)}x ROAS, ${fmt(current.spend)} spend`;
        isPositive = current.roas > 1.5; // still strong after scaling
      } else {
        outcome = `current: ${round(current.roas, 2)}x ROAS, ${round(current.ctr, 2)}% CTR`;
        isPositive = current.roas > 1.0;
      }

      db.prepare(`
        UPDATE agent_decisions
        SET outcome_checked_at = datetime('now'), outcome = ?
        WHERE id = ?
      `).run(outcome, decision.id);

      // Reinforce or penalize related episodes
      const episodes = db.prepare(`
        SELECT id FROM agent_episodes
        WHERE user_id = ? AND agent_type = 'watchdog'
        AND event LIKE ?
        ORDER BY created_at DESC LIMIT 1
      `).all(decision.user_id, `%${decision.target_name}%`) as Array<{ id: string }>;

      for (const ep of episodes) {
        if (isPositive) {
          reinforceEpisode(ep.id);
        } else {
          penalizeEpisode(ep.id);
        }
      }

      checked++;
    } catch (err: any) {
      logger.error({ err: err.message }, `[Watchdog] Outcome check failed for decision ${decision.id}`);
    }
  }

  return checked;
}

/* ------------------------------------------------------------------ */
/*  Main: run watchdog for all users                                   */
/* ------------------------------------------------------------------ */

export async function runWatchdog(): Promise<{ runs: number; decisions: number }> {
  const db = getDb();
  const users = db.prepare(`
    SELECT u.id, u.plan, u.name FROM users u
    WHERE u.onboarding_complete = 1
    AND EXISTS (SELECT 1 FROM meta_tokens mt WHERE mt.user_id = u.id)
  `).all() as Pick<UserRow, 'id' | 'plan' | 'name'>[];

  let totalRuns = 0;
  let totalDecisions = 0;

  for (const user of users) {
    try {
      const tokenRow = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(user.id) as MetaTokenRow | undefined;
      if (!tokenRow) continue;
      if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
        logger.warn(`[Watchdog] Skipping user ${user.id}: Meta token expired`);
        continue;
      }

      const token = decryptToken(tokenRow.encrypted_access_token);
      const meta = new MetaApiService(token);

      const accountsResp = await meta.get<any>('/me/adaccounts', { fields: 'id,name', limit: '50' });
      const accounts = accountsResp.data || [];

      // Process accounts with bounded concurrency (#11)
      const ACCOUNT_CONCURRENCY = 3;
      for (let i = 0; i < accounts.length; i += ACCOUNT_CONCURRENCY) {
        const batch = accounts.slice(i, i + ACCOUNT_CONCURRENCY);
        const batchResults = await Promise.allSettled(
          batch.map(async (account: any) => {
            const runId = uuidv4();

            db.prepare(`
              INSERT INTO agent_runs (id, agent_type, user_id, status, started_at)
              VALUES (?, 'watchdog', ?, 'running', datetime('now'))
            `).run(runId, user.id);

            try {
              const snapshot = await gatherAccountSnapshot(meta, account.id);
              const pastDecisions = getPastDecisions(user.id, account.id);
              const memoryContext = buildContextWindow(user.id, 'watchdog', {
                maxEpisodes: 10,
                entityTypes: ['campaign', 'adset', 'metric'],
              });

              // Pass user.id as clientId for intelligence integration
              const decisions = await reasonAboutPerformance(snapshot, pastDecisions, memoryContext, user.id);

              // OOS Detection + Discount Leakage Detection (requires Shopify connection)
              const shopifyRow = db.prepare('SELECT * FROM shopify_tokens WHERE user_id = ?').get(user.id) as ShopifyTokenRow | undefined;
              if (shopifyRow) {
                const shopifyToken = decryptToken(shopifyRow.encrypted_access_token);

                // OOS Detection: Check for ads spending on out-of-stock products
                try {
                  const oosResult = await runOOSCheck({
                    shopDomain: shopifyRow.shop_domain,
                    shopifyToken,
                    metaAccountId: account.id,
                    metaToken: token,
                    days: 7,
                  });

                  if (oosResult.hasIssues && oosResult.wastedSpend > 100) {
                    const topAd = oosResult.topMatches[0];
                    decisions.push({
                      type: 'oos_wasted_spend',
                      targetId: topAd?.adId || account.id,
                      targetName: topAd ? `${topAd.adName} → ${topAd.productTitle}` : 'Multiple ads',
                      reasoning: oosResult.summary,
                      confidence: 'high',
                      urgency: oosResult.wastedSpend > 1000 ? 'high' : 'medium',
                      suggestedAction: 'pause',
                      estimatedImpact: `Save Rs ${oosResult.wastedSpend.toFixed(0)}/week`,
                    });
                  }
                } catch (oosErr: any) {
                  logger.warn({ err: oosErr.message }, '[Watchdog] OOS check failed, continuing');
                }

                // Discount Leakage Detection: Check for leaked discount codes
                try {
                  const brandName = snapshot.accountName.replace(/[^a-zA-Z0-9\s]/g, '').trim();
                  if (brandName) {
                    const leakageResult = await runDiscountLeakageCheck({
                      shopDomain: shopifyRow.shop_domain,
                      shopifyToken,
                      brandName,
                      userId: user.id,
                      skipRevenueImpact: false,
                    });

                    if (leakageResult.success && leakageResult.report && leakageResult.report.leakedCodes.length > 0) {
                      const report = leakageResult.report;
                      decisions.push({
                        type: 'discount_leakage',
                        targetId: 'discount_codes',
                        targetName: `${report.leakedCodes.length} leaked discount codes`,
                        reasoning: `Found ${report.leakedCodes.length} discount codes leaked on coupon sites. Codes: ${report.leakedCodes.slice(0, 3).map(l => l.code).join(', ')}${report.leakedCodes.length > 3 ? '...' : ''}. Estimated revenue leakage: Rs ${report.totalRevenueLeakage.toLocaleString()}`,
                        confidence: 'high',
                        urgency: report.severity === 'critical' ? 'critical' : report.severity === 'high' ? 'high' : 'medium',
                        suggestedAction: 'monitor',
                        estimatedImpact: `Rs ${report.totalRevenueLeakage.toLocaleString()} leaked this month`,
                      });
                    }
                  }
                } catch (leakageErr: any) {
                  logger.warn({ err: leakageErr.message }, '[Watchdog] Discount leakage check failed, continuing');
                }

                // Cohort LTV Analysis: Check for channel LTV gaps
                try {
                  const ltvResult = await quickCohortLTVCheck(user.id);

                  if (ltvResult && ltvResult.hasSignificantGap && ltvResult.topAction) {
                    const action = ltvResult.topAction;
                    decisions.push({
                      type: 'channel_ltv_gap',
                      targetId: 'budget_allocation',
                      targetName: `${ltvResult.bestChannel} vs ${ltvResult.worstChannel}`,
                      reasoning: `${action.insight} ${action.action}`,
                      confidence: action.priority === 'high' ? 'high' : 'moderate',
                      urgency: action.priority === 'high' ? 'medium' : 'low',
                      suggestedAction: action.type === 'budget_shift' ? 'increase_budget' : 'monitor',
                      estimatedImpact: action.expectedImpact,
                    });
                  }
                } catch (ltvErr: any) {
                  logger.warn({ err: ltvErr.message }, '[Watchdog] Cohort LTV check failed, continuing');
                }
              }

              // === QUALITY GATE: Filter out obvious/non-strategic decisions ===
              const qualityFiltered = filterDecisions(
                decisions.map(d => ({
                  type: d.type,
                  reasoning: d.reasoning,
                  suggestedAction: d.suggestedAction,
                  targetName: d.targetName,
                  basedOn: [], // Decisions from AI don't track this yet
                })),
                { minScore: 55, requireSynthesis: true, allowObvious: false }
              );

              // Map back to original decisions that passed
              const passedDecisions = decisions.filter(d =>
                qualityFiltered.passed.some(p => p.targetName === d.targetName && p.type === d.type)
              );

              if (qualityFiltered.stats.filtered > 0) {
                logger.info({
                  total: qualityFiltered.stats.total,
                  passed: qualityFiltered.stats.passed,
                  filtered: qualityFiltered.stats.filtered,
                  accountId: account.id,
                }, '[Watchdog] Quality gate filtered non-strategic decisions');
              }

              for (const decision of passedDecisions) {
                const decisionId = uuidv4();
                db.prepare(`
                  INSERT INTO agent_decisions (id, run_id, user_id, account_id, type, target_id, target_name,
                    reasoning, confidence, urgency, suggested_action, estimated_impact, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                `).run(
                  decisionId, runId, user.id, account.id,
                  decision.type, decision.targetId, decision.targetName,
                  decision.reasoning, decision.confidence, decision.urgency,
                  decision.suggestedAction, decision.estimatedImpact,
                );

                // Persist to intelligence layer for reality testing
                try {
                  const tracked = trackRecommendation(
                    user.id,
                    decision.type,
                    decision.targetName,
                    decision.reasoning,
                    decision.confidence === 'high' ? 0.9 : decision.confidence === 'moderate' ? 0.7 : 0.5,
                    decision.urgency
                  );
                  saveRecommendation(tracked);
                } catch (err) {
                  logger.warn({ err }, '[Watchdog] Intelligence persistence failed');
                }
              }

              // Record episodes (fire-and-forget, no blocking Haiku calls)
              for (const decision of passedDecisions) {
                recordDecisionEpisode(user.id, 'watchdog', {
                  type: decision.type,
                  targetName: decision.targetName,
                  suggestedAction: decision.suggestedAction,
                  reasoning: decision.reasoning,
                }).catch((err) => logger.warn({ err: err instanceof Error ? err.message : err }, 'recordDecisionEpisode failed in ad-watchdog'));
              }

              const summary = passedDecisions.length > 0
                ? `Found ${passedDecisions.length} strategic recommendations: ${passedDecisions.map(d => d.suggestedAction).join(', ')}${qualityFiltered.stats.filtered > 0 ? ` (${qualityFiltered.stats.filtered} obvious insights filtered)` : ''}`
                : 'No action needed — account performing within expectations';

              db.prepare(`
                UPDATE agent_runs SET status = 'completed', completed_at = datetime('now'),
                summary = ?, raw_context = ?
                WHERE id = ?
              `).run(summary, JSON.stringify(snapshot), runId);

              if (passedDecisions.length > 0) {
                const briefingContent = passedDecisions.map(d =>
                  `*${d.type}* — ${d.targetName}\n${d.reasoning}\nAction: ${d.suggestedAction} | Urgency: ${d.urgency}`
                ).join('\n\n');

                notifyAlert(user.id, {
                  type: 'watchdog_briefing',
                  title: `Ad Watchdog: ${passedDecisions.length} recommendation${passedDecisions.length > 1 ? 's' : ''} for ${snapshot.accountName}`,
                  content: briefingContent,
                  severity: passedDecisions.some(d => d.urgency === 'critical') ? 'critical' : 'warning',
                  accountId: account.id,
                }).catch(err => logger.error({ err: err.message }, '[Watchdog] Notification failed'));
              }

              return { decisions: passedDecisions.length };
            } catch (err: any) {
              db.prepare(`
                UPDATE agent_runs SET status = 'failed', completed_at = datetime('now'),
                summary = ? WHERE id = ?
              `).run(`Error: ${err.message}`, runId);
              logger.error({ err: err.message }, `[Watchdog] Failed for account ${account.id}`);
              return { decisions: 0 };
            }
          })
        );

        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            totalRuns++;
            totalDecisions += result.value.decisions;
          }
        }
      }
    } catch (err: any) {
      logger.error({ err: err.message }, `[Watchdog] Failed for user ${user.id}`);
    }
  }

  // Check outcomes of past decisions
  try {
    const outcomeCount = await checkOutcomes();
    if (outcomeCount > 0) {
      logger.info(`[Watchdog] Checked outcomes for ${outcomeCount} past decisions`);
    }
  } catch (err: any) {
    logger.error({ err: err.message }, '[Watchdog] Outcome check failed');
  }

  return { runs: totalRuns, decisions: totalDecisions };
}

/* ------------------------------------------------------------------ */
/*  Client-aware Watchdog                                              */
/* ------------------------------------------------------------------ */

export interface ClientWatchdogReport {
  clientId: string;
  clientName: string;
  revenueLevel: string;
  accountName: string;
  decisions: WatchdogDecision[];
  filteredDecisions: WatchdogDecision[];  // After urgency filtering
  oosReport?: any;
  leakageReport?: any;
  shouldAlert: boolean;
  alertReason?: string;
  runAt: string;
}

/**
 * Run Watchdog for a specific client
 * - Uses client's Meta token
 * - Applies revenue-level urgency filtering
 * - Tracks watchdog runs for deduplication
 * - Integrates OOS and Leakage checks with client context
 */
export async function runWatchdogForClient(
  clientId: string,
  options: { metaToken?: string; shopifyToken?: string },
): Promise<ClientWatchdogReport | null> {
  const ctx = getClientContext(clientId);
  if (!ctx) {
    logger.error({ clientId }, '[Watchdog Client] Client not found');
    return null;
  }

  const { client } = ctx;
  const watchdogStore = getWatchdogStore(clientId);

  logger.info({
    clientId,
    brandName: client.brandName,
    revenueLevel: client.revenueLevel,
  }, '[Watchdog Client] Starting run');

  // Get client's Meta token
  const db = getDb();
  let metaToken = options.metaToken;
  let metaAccountId = client.metaAdAccountId;

  if (!metaToken && client.metaAdAccountId) {
    // Try to get token from database (would need user association)
    logger.warn({ clientId }, '[Watchdog Client] No Meta token provided');
  }

  if (!metaToken || !metaAccountId) {
    logger.error({ clientId }, '[Watchdog Client] Missing Meta credentials');
    return null;
  }

  const meta = new MetaApiService(metaToken);

  // Get urgency threshold for this client
  const urgencyThreshold = getWatchdogUrgencyThreshold(client);
  const urgencyOrder = { low: 1, medium: 2, high: 3, critical: 4 };
  const minUrgency = urgencyOrder[urgencyThreshold];

  logger.info({ urgencyThreshold }, '[Watchdog Client] Using urgency threshold');

  try {
    // Gather account snapshot
    const snapshot = await gatherAccountSnapshot(meta, metaAccountId);

    // Get AI-powered decisions with intelligence integration
    const decisions = await reasonAboutPerformance(snapshot, [], '', clientId);

    // Run OOS check with client context
    let oosReport = null;
    if (options.shopifyToken) {
      try {
        oosReport = await runOOSCheckForClient(clientId, {
          metaToken,
          days: 7,
        });

        if (oosReport && oosReport.shouldAlert) {
          decisions.push({
            type: 'oos_wasted_spend',
            targetId: 'oos_products',
            targetName: `${oosReport.newOOSProducts?.length || 0} OOS products with active ads`,
            reasoning: `Found ${oosReport.enhanced?.topWasted?.length || 0} products running ads while out of stock. Verified wasted spend: Rs ${oosReport.verifiedWastedSpend?.toLocaleString() || 0}`,
            confidence: 'high',
            urgency: oosReport.verifiedWastedSpend > 5000 ? 'high' : 'medium',
            suggestedAction: 'pause',
            estimatedImpact: `Save Rs ${oosReport.verifiedWastedSpend?.toFixed(0) || 0}/week`,
          });
        }
      } catch (oosErr: any) {
        logger.warn({ err: oosErr.message }, '[Watchdog Client] OOS check failed');
      }
    }

    // Run Discount Leakage check with client context
    let leakageReport = null;
    if (options.shopifyToken) {
      try {
        leakageReport = await runDiscountLeakageForClient(clientId, {
          shopifyToken: options.shopifyToken,
        });

        if (leakageReport && leakageReport.shouldAlert) {
          decisions.push({
            type: 'discount_leakage',
            targetId: 'discount_codes',
            targetName: `${leakageReport.newLeakedCodes?.length || 0} new leaked codes`,
            reasoning: `Found ${leakageReport.leakedCodes?.length || 0} discount codes on coupon sites. New codes: ${leakageReport.newLeakedCodes?.slice(0, 3).join(', ') || 'none'}. Revenue leaked: Rs ${leakageReport.totalRevenueLeakage?.toLocaleString() || 0}`,
            confidence: 'high',
            urgency: leakageReport.totalRevenueLeakage > 10000 ? 'high' : 'medium',
            suggestedAction: 'monitor',
            estimatedImpact: `Rs ${leakageReport.totalRevenueLeakage?.toLocaleString() || 0} leaked this month`,
          });
        }
      } catch (leakageErr: any) {
        logger.warn({ err: leakageErr.message }, '[Watchdog Client] Leakage check failed');
      }
    }

    // Filter decisions by urgency threshold
    const filteredDecisions = decisions.filter(d => {
      const decisionUrgency = urgencyOrder[d.urgency] || 2;
      return decisionUrgency >= minUrgency;
    });

    // Determine if we should alert
    const shouldAlert = filteredDecisions.length > 0;
    const alertReason = shouldAlert
      ? `${filteredDecisions.length} issues at ${urgencyThreshold}+ urgency`
      : undefined;

    logger.info({
      totalDecisions: decisions.length,
      filteredDecisions: filteredDecisions.length,
      shouldAlert,
    }, '[Watchdog Client] Run complete');

    // Update watchdog store
    updateWatchdogStore(clientId, {
      lastRunAt: new Date().toISOString(),
      totalDecisions: (watchdogStore?.totalDecisions || 0) + decisions.length,
      alertsSent: shouldAlert ? (watchdogStore?.alertsSent || 0) + 1 : watchdogStore?.alertsSent || 0,
      lastAlertAt: shouldAlert ? new Date().toISOString() : watchdogStore?.lastAlertAt,
      recentDecisionTypes: filteredDecisions.map(d => d.type),
    });

    // Create recommendations for filtered decisions
    for (const decision of filteredDecisions) {
      createRecommendation(clientId, 'watchdog', decision.type, {
        targetName: decision.targetName,
        reasoning: decision.reasoning,
        suggestedAction: decision.suggestedAction,
        urgency: decision.urgency,
        estimatedImpact: decision.estimatedImpact,
      });
    }

    return {
      clientId,
      clientName: client.brandName,
      revenueLevel: client.revenueLevel || 'unknown',
      accountName: snapshot.accountName,
      decisions,
      filteredDecisions,
      oosReport,
      leakageReport,
      shouldAlert,
      alertReason,
      runAt: new Date().toISOString(),
    };
  } catch (err: any) {
    logger.error({ err: err.message, clientId }, '[Watchdog Client] Run failed');
    return null;
  }
}

/**
 * Generate Smashed-branded HTML report for Watchdog
 */
export function generateWatchdogHTMLReport(report: ClientWatchdogReport, client: ServiceClient): string {
  const urgencyColors: Record<string, string> = {
    critical: '#ef4444',
    high: '#f97316',
    medium: '#eab308',
    low: '#22c55e',
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Watchdog Report - ${client.brandName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e5e5e5; line-height: 1.6; }
    .container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }

    /* Header */
    .header { text-align: center; padding: 60px 20px; background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%); border-bottom: 1px solid #333; }
    .logo { font-size: 14px; color: #EC8A23; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 20px; }
    h1 { font-size: 42px; font-weight: 700; background: linear-gradient(90deg, #EC8A23, #f5a623); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 16px; }
    .subtitle { font-size: 18px; color: #888; }
    .status-badge { display: inline-block; background: ${report.shouldAlert ? '#ef4444' : '#22c55e'}; color: #fff; padding: 8px 20px; border-radius: 20px; font-weight: 700; text-transform: uppercase; margin-top: 20px; }
    .meta { margin-top: 30px; display: flex; justify-content: center; gap: 40px; flex-wrap: wrap; }
    .meta-item { text-align: center; }
    .meta-value { font-size: 32px; font-weight: 700; color: #EC8A23; }
    .meta-label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px; }

    /* Sections */
    .section { padding: 60px 0; border-bottom: 1px solid #222; }
    .section-title { font-size: 28px; font-weight: 600; margin-bottom: 40px; display: flex; align-items: center; gap: 12px; }
    .section-title::before { content: ''; width: 4px; height: 28px; background: #EC8A23; border-radius: 2px; }

    /* Decisions Grid */
    .decisions-grid { display: grid; gap: 20px; }
    .decision-card { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; }
    .decision-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .decision-type { font-size: 14px; color: #EC8A23; font-weight: 600; text-transform: uppercase; }
    .decision-urgency { padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .decision-target { font-size: 18px; font-weight: 600; color: #fff; margin-bottom: 12px; }
    .decision-reasoning { font-size: 14px; color: #aaa; margin-bottom: 16px; line-height: 1.6; }
    .decision-action { display: flex; justify-content: space-between; align-items: center; padding-top: 16px; border-top: 1px solid #2a2a2a; }
    .action-label { font-size: 12px; color: #666; }
    .action-value { font-size: 14px; color: #6ee7b7; font-weight: 600; }

    /* Summary */
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; }
    .summary-card { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; text-align: center; }
    .summary-value { font-size: 36px; font-weight: 700; color: #EC8A23; margin-bottom: 8px; }
    .summary-label { font-size: 14px; color: #888; }

    /* Footer */
    .footer { text-align: center; padding: 60px 20px; color: #666; }
    .footer-logo { font-size: 14px; color: #EC8A23; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 12px; }
    .footer a { color: #EC8A23; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">The Bridge Service · Smashed Agency</div>
    <h1>Ad Watchdog Report</h1>
    <div class="subtitle">${client.brandName} — ${report.accountName}</div>
    <div class="status-badge">${report.shouldAlert ? 'Action Required' : 'All Clear'}</div>
    <div class="meta">
      <div class="meta-item">
        <div class="meta-value">${report.decisions.length}</div>
        <div class="meta-label">Issues Found</div>
      </div>
      <div class="meta-item">
        <div class="meta-value">${report.filteredDecisions.length}</div>
        <div class="meta-label">Requires Action</div>
      </div>
      <div class="meta-item">
        <div class="meta-value">${report.oosReport?.enhanced?.topWasted?.length || 0}</div>
        <div class="meta-label">OOS Products</div>
      </div>
      <div class="meta-item">
        <div class="meta-value">${report.leakageReport?.leakedCodes?.length || 0}</div>
        <div class="meta-label">Leaked Codes</div>
      </div>
    </div>
  </div>

  <div class="container">
    ${report.filteredDecisions.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Action Required</h2>
      <div class="decisions-grid">
        ${report.filteredDecisions.map(d => `
          <div class="decision-card" style="border-left: 4px solid ${urgencyColors[d.urgency] || '#888'};">
            <div class="decision-header">
              <span class="decision-type">${d.type.replace(/_/g, ' ')}</span>
              <span class="decision-urgency" style="background: ${urgencyColors[d.urgency] || '#888'};">${d.urgency}</span>
            </div>
            <div class="decision-target">${d.targetName}</div>
            <div class="decision-reasoning">${d.reasoning}</div>
            <div class="decision-action">
              <div>
                <div class="action-label">Suggested Action</div>
                <div class="action-value">${d.suggestedAction.replace(/_/g, ' ').toUpperCase()}</div>
              </div>
              <div style="text-align:right;">
                <div class="action-label">Estimated Impact</div>
                <div class="action-value">${d.estimatedImpact}</div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : `
    <div class="section">
      <h2 class="section-title">Status</h2>
      <div style="background:#151515;border:1px solid #2a2a2a;border-left:4px solid #22c55e;border-radius:12px;padding:24px;">
        <div style="font-size:18px;color:#fff;margin-bottom:8px;">All Clear</div>
        <div style="font-size:14px;color:#888;">No issues requiring attention at the ${report.revenueLevel} threshold level.</div>
      </div>
    </div>
    `}

    ${report.decisions.length > report.filteredDecisions.length ? `
    <div class="section">
      <h2 class="section-title">Lower Priority (${report.decisions.length - report.filteredDecisions.length} items)</h2>
      <div style="background:#151515;border:1px solid #2a2a2a;border-radius:12px;padding:24px;">
        <div style="font-size:14px;color:#888;margin-bottom:16px;">
          These issues are below the urgency threshold for ${client.brandName}'s revenue level (${report.revenueLevel}).
        </div>
        ${report.decisions.filter(d => !report.filteredDecisions.includes(d)).map(d => `
          <div style="padding:12px 0;border-bottom:1px solid #2a2a2a;">
            <span style="color:#666;font-size:12px;">[${d.urgency}]</span>
            <span style="color:#aaa;margin-left:8px;">${d.type.replace(/_/g, ' ')}: ${d.targetName}</span>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <div class="section">
      <h2 class="section-title">Summary</h2>
      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-value">${report.decisions.length}</div>
          <div class="summary-label">Total Issues Detected</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">${report.filteredDecisions.length}</div>
          <div class="summary-label">Above Urgency Threshold</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">₹${(report.oosReport?.verifiedWastedSpend || 0).toLocaleString('en-IN')}</div>
          <div class="summary-label">OOS Wasted Spend</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">₹${(report.leakageReport?.totalRevenueLeakage || 0).toLocaleString('en-IN')}</div>
          <div class="summary-label">Discount Leakage</div>
        </div>
      </div>
    </div>
  </div>

  <div class="footer">
    <div class="footer-logo">The Bridge Service</div>
    <p>Generated on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    <p style="margin-top:8px"><a href="https://smashed.agency/scan">smashed.agency/scan</a> · Confidential Client Report</p>
  </div>
</body>
</html>`;
}
