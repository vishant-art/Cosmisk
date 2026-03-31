import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { validate, imageGenerateSchema, videoGenerateSchema } from '../validation/schemas.js';
import { safeJson } from '../utils/safe-fetch.js';
import { logger } from '../utils/logger.js';
import { internalError } from '../utils/error-response.js';
import { FluxProvider } from '../services/api-providers.js';

/* ------------------------------------------------------------------ */
/*  Media Generation Routes                                            */
/*  POST /media/generate-image  — Nano Banana API                      */
/*  POST /media/generate-video  — Veo 3 via n8n webhook                */
/*  GET  /media/video-status    — Poll video generation status          */
/* ------------------------------------------------------------------ */

const NANO_BANANA_API_KEY = config.nanoBananaApiKey;
const N8N_VIDEO_WEBHOOK = config.n8nVideoWebhook;

export async function mediaGenRoutes(app: FastifyInstance) {

  // POST /media/generate-image
  app.post('/generate-image', { preHandler: [app.authenticate], config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = validate(imageGenerateSchema, request.body, reply);
    if (!parsed) return;
    const { prompt, style, aspect_ratio, reference_image_url } = parsed;

    if (!NANO_BANANA_API_KEY) {
      return reply.status(503).send({ success: false, error: 'Image generation API not configured. Set NANO_BANANA_API_KEY in environment.' });
    }

    try {
      // Build the enhanced prompt with style
      const enhancedPrompt = style && style !== 'photorealistic'
        ? `${prompt}, ${style} style`
        : prompt;

      // Map aspect ratio to dimensions
      const dimensions = mapAspectRatio(aspect_ratio || '1:1');

      const response = await fetch('https://api.nanobanana.com/v1/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${NANO_BANANA_API_KEY}`,
        },
        body: JSON.stringify({
          prompt: enhancedPrompt,
          width: dimensions.width,
          height: dimensions.height,
          ...(reference_image_url ? { reference_image: reference_image_url } : {}),
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error({ status: response.status, body: errorBody }, 'Nano Banana API error');
        return reply.status(502).send({ success: false, error: `Image generation failed: ${response.statusText}` });
      }

      const result: any = (await safeJson(response)) || {};

      return {
        success: true,
        image_url: result.image_url || result.url || result.output?.url || result.data?.url,
        generation_id: result.id || result.generation_id || null,
      };
    } catch (err: any) {
      return internalError(reply, err, 'media/generate-image failed');
    }
  });

  // POST /media/generate-video
  app.post('/generate-video', { preHandler: [app.authenticate], config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = validate(videoGenerateSchema, request.body, reply);
    if (!parsed) return;
    const { script, duration, aspect_ratio, avatar } = parsed;

    if (!N8N_VIDEO_WEBHOOK) {
      return reply.status(503).send({ success: false, error: 'Video generation API not configured. Set N8N_VIDEO_WEBHOOK in environment.' });
    }

    try {
      const response = await fetch(N8N_VIDEO_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script,
          duration: duration || '30s',
          aspect_ratio: aspect_ratio || '9:16',
          avatar: avatar || 'sophia',
          user_id: request.user.id,
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error({ status: response.status, body: errorBody }, 'n8n video webhook error');
        return reply.status(502).send({ success: false, error: `Video generation failed: ${response.statusText}` });
      }

      const result: any = (await safeJson(response)) || {};

      // n8n webhook may return immediately with a job ID for async processing
      // or may return the video URL directly
      if (result.video_url) {
        return {
          success: true,
          status: 'completed',
          video_url: result.video_url,
          generation_id: result.id || result.generation_id || null,
        };
      }

      // Async case — return job ID for polling
      return {
        success: true,
        status: 'processing',
        generation_id: result.id || result.generation_id || result.executionId || null,
        message: 'Video is being generated. Poll /media/video-status for updates.',
      };
    } catch (err: any) {
      return internalError(reply, err, 'media/generate-video failed');
    }
  });

  // GET /media/video-status — poll for async video generation
  app.get('/video-status', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { generation_id } = request.query as Record<string, string>;

    if (!generation_id) {
      return reply.status(400).send({ success: false, error: 'generation_id is required' });
    }

    if (!N8N_VIDEO_WEBHOOK) {
      return reply.status(503).send({ success: false, error: 'Video generation API not configured' });
    }

    try {
      // Poll n8n for status — append /status or use a separate endpoint
      const statusUrl = N8N_VIDEO_WEBHOOK.replace(/\/?$/, '') + '/status';
      const response = await fetch(`${statusUrl}?generation_id=${generation_id}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        return reply.status(502).send({ success: false, error: 'Could not check video status' });
      }

      const result: any = (await safeJson(response)) || {};

      return {
        success: true,
        status: result.status || 'processing', // 'processing' | 'completed' | 'failed'
        video_url: result.video_url || null,
        progress: result.progress || null,
      };
    } catch (err: any) {
      return internalError(reply, err, 'media/video-status failed');
    }
  });

  // POST /media/generate-image-flux — Flux (BFL) image generation
  app.post('/generate-image-flux', {
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { prompt, aspect_ratio } = request.body as { prompt: string; aspect_ratio?: string };
    if (!prompt) return reply.status(400).send({ success: false, error: 'prompt is required' });

    try {
      const flux = new FluxProvider();
      const result = await flux.generate({ format: 'static', prompt, aspect_ratio: aspect_ratio || '1:1' });

      if (result.status === 'processing' && result.job_id) {
        return { success: true, status: 'processing', job_id: result.job_id };
      }
      if (result.status === 'completed') {
        return { success: true, status: 'completed', image_url: result.output_url };
      }
      return reply.status(502).send({ success: false, error: result.error || 'Image generation failed' });
    } catch (err: any) {
      return internalError(reply, err, 'media/generate-image-flux failed');
    }
  });

  // GET /media/image-status — Poll Flux image generation status
  app.get('/image-status', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { job_id } = request.query as { job_id: string };
    if (!job_id) return reply.status(400).send({ success: false, error: 'job_id is required' });

    try {
      const flux = new FluxProvider();
      const result = await flux.checkStatus(job_id);
      return { success: true, ...result };
    } catch (err: any) {
      return internalError(reply, err, 'media/image-status failed');
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Utility                                                            */
/* ------------------------------------------------------------------ */

function mapAspectRatio(ratio: string): { width: number; height: number } {
  switch (ratio) {
    case '9:16': return { width: 768, height: 1344 };
    case '16:9': return { width: 1344, height: 768 };
    case '1:1':
    default: return { width: 1024, height: 1024 };
  }
}
