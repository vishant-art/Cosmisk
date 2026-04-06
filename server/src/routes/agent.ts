import type { FastifyInstance } from 'fastify';
import cron from 'node-cron';
import { getDb } from '../db/index.js';
import { runWatchdog, executeDecision, checkOutcomes } from '../services/ad-watchdog.js';
import { handleSlackAction, verifySlackSignature } from '../services/slack-interactive.js';
import { buildContextWindow, runDecay, getCoreMemory } from '../services/agent-memory.js';
import { runMorningBriefing } from '../services/morning-briefing.js';
import { config } from '../config.js';
import { runReportAgentAll, runReportAgent } from '../services/report-agent.js';
import { runContentAgentAll, runContentAgent } from '../services/content-agent.js';
import { getSalesContext, runSalesAgentAll } from '../services/sales-agent.js';
import { runMetaWarmup } from '../services/meta-warmup.js';
import type { AgentRunRow, AgentDecisionRow, AgentType } from '../types/index.js';
import { validate, agentRunsQuerySchema, agentDecisionsQuerySchema, idParamSchema } from '../validation/schemas.js';
import { logger } from '../utils/logger.js';
import { safeJsonParse } from '../utils/safe-json.js';

/* ------------------------------------------------------------------ */
/*  Cron scheduling                                                    */
/* ------------------------------------------------------------------ */

let cronStarted = false;
let watchdogRunning = false;

function startAgentCrons() {
  if (cronStarted) return;
  cronStarted = true;

  // Watchdog: daily at 1:30 AM UTC (7:00 AM IST)
  cron.schedule('30 1 * * *', async () => {
    logger.info('[Brain] Starting daily watchdog...');
    watchdogRunning = true;
    try {
      const result = await runWatchdog();
      logger.info(`[Brain] Watchdog completed: ${result.runs} runs, ${result.decisions} decisions`);
    } catch (err: any) {
      logger.error({ err: err.message }, '[Brain] Watchdog failed');
    } finally {
      watchdogRunning = false;
    }
  });

  // Morning briefing: daily at 1:35 AM UTC (7:05 AM IST, after watchdog)
  // Waits for watchdog to finish before starting (#4)
  cron.schedule('35 1 * * *', async () => {
    // Wait up to 30 minutes for watchdog to finish
    const maxWait = 30 * 60 * 1000;
    const start = Date.now();
    while (watchdogRunning && Date.now() - start < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    if (watchdogRunning) {
      logger.warn('[Brain] Morning briefing starting despite watchdog still running (timeout)');
    }

    logger.info('[Brain] Starting morning briefing...');
    try {
      const sent = await runMorningBriefing();
      logger.info(`[Brain] Morning briefing sent to ${sent} user(s)`);
    } catch (err: any) {
      logger.error({ err: err.message }, '[Brain] Morning briefing failed');
    }
  });

  // Outcome checker: weekly on Mondays at 2:00 AM UTC
  cron.schedule('0 2 * * 1', async () => {
    logger.info('[Brain] Running outcome checker...');
    try {
      const checked = await checkOutcomes();
      logger.info(`[Brain] Outcome checker: ${checked} decisions checked`);
    } catch (err: any) {
      logger.error({ err: err.message }, '[Brain] Outcome checker failed');
    }
  });

  // Memory decay: weekly on Sundays at 3:00 AM UTC
  cron.schedule('0 3 * * 0', () => {
    logger.info('[Brain] Running memory decay...');
    try {
      const affected = runDecay();
      logger.info(`[Brain] Memory decay: ${affected} episodes affected`);
    } catch (err: any) {
      logger.error({ err: err.message }, '[Brain] Memory decay failed');
    }
  });

  // Report agent: weekly on Tuesdays at 2:00 AM UTC (7:30 AM IST)
  cron.schedule('0 2 * * 2', async () => {
    logger.info('[Brain] Starting weekly report agent...');
    try {
      const count = await runReportAgentAll();
      logger.info(`[Brain] Report agent completed: ${count} reports generated`);
    } catch (err: unknown) {
      logger.error({ err: err instanceof Error ? err.message : err }, '[Brain] Report agent failed');
    }
  });

  // Content agent: weekly on Wednesdays at 2:00 AM UTC (7:30 AM IST)
  cron.schedule('0 2 * * 3', async () => {
    logger.info('[Brain] Starting weekly content agent...');
    try {
      const count = await runContentAgentAll();
      logger.info(`[Brain] Content agent completed: ${count} briefs generated`);
    } catch (err: unknown) {
      logger.error({ err: err instanceof Error ? err.message : err }, '[Brain] Content agent failed');
    }
  });

  // Sales agent: weekly on Thursdays at 2:00 AM UTC (7:30 AM IST)
  cron.schedule('0 2 * * 4', async () => {
    logger.info('[Brain] Starting weekly sales agent...');
    try {
      const count = await runSalesAgentAll();
      logger.info(`[Brain] Sales agent completed: ${count} users analyzed`);
    } catch (err: unknown) {
      logger.error({ err: err instanceof Error ? err.message : err }, '[Brain] Sales agent failed');
    }
  });

  // Meta API warmup: every 2 hours — ~120 calls/run × 12 runs/day = ~1,500 calls/day for App Review
  cron.schedule('0 */2 * * *', async () => {
    logger.info('[MetaWarmup] Starting Meta API warmup...');
    try {
      const result = await runMetaWarmup();
      logger.info(`[MetaWarmup] Complete: ${result.usersProcessed} users, ${result.totalCalls} calls, ${result.errors.length} errors`);
    } catch (err: unknown) {
      logger.error({ err: err instanceof Error ? err.message : err }, '[MetaWarmup] Failed');
    }
  });

  logger.info('[Brain] Crons scheduled: watchdog 1:30 UTC, briefing 1:35 UTC, outcomes Mon 2:00 UTC, reports Tue 2:00 UTC, content Wed 2:00 UTC, sales Thu 2:00 UTC, warmup every 2h, decay Sun 3:00 UTC');
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LIMIT = 100;

function clampLimit(raw: string | undefined, defaultVal: number): number {
  const parsed = parseInt(raw || String(defaultVal), 10);
  return Math.min(Math.max(1, parsed || defaultVal), MAX_LIMIT);
}

/* ------------------------------------------------------------------ */
/*  Routes                                                             */
/* ------------------------------------------------------------------ */

export async function agentRoutes(app: FastifyInstance) {
  startAgentCrons();

  // --- Slack interactivity (no auth, signature-verified) ---
  // Register raw body parsing for Slack signature verification (#17)
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (req, body, done) => {
      done(null, body);
    }
  );

  app.post('/slack-action', async (request, reply) => {
    const rawBody = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);

    // ALWAYS verify signature — reject if no signing secret configured (#5)
    if (!config.slackSigningSecret) {
      logger.warn('[Brain] Slack action rejected: SLACK_SIGNING_SECRET not configured');
      return reply.status(403).send({ error: 'Slack signing secret not configured' });
    }

    const timestamp = (request.headers['x-slack-request-timestamp'] as string) || '';
    const signature = (request.headers['x-slack-signature'] as string) || '';

    if (!verifySlackSignature(config.slackSigningSecret, timestamp, rawBody, signature)) {
      return reply.status(401).send({ error: 'Invalid signature' });
    }

    try {
      // Parse Slack's form-encoded payload (#17)
      let payload: any;
      if (typeof request.body === 'string') {
        const params = new URLSearchParams(request.body);
        const payloadStr = params.get('payload');
        if (!payloadStr) return reply.status(400).send({ error: 'Missing payload' });
        payload = JSON.parse(payloadStr);
      } else {
        const body = request.body as Record<string, string>;
        payload = body['payload'] ? JSON.parse(body['payload']) : body;
      }

      // Validate action value is a UUID (#7)
      const actionValue = payload?.actions?.[0]?.value;
      if (actionValue && !UUID_RE.test(actionValue)) {
        return reply.status(400).send({ error: 'Invalid decision ID format' });
      }

      const result = await handleSlackAction(payload);
      return result;
    } catch (err: any) {
      logger.error({ err: err.message }, '[Brain] Slack action error');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  // --- Authenticated routes ---

  // GET /agent/runs
  app.get('/runs', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(agentRunsQuerySchema, request.query, reply);
    if (!parsed) return;
    const { agent_type, limit } = parsed;
    const db = getDb();

    let query = 'SELECT * FROM agent_runs WHERE user_id = ?';
    const params: (string | number)[] = [request.user.id];

    if (agent_type) {
      query += ' AND agent_type = ?';
      params.push(agent_type);
    }

    query += ' ORDER BY started_at DESC LIMIT ?';
    params.push(limit);

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

  // GET /agent/decisions
  app.get('/decisions', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(agentDecisionsQuerySchema, request.query, reply);
    if (!parsed) return;
    const { status, limit } = parsed;
    const db = getDb();

    let query = 'SELECT * FROM agent_decisions WHERE user_id = ?';
    const params: (string | number)[] = [request.user.id];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY rowid DESC LIMIT ?';
    params.push(limit);

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

  // POST /agent/decisions/:id/approve
  app.post('/decisions/:id/approve', { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = validate(idParamSchema, request.params, reply);
    if (!params) return;
    const { id } = params;

    const db = getDb();
    const decision = db.prepare(
      'SELECT * FROM agent_decisions WHERE id = ? AND user_id = ?'
    ).get(id, request.user.id) as AgentDecisionRow | undefined;

    if (!decision) return reply.status(404).send({ success: false, error: 'Decision not found' });
    if (decision.status !== 'pending') {
      return reply.status(400).send({ success: false, error: `Decision is ${decision.status}, not pending` });
    }

    db.prepare("UPDATE agent_decisions SET status = 'approved', approved_at = datetime('now') WHERE id = ?").run(id);

    // Execute with user-scoping (#6)
    const result = await executeDecision(id, request.user.id);
    return { success: result.success, message: result.message };
  });

  // POST /agent/decisions/:id/reject
  app.post('/decisions/:id/reject', { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = validate(idParamSchema, request.params, reply);
    if (!params) return;
    const { id } = params;

    const db = getDb();
    const decision = db.prepare(
      'SELECT * FROM agent_decisions WHERE id = ? AND user_id = ?'
    ).get(id, request.user.id) as AgentDecisionRow | undefined;

    if (!decision) return reply.status(404).send({ success: false, error: 'Decision not found' });
    if (decision.status !== 'pending') {
      return reply.status(400).send({ success: false, error: `Decision is ${decision.status}, not pending` });
    }

    db.prepare("UPDATE agent_decisions SET status = 'rejected' WHERE id = ?").run(id);
    return { success: true, message: `Rejected: ${decision.suggested_action} on "${decision.target_name}"` };
  });

  // POST /agent/watchdog/run — manual trigger (admin only, 2/min)
  app.post('/watchdog/run', { preHandler: [app.authenticate], config: { rateLimit: { max: 2, timeWindow: '1 minute' } } }, async (request, reply) => {
    const db = getDb();
    const userRow = db.prepare('SELECT role FROM users WHERE id = ?').get(request.user.id) as { role: string } | undefined;
    if (!userRow || userRow.role !== 'admin') {
      return reply.status(403).send({ success: false, error: 'Admin access required' });
    }

    const result = await runWatchdog();
    return { success: true, ...result };
  });

  // POST /agent/report/run — manual trigger (admin only, 2/min)
  app.post('/report/run', { preHandler: [app.authenticate], config: { rateLimit: { max: 2, timeWindow: '1 minute' } } }, async (request, reply) => {
    const db = getDb();
    const userRow = db.prepare('SELECT role FROM users WHERE id = ?').get(request.user.id) as { role: string } | undefined;
    if (!userRow || userRow.role !== 'admin') {
      return reply.status(403).send({ success: false, error: 'Admin access required' });
    }
    const count = await runReportAgentAll();
    return { success: true, reports: count };
  });

  // POST /agent/content/run — manual trigger (admin only, 2/min)
  app.post('/content/run', { preHandler: [app.authenticate], config: { rateLimit: { max: 2, timeWindow: '1 minute' } } }, async (request, reply) => {
    const db = getDb();
    const userRow = db.prepare('SELECT role FROM users WHERE id = ?').get(request.user.id) as { role: string } | undefined;
    if (!userRow || userRow.role !== 'admin') {
      return reply.status(403).send({ success: false, error: 'Admin access required' });
    }
    const count = await runContentAgentAll();
    return { success: true, briefs: count };
  });

  // POST /agent/sales/run — manual trigger (admin only, 2/min)
  app.post('/sales/run', { preHandler: [app.authenticate], config: { rateLimit: { max: 2, timeWindow: '1 minute' } } }, async (request, reply) => {
    const db = getDb();
    const userRow = db.prepare('SELECT role FROM users WHERE id = ?').get(request.user.id) as { role: string } | undefined;
    if (!userRow || userRow.role !== 'admin') {
      return reply.status(403).send({ success: false, error: 'Admin access required' });
    }
    const count = await runSalesAgentAll();
    return { success: true, contexts: count };
  });

  // POST /agent/meta-warmup/run — manual trigger (admin only, 2/min)
  app.post('/meta-warmup/run', { preHandler: [app.authenticate], config: { rateLimit: { max: 2, timeWindow: '1 minute' } } }, async (request, reply) => {
    const db = getDb();
    const userRow = db.prepare('SELECT role FROM users WHERE id = ?').get(request.user.id) as { role: string } | undefined;
    if (!userRow || userRow.role !== 'admin') {
      return reply.status(403).send({ success: false, error: 'Admin access required' });
    }
    const result = await runMetaWarmup();
    return { success: true, ...result };
  });

  // GET /agent/sales/context — sales context for n8n integration
  app.get('/sales/context', { preHandler: [app.authenticate] }, async (request) => {
    const context = await getSalesContext(request.user.id);
    return { success: true, ...context };
  });

  // GET /agent/memory/:agentType — context window string
  app.get('/memory/:agentType', { preHandler: [app.authenticate] }, async (request) => {
    const { agentType } = request.params as { agentType: AgentType };
    const context = buildContextWindow(request.user.id, agentType);
    return { success: true, context };
  });

  // GET /agent/memory-structured — structured memory for UI display
  app.get('/memory-structured', { preHandler: [app.authenticate] }, async (request) => {
    const db = getDb();
    const userId = request.user.id;

    // Core memories across all agent types
    const coreRows = db.prepare(
      'SELECT agent_type, key, value, updated_at FROM agent_core_memory WHERE user_id = ? ORDER BY updated_at DESC'
    ).all(userId) as { agent_type: string; key: string; value: string; updated_at: string }[];

    // Recent episodes (top 20 by relevance)
    const episodes = db.prepare(`
      SELECT id, agent_type, event, context, outcome, relevance_score, reinforcement_count, created_at
      FROM agent_episodes
      WHERE user_id = ? AND relevance_score > 0.2
      ORDER BY relevance_score DESC, created_at DESC
      LIMIT 20
    `).all(userId) as { id: string; agent_type: string; event: string; context: string | null; outcome: string | null; relevance_score: number; reinforcement_count: number; created_at: string }[];

    // Known entities (top 30 by mention count)
    const entities = db.prepare(`
      SELECT entity_type, entity_name, mention_count, first_seen, last_seen
      FROM agent_entities
      WHERE user_id = ?
      ORDER BY mention_count DESC, last_seen DESC
      LIMIT 30
    `).all(userId) as { entity_type: string; entity_name: string; mention_count: number; first_seen: string; last_seen: string }[];

    // Memory stats
    const totalEpisodes = (db.prepare('SELECT COUNT(*) as cnt FROM agent_episodes WHERE user_id = ?').get(userId) as any)?.cnt || 0;
    const totalEntities = (db.prepare('SELECT COUNT(*) as cnt FROM agent_entities WHERE user_id = ?').get(userId) as any)?.cnt || 0;
    const totalCoreMemories = coreRows.length;

    return {
      success: true,
      core: coreRows,
      episodes,
      entities,
      stats: { totalCoreMemories, totalEpisodes, totalEntities },
    };
  });

  // GET /agent/briefing/latest
  app.get('/briefing/latest', { preHandler: [app.authenticate] }, async (request) => {
    const db = getDb();
    const run = db.prepare(`
      SELECT * FROM agent_runs
      WHERE user_id = ? AND agent_type = 'briefing'
      ORDER BY started_at DESC LIMIT 1
    `).get(request.user.id) as AgentRunRow | undefined;

    if (!run) return { success: true, briefing: null };

    const rawContext = safeJsonParse(run.raw_context, null);

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
