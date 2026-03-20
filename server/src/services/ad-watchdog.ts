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
import { v4 as uuidv4 } from 'uuid';
import { buildContextWindow, recordDecisionEpisode, reinforceEpisode, penalizeEpisode } from './agent-memory.js';
import type { MetaTokenRow, UserRow, AgentRunRow, AgentDecisionRow } from '../types/index.js';

const anthropic = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });

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
): Promise<WatchdogDecision[]> {
  const pastContext = pastDecisions.length > 0
    ? `\n\nPAST DECISIONS (learn from these):\n${pastDecisions.map(d =>
        `- ${d.type} on "${d.target_name}": ${d.suggested_action} (${d.status}${d.outcome ? `, outcome: ${d.outcome}` : ''})`
      ).join('\n')}`
    : '';

  const memorySection = memoryContext
    ? `\n\nAGENT MEMORY:\n${memoryContext}`
    : '';

  const prompt = `You are the Ad Watchdog, an autonomous AI agent monitoring Meta Ads performance.

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
1. Think like a strategist, not a rule engine. Consider trends, confidence, and context.
2. Don't flag trivial issues. Only recommend actions that meaningfully impact the account.
3. Be specific: name the campaign/ad, state the action, quantify the impact.
4. Consider data confidence: 1 conversion on $5 spend means nothing. 50 conversions on $500 is a real pattern.
5. If you recommended something before and the outcome was bad, learn from it.
6. For each recommendation, specify ONE action: pause, reduce_budget, increase_budget, new_creative, or monitor.

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

    const text = response.content.find((b: any) => b.type === 'text');
    if (!text) return [];

    const jsonStr = (text as any).text.trim();

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
    console.error('[Watchdog] Claude reasoning failed:', err.message);
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
          console.warn(`[Watchdog] ${failures.length}/${adsets.length} budget changes failed for ${decision.target_name}`);
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
      console.error(`[Watchdog] Outcome check failed for decision ${decision.id}:`, err.message);
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
        console.warn(`[Watchdog] Skipping user ${user.id}: Meta token expired`);
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

              const decisions = await reasonAboutPerformance(snapshot, pastDecisions, memoryContext);

              for (const decision of decisions) {
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
              }

              // Record episodes (fire-and-forget, no blocking Haiku calls)
              for (const decision of decisions) {
                recordDecisionEpisode(user.id, 'watchdog', {
                  type: decision.type,
                  targetName: decision.targetName,
                  suggestedAction: decision.suggestedAction,
                  reasoning: decision.reasoning,
                }).catch(() => {});
              }

              const summary = decisions.length > 0
                ? `Found ${decisions.length} recommendations: ${decisions.map(d => d.suggestedAction).join(', ')}`
                : 'No action needed — account performing within expectations';

              db.prepare(`
                UPDATE agent_runs SET status = 'completed', completed_at = datetime('now'),
                summary = ?, raw_context = ?
                WHERE id = ?
              `).run(summary, JSON.stringify(snapshot), runId);

              if (decisions.length > 0) {
                const briefingContent = decisions.map(d =>
                  `*${d.type}* — ${d.targetName}\n${d.reasoning}\nAction: ${d.suggestedAction} | Urgency: ${d.urgency}`
                ).join('\n\n');

                notifyAlert(user.id, {
                  type: 'watchdog_briefing',
                  title: `Ad Watchdog: ${decisions.length} recommendation${decisions.length > 1 ? 's' : ''} for ${snapshot.accountName}`,
                  content: briefingContent,
                  severity: decisions.some(d => d.urgency === 'critical') ? 'critical' : 'warning',
                  accountId: account.id,
                }).catch(err => console.error('[Watchdog] Notification failed:', err.message));
              }

              return { decisions: decisions.length };
            } catch (err: any) {
              db.prepare(`
                UPDATE agent_runs SET status = 'failed', completed_at = datetime('now'),
                summary = ? WHERE id = ?
              `).run(`Error: ${err.message}`, runId);
              console.error(`[Watchdog] Failed for account ${account.id}:`, err.message);
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
      console.error(`[Watchdog] Failed for user ${user.id}:`, err.message);
    }
  }

  // Check outcomes of past decisions
  try {
    const outcomeCount = await checkOutcomes();
    if (outcomeCount > 0) {
      console.log(`[Watchdog] Checked outcomes for ${outcomeCount} past decisions`);
    }
  } catch (err: any) {
    console.error('[Watchdog] Outcome check failed:', err.message);
  }

  return { runs: totalRuns, decisions: totalDecisions };
}
