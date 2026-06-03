/**
 * Quality Gate — Convenience utility functions
 */

import { checkInsightQuality } from './core.js';

/**
 * Quick check: would an experienced buyer already know this?
 */
export function isObvious(text: string): boolean {
  const result = checkInsightQuality({ text }, { allowObvious: false });
  return !result.passes;
}

/**
 * Get a quality score for text (0-100)
 */
export function getQualityScore(text: string): number {
  const result = checkInsightQuality({ text });
  return result.score;
}

/**
 * Enhance text to make it pass quality gate (returns suggestions)
 */
export function getSuggestions(text: string): string[] {
  const result = checkInsightQuality({ text });
  const suggestions: string[] = [];

  if (result.reasons.includes('Does not synthesize multiple signals')) {
    suggestions.push('Add "because" or "which means" to connect to a second signal');
  }

  if (result.reasons.some(r => r.includes('obvious pattern'))) {
    suggestions.push('Add WHY this is happening, not just WHAT happened');
  }

  if (result.reasons.some(r => r.includes('generic phrases'))) {
    suggestions.push('Replace "consider testing" with specific action like "Test X in the next 48 hours"');
  }

  if (result.reasons.some(r => r.includes('Not specific'))) {
    suggestions.push('Add specific numbers, percentages, or campaign names');
  }

  if (result.reasons.some(r => r.includes('Too brief'))) {
    suggestions.push('Expand to explain the strategic reasoning (WHY this matters)');
  }

  return suggestions;
}
