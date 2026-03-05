import type { FastifyInstance } from 'fastify';

/* ------------------------------------------------------------------ */
/*  Media Generation Routes                                            */
/*  POST /media/generate-image  — Nano Banana API                      */
/*  POST /media/generate-video  — Veo 3 via n8n webhook                */
/*  GET  /media/video-status    — Poll video generation status          */
/* ------------------------------------------------------------------ */

const NANO_BANANA_API_KEY = process.env.NANO_BANANA_API_KEY || '';
const N8N_VIDEO_WEBHOOK = process.env.N8N_VIDEO_WEBHOOK || '';

export async function mediaGenRoutes(app: FastifyInstance) {

  // POST /media/generate-image
  app.post('/generate-image', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { prompt, style, aspect_ratio, reference_image_url } = request.body as {
      prompt: string;
      style?: string;
      aspect_ratio?: string;
      reference_image_url?: string;
    };

    if (!prompt?.trim()) {
      return reply.status(400).send({ success: false, error: 'prompt is required' });
    }

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
        console.error('Nano Banana API error:', response.status, errorBody);
        return reply.status(502).send({ success: false, error: `Image generation failed: ${response.statusText}` });
      }

      const result = await response.json() as any;

      return {
        success: true,
        image_url: result.image_url || result.url || result.output?.url || result.data?.url,
        generation_id: result.id || result.generation_id || null,
      };
    } catch (err: any) {
      console.error('Image generation error:', err);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // POST /media/generate-video
  app.post('/generate-video', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { script, duration, aspect_ratio, avatar } = request.body as {
      script: string;
      duration?: string;
      aspect_ratio?: string;
      avatar?: string;
    };

    if (!script?.trim()) {
      return reply.status(400).send({ success: false, error: 'script is required' });
    }

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
        console.error('n8n video webhook error:', response.status, errorBody);
        return reply.status(502).send({ success: false, error: `Video generation failed: ${response.statusText}` });
      }

      const result = await response.json() as any;

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
      console.error('Video generation error:', err);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // GET /media/video-status — poll for async video generation
  app.get('/video-status', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { generation_id } = request.query as { generation_id?: string };

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

      const result = await response.json() as any;

      return {
        success: true,
        status: result.status || 'processing', // 'processing' | 'completed' | 'failed'
        video_url: result.video_url || null,
        progress: result.progress || null,
      };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
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
