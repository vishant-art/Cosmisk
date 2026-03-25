/**
 * Sales Pipeline Agent — provides memory-enriched context for n8n sales workflows.
 *
 * Aggregates: client performance history, usage patterns, upsell opportunities,
 * competitor intel, and recent agent decisions. Fed to n8n Agent 5 for
 * intelligent client conversations.
 */

import { getDb } from '../db/index.js';
import { buildContextWindow, recordEpisode } from './agent-memory.js';
import { v4 as uuidv4 } from 'uuid';
import { PLAN_LIMITS } from '../routes/billing.js';
import type { SubscriptionRow, UserUsageRow } from '../types/index.js';
import { logger } from '../utils/logger.js';

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
        totalAdSpend7d: 0, // Would need Meta API call — omitted for speed
        avgRoas7d: 0,
        activeAutomations,
        watchdogDecisions30d,
      },
      upsellSignals,
      churnRiskSignals,
    };

    db.prepare(`
      UPDATE agent_runs SET status = 'completed', completed_at = datetime('now'),
      summary = ?, raw_context = ? WHERE id = ?
    `).run(
      `Sales context: ${upsellSignals.length} upsell signals, ${churnRiskSignals.length} churn risks. Plan: ${context.clientProfile.plan}`,
      JSON.stringify(context),
      runId,
    );

    await recordEpisode(
      userId, 'sales',
      `Provided sales context. Upsell signals: ${upsellSignals.join('; ') || 'none'}. Churn risks: ${churnRiskSignals.join('; ') || 'none'}`,
    ).catch((err) => logger.warn({ err: err instanceof Error ? err.message : err }, 'recordEpisode failed in sales-agent'));

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
