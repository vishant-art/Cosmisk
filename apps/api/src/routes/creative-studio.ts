import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { getDbAdapter } from '../db/adapter.js';
import { logger } from '../utils/logger.js';
import { internalError } from '../utils/error-response.js';
import { safeFetch, safeJson } from '../utils/safe-fetch.js';
import { createMessage } from '../services/llm-gateway.js';
import { FluxProvider } from '../services/api-providers.js';
import { extractText } from '../utils/claude-helpers.js';
import { scoreCreative, getAccuracyStats, resolveScorePredictions } from '../services/creative-scorer.js';
import {
  creativeGenEnabled, startCreativeGen, getCreativeJob, fetchCreativeAsset, fetchCreativeAssetUrl,
  videoPlan, videoGenerate,
} from '../services/creative-gen-client.js';
import { pollVideoJob } from '../services/video-job-poller.js';
import { getMetaTokenForUser } from '../boot/meta-helpers.js';

/* ------------------------------------------------------------------ */
/*  Creative Studio Routes                                             */
/*  POST /creative-studio/analyze-url   — Extract product info from URL */
/*  POST /creative-studio/generate      — Generate creatives from brief */
/*  GET  /creative-studio/generation/:id — Get generation status/output */
/*  GET  /creative-studio/generations    — List user's generations      */
/* ------------------------------------------------------------------ */

interface Brief {
  brand_name: string;
  product_name: string;
  product_description: string;
  target_audience: string;
  key_features?: string[];
  price?: string;
}

interface GenerateBody {
  brief: Brief;
  formats: string[];
  meta_account_id?: string;
  url?: string;
}


export async function creativeStudioRoutes(app: FastifyInstance) {
  // POST /analyze-url
  app.post('/analyze-url', {
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { url } = request.body as { url: string };

    if (!url) {
      return reply.status(400).send({ success: false, error: 'url is required' });
    }

    try {
      const db = getDbAdapter();

      // Check cache first
      const cached = await db.get<{ result_json: string }>('SELECT result_json FROM url_analysis_cache WHERE url = ?', [url]);
      if (cached) {
        return { success: true, analysis: JSON.parse(cached.result_json) };
      }

      // Fetch the URL
      const response = await safeFetch(url, {
        service: 'URLAnalyzer',
        timeoutMs: 10_000,
      });

      const html = await response.text();
      const truncatedHtml = html.slice(0, 15_000);

      // Use Claude Haiku to extract structured data
      const aiResponse = await createMessage({
        userId: request.user.id,
        operation: 'creative-studio.analyze-url',
        request: {
          model: 'claude-haiku-4-5',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: `Analyze this product page HTML and extract structured data:\n\n${truncatedHtml}`,
          }],
          system: `You are a product page analyzer. Extract the following from this HTML page content:
- brand_name: the brand or company name
- product_name: the main product being promoted
- product_description: a compelling 2-3 sentence description
- target_audience: who this product is for (infer from the page)
- key_features: array of 3-5 key selling points
- price: the price if visible (include currency)
- images: array of up to 3 image URLs from OG tags or product images

Return ONLY valid JSON, no markdown.`,
        },
      });

      const rawText = extractText(aiResponse, '{}');
      // Strip markdown code fences if present
      const cleanText = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      const parsedResult = JSON.parse(cleanText);

      // Cache the result
      await db.run(
        'INSERT INTO url_analysis_cache (url, result_json) VALUES (?, ?) ON CONFLICT(url) DO UPDATE SET result_json = excluded.result_json',
        [url, JSON.stringify(parsedResult)],
      );

      return { success: true, analysis: parsedResult };
    } catch (err: any) {
      logger.error({ err: err.message, url }, 'creative-studio/analyze-url failed');
      return reply.status(500).send({ success: false, error: err.message || 'Failed to analyze URL' });
    }
  });

  // POST /generate
  app.post('/generate', {
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { brief, formats, meta_account_id } = request.body as GenerateBody;

    if (!brief || !formats || !Array.isArray(formats) || formats.length === 0) {
      return reply.status(400).send({ success: false, error: 'brief and formats[] are required' });
    }

    try {
      const db = getDbAdapter();
      const generationId = randomUUID();
      const userId = request.user.id;

      // Create generation record
      await db.run(`
        INSERT INTO studio_generations (id, user_id, brief_json, formats, meta_account_id, status)
        VALUES (?, ?, ?, ?, ?, 'generating')
      `, [generationId, userId, JSON.stringify(brief), JSON.stringify(formats), meta_account_id || null]);

      // Create output records for each format
      const outputIds: Record<string, string> = {};
      for (const format of formats) {
        const outputId = randomUUID();
        outputIds[format] = outputId;
        await db.run(`
          INSERT INTO studio_outputs (id, generation_id, format, status)
          VALUES (?, ?, ?, 'pending')
        `, [outputId, generationId, format]);
      }

      // Return immediately, process in background
      reply.send({ success: true, generation_id: generationId });

      // Kick off async generation (don't await). When the ai-layer (M4 Generative
      // Engine) is configured, route to the Python pipeline; otherwise the legacy path.
      const background = creativeGenEnabled()
        ? processGenerationViaAiLayer(generationId, brief, formats, outputIds, userId, meta_account_id)
        : processGeneration(generationId, brief, formats, outputIds);
      background.catch(err => {
        logger.error({ err: err.message, generationId }, 'Background generation failed');
      });

      return reply;
    } catch (err: any) {
      return internalError(reply, err, 'creative-studio/generate failed');
    }
  });

  // GET /generation/:id
  app.get('/generation/:id', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.id;

    try {
      const db = getDbAdapter();
      const generation = await db.get<any>('SELECT * FROM studio_generations WHERE id = ? AND user_id = ?', [id, userId]);

      if (!generation) {
        return reply.status(404).send({ success: false, error: 'Generation not found' });
      }

      const outputs = await db.all<any>('SELECT * FROM studio_outputs WHERE generation_id = ? ORDER BY created_at ASC', [id]);

      return {
        success: true,
        generation: {
          ...generation,
          brief: JSON.parse(generation.brief_json),
          formats: JSON.parse(generation.formats),
          stage: generation.stage ?? null,                   // live milestone (DB-backed)
          progress: generation.progress_json ? JSON.parse(generation.progress_json) : [],
          brand_kit: generation.brand_kit_json ? JSON.parse(generation.brand_kit_json) : null,
          winners: generation.winners_json ? JSON.parse(generation.winners_json) : [],
          outputs: outputs.map(o => ({
            ...o,
            output: o.output_json ? JSON.parse(o.output_json) : null,
            score_json: o.score_json ? JSON.parse(o.score_json) : null,
          })),
        },
      };
    } catch (err: any) {
      return internalError(reply, err, 'creative-studio/generation/:id failed');
    }
  });

  // GET /generations
  app.get('/generations', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const userId = request.user.id;

    try {
      const db = getDbAdapter();
      const rows = await db.all<any>('SELECT * FROM studio_generations WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [userId]);

      return {
        success: true,
        generations: rows.map(r => ({
          ...r,
          brief: JSON.parse(r.brief_json),
          formats: JSON.parse(r.formats),
        })),
      };
    } catch (err: any) {
      return internalError(reply, err, 'creative-studio/generations failed');
    }
  });

  // POST /score — score a creative on demand
  app.post('/score', {
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { format, hook_type, dna_tags, script_text, meta_account_id } = request.body as {
      format: string;
      hook_type?: string;
      dna_tags?: any;
      script_text?: string;
      meta_account_id?: string;
    };

    if (!format) {
      return reply.status(400).send({ success: false, error: 'format is required' });
    }

    try {
      const score = await scoreCreative({
        userId: request.user.id,
        format,
        hookType: hook_type,
        dnaTags: dna_tags,
        scriptText: script_text,
        platform: 'meta',
        metaAccountId: meta_account_id,
      });

      return { success: true, score };
    } catch (err: any) {
      return internalError(reply, err, 'creative-studio/score failed');
    }
  });

  // GET /asset/:jobId/:file — proxy generated bytes from the ai-layer so the browser
  // only ever talks to /api. Unauthenticated: the jobId is an unguessable capability
  // token (matches how <img>/<video> tags fetch without the JWT header).
  app.get('/asset/:jobId/*', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const file = (request.params as Record<string, string>)['*'];  // may include a subdir
    if (file.includes('..')) return reply.status(400).send({ success: false, error: 'bad path' });
    // Storage on: 302 the browser straight to a presigned R2 URL the ai-layer minted
    // (bytes flow browser<->R2, $0 Railway egress; apps/api holds no R2 creds).
    try {
      const signed = await fetchCreativeAssetUrl(jobId, file);
      if (signed) return reply.redirect(signed, 302);
    } catch (err: any) {
      logger.warn({ err: err.message, jobId, file }, 'asset-url lookup failed; falling back to proxy');
    }
    // Storage off (dev / pre-deploy): byte-proxy from the ai-layer's ephemeral local disk.
    try {
      const upstream = await fetchCreativeAsset(jobId, file);
      if (!upstream.ok) {
        return reply.status(upstream.status || 404).send({ success: false, error: 'asset not found' });
      }
      const ct = upstream.headers.get('content-type') || 'application/octet-stream';
      const buf = Buffer.from(await upstream.arrayBuffer());
      reply.header('Content-Type', ct);
      reply.header('Cache-Control', 'public, max-age=3600');
      return reply.send(buf);
    } catch (err: any) {
      logger.warn({ err: err.message, jobId, file }, 'creative-studio asset proxy failed');
      return reply.status(502).send({ success: false, error: 'asset proxy failed' });
    }
  });

  // GET /accuracy — prediction accuracy stats
  app.get('/accuracy', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    try {
      // Resolve any pending predictions first
      await resolveScorePredictions();

      const stats = await getAccuracyStats(request.user.id);
      return { success: true, ...stats };
    } catch (err: any) {
      return internalError(reply, err, 'creative-studio/accuracy failed');
    }
  });

  // POST /video/plan — $0 quote. 409 (no brand kit) surfaces as a clean message.
  app.post('/video/plan', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { generation_id, seconds, direction, n_shots } = request.body as {
      generation_id: string; seconds?: number; direction?: string; n_shots?: number;
    };
    const db = getDbAdapter();
    const gen = await db.get<{ ai_job_id: string | null }>(
      'SELECT ai_job_id FROM studio_generations WHERE id = ? AND user_id = ?', [generation_id, request.user.id]);
    if (!gen?.ai_job_id) return reply.status(409).send({ success: false, error: 'Generate static ads first, then plan the video.' });
    try {
      const metaToken = await getMetaTokenForUser(request.user.id).catch(() => null);
      const plan = await videoPlan(gen.ai_job_id, { seconds, direction, n_shots }, metaToken || undefined);
      return { success: true, plan };
    } catch (err: any) {
      return reply.status(err.status ?? 500).send({ success: false, error: err.message });
    }
  });

  // POST /video/generate — PAID. Starts the poller on success. 402 surfaces the top-up hint.
  app.post('/video/generate', { preHandler: [app.authenticate], config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
    const { generation_id, voiceover, captions, sfx } = request.body as {
      generation_id: string; voiceover?: boolean; captions?: boolean; sfx?: boolean;
    };
    const db = getDbAdapter();
    const gen = await db.get<{ ai_job_id: string | null; brief_json: string; meta_account_id: string | null }>(
      'SELECT ai_job_id, brief_json, meta_account_id FROM studio_generations WHERE id = ? AND user_id = ?',
      [generation_id, request.user.id]);
    if (!gen?.ai_job_id) return reply.status(409).send({ success: false, error: 'Plan the video first.' });
    // Ensure a video output row exists to track against.
    const outputId = randomUUID();
    await db.run(`INSERT INTO studio_outputs (id, generation_id, format, status) VALUES (?, ?, 'video', 'generating')
                  ON CONFLICT DO NOTHING`, [outputId, generation_id]);
    try {
      const metaToken = await getMetaTokenForUser(request.user.id).catch(() => null);
      const res = await videoGenerate(gen.ai_job_id, { voiceover, captions, sfx }, metaToken || undefined);
      const productName = (() => { try { return JSON.parse(gen.brief_json)?.product_name ?? 'your product'; } catch { return 'your product'; } })();
      void pollVideoJob({ generationId: generation_id, aiJobId: gen.ai_job_id, userId: request.user.id,
        videoOutputId: outputId, productName, accountId: gen.meta_account_id });
      return { success: true, status: res.status, clips: res.clips };
    } catch (err: any) {
      return reply.status(err.status ?? 500).send({ success: false, error: err.message });
    }
  });

  // GET /video/job/:jobId — live stage/progress passthrough for a user who stays on the page.
  app.get('/video/job/:jobId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    try { return { success: true, job: await getCreativeJob(jobId) }; }
    catch (err: any) { return reply.status(err.status ?? 500).send({ success: false, error: err.message }); }
  });
}

/* ------------------------------------------------------------------ */
/*  Background generation processor                                    */
/* ------------------------------------------------------------------ */

async function processGeneration(
  generationId: string,
  brief: Brief,
  formats: string[],
  outputIds: Record<string, string>,
): Promise<void> {
  const db = getDbAdapter();
  const now = () => new Date().toISOString();

  // Look up userId from generation record
  const genRow = await db.get<{ user_id: string; meta_account_id: string | null }>('SELECT user_id, meta_account_id FROM studio_generations WHERE id = ?', [generationId]);
  const userId = genRow?.user_id || '';
  const metaAccountId = genRow?.meta_account_id || undefined;

  const updateOutput = async (outputId: string, status: string, outputJson?: string, errorMessage?: string, costCents?: number) => {
    await db.run(`
      UPDATE studio_outputs SET status = ?, output_json = ?, error_message = ?, cost_cents = ?, updated_at = ?
      WHERE id = ?
    `, [status, outputJson || null, errorMessage || null, costCents || 0, now(), outputId]);
  };

  const briefContext = [
    `Brand: ${brief.brand_name}`,
    `Product: ${brief.product_name}`,
    `Description: ${brief.product_description}`,
    `Target Audience: ${brief.target_audience}`,
    brief.key_features?.length ? `Key Features: ${brief.key_features.join(', ')}` : '',
    brief.price ? `Price: ${brief.price}` : '',
  ].filter(Boolean).join('\n');

  for (const format of formats) {
    const outputId = outputIds[format];

    try {
      switch (format) {
        case 'scripts': {
          const response = await createMessage({
            userId,
            operation: 'creative-studio.scripts',
            request: {
              model: 'claude-sonnet-4-6',
              max_tokens: 4096,
              system: `You are an expert ad creative strategist. Generate 6 UGC video ad scripts for the following product. Each script should have a unique angle and hook style. Return ONLY a valid JSON array of scripts, no markdown.

Each script object must have:
- title: descriptive script name
- hook: the opening 3 seconds (attention grabber)
- body: the main content (15-25 seconds)
- cta: the call to action
- visual_notes: production guidance for the creator`,
              messages: [{
                role: 'user',
                content: `Generate 6 UGC ad scripts for:\n\n${briefContext}`,
              }],
            },
          });

          const rawText = extractText(response, '[]');
          const cleanText = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
          const scripts = JSON.parse(cleanText);

          // Score each script
          const scoredScripts = await Promise.all(scripts.map(async (script: any) => {
            try {
              const score = await scoreCreative({
                userId,
                format: 'scripts',
                scriptText: [script.hook, script.body, script.cta, script.visual_notes].filter(Boolean).join('\n'),
                platform: 'meta',
                metaAccountId,
              });
              // Insert prediction record
              await db.run(`
                INSERT INTO score_predictions (id, user_id, studio_output_id, format, dna_tags, predicted_score, predicted_roas_mid, score_breakdown, confidence)
                VALUES (?, ?, ?, 'scripts', ?, ?, ?, ?, ?)
              `, [
                randomUUID(), userId, outputId,
                JSON.stringify(score.matchedPatterns),
                score.total,
                score.predictedRoasRange?.p50 || null,
                JSON.stringify(score.dimensions),
                score.confidence,
              ]);
              return { ...script, score };
            } catch {
              return script; // scoring failed — return unscored
            }
          }));

          const scoreJson = JSON.stringify(scoredScripts.map((s: any) => s.score).filter(Boolean));
          await updateOutput(outputId, 'completed', JSON.stringify(scoredScripts), undefined, 5);
          await db.run('UPDATE studio_outputs SET score_json = ? WHERE id = ?', [scoreJson, outputId]);
          break;
        }

        case 'static': {
          const flux = new FluxProvider();
          const aspectRatios = ['1:1', '9:16', '16:9', '4:5'];
          const images: Array<{ image_url?: string; job_id?: string; aspect_ratio: string; prompt: string; status: string }> = [];

          const imagePrompt = `Professional product advertisement for ${brief.brand_name} ${brief.product_name}. ${brief.product_description}. Clean, modern, high-quality commercial photography style.`;

          for (const ar of aspectRatios) {
            const result = await flux.generate({ format: 'static', prompt: imagePrompt, aspect_ratio: ar });
            images.push({
              image_url: result.output_url,
              job_id: result.job_id,
              aspect_ratio: ar,
              prompt: imagePrompt,
              status: result.status,
            });
          }

          // Score the static format
          try {
            const staticScore = await scoreCreative({
              userId, format: 'static', platform: 'meta', metaAccountId,
            });
            await db.run('UPDATE studio_outputs SET score_json = ? WHERE id = ?', [JSON.stringify([staticScore]), outputId]);
            await db.run(`
              INSERT INTO score_predictions (id, user_id, studio_output_id, format, predicted_score, predicted_roas_mid, score_breakdown, confidence)
              VALUES (?, ?, ?, 'static', ?, ?, ?, ?)
            `, [randomUUID(), userId, outputId, staticScore.total, staticScore.predictedRoasRange?.p50 || null, JSON.stringify(staticScore.dimensions), staticScore.confidence]);
          } catch { /* scoring non-critical */ }

          await updateOutput(outputId, 'completed', JSON.stringify(images), undefined, 16);
          break;
        }

        case 'carousel': {
          const flux = new FluxProvider();

          // Generate 5 slide prompts with Claude Haiku
          const slideResponse = await createMessage({
            userId,
            operation: 'creative-studio.carousel-prompts',
            request: {
              model: 'claude-haiku-4-5',
              max_tokens: 1024,
              system: 'You are a visual ad designer. Generate 5 image prompts for a carousel ad. Each prompt should create a visually cohesive slide that tells a story. Return ONLY a valid JSON array of 5 strings, no markdown.',
              messages: [{
                role: 'user',
                content: `Create 5 carousel slide image prompts for:\n\n${briefContext}`,
              }],
            },
          });

          const slidesRaw = extractText(slideResponse, '[]');
          const slidesClean = slidesRaw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
          const slidePrompts: string[] = JSON.parse(slidesClean);

          const slides: Array<{ image_url?: string; job_id?: string; prompt: string; slide_number: number; status: string }> = [];

          for (let i = 0; i < slidePrompts.length; i++) {
            const result = await flux.generate({ format: 'carousel', prompt: slidePrompts[i], aspect_ratio: '1:1' });
            slides.push({
              image_url: result.output_url,
              job_id: result.job_id,
              prompt: slidePrompts[i],
              slide_number: i + 1,
              status: result.status,
            });
          }

          // Score the carousel format
          try {
            const carouselScore = await scoreCreative({
              userId, format: 'carousel', platform: 'meta', metaAccountId,
            });
            await db.run('UPDATE studio_outputs SET score_json = ? WHERE id = ?', [JSON.stringify([carouselScore]), outputId]);
            await db.run(`
              INSERT INTO score_predictions (id, user_id, studio_output_id, format, predicted_score, predicted_roas_mid, score_breakdown, confidence)
              VALUES (?, ?, ?, 'carousel', ?, ?, ?, ?)
            `, [randomUUID(), userId, outputId, carouselScore.total, carouselScore.predictedRoasRange?.p50 || null, JSON.stringify(carouselScore.dimensions), carouselScore.confidence]);
          } catch { /* scoring non-critical */ }

          await updateOutput(outputId, 'completed', JSON.stringify(slides), undefined, 100);
          break;
        }

        case 'video': {
          // Video requires HeyGen which is async — mark as pending with info
          await updateOutput(outputId, 'pending', JSON.stringify({
            message: 'Video generation requires HeyGen integration. Use the UGC Studio or sprint pipeline for video creation.',
            suggestion: 'Scripts have been generated above — use them with HeyGen or your preferred video tool.',
          }));
          break;
        }

        default: {
          await updateOutput(outputId, 'failed', undefined, `Unsupported format: ${format}`);
        }
      }
    } catch (err: any) {
      logger.error({ err: err.message, format, generationId }, `Studio generation failed for format: ${format}`);
      await updateOutput(outputId, 'failed', undefined, err.message);
    }
  }

  // Update generation status
  const allOutputs = await db.all<{ status: string }>('SELECT status FROM studio_outputs WHERE generation_id = ?', [generationId]);
  const allFailed = allOutputs.every(o => o.status === 'failed');
  const finalStatus = allFailed ? 'failed' : 'completed';

  await db.run('UPDATE studio_generations SET status = ?, updated_at = ? WHERE id = ?', [finalStatus, new Date().toISOString(), generationId]);
}

/* ------------------------------------------------------------------ */
/*  Python pipeline processor (M4 Generative Engine via apps/ai-layer) */
/* ------------------------------------------------------------------ */

async function processGenerationViaAiLayer(
  generationId: string,
  brief: Brief,
  formats: string[],
  outputIds: Record<string, string>,
  userId: string,
  metaAccountId?: string,
): Promise<void> {
  const db = getDbAdapter();
  const now = () => new Date().toISOString();
  const setOutput = async (outputId: string, status: string, outputJson?: string, errorMessage?: string, costCents = 0, assetUrl?: string) => {
    await db.run(
      'UPDATE studio_outputs SET status = ?, output_json = ?, error_message = ?, cost_cents = ?, asset_url = ?, updated_at = ? WHERE id = ?',
      [status, outputJson ?? null, errorMessage ?? null, costCents, assetUrl ?? null, now(), outputId],
    );
  };
  // Rewrite an ai-layer asset path (/creative/assets/<job>/<sub>) to the apps/api proxy
  // (/api/creative-studio/asset/<job>/<sub>) so the browser only ever hits /api.
  const proxy = (jobId: string, u: string) =>
    `/api/creative-studio/asset/${jobId}/${u.replace(/^\/creative\/assets\/[^/]+\//, '')}`;

  try {
    // Optional Meta token: conditions the brand kit on real winners when the user has
    // connected an account; brief-only generation works without it.
    const metaToken = await getMetaTokenForUser(userId).catch(() => null);

    const jobId = await startCreativeGen({
      brief: brief as unknown as Record<string, unknown>,
      accountId: metaAccountId,
      images: 2,
      formats: ['1:1', '4:5', '9:16'],
      // The storyboard flow (/video/*) owns video now; do not fire the unquoted single-clip smoke.
      withVideo: false,
      noLogo: true,
    }, metaToken || undefined);
    await db.run('UPDATE studio_generations SET ai_job_id = ?, updated_at = ? WHERE id = ?', [jobId, now(), generationId]);

    // Poll the Python job (generation takes minutes; cap at ~8 min), persisting its live
    // stage milestones to the row so the UI shows progress mid-generation (crash-safe).
    const deadline = Date.now() + 8 * 60_000;
    const writeProgress = async (job: { stage: string; progress: string[] }) => {
      await db.run('UPDATE studio_generations SET stage = ?, progress_json = ?, updated_at = ? WHERE id = ?',
        [job.stage, JSON.stringify(job.progress ?? []), now(), generationId]).catch(() => { /* best-effort */ });
    };
    let job = await getCreativeJob(jobId);
    await writeProgress(job);
    while (job.status !== 'complete' && job.status !== 'failed' && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 3000));
      job = await getCreativeJob(jobId);
      await writeProgress(job);
    }

    if (job.status !== 'complete') {
      const msg = job.error || 'generation timed out';
      for (const f of formats) await setOutput(outputIds[f], 'failed', undefined, msg);
      await db.run('UPDATE studio_generations SET status = ?, error_message = ?, updated_at = ? WHERE id = ?', ['failed', msg, now(), generationId]);
      return;
    }

    const images = job.assets.map(a => ({
      image_url: proxy(jobId, a.url),
      aspect_ratio: a.fmt,
      status: 'completed',
      headline: a.copy?.headline ?? null,
      concept: a.concept,
    }));
    const videoOut = job.video ? { video_url: proxy(jobId, job.video.url), status: 'completed' } : null;
    const costCents = Math.round((job.cost_usd || 0) * 100);

    // "Everything -> Python": the video format gets the clip; every other requested
    // format gets the multi-aspect image ads the pipeline produced.
    for (const f of formats) {
      const oid = outputIds[f];
      if (f === 'video') {
        if (videoOut) await setOutput(oid, 'completed', JSON.stringify(videoOut), undefined, costCents, videoOut.video_url);
        else await setOutput(oid, 'pending', JSON.stringify({ message: 'No video produced for this run.' }));
      } else {
        await setOutput(oid, 'completed', JSON.stringify(images), undefined, costCents, images[0]?.image_url);
      }
    }

    const winners = (job.winners ?? []).map(w => ({ url: proxy(jobId, w.url) }));
    await db.run(
      `UPDATE studio_generations SET status = ?, brand_kit_json = ?, winners_json = ?,
       cost_cents = ?, stage = ?, progress_json = ?, updated_at = ? WHERE id = ?`,
      ['completed', job.brand_kit ? JSON.stringify(job.brand_kit) : null,
       JSON.stringify(winners), costCents, job.stage, JSON.stringify(job.progress ?? []),
       now(), generationId]);
  } catch (err: any) {
    logger.error({ err: err.message, generationId }, 'ai-layer studio generation failed');
    for (const f of formats) {
      try { await setOutput(outputIds[f], 'failed', undefined, err.message); } catch { /* best-effort */ }
    }
    await db.run('UPDATE studio_generations SET status = ?, error_message = ?, updated_at = ? WHERE id = ?', ['failed', err.message, new Date().toISOString(), generationId]).catch(() => { /* best-effort */ });
  }
}
