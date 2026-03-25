import type { FastifyInstance } from 'fastify';
import Anthropic from '@anthropic-ai/sdk';
import { validate, creativeScoreSchema, batchScoreSchema } from '../validation/schemas.js';
import { extractText } from '../utils/claude-helpers.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { internalError } from '../utils/error-response.js';

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

/* ------------------------------------------------------------------ */
/*  Cosmisk Score — Free public ad creative analysis                   */
/*  No auth required. Rate limited to 10 req/min per IP.               */
/* ------------------------------------------------------------------ */

export async function scoreRoutes(app: FastifyInstance) {

  /* ---- POST /analyze — Analyze an ad creative ---- */
  app.post('/analyze', {
    preHandler: [app.authenticate],
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      },
    },
  }, async (request, reply) => {
    const parsed = validate(creativeScoreSchema, request.body, reply);
    if (!parsed) return;
    const { url, description, format, industry, platform } = parsed;

    if (!url && !description) {
      return reply.status(400).send({
        success: false,
        error: 'Provide either a URL or a description of the ad creative',
      });
    }

    const systemPrompt = `You are the Cosmisk Score AI — the world's most advanced ad creative analyzer. You evaluate ad creatives and predict their performance based on patterns from thousands of successful ads.

You analyze ads across 3 dimensions:
1. HOOK — The first 1-3 seconds (video) or headline (static). What attention mechanism does it use?
2. VISUAL — The visual style, composition, color palette, and production quality.
3. AUDIO — The sound design, voiceover style, music choice (video only).

HOOK TYPES: Shock Statement, Price Anchor, Authority, Personal Story, Curiosity, Social Proof, Urgency, Education, Transformation, Direct Interrogation, Pattern Interrupt, Controversial Take, Before/After, Testimonial Lead, Problem Agitation
VISUAL STYLES: UGC Style, Product Focus, Text-Heavy, Lifestyle, Before/After, Minimal, Split Screen, High Production, Lo-Fi/Raw, Meme Format, Dark Mode, Bright/Colorful, Cinematic
AUDIO STYLES: Hindi VO, English VO, Music-Only, Upbeat, Emotional, ASMR, Sound Effects, Podcast Style, No Audio (Static), Trending Sound

SCORING (0-100):
- 90-100: Exceptional. Will likely outperform 95% of ads.
- 70-89: Strong. Clear winning patterns, minor improvements possible.
- 50-69: Average. Has potential but needs work on specific areas.
- 30-49: Below average. Fundamental issues with hook, visual, or messaging.
- 0-29: Weak. Major rework needed.

RULES:
- Be specific and actionable. "Improve the hook" is useless. "Replace the generic opening with a price anchor — 'Under $X for Y' hooks convert 2.3x better for this format" is useful.
- Reference specific ad performance patterns (you can cite general industry data).
- Score honestly. Most ads are 40-60. Only truly exceptional work gets 80+.
- Provide 3 specific, implementable improvements ranked by expected impact.

OUTPUT FORMAT — respond with ONLY valid JSON:
{
  "score": 65,
  "grade": "B",
  "summary": "One sentence overall assessment",
  "dna": {
    "hook": {
      "types": ["Primary Hook", "Secondary Hook"],
      "score": 70,
      "analysis": "Why this hook works or doesn't"
    },
    "visual": {
      "styles": ["Primary Style", "Secondary Style"],
      "score": 60,
      "analysis": "Visual assessment"
    },
    "audio": {
      "styles": ["Audio Style"],
      "score": 65,
      "analysis": "Audio assessment (or 'N/A for static')"
    }
  },
  "strengths": ["Specific strength 1", "Specific strength 2"],
  "improvements": [
    {
      "priority": 1,
      "area": "hook | visual | audio | copy | targeting",
      "current": "What it does now",
      "suggested": "What it should do instead",
      "expected_impact": "e.g. +15-25% CTR improvement"
    },
    {
      "priority": 2,
      "area": "...",
      "current": "...",
      "suggested": "...",
      "expected_impact": "..."
    },
    {
      "priority": 3,
      "area": "...",
      "current": "...",
      "suggested": "...",
      "expected_impact": "..."
    }
  ],
  "competitor_context": "How this compares to top-performing ads in the same format/industry",
  "remake_suggestions": [
    "Variation 1: Brief description of a higher-performing variation",
    "Variation 2: Brief description of another angle to test"
  ]
}`;

    const userMessage = `Analyze this ad creative:

${url ? `URL: ${url}` : ''}
${description ? `DESCRIPTION: ${description}` : ''}
FORMAT: ${format || 'unknown'}
INDUSTRY: ${industry || 'not specified'}
PLATFORM: ${platform || 'Meta (Facebook/Instagram)'}

Provide a detailed Cosmisk Score analysis.`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      const text = extractText(response);
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          success: true,
          analysis: parsed,
          meta: {
            analyzed_at: new Date().toISOString(),
            model: 'cosmisk-score-v1',
            input: {
              url: url || null,
              has_description: !!description,
              format: format || 'unknown',
              industry: industry || null,
              platform: platform || 'meta',
            },
          },
        };
      }

      return reply.status(500).send({ success: false, error: 'Analysis failed to parse' });
    } catch (err: any) {
      return internalError(reply, err, 'score/analyze failed');
    }
  });

  /* ---- POST /batch — Analyze multiple creatives at once ---- */
  app.post('/batch', {
    preHandler: [app.authenticate],
    config: {
      rateLimit: {
        max: 3,
        timeWindow: '1 minute',
      },
    },
  }, async (request, reply) => {
    const parsed = validate(batchScoreSchema, request.body, reply);
    if (!parsed) return;
    const { creatives } = parsed;

    if (creatives.length > 5) {
      return reply.status(400).send({
        success: false,
        error: 'Provide 1-5 creatives to analyze',
      });
    }

    const systemPrompt = `You are the Cosmisk Score AI. Analyze multiple ad creatives and rank them.

For each creative, provide:
- score (0-100)
- grade (A+ to F)
- one_line_summary
- top_strength
- top_improvement
- dna_hook (primary hook type)
- dna_visual (primary visual style)

Then provide an overall ranking with reasoning.

OUTPUT FORMAT — respond with ONLY valid JSON:
{
  "results": [
    {
      "index": 0,
      "score": 65,
      "grade": "B",
      "one_line_summary": "...",
      "top_strength": "...",
      "top_improvement": "...",
      "dna_hook": "Hook Type",
      "dna_visual": "Visual Style"
    }
  ],
  "ranking": [
    { "index": 0, "reason": "Why this ranks here" }
  ],
  "overall_insight": "Key insight from comparing these creatives"
}`;

    const userMessage = creatives.map((c, i) =>
      `Creative ${i + 1}:\n${c.url ? `URL: ${c.url}` : ''}\n${c.description ? `Description: ${c.description}` : ''}\nFormat: ${c.format || 'unknown'}`
    ).join('\n\n');

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Compare and rank these ad creatives:\n\n${userMessage}` }],
      });

      const text = extractText(response);
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        return { success: true, ...JSON.parse(jsonMatch[0]) };
      }

      return reply.status(500).send({ success: false, error: 'Batch analysis failed to parse' });
    } catch (err: any) {
      return internalError(reply, err, 'score/batch failed');
    }
  });
}
