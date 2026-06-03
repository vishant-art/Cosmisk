/**
 * Operator Experience — shared module-level state.
 *
 * The in-memory prediction store is a singleton: it MUST live in exactly one
 * module so every importer shares the same Map instance (would be DB in
 * production). Do not duplicate this elsewhere.
 */

import type { TrackedPrediction } from './types.js';

/**
 * In-memory prediction store (would be DB in production)
 */
export const predictionStore = new Map<string, TrackedPrediction[]>();
