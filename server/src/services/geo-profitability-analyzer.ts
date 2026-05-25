/**
 * Geo Profitability Analyzer (stub).
 *
 * Production version combines Shopify shipping costs + revenue per city to
 * surface unprofitable geographies. unified-agent-runner reads
 * `result.cities[].profitabilityScore` and `.city`.
 */

import { logger } from '../utils/logger.js';

export interface GeoProfitabilityCity {
  city: string;
  profitabilityScore: number; // 0..100
  revenue: number;
  shippingCost: number;
}

export interface GeoProfitabilityAnalysis {
  cities: GeoProfitabilityCity[];
}

export async function analyzeGeoProfitability(userId: string): Promise<GeoProfitabilityAnalysis | null> {
  logger.debug({ userId }, '[geo-profitability-analyzer] stub — returning null');
  return null;
}
