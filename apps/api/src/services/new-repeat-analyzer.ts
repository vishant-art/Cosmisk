/**
 * New vs Repeat Analyzer (stub).
 *
 * Production version segments Shopify customers into new-vs-repeat cohorts
 * and flags accounts where conversion attribution is misleading (e.g. ads
 * acquiring lots of existing customers). Until that's wired, the stub
 * returns null so unified-agent-runner skips the finding block.
 */

import { logger } from '../utils/logger.js';

export interface NewRepeatAnalysis {
  isHighRepeat: boolean;
  repeatPercentage: number;
  estimatedWasteIfProspecting: number;
}

export async function analyzeNewVsRepeat(userId: string): Promise<NewRepeatAnalysis | null> {
  logger.debug({ userId }, '[new-repeat-analyzer] stub — returning null');
  return null;
}
