/**
 * OOS Detector - Watchdog integration
 *
 * Quick OOS check returning a simplified result for decision-making.
 */

import { logger } from '../../utils/logger.js';
import { detectOOSAds } from './detect-oos-ads.js';
import { detectCatalogOOS } from './detect-catalog-oos.js';
import { detectEnhancedOOS } from './enhanced-oos.js';
import type { OOSWatchdogResult, RunOOSCheckOptions } from './types.js';

// ============ WATCHDOG INTEGRATION ============

/**
 * Quick OOS check for Watchdog integration
 * Returns simplified result for decision-making
 *
 * Detection modes:
 * 1. Enhanced (catalogId + shopify): Uses async reports with product_id breakdown + Shopify verification
 * 2. Catalog only: Checks catalog for OOS products + DPA ad status
 * 3. Name-based: Fuzzy matches ad text to OOS product titles
 */
export async function runOOSCheck(options: RunOOSCheckOptions): Promise<OOSWatchdogResult> {
  try {
    const hasShopify = !!(options.shopDomain && options.shopifyToken);
    const hasCatalog = !!options.catalogId;

    // Use enhanced detection when catalog + shopify available (the gold standard)
    if (hasCatalog && hasShopify) {
      return runEnhancedOOSCheck(options);
    }

    // Fallback: Run name-based detection
    const report = await detectOOSAds(options);

    let hasIssues = report.totalWastedSpend > 100; // Threshold: Rs 100
    const topMatches = report.matches.slice(0, 5);
    let catalogOOS: OOSWatchdogResult['catalogOOS'];

    // Also run catalog detection if catalogId provided (without Shopify verification)
    if (hasCatalog) {
      try {
        const catalogReport = await detectCatalogOOS({
          catalogId: options.catalogId!,
          metaAccountId: options.metaAccountId,
          metaToken: options.metaToken,
        });

        catalogOOS = {
          oosCount: catalogReport.oosCount,
          oosRate: catalogReport.oosRate,
          hasCatalogAds: catalogReport.hasCatalogAds,
        };

        // If catalog has OOS products AND catalog ads are running, flag as issue
        if (catalogReport.oosCount > 0 && catalogReport.hasCatalogAds) {
          hasIssues = true;
        }
      } catch (err: any) {
        logger.warn({ err: err.message }, '[OOS Detector] Catalog check failed, continuing');
      }
    }

    let summary = '';
    if (report.oosAdsFound === 0 && (!catalogOOS || catalogOOS.oosCount === 0)) {
      summary = 'No OOS issues detected.';
    } else {
      const parts: string[] = [];

      if (report.oosAdsFound > 0) {
        parts.push(`${report.oosAdsFound} ads on OOS products (Rs ${report.totalWastedSpend.toFixed(0)} wasted)`);
      }

      if (catalogOOS && catalogOOS.oosCount > 0 && catalogOOS.hasCatalogAds) {
        parts.push(`${catalogOOS.oosCount} OOS products in catalog (${catalogOOS.oosRate.toFixed(1)}%) with active DPA ads`);
      }

      summary = parts.join('. ');
    }

    return {
      hasIssues,
      wastedSpend: report.totalWastedSpend,
      verifiedWastedSpend: 0, // Not verified without Shopify
      topMatches,
      summary,
      catalogOOS,
    };
  } catch (err: any) {
    logger.error({ err: err.message }, '[OOS Detector] Check failed');
    return {
      hasIssues: false,
      wastedSpend: 0,
      verifiedWastedSpend: 0,
      topMatches: [],
      summary: `OOS check failed: ${err.message}`,
    };
  }
}

/**
 * Enhanced OOS check with per-product spend and Shopify verification
 * This is the most accurate method - verifies wasted spend against actual Shopify orders
 */
async function runEnhancedOOSCheck(options: RunOOSCheckOptions): Promise<OOSWatchdogResult> {
  logger.info('[OOS Detector] Running enhanced detection with Shopify verification');

  const enhancedReport = await detectEnhancedOOS({
    catalogId: options.catalogId!,
    metaAccountId: options.metaAccountId,
    metaToken: options.metaToken,
    shopDomain: options.shopDomain,
    shopifyToken: options.shopifyToken,
    days: options.days || 7,
  });

  // Build top wasted products for the enhanced result
  const topWasted = enhancedReport.products
    .filter(p => p.verifiedWasted)
    .slice(0, 10)
    .map(p => ({
      productId: p.productId,
      productName: p.productName,
      wastedSpend: p.wastedSpend,
      shopifyOrders: p.shopifyOrders,
    }));

  // Determine if there are issues worth alerting
  // Primary metric: verified wasted spend (confirmed no Shopify sales)
  const hasIssues = enhancedReport.verifiedWastedSpend > 100; // Rs 100 threshold

  // Build summary
  let summary = '';
  if (enhancedReport.totalOOSProducts === 0) {
    summary = 'No OOS products found with active ads.';
  } else if (enhancedReport.verifiedWastedSpend === 0) {
    summary = `${enhancedReport.totalOOSProducts} OOS products with ads, but all had Shopify sales (likely Meta pixel sync issue).`;
  } else {
    const pctVerified = ((enhancedReport.productsNoSales / enhancedReport.totalOOSProducts) * 100).toFixed(0);
    summary = `${enhancedReport.productsNoSales} products with Rs ${enhancedReport.verifiedWastedSpend.toFixed(0)} verified wasted spend (${pctVerified}% of ${enhancedReport.totalOOSProducts} OOS products).`;

    if (enhancedReport.productsWithShopifySales > 0) {
      summary += ` Note: ${enhancedReport.productsWithShopifySales} products had Shopify sales despite 0 Meta purchases (pixel sync issue).`;
    }
  }

  return {
    hasIssues,
    wastedSpend: enhancedReport.totalAdSpend,
    verifiedWastedSpend: enhancedReport.verifiedWastedSpend,
    topMatches: [], // Enhanced mode doesn't use ad-level matching
    summary,
    catalogOOS: {
      oosCount: enhancedReport.totalOOSProducts,
      oosRate: 0, // We don't have total catalog count in enhanced mode
      hasCatalogAds: true, // Implied by having OOS products with spend
    },
    enhanced: {
      totalOOSProducts: enhancedReport.totalOOSProducts,
      productsWithShopifySales: enhancedReport.productsWithShopifySales,
      productsNoSales: enhancedReport.productsNoSales,
      topWasted,
    },
  };
}
