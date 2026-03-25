import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index.js';
import { decryptToken } from '../services/token-crypto.js';
import { MetaApiService } from '../services/meta-api.js';
import { parseInsightMetrics } from '../services/insights-parser.js';
import { round, fmt, setCurrency } from '../services/format-helpers.js';
import { assessConfidence, computeTrend } from '../services/trend-analyzer.js';
import type { MetaTokenRow, SprintRow, JobRow, AssetRow, CostLedgerRow, CountRow } from '../types/index.js';
import { generateSprintPlan, generateScript, generateScriptsForJobs } from '../services/sprint-planner.js';
import { scorePlanItems, optimizeCounts } from '../services/plan-scorer.js';
import { startSprintGeneration, isSprintActive, stopSprintGeneration } from '../services/job-queue.js';
import { config } from '../config.js';
import { safeFetch, safeJson } from '../utils/safe-fetch.js';
import { checkLimit, incrementUsage } from './billing.js';
import { searchAdLibrary } from './competitor-spy.js';
import { analyzeTopAdVisuals, buildVisualSummary, selectAdsForAnalysis } from '../services/visual-analyzer.js';
import type { VideoDNA } from '../services/creative-patterns.js';
import { logger } from '../utils/logger.js';
import { internalError } from '../utils/error-response.js';
import { safeJsonParse } from '../utils/safe-json.js';

/* ------------------------------------------------------------------ */
/*  Local query-result interfaces (only fields actually accessed)      */
/* ------------------------------------------------------------------ */

/** Progress stats for a sprint's jobs */
interface SprintProgressRow {
  total: number;
  completed: number;
  failed: number;
  in_progress: number;
  pending: number;
}

/** Cost aggregation by provider */
interface CostByProviderRow {
  api_provider: string;
  total_cents: number;
  operations: number;
}

/** Cost aggregation by sprint */
interface CostBySprintRow {
  sprint_id: string;
  total_cents: number;
  operations: number;
}

/** Single sum of cost_cents */
interface CostTotalRow {
  total_cents: number | null;
}

/** Monthly / all-time usage aggregation */
interface UsageAggRow {
  generations: number;
  cost_cents: number;
}

/** Format performance aggregation */
interface FormatPerformanceRow {
  format: string;
  total_assets: number;
  tracked_assets: number;
  avg_predicted_score: number | null;
}

/** Row containing only actual_metrics JSON string */
interface ActualMetricsRow {
  actual_metrics: string;
}

/** Sprint trend data for analytics */
interface SprintTrendRow {
  id: string;
  name: string;
  status: string;
  total_creatives: number;
  completed_creatives: number;
  estimated_cost_cents: number;
  actual_cost_cents: number;
  created_at: string;
}

/** Asset with predicted score and metrics for prediction accuracy */
interface PredictionRow {
  predicted_score: number | null;
  actual_metrics: string;
}

/** Top DNA row with tags, metrics, and score */
interface TopDnaRow {
  dna_tags: string;
  actual_metrics: string;
  predicted_score: number | null;
}

/** Shape of a Meta API error response body */
interface MetaErrorBody {
  error?: { message?: string };
}

function getUserMetaToken(userId: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(userId) as MetaTokenRow | undefined;
  if (!row) return null;
  return decryptToken(row.encrypted_access_token);
}

/* ------------------------------------------------------------------ */
/*  Analyze account — build learn_snapshot from top performers          */
/* ------------------------------------------------------------------ */
interface AnalyzedAd {
  id: string;
  name: string;
  spend: number;
  roas: number;
  ctr: number;
  cpa: number;
  impressions: number;
  conversions: number;
  format: string;
  thumbnail_url: string;
  video_id: string | null;
  days_active: number;
}

async function analyzeAccount(
  meta: MetaApiService,
  accountId: string,
  currency: string,
): Promise<{
  topAds: AnalyzedAd[];
  benchmarks: { avgRoas: number; avgCtr: number; avgCpa: number; avgSpend: number; totalSpend: number };
  formatBreakdown: Record<string, { count: number; avgRoas: number; totalSpend: number }>;
  fatigueSignals: string[];
  visualAnalysis: Record<string, VideoDNA>;
  visualSummary: string;
}> {
  setCurrency(currency);

  // Fetch ads with insights
  const adsResp = await meta.get<any>(`/${accountId}/ads`, {
    fields: `id,name,creative{thumbnail_url,object_type,video_id},insights.date_preset(last_30d){spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas},created_time`,
    limit: '100',
    filtering: JSON.stringify([
      { field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] },
    ]),
  });

  const allAds = adsResp.data || [];
  const analyzedAds: AnalyzedAd[] = [];
  let totalSpend = 0;

  for (const ad of allAds) {
    const insight = ad.insights?.data?.[0];
    if (!insight) continue;
    const m = parseInsightMetrics(insight);
    if (m.spend < 1) continue;

    const daysActive = ad.created_time
      ? Math.max(1, Math.floor((Date.now() - new Date(ad.created_time).getTime()) / 86400000))
      : 30;

    totalSpend += m.spend;
    analyzedAds.push({
      id: ad.id,
      name: ad.name || 'Untitled',
      spend: round(m.spend, 2),
      roas: round(m.roas, 2),
      ctr: round(m.ctr, 2),
      cpa: round(m.cpa, 2),
      impressions: m.impressions,
      conversions: m.conversions,
      format: (ad.creative?.object_type || 'IMAGE').toLowerCase() === 'video' ? 'video' : 'image',
      thumbnail_url: ad.creative?.thumbnail_url || '',
      video_id: ad.creative?.video_id || null,
      days_active: daysActive,
    });
  }

  // Sort by ROAS descending
  analyzedAds.sort((a, b) => b.roas - a.roas);

  // Compute benchmarks
  const withSpend = analyzedAds.filter(a => a.spend > 0);
  const avgRoas = withSpend.length ? withSpend.reduce((s, a) => s + a.roas, 0) / withSpend.length : 0;
  const avgCtr = withSpend.length ? withSpend.reduce((s, a) => s + a.ctr, 0) / withSpend.length : 0;
  const avgCpa = withSpend.length ? withSpend.reduce((s, a) => s + a.cpa, 0) / withSpend.length : 0;
  const avgSpend = withSpend.length ? totalSpend / withSpend.length : 0;

  // Format breakdown
  const formatBreakdown: Record<string, { count: number; avgRoas: number; totalSpend: number }> = {};
  for (const ad of analyzedAds) {
    if (!formatBreakdown[ad.format]) {
      formatBreakdown[ad.format] = { count: 0, avgRoas: 0, totalSpend: 0 };
    }
    formatBreakdown[ad.format].count++;
    formatBreakdown[ad.format].totalSpend += ad.spend;
  }
  for (const fmt of Object.keys(formatBreakdown)) {
    const fmtAds = analyzedAds.filter(a => a.format === fmt);
    formatBreakdown[fmt].avgRoas = round(fmtAds.reduce((s, a) => s + a.roas, 0) / fmtAds.length, 2);
  }

  // Fatigue signals
  const fatigueSignals: string[] = [];
  const recentAds = analyzedAds.filter(a => a.days_active < 14);
  if (recentAds.length < 3) {
    fatigueSignals.push(`Only ${recentAds.length} creatives launched in the last 14 days. Creative fatigue likely.`);
  }
  const highSpendDeclining = analyzedAds.filter(a => a.spend > avgSpend * 1.5 && a.roas < avgRoas * 0.7);
  for (const ad of highSpendDeclining.slice(0, 3)) {
    fatigueSignals.push(`"${ad.name}" has high spend (${fmt(ad.spend)}) but below-average ROAS (${ad.roas}x vs ${round(avgRoas, 2)}x avg).`);
  }

  // Visual analysis via Gemini Vision (non-blocking — empty on error/no key)
  // Selects top 5 ads with spend >= $50, ranked by ROAS * log(spend)
  const topForVisual = selectAdsForAnalysis(analyzedAds);
  const visualMap = await analyzeTopAdVisuals(topForVisual, accountId, meta);
  const visualAnalysis: Record<string, VideoDNA> = Object.fromEntries(visualMap);
  const visualSummary = buildVisualSummary(visualMap, topForVisual);

  return {
    topAds: analyzedAds.slice(0, 20),
    benchmarks: {
      avgRoas: round(avgRoas, 2),
      avgCtr: round(avgCtr, 2),
      avgCpa: round(avgCpa, 2),
      avgSpend: round(avgSpend, 2),
      totalSpend: round(totalSpend, 2),
    },
    formatBreakdown,
    fatigueSignals,
    visualAnalysis,
    visualSummary,
  };
}

/* ------------------------------------------------------------------ */
/*  Routes                                                              */
/* ------------------------------------------------------------------ */
export async function creativeEngineRoutes(app: FastifyInstance) {

  /* ---- POST /analyze ---- */
  app.post('/analyze', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { account_id, credential_group, currency = 'INR' } = request.body as {
      account_id?: string; credential_group?: string; currency?: string;
    };

    if (!account_id) {
      return reply.status(400).send({ success: false, error: 'account_id required' });
    }

    try {
      const token = getUserMetaToken(request.user.id);
      if (!token) {
        return reply.status(400).send({ success: false, error: 'Meta account not connected' });
      }
      const meta = new MetaApiService(token);
      const snapshot = await analyzeAccount(meta, account_id, currency);

      return {
        success: true,
        snapshot,
        summary: {
          totalAds: snapshot.topAds.length,
          totalSpend: snapshot.benchmarks.totalSpend,
          avgRoas: snapshot.benchmarks.avgRoas,
          topPerformer: snapshot.topAds[0]?.name || null,
          topPerformerRoas: snapshot.topAds[0]?.roas || 0,
          fatigueSignals: snapshot.fatigueSignals.length,
          formats: Object.keys(snapshot.formatBreakdown),
        },
      };
    } catch (err: any) {
      return internalError(reply, err, 'creative-engine/analyze failed');
    }
  });

  /* ---- POST /plan ---- */
  app.post('/plan', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { snapshot, preferences, sprint_name } = request.body as {
      snapshot?: any; preferences?: any; sprint_name?: string;
    };

    if (!snapshot) {
      return reply.status(400).send({ success: false, error: 'snapshot required (run /analyze first)' });
    }

    try {
      // Fetch competitor ads if competitors are configured
      let competitorContext: { query: string; ads: any[] } | undefined;
      if (preferences?.competitor_query) {
        try {
          const compAds = await searchAdLibrary(preferences.competitor_query, preferences?.country || 'IN', 15);
          competitorContext = {
            query: preferences.competitor_query,
            ads: compAds.map(a => ({
              page_name: a.page_name,
              body: a.ad_creative_bodies?.[0] || null,
              headline: a.ad_creative_link_titles?.[0] || null,
              running_since: a.ad_delivery_start_time,
              est_spend: a.spend ? `${a.spend.lower_bound}-${a.spend.upper_bound} ${a.currency || ''}` : null,
              platforms: a.publisher_platforms || [],
            })),
          };
        } catch {
          // Competitor fetch failed — proceed without it
        }
      } else {
        // Auto-fetch if user has competitors configured
        const db = getDb();
        const user = db.prepare('SELECT competitors FROM users WHERE id = ?').get(request.user.id) as { competitors?: string } | undefined;
        const competitors = safeJsonParse(user?.competitors, []);
        if (competitors.length > 0) {
          try {
            const compAds = await searchAdLibrary(competitors[0], preferences?.country || 'IN', 10);
            competitorContext = {
              query: competitors[0],
              ads: compAds.map(a => ({
                page_name: a.page_name,
                body: a.ad_creative_bodies?.[0] || null,
                headline: a.ad_creative_link_titles?.[0] || null,
                running_since: a.ad_delivery_start_time,
                est_spend: a.spend ? `${a.spend.lower_bound}-${a.spend.upper_bound} ${a.currency || ''}` : null,
                platforms: a.publisher_platforms || [],
              })),
            };
          } catch {
            // Competitor fetch failed — proceed without it
          }
        }
      }

      // Resolve brand context: prefer request body, fall back to user profile + UGC brief
      let brandName    = preferences?.brand_name    as string | undefined;
      let productName  = preferences?.product_name  as string | undefined;
      let targetAudience = preferences?.target_audience as string | undefined;
      let industry     = preferences?.industry      as string | undefined;

      if (!brandName || !productName || !industry) {
        const db0 = getDb();
        const userProfile = db0.prepare('SELECT brand_name FROM users WHERE id = ?')
          .get(request.user.id) as { brand_name?: string } | undefined;

        if (!brandName && userProfile?.brand_name) brandName = userProfile.brand_name;

        // Pull product/audience/industry from latest UGC project brief if not supplied
        if (!productName || !targetAudience || !industry) {
          const latestProject = db0.prepare(
            `SELECT brief FROM ugc_projects WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`
          ).get(request.user.id) as { brief?: string } | undefined;
          if (latestProject?.brief) {
            try {
              const brief = JSON.parse(latestProject.brief);
              if (!productName)      productName = brief.product_description || brief.product_feature || undefined;
              if (!targetAudience)   targetAudience = brief.target_audience || brief.target_user || undefined;
              if (!industry)         industry = brief.industry || (brief.additional_notes?.match(/Industry:\s*(.+)/)?.[1]) || undefined;
            } catch { /* brief not valid JSON — skip */ }
          }
        }
      }

      // Claude-powered plan generation — analyzes the data and recommends formats
      const rawPlan = await generateSprintPlan(snapshot, {
        budget_cents: preferences?.budget_cents,
        currency: preferences?.currency || 'INR',
        target_formats: preferences?.target_formats,
        total_creatives: preferences?.total_creatives,
        competitor_context: competitorContext,
        visual_summary: snapshot.visualSummary,
        brand_name: brandName,
        product_name: productName,
        target_audience: targetAudience,
        industry,
      });

      // --- Plan-stage scoring (zero Claude calls) ---
      // Fetch active ads for diversity check
      const db = getDb();
      const activeAssets = db.prepare(
        `SELECT format, dna_tags, published_at FROM creative_assets
         WHERE user_id = ? AND status IN ('published', 'tracking')
         ORDER BY published_at DESC LIMIT 50`
      ).all(request.user.id) as { format: string; dna_tags: string | null; published_at: string | null }[];

      const activeAds = activeAssets.map(a => ({
        format: a.format,
        days_active: a.published_at
          ? Math.max(1, Math.floor((Date.now() - new Date(a.published_at).getTime()) / 86400000))
          : 30,
        dna_tags: safeJsonParse(a.dna_tags, undefined) as { hook: string[]; visual: string[]; audio: string[] } | undefined,
      }));

      const platform = preferences?.platform || 'meta';
      const threshold = preferences?.score_threshold || 70;

      const scoringResult = scorePlanItems(
        rawPlan.items,
        snapshot,
        platform,
        activeAds,
        threshold,
      );

      // Optimize counts for surviving items based on win probability
      const budgetCents = preferences?.budget_cents || 50000;
      const targetCount = preferences?.total_creatives || 30;
      const optimizedItems = optimizeCounts(scoringResult.scored, targetCount, budgetCents);

      const scoringData = {
        removed: scoringResult.removed.map(r => ({
          format: r.format,
          count: r.count,
          winProbability: r.winProbability,
          warnings: r.warnings,
        })),
        summary: scoringResult.summary,
      };

      const plan = {
        items: optimizedItems,
        totalCreatives: optimizedItems.reduce((s, i) => s + i.count, 0),
        totalEstimatedCents: optimizedItems.reduce((s, i) => s + i.estimated_cost_cents, 0),
        scoring: scoringData,
      };

      // Create sprint in DB
      const sprintId = uuidv4();

      db.prepare(`
        INSERT INTO creative_sprints (id, user_id, account_id, name, status, plan, learn_snapshot, total_creatives, estimated_cost_cents, currency)
        VALUES (?, ?, ?, ?, 'planning', ?, ?, ?, ?, ?)
      `).run(
        sprintId,
        request.user.id,
        preferences?.account_id || null,
        sprint_name || `Sprint ${new Date().toLocaleDateString()}`,
        JSON.stringify(plan),
        JSON.stringify(snapshot),
        plan.totalCreatives,
        plan.totalEstimatedCents,
        preferences?.currency || 'INR',
      );

      return {
        success: true,
        sprint_id: sprintId,
        plan,
        scoring: {
          removed: scoringResult.removed.map(r => ({
            format: r.format,
            count: r.count,
            winProbability: r.winProbability,
            warnings: r.warnings,
          })),
          summary: scoringResult.summary,
        },
      };
    } catch (err: any) {
      return internalError(reply, err, 'creative-engine/plan failed');
    }
  });

  /* ---- GET /sprints ---- */
  app.get('/sprints', { preHandler: [app.authenticate] }, async (request) => {
    const db = getDb();
    const sprints = db.prepare(
      'SELECT * FROM creative_sprints WHERE user_id = ? ORDER BY created_at DESC'
    ).all(request.user.id) as SprintRow[];

    return {
      success: true,
      sprints: sprints.map(s => ({
        ...s,
        plan: safeJsonParse(s.plan, null),
      })),
    };
  });

  /* ---- GET /sprint/:id ---- */
  app.get('/sprint/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const sprint = db.prepare(
      'SELECT * FROM creative_sprints WHERE id = ? AND user_id = ?'
    ).get(id, request.user.id) as SprintRow | undefined;

    if (!sprint) {
      return reply.status(404).send({ success: false, error: 'Sprint not found' });
    }

    const jobs = db.prepare(
      'SELECT * FROM creative_jobs WHERE sprint_id = ? ORDER BY priority DESC, created_at ASC'
    ).all(id) as JobRow[];

    const assets = db.prepare(
      'SELECT * FROM creative_assets WHERE sprint_id = ?'
    ).all(id) as AssetRow[];

    return {
      success: true,
      sprint: {
        ...sprint,
        plan: safeJsonParse(sprint.plan, null),
        learn_snapshot: safeJsonParse(sprint.learn_snapshot, null),
      },
      jobs: jobs.map(j => ({
        ...j,
        script: safeJsonParse(j.script, null),
        dna_tags: safeJsonParse(j.dna_tags, null),
      })),
      assets: assets.map(a => ({
        ...a,
        dna_tags: safeJsonParse(a.dna_tags, []),
        actual_metrics: safeJsonParse(a.actual_metrics, {}),
      })),
    };
  });

  /* ---- POST /sprint/:id/approve ---- */
  app.post('/sprint/:id/approve', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const sprint = db.prepare(
      'SELECT * FROM creative_sprints WHERE id = ? AND user_id = ?'
    ).get(id, request.user.id) as SprintRow | undefined;

    if (!sprint) {
      return reply.status(404).send({ success: false, error: 'Sprint not found' });
    }
    if (sprint.status !== 'planning') {
      return reply.status(400).send({ success: false, error: `Sprint is in "${sprint.status}" state, cannot approve` });
    }

    const plan = safeJsonParse<{ items: { format: string; count: number }[] } | null>(sprint.plan, null);
    if (!plan?.items?.length) {
      return reply.status(400).send({ success: false, error: 'Sprint has no plan items' });
    }

    // Create jobs from plan items
    const insertJob = db.prepare(`
      INSERT INTO creative_jobs (id, sprint_id, user_id, format, status, priority, script, api_provider)
      VALUES (?, ?, ?, ?, 'pending', ?, NULL, ?)
    `);

    // Provider detection based on format characteristics
    function detectProvider(format: string): string {
      const videoAvatarFormats = ['ugc_talking_head', 'podcast_clip', 'testimonial_mashup', 'interview', 'green_screen_reaction', 'localization'];
      const videoGenFormats = ['skit', 'before_after', 'unboxing'];
      const productFormats = ['product_demo'];
      const imageFormats = ['static_ad', 'carousel', 'listicle', 'meme_ad'];

      if (videoAvatarFormats.includes(format)) return 'heygen';
      if (videoGenFormats.includes(format)) return 'kling';
      if (productFormats.includes(format)) return 'creatify';
      if (imageFormats.includes(format)) return 'flux';
      // For unknown/custom formats, default to kling (most versatile video gen)
      return 'kling';
    }

    let jobCount = 0;
    for (const item of plan.items) {
      const provider = detectProvider(item.format);
      for (let i = 0; i < item.count; i++) {
        insertJob.run(uuidv4(), id, request.user.id, item.format, item.count - i, provider);
        jobCount++;
      }
    }

    db.prepare(
      "UPDATE creative_sprints SET status = 'approved', total_creatives = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(jobCount, id);

    return { success: true, jobs_created: jobCount };
  });

  /* ---- GET /sprint/:id/progress ---- */
  app.get('/sprint/:id/progress', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const sprint = db.prepare(
      'SELECT * FROM creative_sprints WHERE id = ? AND user_id = ?'
    ).get(id, request.user.id) as SprintRow | undefined;

    if (!sprint) {
      return reply.status(404).send({ success: false, error: 'Sprint not found' });
    }

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status IN ('generating', 'polling') THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM creative_jobs WHERE sprint_id = ?
    `).get(id) as SprintProgressRow;

    return {
      success: true,
      progress: {
        total: stats.total || 0,
        completed: stats.completed || 0,
        failed: stats.failed || 0,
        in_progress: stats.in_progress || 0,
        pending: stats.pending || 0,
        pct: stats.total > 0 ? Math.round(((stats.completed + stats.failed) / stats.total) * 100) : 0,
      },
      status: sprint.status,
    };
  });

  /* ---- GET /sprint/:id/review ---- */
  app.get('/sprint/:id/review', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const sprint = db.prepare(
      'SELECT * FROM creative_sprints WHERE id = ? AND user_id = ?'
    ).get(id, request.user.id) as SprintRow | undefined;

    if (!sprint) {
      return reply.status(404).send({ success: false, error: 'Sprint not found' });
    }

    const completedJobs = db.prepare(
      "SELECT * FROM creative_jobs WHERE sprint_id = ? AND status = 'completed' ORDER BY predicted_score DESC"
    ).all(id) as JobRow[];

    return {
      success: true,
      creatives: completedJobs.map(j => ({
        id: j.id,
        format: j.format,
        output_url: j.output_url,
        output_thumbnail: j.output_thumbnail,
        predicted_score: j.predicted_score,
        dna_tags: safeJsonParse(j.dna_tags, null),
        script: safeJsonParse(j.script, null),
        cost_cents: j.cost_cents,
      })),
    };
  });

  /* ---- POST /asset/:id/approve ---- */
  app.post('/asset/:id/approve', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    // id here is the job_id — create an asset from the completed job
    const job = db.prepare(
      "SELECT * FROM creative_jobs WHERE id = ? AND user_id = ? AND status = 'completed'"
    ).get(id, request.user.id) as JobRow | undefined;

    if (!job) {
      return reply.status(404).send({ success: false, error: 'Completed job not found' });
    }

    const assetId = uuidv4();
    db.prepare(`
      INSERT INTO creative_assets (id, job_id, sprint_id, user_id, format, name, asset_url, thumbnail_url, dna_tags, predicted_score, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')
    `).run(
      assetId, job.id, job.sprint_id, request.user.id, job.format,
      `${job.format}_${job.id.slice(0, 8)}`,
      job.output_url || '',
      job.output_thumbnail || '',
      job.dna_tags || null,
      job.predicted_score || null,
    );

    return { success: true, asset_id: assetId };
  });

  /* ---- POST /asset/:id/reject ---- */
  app.post('/asset/:id/reject', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    // Check if asset already exists
    const asset = db.prepare(
      'SELECT * FROM creative_assets WHERE id = ? AND user_id = ?'
    ).get(id, request.user.id) as AssetRow | undefined;

    if (asset) {
      db.prepare("UPDATE creative_assets SET status = 'rejected' WHERE id = ?").run(id);
      return { success: true, status: 'rejected' };
    }

    return reply.status(404).send({ success: false, error: 'Asset not found' });
  });

  /* ---- POST /sprint/:id/scripts — Generate scripts for all jobs ---- */
  app.post('/sprint/:id/scripts', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { product_name, target_audience, brand_name } = request.body as {
      product_name?: string; target_audience?: string; brand_name?: string;
    };
    const db = getDb();

    const sprint = db.prepare(
      'SELECT * FROM creative_sprints WHERE id = ? AND user_id = ?'
    ).get(id, request.user.id) as SprintRow | undefined;

    if (!sprint) {
      return reply.status(404).send({ success: false, error: 'Sprint not found' });
    }

    const snapshot = JSON.parse(sprint.learn_snapshot || '{"topAds":[],"benchmarks":{"avgRoas":0,"avgCtr":0,"avgCpa":0,"avgSpend":0,"totalSpend":0},"formatBreakdown":{},"fatigueSignals":[]}');

    // Get pending jobs that need scripts
    const pendingJobs = db.prepare(
      "SELECT id, format FROM creative_jobs WHERE sprint_id = ? AND status = 'pending'"
    ).all(id) as { id: string; format: string }[];

    if (pendingJobs.length === 0) {
      return { success: true, scripts_generated: 0, message: 'No pending jobs to generate scripts for' };
    }

    // Generate scripts via Claude (batched)
    const results = await generateScriptsForJobs(pendingJobs, snapshot, {
      productName: product_name,
      targetAudience: target_audience,
      brandName: brand_name,
      currency: sprint.currency,
    });

    // Update jobs with scripts
    const updateStmt = db.prepare(
      "UPDATE creative_jobs SET script = ?, dna_tags = ?, predicted_score = ?, status = 'script_ready' WHERE id = ?"
    );

    let count = 0;
    for (const [jobId, result] of results) {
      updateStmt.run(
        JSON.stringify(result.script),
        JSON.stringify(result.dna_tags),
        result.predicted_score,
        jobId,
      );
      count++;
    }

    return { success: true, scripts_generated: count };
  });

  /* ---- POST /sprint/:id/generate — Start batch generation ---- */
  app.post('/sprint/:id/generate', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const sprint = db.prepare(
      'SELECT * FROM creative_sprints WHERE id = ? AND user_id = ?'
    ).get(id, request.user.id) as SprintRow | undefined;

    if (!sprint) {
      return reply.status(404).send({ success: false, error: 'Sprint not found' });
    }
    if (sprint.status !== 'approved') {
      return reply.status(400).send({ success: false, error: `Sprint must be approved first (current: ${sprint.status})` });
    }

    // Check usage limits
    const jobCount = (db.prepare(
      "SELECT COUNT(*) as c FROM creative_jobs WHERE sprint_id = ?"
    ).get(id) as CountRow).c;

    const { allowed, current, limit } = checkLimit(request.user.id, 'creative_count');
    if (!allowed) {
      return reply.status(429).send({
        success: false,
        error: `Creative generation limit reached (${current}/${limit} this month). Upgrade your plan.`,
        usage: { current, limit },
        upgrade_url: '/app/settings?tab=billing',
      });
    }

    // Check scripts are generated
    const unscripted = (db.prepare(
      "SELECT COUNT(*) as c FROM creative_jobs WHERE sprint_id = ? AND status = 'pending' AND script IS NULL"
    ).get(id) as CountRow).c;

    if (unscripted > 0) {
      return reply.status(400).send({
        success: false,
        error: `${unscripted} jobs still need scripts. Call /scripts first.`,
      });
    }

    // Track usage upfront
    incrementUsage(request.user.id, 'creative_count', jobCount);

    db.prepare(
      "UPDATE creative_sprints SET status = 'generating', updated_at = datetime('now') WHERE id = ?"
    ).run(id);

    // Start the job queue (runs in background, non-blocking)
    startSprintGeneration(id);

    return { success: true, message: 'Generation started. Poll /progress for updates.' };
  });

  /* ---- POST /sprint/:id/publish — Batch publish approved assets to Meta ---- */
  app.post('/sprint/:id/publish', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { account_id, campaign_id, adset_id, page_id, status: publishStatus = 'PAUSED' } = request.body as {
      account_id: string;
      campaign_id?: string;
      adset_id?: string;
      page_id: string;
      status?: 'PAUSED' | 'ACTIVE';
    };

    if (!account_id || !page_id) {
      return reply.status(400).send({ success: false, error: 'account_id and page_id required' });
    }

    const db = getDb();
    const sprint = db.prepare(
      'SELECT * FROM creative_sprints WHERE id = ? AND user_id = ?'
    ).get(id, request.user.id) as SprintRow | undefined;

    if (!sprint) {
      return reply.status(404).send({ success: false, error: 'Sprint not found' });
    }

    const token = getUserMetaToken(request.user.id);
    if (!token) {
      return reply.status(400).send({ success: false, error: 'Meta account not connected' });
    }

    const approvedAssets = db.prepare(
      "SELECT * FROM creative_assets WHERE sprint_id = ? AND status = 'approved'"
    ).all(id) as AssetRow[];

    if (approvedAssets.length === 0) {
      return reply.status(400).send({ success: false, error: 'No approved assets to publish' });
    }

    try {
      let targetCampaignId = campaign_id;
      let targetAdSetId = adset_id;

      // Create campaign if not provided
      if (!targetCampaignId) {
        const campaignResp = await safeFetch(`${config.graphApiBase}/${account_id}/campaigns`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: token,
            name: `${sprint.name} — Creative Engine Sprint`,
            objective: 'OUTCOME_SALES',
            status: publishStatus,
            special_ad_categories: [],
          }),
          service: 'Meta Marketing API',
        });

        if (!campaignResp.ok) {
          const errBody = await safeJson(campaignResp);
          throw new Error((errBody as MetaErrorBody)?.error?.message || 'Failed to create campaign');
        }
        const campaign = await safeJson(campaignResp);
        if (!campaign?.id) throw new Error('Campaign creation returned no ID');
        targetCampaignId = campaign.id;
      }

      // Create ad set if not provided
      if (!targetAdSetId) {
        const adSetResp = await safeFetch(`${config.graphApiBase}/${account_id}/adsets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: token,
            campaign_id: targetCampaignId,
            name: `${sprint.name} — Ad Set`,
            optimization_goal: 'OFFSITE_CONVERSIONS',
            billing_event: 'IMPRESSIONS',
            daily_budget: 5000,
            bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
            targeting: {
              age_min: 18,
              age_max: 65,
              geo_locations: { countries: ['IN'] },
            },
            status: publishStatus,
          }),
          service: 'Meta Marketing API',
        });

        if (!adSetResp.ok) {
          const errBody = await safeJson(adSetResp);
          throw new Error((errBody as MetaErrorBody)?.error?.message || 'Failed to create ad set');
        }
        const adSet = await safeJson(adSetResp);
        if (!adSet?.id) throw new Error('Ad set creation returned no ID');
        targetAdSetId = adSet.id;
      }

      // Publish each approved asset as an ad
      let published = 0;
      let failed = 0;

      for (const asset of approvedAssets) {
        try {
          // Create ad creative
          const isVideo = asset.format.includes('video') || ['ugc_talking_head', 'podcast_clip', 'skit',
            'before_after', 'product_demo', 'testimonial_mashup', 'interview', 'unboxing'].includes(asset.format);

          const creativePayload: any = {
            access_token: token,
            name: `${asset.name} — ${asset.format}`,
            object_story_spec: {
              page_id: page_id,
              ...(isVideo
                ? { video_data: { video_url: asset.asset_url, title: asset.name, call_to_action: { type: 'SHOP_NOW', value: { link: 'https://cosmisk.com' } } } }
                : { link_data: { link: 'https://cosmisk.com', image_url: asset.asset_url, message: asset.name, call_to_action: { type: 'SHOP_NOW' } } }
              ),
            },
          };

          const creativeResp = await safeFetch(`${config.graphApiBase}/${account_id}/adcreatives`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(creativePayload),
            service: 'Meta Marketing API',
          });

          if (!creativeResp.ok) {
            failed++;
            continue;
          }

          const creative = await safeJson(creativeResp);
          if (!creative?.id) { failed++; continue; }

          // Create ad
          const adResp = await safeFetch(`${config.graphApiBase}/${account_id}/ads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              access_token: token,
              adset_id: targetAdSetId,
              creative: { creative_id: creative.id },
              name: `${asset.name}`,
              status: publishStatus,
            }),
            service: 'Meta Marketing API',
          });

          if (adResp.ok) {
            const ad = await safeJson(adResp);
            db.prepare(
              "UPDATE creative_assets SET meta_ad_id = ?, meta_campaign_id = ?, status = 'published', published_at = datetime('now') WHERE id = ?"
            ).run(ad?.id || null, targetCampaignId, asset.id);
            published++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }

      if (published > 0) {
        db.prepare(
          "UPDATE creative_sprints SET status = 'published', updated_at = datetime('now') WHERE id = ?"
        ).run(id);
      }

      return {
        success: true,
        published,
        failed,
        campaign_id: targetCampaignId,
        adset_id: targetAdSetId,
        status: publishStatus,
      };
    } catch (err: any) {
      return internalError(reply, err, 'creative-engine/sprint/:id/publish failed');
    }
  });

  /* ---- POST /sprint/:id/track — Fetch performance metrics for published assets ---- */
  app.post('/sprint/:id/track', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const sprint = db.prepare(
      'SELECT * FROM creative_sprints WHERE id = ? AND user_id = ?'
    ).get(id, request.user.id) as SprintRow | undefined;

    if (!sprint) {
      return reply.status(404).send({ success: false, error: 'Sprint not found' });
    }

    const token = getUserMetaToken(request.user.id);
    if (!token) {
      return reply.status(400).send({ success: false, error: 'Meta account not connected' });
    }

    const publishedAssets = db.prepare(
      "SELECT * FROM creative_assets WHERE sprint_id = ? AND status IN ('published', 'tracking') AND meta_ad_id IS NOT NULL"
    ).all(id) as AssetRow[];

    if (publishedAssets.length === 0) {
      return { success: true, tracked: 0, message: 'No published assets to track' };
    }

    const meta = new MetaApiService(token);
    setCurrency(sprint.currency || 'INR');
    let tracked = 0;

    for (const asset of publishedAssets) {
      try {
        const insightsResp = await meta.get<any>(`/${asset.meta_ad_id}/insights`, {
          fields: 'spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas',
          date_preset: 'last_7d',
        });

        const insight = insightsResp?.data?.[0];
        if (insight) {
          const m = parseInsightMetrics(insight);
          const metrics = {
            spend: round(m.spend, 2),
            roas: round(m.roas, 2),
            ctr: round(m.ctr, 2),
            cpa: round(m.cpa, 2),
            impressions: m.impressions,
            conversions: m.conversions,
          };

          db.prepare(
            "UPDATE creative_assets SET actual_metrics = ?, metrics_fetched_at = datetime('now'), status = 'analyzed' WHERE id = ?"
          ).run(JSON.stringify(metrics), asset.id);
          tracked++;
        }
      } catch (err: any) {
        logger.error({ err: err.message }, `[Track] Error fetching metrics for asset ${asset.id}`);
      }
    }

    return { success: true, tracked, total: publishedAssets.length };
  });

  /* ---- POST /job/:id/retry ---- */
  app.post('/job/:id/retry', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const job = db.prepare(
      "SELECT * FROM creative_jobs WHERE id = ? AND user_id = ? AND status = 'failed'"
    ).get(id, request.user.id) as JobRow | undefined;

    if (!job) {
      return reply.status(404).send({ success: false, error: 'Failed job not found' });
    }

    db.prepare(
      "UPDATE creative_jobs SET status = 'pending', error_message = NULL, retry_count = retry_count + 1 WHERE id = ?"
    ).run(id);

    // If the sprint is in generating state, ensure the queue is running
    const sprint = db.prepare('SELECT id, status FROM creative_sprints WHERE id = ?').get(job.sprint_id) as SprintRow | undefined;
    if (sprint?.status === 'generating' || sprint?.status === 'reviewing') {
      // Re-enter generating state and restart queue
      db.prepare("UPDATE creative_sprints SET status = 'generating', updated_at = datetime('now') WHERE id = ?").run(sprint.id);
      startSprintGeneration(sprint.id);
    }

    return { success: true, message: 'Job queued for retry' };
  });

  /* ---- GET /costs ---- */
  app.get('/costs', { preHandler: [app.authenticate] }, async (request) => {
    const db = getDb();

    const byProvider = db.prepare(`
      SELECT api_provider, SUM(cost_cents) as total_cents, COUNT(*) as operations
      FROM cost_ledger WHERE user_id = ?
      GROUP BY api_provider
    `).all(request.user.id) as CostByProviderRow[];

    const bySprint = db.prepare(`
      SELECT sprint_id, SUM(cost_cents) as total_cents, COUNT(*) as operations
      FROM cost_ledger WHERE user_id = ? AND sprint_id IS NOT NULL
      GROUP BY sprint_id
    `).all(request.user.id) as CostBySprintRow[];

    const total = db.prepare(
      'SELECT SUM(cost_cents) as total_cents FROM cost_ledger WHERE user_id = ?'
    ).get(request.user.id) as CostTotalRow | undefined;

    return {
      success: true,
      costs: {
        total_cents: total?.total_cents || 0,
        by_provider: byProvider,
        by_sprint: bySprint,
      },
    };
  });

  /* ---- GET /usage ---- */
  app.get('/usage', { preHandler: [app.authenticate] }, async (request) => {
    const db = getDb();

    // This month's usage
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthStr = monthStart.toISOString().replace('T', ' ').split('.')[0];

    const monthUsage = db.prepare(`
      SELECT
        COUNT(*) as generations,
        COALESCE(SUM(cost_cents), 0) as cost_cents
      FROM cost_ledger WHERE user_id = ? AND created_at >= ?
    `).get(request.user.id, monthStr) as UsageAggRow | undefined;

    const totalUsage = db.prepare(`
      SELECT
        COUNT(*) as generations,
        COALESCE(SUM(cost_cents), 0) as cost_cents
      FROM cost_ledger WHERE user_id = ?
    `).get(request.user.id) as UsageAggRow | undefined;

    const sprintCount = (db.prepare(
      'SELECT COUNT(*) as c FROM creative_sprints WHERE user_id = ?'
    ).get(request.user.id) as CountRow).c;

    const activeSprints = (db.prepare(
      "SELECT COUNT(*) as c FROM creative_sprints WHERE user_id = ? AND status IN ('generating', 'approved')"
    ).get(request.user.id) as CountRow).c;

    // Provider config status (which providers are ready)
    const providers: Record<string, boolean> = {
      flux: !!config.fluxApiKey,
      heygen: !!config.heygenApiKey,
      kling: !!config.klingApiKey,
      creatify: !!config.creatifyApiKey,
      elevenlabs: !!config.elevenLabsApiKey,
      nanobanana: !!config.nanoBananaApiKey,
      veo3: !!config.n8nVideoWebhook,
    };

    // Plan limits
    const { current, limit } = checkLimit(request.user.id, 'creative_count');

    return {
      success: true,
      usage: {
        this_month: {
          generations: monthUsage?.generations || 0,
          cost_cents: monthUsage?.cost_cents || 0,
          creatives_used: current,
          creatives_limit: limit,
        },
        all_time: {
          generations: totalUsage?.generations || 0,
          cost_cents: totalUsage?.cost_cents || 0,
        },
        sprints: sprintCount,
        active_sprints: activeSprints,
        providers,
      },
    };
  });

  /* ---- POST /sprint/:id/cancel — Stop a generating sprint ---- */
  app.post('/sprint/:id/cancel', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const sprint = db.prepare(
      'SELECT * FROM creative_sprints WHERE id = ? AND user_id = ?'
    ).get(id, request.user.id) as SprintRow | undefined;

    if (!sprint) {
      return reply.status(404).send({ success: false, error: 'Sprint not found' });
    }

    if (sprint.status === 'generating') {
      stopSprintGeneration(id);
      // Cancel pending/generating jobs
      db.prepare(
        "UPDATE creative_jobs SET status = 'cancelled' WHERE sprint_id = ? AND status IN ('pending', 'script_ready', 'generating', 'polling')"
      ).run(id);
    }

    return { success: true, message: 'Sprint generation cancelled' };
  });

  /* ---- GET /templates — Pre-built sprint templates ---- */
  app.get('/templates', { preHandler: [app.authenticate] }, async () => {
    return {
      success: true,
      templates: [
        {
          id: 'scale_winners',
          name: 'Scale Winners 10x',
          description: 'Take your top 3-5 performing ads and create 10+ variations of each. Different hooks, visuals, and CTAs while keeping the winning angle.',
          suggested_creatives: 30,
          suggested_budget_cents: 15000,
          focus_formats: ['remake_winner', 'ugc_talking_head', 'static_ad'],
          strategy: 'Maximize proven winners by testing new hooks and visual styles on the same winning messages.',
        },
        {
          id: 'test_new_formats',
          name: 'Test 5 New Formats',
          description: 'Explore formats you haven\'t tried — podcast clips, skits, testimonials, before/after, and green screen reactions.',
          suggested_creatives: 15,
          suggested_budget_cents: 10000,
          focus_formats: ['podcast_clip', 'skit', 'testimonial_mashup', 'before_after', 'green_screen_reaction'],
          strategy: 'Diversify your creative mix to find untapped formats that resonate with your audience.',
        },
        {
          id: 'localize_top5',
          name: 'Localize Top 5',
          description: 'Take your 5 best-performing creatives and adapt them for Hindi, Tamil, and regional audiences.',
          suggested_creatives: 15,
          suggested_budget_cents: 12000,
          focus_formats: ['localization'],
          strategy: 'Expand reach by localizing proven creatives for regional markets with cultural adaptation.',
        },
        {
          id: 'quick_static_batch',
          name: 'Quick Static Batch',
          description: 'Generate 50 static ad variations at minimal cost ($0.04 each). Perfect for rapid A/B testing of headlines, visuals, and CTAs.',
          suggested_creatives: 50,
          suggested_budget_cents: 2000,
          focus_formats: ['static_ad', 'carousel', 'listicle', 'meme_ad'],
          strategy: 'Low-cost, high-volume testing to find winning copy and visual combinations fast.',
        },
        {
          id: 'ugc_blitz',
          name: 'UGC Blitz',
          description: 'Generate 20 UGC-style talking head videos with different hooks, avatars, and scripts. The format that converts best for DTC.',
          suggested_creatives: 20,
          suggested_budget_cents: 20000,
          focus_formats: ['ugc_talking_head', 'testimonial_mashup', 'interview'],
          strategy: 'Saturate with UGC-style content — the highest-converting format for direct response.',
        },
        {
          id: 'full_funnel',
          name: 'Full Funnel Mix',
          description: 'Create creatives for every stage — awareness (skits, podcasts), consideration (demos, testimonials), conversion (UGC, remakes).',
          suggested_creatives: 25,
          suggested_budget_cents: 18000,
          focus_formats: ['skit', 'podcast_clip', 'product_demo', 'testimonial_mashup', 'ugc_talking_head', 'remake_winner'],
          strategy: 'Cover the full funnel with format-appropriate creatives for each buyer stage.',
        },
        {
          id: 'competitor_counter',
          name: 'Competitor Counter-Attack',
          description: 'Analyze what\'s working in your space and create counter-creatives — same hooks but better execution, plus original angles competitors haven\'t tried.',
          suggested_creatives: 20,
          suggested_budget_cents: 15000,
          focus_formats: ['ugc_talking_head', 'static_ad', 'skit', 'before_after'],
          strategy: 'Outmaneuver competitors by combining their winning patterns with your unique value props.',
        },
      ],
    };
  });

  /* ---- POST /sprint/:id/duplicate — Clone a sprint ---- */
  app.post('/sprint/:id/duplicate', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { name } = request.body as { name?: string };
    const db = getDb();

    const original = db.prepare(
      'SELECT * FROM creative_sprints WHERE id = ? AND user_id = ?'
    ).get(id, request.user.id) as SprintRow | undefined;

    if (!original) {
      return reply.status(404).send({ success: false, error: 'Sprint not found' });
    }

    const newId = uuidv4();
    const newName = name || `${original.name} (copy)`;

    db.prepare(`
      INSERT INTO creative_sprints (id, user_id, account_id, name, status, plan, learn_snapshot, total_creatives, estimated_cost_cents, currency)
      VALUES (?, ?, ?, ?, 'planning', ?, ?, ?, ?, ?)
    `).run(
      newId,
      request.user.id,
      original.account_id,
      newName,
      original.plan, // keep the same plan
      original.learn_snapshot, // keep the same snapshot
      original.total_creatives,
      original.estimated_cost_cents,
      original.currency,
    );

    return {
      success: true,
      sprint_id: newId,
      name: newName,
    };
  });

  /* ---- GET /analytics — Cross-sprint analytics ---- */
  app.get('/analytics', { preHandler: [app.authenticate] }, async (request) => {
    const db = getDb();
    const userId = request.user.id;

    // Format win rates (which formats produce the best actual performance)
    const formatPerformance = db.prepare(`
      SELECT
        ca.format,
        COUNT(*) as total_assets,
        SUM(CASE WHEN ca.actual_metrics IS NOT NULL THEN 1 ELSE 0 END) as tracked_assets,
        AVG(ca.predicted_score) as avg_predicted_score
      FROM creative_assets ca
      WHERE ca.user_id = ?
      GROUP BY ca.format
      ORDER BY total_assets DESC
    `).all(userId) as FormatPerformanceRow[];

    // Enrich with actual metrics from the assets that have been tracked
    const formatWinRates: {
      format: string;
      total_assets: number;
      tracked_assets: number;
      avg_predicted_score: number;
      avg_actual_roas: number;
      avg_actual_ctr: number;
      total_spend: number;
    }[] = [];
    for (const fp of formatPerformance) {
      const assetsWithMetrics = db.prepare(`
        SELECT actual_metrics FROM creative_assets
        WHERE user_id = ? AND format = ? AND actual_metrics IS NOT NULL
      `).all(userId, fp.format) as ActualMetricsRow[];

      let avgRoas = 0;
      let avgCtr = 0;
      let totalSpend = 0;
      if (assetsWithMetrics.length > 0) {
        for (const a of assetsWithMetrics) {
          const m = safeJsonParse(a.actual_metrics, {}) as Record<string, number>;
          avgRoas += m['roas'] || 0;
          avgCtr += m['ctr'] || 0;
          totalSpend += m['spend'] || 0;
        }
        avgRoas /= assetsWithMetrics.length;
        avgCtr /= assetsWithMetrics.length;
      }

      formatWinRates.push({
        format: fp.format,
        total_assets: fp.total_assets,
        tracked_assets: fp.tracked_assets,
        avg_predicted_score: Math.round((fp.avg_predicted_score || 0) * 10) / 10,
        avg_actual_roas: Math.round(avgRoas * 100) / 100,
        avg_actual_ctr: Math.round(avgCtr * 100) / 100,
        total_spend: Math.round(totalSpend * 100) / 100,
      });
    }

    // Cost efficiency trends per sprint
    const sprintTrends = db.prepare(`
      SELECT
        cs.id,
        cs.name,
        cs.status,
        cs.total_creatives,
        cs.completed_creatives,
        cs.estimated_cost_cents,
        cs.actual_cost_cents,
        cs.created_at
      FROM creative_sprints cs
      WHERE cs.user_id = ?
      ORDER BY cs.created_at ASC
    `).all(userId) as SprintTrendRow[];

    const costTrends = sprintTrends.map((s: SprintTrendRow) => ({
      sprint_id: s.id,
      name: s.name,
      status: s.status,
      total_creatives: s.total_creatives,
      completed_creatives: s.completed_creatives,
      estimated_cents: s.estimated_cost_cents,
      actual_cents: s.actual_cost_cents,
      cost_per_creative_cents: s.completed_creatives > 0
        ? Math.round(s.actual_cost_cents / s.completed_creatives)
        : 0,
      efficiency_pct: s.estimated_cost_cents > 0
        ? Math.round((1 - s.actual_cost_cents / s.estimated_cost_cents) * 100)
        : 0,
      created_at: s.created_at,
    }));

    // Prediction accuracy (predicted score vs actual performance)
    const predictionData = db.prepare(`
      SELECT
        ca.predicted_score,
        ca.actual_metrics
      FROM creative_assets ca
      WHERE ca.user_id = ? AND ca.predicted_score IS NOT NULL AND ca.actual_metrics IS NOT NULL
    `).all(userId) as PredictionRow[];

    let predictionAccuracy = null;
    if (predictionData.length >= 3) {
      // Compare predicted scores against actual ROAS ranking
      const scored = predictionData.map((d: PredictionRow) => {
        const metrics = safeJsonParse(d.actual_metrics, {}) as Record<string, number>;
        return {
          predicted: d.predicted_score,
          actual_roas: (metrics['roas'] as number) || 0,
        };
      });

      // Simple correlation: do higher predicted scores correlate with higher ROAS?
      scored.sort((a, b) => (b.predicted ?? 0) - (a.predicted ?? 0));
      const topHalfPredicted = scored.slice(0, Math.ceil(scored.length / 2));
      const bottomHalfPredicted = scored.slice(Math.ceil(scored.length / 2));

      const topAvgRoas = topHalfPredicted.reduce((s, d) => s + d.actual_roas, 0) / topHalfPredicted.length;
      const bottomAvgRoas = bottomHalfPredicted.length > 0
        ? bottomHalfPredicted.reduce((s, d) => s + d.actual_roas, 0) / bottomHalfPredicted.length
        : 0;

      predictionAccuracy = {
        total_compared: predictionData.length,
        top_predicted_avg_roas: Math.round(topAvgRoas * 100) / 100,
        bottom_predicted_avg_roas: Math.round(bottomAvgRoas * 100) / 100,
        prediction_useful: topAvgRoas > bottomAvgRoas,
        lift_pct: bottomAvgRoas > 0
          ? Math.round(((topAvgRoas - bottomAvgRoas) / bottomAvgRoas) * 100)
          : 0,
      };
    }

    // Top DNA combinations from best performers
    const topDna = db.prepare(`
      SELECT ca.dna_tags, ca.actual_metrics, ca.predicted_score
      FROM creative_assets ca
      WHERE ca.user_id = ? AND ca.dna_tags IS NOT NULL AND ca.actual_metrics IS NOT NULL
      ORDER BY json_extract(ca.actual_metrics, '$.roas') DESC
      LIMIT 20
    `).all(userId) as TopDnaRow[];

    const dnaPatterns: Record<string, { count: number; avgRoas: number }> = {};
    for (const row of topDna) {
      const tags = safeJsonParse(row.dna_tags, {}) as Record<string, string[]>;
      const metrics = safeJsonParse(row.actual_metrics, {}) as Record<string, number>;
      const hookKey = (tags['hook'] || []).join('+') || 'unknown';
      if (!dnaPatterns[hookKey]) dnaPatterns[hookKey] = { count: 0, avgRoas: 0 };
      dnaPatterns[hookKey].count++;
      dnaPatterns[hookKey].avgRoas += metrics['roas'] || 0;
    }
    const winningDna = Object.entries(dnaPatterns)
      .map(([combo, data]) => ({
        hook_combo: combo,
        count: data.count,
        avg_roas: Math.round((data.avgRoas / data.count) * 100) / 100,
      }))
      .sort((a, b) => b.avg_roas - a.avg_roas)
      .slice(0, 10);

    return {
      success: true,
      analytics: {
        format_win_rates: formatWinRates,
        cost_trends: costTrends,
        prediction_accuracy: predictionAccuracy,
        winning_dna: winningDna,
        total_sprints: sprintTrends.length,
        total_assets: formatPerformance.reduce((s: number, f: FormatPerformanceRow) => s + f.total_assets, 0),
      },
    };
  });

  /* ---- POST /asset/:id/edit — Modify an approved creative's metadata ---- */
  app.post('/asset/:id/edit', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { headline, cta_text, hook_text, notes } = request.body as {
      headline?: string; cta_text?: string; hook_text?: string; notes?: string;
    };
    const db = getDb();

    const asset = db.prepare(
      'SELECT * FROM creative_assets WHERE id = ? AND user_id = ?'
    ).get(id, request.user.id) as AssetRow | undefined;

    if (!asset) {
      return reply.status(404).send({ success: false, error: 'Asset not found' });
    }

    // Store edits in dna_tags as metadata (keeps original asset intact)
    const currentTags = safeJsonParse<Record<string, unknown>>(asset.dna_tags, {});
    const prevEdits = (currentTags['_edits'] || {}) as Record<string, unknown>;
    const edits = {
      ...currentTags,
      _edits: {
        headline: headline || prevEdits['headline'],
        cta_text: cta_text || prevEdits['cta_text'],
        hook_text: hook_text || prevEdits['hook_text'],
        notes: notes || prevEdits['notes'],
        edited_at: new Date().toISOString(),
      },
    };

    db.prepare(
      'UPDATE creative_assets SET dna_tags = ?, name = COALESCE(?, name) WHERE id = ?'
    ).run(JSON.stringify(edits), headline || null, id);

    return { success: true, asset_id: id };
  });

  /* ---- DELETE /sprint/:id ---- */
  app.delete('/sprint/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const sprint = db.prepare(
      'SELECT * FROM creative_sprints WHERE id = ? AND user_id = ?'
    ).get(id, request.user.id) as SprintRow | undefined;

    if (!sprint) {
      return reply.status(404).send({ success: false, error: 'Sprint not found' });
    }

    // If generating, stop the queue first
    if (sprint.status === 'generating') {
      stopSprintGeneration(id);
    }

    db.prepare('DELETE FROM cost_ledger WHERE sprint_id = ?').run(id);
    db.prepare('DELETE FROM creative_assets WHERE sprint_id = ?').run(id);
    db.prepare('DELETE FROM creative_jobs WHERE sprint_id = ?').run(id);
    db.prepare('DELETE FROM creative_sprints WHERE id = ?').run(id);

    return { success: true };
  });

  /* ---- POST /auto-track — Auto-fetch performance for all trackable assets (cron/n8n trigger) ---- */
  app.post('/auto-track', { preHandler: [app.authenticate] }, async (request) => {
    const db = getDb();
    const userId = request.user.id;

    const token = getUserMetaToken(userId);
    if (!token) {
      return { success: false, error: 'Meta account not connected', tracked: 0 };
    }

    // Find all published assets older than 3 days that haven't been tracked yet (or were tracked > 24h ago)
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().replace('T', ' ').split('.')[0];
    const oneDayAgo = new Date(Date.now() - 86400000).toISOString().replace('T', ' ').split('.')[0];

    const trackableAssets = db.prepare(`
      SELECT * FROM creative_assets
      WHERE user_id = ?
        AND meta_ad_id IS NOT NULL
        AND status IN ('published', 'tracking')
        AND published_at IS NOT NULL
        AND published_at <= ?
        AND (metrics_fetched_at IS NULL OR metrics_fetched_at <= ?)
      ORDER BY published_at ASC
      LIMIT 50
    `).all(userId, threeDaysAgo, oneDayAgo) as AssetRow[];

    if (trackableAssets.length === 0) {
      return { success: true, tracked: 0, message: 'No assets need tracking' };
    }

    const meta = new MetaApiService(token);
    let tracked = 0;
    let failed = 0;

    for (const asset of trackableAssets) {
      try {
        // Determine how long the ad has been running to pick the right date range
        const daysSincePublished = Math.floor(
          (Date.now() - new Date(asset.published_at!).getTime()) / 86400000
        );
        const datePreset = daysSincePublished > 14 ? 'last_30d' : 'last_7d';

        const insightsResp = await meta.get<any>(`/${asset.meta_ad_id}/insights`, {
          fields: 'spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas',
          date_preset: datePreset,
        });

        const insight = insightsResp?.data?.[0];
        if (insight) {
          const m = parseInsightMetrics(insight);
          const metrics = {
            spend: round(m.spend, 2),
            roas: round(m.roas, 2),
            ctr: round(m.ctr, 2),
            cpa: round(m.cpa, 2),
            impressions: m.impressions,
            conversions: m.conversions,
          };

          // Determine new status based on performance
          const newStatus = m.spend > 0 ? 'analyzed' : 'tracking';

          db.prepare(
            "UPDATE creative_assets SET actual_metrics = ?, metrics_fetched_at = datetime('now'), status = ? WHERE id = ?"
          ).run(JSON.stringify(metrics), newStatus, asset.id);
          tracked++;
        }
      } catch (err: any) {
        logger.error({ err: err.message }, `[Auto-Track] Error for asset ${asset.id}`);
        failed++;
      }
    }

    return {
      success: true,
      tracked,
      failed,
      total: trackableAssets.length,
      message: `Tracked ${tracked}/${trackableAssets.length} assets`,
    };
  });
}
