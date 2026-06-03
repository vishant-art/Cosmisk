/**
 * Validator — multi-round validation with template-switch retry.
 */

import { logger } from '../../../utils/logger.js';
import type {
  ValidationInput,
  ValidationOutput,
  QualityScore,
  ProductBrief,
  ImprovementInstructions,
  ValidationRound,
  TemplateType,
  AdFormat,
} from '../types.js';
import { renderAd } from '../templates.js';
import { MAX_ITERATIONS, FIXABLE_MIN, TEMPLATE_FALLBACKS } from './constants.js';
import { validateAd } from './standard.js';
import { createFailingScore } from './scoring.js';

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
