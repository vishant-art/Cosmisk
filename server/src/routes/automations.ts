import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index.js';
import { decryptToken } from '../services/token-crypto.js';
import { MetaApiService } from '../services/meta-api.js';
import { parseInsightMetrics } from '../services/insights-parser.js';
import type { MetaTokenRow } from '../types/index.js';

/* ------------------------------------------------------------------ */
/*  Helper: get user's decrypted Meta token                           */
/* ------------------------------------------------------------------ */
function getUserMetaToken(userId: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(userId) as MetaTokenRow | undefined;
  if (!row) return null;
  return decryptToken(row.encrypted_access_token);
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface AutomationRow {
  id: string;
  user_id: string;
  account_id: string | null;
  name: string;
  trigger_type: string;
  trigger_value: string | null;
  action_type: string;
  action_value: string | null;
  is_active: number;
  last_triggered: string | null;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Helper: format condition and action for display                    */
/* ------------------------------------------------------------------ */
function formatCondition(triggerType: string, triggerValue: string | null): string {
  const parsed = triggerValue ? JSON.parse(triggerValue) : {};
  const metric = triggerType.toUpperCase();
  const operator = parsed.operator || 'gt';
  const value = parsed.value || '0';
  const opMap: Record<string, string> = {
    gt: '>', lt: '<', eq: '=', gte: '>=', lte: '<=',
  };
  return `${metric} ${opMap[operator] || '>'} ${value}`;
}

function formatAction(actionType: string, actionValue: string | null): string {
  const parsed = actionValue ? JSON.parse(actionValue) : {};
  const actionMap: Record<string, string> = {
    pause: 'Pause ad set',
    reduce_budget: `Reduce budget by ${parsed.percentage || 20}%`,
    increase_budget: `Increase budget by ${parsed.percentage || 20}%`,
    notify: 'Send notification',
    duplicate: 'Duplicate & modify',
  };
  const scope = parsed.scope ? ` (${parsed.scope})` : '';
  return (actionMap[actionType] || actionType) + scope;
}

/* ------------------------------------------------------------------ */
/*  Routes                                                             */
/* ------------------------------------------------------------------ */
export async function automationRoutes(app: FastifyInstance) {

  // GET /automations/list — Get user's automation rules
  app.get('/list', { preHandler: [app.authenticate] }, async (request) => {
    const db = getDb();
    const rows = db.prepare(
      'SELECT * FROM automations WHERE user_id = ? ORDER BY created_at DESC'
    ).all(request.user.id) as AutomationRow[];

    const automations = rows.map(row => ({
      id: row.id,
      name: row.name,
      status: row.is_active ? 'active' as const : 'paused' as const,
      condition: formatCondition(row.trigger_type, row.trigger_value),
      action: formatAction(row.action_type, row.action_value),
      lastTriggered: row.last_triggered || 'Never',
      triggerCount: 0, // Could be tracked in a separate table
      triggerType: row.trigger_type,
      triggerValue: row.trigger_value ? JSON.parse(row.trigger_value) : null,
      actionType: row.action_type,
      actionValue: row.action_value ? JSON.parse(row.action_value) : null,
      accountId: row.account_id,
      createdAt: row.created_at,
    }));

    return { success: true, automations };
  });

  // POST /automations/create — Create a new automation rule
  app.post('/create', { preHandler: [app.authenticate] }, async (request, reply) => {
    const {
      name,
      trigger_type,
      trigger_value,
      action_type,
      action_value,
      account_id,
    } = request.body as {
      name?: string;
      trigger_type?: string;
      trigger_value?: any;
      action_type?: string;
      action_value?: any;
      account_id?: string;
    };

    if (!name || !trigger_type || !action_type) {
      return reply.status(400).send({
        success: false,
        error: 'name, trigger_type, and action_type are required',
      });
    }

    const db = getDb();
    const id = uuidv4();

    db.prepare(
      `INSERT INTO automations (id, user_id, account_id, name, trigger_type, trigger_value, action_type, action_value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      request.user.id,
      account_id || null,
      name,
      trigger_type,
      trigger_value ? JSON.stringify(trigger_value) : null,
      action_type,
      action_value ? JSON.stringify(action_value) : null,
    );

    const created = db.prepare('SELECT * FROM automations WHERE id = ?').get(id) as AutomationRow;

    return {
      success: true,
      automation: {
        id: created.id,
        name: created.name,
        status: created.is_active ? 'active' as const : 'paused' as const,
        condition: formatCondition(created.trigger_type, created.trigger_value),
        action: formatAction(created.action_type, created.action_value),
        lastTriggered: 'Never',
        triggerCount: 0,
        triggerType: created.trigger_type,
        triggerValue: created.trigger_value ? JSON.parse(created.trigger_value) : null,
        actionType: created.action_type,
        actionValue: created.action_value ? JSON.parse(created.action_value) : null,
        accountId: created.account_id,
        createdAt: created.created_at,
      },
    };
  });

  // PUT /automations/update — Update an existing automation rule
  app.put('/update', { preHandler: [app.authenticate] }, async (request, reply) => {
    const {
      id,
      name,
      trigger_type,
      trigger_value,
      action_type,
      action_value,
      is_active,
    } = request.body as {
      id?: string;
      name?: string;
      trigger_type?: string;
      trigger_value?: any;
      action_type?: string;
      action_value?: any;
      is_active?: boolean;
    };

    if (!id) {
      return reply.status(400).send({ success: false, error: 'id is required' });
    }

    const db = getDb();
    const existing = db.prepare(
      'SELECT * FROM automations WHERE id = ? AND user_id = ?'
    ).get(id, request.user.id) as AutomationRow | undefined;

    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Automation not found' });
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (trigger_type !== undefined) { updates.push('trigger_type = ?'); values.push(trigger_type); }
    if (trigger_value !== undefined) { updates.push('trigger_value = ?'); values.push(JSON.stringify(trigger_value)); }
    if (action_type !== undefined) { updates.push('action_type = ?'); values.push(action_type); }
    if (action_value !== undefined) { updates.push('action_value = ?'); values.push(JSON.stringify(action_value)); }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }

    if (updates.length === 0) {
      return reply.status(400).send({ success: false, error: 'No fields to update' });
    }

    values.push(id, request.user.id);
    db.prepare(
      `UPDATE automations SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`
    ).run(...values);

    const updated = db.prepare('SELECT * FROM automations WHERE id = ?').get(id) as AutomationRow;

    return {
      success: true,
      automation: {
        id: updated.id,
        name: updated.name,
        status: updated.is_active ? 'active' as const : 'paused' as const,
        condition: formatCondition(updated.trigger_type, updated.trigger_value),
        action: formatAction(updated.action_type, updated.action_value),
        lastTriggered: updated.last_triggered || 'Never',
        triggerCount: 0,
        triggerType: updated.trigger_type,
        triggerValue: updated.trigger_value ? JSON.parse(updated.trigger_value) : null,
        actionType: updated.action_type,
        actionValue: updated.action_value ? JSON.parse(updated.action_value) : null,
        accountId: updated.account_id,
        createdAt: updated.created_at,
      },
    };
  });

  // DELETE /automations/delete — Delete an automation rule
  app.delete('/delete', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.query as { id?: string };

    if (!id) {
      return reply.status(400).send({ success: false, error: 'id query param is required' });
    }

    const db = getDb();
    const existing = db.prepare(
      'SELECT * FROM automations WHERE id = ? AND user_id = ?'
    ).get(id, request.user.id) as AutomationRow | undefined;

    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Automation not found' });
    }

    db.prepare('DELETE FROM automations WHERE id = ? AND user_id = ?').run(id, request.user.id);

    return { success: true };
  });

  // GET /automations/activity — Return activity log based on recent ad performance changes
  app.get('/activity', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { account_id } = request.query as { account_id?: string };

    if (!account_id) {
      return reply.status(400).send({ success: false, error: 'account_id required' });
    }

    try {
      const token = getUserMetaToken(request.user.id);
      if (!token) {
        return reply.status(200).send({ success: true, activity: [], meta_connected: false });
      }
      const meta = new MetaApiService(token);

      // Fetch recent ads with insights for last_7d to generate activity
      const adsRaw = await meta.getAllPages<any>(`/${account_id}/ads`, {
        fields: 'id,name,insights.date_preset(last_7d){spend,ctr,actions,action_values,purchase_roas},status',
        limit: '50',
        filtering: JSON.stringify([
          { field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] },
        ]),
      });

      const activity: Array<{ type: string; message: string; time: string }> = [];

      for (const ad of adsRaw) {
        const insight = ad.insights?.data?.[0] || {};
        const m = parseInsightMetrics(insight);
        const adName = ad.name || 'Unnamed Ad';
        const shortName = adName.length > 30 ? adName.substring(0, 27) + '...' : adName;

        // Generate activity entries based on performance thresholds
        if (m.cpa > 500 && m.spend > 1000) {
          activity.push({
            type: 'pause',
            message: `High CPA alert: "${shortName}" — CPA at ₹${Math.round(m.cpa)}`,
            time: 'This week',
          });
        }

        if (m.roas > 3 && m.spend > 2000) {
          activity.push({
            type: 'budget',
            message: `Strong performer: "${shortName}" — ROAS ${m.roas.toFixed(1)}x`,
            time: 'This week',
          });
        }

        if (m.ctr < 0.5 && m.spend > 500) {
          activity.push({
            type: 'notify',
            message: `Low CTR warning: "${shortName}" — CTR ${m.ctr.toFixed(2)}%`,
            time: 'This week',
          });
        }

        if (ad.status === 'PAUSED') {
          activity.push({
            type: 'pause',
            message: `Paused: "${shortName}"`,
            time: 'Recently',
          });
        }
      }

      // Limit to most recent 10 entries
      return { success: true, activity: activity.slice(0, 10) };
    } catch (err: any) {
      app.log.error({ err: err.message }, 'automations/activity failed');
      // Return empty activity on error rather than failing
      return { success: true, activity: [] };
    }
  });
}
