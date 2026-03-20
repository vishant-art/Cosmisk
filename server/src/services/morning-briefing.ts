import { getDb } from '../db/index.js';
import { config } from '../config.js';
import { decryptToken } from './token-crypto.js';
import { MetaApiService } from './meta-api.js';
import { parseInsightMetrics } from './insights-parser.js';
import { round, fmt } from './format-helpers.js';
import { notifyAlert } from './notifications.js';
import { sendMorningBriefing } from './slack-interactive.js';
import { recordEpisode } from './agent-memory.js';
import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import type { MetaTokenRow, UserRow, AgentDecisionRow } from '../types/index.js';

const anthropic = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });

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
  sections: Array<{ title: string; content: string }>;
  actionItems: string[];
}

/* ------------------------------------------------------------------ */
/*  Gather all briefing sources in parallel                            */
/* ------------------------------------------------------------------ */

async function gatherBriefingSources(userId: string): Promise<BriefingSource> {
  const db = getDb();

  // Parallel gather
  const [watchdogPending, watchdogRecent, autopilotAlerts, pendingJobs, adPerformance, n8nData] = await Promise.all([
    // Pending watchdog decisions
    Promise.resolve(
      db.prepare(`
        SELECT * FROM agent_decisions
        WHERE user_id = ? AND status = 'pending'
        ORDER BY rowid DESC LIMIT 20
      `).all(userId) as AgentDecisionRow[]
    ),

    // Recently executed decisions (last 24h)
    Promise.resolve(
      db.prepare(`
        SELECT * FROM agent_decisions
        WHERE user_id = ? AND status = 'executed'
        AND executed_at > datetime('now', '-1 day')
        ORDER BY rowid DESC LIMIT 10
      `).all(userId) as AgentDecisionRow[]
    ),

    // Unread autopilot alerts (last 24h)
    Promise.resolve(
      db.prepare(`
        SELECT title, content, severity, created_at FROM autopilot_alerts
        WHERE user_id = ? AND read = 0
        AND created_at > datetime('now', '-1 day')
        ORDER BY created_at DESC LIMIT 10
      `).all(userId) as Array<{ title: string; content: string; severity: string; created_at: string }>
    ),

    // Pending creative jobs
    Promise.resolve(
      (db.prepare(`
        SELECT COUNT(*) as count FROM creative_jobs
        WHERE user_id = ? AND status IN ('pending', 'generating', 'polling')
      `).get(userId) as { count: number }).count
    ),

    // Today's ad performance
    gatherAdPerformance(userId),

    // n8n agency data
    fetchN8nBriefingData(),
  ]);

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
  const db = getDb();
  const tokenRow = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(userId) as MetaTokenRow | undefined;
  if (!tokenRow) return null;

  try {
    const token = decryptToken(tokenRow.encrypted_access_token);
    const meta = new MetaApiService(token);

    const accountsResp = await meta.get<any>('/me/adaccounts', { fields: 'id', limit: '10' });
    const accounts = accountsResp.data || [];
    if (accounts.length === 0) return null;

    let todaySpend = 0, todayRevenue = 0;
    let weekSpend = 0, weekRevenue = 0;

    for (const account of accounts.slice(0, 5)) {
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

      const today = parseInsightMetrics(todayData.data?.[0] || {});
      const week = parseInsightMetrics(weekData.data?.[0] || {});

      todaySpend += today.spend;
      todayRevenue += today.revenue;
      weekSpend += week.spend;
      weekRevenue += week.revenue;
    }

    return {
      todaySpend, todayRevenue,
      todayRoas: todaySpend > 0 ? round(todayRevenue / todaySpend, 2) : 0,
      weekSpend, weekRevenue,
      weekRoas: weekSpend > 0 ? round(weekRevenue / weekSpend, 2) : 0,
    };
  } catch (err: any) {
    console.error('[Briefing] Ad performance fetch failed:', err.message);
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
    return await resp.json();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Synthesize briefing with Claude                                    */
/* ------------------------------------------------------------------ */

async function synthesizeBriefing(sources: BriefingSource): Promise<SynthesizedBriefing> {
  const dataContext: string[] = [];

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
      sections: [],
      actionItems: [],
    };
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      temperature: 0.5,
      system: `You are Cosmisk's Morning Briefing AI — a strategic advisor who synthesizes data into a clear, actionable daily briefing.

Style: Direct, no fluff. Like a sharp chief of staff who respects your time.
Format your response as JSON with this structure:
{
  "summary": "2-3 sentence executive summary of the day's situation",
  "sections": [
    { "title": "Section name", "content": "Content with specific numbers and insights" }
  ],
  "actionItems": ["Specific action 1", "Specific action 2"]
}

Rules:
1. Lead with the most important thing.
2. Use specific numbers, not vague qualifiers.
3. Action items must be concrete and actionable — not "review performance" but "Approve the pause on Campaign X (CPA spiked 40%)".
4. If things are going well, say so briefly. Don't manufacture urgency.
5. Connect dots between data points — if CPA spiked AND there's a pending watchdog decision about it, mention both together.
6. Return ONLY the JSON object.`,
      messages: [{ role: 'user', content: dataContext.join('\n\n') }],
    });

    const text = response.content.find((b: any) => b.type === 'text');
    if (!text) throw new Error('No text in response');

    const jsonStr = (text as any).text.trim();
    const match = jsonStr.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in response');

    return JSON.parse(match[0]) as SynthesizedBriefing;
  } catch (err: any) {
    console.error('[Briefing] Claude synthesis failed:', err.message);
    // Fallback: structured but not synthesized
    return {
      summary: `Daily update: ${sources.watchdog.pendingDecisions.length} pending decisions, ${sources.autopilot.length} alerts, ${sources.pendingJobs} jobs in pipeline.`,
      sections: dataContext.map((ctx, i) => ({
        title: ctx.split('\n')[0].replace(':', ''),
        content: ctx.split('\n').slice(1).join('\n'),
      })),
      actionItems: sources.watchdog.pendingDecisions
        .filter(d => d.urgency === 'high' || d.urgency === 'critical')
        .map(d => `${d.suggested_action} on "${d.target_name}" — ${d.reasoning}`),
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Main: run morning briefing for all users                           */
/* ------------------------------------------------------------------ */

export async function runMorningBriefing(): Promise<number> {
  const db = getDb();
  const users = db.prepare(`
    SELECT u.id, u.name, u.email FROM users u
    WHERE u.onboarding_complete = 1
    AND EXISTS (SELECT 1 FROM meta_tokens mt WHERE mt.user_id = u.id)
  `).all() as Pick<UserRow, 'id' | 'name' | 'email'>[];

  let sent = 0;

  for (const user of users) {
    const runId = uuidv4();

    db.prepare(`
      INSERT INTO agent_runs (id, agent_type, user_id, status, started_at)
      VALUES (?, 'briefing', ?, 'running', datetime('now'))
    `).run(runId, user.id);

    try {
      // 1. Gather all sources
      const sources = await gatherBriefingSources(user.id);

      // 2. Synthesize
      const briefing = await synthesizeBriefing(sources);

      // 3. Send via Slack
      const slackSent = await sendMorningBriefing(briefing);

      // 4. Send via email as well
      notifyAlert(user.id, {
        type: 'morning_briefing',
        title: 'Your Daily Briefing',
        content: `${briefing.summary}\n\n${briefing.sections.map(s => `**${s.title}**\n${s.content}`).join('\n\n')}\n\n**Action Items:**\n${briefing.actionItems.map((a, i) => `${i + 1}. ${a}`).join('\n')}`,
        severity: 'info',
      }).catch(err => console.error('[Briefing] Email notification failed:', err.message));

      // 5. Record as episode for memory
      recordEpisode(
        user.id,
        'briefing',
        `Morning briefing: ${briefing.summary}`,
        JSON.stringify({ sections: briefing.sections.length, actionItems: briefing.actionItems.length }),
      ).catch(() => {});

      // 6. Complete run
      db.prepare(`
        UPDATE agent_runs SET status = 'completed', completed_at = datetime('now'),
        summary = ?, raw_context = ?
        WHERE id = ?
      `).run(briefing.summary, JSON.stringify(briefing), runId);

      if (slackSent) sent++;
      console.log(`[Briefing] Sent to ${user.name || user.email}`);
    } catch (err: any) {
      db.prepare(`
        UPDATE agent_runs SET status = 'failed', completed_at = datetime('now'),
        summary = ? WHERE id = ?
      `).run(`Error: ${err.message}`, runId);
      console.error(`[Briefing] Failed for user ${user.id}:`, err.message);
    }
  }

  return sent;
}
