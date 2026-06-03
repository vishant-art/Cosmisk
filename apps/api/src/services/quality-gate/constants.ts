/**
 * Quality Gate — shared module-level constants/config (single source of truth)
 */

import type { QualityGateConfig } from './types.js';

export const DEFAULT_CONFIG: QualityGateConfig = {
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
export const OBVIOUS_PATTERNS = [
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
export const GENERIC_PHRASES = [
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
export const VAGUE_WORDS = [
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
export const SYNTHESIS_INDICATORS = [
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

/**
 * Contradictory action pairs — if both exist for same target, it's a conflict
 */
export const CONTRADICTORY_ACTIONS: Array<[string[], string[]]> = [
  [['pause', 'cut', 'stop'], ['scale', 'increase_budget', 'boost']],
  [['reduce_budget', 'decrease'], ['increase_budget', 'raise']],
  [['disable', 'turn_off'], ['enable', 'turn_on', 'activate']],
];
