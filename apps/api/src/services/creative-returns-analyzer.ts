/**
 * Creative Returns Analyzer (stub).
 *
 * Production version cross-references Shopify return reasons with the
 * utm_campaign that acquired the customer, surfacing creatives that
 * over-promise. unified-agent-runner reads
 * `.highReturnCampaigns[].returnRate / .utmCampaign / .refundedAmount`.
 */

import { logger } from '../utils/logger.js';

export interface ReturningCampaign {
  utmCampaign: string;
  returnRate: number;
  refundedAmount: number;
}

export interface CreativeReturnsAnalysis {
  highReturnCampaigns: ReturningCampaign[];
}

export async function analyzeCreativeReturns(userId: string): Promise<CreativeReturnsAnalysis | null> {
  logger.debug({ userId }, '[creative-returns-analyzer] stub — returning null');
  return null;
}
