import type { FastifyInstance } from 'fastify';
import cron from 'node-cron';
import { getDb } from '../db/index.js';
import { runAutopilot } from '../services/autopilot-engine.js';
import type { AutopilotAlertRow } from '../types/index.js';
import { validate, autopilotAlertsQuerySchema, autopilotMarkReadSchema, idParamSchema } from '../validation/schemas.js';

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
  app.get('/alerts', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(autopilotAlertsQuerySchema, request.query, reply);
    if (!parsed) return;

    const db = getDb();

    let query = 'SELECT * FROM autopilot_alerts WHERE user_id = ?';
    const params: (string | number)[] = [request.user.id];

    if (parsed.unread_only === 'true') {
      query += ' AND read = 0';
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parsed.limit);

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
  app.post('/mark-read', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(autopilotMarkReadSchema, request.body, reply);
    if (!parsed) return;
    const db = getDb();

    if (parsed.mark_all) {
      db.prepare('UPDATE autopilot_alerts SET read = 1 WHERE user_id = ?').run(request.user.id);
    } else if (parsed.alert_ids && parsed.alert_ids.length > 0) {
      const placeholders = parsed.alert_ids.map(() => '?').join(',');
      db.prepare(`UPDATE autopilot_alerts SET read = 1 WHERE id IN (${placeholders}) AND user_id = ?`)
        .run(...parsed.alert_ids, request.user.id);
    }

    return { success: true };
  });

  // POST /autopilot/run — manually trigger autopilot (admin only)
  app.post('/run', { preHandler: [app.authenticate] }, async (request, reply) => {
    const db = getDb();
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(request.user.id) as { role: string } | undefined;
    if (!user || user.role !== 'admin') {
      return reply.status(403).send({ success: false, error: 'Admin access required' });
    }
    const alertCount = await runAutopilot();
    return { success: true, alerts_generated: alertCount };
  });

  // DELETE /autopilot/alerts/:id — delete a specific alert
  app.delete('/alerts/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(idParamSchema, request.params, reply);
    if (!parsed) return;
    const db = getDb();
    const result = db.prepare('DELETE FROM autopilot_alerts WHERE id = ? AND user_id = ?').run(parsed.id, request.user.id);
    if (result.changes === 0) {
      return reply.status(404).send({ success: false, error: 'Alert not found' });
    }
    return { success: true };
  });
}
