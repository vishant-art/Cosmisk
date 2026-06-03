/**
 * Competitor Creative Intelligence Agent — Cosmisk
 *
 * Deep analysis of competitor ads from Meta Ad Library.
 * Tracks ad longevity, extracts creative patterns, and generates
 * actionable recommendations for DTC brands.
 *
 * Features:
 * 1. Deep creative analysis (hooks, CTAs, offers, formats)
 * 2. Longevity tracking (ads running 30+ days = profitable)
 * 3. Pattern extraction across competitors
 * 4. Searchable creative database
 * 5. Actionable recommendations
 * 6. Brand URL → Auto-discover competitors
 * 7. Creative format classification (before/after, founder, podcast, UGC, etc.)
 *
 * ──────────────────────────────────────────────────────────────────────────
 * BARREL FILE: this module was decomposed into focused sub-modules under
 * ./competitor-creative-intel/. The original public surface is re-exported
 * verbatim here so existing importers keep working unchanged.
 * ──────────────────────────────────────────────────────────────────────────
 */

// ============ TYPES ============
export type {
  CreativeAnalysis,
  CompetitorProfile,
  CreativeIntelReport,
  BrandContext,
  DiscoveredCompetitor,
  DiscoveryResult,
  CreativeFormatDetailed,
  ClientIntelReport,
} from './competitor-creative-intel/types.js';

// ============ BRAND CONTEXT & COMPETITOR DISCOVERY ============
export {
  extractBrandContext,
  discoverCompetitors,
} from './competitor-creative-intel/brand-context.js';

// ============ REPORT RUNNERS & FORMATTING ============
export {
  runCompetitorCreativeIntel,
  runCompetitorIntelFromDiscovery,
  formatCreativeIntelReport,
  runCompetitorCreativeIntelBulk,
  runCompetitorIntelForClient,
} from './competitor-creative-intel/reports.js';
