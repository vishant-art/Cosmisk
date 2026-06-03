/**
 * Learning Engine — TIER 2: Memory Pruning
 */

import { logger } from '../../utils/logger.js';
import type { ClientPlaybook } from './types.js';

const MAX_WINNING_PATTERNS = 20;
const MAX_LOSING_PATTERNS = 15;
const MAX_FATIGUE_PATTERNS = 10;
const MIN_SAMPLE_SIZE = 5;
const SIMILARITY_THRESHOLD = 0.8;

/**
 * Check if two patterns are similar (for deduplication)
 */
function areSimilarPatterns(p1: string, p2: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const n1 = normalize(p1);
  const n2 = normalize(p2);

  if (n1 === n2) return true;

  // Check if one contains the other
  if (n1.includes(n2) || n2.includes(n1)) return true;

  // Simple Jaccard similarity on words
  const words1 = new Set(p1.toLowerCase().split(/\s+/));
  const words2 = new Set(p2.toLowerCase().split(/\s+/));
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  const similarity = intersection.size / union.size;

  return similarity >= SIMILARITY_THRESHOLD;
}

/**
 * Prune playbook to prevent bloat
 * Removes low-value patterns, deduplicates similar ones, applies decay
 */
export function prunePlaybook(playbook: ClientPlaybook): ClientPlaybook {
  const pruned = { ...playbook };

  // 1. Apply decay to confidence and sort by value
  pruned.winningPatterns = playbook.winningPatterns
    .map(p => ({
      ...p,
      // Decay confidence based on implicit age (use lastUpdated as proxy)
      confidence: p.confidence, // Would need timestamp per pattern for proper decay
    }))
    // Filter low sample size
    .filter(p => p.sampleSize >= MIN_SAMPLE_SIZE)
    // Sort by value (LTV * sample size as proxy for value)
    .sort((a, b) => (b.avgLtv * b.sampleSize) - (a.avgLtv * a.sampleSize));

  // 2. Deduplicate similar patterns (keep higher value one)
  const dedupedWinners: typeof pruned.winningPatterns = [];
  for (const pattern of pruned.winningPatterns) {
    const isDuplicate = dedupedWinners.some(p => areSimilarPatterns(p.format, pattern.format));
    if (!isDuplicate) {
      dedupedWinners.push(pattern);
    }
  }
  pruned.winningPatterns = dedupedWinners.slice(0, MAX_WINNING_PATTERNS);

  // 3. Prune losing patterns
  pruned.losingPatterns = playbook.losingPatterns
    .filter(p => p.sampleSize >= MIN_SAMPLE_SIZE)
    .sort((a, b) => b.returnRate - a.returnRate)
    .slice(0, MAX_LOSING_PATTERNS);

  // 4. Prune fatigue patterns
  pruned.fatiguePatterns = playbook.fatiguePatterns
    .slice(0, MAX_FATIGUE_PATTERNS);

  // 5. Deduplicate audience insights arrays
  pruned.audienceInsights = {
    highLtvSources: [...new Set(playbook.audienceInsights.highLtvSources)].slice(0, 10),
    lowLtvSources: [...new Set(playbook.audienceInsights.lowLtvSources)].slice(0, 10),
    repeatBuyerCreatives: [...new Set(playbook.audienceInsights.repeatBuyerCreatives)].slice(0, 10),
    onePurchaseTrap: [...new Set(playbook.audienceInsights.onePurchaseTrap)].slice(0, 10),
  };

  const removedCount =
    (playbook.winningPatterns.length - pruned.winningPatterns.length) +
    (playbook.losingPatterns.length - pruned.losingPatterns.length);

  if (removedCount > 0) {
    logger.info({ clientId: playbook.clientId, removedCount }, '[LearningEngine] Pruned playbook');
  }

  return pruned;
}
