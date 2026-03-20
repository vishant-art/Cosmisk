import type { FastifyInstance } from 'fastify';
import cron from 'node-cron';
import { getDb } from '../db/index.js';
import { runWatchdog, executeDecision, checkOutcomes } from '../services/ad-watchdog.js';
import { handleSlackAction, verifySlackSignature } from '../services/slack-interactive.js';
import { buildContextWindow, runDecay } from '../services/agent-memory.js';
import { runMorningBriefing } from '../services/morning-briefing.js';
import { config } from '../config.js';
import type { AgentRunRow, AgentDecisionRow, AgentType } from '../types/index.js';

/* ------------------------------------------------------------------ */
/*  Cron scheduling                                                    */
/* ------------------------------------------------------------------ */

let cronStarted = false;

function startAgentCrons() {
  if (cronStarted) return;
  cronStarted = true;

  // Watchdog: daily at 1:30 AM UTC (7:00 AM IST)
  cron.schedule('30 1 * * *', async () => {
    console.log('[Brain] Starting daily watchdog...');
    try {
      const result = await runWatchdog();
      console.log(`[Brain] Watchdog completed: ${result.runs} runs, ${result.decisions} decisions`);
    } catch (err: any) {
      console.error('[Brain] Watchdog failed:', err.message);
    }
  });

  // Outcome checker: weekly on Mondays at 2:00 AM UTC
  cron.schedule('0 2 * * 1', async () => {
    console.log('[Brain] Running outcome checker...');
    try {
      const checked = await checkOutcomes();
      console.log(`[Brain] Outcome checker: ${checked} decisions checked`);
    } catch (err: any) {
      console.error('[Brain] Outcome checker failed:', err.message);
    }
  });

  // Morning briefing: daily at 1:35 AM UTC (7:05 AM IST, after watchdog)
  cron.schedule('35 1 * * *', async () => {
    console.log('[Brain] Starting morning briefing...');
    try {
      const sent = await runMorningBriefing();
      console.log(`[Brain] Morning briefing sent to ${sent} user(s)`);
    } catch (err: any) {
      console.error('[Brain] Morning briefing failed:', err.message);
    }
  });

  // Memory decay: weekly on Sundays at 3:00 AM UTC
  cron.schedule('0 3 * * 0', () => {
    console.log('[Brain] Running memory decay...');
    try {
      const affected = runDecay();
      console.log(`[Brain] Memory decay: ${affected} episodes affected`);
    } catch (err: any) {
      console.error('[Brain] Memory decay failed:', err.message);
    }
  });

  console.log('[Brain] Crons scheduled: watchdog 1:30 UTC, briefing 1:35 UTC, outcomes Mon 2:00 UTC, decay Sun 3:00 UTC');
}

/* ------------------------------------------------------------------ */
/*  Routes                                                             */
/* ------------------------------------------------------------------ */

export async function agentRoutes(app: FastifyInstance) {
  startAgentCrons();

  // --- Slack interactivity (no auth, signature-verified) ---

  app.post('/slack-action', async (request, reply) => {
    // Verify Slack signature if signing secret is configured
    if (config.slackSigningSecret) {
      const timestamp = (request.headers['x-slack-request-timestamp'] as string) || '';
      const signature = (request.headers['x-slack-signature'] as string) || '';
      const rawBody = JSON.stringify(request.body);

      if (!verifySlackSignature(config.slackSigningSecret, timestamp, rawBody, signature)) {
        return reply.status(401).send({ error: 'Invalid signature' });
      }
    }

    try {
      const body = request.body as any;
      // Slack sends payload as form-encoded with a "payload" field
      const payload = body.payload ? JSON.parse(body.payload) : body;
      const result = await handleSlackAction(payload);
      return result;
    } catch (err: any) {
      console.error('[Brain] Slack action error:', err.message);
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  // --- Authenticated routes ---

  // GET /agent/runs — list past agent runs
  app.get('/runs', { preHandler: [app.authenticate] }, async (request) => {
    const { agent_type, limit = '20' } = request.query as { agent_type?: string; limit?: string };
    const db = getDb();

    let query = 'SELECT * FROM agent_runs WHERE user_id = ?';
    const params: any[] = [request.user.id];

    if (agent_type) {
      query += ' AND agent_type = ?';
      params.push(agent_type);
    }

    query += ' ORDER BY started_at DESC LIMIT ?';
    params.push(parseInt(limit, 10) || 20);

    const runs = db.prepare(query).all(...params) as AgentRunRow[];

    return {
      success: true,
      runs: runs.map(r => ({
        id: r.id,
        agent_type: r.agent_type,
        status: r.status,
        started_at: r.started_at,
        completed_at: r.completed_at,
        summary: r.summary,
      })),
    };
  });

  // GET /agent/decisions — list decisions
  app.get('/decisions', { preHandler: [app.authenticate] }, async (request) => {
    const { status, limit = '50' } = request.query as { status?: string; limit?: string };
    const db = getDb();

    let query = 'SELECT * FROM agent_decisions WHERE user_id = ?';
    const params: any[] = [request.user.id];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY rowid DESC LIMIT ?';
    params.push(parseInt(limit, 10) || 50);

    const decisions = db.prepare(query).all(...params) as AgentDecisionRow[];

    return {
      success: true,
      decisions: decisions.map(d => ({
        id: d.id,
        run_id: d.run_id,
        account_id: d.account_id,
        type: d.type,
        target_id: d.target_id,
        target_name: d.target_name,
        reasoning: d.reasoning,
        confidence: d.confidence,
        urgency: d.urgency,
        suggested_action: d.suggested_action,
        estimated_impact: d.estimated_impact,
        status: d.status,
        approved_at: d.approved_at,
        executed_at: d.executed_at,
        outcome_checked_at: d.outcome_checked_at,
        outcome: d.outcome,
      })),
    };
  });

  // POST /agent/decisions/:id/approve — approve a pending decision
  app.post('/decisions/:id/approve', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const decision = db.prepare(
      'SELECT * FROM agent_decisions WHERE id = ? AND user_id = ?'
    ).get(id, request.user.id) as AgentDecisionRow | undefined;

    if (!decision) {
      return reply.status(404).send({ success: false, error: 'Decision not found' });
    }
    if (decision.status !== 'pending') {
      return reply.status(400).send({ success: false, error: `Decision is ${decision.status}, not pending` });
    }

    db.prepare(`
      UPDATE agent_decisions SET status = 'approved', approved_at = datetime('now')
      WHERE id = ?
    `).run(id);

    const result = await executeDecision(id);

    return { success: result.success, message: result.message };
  });

  // POST /agent/decisions/:id/reject — reject a pending decision
  app.post('/decisions/:id/reject', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const decision = db.prepare(
      'SELECT * FROM agent_decisions WHERE id = ? AND user_id = ?'
    ).get(id, request.user.id) as AgentDecisionRow | undefined;

    if (!decision) {
      return reply.status(404).send({ success: false, error: 'Decision not found' });
    }
    if (decision.status !== 'pending') {
      return reply.status(400).send({ success: false, error: `Decision is ${decision.status}, not pending` });
    }

    db.prepare("UPDATE agent_decisions SET status = 'rejected' WHERE id = ?").run(id);

    return { success: true, message: `Rejected: ${decision.suggested_action} on "${decision.target_name}"` };
  });

  // POST /agent/watchdog/run — manual trigger (admin only)
  app.post('/watchdog/run', { preHandler: [app.authenticate] }, async (request, reply) => {
    const db = getDb();
    const userRow = db.prepare('SELECT role FROM users WHERE id = ?').get(request.user.id) as { role: string } | undefined;
    if (!userRow || userRow.role !== 'admin') {
      return reply.status(403).send({ success: false, error: 'Admin access required' });
    }

    const result = await runWatchdog();
    return { success: true, ...result };
  });

  // GET /agent/memory/:agentType — debug: view memory context
  app.get('/memory/:agentType', { preHandler: [app.authenticate] }, async (request) => {
    const { agentType } = request.params as { agentType: AgentType };
    const context = buildContextWindow(request.user.id, agentType);
    return { success: true, context };
  });

  // GET /agent/briefing/latest — get latest morning briefing run
  app.get('/briefing/latest', { preHandler: [app.authenticate] }, async (request) => {
    const db = getDb();
    const run = db.prepare(`
      SELECT * FROM agent_runs
      WHERE user_id = ? AND agent_type = 'briefing'
      ORDER BY started_at DESC LIMIT 1
    `).get(request.user.id) as AgentRunRow | undefined;

    if (!run) {
      return { success: true, briefing: null };
    }

    let rawContext = null;
    try {
      rawContext = run.raw_context ? JSON.parse(run.raw_context) : null;
    } catch { /* ignore */ }

    return {
      success: true,
      briefing: {
        id: run.id,
        status: run.status,
        started_at: run.started_at,
        completed_at: run.completed_at,
        summary: run.summary,
        data: rawContext,
      },
    };
  });
}
