import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db adapter and logger before importing the poller.
const runs: Array<{ sql: string; params: unknown[] }> = [];
vi.mock('../../db/adapter.js', () => ({
  getDbAdapter: () => ({
    run: async (sql: string, params: unknown[]) => { runs.push({ sql, params }); return { changes: 1, lastInsertRowid: null }; },
    all: async () => [],
  }),
}));
const warns: string[] = []; const errors: string[] = [];
vi.mock('../../utils/logger.js', () => ({
  logger: { warn: (_: unknown, m: string) => warns.push(m), error: (_: unknown, m: string) => errors.push(m), info: () => {} },
}));

import { pollVideoJob, SOFT_WARN_MS } from '../video-job-poller.js';

beforeEach(() => { runs.length = 0; warns.length = 0; errors.length = 0; });

describe('pollVideoJob', () => {
  it('warns once past the soft deadline, then finishes on complete', async () => {
    let t = 0;
    const statuses = ['running', 'running', 'complete'];
    let i = 0;
    const getJob = vi.fn(async () => {
      // advance the clock past the soft warn on the 2nd poll
      if (i === 1) t = SOFT_WARN_MS + 1;
      const status = statuses[Math.min(i, statuses.length - 1)];
      i++;
      return status === 'complete'
        ? { status, video: { url: '/creative/assets/j/video.mp4' }, qa: { verdict: 'pass' }, cost_usd: 3.67 }
        : { status };
    });
    await pollVideoJob({
      generationId: 'g1', aiJobId: 'j', userId: 'u1', videoOutputId: 'o1',
      productName: 'Widget', accountId: null,
      deps: { now: () => t, sleep: async () => {}, getJob: getJob as never },
    });
    expect(warns.filter(w => w.includes('past 20m')).length).toBe(1);
    // exactly one alert row written, type video_ready
    const alert = runs.find(r => r.sql.includes('autopilot_alerts'));
    expect(alert).toBeTruthy();
    expect(alert!.params).toContain('video_ready');
  });

  it('writes a warning alert on failed', async () => {
    const getJob = vi.fn(async () => ({ status: 'failed', error: 'fal 402' }));
    await pollVideoJob({ generationId: 'g', aiJobId: 'j', userId: 'u', videoOutputId: 'o',
      productName: 'X', accountId: null, deps: { now: () => 0, sleep: async () => {}, getJob: getJob as never } });
    const a = runs.find(r => r.sql.includes('autopilot_alerts'));
    expect(a!.params).toContain('video_failed');
    expect(a!.params).toContain('warning');
  });

  it('detaches at the 90m ceiling WITHOUT marking failed', async () => {
    let t = 0;
    const getJob = vi.fn(async () => { t += 100 * 60_000; return { status: 'running' }; });
    await pollVideoJob({ generationId: 'g', aiJobId: 'j', userId: 'u', videoOutputId: 'o',
      productName: 'X', accountId: null, deps: { now: () => t, sleep: async () => {}, getJob: getJob as never } });
    expect(errors.some(e => e.includes('90m'))).toBe(true);
    // no failed status write
    expect(runs.some(r => r.sql.includes("status = 'failed'"))).toBe(false);
  });
});
