/**
 * Content Brief Agent — extends sprint-planner.ts with memory + competitor research.
 * Avoids recommending formats that previously underperformed.
 *
 * Built on the same agent_runs + agent_memory infrastructure as watchdog.
 * Full implementation coming in Phase 4.
 */

import { getDb } from '../db/index.js';
import { buildContextWindow, recordEpisode } from './agent-memory.js';
import { v4 as uuidv4 } from 'uuid';

export async function runContentAgent(userId: string, accountId: string): Promise<string> {
  const db = getDb();
  const runId = uuidv4();

  db.prepare(`
    INSERT INTO agent_runs (id, agent_type, user_id, status, started_at)
    VALUES (?, 'content', ?, 'running', datetime('now'))
  `).run(runId, userId);

  try {
    // Build memory context — includes past format performance
    const memoryContext = buildContextWindow(userId, 'content', {
      maxEpisodes: 15,
      entityTypes: ['campaign', 'pattern', 'ad'],
    });

    // TODO: Full implementation
    // 1. Analyze current top-performing creatives via DNA cache
    // 2. Pull competitor insights from competitor-spy data
    // 3. Cross-reference with memory: which formats/hooks worked before?
    // 4. Generate content brief via Claude (extends sprint-planner logic)
    // 5. Record episode with format recommendations for future reference

    const summary = 'Content agent stub — full implementation pending';

    db.prepare(`
      UPDATE agent_runs SET status = 'completed', completed_at = datetime('now'),
      summary = ? WHERE id = ?
    `).run(summary, runId);

    await recordEpisode(userId, 'content', `Generated content brief for account ${accountId}`, memoryContext);

    return runId;
  } catch (err: any) {
    db.prepare(`
      UPDATE agent_runs SET status = 'failed', completed_at = datetime('now'),
      summary = ? WHERE id = ?
    `).run(`Error: ${err.message}`, runId);
    throw err;
  }
}
