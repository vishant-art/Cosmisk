import { getDbAdapter } from '../db/adapter.js';
import { decryptToken } from './token-crypto.js';
import { MetaApiService } from './meta-api.js';
import { parseInsightMetrics, parseCampaignBreakdown } from './insights-parser.js';
import { assessConfidence, computeTrend } from './trend-analyzer.js';
import { round, fmt } from './format-helpers.js';
import { notifyAlert } from './notifications.js';
import { safeFetch, safeJson } from '../utils/safe-fetch.js';
import { config } from '../config.js';
import { createMessage } from './llm-gateway.js';
import { extractText } from '../utils/claude-helpers.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { buildContextWindow, recordDecisionEpisode, reinforceEpisode, penalizeEpisode } from './agent-memory.js';
import type { MetaTokenRow, ShopifyTokenRow, UserRow, AgentRunRow, AgentDecisionRow } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { runOOSCheck, runOOSCheckForClient } from './oos-detector.js';
import { runDiscountLeakageCheck, runDiscountLeakageForClient } from './discount-leakage-detector.js';
import { quickCohortLTVCheck } from './cohort-ltv-analyzer.js';
import { analyzeTopAdVisuals, selectAdsForAnalysis, type AdForAnalysis } from './visual-analyzer.js';
import { runCommentMining } from './comment-mining-agent.js';
import { generateStrategicIntelligence } from './strategic-intelligence-engine.js';
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
// CLOSED-LOOP OPERATING SYSTEM: Track recommendations with predictions
import {
  agentRecommend,
  getLoopStatus,
  type RecommendationType,
} from './recommendation-loop.js';
import {
  validateMonetaryClaim,
  calculateWastedSpend,
  correctWasteReasoning,
  type CampaignData,
} from './factual-validation.js';

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
/*  FACTUAL VALIDATION (using shared utility)                          */
/* ------------------------------------------------------------------ */

/**
 * Apply factual validation to watchdog decisions
 * Uses shared factual-validation.ts utility
 */
function applyFactualValidation(
  decisions: WatchdogDecision[],
  snapshot: AccountSnapshot,
): WatchdogDecision[] {
  // Convert snapshot campaigns to CampaignData format
  const campaigns: CampaignData[] = snapshot.campaigns.map(c => ({
    name: c.name,
    spend: c.spend,
    roas: c.roas,
    conversions: c.conversions,
  }));

  return decisions.map(decision => {
    // Only validate wasted_spend type decisions
    if (decision.type !== 'wasted_spend') {
      return decision;
    }

    const actual = calculateWastedSpend(campaigns);
    const validation = validateMonetaryClaim({
      source: 'ad-watchdog',
      claimType: 'wasted_spend',
      aiText: decision.reasoning + ' ' + decision.estimatedImpact,
      actualValue: actual.wasteSpend,
      threshold: 200, // Allow up to 200% deviation before flagging
    });

    if (!validation.isValid) {
      // Return corrected decision instead of rejecting entirely
      return {
        ...decision,
        reasoning: correctWasteReasoning(decision.reasoning, actual),
        confidence: 'low' as const, // Downgrade confidence after correction
        estimatedImpact: `Save ₹${Math.round(actual.wasteSpend * 4.3).toLocaleString()}/month`,
      };
    }

    return decision;
  });
}

/* ------------------------------------------------------------------ */
/*  Closed-Loop Helpers                                                */
/* ------------------------------------------------------------------ */

function mapDecisionTypeToRecommendationType(decisionType: string): RecommendationType {
  const mapping: Record<string, RecommendationType> = {
    'roas_decline': 'decrease_budget',
    'cpa_spike': 'pause_campaign',
    'scale_opportunity': 'increase_budget',
    'creative_fatigue': 'refresh_creative',
    'wasted_spend': 'pause_campaign',
    'budget_reallocation': 'adjust_bidding',
    'oos_wasted_spend': 'fix_oos',
    'discount_leakage': 'fix_discount_leak',
    'channel_ltv_gap': 'change_targeting',
  };
  return mapping[decisionType] || 'general';
}

function parseEstimatedImpact(impact: string): number {
  // Extract numeric value from strings like "Save Rs 15,000/week" or "Save $500/day"
  const match = impact.match(/[\d,]+/);
  if (match) {
    return parseInt(match[0].replace(/,/g, ''), 10);
  }
  return 0;
}

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

async function getPastDecisions(userId: string, accountId: string): Promise<AgentDecisionRow[]> {
  return await getDbAdapter().all<AgentDecisionRow>(`
    SELECT * FROM agent_decisions
    WHERE user_id = ? AND account_id = ?
    ORDER BY rowid DESC LIMIT 20
  `, [userId, accountId]);
}

/* ------------------------------------------------------------------ */
/*  Gemini-powered reasoning (via llmGateway)                          */
/* ------------------------------------------------------------------ */

async function reasonAboutPerformance(
  userId: string,
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
    const response = await createMessage({
      userId,
      operation: 'ad-watchdog.reasonAboutPerformance',
      request: {
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }],
      },
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
    const validDecisions = parsed.map(validateDecision).filter((d): d is WatchdogDecision => d !== null);

    // Apply factual validation - cross-check AI claims against actual data
    const factuallyValidated = applyFactualValidation(validDecisions, snapshot);

    return factuallyValidated;
  } catch (err: any) {
    logger.error({ err: err.message }, '[Watchdog] Gemini reasoning failed');
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Execute approved decision (with user-scoping #6)                   */
/* ------------------------------------------------------------------ */

export async function executeDecision(decisionId: string, userId?: string): Promise<{ success: boolean; message: string }> {
  const db = getDbAdapter();

  // User-scoped query when userId provided (#6)
  const decision = userId
    ? await db.get<AgentDecisionRow>('SELECT * FROM agent_decisions WHERE id = ? AND user_id = ?', [decisionId, userId])
    : await db.get<AgentDecisionRow>('SELECT * FROM agent_decisions WHERE id = ?', [decisionId]);

  if (!decision) return { success: false, message: 'Decision not found' };
  if (decision.status !== 'approved') return { success: false, message: `Decision status is ${decision.status}, expected approved` };

  const tokenRow = await db.get<MetaTokenRow>('SELECT * FROM meta_tokens WHERE user_id = ?', [decision.user_id]);
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

    await db.run(`
      UPDATE agent_decisions SET status = 'executed', executed_at = datetime('now')
      WHERE id = ?
    `, [decisionId]);

    return { success: true, message: `Executed: ${decision.suggested_action} on "${decision.target_name}"` };
  } catch (err: any) {
    return { success: false, message: `Execution failed: ${err.message}` };
  }
}

/* ------------------------------------------------------------------ */
/*  Check outcomes of past decisions (weekly)                          */
/* ------------------------------------------------------------------ */

export async function checkOutcomes(): Promise<number> {
  const db = getDbAdapter();
  const decisions = await db.all<AgentDecisionRow>(`
    SELECT * FROM agent_decisions
    WHERE status = 'executed'
    AND outcome_checked_at IS NULL
    AND executed_at < datetime('now', '-7 days')
    LIMIT 50
  `);

  let checked = 0;

  for (const decision of decisions) {
    try {
      const tokenRow = await db.get<MetaTokenRow>('SELECT * FROM meta_tokens WHERE user_id = ?', [decision.user_id]);
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

      await db.run(`
        UPDATE agent_decisions
        SET outcome_checked_at = datetime('now'), outcome = ?
        WHERE id = ?
      `, [outcome, decision.id]);

      // Reinforce or penalize related episodes
      const episodes = await db.all<{ id: string }>(`
        SELECT id FROM agent_episodes
        WHERE user_id = ? AND agent_type = 'watchdog'
        AND event LIKE ?
        ORDER BY created_at DESC LIMIT 1
      `, [decision.user_id, `%${decision.target_name}%`]);

      for (const ep of episodes) {
        if (isPositive) {
          await reinforceEpisode(ep.id);
        } else {
          await penalizeEpisode(ep.id);
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
/*  Creative Analysis: Store ad-level creative data for other agents   */
/* ------------------------------------------------------------------ */

interface CreativeAnalysisRow {
  adId: string;
  adName: string;
  creativeType: 'static' | 'video' | 'carousel' | 'catalog' | 'unknown';
  hookText: string;
  hookPattern: string;
  ctr: number;
  spend: number;
  impressions: number;
  imageUrl: string | null;
  videoId: string | null;
}

/**
 * Categorize hook text into a strategic pattern
 */
function categorizeHookPattern(hookText: string): string {
  const lower = hookText.toLowerCase();

  if (lower.includes('founder') || lower.includes('started') || lower.includes('years')) {
    return 'founder-story';
  }
  if (lower.includes('handcraft') || lower.includes('artisan') || lower.includes('made')) {
    return 'artisan-craft';
  }
  if (lower.includes('women') || lower.includes('customers') || lower.includes('love')) {
    return 'social-proof';
  }
  if (lower.includes('selling out') || lower.includes('only') || lower.includes('left')) {
    return 'scarcity';
  }
  if (lower.includes('₹') || lower.includes('off') || lower.includes('%') || lower.includes('hours')) {
    return 'discount-urgency';
  }
  if (lower.includes('new') || lower.includes('collection') || lower.includes('launch')) {
    return 'new-arrival';
  }

  return 'other';
}

/**
 * Detect creative type from ad name and creative data
 */
function detectCreativeType(adName: string, creative: any): CreativeAnalysisRow['creativeType'] {
  const nameLower = (adName || '').toLowerCase();

  // Check ad name first (most reliable for catalog detection)
  if (nameLower.includes('catalog') ||
      nameLower.includes('dpa') ||
      nameLower.includes('dynamic') ||
      nameLower.includes('all products') ||
      nameLower.match(/- all\s*$/)) {
    return 'catalog';
  }
  if (nameLower.includes('carousel')) {
    return 'carousel';
  }
  if (nameLower.includes('reel') || nameLower.includes('video')) {
    return 'video';
  }
  if (nameLower.includes('static')) {
    return 'static';
  }

  // Fall back to creative data
  if (creative?.video_id) {
    return 'video';
  }
  if (creative?.asset_feed_spec?.images?.length > 1) {
    return 'carousel';
  }
  if (creative?.object_story_spec?.link_data?.retailer_item_ids) {
    return 'catalog';
  }
  if (creative?.image_url || creative?.thumbnail_url) {
    return 'static';
  }

  return 'unknown';
}

/**
 * Gather and store creative-level analysis data for an ad account
 * Called after each watchdog scan to keep creative_analysis table fresh
 */
export async function gatherCreativeAnalysis(
  meta: MetaApiService,
  accountId: string,
  clientId: string
): Promise<{ analyzed: number; stored: number }> {
  const db = getDbAdapter();

  logger.info({ accountId, clientId }, '[Watchdog] Gathering creative analysis...');

  try {
    // Ensure table exists
    await db.exec(`
      CREATE TABLE IF NOT EXISTS creative_analysis (
        id TEXT PRIMARY KEY,
        client_id TEXT,
        ad_id TEXT,
        ad_name TEXT,
        creative_type TEXT,
        hook_text TEXT,
        hook_pattern TEXT,
        ctr REAL,
        spend REAL,
        impressions INTEGER,
        image_url TEXT,
        video_id TEXT,
        analyzed_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Create index for faster lookups
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_creative_analysis_client
      ON creative_analysis(client_id)
    `);

    // Fetch ads with creative data (paginated)
    let allAds: any[] = [];
    let page = 1;

    const adsUrl = new URL(`${config.graphApiBase}/${accountId}/ads`);
    adsUrl.searchParams.set('fields', 'id,name,effective_status,creative{id,body,title,thumbnail_url,video_id,image_url}');
    adsUrl.searchParams.set('limit', '100');
    adsUrl.searchParams.set('filtering', JSON.stringify([
      { field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] }
    ]));

    let currentUrl: string | null = adsUrl.toString();

    // Fetch up to 20 pages (2000 ads) to avoid timeout
    while (currentUrl && page <= 20) {
      const adsData: { data?: any[]; paging?: { next?: string } } = await meta.get<any>(currentUrl.replace(config.graphApiBase, ''));
      const ads = adsData.data || [];
      allAds.push(...ads);

      currentUrl = adsData.paging?.next || null;
      page++;
    }

    logger.info({ adsFound: allAds.length }, '[Watchdog] Fetched ads for creative analysis');

    if (allAds.length === 0) {
      return { analyzed: 0, stored: 0 };
    }

    // Fetch insights in batches
    const adIds = allAds.map(a => a.id);

    for (let i = 0; i < adIds.length; i += 50) {
      const batch = adIds.slice(i, i + 50);

      try {
        const insightsUrl = `/${accountId}/insights`;
        const insightsData = await meta.get<any>(insightsUrl, {
          level: 'ad',
          filtering: JSON.stringify([{ field: 'ad.id', operator: 'IN', value: batch }]),
          fields: 'ad_id,impressions,clicks,ctr,spend',
          date_preset: 'last_30d',
          limit: '100',
        });

        const insights = insightsData.data || [];

        // Attach insights to ads
        for (const insight of insights) {
          const ad = allAds.find(a => a.id === insight.ad_id);
          if (ad) {
            ad.insights = { data: [insight] };
          }
        }
      } catch (err) {
        logger.warn({ batch: i / 50 + 1 }, '[Watchdog] Insights fetch failed for batch, continuing');
      }
    }

    // Clear old data for this client and insert new
    await db.run('DELETE FROM creative_analysis WHERE client_id = ?', [clientId]);

    const insertSql = `
      INSERT INTO creative_analysis (id, client_id, ad_id, ad_name, creative_type, hook_text, hook_pattern, ctr, spend, impressions, image_url, video_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    let stored = 0;

    for (const ad of allAds) {
      const creative = ad.creative || {};
      const insights = ad.insights?.data?.[0] || {};

      const ctr = parseFloat(insights.ctr) || 0;
      const spend = parseFloat(insights.spend) || 0;
      const impressions = parseInt(insights.impressions) || 0;

      // Determine creative type
      const creativeType = detectCreativeType(ad.name, creative);

      // Extract hook (first line of body text)
      const bodyText = creative.body || creative.title || '';
      const hookText = bodyText.split('\n')[0].trim().substring(0, 150);

      // Categorize hook pattern
      const hookPattern = categorizeHookPattern(hookText);

      await db.run(insertSql, [
        crypto.randomUUID(),
        clientId,
        ad.id,
        ad.name,
        creativeType,
        hookText,
        hookPattern,
        ctr,
        spend,
        impressions,
        creative.image_url || creative.thumbnail_url || null,
        creative.video_id || null
      ]);
      stored++;
    }

    logger.info({
      clientId,
      analyzed: allAds.length,
      stored,
    }, '[Watchdog] Creative analysis stored');

    return { analyzed: allAds.length, stored };

  } catch (err: any) {
    logger.error({ err: err.message, clientId }, '[Watchdog] Creative analysis failed');
    return { analyzed: 0, stored: 0 };
  }
}

/* ------------------------------------------------------------------ */
/*  Main: run watchdog for all users                                   */
/* ------------------------------------------------------------------ */

export async function runWatchdog(): Promise<{ runs: number; decisions: number }> {
  const db = getDbAdapter();
  const users = await db.all<Pick<UserRow, 'id' | 'plan' | 'name'>>(`
    SELECT u.id, u.plan, u.name FROM users u
    WHERE u.onboarding_complete = 1
    AND EXISTS (SELECT 1 FROM meta_tokens mt WHERE mt.user_id = u.id)
  `);

  let totalRuns = 0;
  let totalDecisions = 0;

  for (const user of users) {
    try {
      const tokenRow = await db.get<MetaTokenRow>('SELECT * FROM meta_tokens WHERE user_id = ?', [user.id]);
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

            await db.run(`
              INSERT INTO agent_runs (id, agent_type, user_id, status, started_at)
              VALUES (?, 'watchdog', ?, 'running', datetime('now'))
            `, [runId, user.id]);

            try {
              const snapshot = await gatherAccountSnapshot(meta, account.id);
              const pastDecisions = await getPastDecisions(user.id, account.id);
              const memoryContext = await buildContextWindow(user.id, 'watchdog', {
                maxEpisodes: 10,
                entityTypes: ['campaign', 'adset', 'metric'],
              });

              // Pass user.id as clientId for intelligence integration
              const decisions = await reasonAboutPerformance(user.id, snapshot, pastDecisions, memoryContext, user.id);

              // OOS Detection + Discount Leakage Detection (requires Shopify connection)
              const shopifyRow = await db.get<ShopifyTokenRow>('SELECT * FROM shopify_tokens WHERE user_id = ?', [user.id]);
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
                await db.run(`
                  INSERT INTO agent_decisions (id, run_id, user_id, account_id, type, target_id, target_name,
                    reasoning, confidence, urgency, suggested_action, estimated_impact, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                `, [
                  decisionId, runId, user.id, account.id,
                  decision.type, decision.targetId, decision.targetName,
                  decision.reasoning, decision.confidence, decision.urgency,
                  decision.suggestedAction, decision.estimatedImpact,
                ]);

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

                // === CLOSED-LOOP OPERATING SYSTEM ===
                // Track recommendation with prediction for validation
                try {
                  const recType = mapDecisionTypeToRecommendationType(decision.type);
                  const predictedSavings = parseEstimatedImpact(decision.estimatedImpact);

                  await agentRecommend(user.id, 'watchdog', {
                    type: recType,
                    entityType: 'campaign',
                    entityId: decision.targetId,
                    entityName: decision.targetName,
                    action: `${decision.suggestedAction}: ${decision.targetName}`,
                    reasoning: decision.reasoning,
                    evidence: [
                      `Confidence: ${decision.confidence}`,
                      `Urgency: ${decision.urgency}`,
                      `Impact: ${decision.estimatedImpact}`,
                    ],
                    confidence: decision.confidence === 'high' ? 90 : decision.confidence === 'moderate' ? 70 : 50,
                    predictedSavings,
                  });
                } catch (loopErr) {
                  logger.warn({ err: loopErr }, '[Watchdog] Closed-loop tracking failed');
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

              await db.run(`
                UPDATE agent_runs SET status = 'completed', completed_at = datetime('now'),
                summary = ?, raw_context = ?
                WHERE id = ?
              `, [summary, JSON.stringify(snapshot), runId]);

              // Store creative-level analysis for other agents (static-ad-generator, etc.)
              try {
                await gatherCreativeAnalysis(meta, account.id, user.id);
              } catch (creativeErr: any) {
                logger.warn({ err: creativeErr.message }, '[Watchdog] Creative analysis failed, continuing');
              }

              // Visual analysis of top-performing ads (stores in dna_cache for static-ad-generator)
              try {
                // Get top ads for visual analysis
                const topAdsForVisual: AdForAnalysis[] = snapshot.campaigns
                  .flatMap(c => {
                    // Find ads in this campaign from the creative_analysis we just stored
                    return [{
                      id: c.name, // Using campaign name as proxy - will be matched later
                      name: c.name,
                      spend: c.spend,
                      roas: c.roas,
                      ctr: c.ctr,
                      thumbnail_url: '', // Will be fetched by visual analyzer
                      video_id: null,
                    }];
                  })
                  .filter(a => a.spend > 500 && a.roas > 1);

                if (topAdsForVisual.length > 0) {
                  // Fetch actual ad data with thumbnails for visual analysis
                  const adsResp = await meta.get<any>(`/${account.id}/ads`, {
                    fields: 'id,name,creative{thumbnail_url,video_id},insights.date_preset(last_7d){spend,impressions,clicks,ctr,purchase_roas}',
                    filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]),
                    limit: '50',
                  });

                  const adsForAnalysis: AdForAnalysis[] = (adsResp.data || [])
                    .map((ad: any) => {
                      const insights = ad.insights?.data?.[0] || {};
                      return {
                        id: ad.id,
                        name: ad.name,
                        spend: parseFloat(insights.spend) || 0,
                        roas: parseFloat(insights.purchase_roas?.[0]?.value) || 0,
                        ctr: parseFloat(insights.ctr) || 0,
                        thumbnail_url: ad.creative?.thumbnail_url || '',
                        video_id: ad.creative?.video_id || null,
                      };
                    })
                    .filter((a: AdForAnalysis) => a.thumbnail_url || a.video_id);

                  if (adsForAnalysis.length > 0) {
                    const visualResults = await analyzeTopAdVisuals(adsForAnalysis, account.id, meta);
                    logger.info({
                      accountId: account.id,
                      adsAnalyzed: visualResults.size,
                    }, '[Watchdog] Visual analysis complete - stored in dna_cache');
                  }
                }
              } catch (visualErr: any) {
                logger.warn({ err: visualErr.message }, '[Watchdog] Visual analysis failed, continuing');
              }

              // Comment Mining: Extract creative concepts from ad comments
              try {
                const brandName = snapshot.accountName.replace(/[^a-zA-Z0-9\s]/g, '').trim();
                if (brandName) {
                  const commentReport = await runCommentMining(user.id, {
                    metaToken: token,
                    metaAccountId: account.id,
                    brandName,
                    brandCategory: 'fashion', // Default, could be detected from products
                  });

                  if (commentReport.totalComments > 0) {
                    logger.info({
                      accountId: account.id,
                      commentsAnalyzed: commentReport.totalComments,
                      conceptsGenerated: commentReport.creativeConcepts.length,
                      topObjections: commentReport.categories.objection,
                    }, '[Watchdog] Comment mining complete');

                    // Add decision if urgent insights found
                    if (commentReport.urgentInsights.length > 0 || commentReport.categories.frustration > commentReport.totalComments * 0.15) {
                      decisions.push({
                        type: 'comment_insight',
                        targetId: 'comment_analysis',
                        targetName: `${commentReport.creativeConcepts.length} creative concepts from comments`,
                        reasoning: commentReport.urgentInsights[0] || `Found ${commentReport.categories.objection} objections and ${commentReport.categories.frustration} frustrations to address`,
                        confidence: 'moderate',
                        urgency: commentReport.categories.frustration > commentReport.totalComments * 0.2 ? 'high' : 'medium',
                        suggestedAction: 'new_creative',
                        estimatedImpact: `${commentReport.creativeConcepts.length} ad concepts ready to test`,
                      });
                    }

                    // Strategic Intelligence: Generate strategic direction from comment patterns
                    try {
                      // Map comment patterns to strategic signal inputs
                      const commentSignals = commentReport.topPatterns.slice(0, 15).map(p => ({
                        pattern: p.pattern,
                        category: p.category,
                        frequency: p.frequency,
                        sentiment: p.category === 'praise' ? 'positive' : p.category === 'frustration' ? 'negative' : 'neutral',
                        examples: p.exampleComments.slice(0, 3),
                      }));

                      // Build performance signals from snapshot
                      const performanceSignals = {
                        overallROAS: snapshot.week.roas,
                        roasTrend: (snapshot.week.roas > snapshot.month.roas * 1.1 ? 'improving' :
                                   snapshot.week.roas < snapshot.month.roas * 0.9 ? 'declining' : 'stable') as 'improving' | 'stable' | 'declining',
                        cacTrend: (snapshot.week.cpa < snapshot.month.cpa * 0.9 ? 'improving' :
                                  snapshot.week.cpa > snapshot.month.cpa * 1.1 ? 'increasing' : 'stable') as 'improving' | 'stable' | 'increasing',
                        topCreativeType: 'static', // Could be detected from creative_analysis
                      };

                      const strategicOutput = generateStrategicIntelligence(user.id, {
                        commentSignals,
                        fatigueSignals: [], // Would need fatigue-detector data
                        performanceSignals,
                        competitorGaps: [], // Would need competitor-intel data
                        categoryContext: { name: brandName, pricePoint: 'premium' },
                      });

                      // Add strategic risk decisions
                      for (const risk of strategicOutput.risks.filter(r => r.severity === 'critical' || r.severity === 'high')) {
                        decisions.push({
                          type: 'strategic_risk',
                          targetId: risk.id,
                          targetName: `Strategic Risk: ${risk.riskType}`,
                          reasoning: risk.strategicImplication,
                          confidence: risk.severity === 'critical' ? 'high' : 'moderate',
                          urgency: risk.severity === 'critical' ? 'critical' : 'high',
                          suggestedAction: 'monitor',
                          estimatedImpact: risk.businessImpact,
                        });
                      }

                      logger.info({
                        accountId: account.id,
                        risks: strategicOutput.risks.length,
                        opportunities: strategicOutput.opportunities.length,
                      }, '[Watchdog] Strategic intelligence complete');
                    } catch (stratErr: any) {
                      logger.warn({ err: stratErr.message }, '[Watchdog] Strategic intelligence failed, continuing');
                    }
                  }
                }
              } catch (commentErr: any) {
                logger.warn({ err: commentErr.message }, '[Watchdog] Comment mining failed, continuing');
              }

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
              await db.run(`
                UPDATE agent_runs SET status = 'failed', completed_at = datetime('now'),
                summary = ? WHERE id = ?
              `, [`Error: ${err.message}`, runId]);
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
  options: { metaToken?: string; shopifyToken?: string } = {},
): Promise<ClientWatchdogReport | null> {
  const ctx = await getClientContext(clientId);
  if (!ctx) {
    logger.error({ clientId }, '[Watchdog Client] Client not found');
    return null;
  }

  const { client } = ctx;
  const watchdogStore = await getWatchdogStore(clientId);

  logger.info({
    clientId,
    brandName: client.brandName,
    revenueLevel: client.revenueLevel,
  }, '[Watchdog Client] Starting run');

  // Get client's Meta token
  const db = getDbAdapter();
  let metaToken = options.metaToken;
  let metaAccountId = client.metaAdAccountId;

  if (!metaToken && client.metaAdAccountId) {
    // Try to get token from service_clients.meta_access_token
    const clientRow = await db.get<{ meta_access_token?: string }>('SELECT meta_access_token FROM service_clients WHERE id = ?', [clientId]);
    if (clientRow?.meta_access_token) {
      metaToken = decryptToken(clientRow.meta_access_token);
      logger.info({ clientId }, '[Watchdog Client] Using token from service_clients');
    } else {
      logger.warn({ clientId }, '[Watchdog Client] No Meta token found');
    }
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

    // Get AI-powered decisions with intelligence integration.
    // Client-mode watchdog uses clientId as the LLM-gateway principal — the
    // run has no separate userId in scope, and per-client billing matches
    // the service-clients ownership model.
    const decisions = await reasonAboutPerformance(clientId, snapshot, [], '', clientId);

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
    await updateWatchdogStore(clientId, {
      lastRunAt: new Date().toISOString(),
      totalDecisions: (watchdogStore?.totalDecisions || 0) + decisions.length,
      alertsSent: shouldAlert ? (watchdogStore?.alertsSent || 0) + 1 : watchdogStore?.alertsSent || 0,
      lastAlertAt: shouldAlert ? new Date().toISOString() : watchdogStore?.lastAlertAt,
      recentDecisionTypes: filteredDecisions.map(d => d.type),
    });

    // Create recommendations for filtered decisions
    for (const decision of filteredDecisions) {
      await createRecommendation(clientId, 'watchdog', decision.type, {
        targetName: decision.targetName,
        reasoning: decision.reasoning,
        suggestedAction: decision.suggestedAction,
        urgency: decision.urgency,
        estimatedImpact: decision.estimatedImpact,
      });

      // === CLOSED-LOOP OPERATING SYSTEM ===
      // Track recommendation with prediction for validation
      try {
        const recType = mapDecisionTypeToRecommendationType(decision.type);
        const predictedSavings = parseEstimatedImpact(decision.estimatedImpact);

        await agentRecommend(clientId, 'watchdog', {
          type: recType,
          entityType: 'campaign',
          entityId: decision.targetId,
          entityName: decision.targetName,
          action: `${decision.suggestedAction}: ${decision.targetName}`,
          reasoning: decision.reasoning,
          evidence: [
            `Confidence: ${decision.confidence}`,
            `Urgency: ${decision.urgency}`,
            `Impact: ${decision.estimatedImpact}`,
          ],
          confidence: decision.confidence === 'high' ? 90 : decision.confidence === 'moderate' ? 70 : 50,
          predictedSavings,
        });
      } catch (loopErr) {
        logger.warn({ err: loopErr }, '[Watchdog Client] Closed-loop tracking failed');
      }
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
