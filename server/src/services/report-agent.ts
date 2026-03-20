/**
 * Client Report Agent — auto-generates performance reports
 * with memory-aware commentary ("Last report noted declining video ROAS — check if trend continued").
 *
 * Built on the same agent_runs + agent_memory infrastructure as watchdog.
 * Full implementation coming in Phase 4.
 */

import { getDb } from '../db/index.js';
import { buildContextWindow, recordEpisode } from './agent-memory.js';
import { v4 as uuidv4 } from 'uuid';
import type { AgentRunRow } from '../types/index.js';

export async function runReportAgent(userId: string, accountId: string): Promise<string> {
  const db = getDb();
  const runId = uuidv4();

  db.prepare(`
    INSERT INTO agent_runs (id, agent_type, user_id, status, started_at)
    VALUES (?, 'report', ?, 'running', datetime('now'))
  `).run(runId, userId);

  try {
    // Build memory context for continuity between reports
    const memoryContext = buildContextWindow(userId, 'report', {
      maxEpisodes: 10,
      entityTypes: ['campaign', 'metric', 'pattern'],
    });

    // TODO: Full implementation
    // 1. Fetch Meta Ads data (7d/30d/custom range)
    // 2. Build report with Claude Opus (strategy-grade analysis)
    // 3. Compare against past reports via memory
    // 4. Generate PDF or structured JSON
    // 5. Record episode for next report's context

    const summary = 'Report agent stub — full implementation pending';

    db.prepare(`
      UPDATE agent_runs SET status = 'completed', completed_at = datetime('now'),
      summary = ? WHERE id = ?
    `).run(summary, runId);

    await recordEpisode(userId, 'report', `Generated report for account ${accountId}`, memoryContext);

    return runId;
  } catch (err: any) {
    db.prepare(`
      UPDATE agent_runs SET status = 'failed', completed_at = datetime('now'),
      summary = ? WHERE id = ?
    `).run(`Error: ${err.message}`, runId);
    throw err;
  }
}
