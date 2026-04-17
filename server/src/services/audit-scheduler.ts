/**
 * Audit Scheduler - Cron-based scheduling for automated audits
 */

import { CronJob } from 'cron';
import Database from 'better-sqlite3';
import { runAudit } from '../audit/index.js';

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

function getDb(): Database.Database {
  return new Database('./data/cosmisk.db');
}

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
  const db = getDb();

  console.log(`\n⏰ Running scheduled audit for ${schedule.brandName}`);
  console.log(`   Schedule ID: ${schedule.id}`);
  console.log(`   Frequency: ${schedule.frequency}`);

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

    db.prepare(`
      UPDATE scheduled_audits
      SET last_run_at = datetime('now'),
          next_run_at = ?,
          run_count = run_count + 1,
          last_error = NULL
      WHERE id = ?
    `).run(nextRunAt, schedule.id);

    console.log(`   ✅ Scheduled audit completed successfully`);
    console.log(`   Next run: ${nextRunAt}`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    db.prepare(`
      UPDATE scheduled_audits
      SET last_run_at = datetime('now'),
          last_error = ?,
          error_count = error_count + 1
      WHERE id = ?
    `).run(errorMessage, schedule.id);

    console.error(`   ❌ Scheduled audit failed: ${errorMessage}`);
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
export function initializeScheduler(): void {
  if (state.isRunning) {
    console.log('Scheduler already running');
    return;
  }

  const db = getDb();

  // Ensure table exists
  db.exec(`
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
  const schedules = db.prepare(`
    SELECT * FROM scheduled_audits WHERE enabled = 1
  `).all() as any[];

  console.log(`\n📅 Initializing audit scheduler...`);
  console.log(`   Found ${schedules.length} active schedules`);

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

    console.log(`   ✓ ${schedule.brandName}: ${schedule.frequency} (next: ${schedule.nextRunAt || 'calculating...'})`);
  }

  state.isRunning = true;
  console.log(`   Scheduler initialized`);
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
  console.log('Stopping audit scheduler...');

  for (const [id, job] of state.jobs) {
    job.stop();
    console.log(`   Stopped job: ${id}`);
  }

  state.jobs.clear();
  state.isRunning = false;
  console.log('Scheduler stopped');
}

/**
 * Create a new scheduled audit
 */
export function createScheduledAudit(options: {
  brandId: string;
  brandName: string;
  frequency: ScheduledAudit['frequency'];
  datePreset?: ScheduledAudit['datePreset'];
}): ScheduledAudit {
  const db = getDb();

  const id = `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const cronExpression = frequencyToCron(options.frequency);
  const nextRunAt = getNextRunTime(cronExpression).toISOString();
  const datePreset = options.datePreset || 'last_30d';

  db.prepare(`
    INSERT INTO scheduled_audits (id, brand_id, brand_name, frequency, cron_expression, date_preset, next_run_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, options.brandId, options.brandName, options.frequency, cronExpression, datePreset, nextRunAt);

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

  console.log(`📅 Created scheduled audit: ${options.brandName} (${options.frequency})`);
  return schedule;
}

/**
 * Update a scheduled audit
 */
export function updateScheduledAudit(
  scheduleId: string,
  updates: Partial<Pick<ScheduledAudit, 'frequency' | 'datePreset' | 'enabled'>>
): ScheduledAudit | null {
  const db = getDb();

  const existing = db.prepare('SELECT * FROM scheduled_audits WHERE id = ?').get(scheduleId) as any;
  if (!existing) return null;

  const newFrequency = updates.frequency || existing.frequency;
  const newCronExpression = updates.frequency ? frequencyToCron(newFrequency) : existing.cron_expression;
  const newDatePreset = updates.datePreset || existing.date_preset;
  const newEnabled = updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : existing.enabled;
  const newNextRunAt = updates.frequency ? getNextRunTime(newCronExpression).toISOString() : existing.next_run_at;

  db.prepare(`
    UPDATE scheduled_audits
    SET frequency = ?,
        cron_expression = ?,
        date_preset = ?,
        enabled = ?,
        next_run_at = ?
    WHERE id = ?
  `).run(newFrequency, newCronExpression, newDatePreset, newEnabled, newNextRunAt, scheduleId);

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
export function deleteScheduledAudit(scheduleId: string): boolean {
  const db = getDb();

  const result = db.prepare('DELETE FROM scheduled_audits WHERE id = ?').run(scheduleId);

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
export function getScheduledAudit(scheduleId: string): ScheduledAudit | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM scheduled_audits WHERE id = ?').get(scheduleId) as any;

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
export function listScheduledAudits(brandId?: string): ScheduledAudit[] {
  const db = getDb();

  let rows: any[];
  if (brandId) {
    rows = db.prepare('SELECT * FROM scheduled_audits WHERE brand_id = ? ORDER BY created_at DESC').all(brandId);
  } else {
    rows = db.prepare('SELECT * FROM scheduled_audits ORDER BY created_at DESC').all();
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
  const schedule = getScheduledAudit(scheduleId);
  if (!schedule) return false;

  await runScheduledAudit(schedule);
  return true;
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): {
  isRunning: boolean;
  activeJobs: number;
  schedules: Array<{ id: string; brandName: string; nextRun: string | null }>;
} {
  const schedules = listScheduledAudits().filter(s => s.enabled);

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
