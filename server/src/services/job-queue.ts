/**
 * SQLite-based concurrent job processor for creative generation.
 * Grabs pending jobs, dispatches to providers, polls async jobs, updates progress.
 */

import { getDbAdapter } from '../db/adapter.js';
import { getProvider } from './api-providers.js';
import { notifyAlert } from './notifications.js';
import { checkDailyLimit } from './llm-gateway.js';
import type { JobRow, SprintRow, CountRow } from '../types/index.js';
import { logger } from '../utils/logger.js';

// Re-export for backwards compatibility with any external callers expecting it
// to live on job-queue. Single source of truth lives in llm-gateway.ts.
export { checkDailyLimit };

/** Shape returned by the sprint job stats aggregation query */
interface SprintJobStats {
  completed: number | null;
  failed: number | null;
  actual_cost: number | null;
}

const MAX_CONCURRENT = 5;
const POLL_INTERVAL_MS = 5_000;
const MAX_RETRIES = 2;

// Track active sprint processors to avoid duplicates
const activeProcessors = new Set<string>();

/* ------------------------------------------------------------------ */
/*  Start processing a sprint's jobs                                   */
/* ------------------------------------------------------------------ */

export function startSprintGeneration(sprintId: string): void {
  if (activeProcessors.has(sprintId)) return;
  activeProcessors.add(sprintId);
  processSprintJobs(sprintId).catch((err) => {
    logger.error({ err }, `[JobQueue] Fatal error processing sprint ${sprintId}`);
    activeProcessors.delete(sprintId);
  });
}

/* ------------------------------------------------------------------ */
/*  Main processing loop                                               */
/* ------------------------------------------------------------------ */

async function processSprintJobs(sprintId: string): Promise<void> {
  const db = getDbAdapter();
  logger.info(`[JobQueue] Starting generation for sprint ${sprintId}`);

  try {
    while (true) {
      // Check sprint is still in generating state
      const sprint = await db.get(
        'SELECT status FROM creative_sprints WHERE id = ?'
      , [sprintId]) as { status: string } | undefined;

      if (!sprint || sprint.status !== 'generating') {
        logger.info(`[JobQueue] Sprint ${sprintId} is no longer generating (${sprint?.status}), stopping`);
        break;
      }

      // Count currently active jobs (generating or polling)
      const activeCount = (await db.get(
        "SELECT COUNT(*) as c FROM creative_jobs WHERE sprint_id = ? AND status IN ('generating', 'polling')"
      , [sprintId]) as CountRow).c;

      // Poll any async jobs that are waiting
      if (activeCount > 0) {
        await pollAsyncJobs(sprintId);
      }

      // Grab pending jobs up to concurrency limit
      const slotsAvailable = MAX_CONCURRENT - await getActiveJobCount(sprintId);

      if (slotsAvailable > 0) {
        const pendingJobs = await db.all(
          "SELECT * FROM creative_jobs WHERE sprint_id = ? AND status IN ('pending', 'script_ready') ORDER BY priority DESC, created_at ASC LIMIT ?"
        , [sprintId, slotsAvailable]) as JobRow[];

        if (pendingJobs.length > 0) {
          // Dispatch jobs in parallel
          await Promise.allSettled(
            pendingJobs.map(job => dispatchJob(job))
          );
        }
      }

      // Check if all jobs are done
      const remaining = (await db.get(
        "SELECT COUNT(*) as c FROM creative_jobs WHERE sprint_id = ? AND status NOT IN ('completed', 'failed', 'cancelled')"
      , [sprintId]) as CountRow).c;

      if (remaining === 0) {
        // All done — update sprint status
        await updateSprintProgress(sprintId);
        await db.run(
          "UPDATE creative_sprints SET status = 'reviewing', updated_at = datetime('now') WHERE id = ?"
        , [sprintId]);
        logger.info(`[JobQueue] Sprint ${sprintId} generation complete, moved to reviewing`);

        // Notify user of sprint completion
        const sprint = await db.get(
          'SELECT user_id, name, completed_creatives, failed_creatives FROM creative_sprints WHERE id = ?'
        , [sprintId]) as { user_id: string; name: string; completed_creatives: number; failed_creatives: number } | undefined;
        if (sprint) {
          notifyAlert(sprint.user_id, {
            type: 'sprint_complete',
            title: `Sprint "${sprint.name}" generation complete`,
            content: `${sprint.completed_creatives} creatives generated successfully${sprint.failed_creatives > 0 ? `, ${sprint.failed_creatives} failed` : ''}. Ready for review.`,
            severity: 'info',
          }).catch(err => logger.error({ err }, '[JobQueue] Notify dispatch error'));
        }
        break;
      }

      // Update sprint progress
      await updateSprintProgress(sprintId);

      // Wait before next loop iteration
      await sleep(POLL_INTERVAL_MS);
    }
  } finally {
    activeProcessors.delete(sprintId);
  }
}

/* ------------------------------------------------------------------ */
/*  Dispatch a single job to its provider                              */
/* ------------------------------------------------------------------ */

async function dispatchJob(job: JobRow): Promise<void> {
  const db = getDbAdapter();

  // Check daily cost limit before dispatching
  const limitCheck = checkDailyLimit(job.user_id);
  if (!limitCheck.allowed) {
    logger.warn({ userId: job.user_id, spent: limitCheck.spent, limit: limitCheck.limit }, '[JobQueue] Daily cost limit reached');
    await db.run(
      "UPDATE creative_jobs SET status = 'failed', error_message = ? WHERE id = ?"
    , [`Daily spending limit reached ($${(limitCheck.limit / 100).toFixed(0)}/day). Resets at midnight UTC.`, job.id]);
    return;
  }

  const provider = getProvider(job.api_provider || 'kling');

  // Mark as generating
  await db.run(
    "UPDATE creative_jobs SET status = 'generating', started_at = datetime('now') WHERE id = ?"
  , [job.id]);

  try {
    const script = job.script ? JSON.parse(job.script) : null;

    const result = await provider.generate({
      format: job.format,
      script,
      prompt: script?.sections?.[0]?.visual, // use first visual as prompt fallback
      aspect_ratio: '9:16',
    });

    if (result.status === 'completed') {
      // Job completed synchronously
      await db.run(
        "UPDATE creative_jobs SET status = 'completed', output_url = ?, output_thumbnail = ?, cost_cents = ?, completed_at = datetime('now') WHERE id = ?"
      , [result.output_url || null, result.thumbnail_url || null, result.cost_cents, job.id]);

      // Record cost
      await writeCostLedger(job, provider.name, result.cost_cents);

    } else if (result.status === 'processing' && result.job_id) {
      // Async job — store job_id for polling
      await db.run(
        "UPDATE creative_jobs SET status = 'polling', api_job_id = ?, cost_cents = ? WHERE id = ?"
      , [result.job_id, result.cost_cents, job.id]);

    } else {
      // Failed
      await handleJobFailure(job, result.error || 'Unknown generation error');
    }
  } catch (err: any) {
    await handleJobFailure(job, err.message || 'Provider threw an exception');
  }
}

/* ------------------------------------------------------------------ */
/*  Poll async jobs that are in 'polling' state                        */
/* ------------------------------------------------------------------ */

async function pollAsyncJobs(sprintId: string): Promise<void> {
  const db = getDbAdapter();
  const pollingJobs = await db.all(
    "SELECT * FROM creative_jobs WHERE sprint_id = ? AND status = 'polling' AND api_job_id IS NOT NULL"
  , [sprintId]) as JobRow[];

  await Promise.allSettled(
    pollingJobs.map(async (job) => {
      const provider = getProvider(job.api_provider || 'kling');

      try {
        const status = await provider.checkStatus(job.api_job_id!);

        if (status.status === 'completed') {
          await db.run(
            "UPDATE creative_jobs SET status = 'completed', output_url = ?, output_thumbnail = ?, completed_at = datetime('now') WHERE id = ?"
          , [status.output_url || null, status.thumbnail_url || null, job.id]);

          await writeCostLedger(job, provider.name, job.cost_cents);

        } else if (status.status === 'failed') {
          await handleJobFailure(job, status.error || 'Provider returned failed status');
        }
        // 'processing' → keep polling
      } catch (err: any) {
        logger.error({ err: err.message }, `[JobQueue] Error polling job ${job.id}`);
        // Don't fail the job on poll error — might be transient
      }
    })
  );
}

/* ------------------------------------------------------------------ */
/*  Handle job failure with retry logic                                */
/* ------------------------------------------------------------------ */

async function handleJobFailure(job: JobRow, errorMessage: string): Promise<void> {
  const db = getDbAdapter();

  if (job.retry_count < MAX_RETRIES) {
    // Reset to pending for retry
    await db.run(
      "UPDATE creative_jobs SET status = 'pending', error_message = ?, retry_count = retry_count + 1 WHERE id = ?"
    , [errorMessage, job.id]);
    logger.info(`[JobQueue] Job ${job.id} failed (attempt ${job.retry_count + 1}/${MAX_RETRIES + 1}), will retry: ${errorMessage}`);
  } else {
    // Max retries exceeded — mark as failed
    await db.run(
      "UPDATE creative_jobs SET status = 'failed', error_message = ?, completed_at = datetime('now') WHERE id = ?"
    , [errorMessage, job.id]);
    logger.info(`[JobQueue] Job ${job.id} permanently failed after ${MAX_RETRIES + 1} attempts: ${errorMessage}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Cost ledger                                                        */
/* ------------------------------------------------------------------ */

async function writeCostLedger(job: JobRow, providerName: string, costCents: number): Promise<void> {
  if (costCents <= 0) return;

  const db = getDbAdapter();
  await db.run(`
    INSERT INTO cost_ledger (user_id, sprint_id, job_id, api_provider, operation, cost_cents, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    job.user_id,
    job.sprint_id,
    job.id,
    providerName,
    `${job.format}_gen`,
    costCents,
    JSON.stringify({ format: job.format, retry_count: job.retry_count }),
  ]);
}

/* ------------------------------------------------------------------ */
/*  Sprint progress sync                                               */
/* ------------------------------------------------------------------ */

async function updateSprintProgress(sprintId: string): Promise<void> {
  const db = getDbAdapter();

  const stats = await db.get(`
    SELECT
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'completed' THEN cost_cents ELSE 0 END) as actual_cost
    FROM creative_jobs WHERE sprint_id = ?
  `, [sprintId]) as SprintJobStats;

  await db.run(`
    UPDATE creative_sprints
    SET completed_creatives = ?, failed_creatives = ?, actual_cost_cents = ?, updated_at = datetime('now')
    WHERE id = ?
  `, [stats.completed || 0, stats.failed || 0, stats.actual_cost || 0, sprintId]);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function getActiveJobCount(sprintId: string): Promise<number> {
  const db = getDbAdapter();
  return (await db.get(
    "SELECT COUNT(*) as c FROM creative_jobs WHERE sprint_id = ? AND status IN ('generating', 'polling')"
  , [sprintId]) as CountRow).c;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Recover sprints that were interrupted by a server restart.
 * - Jobs stuck in 'generating' or 'polling' → reset to 'pending' for retry
 * - Sprints still in 'generating' → restart their processor loop
 * Call this once at server startup after DB is ready.
 */
export async function recoverInterruptedSprints(): Promise<void> {
  const db = getDbAdapter();

  // Reset jobs that were mid-flight when the server died
  const resetResult = await db.run(`
    UPDATE creative_jobs SET status = 'pending', retry_count = retry_count + 1
    WHERE status IN ('generating', 'polling')
  `, []);

  if (resetResult.changes > 0) {
    logger.info(`[JobQueue] Recovery: reset ${resetResult.changes} interrupted jobs to pending`);
  }

  // Find sprints that are still in 'generating' state
  const stuckSprints = await db.all(
    "SELECT id FROM creative_sprints WHERE status = 'generating'"
  , []) as { id: string }[];

  for (const sprint of stuckSprints) {
    // Check if there are still jobs to process
    const remaining = (await db.get(
      "SELECT COUNT(*) as c FROM creative_jobs WHERE sprint_id = ? AND status NOT IN ('completed', 'failed', 'cancelled')"
    , [sprint.id]) as CountRow).c;

    if (remaining > 0) {
      logger.info(`[JobQueue] Recovery: resuming sprint ${sprint.id} (${remaining} jobs remaining)`);
      startSprintGeneration(sprint.id);
    } else {
      // All jobs are done but sprint wasn't updated — finalize it
      await updateSprintProgress(sprint.id);
      await db.run(
        "UPDATE creative_sprints SET status = 'reviewing', updated_at = datetime('now') WHERE id = ?"
      , [sprint.id]);
      logger.info(`[JobQueue] Recovery: sprint ${sprint.id} was already complete, moved to reviewing`);
    }
  }

  if (stuckSprints.length === 0 && resetResult.changes === 0) {
    logger.info('[JobQueue] Recovery: no interrupted sprints found');
  }
}

/**
 * Check if a sprint is currently being processed.
 */
export function isSprintActive(sprintId: string): boolean {
  return activeProcessors.has(sprintId);
}

/**
 * Stop processing a sprint (will stop on next loop iteration).
 */
export async function stopSprintGeneration(sprintId: string): Promise<void> {
  const db = getDbAdapter();
  // Setting status to something other than 'generating' will cause the loop to exit
  await db.run(
    "UPDATE creative_sprints SET status = 'approved', updated_at = datetime('now') WHERE id = ?"
  , [sprintId]);
}
