import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { logger } from '../utils/logger.js';
import { internalError } from '../utils/error-response.js';
import { safeFetch, safeJson } from '../utils/safe-fetch.js';
import Anthropic from '@anthropic-ai/sdk';
import { FluxProvider } from '../services/api-providers.js';
import { extractText } from '../utils/claude-helpers.js';

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
  const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

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
      const db = getDb();

      // Check cache first
      const cached = db.prepare('SELECT result_json FROM url_analysis_cache WHERE url = ?').get(url) as { result_json: string } | undefined;
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
      const aiResponse = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
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
      });

      const rawText = extractText(aiResponse, '{}');
      // Strip markdown code fences if present
      const cleanText = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      const parsedResult = JSON.parse(cleanText);

      // Cache the result
      db.prepare('INSERT OR REPLACE INTO url_analysis_cache (url, result_json) VALUES (?, ?)').run(url, JSON.stringify(parsedResult));

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
      const db = getDb();
      const generationId = randomUUID();
      const userId = request.user.id;

      // Create generation record
      db.prepare(`
        INSERT INTO studio_generations (id, user_id, brief_json, formats, meta_account_id, status)
        VALUES (?, ?, ?, ?, ?, 'generating')
      `).run(generationId, userId, JSON.stringify(brief), JSON.stringify(formats), meta_account_id || null);

      // Create output records for each format
      const outputIds: Record<string, string> = {};
      for (const format of formats) {
        const outputId = randomUUID();
        outputIds[format] = outputId;
        db.prepare(`
          INSERT INTO studio_outputs (id, generation_id, format, status)
          VALUES (?, ?, ?, 'pending')
        `).run(outputId, generationId, format);
      }

      // Return immediately, process in background
      reply.send({ success: true, generation_id: generationId });

      // Kick off async generation (don't await)
      processGeneration(db, anthropic, generationId, brief, formats, outputIds).catch(err => {
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
      const db = getDb();
      const generation = db.prepare('SELECT * FROM studio_generations WHERE id = ? AND user_id = ?').get(id, userId) as any;

      if (!generation) {
        return reply.status(404).send({ success: false, error: 'Generation not found' });
      }

      const outputs = db.prepare('SELECT * FROM studio_outputs WHERE generation_id = ? ORDER BY created_at ASC').all(id) as any[];

      return {
        success: true,
        generation: {
          ...generation,
          brief: JSON.parse(generation.brief_json),
          formats: JSON.parse(generation.formats),
          outputs: outputs.map(o => ({
            ...o,
            output: o.output_json ? JSON.parse(o.output_json) : null,
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
      const db = getDb();
      const rows = db.prepare('SELECT * FROM studio_generations WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(userId) as any[];

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
}

/* ------------------------------------------------------------------ */
/*  Background generation processor                                    */
/* ------------------------------------------------------------------ */

async function processGeneration(
  db: ReturnType<typeof getDb>,
  anthropic: Anthropic,
  generationId: string,
  brief: Brief,
  formats: string[],
  outputIds: Record<string, string>,
): Promise<void> {
  const now = () => new Date().toISOString();

  const updateOutput = (outputId: string, status: string, outputJson?: string, errorMessage?: string, costCents?: number) => {
    db.prepare(`
      UPDATE studio_outputs SET status = ?, output_json = ?, error_message = ?, cost_cents = ?, updated_at = ?
      WHERE id = ?
    `).run(status, outputJson || null, errorMessage || null, costCents || 0, now(), outputId);
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
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
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
          });

          const rawText = extractText(response, '[]');
          const cleanText = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
          const scripts = JSON.parse(cleanText);
          updateOutput(outputId, 'completed', JSON.stringify(scripts), undefined, 5);
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

          updateOutput(outputId, 'completed', JSON.stringify(images), undefined, 16);
          break;
        }

        case 'carousel': {
          const flux = new FluxProvider();

          // Generate 5 slide prompts with Claude Haiku
          const slideResponse = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1024,
            system: 'You are a visual ad designer. Generate 5 image prompts for a carousel ad. Each prompt should create a visually cohesive slide that tells a story. Return ONLY a valid JSON array of 5 strings, no markdown.',
            messages: [{
              role: 'user',
              content: `Create 5 carousel slide image prompts for:\n\n${briefContext}`,
            }],
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

          updateOutput(outputId, 'completed', JSON.stringify(slides), undefined, 100);
          break;
        }

        case 'video': {
          // Video requires HeyGen which is async — mark as pending with info
          updateOutput(outputId, 'pending', JSON.stringify({
            message: 'Video generation requires HeyGen integration. Use the UGC Studio or sprint pipeline for video creation.',
            suggestion: 'Scripts have been generated above — use them with HeyGen or your preferred video tool.',
          }));
          break;
        }

        default: {
          updateOutput(outputId, 'failed', undefined, `Unsupported format: ${format}`);
        }
      }
    } catch (err: any) {
      logger.error({ err: err.message, format, generationId }, `Studio generation failed for format: ${format}`);
      updateOutput(outputId, 'failed', undefined, err.message);
    }
  }

  // Update generation status
  const allOutputs = db.prepare('SELECT status FROM studio_outputs WHERE generation_id = ?').all(generationId) as Array<{ status: string }>;
  const allFailed = allOutputs.every(o => o.status === 'failed');
  const finalStatus = allFailed ? 'failed' : 'completed';

  db.prepare('UPDATE studio_generations SET status = ?, updated_at = ? WHERE id = ?').run(finalStatus, new Date().toISOString(), generationId);
}
