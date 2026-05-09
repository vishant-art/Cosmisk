/**
 * Quality Gate — Cosmisk
 *
 * THE MANDATORY FILTER for all agent outputs.
 * Nothing reaches a client without passing through here.
 *
 * Core principle: "Would an experienced media buyer spending ₹30L+/month
 * already know this?" If yes, filter it out.
 *
 * Every output must:
 * 1. Synthesize 2+ signals (not just report one metric)
 * 2. Pass non-obviousness check
 * 3. Have strategic depth (explain WHY + WHAT TO DO)
 * 4. Be specific and actionable
 */

import { logger } from '../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface QualityCheckResult {
  passes: boolean;
  score: number; // 0-100
  reasons: string[];
  filtered?: string; // If filtered, why
}

export interface InsightInput {
  text: string;
  category?: string;
  basedOn?: string[]; // What signals contributed
  confidence?: number;
}

export interface DecisionInput {
  type: string;
  reasoning: string;
  suggestedAction: string;
  targetName: string;
  basedOn?: string[];
}

export interface QualityGateConfig {
  minScore: number; // 0-100, default 60
  requireSynthesis: boolean; // Must combine 2+ signals
  allowObvious: boolean; // If false, filter obvious insights
  strictMode: boolean; // If true, reject marginal cases
}

const DEFAULT_CONFIG: QualityGateConfig = {
  minScore: 60,
  requireSynthesis: true,
  allowObvious: false,
  strictMode: false,
};

// ============================================================================
// Obvious Pattern Detection
// ============================================================================

/**
 * Patterns that indicate "dashboard-level" observations
 * These are things any media buyer can see in Ads Manager
 */
const OBVIOUS_PATTERNS = [
  // Simple metric statements without WHY
  /^ctr\s+(has\s+)?(dropped|declined|decreased|increased)/i,
  /^cpa\s+(has\s+)?(increased|spiked|risen|dropped)/i,
  /^roas\s+(has\s+)?(dropped|declined|decreased|increased)/i,
  /^spend\s+(has\s+)?(increased|decreased)/i,
  /^frequency\s+(has\s+)?(increased|is\s+high)/i,
  /^impressions\s+(are\s+)?(down|up|declining)/i,
  /^conversions\s+(have\s+)?(dropped|declined)/i,

  // Generic observations
  /performance\s+(is\s+)?(declining|dropping|improving)/i,
  /campaign\s+(is\s+)?(underperforming|performing\s+poorly)/i,
  /below\s+breakeven/i,
  /above\s+target/i,
];

/**
 * Phrases that indicate generic/templated advice
 */
const GENERIC_PHRASES = [
  'consider testing',
  'you should try',
  'you might want to',
  'it might be worth',
  'generally speaking',
  'best practice',
  'typically',
  'we recommend',
  'consider exploring',
  'worth considering',
  'you may want to',
  'potentially',
  'could potentially',
  'it\'s possible that',
  'one option is to',
];

/**
 * Words that indicate vague/non-specific advice
 */
const VAGUE_WORDS = [
  'optimize',
  'leverage',
  'significant',
  'notable',
  'substantial',
  'considerable',
  'various',
  'several',
  'multiple',
  'numerous',
];

/**
 * Synthesis indicators — phrases that show multi-signal reasoning
 */
const SYNTHESIS_INDICATORS = [
  'because',
  'which means',
  'combined with',
  'while',
  'alongside',
  'in conjunction with',
  'at the same time',
  'correlates with',
  'suggests that',
  'indicates that',
  'when combined',
  'taken together',
  'this pattern',
  'historically',
  'based on',
];

// ============================================================================
// Core Quality Check Functions
// ============================================================================

/**
 * Check if text contains obvious patterns without synthesis
 */
function hasObviousPatternWithoutSynthesis(text: string): { isObvious: boolean; pattern?: string } {
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
function hasGenericPhrases(text: string): { hasGeneric: boolean; phrases: string[] } {
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
function hasExcessiveVagueWords(text: string): { isVague: boolean; words: string[] } {
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
function hasSynthesis(text: string, basedOn?: string[]): { hasSynthesis: boolean; score: number } {
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
function isSpecific(text: string): { isSpecific: boolean; score: number } {
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
function hasAdequateDepth(text: string): { hasDepth: boolean; score: number } {
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

// ============================================================================
// Main Quality Gate Functions
// ============================================================================

/**
 * Check a single insight for quality
 */
export function checkInsightQuality(
  insight: InsightInput,
  config: Partial<QualityGateConfig> = {},
): QualityCheckResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const reasons: string[] = [];
  let totalScore = 0;
  let checks = 0;

  // 1. Obvious pattern check
  const obvious = hasObviousPatternWithoutSynthesis(insight.text);
  if (obvious.isObvious && !cfg.allowObvious) {
    reasons.push(`Contains obvious pattern without synthesis: ${obvious.pattern}`);
    totalScore += 20;
  } else {
    totalScore += 80;
  }
  checks++;

  // 2. Generic phrases check
  const generic = hasGenericPhrases(insight.text);
  if (generic.hasGeneric) {
    reasons.push(`Contains generic phrases: ${generic.phrases.slice(0, 2).join(', ')}`);
    totalScore += 30;
  } else {
    totalScore += 90;
  }
  checks++;

  // 3. Vague words check
  const vague = hasExcessiveVagueWords(insight.text);
  if (vague.isVague) {
    reasons.push(`Too many vague words: ${vague.words.slice(0, 3).join(', ')}`);
    totalScore += 40;
  } else {
    totalScore += 90;
  }
  checks++;

  // 4. Synthesis check
  const synthesis = hasSynthesis(insight.text, insight.basedOn);
  if (cfg.requireSynthesis && !synthesis.hasSynthesis) {
    reasons.push('Does not synthesize multiple signals');
    totalScore += synthesis.score;
  } else {
    totalScore += synthesis.score || 80;
  }
  checks++;

  // 5. Specificity check
  const specific = isSpecific(insight.text);
  totalScore += specific.score;
  if (!specific.isSpecific) {
    reasons.push('Not specific enough (missing numbers, actions, or targets)');
  }
  checks++;

  // 6. Depth check
  const depth = hasAdequateDepth(insight.text);
  totalScore += depth.score;
  if (!depth.hasDepth) {
    reasons.push('Too brief for strategic insight');
  }
  checks++;

  // Calculate final score
  const finalScore = Math.round(totalScore / checks);
  const passes = finalScore >= cfg.minScore && (cfg.allowObvious || !obvious.isObvious);

  return {
    passes,
    score: finalScore,
    reasons,
    filtered: passes ? undefined : `Score ${finalScore} < min ${cfg.minScore}`,
  };
}

/**
 * Check a decision for quality
 */
export function checkDecisionQuality(
  decision: DecisionInput,
  config: Partial<QualityGateConfig> = {},
): QualityCheckResult {
  // Decisions are checked via their reasoning
  const insightResult = checkInsightQuality(
    { text: decision.reasoning, basedOn: decision.basedOn },
    config,
  );

  // Additional decision-specific checks
  const additionalReasons: string[] = [];

  // Check if action is specific
  const validActions = ['pause', 'reduce_budget', 'increase_budget', 'new_creative', 'monitor', 'test', 'scale', 'cut'];
  const hasValidAction = validActions.some(a => decision.suggestedAction.toLowerCase().includes(a));
  if (!hasValidAction) {
    additionalReasons.push('Suggested action is not specific');
  }

  // Check if target is named
  if (!decision.targetName || decision.targetName === 'Unknown' || decision.targetName.length < 3) {
    additionalReasons.push('Target is not specifically named');
  }

  // Adjust score based on decision-specific checks
  let adjustedScore = insightResult.score;
  if (additionalReasons.length > 0) {
    adjustedScore = Math.max(adjustedScore - (additionalReasons.length * 10), 0);
  }

  return {
    passes: insightResult.passes && additionalReasons.length === 0,
    score: adjustedScore,
    reasons: [...insightResult.reasons, ...additionalReasons],
    filtered: insightResult.filtered,
  };
}

/**
 * Filter an array of insights, keeping only those that pass quality gate
 */
export function filterInsights<T extends { reasoning?: string; text?: string; insight?: string }>(
  items: T[],
  config: Partial<QualityGateConfig> = {},
): { passed: T[]; filtered: T[]; stats: { total: number; passed: number; filtered: number } } {
  const passed: T[] = [];
  const filtered: T[] = [];

  for (const item of items) {
    const text = item.reasoning || item.text || item.insight || '';
    const result = checkInsightQuality({ text }, config);

    if (result.passes) {
      passed.push(item);
    } else {
      filtered.push(item);
      logger.debug({ text: text.slice(0, 100), reasons: result.reasons }, '[QualityGate] Filtered insight');
    }
  }

  return {
    passed,
    filtered,
    stats: {
      total: items.length,
      passed: passed.length,
      filtered: filtered.length,
    },
  };
}

/**
 * Filter decisions, keeping only strategic ones
 */
export function filterDecisions<T extends DecisionInput>(
  decisions: T[],
  config: Partial<QualityGateConfig> = {},
): { passed: T[]; filtered: T[]; stats: { total: number; passed: number; filtered: number } } {
  const passed: T[] = [];
  const filtered: T[] = [];

  for (const decision of decisions) {
    const result = checkDecisionQuality(decision, config);

    if (result.passes) {
      passed.push(decision);
    } else {
      filtered.push(decision);
      logger.debug({
        type: decision.type,
        target: decision.targetName,
        score: result.score,
        reasons: result.reasons,
      }, '[QualityGate] Filtered decision');
    }
  }

  return {
    passed,
    filtered,
    stats: {
      total: decisions.length,
      passed: passed.length,
      filtered: filtered.length,
    },
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

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

// ============================================================================
// Logging
// ============================================================================

logger.info('[QualityGate] Module loaded — all agent outputs will be filtered');
