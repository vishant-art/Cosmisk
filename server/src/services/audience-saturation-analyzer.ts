/**
 * Audience Saturation Analyzer (stub).
 *
 * Production version reads Meta frequency / reach / CPM trends to flag
 * exhausted audiences. unified-agent-runner consumes `criticalList[]` with
 * .adsetName, .frequency, .spend, .cpm, .saturationReasons, .adsetId.
 */

import { logger } from '../utils/logger.js';

export interface SaturatedAdset {
  adsetId: string;
  adsetName: string;
  frequency: number;
  spend: number;
  cpm: number;
  saturationReasons: string[];
}

export interface AudienceSaturationAnalysis {
  criticalList: SaturatedAdset[];
  wastedSpendEstimate: number;
}

export async function analyzeAudienceSaturation(
  userId: string,
  accountId: string,
): Promise<AudienceSaturationAnalysis | null> {
  logger.debug({ userId, accountId }, '[audience-saturation-analyzer] stub — returning null');
  return null;
}
