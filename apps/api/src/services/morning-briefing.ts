import { getDbAdapter } from '../db/adapter.js';
import { config } from '../config.js';
import { decryptToken } from './token-crypto.js';
import { MetaApiService } from './meta-api.js';
import { parseInsightMetrics } from './insights-parser.js';
import { round, fmt } from './format-helpers.js';
import { notifyAlert } from './notifications.js';
import { sendMorningBriefing } from './slack-interactive.js';
import { recordEpisode } from './agent-memory.js';
import { getQualityScore } from './quality-gate.js';
import { generatePredictions, type Prediction } from './learning-engine.js';
import { createMessage } from './llm-gateway.js';
import { extractText } from '../utils/claude-helpers.js';
import { v4 as uuidv4 } from 'uuid';
import type { MetaTokenRow, UserRow, AgentDecisionRow } from '../types/index.js';
import { logger } from '../utils/logger.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BriefingSource {
  watchdog: {
    pendingDecisions: AgentDecisionRow[];
    recentExecutions: AgentDecisionRow[];
  };
  autopilot: Array<{ title: string; content: string; severity: string; created_at: string }>;
  adPerformance: {
    todaySpend: number;
    todayRevenue: number;
    todayRoas: number;
    weekSpend: number;
    weekRevenue: number;
    weekRoas: number;
  } | null;
  pendingJobs: number;
  n8nData: any | null;
}

interface SynthesizedBriefing {
  summary: string;
  theOneThing: {
    action: string;
    why: string;
    urgency: 'critical' | 'high' | 'medium' | 'low';
  } | null;
  sections: Array<{ title: string; content: string }>;
  actionItems: string[];
  predictions: Prediction[];
}

/* ------------------------------------------------------------------ */
/*  Gather all briefing sources in parallel                            */
/* ------------------------------------------------------------------ */

async function gatherBriefingSources(userId: string): Promise<BriefingSource> {
  const db = getDbAdapter();

  // Parallel gather
  const [watchdogPending, watchdogRecent, autopilotAlerts, pendingJobsRow, adPerformance, n8nData] = await Promise.all([
    // Pending watchdog decisions
    db.all<AgentDecisionRow>(`
        SELECT * FROM agent_decisions
        WHERE user_id = ? AND status = 'pending'
        ORDER BY created_at DESC LIMIT 20
      `, [userId]),

    // Recently executed decisions (last 24h)
    db.all<AgentDecisionRow>(`
        SELECT * FROM agent_decisions
        WHERE user_id = ? AND status = 'executed'
        AND executed_at > datetime('now', '-1 day')
        ORDER BY created_at DESC LIMIT 10
      `, [userId]),

    // Unread autopilot alerts (last 24h)
    db.all<{ title: string; content: string; severity: string; created_at: string }>(`
        SELECT title, content, severity, created_at FROM autopilot_alerts
        WHERE user_id = ? AND read = 0
        AND created_at > datetime('now', '-1 day')
        ORDER BY created_at DESC LIMIT 10
      `, [userId]),

    // Pending creative jobs
    db.get<{ count: number }>(`
        SELECT COUNT(*) as count FROM creative_jobs
        WHERE user_id = ? AND status IN ('pending', 'generating', 'polling')
      `, [userId]),

    // Today's ad performance
    gatherAdPerformance(userId),

    // n8n agency data
    fetchN8nBriefingData(),
  ]);

  const pendingJobs = pendingJobsRow?.count ?? 0;

  return {
    watchdog: { pendingDecisions: watchdogPending, recentExecutions: watchdogRecent },
    autopilot: autopilotAlerts,
    adPerformance,
    pendingJobs,
    n8nData,
  };
}

/* ------------------------------------------------------------------ */
/*  Fetch ad performance summary                                       */
/* ------------------------------------------------------------------ */

async function gatherAdPerformance(userId: string): Promise<BriefingSource['adPerformance']> {
  const db = getDbAdapter();
  const tokenRow = await db.get<MetaTokenRow>('SELECT * FROM meta_tokens WHERE user_id = ?', [userId]);
  if (!tokenRow) return null;

  try {
    const token = decryptToken(tokenRow.encrypted_access_token);
    const meta = new MetaApiService(token);

    const accountsResp = await meta.get<any>('/me/adaccounts', { fields: 'id', limit: '10' });
    const accounts = accountsResp.data || [];
    if (accounts.length === 0) return null;

    let todaySpend = 0, todayRevenue = 0;
    let weekSpend = 0, weekRevenue = 0;

    // Parallel account fetches (#13)
    const accountResults = await Promise.allSettled(
      accounts.slice(0, 5).map(async (account: any) => {
        const [todayData, weekData] = await Promise.all([
          meta.get<any>(`/${account.id}/insights`, {
            fields: 'spend,actions,action_values,purchase_roas',
            date_preset: 'today',
            level: 'account',
          }).catch(() => ({ data: [] })),
          meta.get<any>(`/${account.id}/insights`, {
            fields: 'spend,actions,action_values,purchase_roas',
            date_preset: 'last_7d',
            level: 'account',
          }).catch(() => ({ data: [] })),
        ]);
        return {
          today: parseInsightMetrics(todayData.data?.[0] || {}),
          week: parseInsightMetrics(weekData.data?.[0] || {}),
        };
      })
    );

    for (const result of accountResults) {
      if (result.status !== 'fulfilled') continue;
      todaySpend += result.value.today.spend;
      todayRevenue += result.value.today.revenue;
      weekSpend += result.value.week.spend;
      weekRevenue += result.value.week.revenue;
    }

    return {
      todaySpend, todayRevenue,
      todayRoas: todaySpend > 0 ? round(todayRevenue / todaySpend, 2) : 0,
      weekSpend, weekRevenue,
      weekRoas: weekSpend > 0 ? round(weekRevenue / weekSpend, 2) : 0,
    };
  } catch (err: any) {
    logger.error({ err: err.message }, '[Briefing] Ad performance fetch failed');
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Fetch n8n agency data (if webhook configured)                      */
/* ------------------------------------------------------------------ */

async function fetchN8nBriefingData(): Promise<any | null> {
  if (!config.n8nBriefingWebhook) return null;

  try {
    const resp = await fetch(config.n8nBriefingWebhook, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) return null;
    const text = await resp.text();
    // Cap n8n data to 4KB to avoid blowing up Claude's context (#20)
    if (text.length > 4096) {
      logger.warn(`[Briefing] n8n data truncated: ${text.length} bytes -> 4096`);
      return JSON.parse(text.slice(0, 4096));
    }
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Synthesize briefing with Claude                                    */
/* ------------------------------------------------------------------ */

async function synthesizeBriefing(userId: string, sources: BriefingSource): Promise<SynthesizedBriefing> {
  const dataContext: string[] = [];

  // Generate predictions from learning engine
  let predictions: Prediction[] = [];
  try {
    predictions = await generatePredictions(userId);
  } catch (err) {
    logger.warn({ err }, '[Briefing] Predictions generation failed');
  }

  // Ad performance
  if (sources.adPerformance) {
    const p = sources.adPerformance;
    dataContext.push(`AD PERFORMANCE:
- Today: ${fmt(p.todaySpend)} spend, ${fmt(p.todayRevenue)} revenue, ${p.todayRoas}x ROAS
- This week: ${fmt(p.weekSpend)} spend, ${fmt(p.weekRevenue)} revenue, ${p.weekRoas}x ROAS`);
  }

  // Watchdog decisions
  if (sources.watchdog.pendingDecisions.length > 0) {
    dataContext.push(`PENDING WATCHDOG DECISIONS (${sources.watchdog.pendingDecisions.length}):
${sources.watchdog.pendingDecisions.map(d =>
  `- ${d.type}: ${d.suggested_action} on "${d.target_name}" (${d.urgency} urgency) — ${d.reasoning}`
).join('\n')}`);
  }

  if (sources.watchdog.recentExecutions.length > 0) {
    dataContext.push(`RECENTLY EXECUTED (last 24h):
${sources.watchdog.recentExecutions.map(d =>
  `- ${d.suggested_action} on "${d.target_name}"${d.outcome ? ` — ${d.outcome}` : ''}`
).join('\n')}`);
  }

  // Autopilot alerts
  if (sources.autopilot.length > 0) {
    dataContext.push(`UNREAD ALERTS (${sources.autopilot.length}):
${sources.autopilot.map(a => `- [${a.severity}] ${a.title}`).join('\n')}`);
  }

  // Creative jobs
  if (sources.pendingJobs > 0) {
    dataContext.push(`CREATIVE PIPELINE: ${sources.pendingJobs} jobs in progress`);
  }

  // n8n data
  if (sources.n8nData) {
    dataContext.push(`AGENCY DATA (from n8n):\n${JSON.stringify(sources.n8nData, null, 2)}`);
  }

  if (dataContext.length === 0) {
    return {
      summary: 'No significant activity to report. All systems are running normally.',
      theOneThing: null,
      sections: [],
      actionItems: [],
      predictions,
    };
  }

  try {
    const response = await createMessage({
      userId,
      operation: 'morning-briefing.synthesizeBriefing',
      // Cron job — give it more retry headroom than the SDK default.
      maxRetries: 5,
      request: {
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      temperature: 0.5,
      system: `You are Cosmisk's Morning Briefing AI — a strategic advisor who synthesizes data into a clear, actionable daily briefing.

Style: Direct, no fluff. Like a sharp chief of staff who respects your time.
Format your response as JSON with this structure:
{
  "summary": "2-3 sentence executive summary of the day's situation",
  "theOneThing": {
    "action": "The single most important action to take today",
    "why": "Brief explanation connecting multiple data points",
    "urgency": "critical|high|medium|low"
  },
  "sections": [
    { "title": "Section name", "content": "Content with specific numbers and insights" }
  ],
  "actionItems": ["Specific action 1", "Specific action 2"]
}

Rules:
1. THE ONE THING is mandatory — identify the single highest-impact action based on ALL the data. It must synthesize multiple signals (e.g., "Pause Campaign X" because CPA spiked 40% AND it's running on 3 OOS products AND creative CTR dropped).
2. Use specific numbers, not vague qualifiers.
3. Action items must be concrete and actionable — not "review performance" but "Approve the pause on Campaign X (CPA spiked 40%)".
4. If things are going well, theOneThing can be "Stay the course" with urgency "low".
5. Connect dots between data points — if CPA spiked AND there's a pending watchdog decision about it, mention both together.
6. Return ONLY the JSON object.`,
      messages: [{ role: 'user', content: dataContext.join('\n\n') }],
      },
    });

    const rawText = extractText(response);
    if (!rawText) throw new Error('No text in response');

    const jsonStr = rawText.trim();
    const match = jsonStr.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in response');

    const parsed = JSON.parse(match[0]);
    return {
      ...parsed,
      predictions, // Add predictions from learning engine
    } as SynthesizedBriefing;
  } catch (err: any) {
    logger.error({ err: err.message }, '[Briefing] Claude synthesis failed');
    // Fallback: structured but not synthesized
    const topDecision = sources.watchdog.pendingDecisions.find(d => d.urgency === 'critical' || d.urgency === 'high');
    return {
      summary: `Daily update: ${sources.watchdog.pendingDecisions.length} pending decisions, ${sources.autopilot.length} alerts, ${sources.pendingJobs} jobs in pipeline.`,
      theOneThing: topDecision ? {
        action: `${topDecision.suggested_action} on "${topDecision.target_name}"`,
        why: topDecision.reasoning,
        urgency: topDecision.urgency as 'critical' | 'high' | 'medium' | 'low',
      } : null,
      sections: dataContext.map((ctx, i) => ({
        title: ctx.split('\n')[0].replace(':', ''),
        content: ctx.split('\n').slice(1).join('\n'),
      })),
      actionItems: sources.watchdog.pendingDecisions
        .filter(d => d.urgency === 'high' || d.urgency === 'critical')
        .map(d => `${d.suggested_action} on "${d.target_name}" — ${d.reasoning}`),
      predictions,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Main: run morning briefing for all users                           */
/* ------------------------------------------------------------------ */

export async function runMorningBriefing(): Promise<number> {
  const db = getDbAdapter();
  const users = await db.all<Pick<UserRow, 'id' | 'name' | 'email'>>(`
    SELECT u.id, u.name, u.email FROM users u
    WHERE u.onboarding_complete = 1
    AND EXISTS (SELECT 1 FROM meta_tokens mt WHERE mt.user_id = u.id)
  `);

  let sent = 0;

  for (const user of users) {
    const runId = uuidv4();

    await db.run(`
      INSERT INTO agent_runs (id, agent_type, user_id, status, started_at)
      VALUES (?, 'briefing', ?, 'running', datetime('now'))
    `, [runId, user.id]);

    try {
      // 1. Gather all sources
      const sources = await gatherBriefingSources(user.id);

      // 2. Synthesize with learning engine predictions
      const briefing = await synthesizeBriefing(user.id, sources);

      // 3. Send via Slack
      const slackSent = await sendMorningBriefing(briefing);

      // 4. Send via email as well
      const theOneThingSection = briefing.theOneThing
        ? `**🎯 THE ONE THING**\n${briefing.theOneThing.action}\n_Why: ${briefing.theOneThing.why}_ (${briefing.theOneThing.urgency})\n\n`
        : '';
      const predictionsSection = briefing.predictions.length > 0
        ? `\n\n**📈 Predictions:**\n${briefing.predictions.map(p => `- ${p.prediction} (${Math.round(p.confidence * 100)}% confidence)`).join('\n')}`
        : '';
      notifyAlert(user.id, {
        type: 'morning_briefing',
        title: briefing.theOneThing ? `Daily Briefing: ${briefing.theOneThing.action}` : 'Your Daily Briefing',
        content: `${theOneThingSection}${briefing.summary}\n\n${briefing.sections.map(s => `**${s.title}**\n${s.content}`).join('\n\n')}\n\n**Action Items:**\n${briefing.actionItems.map((a, i) => `${i + 1}. ${a}`).join('\n')}${predictionsSection}`,
        severity: briefing.theOneThing?.urgency === 'critical' ? 'critical' : 'info',
      }).catch(err => logger.error({ err: err.message }, '[Briefing] Email notification failed'));

      // 5. Record as episode for memory
      recordEpisode(
        user.id,
        'briefing',
        `Morning briefing: ${briefing.summary}`,
        JSON.stringify({ sections: briefing.sections.length, actionItems: briefing.actionItems.length }),
      ).catch((err) => logger.warn({ err: err instanceof Error ? err.message : err }, 'recordEpisode failed in morning-briefing'));

      // 6. Complete run
      await db.run(`
        UPDATE agent_runs SET status = 'completed', completed_at = datetime('now'),
        summary = ?, raw_context = ?
        WHERE id = ?
      `, [briefing.summary, JSON.stringify(briefing), runId]);

      if (slackSent) sent++;
      logger.info(`[Briefing] Sent to ${user.name || user.email}`);
    } catch (err: any) {
      await db.run(`
        UPDATE agent_runs SET status = 'failed', completed_at = datetime('now'),
        summary = ? WHERE id = ?
      `, [`Error: ${err.message}`, runId]);
      logger.error({ err: err.message }, `[Briefing] Failed for user ${user.id}`);
    }
  }

  return sent;
}
