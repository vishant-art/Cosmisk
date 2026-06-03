/* ------------------------------------------------------------------ */
/*  Creative Performance Scorer                                        */
/*  5-dimension algorithmic scorer — zero Claude calls.                */
/*  "Every ad you make, makes your next ad better."                    */
/* ------------------------------------------------------------------ */
/*                                                                      */
/*  BARREL: decomposed into focused modules under ./creative-scorer/.   */
/*  Re-exports the exact original public surface so importers are       */
/*  unaffected.                                                         */
/* ------------------------------------------------------------------ */

// Public types
export type {
  CreativeScoreInput,
  ScoreDimension,
  CreativeScore,
  ClientCreativeScoreReport,
} from './creative-scorer/types.js';

// Main scoring function
export { scoreCreative } from './creative-scorer/scorer.js';

// Accuracy stats + feedback loop
export {
  getAccuracyStats,
  resolveScorePredictions,
} from './creative-scorer/predictions.js';

// Client-aware scoring
export { scoreCreativesForClient } from './creative-scorer/client-scoring.js';

// HTML report generation
export { generateCreativeScorerHTMLReport } from './creative-scorer/html-report.js';
