/**
 * Sales Pipeline Agent — analyzes usage, billing, and performance data per user,
 * synthesizes with Claude to produce actionable sales/success intelligence.
 *
 * Detects upsell opportunities and churn risks, notifies via Slack/email,
 * and stores episodes for memory-enriched future context.
 */

import { getDb } from '../db/index.js';
import { buildContextWindow, recordEpisode } from './agent-memory.js';
import { notifyAlert } from './notifications.js';
import { config } from '../config.js';
import Anthropic from '@anthropic-ai/sdk';
import { extractText } from '../utils/claude-helpers.js';
import { v4 as uuidv4 } from 'uuid';
import { PLAN_LIMITS } from '../routes/billing.js';
import type { SubscriptionRow, UserUsageRow, MetaTokenRow } from '../types/index.js';
import { logger } from '../utils/logger.js';

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SalesContext {
  runId: string;
  memoryContext: string;
  recentDecisions: Array<{ type: string; targetName: string; outcome: string | null }>;
  clientProfile: {
    name: string;
    plan: string;
    memberSince: string;
    trialActive: boolean;
    trialEndsAt: string | null;
  };
  usageMetrics: {
    period: string;
    chats: number;
    images: number;
    videos: number;
    creatives: number;
    sprintCount: number;
    totalSpend: number;
  };
  performanceSnapshot: {
    accountCount: number;
    totalAdSpend7d: number;
    avgRoas7d: number;
    activeAutomations: number;
    watchdogDecisions30d: number;
  };
  upsellSignals: string[];
  churnRiskSignals: string[];
  synthesis: SalesSynthesis | null;
}

export interface SalesSynthesis {
  executiveSummary: string;
  talkingPoints: string[];
  upsellNarrative: string | null;
  retentionRisk: string | null;
  nextBestAction: string;
}

/* ------------------------------------------------------------------ */
/*  Run sales agent for all users                                      */
/* ------------------------------------------------------------------ */

export async function runSalesAgentAll(): Promise<number> {
  const db = getDb();
  const users = db.prepare(`
    SELECT id FROM users WHERE onboarding_complete = 1
  `).all() as { id: string }[];

  let completed = 0;
  for (const user of users) {
    try {
      await getSalesContext(user.id);
      completed++;
    } catch (err: unknown) {
      logger.error({ err }, `[SalesAgent] Failed for user ${user.id}`);
    }
  }
  return completed;
}

/* ------------------------------------------------------------------ */
/*  Get sales context for a user                                       */
/* ------------------------------------------------------------------ */

export async function getSalesContext(userId: string): Promise<SalesContext> {
  const db = getDb();
  const runId = uuidv4();

  db.prepare(`
    INSERT INTO agent_runs (id, agent_type, user_id, status, started_at)
    VALUES (?, 'sales', ?, 'running', datetime('now'))
  `).run(runId, userId);

  try {
    // Build memory context for sales conversations
    const memoryContext = buildContextWindow(userId, 'sales', {
      maxEpisodes: 20,
      entityTypes: ['brand', 'campaign', 'metric'],
    });

    // Get recent decisions with outcomes
    const recentDecisions = db.prepare(`
      SELECT type, target_name, outcome FROM agent_decisions
      WHERE user_id = ? AND outcome IS NOT NULL
      ORDER BY rowid DESC LIMIT 10
    `).all(userId) as Array<{ type: string; target_name: string; outcome: string | null }>;

    // Client profile
    const user = db.prepare('SELECT name, plan, created_at FROM users WHERE id = ?').get(userId) as { name: string; plan: string; created_at: string } | undefined;
    const sub = db.prepare(
      "SELECT trial_ends_at, status FROM subscriptions WHERE user_id = ? AND status IN ('active', 'trialing') ORDER BY created_at DESC LIMIT 1"
    ).get(userId) as { trial_ends_at: string | null; status: string } | undefined;

    const trialActive = sub?.status === 'trialing' && sub.trial_ends_at ? new Date(sub.trial_ends_at) > new Date() : false;

    // Usage metrics
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const usage = db.prepare('SELECT * FROM user_usage WHERE user_id = ? AND period = ?').get(userId, period) as UserUsageRow | undefined;

    const sprintCount = (db.prepare(
      'SELECT COUNT(*) as c FROM creative_sprints WHERE user_id = ?'
    ).get(userId) as { c: number }).c;

    const totalSpendRow = db.prepare(
      'SELECT COALESCE(SUM(cost_cents), 0) as total FROM cost_ledger WHERE user_id = ?'
    ).get(userId) as { total: number };

    // Performance snapshot
    const accountCount = (db.prepare(
      'SELECT COUNT(*) as c FROM meta_tokens WHERE user_id = ?'
    ).get(userId) as { c: number }).c;

    const activeAutomations = (db.prepare(
      "SELECT COUNT(*) as c FROM automations WHERE user_id = ? AND is_active = 1"
    ).get(userId) as { c: number }).c;

    const watchdogDecisions30d = (db.prepare(
      "SELECT COUNT(*) as c FROM agent_decisions WHERE user_id = ? AND created_at > datetime('now', '-30 days')"
    ).get(userId) as { c: number }).c;

    // Try to enrich ad performance from Meta insights cache
    let totalAdSpend7d = 0;
    let avgRoas7d = 0;
    try {
      const recentInsights = db.prepare(`
        SELECT raw_context FROM agent_runs
        WHERE user_id = ? AND agent_type = 'report' AND status = 'completed'
        ORDER BY completed_at DESC LIMIT 1
      `).get(userId) as { raw_context: string } | undefined;
      if (recentInsights?.raw_context) {
        const reportData = JSON.parse(recentInsights.raw_context);
        totalAdSpend7d = reportData.metrics?.week?.spend || 0;
        avgRoas7d = reportData.metrics?.week?.roas || 0;
      }
    } catch {
      // Fail gracefully — keep defaults of 0
    }

    // Detect upsell signals
    const upsellSignals: string[] = [];
    const churnRiskSignals: string[] = [];
    const currentPlan = (user?.plan || 'free') as keyof typeof PLAN_LIMITS;
    const limits = PLAN_LIMITS[currentPlan] || PLAN_LIMITS.free;

    // Usage approaching limits = upsell
    if (usage && limits.images_per_month > 0 && usage.image_count >= limits.images_per_month * 0.8) {
      upsellSignals.push(`Image usage at ${usage.image_count}/${limits.images_per_month} (${Math.round(usage.image_count / limits.images_per_month * 100)}%) — approaching limit`);
    }
    if (usage && limits.videos_per_month > 0 && usage.video_count >= limits.videos_per_month * 0.8) {
      upsellSignals.push(`Video usage at ${usage.video_count}/${limits.videos_per_month} — approaching limit`);
    }
    if (usage && limits.creatives_per_month > 0 && usage.creative_count >= limits.creatives_per_month * 0.8) {
      upsellSignals.push(`Creative usage at ${usage.creative_count}/${limits.creatives_per_month} — approaching limit`);
    }
    if (limits.team_members === 1 && currentPlan !== 'agency') {
      const teamCount = (db.prepare(
        "SELECT COUNT(*) as c FROM team_members WHERE owner_user_id = ? AND status != 'revoked'"
      ).get(userId) as { c: number }).c;
      if (teamCount > 0) {
        upsellSignals.push('Has invited team members but plan only allows 1 — upgrade needed');
      }
    }
    if (sprintCount >= 10 && currentPlan === 'solo') {
      upsellSignals.push(`Power user: ${sprintCount} sprints created on Solo plan — Growth plan would unlock more`);
    }
    if (activeAutomations >= limits.autopilot_rules && limits.autopilot_rules > 0) {
      upsellSignals.push(`All ${limits.autopilot_rules} automation slots used — upgrade for more`);
    }

    // Churn risk signals
    if (!usage || (usage.chat_count === 0 && usage.image_count === 0 && usage.video_count === 0)) {
      churnRiskSignals.push('Zero usage this month — user may have stopped using the platform');
    }
    if (trialActive && sub?.trial_ends_at) {
      const daysLeft = Math.ceil((new Date(sub.trial_ends_at).getTime() - Date.now()) / 86400000);
      if (daysLeft <= 3) {
        churnRiskSignals.push(`Trial expires in ${daysLeft} days — critical conversion window`);
      }
    }
    const lastRun = db.prepare(
      "SELECT started_at FROM agent_runs WHERE user_id = ? ORDER BY started_at DESC LIMIT 1"
    ).get(userId) as { started_at: string } | undefined;
    if (lastRun) {
      const daysSinceLastActivity = Math.ceil((Date.now() - new Date(lastRun.started_at).getTime()) / 86400000);
      if (daysSinceLastActivity > 14) {
        churnRiskSignals.push(`No agent activity in ${daysSinceLastActivity} days — possible churning`);
      }
    }

    // Claude synthesis
    let synthesis: SalesSynthesis | null = null;
    try {
      synthesis = await synthesizeWithClaude({
        userName: user?.name || 'Unknown',
        plan: user?.plan || 'free',
        memberSince: user?.created_at || '',
        trialActive,
        trialEndsAt: sub?.trial_ends_at || null,
        period,
        usage,
        sprintCount,
        totalSpend: totalSpendRow.total / 100,
        accountCount,
        totalAdSpend7d,
        avgRoas7d,
        activeAutomations,
        watchdogDecisions30d,
        upsellSignals,
        churnRiskSignals,
        recentDecisions: recentDecisions.map(d => ({ type: d.type, targetName: d.target_name, outcome: d.outcome })),
        memoryContext,
      });
    } catch (err: unknown) {
      logger.warn({ err: err instanceof Error ? err.message : err }, '[SalesAgent] Claude synthesis failed, returning raw context');
    }

    const context: SalesContext = {
      runId,
      memoryContext,
      recentDecisions: recentDecisions.map(d => ({
        type: d.type,
        targetName: d.target_name,
        outcome: d.outcome,
      })),
      clientProfile: {
        name: user?.name || 'Unknown',
        plan: user?.plan || 'free',
        memberSince: user?.created_at || '',
        trialActive,
        trialEndsAt: sub?.trial_ends_at || null,
      },
      usageMetrics: {
        period,
        chats: usage?.chat_count || 0,
        images: usage?.image_count || 0,
        videos: usage?.video_count || 0,
        creatives: usage?.creative_count || 0,
        sprintCount,
        totalSpend: totalSpendRow.total / 100,
      },
      performanceSnapshot: {
        accountCount,
        totalAdSpend7d,
        avgRoas7d,
        activeAutomations,
        watchdogDecisions30d,
      },
      upsellSignals,
      churnRiskSignals,
      synthesis,
    };

    const summaryText = synthesis
      ? `Sales intel for ${context.clientProfile.name}: ${synthesis.executiveSummary}. Next action: ${synthesis.nextBestAction}`
      : `Sales context: ${upsellSignals.length} upsell signals, ${churnRiskSignals.length} churn risks. Plan: ${context.clientProfile.plan}`;

    db.prepare(`
      UPDATE agent_runs SET status = 'completed', completed_at = datetime('now'),
      summary = ?, raw_context = ? WHERE id = ?
    `).run(summaryText, JSON.stringify(context), runId);

    // Record episodes for individual signals
    for (const signal of upsellSignals) {
      await recordEpisode(userId, 'sales', `Upsell signal: ${signal}`).catch(
        (err) => logger.warn({ err: err instanceof Error ? err.message : err }, 'recordEpisode failed in sales-agent'),
      );
    }
    for (const signal of churnRiskSignals) {
      await recordEpisode(userId, 'sales', `Churn risk: ${signal}`).catch(
        (err) => logger.warn({ err: err instanceof Error ? err.message : err }, 'recordEpisode failed in sales-agent'),
      );
    }

    // Main episode
    await recordEpisode(
      userId, 'sales',
      `Sales analysis complete. ${upsellSignals.length} upsell signals, ${churnRiskSignals.length} churn risks. ${synthesis ? `Next action: ${synthesis.nextBestAction}` : 'No synthesis available.'}`,
    ).catch((err) => logger.warn({ err: err instanceof Error ? err.message : err }, 'recordEpisode failed in sales-agent'));

    // Notify if actionable signals found
    if (upsellSignals.length > 0 || churnRiskSignals.length > 0) {
      const severity = churnRiskSignals.length > 0 ? 'warning' as const : 'info' as const;
      const title = churnRiskSignals.length > 0
        ? `Churn Risk — ${context.clientProfile.name}`
        : `Upsell Opportunity — ${context.clientProfile.name}`;
      const content = synthesis
        ? `${synthesis.executiveSummary}\n\nNext action: ${synthesis.nextBestAction}`
        : `Upsell: ${upsellSignals.join('; ') || 'none'}. Churn: ${churnRiskSignals.join('; ') || 'none'}`;

      await notifyAlert(userId, { type: 'sales_intel', title, content, severity }).catch(
        (err) => logger.warn({ err: err instanceof Error ? err.message : err }, 'notifyAlert failed in sales-agent'),
      );
    }

    logger.info(`[SalesAgent] Completed for ${context.clientProfile.name} (${userId}): ${upsellSignals.length} upsell, ${churnRiskSignals.length} churn`);
    return context;

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    db.prepare(`
      UPDATE agent_runs SET status = 'failed', completed_at = datetime('now'),
      summary = ? WHERE id = ?
    `).run(`Error: ${message}`, runId);
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/*  Claude synthesis                                                   */
/* ------------------------------------------------------------------ */

interface SynthesisInput {
  userName: string;
  plan: string;
  memberSince: string;
  trialActive: boolean;
  trialEndsAt: string | null;
  period: string;
  usage: UserUsageRow | undefined;
  sprintCount: number;
  totalSpend: number;
  accountCount: number;
  totalAdSpend7d: number;
  avgRoas7d: number;
  activeAutomations: number;
  watchdogDecisions30d: number;
  upsellSignals: string[];
  churnRiskSignals: string[];
  recentDecisions: Array<{ type: string; targetName: string; outcome: string | null }>;
  memoryContext: string;
}

function buildSalesPrompt(input: SynthesisInput): string {
  const decisionsStr = input.recentDecisions.length > 0
    ? input.recentDecisions.map(d => `- ${d.type}: ${d.targetName} -> ${d.outcome || 'pending'}`).join('\n')
    : 'No recent decisions.';

  return `You are a SaaS customer success strategist for Cosmisk, an AI-powered creative intelligence platform for agencies.

Analyze this client and provide actionable sales intelligence.

CLIENT PROFILE:
- Name: ${input.userName}
- Plan: ${input.plan}
- Member since: ${input.memberSince || 'Unknown'}
- Trial active: ${input.trialActive}${input.trialEndsAt ? ` (expires ${input.trialEndsAt})` : ''}

USAGE THIS MONTH (${input.period}):
- Chats: ${input.usage?.chat_count || 0}
- Images generated: ${input.usage?.image_count || 0}
- Videos generated: ${input.usage?.video_count || 0}
- Creatives: ${input.usage?.creative_count || 0}
- Sprints created (all time): ${input.sprintCount}
- Platform spend: $${input.totalSpend.toFixed(2)}

AD PERFORMANCE:
- Connected ad accounts: ${input.accountCount}
- Ad spend (7d): $${input.totalAdSpend7d.toFixed(2)}
- Average ROAS (7d): ${input.avgRoas7d.toFixed(2)}x
- Active automations: ${input.activeAutomations}
- Watchdog decisions (30d): ${input.watchdogDecisions30d}

RECENT AGENT DECISIONS:
${decisionsStr}

DETECTED UPSELL SIGNALS:
${input.upsellSignals.length > 0 ? input.upsellSignals.map(s => `- ${s}`).join('\n') : 'None detected.'}

DETECTED CHURN RISKS:
${input.churnRiskSignals.length > 0 ? input.churnRiskSignals.map(s => `- ${s}`).join('\n') : 'None detected.'}

AGENT MEMORY (past sales interactions):
${input.memoryContext || 'No prior context.'}

Respond in JSON:
{
  "executiveSummary": "2-3 sentence overview of this client's situation, health, and trajectory",
  "talkingPoints": ["specific things to mention in a sales/success call — reference actual data"],
  "upsellNarrative": "how to frame an upgrade conversation based on their actual usage, or null if no upsell opportunity",
  "retentionRisk": "specific churn mitigation strategy based on their behavior, or null if healthy",
  "nextBestAction": "the single most important action to take with this client right now"
}`;
}

async function synthesizeWithClaude(input: SynthesisInput): Promise<SalesSynthesis> {
  const prompt = buildSalesPrompt(input);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    temperature: 0.4,
    messages: [{ role: 'user', content: prompt }],
  });

  const rawText = extractText(response);

  let parsed: Partial<SalesSynthesis> = {};
  try {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
  } catch {
    parsed.executiveSummary = rawText?.slice(0, 300) || 'Sales analysis generated';
  }

  return {
    executiveSummary: parsed.executiveSummary || 'Sales analysis generated',
    talkingPoints: parsed.talkingPoints || [],
    upsellNarrative: parsed.upsellNarrative || null,
    retentionRisk: parsed.retentionRisk || null,
    nextBestAction: parsed.nextBestAction || 'Review client usage patterns',
  };
}
