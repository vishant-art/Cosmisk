import { getDb } from '../db/index.js';
import { decryptToken } from './token-crypto.js';
import { MetaApiService } from './meta-api.js';
import { parseInsightMetrics } from './insights-parser.js';
import { config } from '../config.js';
import { safeFetch, safeJson } from '../utils/safe-fetch.js';
import type { MetaTokenRow } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
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

interface TriggerResult {
  triggered: boolean;
  adId: string;
  adName: string;
  metricValue: number;
  thresholdValue: number;
}

/* ------------------------------------------------------------------ */
/*  Core: evaluate one automation rule against real ad data             */
/* ------------------------------------------------------------------ */

async function evaluateRule(
  rule: AutomationRow,
  meta: MetaApiService,
  accountId: string,
): Promise<TriggerResult[]> {
  const trigger = rule.trigger_value ? JSON.parse(rule.trigger_value) : {};
  const operator = trigger.operator || 'gt';
  const threshold = parseFloat(trigger.value || '0');

  // Fetch active ads with last 7d metrics
  const adsResp = await meta.get<any>(`/${accountId}/ads`, {
    fields: 'id,name,insights.date_preset(last_7d){spend,impressions,clicks,ctr,actions,action_values,purchase_roas}',
    limit: '50',
    filtering: JSON.stringify([
      { field: 'effective_status', operator: 'IN', value: ['ACTIVE'] },
    ]),
  });

  const ads = adsResp.data || [];
  const results: TriggerResult[] = [];

  for (const ad of ads) {
    const insight = ad.insights?.data?.[0];
    if (!insight) continue;
    const m = parseInsightMetrics(insight);

    // Get metric value based on trigger type
    const metricMap: Record<string, number> = {
      CPA: m.cpa,
      ROAS: m.roas,
      CTR: m.ctr,
      CPC: m.cpc,
      Spend: m.spend,
    };
    const metricValue = metricMap[rule.trigger_type] ?? 0;

    // Skip ads with trivial spend (< $5 equivalent)
    if (m.spend < 5) continue;

    // Compare
    const triggered =
      operator === 'gt' ? metricValue > threshold :
      operator === 'gte' ? metricValue >= threshold :
      operator === 'lt' ? metricValue < threshold :
      operator === 'lte' ? metricValue <= threshold :
      operator === 'eq' ? Math.abs(metricValue - threshold) < 0.01 :
      false;

    if (triggered) {
      results.push({
        triggered: true,
        adId: ad.id,
        adName: ad.name || 'Unnamed Ad',
        metricValue,
        thresholdValue: threshold,
      });
    }
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  Execute action on a triggered ad                                   */
/* ------------------------------------------------------------------ */

async function executeAction(
  rule: AutomationRow,
  trigger: TriggerResult,
  token: string,
  accountId: string,
): Promise<{ executed: boolean; message: string }> {
  const actionData = rule.action_value ? JSON.parse(rule.action_value) : {};

  switch (rule.action_type) {
    case 'pause': {
      const resp = await safeFetch(`${config.graphApiBase}/${trigger.adId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: token, status: 'PAUSED' }),
        service: 'Meta Marketing API',
      });
      if (resp.ok) {
        return { executed: true, message: `Paused ad "${trigger.adName}" (${rule.trigger_type} was ${trigger.metricValue})` };
      }
      const err = await safeJson(resp);
      return { executed: false, message: `Failed to pause: ${err?.error?.message || 'Unknown error'}` };
    }

    case 'reduce_budget':
    case 'increase_budget': {
      const pct = actionData.percentage || 20;
      const multiplier = rule.action_type === 'reduce_budget' ? (1 - pct / 100) : (1 + pct / 100);

      // Get current budget from ad set
      // First, get the ad's adset_id
      const adInfo = await safeFetch(`${config.graphApiBase}/${trigger.adId}?access_token=${token}&fields=adset_id`, {
        service: 'Meta Marketing API',
      });
      if (!adInfo.ok) return { executed: false, message: 'Could not fetch ad info' };
      const adData = await safeJson(adInfo);
      const adsetId = adData?.adset_id;
      if (!adsetId) return { executed: false, message: 'No adset found for ad' };

      // Get current budget
      const adsetInfo = await safeFetch(`${config.graphApiBase}/${adsetId}?access_token=${token}&fields=daily_budget`, {
        service: 'Meta Marketing API',
      });
      if (!adsetInfo.ok) return { executed: false, message: 'Could not fetch adset budget' };
      const adsetData = await safeJson(adsetInfo);
      const currentBudget = parseInt(adsetData?.daily_budget || '0', 10);
      if (!currentBudget) return { executed: false, message: 'No daily budget set on adset' };

      const newBudget = Math.max(100, Math.round(currentBudget * multiplier)); // Min $1/day in cents

      const updateResp = await safeFetch(`${config.graphApiBase}/${adsetId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: token, daily_budget: newBudget }),
        service: 'Meta Marketing API',
      });
      if (updateResp.ok) {
        const action = rule.action_type === 'reduce_budget' ? 'Reduced' : 'Increased';
        return { executed: true, message: `${action} budget by ${pct}% for adset of "${trigger.adName}"` };
      }
      return { executed: false, message: 'Failed to update budget' };
    }

    case 'notify': {
      // Create an autopilot alert instead of external notification
      const db = getDb();
      db.prepare(`
        INSERT INTO autopilot_alerts (id, user_id, account_id, type, title, content, severity)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(),
        rule.user_id,
        accountId,
        'automation_trigger',
        `Automation: ${rule.name}`,
        `Rule triggered on "${trigger.adName}": ${rule.trigger_type} = ${trigger.metricValue} (threshold: ${trigger.thresholdValue})`,
        'warning',
      );
      return { executed: true, message: `Notification created for "${trigger.adName}"` };
    }

    default:
      return { executed: false, message: `Action type "${rule.action_type}" not implemented` };
  }
}

/* ------------------------------------------------------------------ */
/*  Main: run all active automation rules                              */
/* ------------------------------------------------------------------ */

export async function runAutomations(): Promise<number> {
  const db = getDb();

  // Get all active automation rules with their users
  const rules = db.prepare(`
    SELECT a.* FROM automations a
    WHERE a.is_active = 1
  `).all() as AutomationRow[];

  if (!rules.length) return 0;

  let totalExecuted = 0;

  // Group rules by user
  const rulesByUser = new Map<string, AutomationRow[]>();
  for (const rule of rules) {
    const existing = rulesByUser.get(rule.user_id) || [];
    existing.push(rule);
    rulesByUser.set(rule.user_id, existing);
  }

  for (const [userId, userRules] of rulesByUser) {
    try {
      const tokenRow = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(userId) as MetaTokenRow | undefined;
      if (!tokenRow) continue;
      const token = decryptToken(tokenRow.encrypted_access_token);
      const meta = new MetaApiService(token);

      // Get ad accounts
      const accountsResp = await meta.get<any>('/me/adaccounts', { fields: 'id,name', limit: '50' });
      const accounts = accountsResp.data || [];

      for (const account of accounts) {
        const accountId = account.id;

        for (const rule of userRules) {
          // Skip if rule is scoped to a different account
          if (rule.account_id && rule.account_id !== accountId) continue;

          try {
            const triggers = await evaluateRule(rule, meta, accountId);

            for (const trigger of triggers) {
              const result = await executeAction(rule, trigger, token, accountId);

              if (result.executed) {
                totalExecuted++;
                // Update last_triggered
                db.prepare(
                  "UPDATE automations SET last_triggered = datetime('now') WHERE id = ?"
                ).run(rule.id);
              }

              console.log(`[Automations] Rule "${rule.name}" on ${trigger.adName}: ${result.message}`);
            }
          } catch (err: any) {
            console.error(`[Automations] Rule "${rule.name}" failed:`, err.message);
          }
        }
      }
    } catch (err: any) {
      console.error(`[Automations] User ${userId} failed:`, err.message);
    }
  }

  return totalExecuted;
}
