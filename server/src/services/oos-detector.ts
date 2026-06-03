/**
 * OOS Detector - Cross-Platform Intelligence
 *
 * Matches out-of-stock Shopify products to active Meta ads
 * to identify wasted ad spend.
 *
 * Enhanced with:
 * - Per-product spend via Meta async reports (breakdowns=product_id)
 * - Shopify order verification to confirm true wasted spend
 * - Stockout timeline analysis
 *
 * Ported from Agency-automation-smashed CrossAnalyzer
 *
 * ---
 * This module was decomposed into focused sub-modules under ./oos-detector/.
 * This file is a thin barrel that re-exports the original public surface so
 * existing importers keep working unchanged.
 */

// ============ TYPES ============
export type {
  OOSAdMatch,
  OOSReport,
  CatalogOOSProduct,
  CatalogOOSReport,
  ProductSpendData,
  ShopifySalesData,
  EnhancedOOSProduct,
  EnhancedOOSReport,
  EnhancedOOSOptions,
  OOSWatchdogResult,
  ClientOOSReport,
} from './oos-detector/types.js';

// ============ NAME-BASED AD DETECTION ============
export { detectOOSAds } from './oos-detector/detect-oos-ads.js';

// ============ CATALOG-BASED OOS DETECTION ============
export { detectCatalogOOS } from './oos-detector/detect-catalog-oos.js';

// ============ ENHANCED (PRODUCT-LEVEL) OOS DETECTION ============
export { detectEnhancedOOS } from './oos-detector/enhanced-oos.js';

// ============ WATCHDOG INTEGRATION ============
export { runOOSCheck } from './oos-detector/watchdog.js';

// ============ CLIENT-AWARE OOS DETECTION ============
export { runOOSCheckForClient } from './oos-detector/client-check.js';

// ============ HTML REPORT GENERATION ============
export { generateOOSReport } from './oos-detector/report.js';
