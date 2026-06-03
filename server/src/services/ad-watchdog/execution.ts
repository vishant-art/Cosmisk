import { getDbAdapter } from '../../db/adapter.js';
import { decryptToken } from '../token-crypto.js';
import { MetaApiService } from '../meta-api.js';
import { parseInsightMetrics } from '../insights-parser.js';
import { round, fmt } from '../format-helpers.js';
import { safeFetch, safeJson } from '../../utils/safe-fetch.js';
import { config } from '../../config.js';
import { reinforceEpisode, penalizeEpisode } from '../agent-memory.js';
import type { MetaTokenRow, AgentDecisionRow } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

/* ------------------------------------------------------------------ */
/*  Execute approved decision (with user-scoping #6)                   */
/* ------------------------------------------------------------------ */

export async function executeDecision(decisionId: string, userId?: string): Promise<{ success: boolean; message: string }> {
  const db = getDbAdapter();

  // User-scoped query when userId provided (#6)
  const decision = userId
    ? await db.get<AgentDecisionRow>('SELECT * FROM agent_decisions WHERE id = ? AND user_id = ?', [decisionId, userId])
    : await db.get<AgentDecisionRow>('SELECT * FROM agent_decisions WHERE id = ?', [decisionId]);

  if (!decision) return { success: false, message: 'Decision not found' };
  if (decision.status !== 'approved') return { success: false, message: `Decision status is ${decision.status}, expected approved` };

  const tokenRow = await db.get<MetaTokenRow>('SELECT * FROM meta_tokens WHERE user_id = ?', [decision.user_id]);
  if (!tokenRow) return { success: false, message: 'No Meta token found' };

  const token = decryptToken(tokenRow.encrypted_access_token);
  const meta = new MetaApiService(token);

  try {
    switch (decision.suggested_action) {
      case 'pause': {
        // Use MetaApiService instead of raw fetch (#2)
        const resp = await safeFetch(`${config.graphApiBase}/${decision.target_id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: token, status: 'PAUSED' }),
          service: 'Meta Marketing API',
        });
        if (!resp.ok) {
          const err = await safeJson(resp);
          return { success: false, message: `Meta API error: ${err?.error?.message || 'Unknown'}` };
        }
        break;
      }

      case 'reduce_budget':
      case 'increase_budget': {
        const adsetsResp = await meta.get<any>(`/${decision.target_id}/adsets`, {
          fields: 'id,daily_budget',
          limit: '10',
        });
        const adsets = adsetsResp.data || [];
        const pct = decision.suggested_action === 'reduce_budget' ? 0.8 : 1.2;

        // Parallel budget adjustments with error checking (#3, #12)
        const results = await Promise.allSettled(
          adsets.map(async (adset: any) => {
            const currentBudget = parseInt(adset.daily_budget || '0', 10);
            if (!currentBudget) return { skipped: true };
            const newBudget = Math.max(100, Math.round(currentBudget * pct));
            const resp = await safeFetch(`${config.graphApiBase}/${adset.id}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ access_token: token, daily_budget: newBudget }),
              service: 'Meta Marketing API',
            });
            if (!resp.ok) {
              const err = await safeJson(resp);
              throw new Error(`Adset ${adset.id}: ${err?.error?.message || 'Unknown error'}`);
            }
            return { adsetId: adset.id, newBudget };
          })
        );

        const failures = results.filter(r => r.status === 'rejected');
        if (failures.length > 0 && failures.length === adsets.length) {
          return { success: false, message: `All budget changes failed: ${(failures[0] as PromiseRejectedResult).reason}` };
        }
        if (failures.length > 0) {
          logger.warn(`[Watchdog] ${failures.length}/${adsets.length} budget changes failed for ${decision.target_name}`);
        }
        break;
      }

      case 'new_creative':
      case 'monitor':
        break;

      default:
        return { success: false, message: `Unknown action: ${decision.suggested_action}` };
    }

    await db.run(`
      UPDATE agent_decisions SET status = 'executed', executed_at = datetime('now')
      WHERE id = ?
    `, [decisionId]);

    return { success: true, message: `Executed: ${decision.suggested_action} on "${decision.target_name}"` };
  } catch (err: any) {
    return { success: false, message: `Execution failed: ${err.message}` };
  }
}

/* ------------------------------------------------------------------ */
/*  Check outcomes of past decisions (weekly)                          */
/* ------------------------------------------------------------------ */

export async function checkOutcomes(): Promise<number> {
  const db = getDbAdapter();
  const decisions = await db.all<AgentDecisionRow>(`
    SELECT * FROM agent_decisions
    WHERE status = 'executed'
    AND outcome_checked_at IS NULL
    AND executed_at < datetime('now', '-7 days')
    LIMIT 50
  `);

  let checked = 0;

  for (const decision of decisions) {
    try {
      const tokenRow = await db.get<MetaTokenRow>('SELECT * FROM meta_tokens WHERE user_id = ?', [decision.user_id]);
      if (!tokenRow) continue;

      const token = decryptToken(tokenRow.encrypted_access_token);
      const meta = new MetaApiService(token);

      const currentData = await meta.get<any>(`/${decision.target_id}/insights`, {
        fields: 'spend,impressions,clicks,ctr,actions,action_values,purchase_roas',
        date_preset: 'last_7d',
      }).catch(() => ({ data: [] }));

      const current = parseInsightMetrics(currentData.data?.[0] || {});

      let outcome = 'unknown';
      let isPositive = false;

      if (decision.suggested_action === 'pause') {
        outcome = current.spend === 0 ? 'positive: confirmed_paused' : 'neutral: still_spending';
        isPositive = current.spend === 0;
      } else if (decision.suggested_action === 'reduce_budget') {
        // Positive if ROAS improved post-reduction (#1 — fixed: compare to breakeven, not phantom field)
        outcome = `post_reduction: ${round(current.roas, 2)}x ROAS, ${fmt(current.spend)} spend`;
        isPositive = current.roas > 1.0; // profitable after reduction = good decision
      } else if (decision.suggested_action === 'increase_budget') {
        outcome = `post_increase: ${round(current.roas, 2)}x ROAS, ${fmt(current.spend)} spend`;
        isPositive = current.roas > 1.5; // still strong after scaling
      } else {
        outcome = `current: ${round(current.roas, 2)}x ROAS, ${round(current.ctr, 2)}% CTR`;
        isPositive = current.roas > 1.0;
      }

      await db.run(`
        UPDATE agent_decisions
        SET outcome_checked_at = datetime('now'), outcome = ?
        WHERE id = ?
      `, [outcome, decision.id]);

      // Reinforce or penalize related episodes
      const episodes = await db.all<{ id: string }>(`
        SELECT id FROM agent_episodes
        WHERE user_id = ? AND agent_type = 'watchdog'
        AND event LIKE ?
        ORDER BY created_at DESC LIMIT 1
      `, [decision.user_id, `%${decision.target_name}%`]);

      for (const ep of episodes) {
        if (isPositive) {
          await reinforceEpisode(ep.id);
        } else {
          await penalizeEpisode(ep.id);
        }
      }

      checked++;
    } catch (err: any) {
      logger.error({ err: err.message }, `[Watchdog] Outcome check failed for decision ${decision.id}`);
    }
  }

  return checked;
}
