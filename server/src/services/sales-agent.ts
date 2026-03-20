/**
 * Sales Pipeline Agent — provides memory-enriched context to n8n Agent 5 via API endpoint.
 * Surfaces relevant past interactions, client preferences, and performance history.
 *
 * Built on the same agent_runs + agent_memory infrastructure as watchdog.
 * Full implementation coming in Phase 4.
 */

import { getDb } from '../db/index.js';
import { buildContextWindow, recordEpisode } from './agent-memory.js';
import { v4 as uuidv4 } from 'uuid';

export interface SalesContext {
  runId: string;
  memoryContext: string;
  recentDecisions: Array<{ type: string; targetName: string; outcome: string | null }>;
}

export async function getSalesContext(userId: string): Promise<SalesContext> {
  const db = getDb();
  const runId = uuidv4();

  db.prepare(`
    INSERT INTO agent_runs (id, agent_type, user_id, status, started_at)
    VALUES (?, 'sales', ?, 'running', datetime('now'))
  `).run(runId, userId);

  try {
    // Build memory context for sales conversations
    const memoryContext = buildContextWindow(userId, 'sales', {
      maxEpisodes: 20,
      entityTypes: ['brand', 'campaign', 'metric'],
    });

    // Get recent decisions for context
    const recentDecisions = db.prepare(`
      SELECT type, target_name, outcome FROM agent_decisions
      WHERE user_id = ? AND outcome IS NOT NULL
      ORDER BY rowid DESC LIMIT 10
    `).all(userId) as Array<{ type: string; target_name: string; outcome: string | null }>;

    // TODO: Full implementation
    // 1. Aggregate client performance history
    // 2. Build conversation context for n8n sales agent
    // 3. Include competitor analysis insights
    // 4. Surface upsell opportunities based on usage patterns

    db.prepare(`
      UPDATE agent_runs SET status = 'completed', completed_at = datetime('now'),
      summary = 'Sales context provided' WHERE id = ?
    `).run(runId);

    await recordEpisode(userId, 'sales', 'Provided sales context to n8n pipeline').catch(() => {});

    return {
      runId,
      memoryContext,
      recentDecisions: recentDecisions.map(d => ({
        type: d.type,
        targetName: d.target_name,
        outcome: d.outcome,
      })),
    };
  } catch (err: any) {
    db.prepare(`
      UPDATE agent_runs SET status = 'failed', completed_at = datetime('now'),
      summary = ? WHERE id = ?
    `).run(`Error: ${err.message}`, runId);
    throw err;
  }
}
