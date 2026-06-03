/**
 * Quality Gate — Core text quality-check helpers
 */

import {
  GENERIC_PHRASES,
  OBVIOUS_PATTERNS,
  SYNTHESIS_INDICATORS,
  VAGUE_WORDS,
} from './constants.js';

/**
 * Check if text contains obvious patterns without synthesis
 */
export function hasObviousPatternWithoutSynthesis(text: string): { isObvious: boolean; pattern?: string } {
  const lowerText = text.toLowerCase();

  // Check for obvious patterns
  for (const pattern of OBVIOUS_PATTERNS) {
    if (pattern.test(text)) {
      // But allow if there's synthesis
      const hasSynthesis = SYNTHESIS_INDICATORS.some(ind => lowerText.includes(ind));
      if (!hasSynthesis) {
        return { isObvious: true, pattern: pattern.source };
      }
    }
  }

  return { isObvious: false };
}

/**
 * Check if text contains generic phrases
 */
export function hasGenericPhrases(text: string): { hasGeneric: boolean; phrases: string[] } {
  const lowerText = text.toLowerCase();
  const found: string[] = [];

  for (const phrase of GENERIC_PHRASES) {
    if (lowerText.includes(phrase)) {
      found.push(phrase);
    }
  }

  return { hasGeneric: found.length > 0, phrases: found };
}

/**
 * Check if text uses vague words excessively
 */
export function hasExcessiveVagueWords(text: string): { isVague: boolean; words: string[] } {
  const lowerText = text.toLowerCase();
  const found: string[] = [];

  for (const word of VAGUE_WORDS) {
    if (lowerText.includes(word)) {
      found.push(word);
    }
  }

  // More than 2 vague words = too vague
  return { isVague: found.length > 2, words: found };
}

/**
 * Check if text has synthesis (combines multiple signals)
 */
export function hasSynthesis(text: string, basedOn?: string[]): { hasSynthesis: boolean; score: number } {
  // If basedOn is provided and has 2+ signals, that's explicit synthesis
  if (basedOn && basedOn.length >= 2) {
    return { hasSynthesis: true, score: 100 };
  }

  // Check for synthesis indicators in text
  const lowerText = text.toLowerCase();
  let indicatorCount = 0;

  for (const indicator of SYNTHESIS_INDICATORS) {
    if (lowerText.includes(indicator)) {
      indicatorCount++;
    }
  }

  // Score based on indicators found
  const score = Math.min(indicatorCount * 30, 100);
  return { hasSynthesis: indicatorCount >= 1, score };
}

/**
 * Check if text is specific (has numbers, names, concrete actions)
 */
export function isSpecific(text: string): { isSpecific: boolean; score: number } {
  const checks = {
    hasNumbers: /\d+/.test(text),
    hasPercentages: /%|percent/i.test(text),
    hasCurrency: /₹|\$|rs\.?|inr/i.test(text),
    hasTimeframe: /day|week|month|hour|48\s*h|72\s*h/i.test(text),
    hasConcreteAction: /pause|scale|increase|decrease|test|launch|cut|shift|reallocate/i.test(text),
    hasSpecificTarget: /"[^"]+"/.test(text), // Quoted names
  };

  const trueCount = Object.values(checks).filter(Boolean).length;
  const score = (trueCount / 6) * 100;

  return { isSpecific: trueCount >= 2, score };
}

/**
 * Check text length — too short usually means not strategic
 */
export function hasAdequateDepth(text: string): { hasDepth: boolean; score: number } {
  const wordCount = text.split(/\s+/).length;

  if (wordCount < 15) {
    return { hasDepth: false, score: 20 };
  } else if (wordCount < 30) {
    return { hasDepth: true, score: 60 };
  } else if (wordCount < 60) {
    return { hasDepth: true, score: 80 };
  } else {
    return { hasDepth: true, score: 100 };
  }
}
