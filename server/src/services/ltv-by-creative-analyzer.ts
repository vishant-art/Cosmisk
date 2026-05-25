/**
 * LTV-by-Creative Analyzer (stub).
 *
 * Production version groups Shopify customers by acquisition utm_source /
 * utm_campaign and computes LTV per cohort. unified-agent-runner reads
 *   .worstCohorts[] / .bestCohorts[] →
 *      .acquisitionSource, .acquisitionCampaign, .avgLTV, .ltvVsAverage, .repeatRate
 */

import { logger } from '../utils/logger.js';

export interface LTVCohort {
  acquisitionSource: string;
  acquisitionCampaign: string;
  avgLTV: number;
  ltvVsAverage: number;
  repeatRate: number;
}

export interface LTVByCreativeAnalysis {
  worstCohorts: LTVCohort[];
  bestCohorts: LTVCohort[];
}

export async function analyzeLTVByCreative(userId: string): Promise<LTVByCreativeAnalysis | null> {
  logger.debug({ userId }, '[ltv-by-creative-analyzer] stub — returning null');
  return null;
}
