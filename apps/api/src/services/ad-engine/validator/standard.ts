/**
 * Validator — standard single-ad and batch validation.
 */

import { readFile } from 'fs/promises';
import { logger } from '../../../utils/logger.js';
import type { ValidationInput, ValidationOutput, ProductBrief } from '../types.js';
import { QUALITY_THRESHOLD } from './constants.js';
import { analyzeWithGemini } from './gemini.js';
import { createFailingScore } from './scoring.js';

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
