/**
 * Inventory Velocity Predictor (stub).
 *
 * Production version predicts days-until-OOS per Shopify SKU using rolling
 * sales velocity. unified-agent-runner consumes the `criticalList` items
 * via `.productTitle`, `.daysUntilOOS`, `.avgDailySales`, `.currentInventory`.
 */

import { logger } from '../utils/logger.js';

export interface InventoryVelocityProduct {
  productId: string;
  productTitle: string;
  currentInventory: number;
  avgDailySales: number;
  daysUntilOOS: number | null;
}

export interface InventoryVelocityAnalysis {
  criticalList: InventoryVelocityProduct[];
  totalRevenueAtRisk: number;
}

export async function analyzeInventoryVelocity(userId: string): Promise<InventoryVelocityAnalysis | null> {
  logger.debug({ userId }, '[inventory-velocity-predictor] stub — returning null');
  return null;
}
