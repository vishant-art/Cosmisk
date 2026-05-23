/**
 * Placement Efficiency Analyzer (stub).
 *
 * Production version uses Meta placement breakdowns to flag wasteful
 * placements (e.g. Audience Network burning spend with no conversions).
 * unified-agent-runner reads `.wastefulPlacements` (count) and
 * `.wastedSpendEstimate`.
 */

import { logger } from '../utils/logger.js';

export interface PlacementEfficiencyAnalysis {
  wastefulPlacements: number;
  wastedSpendEstimate: number;
}

export async function analyzePlacementEfficiency(
  userId: string,
  accountId: string,
): Promise<PlacementEfficiencyAnalysis | null> {
  logger.debug({ userId, accountId }, '[placement-efficiency-analyzer] stub — returning null');
  return null;
}
