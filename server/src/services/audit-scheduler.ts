/**
 * Audit Scheduler - Cron-based scheduling for automated audits
 */

import { CronJob } from 'cron';
import { getDbAdapter } from '../db/adapter.js';
import { runAudit } from '../audit/index.js';
import { logger } from '../utils/logger.js';

interface ScheduledAudit {
  id: string;
  brandId: string;
  brandName: string;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  cronExpression: string;
  datePreset: 'last_7d' | 'last_14d' | 'last_30d';
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}

interface SchedulerState {
  jobs: Map<string, CronJob>;
  isRunning: boolean;
}

const state: SchedulerState = {
  jobs: new Map(),
  isRunning: false,
};

/**
 * Convert frequency to cron expression
 */
function frequencyToCron(frequency: ScheduledAudit['frequency']): string {
  switch (frequency) {
    case 'daily':
      return '0 6 * * *'; // 6 AM daily
    case 'weekly':
      return '0 6 * * 1'; // 6 AM every Monday
    case 'biweekly':
      return '0 6 1,15 * *'; // 6 AM on 1st and 15th
    case 'monthly':
      return '0 6 1 * *'; // 6 AM on 1st of month
    default:
      return '0 6 * * 1'; // Default to weekly
  }
}

/**
 * Calculate next run time from cron expression
 */
function getNextRunTime(cronExpression: string): Date {
  const job = new CronJob(cronExpression, () => {});
  return job.nextDate().toJSDate();
}

/**
 * Run a scheduled audit
 */
async function runScheduledAudit(schedule: ScheduledAudit): Promise<void> {
  logger.info({ brandName: schedule.brandName }, '\n⏰ Running scheduled audit for');
  logger.info({ scheduleId: schedule.id }, '   Schedule ID');
  logger.info({ frequency: schedule.frequency }, '   Frequency');

  try {
    // Run the audit
    await runAudit({
      brandId: schedule.brandId,
      datePreset: schedule.datePreset,
      outputFormat: 'both',
      saveToDisk: true,
    });

    // Update last run time and next run time
    const nextRunAt = getNextRunTime(schedule.cronExpression).toISOString();

    await getDbAdapter().run(`
      UPDATE scheduled_audits
      SET last_run_at = datetime('now'),
          next_run_at = ?,
          run_count = run_count + 1,
          last_error = NULL
      WHERE id = ?
    `, [nextRunAt, schedule.id]);

    logger.info('   ✅ Scheduled audit completed successfully');
    logger.info({ nextRunAt }, '   Next run');

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await getDbAdapter().run(`
      UPDATE scheduled_audits
      SET last_run_at = datetime('now'),
          last_error = ?,
          error_count = error_count + 1
      WHERE id = ?
    `, [errorMessage, schedule.id]);

    logger.error({ errorMessage }, '   ❌ Scheduled audit failed');
  }
}

/**
 * Create a cron job for a schedule
 */
function createJob(schedule: ScheduledAudit): CronJob {
  return new CronJob(
    schedule.cronExpression,
    () => runScheduledAudit(schedule),
    null,
    false,
    'Asia/Kolkata'
  );
}

/**
 * Initialize the scheduler with all active schedules
 */
export async function initializeScheduler(): Promise<void> {
  if (state.isRunning) {
    logger.info('Scheduler already running');
    return;
  }

  const db = getDbAdapter();

  // Ensure table exists
  await db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_audits (
      id TEXT PRIMARY KEY,
      brand_id TEXT NOT NULL,
      brand_name TEXT NOT NULL,
      frequency TEXT NOT NULL CHECK(frequency IN ('daily', 'weekly', 'biweekly', 'monthly')),
      cron_expression TEXT NOT NULL,
      date_preset TEXT NOT NULL DEFAULT 'last_30d',
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at TEXT,
      next_run_at TEXT,
      run_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (brand_id) REFERENCES brands(id)
    )
  `);

  // Load active schedules
  const schedules = await db.all<any>(`
    SELECT * FROM scheduled_audits WHERE enabled = 1
  `);

  logger.info('\n📅 Initializing audit scheduler...');
  logger.info({ count: schedules.length }, '   Found active schedules');

  for (const row of schedules) {
    const schedule: ScheduledAudit = {
      id: row.id,
      brandId: row.brand_id,
      brandName: row.brand_name,
      frequency: row.frequency,
      cronExpression: row.cron_expression,
      datePreset: row.date_preset,
      enabled: row.enabled === 1,
      lastRunAt: row.last_run_at,
      nextRunAt: row.next_run_at,
      createdAt: row.created_at,
    };

    const job = createJob(schedule);
    job.start();
    state.jobs.set(schedule.id, job);

    logger.info({ brandName: schedule.brandName, frequency: schedule.frequency, next: schedule.nextRunAt || 'calculating...' }, '   ✓ schedule registered');
  }

  state.isRunning = true;
  logger.info('   Scheduler initialized');
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
  logger.info('Stopping audit scheduler...');

  for (const [id, job] of state.jobs) {
    job.stop();
    logger.info({ id }, '   Stopped job');
  }

  state.jobs.clear();
  state.isRunning = false;
  logger.info('Scheduler stopped');
}

/**
 * Create a new scheduled audit
 */
export async function createScheduledAudit(options: {
  brandId: string;
  brandName: string;
  frequency: ScheduledAudit['frequency'];
  datePreset?: ScheduledAudit['datePreset'];
}): Promise<ScheduledAudit> {
  const id = `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const cronExpression = frequencyToCron(options.frequency);
  const nextRunAt = getNextRunTime(cronExpression).toISOString();
  const datePreset = options.datePreset || 'last_30d';

  await getDbAdapter().run(`
    INSERT INTO scheduled_audits (id, brand_id, brand_name, frequency, cron_expression, date_preset, next_run_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [id, options.brandId, options.brandName, options.frequency, cronExpression, datePreset, nextRunAt]);

  const schedule: ScheduledAudit = {
    id,
    brandId: options.brandId,
    brandName: options.brandName,
    frequency: options.frequency,
    cronExpression,
    datePreset,
    enabled: true,
    lastRunAt: null,
    nextRunAt,
    createdAt: new Date().toISOString(),
  };

  // Create and start job if scheduler is running
  if (state.isRunning) {
    const job = createJob(schedule);
    job.start();
    state.jobs.set(id, job);
  }

  logger.info({ brandName: options.brandName, frequency: options.frequency }, '📅 Created scheduled audit');
  return schedule;
}

/**
 * Update a scheduled audit
 */
export async function updateScheduledAudit(
  scheduleId: string,
  updates: Partial<Pick<ScheduledAudit, 'frequency' | 'datePreset' | 'enabled'>>
): Promise<ScheduledAudit | null> {
  const existing = await getDbAdapter().get<any>('SELECT * FROM scheduled_audits WHERE id = ?', [scheduleId]);
  if (!existing) return null;

  const newFrequency = updates.frequency || existing.frequency;
  const newCronExpression = updates.frequency ? frequencyToCron(newFrequency) : existing.cron_expression;
  const newDatePreset = updates.datePreset || existing.date_preset;
  const newEnabled = updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : existing.enabled;
  const newNextRunAt = updates.frequency ? getNextRunTime(newCronExpression).toISOString() : existing.next_run_at;

  await getDbAdapter().run(`
    UPDATE scheduled_audits
    SET frequency = ?,
        cron_expression = ?,
        date_preset = ?,
        enabled = ?,
        next_run_at = ?
    WHERE id = ?
  `, [newFrequency, newCronExpression, newDatePreset, newEnabled, newNextRunAt, scheduleId]);

  // Update running job
  if (state.isRunning) {
    const existingJob = state.jobs.get(scheduleId);
    if (existingJob) {
      existingJob.stop();
      state.jobs.delete(scheduleId);
    }

    if (newEnabled === 1) {
      const schedule: ScheduledAudit = {
        id: scheduleId,
        brandId: existing.brand_id,
        brandName: existing.brand_name,
        frequency: newFrequency,
        cronExpression: newCronExpression,
        datePreset: newDatePreset,
        enabled: true,
        lastRunAt: existing.last_run_at,
        nextRunAt: newNextRunAt,
        createdAt: existing.created_at,
      };

      const job = createJob(schedule);
      job.start();
      state.jobs.set(scheduleId, job);
    }
  }

  return getScheduledAudit(scheduleId);
}

/**
 * Delete a scheduled audit
 */
export async function deleteScheduledAudit(scheduleId: string): Promise<boolean> {
  const result = await getDbAdapter().run('DELETE FROM scheduled_audits WHERE id = ?', [scheduleId]);

  // Stop the job
  const job = state.jobs.get(scheduleId);
  if (job) {
    job.stop();
    state.jobs.delete(scheduleId);
  }

  return result.changes > 0;
}

/**
 * Get a scheduled audit by ID
 */
export async function getScheduledAudit(scheduleId: string): Promise<ScheduledAudit | null> {
  const row = await getDbAdapter().get<any>('SELECT * FROM scheduled_audits WHERE id = ?', [scheduleId]);

  if (!row) return null;

  return {
    id: row.id,
    brandId: row.brand_id,
    brandName: row.brand_name,
    frequency: row.frequency,
    cronExpression: row.cron_expression,
    datePreset: row.date_preset,
    enabled: row.enabled === 1,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    createdAt: row.created_at,
  };
}

/**
 * List all scheduled audits
 */
export async function listScheduledAudits(brandId?: string): Promise<ScheduledAudit[]> {
  const db = getDbAdapter();

  let rows: any[];
  if (brandId) {
    rows = await db.all<any>('SELECT * FROM scheduled_audits WHERE brand_id = ? ORDER BY created_at DESC', [brandId]);
  } else {
    rows = await db.all<any>('SELECT * FROM scheduled_audits ORDER BY created_at DESC');
  }

  return rows.map(row => ({
    id: row.id,
    brandId: row.brand_id,
    brandName: row.brand_name,
    frequency: row.frequency,
    cronExpression: row.cron_expression,
    datePreset: row.date_preset,
    enabled: row.enabled === 1,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    createdAt: row.created_at,
  }));
}

/**
 * Trigger an immediate run of a scheduled audit
 */
export async function triggerScheduledAudit(scheduleId: string): Promise<boolean> {
  const schedule = await getScheduledAudit(scheduleId);
  if (!schedule) return false;

  await runScheduledAudit(schedule);
  return true;
}

/**
 * Get scheduler status
 */
export async function getSchedulerStatus(): Promise<{
  isRunning: boolean;
  activeJobs: number;
  schedules: Array<{ id: string; brandName: string; nextRun: string | null }>;
}> {
  const schedules = (await listScheduledAudits()).filter(s => s.enabled);

  return {
    isRunning: state.isRunning,
    activeJobs: state.jobs.size,
    schedules: schedules.map(s => ({
      id: s.id,
      brandName: s.brandName,
      nextRun: s.nextRunAt,
    })),
  };
}
