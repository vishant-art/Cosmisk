/**
 * Validator — combined validation (standard + comparative).
 */

import { logger } from '../../../utils/logger.js';
import type { ValidationInput, ValidationOutput } from '../types.js';
import { validateAd } from './standard.js';
import { validateAgainstPatterns, type ComparativeValidationResult } from './comparative.js';

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
