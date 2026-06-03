/**
 * Learning Engine — TIER 2: Signal Decay System
 */

/**
 * Calculate decay factor based on data age
 * 7d = 100%, 30d = 70%, 90d = 40%, 180d+ = 20%
 */
export function calculateDecayFactor(timestamp: string | Date): number {
  const ageMs = Date.now() - new Date(timestamp).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  if (ageDays <= 7) return 1.0;
  if (ageDays <= 30) return 0.7 + (0.3 * (1 - (ageDays - 7) / 23));
  if (ageDays <= 90) return 0.4 + (0.3 * (1 - (ageDays - 30) / 60));
  if (ageDays <= 180) return 0.2 + (0.2 * (1 - (ageDays - 90) / 90));
  return 0.2; // Minimum weight for very old data
}

/**
 * Apply decay to a confidence score
 */
export function applyDecay(confidence: number, timestamp: string | Date): number {
  const decayFactor = calculateDecayFactor(timestamp);
  return Math.round(confidence * decayFactor);
}
