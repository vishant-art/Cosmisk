import type { FastifyInstance } from 'fastify';
import cron from 'node-cron';
import { getDb } from '../db/index.js';
import { runAutopilot } from '../services/autopilot-engine.js';
import type { AutopilotAlertRow } from '../types/index.js';

/* ------------------------------------------------------------------ */
/*  Schedule daily autopilot run (6 AM UTC)                            */
/* ------------------------------------------------------------------ */

let cronStarted = false;

function startAutopilotCron() {
  if (cronStarted) return;
  cronStarted = true;

  cron.schedule('0 6 * * *', async () => {
    console.log('[Autopilot] Starting daily analysis...');
    try {
      const alertCount = await runAutopilot();
      console.log(`[Autopilot] Completed. Generated ${alertCount} alerts.`);
    } catch (err: any) {
      console.error('[Autopilot] Failed:', err.message);
    }
  });

  console.log('[Autopilot] Cron scheduled for 6:00 AM UTC daily');
}

/* ------------------------------------------------------------------ */
/*  Routes                                                            */
/* ------------------------------------------------------------------ */

export async function autopilotRoutes(app: FastifyInstance) {
  // Start cron on route registration
  startAutopilotCron();

  // GET /autopilot/alerts — list user's alerts
  app.get('/alerts', { preHandler: [app.authenticate] }, async (request) => {
    const { limit = '50', unread_only = 'false' } = request.query as { limit?: string; unread_only?: string };
    const db = getDb();

    let query = 'SELECT * FROM autopilot_alerts WHERE user_id = ?';
    const params: any[] = [request.user.id];

    if (unread_only === 'true') {
      query += ' AND read = 0';
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit, 10) || 50);

    const alerts = db.prepare(query).all(...params) as AutopilotAlertRow[];

    return {
      success: true,
      alerts: alerts.map(a => ({
        id: a.id,
        account_id: a.account_id,
        type: a.type,
        title: a.title,
        content: a.content,
        severity: a.severity,
        read: !!a.read,
        created_at: a.created_at,
      })),
      unread_count: db.prepare('SELECT COUNT(*) as cnt FROM autopilot_alerts WHERE user_id = ? AND read = 0').get(request.user.id) as { cnt: number },
    };
  });

  // GET /autopilot/unread-count — badge count for notification bell
  app.get('/unread-count', { preHandler: [app.authenticate] }, async (request) => {
    const db = getDb();
    const result = db.prepare('SELECT COUNT(*) as count FROM autopilot_alerts WHERE user_id = ? AND read = 0').get(request.user.id) as { count: number };
    return { success: true, count: result.count };
  });

  // POST /autopilot/mark-read — mark alert(s) as read
  app.post('/mark-read', { preHandler: [app.authenticate] }, async (request) => {
    const { alert_ids, mark_all } = request.body as { alert_ids?: string[]; mark_all?: boolean };
    const db = getDb();

    if (mark_all) {
      db.prepare('UPDATE autopilot_alerts SET read = 1 WHERE user_id = ?').run(request.user.id);
    } else if (alert_ids && alert_ids.length > 0) {
      const placeholders = alert_ids.map(() => '?').join(',');
      db.prepare(`UPDATE autopilot_alerts SET read = 1 WHERE id IN (${placeholders}) AND user_id = ?`)
        .run(...alert_ids, request.user.id);
    }

    return { success: true };
  });

  // POST /autopilot/run — manually trigger autopilot (admin/testing)
  app.post('/run', { preHandler: [app.authenticate] }, async (request) => {
    const alertCount = await runAutopilot();
    return { success: true, alerts_generated: alertCount };
  });

  // DELETE /autopilot/alerts/:id — delete a specific alert
  app.delete('/alerts/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const result = db.prepare('DELETE FROM autopilot_alerts WHERE id = ? AND user_id = ?').run(id, request.user.id);
    if (result.changes === 0) {
      return reply.status(404).send({ success: false, error: 'Alert not found' });
    }
    return { success: true };
  });
}
