/**
 * MEMORY MAINTENANCE
 *
 * Scheduled tasks for memory system health:
 * - Daily decay of stale episodes
 * - Weekly cleanup of very old data
 * - Prediction verification checks
 */

import { CronJob } from 'cron';
import { runDecay } from './agent-memory.js';
import { getPendingPredictions, verifyPrediction } from './strategic-memory.js';
import { getDbAdapter } from '../db/adapter.js';
import { logger } from '../utils/logger.js';

interface MaintenanceState {
  decayJob: CronJob | null;
  predictionJob: CronJob | null;
  cleanupJob: CronJob | null;
  isRunning: boolean;
}

const state: MaintenanceState = {
  decayJob: null,
  predictionJob: null,
  cleanupJob: null,
  isRunning: false,
};

/**
 * Run memory decay - reduces relevance of old un-reinforced episodes
 */
async function runMemoryDecay(): Promise<void> {
  logger.info('[MemoryMaintenance] Running daily decay...');

  try {
    const changes = await runDecay();
    logger.info({ changes }, '[MemoryMaintenance] Decay complete');
  } catch (err) {
    logger.error({ err }, '[MemoryMaintenance] Decay failed');
  }
}

/**
 * Check pending predictions that are due for verification
 */
async function checkPendingPredictions(): Promise<void> {
  logger.info('[MemoryMaintenance] Checking pending predictions...');

  const db = getDbAdapter();

  try {
    // Get all clients
    const clients = await db.all(`
      SELECT DISTINCT client_id FROM strategic_predictions WHERE status = 'pending'
    `) as { client_id: string }[];

    let totalChecked = 0;
    let totalExpired = 0;

    for (const { client_id } of clients) {
      const pendingPredictions = await getPendingPredictions(client_id);

      for (const pred of pendingPredictions) {
        totalChecked++;

        // Mark as expired if verify_after has passed and no actual data
        // In a full implementation, we'd fetch actual metrics and compare
        // For now, just log that verification is needed
        logger.info({
          clientId: client_id,
          predictionId: pred.id,
          prediction: pred.prediction,
          verifyAfter: pred.verifyAfter,
        }, '[MemoryMaintenance] Prediction needs verification');
      }
    }

    logger.info({ totalChecked, totalExpired }, '[MemoryMaintenance] Prediction check complete');
  } catch (err) {
    logger.error({ err }, '[MemoryMaintenance] Prediction check failed');
  }
}

/**
 * Weekly cleanup of very old data
 */
async function runWeeklyCleanup(): Promise<void> {
  logger.info('[MemoryMaintenance] Running weekly cleanup...');

  const db = getDbAdapter();

  try {
    // Delete very old episodes (90+ days, low relevance)
    const episodesDeleted = await db.run(`
      DELETE FROM agent_episodes
      WHERE created_at < datetime('now', '-90 days')
      AND relevance_score < 0.2
    `);

    // Delete expired recommendations (60+ days old, never acted upon)
    const recsDeleted = await db.run(`
      DELETE FROM strategic_recommendations
      WHERE status = 'pending'
      AND created_at < datetime('now', '-60 days')
    `);

    // Mark very old predictions as expired
    const predsExpired = await db.run(`
      UPDATE strategic_predictions
      SET status = 'expired'
      WHERE status = 'pending'
      AND verify_after < datetime('now', '-30 days')
    `);

    logger.info({
      episodesDeleted: episodesDeleted.changes,
      recsDeleted: recsDeleted.changes,
      predsExpired: predsExpired.changes,
    }, '[MemoryMaintenance] Weekly cleanup complete');
  } catch (err) {
    logger.error({ err }, '[MemoryMaintenance] Weekly cleanup failed');
  }
}

/**
 * Initialize memory maintenance scheduler
 */
export function initializeMemoryMaintenance(): void {
  if (state.isRunning) {
    logger.info('[MemoryMaintenance] Already running');
    return;
  }

  logger.info('[MemoryMaintenance] Initializing...');

  // Daily decay at 3 AM IST
  state.decayJob = new CronJob(
    '0 3 * * *',
    runMemoryDecay,
    null,
    true,
    'Asia/Kolkata'
  );

  // Check predictions every 6 hours
  state.predictionJob = new CronJob(
    '0 */6 * * *',
    checkPendingPredictions,
    null,
    true,
    'Asia/Kolkata'
  );

  // Weekly cleanup on Sunday at 4 AM IST
  state.cleanupJob = new CronJob(
    '0 4 * * 0',
    runWeeklyCleanup,
    null,
    true,
    'Asia/Kolkata'
  );

  state.isRunning = true;

  logger.info('[MemoryMaintenance] Scheduler initialized');
  logger.info('  - Decay: Daily at 3 AM IST');
  logger.info('  - Prediction check: Every 6 hours');
  logger.info('  - Cleanup: Weekly on Sunday at 4 AM IST');
}

/**
 * Stop memory maintenance scheduler
 */
export function stopMemoryMaintenance(): void {
  logger.info('[MemoryMaintenance] Stopping...');

  if (state.decayJob) {
    state.decayJob.stop();
    state.decayJob = null;
  }

  if (state.predictionJob) {
    state.predictionJob.stop();
    state.predictionJob = null;
  }

  if (state.cleanupJob) {
    state.cleanupJob.stop();
    state.cleanupJob = null;
  }

  state.isRunning = false;
  logger.info('[MemoryMaintenance] Stopped');
}

/**
 * Run all maintenance tasks immediately (for testing)
 */
export async function runMaintenanceNow(): Promise<{
  decay: boolean;
  predictions: boolean;
  cleanup: boolean;
}> {
  const results = { decay: false, predictions: false, cleanup: false };

  try {
    await runMemoryDecay();
    results.decay = true;
  } catch { /* logged in function */ }

  try {
    await checkPendingPredictions();
    results.predictions = true;
  } catch { /* logged in function */ }

  try {
    await runWeeklyCleanup();
    results.cleanup = true;
  } catch { /* logged in function */ }

  return results;
}

/**
 * Get maintenance status
 */
export function getMaintenanceStatus(): {
  isRunning: boolean;
  jobs: {
    decay: { active: boolean; nextRun: string | null };
    predictions: { active: boolean; nextRun: string | null };
    cleanup: { active: boolean; nextRun: string | null };
  };
} {
  return {
    isRunning: state.isRunning,
    jobs: {
      decay: {
        active: state.decayJob !== null,
        nextRun: state.decayJob?.nextDate()?.toISO() ?? null,
      },
      predictions: {
        active: state.predictionJob !== null,
        nextRun: state.predictionJob?.nextDate()?.toISO() ?? null,
      },
      cleanup: {
        active: state.cleanupJob !== null,
        nextRun: state.cleanupJob?.nextDate()?.toISO() ?? null,
      },
    },
  };
}
