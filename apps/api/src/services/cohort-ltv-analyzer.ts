/**
 * Cohort LTV Analyzer — Cosmisk
 *
 * Analyzes customer Lifetime Value (LTV) by acquisition source using UTM data.
 * Unlike ltv-by-creative-analyzer which uses order tags, this uses UTM parameters
 * from note_attributes (captured by GoKwik/checkout).
 *
 * Key insights:
 * - LTV by Channel: "Google customers worth ₹587 more than Meta customers"
 * - Repeat Rate by Channel: "Google has 16% repeat vs Meta's 12%"
 * - LTV-adjusted CPA: True acquisition cost considering customer lifetime value
 * - Monthly Cohort Retention: How cohorts perform over time
 *
 * This is cross-platform intelligence that neither Meta nor Shopify shows alone.
 *
 * ----------------------------------------------------------------------------
 * BARREL MODULE: This file was decomposed into focused modules under
 * ./cohort-ltv-analyzer/. It re-exports the original public surface so that
 * existing importers continue to work unchanged.
 */

// Types
export type {
  AcquisitionSource,
  ChannelMetrics,
  MonthlyCohort,
  CohortLTVAnalysis,
  ActionableRecommendation,
  CohortLTVQuickCheck,
  ClientCohortLTVReport,
} from './cohort-ltv-analyzer/types.js';

// Main analysis, quick check, client-aware analysis
export {
  analyzeCohortLTV,
  quickCohortLTVCheck,
  analyzeCohortLTVForClient,
} from './cohort-ltv-analyzer/analyze.js';

// Recommendations
export { generateActionableRecommendations } from './cohort-ltv-analyzer/recommendations.js';

// Formatted output
export {
  formatCohortLTVReport,
  generateCohortLTVHTMLReport,
} from './cohort-ltv-analyzer/formatting.js';
