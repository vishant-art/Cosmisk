/**
 * Quality Validation Agent
 * Uses Gemini vision to analyze and score generated ads
 *
 * Persona: Senior art director, premium brand designer,
 * conversion-focused creative lead, brutally critical reviewer
 *
 * ----------------------------------------------------------------------------
 * BARREL: This file was decomposed into focused modules under ./validator/.
 * It re-exports the exact original public surface so importers are unaffected.
 * Shared constants (thresholds, prompts, Gemini model chain) live in a single
 * source: ./validator/constants.ts.
 * ----------------------------------------------------------------------------
 */

// Standard single-ad and batch validation
export { validateAd, validateBatch } from './validator/standard.js';

// Multi-round validation with template-switch retry
export { validateWithRetry, validateBatchWithRetry } from './validator/retry.js';

// Score helpers / summaries
export { summarizeScores } from './validator/scoring.js';

// Shared constants (re-exported for backward compatibility)
export { QUALITY_THRESHOLD, MAX_ITERATIONS } from './validator/constants.js';

// Comparative (pattern-based) validation
export type { ComparativeValidationResult } from './validator/comparative.js';
export { validateAgainstPatterns } from './validator/comparative.js';

// Combined validation (standard + comparative)
export { validateFull } from './validator/full.js';
