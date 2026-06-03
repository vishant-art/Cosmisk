/**
 * Validator — comparative (pattern-based) validation against a client's
 * competitive set.
 */

import { readFile } from 'fs/promises';
import { logger } from '../../../utils/logger.js';
import type { ProductBrief } from '../types.js';
import { getClientPatterns } from '../../client-references.js';
import type { ExtractedPatterns } from '../../pattern-extractor.js';
import { GEMINI_MODELS } from './constants.js';
import { validateAd } from './standard.js';

/**
 * Comparative validation result
 */
export interface ComparativeValidationResult {
  approved: boolean;
  overallScore: number;

  // Pattern alignment scores (0-10)
  patternScores: {
    typographyMatch: number;
    layoutMatch: number;
    colorMatch: number;
    hookMatch: number;
    styleMatch: number;
    sophisticationMatch: number;
  };

  // Compared to benchmark
  meetsMinSophistication: boolean;
  meetsFeedNativeThreshold: boolean;
  hasRequiredElements: string[];
  hasProhibitedElements: string[];

  // Feedback
  critique: string;
  improvements: string[];

  // Reference comparison
  closestReference?: {
    pageName: string;
    similarityScore: number;
  };
}

/**
 * Validate an ad against client-specific patterns
 * This is COMPARATIVE validation - judging against the client's competitive set
 */
export async function validateAgainstPatterns(
  imagePath: string,
  clientId: string,
  options: {
    productBrief?: ProductBrief;
    brandName?: string;
  } = {}
): Promise<ComparativeValidationResult> {
  const patterns = getClientPatterns(clientId);

  if (!patterns) {
    logger.warn(`[Validator] No patterns for client ${clientId}, using standard validation`);
    // Fall back to standard validation
    const fallbackBrief: ProductBrief = {
      id: 'unknown',
      title: 'Unknown',
      handle: 'unknown',
      price: 0,
      originalPrice: null,
      discountPercent: 0,
      imageUrl: '',
      salesRank: 0,
      template: 'product-hero',
      copy: { headline: '', hook: '', cta: 'Shop Now' },
    };
    const standardResult = await validateAd({
      imagePath,
      productBrief: options.productBrief || fallbackBrief,
      brandName: options.brandName || 'Unknown',
      format: '1080x1080',
    });

    return {
      approved: standardResult.approved,
      overallScore: standardResult.score.overall,
      patternScores: {
        typographyMatch: 5,
        layoutMatch: 5,
        colorMatch: 5,
        hookMatch: 5,
        styleMatch: 5,
        sophisticationMatch: 5,
      },
      meetsMinSophistication: standardResult.score.dimensions.premiumFeel >= 5,
      meetsFeedNativeThreshold: standardResult.score.dimensions.mobileFeedPerformance >= 5,
      hasRequiredElements: [],
      hasProhibitedElements: [],
      critique: standardResult.critique || 'No patterns available for comparative validation',
      improvements: standardResult.score.suggestions || [],
    };
  }

  logger.info(`[Validator] Comparative validation for client ${clientId} against ${patterns.competitorsAnalyzed} competitors`);

  try {
    const imageBuffer = await readFile(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    const result = await analyzeComparatively(base64Image, mimeType, patterns, options);

    logger.info({
      clientId,
      approved: result.approved,
      overallScore: result.overallScore,
      sophistication: result.patternScores.sophisticationMatch,
    }, '[Validator] Comparative validation complete');

    return result;
  } catch (err: any) {
    logger.error({ error: err.message }, '[Validator] Comparative validation failed');

    return {
      approved: false,
      overallScore: 0,
      patternScores: {
        typographyMatch: 0,
        layoutMatch: 0,
        colorMatch: 0,
        hookMatch: 0,
        styleMatch: 0,
        sophisticationMatch: 0,
      },
      meetsMinSophistication: false,
      meetsFeedNativeThreshold: false,
      hasRequiredElements: [],
      hasProhibitedElements: [],
      critique: `Validation failed: ${err.message}`,
      improvements: ['Fix the error and retry'],
    };
  }
}

/**
 * Comparative analysis using Gemini
 */
async function analyzeComparatively(
  base64Image: string,
  mimeType: string,
  patterns: ExtractedPatterns,
  options: { productBrief?: ProductBrief; brandName?: string }
): Promise<ComparativeValidationResult> {
  const apiKey = process.env['GEMINI_API_KEY'] || process.env['GOOGLE_AI_API_KEY'];

  if (!apiKey) {
    logger.warn('[Validator] No Gemini API key for comparative validation');
    return createFallbackComparativeResult(patterns);
  }

  const prompt = buildComparativePrompt(patterns, options);

  for (const model of GEMINI_MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType, data: base64Image } },
              ],
            }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 2048,
            },
          }),
        }
      );

      if (!response.ok) continue;

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) continue;

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;

      const parsed = JSON.parse(jsonMatch[0]);

      // Calculate overall score from pattern matches
      const patternScores = {
        typographyMatch: parsed.typographyMatch || 5,
        layoutMatch: parsed.layoutMatch || 5,
        colorMatch: parsed.colorMatch || 5,
        hookMatch: parsed.hookMatch || 5,
        styleMatch: parsed.styleMatch || 5,
        sophisticationMatch: parsed.sophisticationMatch || 5,
      };

      const avgScore = Object.values(patternScores).reduce((a, b) => a + b, 0) / 6;

      // Check against benchmarks
      const meetsMinSophistication = patternScores.sophisticationMatch >= patterns.qualityBenchmark.minSophisticationScore;
      const meetsFeedNativeThreshold = patternScores.styleMatch >= (patterns.qualityBenchmark.minFeedNativeScore / 10);

      // Check required/prohibited elements
      const hasRequiredElements = (parsed.hasElements || []).filter((e: string) =>
        patterns.qualityBenchmark.mustHaveElements.includes(e)
      );
      const hasProhibitedElements = (parsed.hasElements || []).filter((e: string) =>
        patterns.qualityBenchmark.mustAvoidElements.includes(e)
      );

      // Determine approval
      const approved = avgScore >= 7.0 &&
        meetsMinSophistication &&
        meetsFeedNativeThreshold &&
        hasProhibitedElements.length === 0;

      return {
        approved,
        overallScore: avgScore,
        patternScores,
        meetsMinSophistication,
        meetsFeedNativeThreshold,
        hasRequiredElements,
        hasProhibitedElements,
        critique: parsed.critique || 'No critique provided',
        improvements: parsed.improvements || [],
        closestReference: parsed.closestReference,
      };
    } catch (err) {
      logger.warn({ model, error: String(err) }, '[Validator] Comparative model failed');
    }
  }

  return createFallbackComparativeResult(patterns);
}

/**
 * Build the comparative validation prompt
 */
function buildComparativePrompt(
  patterns: ExtractedPatterns,
  options: { productBrief?: ProductBrief; brandName?: string }
): string {
  const guidance = {
    typography: patterns.typography,
    layout: patterns.layout,
    colors: patterns.colors,
    visualStyle: patterns.visualStyle,
    hooks: {
      dominant: patterns.hooks.dominantHook,
      examples: patterns.hooks.hookTypes.slice(0, 2).flatMap(h => h.examples).slice(0, 3),
    },
    benchmark: patterns.qualityBenchmark,
    topCompetitors: patterns.topCompetitors.slice(0, 3),
  };

  return `You are an elite creative director comparing this ad against category benchmarks.

CONTEXT:
- Brand: ${options.brandName || 'Unknown'}
- Product: ${options.productBrief?.title || 'Unknown'}
- Category competitors: ${guidance.topCompetitors.join(', ')}

BENCHMARK PATTERNS (from ${patterns.adsAnalyzed} successful competitor ads):

Typography benchmark:
- Primary font style: ${guidance.typography.primaryFont}
- Headline weight: ${guidance.typography.headlineWeight}
- Text hierarchy: ${guidance.typography.textHierarchy}
- Text density: ${guidance.typography.textDensity}

Layout benchmark:
- Product placement: ${guidance.layout.productPlacement}
- Layout type: ${guidance.layout.layoutType}
- CTA position: ${guidance.layout.ctaPosition}
- Whitespace: ${guidance.layout.whitespaceUsage}

Color benchmark:
- Dominant colors: ${guidance.colors.dominantColors.join(', ')}
- Color mood: ${guidance.colors.mood}
- Background style: ${guidance.colors.backgroundStyle}

Style benchmark:
- Overall style: ${guidance.visualStyle.overallStyle}
- Min sophistication level: ${guidance.benchmark.minSophisticationScore}/5
- Min feed-native score: ${guidance.benchmark.minFeedNativeScore}/100

Hook benchmark:
- Dominant hook type: ${guidance.hooks.dominant}
- Examples: ${guidance.hooks.examples.join(' | ')}

REQUIRED elements: ${guidance.benchmark.mustHaveElements.join(', ') || 'none specified'}
PROHIBITED elements: ${guidance.benchmark.mustAvoidElements.join(', ')}

TASK: Compare this ad image against the benchmarks above.

Score how well the ad MATCHES each pattern (0-10):
- 10 = perfectly matches the category benchmark
- 7 = good match, competitive quality
- 5 = acceptable but generic
- 3 = poor match, below category standards
- 0 = completely off-brand

Return JSON:
{
  "typographyMatch": <0-10>,
  "layoutMatch": <0-10>,
  "colorMatch": <0-10>,
  "hookMatch": <0-10>,
  "styleMatch": <0-10>,
  "sophisticationMatch": <0-10>,
  "hasElements": ["list", "of", "detected", "elements"],
  "critique": "2-3 sentences comparing to category benchmark",
  "improvements": ["specific improvements to match benchmark"],
  "closestReference": { "pageName": "competitor name if similar", "similarityScore": <0-100> }
}

Be HARSH. A junior designer's template should score 3-4. Only ads that could compete with ${guidance.topCompetitors[0] || 'top brands'} should score 7+.`;
}

/**
 * Fallback result when Gemini unavailable
 */
function createFallbackComparativeResult(patterns: ExtractedPatterns): ComparativeValidationResult {
  return {
    approved: false,
    overallScore: 5,
    patternScores: {
      typographyMatch: 5,
      layoutMatch: 5,
      colorMatch: 5,
      hookMatch: 5,
      styleMatch: 5,
      sophisticationMatch: 5,
    },
    meetsMinSophistication: false,
    meetsFeedNativeThreshold: false,
    hasRequiredElements: [],
    hasProhibitedElements: [],
    critique: 'Comparative validation unavailable - manual review required against competitors: ' + patterns.topCompetitors.join(', '),
    improvements: ['Review manually against category benchmarks'],
  };
}
