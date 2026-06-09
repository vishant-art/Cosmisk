/**
 * Validator — standard Gemini vision integration (single-image scoring).
 */

import { logger } from '../../../utils/logger.js';
import type { QualityScore, ProductBrief } from '../types.js';
import { VALIDATION_PROMPT, GEMINI_MODELS } from './constants.js';
import { createFallbackScore } from './scoring.js';

export async function analyzeWithGemini(
  base64Image: string,
  mimeType: string,
  product: ProductBrief,
  brandName: string
): Promise<QualityScore> {
  const apiKey = process.env['GEMINI_API_KEY'] || process.env['GOOGLE_AI_API_KEY'];

  if (!apiKey) {
    logger.warn('[Validator] No Gemini API key, using fallback scoring');
    return createFallbackScore();
  }

  const contextPrompt = `
Context about this ad:
- Brand: ${brandName}
- Product: ${product.title}
- Price: ₹${product.price}
- Template type: ${product.template}
- Target: Meta feed ads (mobile-first)

${VALIDATION_PROMPT}`;

  // Try each model in fallback chain
  for (const model of GEMINI_MODELS) {
    try {
      const result = await tryGeminiModel(model, apiKey, contextPrompt, base64Image, mimeType);
      if (result) {
        logger.info({ model }, '[Validator] Gemini analysis succeeded');
        return result;
      }
    } catch (err: any) {
      logger.warn({ model, error: err.message }, '[Validator] Model failed, trying next');
    }
  }

  logger.error('[Validator] All Gemini models failed, using fallback');
  return createFallbackScore();
}

async function tryGeminiModel(
  model: string,
  apiKey: string,
  prompt: string,
  base64Image: string,
  mimeType: string
): Promise<QualityScore | null> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Image,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('No response from Gemini');
  }

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON in Gemini response');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    overall: parsed.overall || 5,
    dimensions: {
      visualQuality: parsed.dimensions?.visualQuality || 5,
      premiumFeel: parsed.dimensions?.premiumFeel || 5,
      readability: parsed.dimensions?.readability || 5,
      emotionalImpact: parsed.dimensions?.emotionalImpact || 5,
      conversionClarity: parsed.dimensions?.conversionClarity || 5,
      productVisibility: parsed.dimensions?.productVisibility || 5,
      hookStrength: parsed.dimensions?.hookStrength || 5,
      compositionBalance: parsed.dimensions?.compositionBalance || 5,
      mobileFeedPerformance: parsed.dimensions?.mobileFeedPerformance || 5,
      originality: parsed.dimensions?.originality || 5,
      strategyAlignment: parsed.dimensions?.strategyAlignment || 5,
      brandConsistency: parsed.dimensions?.brandConsistency || 5,
      competitorBenchmark: parsed.dimensions?.competitorBenchmark || 5,
    },
    issues: parsed.issues || [],
    suggestions: parsed.suggestions || [],
  };
}
