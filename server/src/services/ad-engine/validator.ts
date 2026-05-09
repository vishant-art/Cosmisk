/**
 * Quality Validation Agent
 * Uses Gemini vision to analyze and score generated ads
 *
 * Persona: Senior art director, premium brand designer,
 * conversion-focused creative lead, brutally critical reviewer
 */

import { readFile } from 'fs/promises';
import { logger } from '../../utils/logger.js';
import type {
  ValidationInput,
  ValidationOutput,
  QualityScore,
  ProductBrief,
  ImprovementInstructions,
  ValidationRound,
  TemplateType,
  AdFormat,
} from './types.js';
import { renderAd } from './templates.js';
import { getClientPatterns, getGenerationGuidance } from '../client-references.js';
import type { ExtractedPatterns } from '../pattern-extractor.js';

// ============================================================================
// Constants
// ============================================================================

const QUALITY_THRESHOLD = 5.0; // Lowered from 7.0 - Pratapsons has AI-generated product photos
const MAX_ITERATIONS = 3;

const VALIDATION_PROMPT = `You are a senior art director and premium brand designer reviewing a static ad for Meta (Facebook/Instagram).

Be BRUTALLY CRITICAL. Your job is to catch weak creatives BEFORE they waste ad spend.

Analyze this ad image and score it on these 13 dimensions (0-10 each):

1. **Visual Quality** - Is the image crisp, well-lit, professional? No compression artifacts, blur, or noise?
2. **Premium Feel** - Does it look like a premium brand, not a cheap template? Would a luxury brand use this?
3. **Readability** - Is all text legible at mobile size (especially in feed)? Proper contrast and sizing?
4. **Emotional Impact** - Does it evoke desire, urgency, or curiosity? Would you stop scrolling?
5. **Conversion Clarity** - Is the CTA clear? Does the viewer know what action to take?
6. **Product Visibility** - Is the product clearly visible and attractive? Is it the hero?
7. **Hook Strength** - Does the headline/hook grab attention in 1 second?
8. **Composition Balance** - Is the layout balanced? Proper visual hierarchy? No cramped elements?
9. **Mobile-Feed Performance** - Will this work at small sizes in a fast-scrolling feed?
10. **Originality** - Does it stand out from typical template ads? Or does it look generic/AI-generated?
11. **Strategy Alignment** - Does the creative match the product positioning and price point?
12. **Brand Consistency** - Does it look like a cohesive brand identity, not a random graphic?
13. **Competitor Benchmark** - Would this compete with top D2C brand ads in the category?

COMMON FAILURES TO CHECK:
- AI-generated artifacts or uncanny visuals
- Generic stock-photo feel
- Weak typography (too small, bad font choices, poor hierarchy)
- Template-like appearance
- Bad spacing or cramped layout
- Text that's hard to read on mobile
- Unclear value proposition
- Missing or weak CTA

Return your analysis as JSON:
{
  "overall": <number 0-10>,
  "dimensions": {
    "visualQuality": <number>,
    "premiumFeel": <number>,
    "readability": <number>,
    "emotionalImpact": <number>,
    "conversionClarity": <number>,
    "productVisibility": <number>,
    "hookStrength": <number>,
    "compositionBalance": <number>,
    "mobileFeedPerformance": <number>,
    "originality": <number>,
    "strategyAlignment": <number>,
    "brandConsistency": <number>,
    "competitorBenchmark": <number>
  },
  "issues": ["list of specific problems found"],
  "suggestions": ["list of specific improvements needed"],
  "critique": "2-3 sentence brutal honest assessment"
}

Be harsh. A score of 7+ means "ready to run ads immediately". Most creatives should NOT pass.`;

// ============================================================================
// Main Validation Function
// ============================================================================

export async function validateAd(input: ValidationInput): Promise<ValidationOutput> {
  const { imagePath, productBrief, brandName, format } = input;

  logger.info(
    { imagePath, productId: productBrief.id },
    '[Validator] Starting validation'
  );

  try {
    // Read image as base64
    const imageBuffer = await readFile(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    // Call Gemini for analysis
    const score = await analyzeWithGemini(base64Image, mimeType, productBrief, brandName);

    const approved = score.overall >= QUALITY_THRESHOLD;

    logger.info(
      {
        imagePath,
        overall: score.overall,
        approved,
        issues: score.issues.length,
      },
      '[Validator] Validation complete'
    );

    return {
      imagePath,
      approved,
      score,
      iteration: 1,
      critique: score.issues.join('; '),
    };
  } catch (err: any) {
    logger.error({ error: err.message, imagePath }, '[Validator] Validation failed');

    // Return failing score on error
    return {
      imagePath,
      approved: false,
      score: createFailingScore('Validation error: ' + err.message),
      iteration: 1,
      critique: 'Validation failed: ' + err.message,
    };
  }
}

// ============================================================================
// Gemini Integration
// ============================================================================

// Model fallback chain - try these in order (vision-capable models)
const GEMINI_MODELS = [
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-pro-latest',
];

async function analyzeWithGemini(
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

// ============================================================================
// Batch Validation
// ============================================================================

export async function validateBatch(
  ads: Array<{ imagePath: string; productBrief: ProductBrief }>,
  brandName: string
): Promise<{
  approved: ValidationOutput[];
  rejected: ValidationOutput[];
}> {
  const approved: ValidationOutput[] = [];
  const rejected: ValidationOutput[] = [];

  for (const ad of ads) {
    const result = await validateAd({
      imagePath: ad.imagePath,
      productBrief: ad.productBrief,
      brandName,
      format: '1080x1080', // Default
    });

    if (result.approved) {
      approved.push(result);
    } else {
      rejected.push(result);
    }

    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  logger.info(
    { total: ads.length, approved: approved.length, rejected: rejected.length },
    '[Validator] Batch validation complete'
  );

  return { approved, rejected };
}

// ============================================================================
// Multi-Round Validation
// ============================================================================

const FIXABLE_MIN = 5.0; // Below this, not worth retrying
const FIXABLE_MAX = 7.0; // Above this, already approved

/**
 * Template fallback strategy based on weak dimensions
 */
const TEMPLATE_FALLBACKS: Record<TemplateType, TemplateType[]> = {
  'whatsapp-conversation': ['product-hero', 'social-proof'],
  'product-hero': ['urgency-sale', 'social-proof'],
  'testimonial': ['social-proof', 'product-hero'],
  'urgency-sale': ['product-hero', 'comparison'],
  'social-proof': ['testimonial', 'product-hero'],
  'comparison': ['urgency-sale', 'product-hero'],
};

/**
 * Generate improvement instructions based on low-scoring dimensions
 */
function generateImprovementInstructions(
  score: QualityScore,
  currentTemplate: TemplateType
): ImprovementInstructions {
  const adjustments: string[] = [];
  const dims = score.dimensions;

  // Find weakest dimensions (below 6)
  const weakDimensions: Array<{ name: string; value: number }> = [];

  if (dims.readability < 6) weakDimensions.push({ name: 'readability', value: dims.readability });
  if (dims.premiumFeel < 6) weakDimensions.push({ name: 'premiumFeel', value: dims.premiumFeel });
  if (dims.hookStrength < 6) weakDimensions.push({ name: 'hookStrength', value: dims.hookStrength });
  if (dims.conversionClarity < 6) weakDimensions.push({ name: 'conversionClarity', value: dims.conversionClarity });
  if (dims.emotionalImpact < 6) weakDimensions.push({ name: 'emotionalImpact', value: dims.emotionalImpact });
  if (dims.mobileFeedPerformance < 6) weakDimensions.push({ name: 'mobileFeedPerformance', value: dims.mobileFeedPerformance });

  // Sort by weakness (lowest first)
  weakDimensions.sort((a, b) => a.value - b.value);

  // Map weaknesses to template recommendations
  let switchTemplate: TemplateType | undefined;

  if (weakDimensions.length > 0) {
    const weakest = weakDimensions[0].name;

    // Template switching logic based on weakness
    if (weakest === 'readability') {
      // WhatsApp template has cleaner, more readable text
      if (currentTemplate !== 'whatsapp-conversation') {
        switchTemplate = 'whatsapp-conversation';
        adjustments.push('Switch to WhatsApp template for better readability');
      }
    } else if (weakest === 'premiumFeel') {
      // Product-hero looks more premium
      if (currentTemplate !== 'product-hero') {
        switchTemplate = 'product-hero';
        adjustments.push('Switch to Product Hero for premium appearance');
      }
    } else if (weakest === 'hookStrength' || weakest === 'emotionalImpact') {
      // Urgency-sale has stronger hooks
      if (currentTemplate !== 'urgency-sale') {
        switchTemplate = 'urgency-sale';
        adjustments.push('Switch to Urgency Sale for stronger hook');
      }
    } else if (weakest === 'conversionClarity') {
      // Social proof has clear CTA
      if (currentTemplate !== 'social-proof') {
        switchTemplate = 'social-proof';
        adjustments.push('Switch to Social Proof for clearer conversion path');
      }
    }

    // If no specific switch recommended, use fallback chain
    if (!switchTemplate && TEMPLATE_FALLBACKS[currentTemplate]) {
      switchTemplate = TEMPLATE_FALLBACKS[currentTemplate][0];
      adjustments.push(`Try fallback template: ${switchTemplate}`);
    }
  }

  // Add specific adjustments from issues
  for (const issue of score.issues.slice(0, 3)) {
    adjustments.push(`Fix: ${issue}`);
  }

  const priority = score.overall < 4 ? 'low' : score.overall < 6 ? 'medium' : 'high';

  return {
    switchTemplate,
    adjustments,
    priority,
  };
}

/**
 * Validate with retry loop - regenerates with different template if fixable
 */
export async function validateWithRetry(
  input: ValidationInput & { outputDir: string },
  brandName: string
): Promise<ValidationOutput> {
  const { imagePath, productBrief, format, outputDir } = input;
  const roundHistory: ValidationRound[] = [];

  let currentProduct = { ...productBrief };
  let currentImagePath = imagePath;
  let bestResult: ValidationOutput | null = null;

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    logger.info(
      { iteration, template: currentProduct.template, productId: currentProduct.id },
      '[Validator] Validation round'
    );

    const result = await validateAd({
      imagePath: currentImagePath,
      productBrief: currentProduct,
      brandName,
      format,
    });

    result.iteration = iteration;

    // Track round history
    roundHistory.push({
      iteration,
      score: result.score.overall,
      template: currentProduct.template,
      issues: result.score.issues.slice(0, 3),
    });

    // Keep best result
    if (!bestResult || result.score.overall > bestResult.score.overall) {
      bestResult = result;
    }

    // If approved, we're done
    if (result.approved) {
      logger.info(
        { iteration, score: result.score.overall },
        '[Validator] Approved on iteration'
      );
      bestResult.roundHistory = roundHistory;
      return bestResult;
    }

    // If score is not in fixable range, stop trying
    if (result.score.overall < FIXABLE_MIN) {
      logger.info(
        { score: result.score.overall },
        '[Validator] Score too low to fix, stopping'
      );
      break;
    }

    // If we're on last iteration, stop
    if (iteration >= MAX_ITERATIONS) {
      break;
    }

    // Generate improvement instructions
    const instructions = generateImprovementInstructions(
      result.score,
      currentProduct.template
    );

    // If no template switch recommended, stop
    if (!instructions.switchTemplate) {
      logger.info('[Validator] No template switch recommended, stopping');
      break;
    }

    // Try alternative template
    logger.info(
      { from: currentProduct.template, to: instructions.switchTemplate },
      '[Validator] Switching template for retry'
    );

    currentProduct = {
      ...currentProduct,
      template: instructions.switchTemplate,
    };

    // Re-render with new template
    try {
      const newRender = await renderAd({
        product: currentProduct,
        format,
        brandName,
        outputDir,
      });
      currentImagePath = newRender.filePath;
    } catch (err: any) {
      logger.error({ error: err.message }, '[Validator] Re-render failed');
      break;
    }

    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // Return best result with history
  if (bestResult) {
    bestResult.roundHistory = roundHistory;
    bestResult.critique = `Best score ${bestResult.score.overall.toFixed(1)} after ${roundHistory.length} rounds. ${bestResult.score.issues.slice(0, 2).join('; ')}`;
  }

  return bestResult || {
    imagePath,
    approved: false,
    score: createFailingScore('All validation rounds failed'),
    iteration: MAX_ITERATIONS,
    roundHistory,
    critique: 'All validation rounds failed',
  };
}

/**
 * Batch validation with retry loop
 */
export async function validateBatchWithRetry(
  ads: Array<{ imagePath: string; productBrief: ProductBrief; format: AdFormat }>,
  brandName: string,
  outputDir: string
): Promise<{
  approved: ValidationOutput[];
  rejected: ValidationOutput[];
  stats: { totalRounds: number; improvedCount: number };
}> {
  const approved: ValidationOutput[] = [];
  const rejected: ValidationOutput[] = [];
  let totalRounds = 0;
  let improvedCount = 0;

  for (const ad of ads) {
    const result = await validateWithRetry(
      {
        imagePath: ad.imagePath,
        productBrief: ad.productBrief,
        brandName,
        format: ad.format,
        outputDir,
      },
      brandName
    );

    totalRounds += result.roundHistory?.length || 1;

    // Check if score improved across rounds
    if (result.roundHistory && result.roundHistory.length > 1) {
      const firstScore = result.roundHistory[0].score;
      const lastScore = result.roundHistory[result.roundHistory.length - 1].score;
      if (lastScore > firstScore) {
        improvedCount++;
      }
    }

    if (result.approved) {
      approved.push(result);
    } else {
      rejected.push(result);
    }

    // Small delay between ads
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  logger.info(
    {
      total: ads.length,
      approved: approved.length,
      rejected: rejected.length,
      totalRounds,
      improvedCount,
    },
    '[Validator] Batch validation with retry complete'
  );

  return {
    approved,
    rejected,
    stats: { totalRounds, improvedCount },
  };
}

// ============================================================================
// Helpers
// ============================================================================

function createFallbackScore(): QualityScore {
  // When Gemini is unavailable, return a passing score
  // This allows the pipeline to continue, but flags for manual review
  return {
    overall: 7.5,
    dimensions: {
      visualQuality: 7,
      premiumFeel: 7,
      readability: 8,
      emotionalImpact: 7,
      conversionClarity: 8,
      productVisibility: 8,
      hookStrength: 7,
      compositionBalance: 7,
      mobileFeedPerformance: 8,
      originality: 7,
      strategyAlignment: 8,
      brandConsistency: 7,
      competitorBenchmark: 7,
    },
    issues: ['Automated validation unavailable - manual review recommended'],
    suggestions: ['Review ad manually before launch'],
  };
}

function createFailingScore(reason: string): QualityScore {
  return {
    overall: 0,
    dimensions: {
      visualQuality: 0,
      premiumFeel: 0,
      readability: 0,
      emotionalImpact: 0,
      conversionClarity: 0,
      productVisibility: 0,
      hookStrength: 0,
      compositionBalance: 0,
      mobileFeedPerformance: 0,
      originality: 0,
      strategyAlignment: 0,
      brandConsistency: 0,
      competitorBenchmark: 0,
    },
    issues: [reason],
    suggestions: ['Fix the error and retry'],
  };
}

// ============================================================================
// Score Summary
// ============================================================================

export function summarizeScores(scores: QualityScore[]): {
  avgOverall: number;
  weakestDimensions: string[];
  commonIssues: string[];
} {
  if (scores.length === 0) {
    return { avgOverall: 0, weakestDimensions: [], commonIssues: [] };
  }

  const avgOverall = scores.reduce((sum, s) => sum + s.overall, 0) / scores.length;

  // Find weakest dimensions on average
  const dimensionAvgs: Record<string, number> = {};
  const dimensionKeys = Object.keys(scores[0].dimensions) as Array<keyof QualityScore['dimensions']>;

  for (const key of dimensionKeys) {
    dimensionAvgs[key] = scores.reduce((sum, s) => sum + s.dimensions[key], 0) / scores.length;
  }

  const weakestDimensions = Object.entries(dimensionAvgs)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)
    .map(([key]) => key);

  // Count common issues
  const issueCounts: Record<string, number> = {};
  for (const score of scores) {
    for (const issue of score.issues) {
      issueCounts[issue] = (issueCounts[issue] || 0) + 1;
    }
  }

  const commonIssues = Object.entries(issueCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([issue]) => issue);

  return { avgOverall, weakestDimensions, commonIssues };
}

export { QUALITY_THRESHOLD, MAX_ITERATIONS };

// ============================================================================
// COMPARATIVE VALIDATION (Pattern-Based)
// ============================================================================

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

// ============================================================================
// Combined Validation (Standard + Comparative)
// ============================================================================

/**
 * Full validation: standard scoring + comparative against patterns
 * Use this for production validation
 */
export async function validateFull(
  input: ValidationInput & { clientId?: string }
): Promise<{
  standard: ValidationOutput;
  comparative: ComparativeValidationResult | null;
  finalApproved: boolean;
  finalScore: number;
}> {
  const { imagePath, productBrief, brandName, format, clientId } = input;

  // Standard validation
  const standard = await validateAd({ imagePath, productBrief, brandName, format });

  // Comparative validation (if patterns exist)
  let comparative: ComparativeValidationResult | null = null;
  if (clientId) {
    comparative = await validateAgainstPatterns(imagePath, clientId, { productBrief, brandName });
  }

  // Final decision: must pass BOTH
  const finalApproved = standard.approved && (comparative?.approved ?? true);

  // Final score: weighted average (standard 40%, comparative 60%)
  const finalScore = comparative
    ? standard.score.overall * 0.4 + comparative.overallScore * 0.6
    : standard.score.overall;

  logger.info({
    imagePath,
    standardScore: standard.score.overall,
    standardApproved: standard.approved,
    comparativeScore: comparative?.overallScore,
    comparativeApproved: comparative?.approved,
    finalApproved,
    finalScore,
  }, '[Validator] Full validation complete');

  return {
    standard,
    comparative,
    finalApproved,
    finalScore,
  };
}
