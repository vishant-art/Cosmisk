import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import cron from 'node-cron';
import { getDb } from '../db/index.js';
import { decryptToken } from '../services/token-crypto.js';
import { MetaApiService } from '../services/meta-api.js';
import { parseInsightMetrics } from '../services/insights-parser.js';
import { fmt, setCurrency } from '../services/format-helpers.js';
import { assessConfidence, computeTrend, trendCaveat } from '../services/trend-analyzer.js';
import { runAutomations } from '../services/automation-engine.js';
import type { MetaTokenRow } from '../types/index.js';
import { validate, automationCreateSchema, automationUpdateSchema, idParamSchema } from '../validation/schemas.js';
import { logger } from '../utils/logger.js';
import { internalError } from '../utils/error-response.js';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any = {};
  try {
    parsed = triggerValue ? JSON.parse(triggerValue) : {};
  } catch {
    parsed = {};
  }
  const metric = triggerType.toUpperCase();
  const operator = parsed.operator || 'gt';
  const value = parsed.value || '0';
  const opMap: Record<string, string> = {
    gt: '>', lt: '<', eq: '=', gte: '>=', lte: '<=',
  };
  return `${metric} ${opMap[operator] || '>'} ${value}`;
}

function formatAction(actionType: string, actionValue: string | null): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any = {};
  try {
    parsed = actionValue ? JSON.parse(actionValue) : {};
  } catch {
    parsed = {};
  }
  const actionMap: Record<string, string> = {
    pause: 'Pause ad set',
    reduce_budget: `Reduce budget by ${parsed.percentage || 20}%`,
    increase_budget: `Increase budget by ${parsed.percentage || 20}%`,
    notify: 'Send notification',
  };
  const scope = parsed.scope ? ` (${parsed.scope})` : '';
  return (actionMap[actionType] || actionType) + scope;
}

/* ------------------------------------------------------------------ */
/*  Routes                                                             */
/* ------------------------------------------------------------------ */
let automationCronStartedModule = false;

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
      lastTriggered: row.last_triggered ? new Date(row.last_triggered + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never',
      triggerCount: row.last_triggered ? 1 : 0,
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
    const parsed = validate(automationCreateSchema, request.body, reply);
    if (!parsed) return;
    const { name, trigger_type, trigger_value, action_type, action_value, account_id } = parsed;

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
    const { id: rawId, ...rest } = request.body as { id?: string } & Record<string, unknown>;
    if (!rawId) {
      return reply.status(400).send({ success: false, error: 'id is required' });
    }
    const id = rawId;
    const parsed = validate(automationUpdateSchema, rest, reply);
    if (!parsed) return;
    const { name, trigger_type, trigger_value, action_type, action_value, is_active } = parsed;

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

      // Detect currency
      try {
        const accInfo = await meta.get<any>(`/${account_id}`, { fields: 'currency' });
        if (accInfo?.currency) setCurrency(accInfo.currency);
      } catch { /* keep default */ }

      // Fetch account-level averages + 7d ads + daily breakdown for trend analysis
      const [accountInsights, adsRaw, adsDailyRaw] = await Promise.all([
        meta.get<any>(`/${account_id}/insights`, {
          fields: 'spend,ctr,cpc,actions,action_values,purchase_roas',
          date_preset: 'last_7d',
          level: 'account',
        }),
        meta.getAllPages<any>(`/${account_id}/ads`, {
          fields: 'id,name,insights.date_preset(last_7d){spend,ctr,actions,action_values,purchase_roas},status',
          limit: '50',
          filtering: JSON.stringify([
            { field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] },
          ]),
        }),
        // Daily ad-level data for trend detection
        meta.get<any>(`/${account_id}/insights`, {
          fields: 'ad_name,ad_id,spend,ctr,actions,action_values,purchase_roas',
          level: 'ad',
          date_preset: 'last_7d',
          time_increment: '1',
          limit: '200',
        }),
      ]);

      const accountMetrics = parseInsightMetrics(accountInsights.data?.[0] || {});
      const avgCpa = accountMetrics.cpa || 0;
      const avgRoas = accountMetrics.roas || 0;
      const avgCtr = accountMetrics.ctr || 0;
      const totalAccountSpend = accountMetrics.spend || 0;

      // Build daily metric maps per ad for trend analysis
      const dailyCpaByAd = new Map<string, number[]>();
      const dailyRoasByAd = new Map<string, number[]>();
      const dailyCtrByAd = new Map<string, number[]>();
      for (const row of (adsDailyRaw.data || [])) {
        const adId = row.ad_id;
        if (!dailyCpaByAd.has(adId)) { dailyCpaByAd.set(adId, []); dailyRoasByAd.set(adId, []); dailyCtrByAd.set(adId, []); }
        const dm = parseInsightMetrics(row);
        dailyCpaByAd.get(adId)!.push(dm.cpa);
        dailyRoasByAd.get(adId)!.push(dm.roas);
        dailyCtrByAd.get(adId)!.push(dm.ctr);
      }

      // Find top performer for suggested reallocation — with confidence check
      const allAds = adsRaw.map((ad: any) => {
        const m = parseInsightMetrics(ad.insights?.data?.[0] || {});
        const conf = assessConfidence({ spend: m.spend, totalAccountSpend, conversions: m.conversions, impressions: m.impressions });
        return { id: ad.id, name: ad.name || 'Unnamed Ad', status: ad.status, confidence: conf, ...m };
      });
      // Top performer must have enough data to be credible
      const topPerformer = [...allAds]
        .filter(a => a.roas > 0 && a.confidence.shouldRecommendAction)
        .sort((a, b) => b.roas - a.roas)[0]
        || [...allAds].sort((a, b) => b.roas - a.roas).find(a => a.roas > 0);

      const activity: Array<{ type: string; message: string; time: string; context?: string; suggestedAction?: string }> = [];

      for (const ad of adsRaw) {
        const insight = ad.insights?.data?.[0] || {};
        const m = parseInsightMetrics(insight);
        const adName = ad.name || 'Unnamed Ad';
        const shortName = adName.length > 30 ? adName.substring(0, 27) + '...' : adName;
        const conf = assessConfidence({ spend: m.spend, totalAccountSpend, conversions: m.conversions, impressions: m.impressions });

        // Get trends for this ad
        const cpaTrend = computeTrend(dailyCpaByAd.get(ad.id) || []);
        const roasTrend = computeTrend(dailyRoasByAd.get(ad.id) || []);
        const ctrTrend = computeTrend(dailyCtrByAd.get(ad.id) || []);

        // HIGH CPA ALERT — but check: is CPA improving? Is data reliable?
        if (m.cpa > avgCpa * 1.5 && m.cpa > 100 && m.spend > 0) {
          const aboveAvgPct = avgCpa > 0 ? Math.round(((m.cpa - avgCpa) / avgCpa) * 100) : 0;

          // Check trend before recommending pause
          const trendNote = trendCaveat('CPA', true, cpaTrend);
          const isRecovering = cpaTrend.direction === 'declining'; // CPA declining = improving

          let suggested: string;
          if (isRecovering) {
            suggested = `CPA is ${cpaTrend.label} (getting better). Monitor for 2-3 more days before acting.`;
          } else if (!conf.shouldRecommendAction) {
            suggested = `Only ${fmt(m.spend)} spent (${m.conversions} conversion${m.conversions !== 1 ? 's' : ''}) — not enough data to confidently recommend pausing. Let it run longer.`;
          } else if (topPerformer && topPerformer.name !== adName) {
            suggested = `Pause and reallocate ${fmt(m.spend)} to '${topPerformer.name}' (${topPerformer.roas.toFixed(1)}x ROAS).`;
          } else {
            suggested = `Pause and test new creatives with cost cap at ${fmt(avgCpa * 0.8)}.`;
          }

          activity.push({
            type: 'pause',
            message: `High CPA alert: "${shortName}" — CPA at ${fmt(m.cpa)}`,
            time: 'This week',
            context: (avgCpa > 0 ? `${aboveAvgPct}% above your ${fmt(avgCpa)} account average.` : `CPA of ${fmt(m.cpa)} on ${fmt(m.spend)} spend.`) + (trendNote ? ` ${trendNote}` : '') + (conf.caveat ? ` ${conf.caveat}` : ''),
            suggestedAction: suggested,
          });
        }

        // STRONG PERFORMER — check if trend is stable/growing, and data is reliable
        if (m.roas > 2 && m.spend > 0) {
          const aboveAvgPct = avgRoas > 0 ? Math.round(((m.roas - avgRoas) / avgRoas) * 100) : 0;
          const trendNote = roasTrend.direction !== 'stable' ? ` ROAS trend: ${roasTrend.label}.` : '';

          let suggested: string;
          if (!conf.shouldRecommendAction) {
            suggested = `${m.roas.toFixed(1)}x ROAS looks strong but based on ${m.conversions} conversion${m.conversions !== 1 ? 's' : ''} from ${fmt(m.spend)}. Wait for more data before scaling.`;
          } else if (roasTrend.direction === 'declining') {
            suggested = `ROAS is ${roasTrend.label} — hold off on scaling until the trend stabilizes. Current performance may not sustain at higher budget.`;
          } else {
            suggested = `Increase budget by 15-20% (add ~${fmt(m.spend * 0.15 / 7)}/day). At ${m.roas.toFixed(1)}x ROAS, each ${fmt(1000)} generates ~${fmt(m.roas * 1000)}.`;
          }

          activity.push({
            type: 'budget',
            message: `Strong performer: "${shortName}" — ROAS ${m.roas.toFixed(1)}x`,
            time: 'This week',
            context: (avgRoas > 0 ? `${aboveAvgPct}% above your ${avgRoas.toFixed(1)}x account average.` : `${m.roas.toFixed(1)}x ROAS on ${fmt(m.spend)} spend.`) + trendNote + (conf.caveat ? ` ${conf.caveat}` : ''),
            suggestedAction: suggested,
          });
        }

        // LOW CTR — but check if CTR is recovering
        if (m.ctr < avgCtr * 0.5 && m.ctr < 1 && m.impressions > 500) {
          const belowAvgPct = avgCtr > 0 ? Math.round(((avgCtr - m.ctr) / avgCtr) * 100) : 0;
          const trendNote = trendCaveat('CTR', true, ctrTrend);

          let suggested: string;
          if (ctrTrend.direction === 'improving') {
            suggested = `CTR is ${ctrTrend.label} — the latest creatives may be working. Monitor for 2-3 more days.`;
          } else {
            suggested = `Creative fatigue likely. Create 3-5 new variations with different hooks. Test UGC-style content.`;
          }

          activity.push({
            type: 'notify',
            message: `Low CTR warning: "${shortName}" — CTR ${m.ctr.toFixed(2)}%`,
            time: 'This week',
            context: (avgCtr > 0 ? `${belowAvgPct}% below your ${avgCtr.toFixed(2)}% account average.` : `Only ${m.ctr.toFixed(2)}% CTR on ${fmt(m.spend)} spend.`) + (trendNote ? ` ${trendNote}` : ''),
            suggestedAction: suggested,
          });
        }

        // PAUSED ADS — was it paused prematurely?
        if (ad.status === 'PAUSED' && m.spend > 0) {
          const roasWasGood = m.roas >= 2;
          const roasWasTrending = roasTrend.direction === 'improving';

          let suggested: string;
          if (roasWasGood && conf.shouldRecommendAction) {
            suggested = `Consider reactivating — ${m.roas.toFixed(1)}x ROAS on ${fmt(m.spend)} with ${m.conversions} conversions was solidly profitable.`;
          } else if (roasWasTrending) {
            suggested = `ROAS was ${roasTrend.label} before being paused. Consider reactivating — the ad may have been paused prematurely.`;
          } else if (!conf.shouldRecommendAction && m.roas > 0) {
            suggested = `Had ${m.roas.toFixed(1)}x ROAS but only ${m.conversions} conversion${m.conversions !== 1 ? 's' : ''} — not enough data to judge. Consider reactivating to gather more.`;
          } else {
            suggested = 'Keep paused. Test new creatives before reactivating.';
          }

          activity.push({
            type: 'pause',
            message: `Paused: "${shortName}"`,
            time: 'Recently',
            context: m.roas > 0 ? `Was running at ${m.roas.toFixed(1)}x ROAS, ${fmt(m.spend)} spent (${m.conversions} conversions)` : `${fmt(m.spend)} total spend before pause`,
            suggestedAction: suggested,
          });
        }
      }

      // Limit to most recent 10 entries
      return { success: true, activity: activity.slice(0, 10) };
    } catch (err: any) {
      logger.error({ err: err.message }, 'automations/activity failed');
      // Return empty activity on error rather than failing
      return { success: true, activity: [] };
    }
  });

  // POST /automations/run — Manual trigger for automation rules (admin only)
  app.post('/run', { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'admin') {
      return reply.status(403).send({ success: false, error: 'Admin access required' });
    }
    try {
      const count = await runAutomations();
      return { success: true, executed: count, message: `${count} automation actions executed` };
    } catch (err: any) {
      return internalError(reply, err, 'automations/run failed');
    }
  });

  // Start automation cron — every 4 hours
  if (!automationCronStartedModule) {
    automationCronStartedModule = true;
    cron.schedule('0 */4 * * *', async () => {
      try {
        const count = await runAutomations();
        logger.info(`[Automations] Cron complete: ${count} actions executed`);
      } catch (err: any) {
        logger.error({ err: err.message }, '[Automations] Cron failed');
      }
    });
    logger.info('[Automations] Cron scheduled every 4 hours');
  }
}
