/**
 * Gemini Creative Generator
 * Uses Gemini API to generate premium creative concepts
 */

import sharp from 'sharp';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../../utils/logger.js';
import {
  selectConcept,
  generateGeminiPrompt,
  recordValidationResult,
  PREMIUM_CONCEPTS,
  type CreativeConcept,
} from './creative-intelligence.js';
import type { ProductBrief, AdFormat, RenderOutput, TemplateType } from './types.js';

// ============================================================================
// Gemini API Configuration
// ============================================================================

const GEMINI_API_KEY = process.env['GEMINI_API_KEY'] || process.env['GOOGLE_AI_API_KEY'];

// Available image generation models (in order of preference)
const IMAGEN_MODELS = [
  'imagen-4.0-fast-generate-001', // Fast, good quality
  'imagen-4.0-generate-001',       // Standard
];

const GEMINI_IMAGE_MODELS = [
  'gemini-2.5-flash-image',        // Flash with image output
  'gemini-3.1-flash-image-preview', // Newer preview
];

interface GeminiImageResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: {
          mimeType: string;
          data: string; // base64
        };
        text?: string;
      }>;
    };
  }>;
  error?: {
    message: string;
    code: number;
  };
}

// ============================================================================
// Image Generation
// ============================================================================

/**
 * Generate a creative ad using Gemini image generation
 *
 * Strategy: Generate visual concept with Imagen (no text), then overlay text with Sharp
 * This avoids AI text rendering issues (typos, wrong prices)
 */
export async function generateCreativeAd(
  product: ProductBrief,
  brandName: string,
  outputDir: string,
  format: AdFormat = '1080x1080',
  usedConcepts: string[] = []
): Promise<RenderOutput | null> {
  if (!GEMINI_API_KEY) {
    logger.warn('[GeminiGen] No API key, falling back to templates');
    return null;
  }

  // Select best concept for this product
  const { concept, score, reason } = selectConcept(product, usedConcepts);

  // If concept is "sharp-product-hero", skip Gemini and let Sharp handle it
  // Fashion products need real product photos, not AI-generated images
  if (concept.name === 'sharp-product-hero') {
    logger.info(
      { product: product.title, reason },
      '[GeminiGen] Skipping - product requires real photo (Sharp template)'
    );
    return null;
  }

  logger.info(
    { product: product.title, concept: concept.name, score, reason },
    '[GeminiGen] Selected concept'
  );

  // Generate prompt - request NO TEXT to avoid AI text rendering issues
  const { prompt, negativePrompt, aspectRatio } = generateGeminiPrompt(
    product,
    concept,
    brandName,
    format
  );

  // For now, let Imagen handle text rendering - it often does well
  // Only overlay if Imagen fails to include text
  const fullPrompt = prompt;
  const fullNegative = negativePrompt;

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }

  try {
    // Call Gemini image generation - let Imagen handle text rendering
    const imageBuffer = await callGeminiImageGen(fullPrompt, fullNegative, aspectRatio);

    if (!imageBuffer) {
      logger.warn({ product: product.title }, '[GeminiGen] Generation failed, no image returned');
      return null;
    }

    // Save image directly - Imagen handles text well
    const filename = `${product.handle}-${concept.name}-${format}.jpg`;
    const outputPath = join(outputDir, filename);
    await writeFile(outputPath, imageBuffer);

    logger.info(
      { product: product.title, concept: concept.name, path: outputPath },
      '[GeminiGen] Generated creative'
    );

    return {
      productId: product.id,
      template: mapConceptToTemplate(concept.name),
      format,
      filePath: outputPath,
      fileSize: imageBuffer.length,
      generatedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    logger.error(
      { product: product.title, error: err.message },
      '[GeminiGen] Generation failed'
    );
    return null;
  }
}

/**
 * Call Gemini image generation API with fallback chain
 */
async function callGeminiImageGen(
  prompt: string,
  negativePrompt: string,
  aspectRatio: string
): Promise<Buffer | null> {
  // Try Imagen 4 first (best quality)
  for (const model of IMAGEN_MODELS) {
    const result = await callImagenAPI(model, prompt, negativePrompt, aspectRatio);
    if (result) return result;
  }

  // Fallback to Gemini multimodal image generation
  for (const model of GEMINI_IMAGE_MODELS) {
    const result = await callGeminiImageModel(model, prompt, aspectRatio);
    if (result) return result;
  }

  logger.warn('[GeminiGen] All image generation models failed');
  return null;
}

/**
 * Call Imagen API (predict endpoint)
 */
async function callImagenAPI(
  model: string,
  prompt: string,
  negativePrompt: string,
  aspectRatio: string
): Promise<Buffer | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${GEMINI_API_KEY}`;

  const body = {
    instances: [
      {
        prompt: `${prompt}\n\nAvoid: ${negativePrompt}`,
      },
    ],
    parameters: {
      sampleCount: 1,
      aspectRatio: aspectRatio,
      personGeneration: 'allow_adult',
      safetyFilterLevel: 'block_few',
    },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.warn({ model, status: response.status }, '[GeminiGen] Imagen model unavailable');
      return null;
    }

    const data = await response.json();

    if (data.predictions?.[0]?.bytesBase64Encoded) {
      logger.info({ model }, '[GeminiGen] Image generated with Imagen');
      return Buffer.from(data.predictions[0].bytesBase64Encoded, 'base64');
    }

    return null;
  } catch (err: any) {
    logger.warn({ model, error: err.message }, '[GeminiGen] Imagen request failed');
    return null;
  }
}

/**
 * Call Gemini image model (generateContent endpoint with image output)
 */
async function callGeminiImageModel(
  model: string,
  prompt: string,
  aspectRatio: string
): Promise<Buffer | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const body = {
    contents: [
      {
        parts: [
          {
            text: `Generate a high-quality advertising image: ${prompt}`,
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
    },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      logger.warn({ model, status: response.status }, '[GeminiGen] Gemini image model unavailable');
      return null;
    }

    const data: GeminiImageResponse = await response.json();

    // Find image in response
    for (const candidate of data.candidates || []) {
      for (const part of candidate.content?.parts || []) {
        if (part.inlineData?.data) {
          logger.info({ model }, '[GeminiGen] Image generated with Gemini');
          return Buffer.from(part.inlineData.data, 'base64');
        }
      }
    }

    return null;
  } catch (err: any) {
    logger.warn({ model, error: err.message }, '[GeminiGen] Gemini image request failed');
    return null;
  }
}

// ============================================================================
// Text Overlay (Sharp-based for accuracy)
// ============================================================================

const FORMAT_DIMENSIONS: Record<AdFormat, { width: number; height: number }> = {
  '1080x1080': { width: 1080, height: 1080 },
  '1080x1920': { width: 1080, height: 1920 },
  '1200x628': { width: 1200, height: 628 },
};

/**
 * Overlay accurate text on Imagen-generated visual using Sharp
 */
async function overlayTextOnImage(
  inputPath: string,
  outputPath: string,
  product: ProductBrief,
  brandName: string,
  concept: CreativeConcept,
  format: AdFormat
): Promise<void> {
  const { width, height } = FORMAT_DIMENSIONS[format];

  // Format price and discount
  const price = `₹${product.price.toLocaleString('en-IN')}`;
  const discount = product.discountPercent > 0 ? `${product.discountPercent}% OFF` : '';
  const originalPrice = product.originalPrice
    ? `₹${product.originalPrice.toLocaleString('en-IN')}`
    : '';

  // Calculate safe zones (Meta UI avoidance)
  const safeTop = Math.round(height * 0.08);
  const safeBottom = Math.round(height * 0.85);

  // Build text overlay SVG based on concept
  let textSvg: string;

  switch (concept.name) {
    case 'playing-card':
      textSvg = `
        <svg width="${width}" height="${height}">
          <defs>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="2" dy="2" stdDeviation="3" flood-opacity="0.5"/>
            </filter>
          </defs>
          <!-- Brand name top center -->
          <text x="${width / 2}" y="${safeTop + 30}" text-anchor="middle"
                font-family="Georgia, serif" font-size="32" font-weight="500"
                fill="white" filter="url(#shadow)">${escapeXml(brandName)}</text>
          <!-- Tagline -->
          <text x="${width / 2}" y="${safeTop + 70}" text-anchor="middle"
                font-family="Arial, sans-serif" font-size="24" font-weight="600"
                fill="white" filter="url(#shadow)">THIS IS WORTH IT</text>
          <!-- Price bottom center -->
          <text x="${width / 2}" y="${safeBottom}" text-anchor="middle"
                font-family="Georgia, serif" font-size="56" font-weight="700"
                fill="white" filter="url(#shadow)">${price}</text>
          ${discount ? `
          <text x="${width / 2}" y="${safeBottom - 50}" text-anchor="middle"
                font-family="Arial, sans-serif" font-size="28" font-weight="600"
                fill="#C9A050" filter="url(#shadow)">${discount}</text>` : ''}
        </svg>
      `;
      break;

    case 'whatsapp-authentic':
      // For WhatsApp, keep the visual clean - text is part of the concept
      textSvg = `
        <svg width="${width}" height="${height}">
          <defs>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="1" dy="1" stdDeviation="2" flood-opacity="0.3"/>
            </filter>
          </defs>
          <!-- Brand badge bottom left -->
          <rect x="30" y="${safeBottom - 30}" width="180" height="50" rx="8" fill="rgba(0,0,0,0.7)"/>
          <text x="40" y="${safeBottom + 5}"
                font-family="Arial, sans-serif" font-size="18" font-weight="600"
                fill="white">${escapeXml(brandName)}</text>
          <!-- Price bottom right -->
          <text x="${width - 40}" y="${safeBottom}" text-anchor="end"
                font-family="Georgia, serif" font-size="42" font-weight="700"
                fill="white" filter="url(#shadow)">${price}</text>
          ${discount ? `
          <rect x="${width - 140}" y="${safeBottom - 70}" width="100" height="30" rx="4" fill="#C9A050"/>
          <text x="${width - 90}" y="${safeBottom - 50}" text-anchor="middle"
                font-family="Arial, sans-serif" font-size="16" font-weight="700"
                fill="black">${discount}</text>` : ''}
        </svg>
      `;
      break;

    case 'phone-call-ui':
      textSvg = `
        <svg width="${width}" height="${height}">
          <defs>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="2" dy="2" stdDeviation="3" flood-opacity="0.4"/>
            </filter>
          </defs>
          <!-- Tagline top -->
          <text x="${width / 2}" y="${safeTop + 50}" text-anchor="middle"
                font-family="Arial, sans-serif" font-size="36" font-weight="600"
                fill="black">A new you is calling...</text>
          <!-- Brand -->
          <text x="${width / 2}" y="${safeTop + 100}" text-anchor="middle"
                font-family="Georgia, serif" font-size="28"
                fill="#666">${escapeXml(brandName)}</text>
          <!-- Price -->
          <text x="${width / 2}" y="${safeBottom - 80}" text-anchor="middle"
                font-family="Georgia, serif" font-size="48" font-weight="700"
                fill="black">${price}</text>
        </svg>
      `;
      break;

    default:
      // Generic overlay for other concepts
      textSvg = `
        <svg width="${width}" height="${height}">
          <defs>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="2" dy="2" stdDeviation="3" flood-opacity="0.5"/>
            </filter>
          </defs>
          <!-- Brand top center -->
          <text x="${width / 2}" y="${safeTop + 40}" text-anchor="middle"
                font-family="Georgia, serif" font-size="32" font-weight="500"
                fill="white" filter="url(#shadow)">${escapeXml(brandName)}</text>
          ${discount ? `
          <text x="${width / 2}" y="${safeTop + 80}" text-anchor="middle"
                font-family="Arial, sans-serif" font-size="26" font-weight="600"
                fill="#C9A050" filter="url(#shadow)">${discount}</text>` : ''}
          <!-- Price bottom -->
          <text x="${width / 2}" y="${safeBottom}" text-anchor="middle"
                font-family="Georgia, serif" font-size="52" font-weight="700"
                fill="white" filter="url(#shadow)">${price}</text>
          ${originalPrice ? `
          <text x="${width / 2}" y="${safeBottom + 35}" text-anchor="middle"
                font-family="Arial, sans-serif" font-size="22"
                fill="rgba(255,255,255,0.6)" text-decoration="line-through">${originalPrice}</text>` : ''}
        </svg>
      `;
  }

  // Composite text onto image
  await sharp(inputPath)
    .resize(width, height, { fit: 'cover' })
    .composite([
      { input: Buffer.from(textSvg), top: 0, left: 0 },
    ])
    .jpeg({ quality: 95 })
    .toFile(outputPath);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================================
// Batch Generation
// ============================================================================

/**
 * Generate multiple creatives with concept variety
 */
export async function generateCreativeBatch(
  products: ProductBrief[],
  brandName: string,
  outputDir: string,
  formats: AdFormat[] = ['1080x1080']
): Promise<RenderOutput[]> {
  const results: RenderOutput[] = [];
  const usedConcepts: string[] = [];

  for (const product of products) {
    for (const format of formats) {
      const result = await generateCreativeAd(
        product,
        brandName,
        outputDir,
        format,
        usedConcepts
      );

      if (result) {
        results.push(result);

        // Track used concept for variety
        const conceptMatch = selectConcept(product, []);
        usedConcepts.push(conceptMatch.concept.name);

        // Reset after using all concepts
        if (usedConcepts.length >= PREMIUM_CONCEPTS.length) {
          usedConcepts.length = 0;
        }
      }
    }
  }

  logger.info(
    { total: products.length, generated: results.length },
    '[GeminiGen] Batch generation complete'
  );

  return results;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map concept name to TemplateType for compatibility
 */
function mapConceptToTemplate(conceptName: string): TemplateType {
  const mapping: Record<string, TemplateType> = {
    'playing-card': 'comparison',
    'phone-call-ui': 'social-proof',
    'whatsapp-authentic': 'whatsapp-conversation',
    'ingredient-mascots': 'testimonial',
    'product-pour': 'product-hero',
    'problem-visualization': 'urgency-sale',
    'free-gift-bundle': 'comparison',
    'minimal-product-hero': 'product-hero',
  };

  return mapping[conceptName] || 'product-hero';
}

/**
 * Check if Gemini image generation is available
 */
export function isGeminiAvailable(): boolean {
  return !!GEMINI_API_KEY;
}

// ============================================================================
// Exports
// ============================================================================

export { mapConceptToTemplate };
