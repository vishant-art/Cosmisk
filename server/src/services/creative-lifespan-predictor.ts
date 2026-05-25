/**
 * Creative Lifespan Predictor (stub).
 *
 * Production version models per-creative health (frequency, CTR decay, age)
 * and predicts days-until-dead. unified-agent-runner reads:
 *   .deadCreatives[]   → .adName, .adId, .healthReasons, .frequency, .ctr, .daysActive
 *   .needsRefresh[]    → .healthStatus, .estimatedDaysRemaining, .adName, .frequency
 *   .revenueAtRisk
 */

import { logger } from '../utils/logger.js';

export type CreativeHealthStatus = 'healthy' | 'dying' | 'dead';

export interface CreativeLifespanAd {
  adId: string;
  adName: string;
  frequency: number;
  ctr: number;
  daysActive: number;
  healthStatus: CreativeHealthStatus;
  healthReasons: string[];
  estimatedDaysRemaining: number | null;
}

export interface CreativeLifespanAnalysis {
  deadCreatives: CreativeLifespanAd[];
  needsRefresh: CreativeLifespanAd[];
  revenueAtRisk: number;
}

export async function analyzeCreativeLifespan(
  userId: string,
  accountId: string,
): Promise<CreativeLifespanAnalysis | null> {
  logger.debug({ userId, accountId }, '[creative-lifespan-predictor] stub — returning null');
  return null;
}
