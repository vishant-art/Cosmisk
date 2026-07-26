import { randomUUID } from 'node:crypto';
import { getDbAdapter } from '../db/adapter.js';
import { logger } from '../utils/logger.js';
import { getCreativeJob } from './creative-gen-client.js';

export const POLL_INTERVAL_MS = 15_000;
export const SOFT_WARN_MS = 20 * 60_000;
export const HARD_CEIL_MS = 90 * 60_000;

export interface PollerDeps {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  getJob?: typeof getCreativeJob;
}
interface PollArgs {
  generationId: string; aiJobId: string; userId: string;
  videoOutputId: string; productName: string; accountId: string | null;
  deps?: PollerDeps;
}

// /creative/assets/<job>/<sub> -> the apps/api proxy the browser can read.
const proxy = (jobId: string, u: string) =>
  `/api/creative-studio/asset/${jobId}/${u.replace(/^\/creative\/assets\/[^/]+\//, '')}`;

async function alert(userId: string, accountId: string | null, type: string, title: string, content: string, severity: string) {
  await getDbAdapter().run(
    `INSERT INTO autopilot_alerts (id, user_id, account_id, type, title, content, severity)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), userId, accountId, type, title, content, severity],
  ).catch(() => { /* notification is best-effort; never throw out of the poller */ });
}

export async function pollVideoJob(args: PollArgs): Promise<void> {
  const now = args.deps?.now ?? Date.now;
  const sleep = args.deps?.sleep ?? ((ms: number) => new Promise(r => setTimeout(r, ms)));
  const getJob = args.deps?.getJob ?? getCreativeJob;
  const db = getDbAdapter();
  const start = now();
  let warned = false;

  for (;;) {
    // Elapsed checks run BEFORE the poll so the error path's `continue` can't skip them —
    // otherwise an unreachable ai-layer loops every 15s forever, and recoverVideoJobs()
    // re-creates one such immortal timer per stuck row on every restart.
    const elapsed = now() - start;
    if (elapsed > SOFT_WARN_MS && !warned) {
      warned = true;
      logger.warn({ aiJobId: args.aiJobId, elapsedMs: elapsed }, '[video-poller] job still running past 20m');
    }
    if (elapsed > HARD_CEIL_MS) {
      // Stop THIS timer only. Do NOT mark the generation failed — the ai-layer persists the
      // render to Neon regardless, so boot-recovery / a manual refresh still surfaces it.
      logger.error({ aiJobId: args.aiJobId, elapsedMs: elapsed }, '[video-poller] exceeded 90m ceiling, detaching poller (job may still finish server-side)');
      return;
    }

    let job: Awaited<ReturnType<typeof getCreativeJob>>;
    try {
      job = await getJob(args.aiJobId);
    } catch (err: unknown) {
      logger.warn({ err, aiJobId: args.aiJobId }, '[video-poller] poll error, will retry');
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    if (job.status === 'complete') {
      const url = job.video ? proxy(args.aiJobId, job.video.url) : null;
      await db.run(
        `UPDATE studio_outputs SET status = 'completed', output_json = ?, asset_url = ?, cost_cents = ?, updated_at = ? WHERE id = ?`,
        [JSON.stringify({ video_url: url, qa: job.qa ?? null, status: 'completed' }), url,
         Math.round((job.cost_usd ?? 0) * 100), new Date().toISOString(), args.videoOutputId],
      ).catch(() => {});
      await alert(args.userId, args.accountId, 'video_ready', 'Your video is ready',
        `Your UGC video for "${args.productName}" finished rendering.`, 'info');
      return;
    }
    if (job.status === 'failed') {
      await db.run(
        `UPDATE studio_outputs SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?`,
        [job.error ?? 'render failed', new Date().toISOString(), args.videoOutputId],
      ).catch(() => {});
      await alert(args.userId, args.accountId, 'video_failed', 'Video render failed',
        `Your UGC video for "${args.productName}" could not finish: ${job.error ?? 'unknown error'}.`, 'warning');
      return;
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

export async function recoverVideoJobs(_deps?: PollerDeps): Promise<void> {
  const db = getDbAdapter();
  // studio_outputs.format = 'video' still generating, with a live ai_job_id on the parent.
  const rows = await db.all<{
    output_id: string; generation_id: string; ai_job_id: string; user_id: string;
    meta_account_id: string | null; brief_json: string;
  }>(`SELECT o.id AS output_id, g.id AS generation_id, g.ai_job_id, g.user_id,
             g.meta_account_id, g.brief_json
        FROM studio_outputs o JOIN studio_generations g ON g.id = o.generation_id
       WHERE o.format = 'video' AND o.status = 'generating' AND g.ai_job_id IS NOT NULL`).catch(() => []);
  for (const r of rows) {
    const productName = (() => { try { return JSON.parse(r.brief_json)?.product_name ?? 'your product'; } catch { return 'your product'; } })();
    logger.info({ aiJobId: r.ai_job_id }, '[video-poller] re-attaching poller after restart');
    void pollVideoJob({
      generationId: r.generation_id, aiJobId: r.ai_job_id, userId: r.user_id,
      videoOutputId: r.output_id, productName, accountId: r.meta_account_id,
    });
  }
}
