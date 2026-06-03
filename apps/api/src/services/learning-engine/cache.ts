/**
 * Learning Engine — Cache Management
 *
 * Owns the module-level guidance cache singleton. This state lives in exactly
 * one module so it is shared across all importers.
 */

import { logger } from '../../utils/logger.js';
import { generateCreativeGuidance } from './engine.js';
import type { CreativeGuidance } from './types.js';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const guidanceCache = new Map<string, { data: CreativeGuidance; timestamp: number }>();

/**
 * Get cached guidance or generate fresh
 */
export async function getCreativeGuidanceCached(clientId: string): Promise<CreativeGuidance> {
  const cached = guidanceCache.get(clientId);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    logger.debug({ clientId }, '[LearningEngine] Returning cached guidance');
    return cached.data;
  }

  const fresh = await generateCreativeGuidance(clientId);
  guidanceCache.set(clientId, { data: fresh, timestamp: Date.now() });
  return fresh;
}

/**
 * Invalidate cache for a client (call after significant data changes)
 */
export function invalidateGuidanceCache(clientId: string): void {
  guidanceCache.delete(clientId);
  logger.debug({ clientId }, '[LearningEngine] Cache invalidated');
}
