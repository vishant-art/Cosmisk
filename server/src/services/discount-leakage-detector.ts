/**
 * Discount Leakage Detector - Cross-Platform Intelligence
 *
 * Scrapes coupon aggregator sites for leaked discount codes
 * and cross-references with Shopify discount codes to calculate
 * revenue impact from unauthorized code sharing.
 *
 * Part of The Bridge Service intelligence stack.
 */

import { logger } from '../utils/logger.js';
import { notifyAlert } from './notifications.js';
import { safeFetch, safeJson } from '../utils/safe-fetch.js';
import {
  getClient, getClientContext,
  getDiscountLeakageStore, updateDiscountLeakageStore, getDiscountLeakageAlertThreshold,
  createRecommendation, type ServiceClient,
} from './service-clients.js';

// ============ TYPES ============

export interface ScrapedCoupon {
  code: string;
  description: string;
  expiryDate?: string;
  sourceUrl: string;
  sourceSite: string;
  scrapedAt: string;
}

export interface ShopifyDiscount {
  id: string;
  code: string;
  priceRuleId: string;
  valueType: 'percentage' | 'fixed_amount';
  value: number;
  usageCount: number;
  createdAt: string;
  endsAt?: string;
  targetType: 'all' | 'entitled_products';
  title?: string;
}

export interface LeakedCode {
  code: string;
  shopifyDiscount: ShopifyDiscount;
  sources: ScrapedCoupon[];
  estimatedImpact: {
    ordersAffected: number;
    revenueLeaked: number;
    avgDiscountAmount: number;
  };
}

export interface LeakageReport {
  capturedAt: string;
  shopDomain: string;
  totalCodesScraped: number;
  totalShopifyDiscounts: number;
  leakedCodes: LeakedCode[];
  totalRevenueLeakage: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface CouponSiteConfig {
  name: string;
  urlTemplate: string; // {brand} will be replaced
  selectors: {
    codeContainer: string;
    code: string;
    description: string;
    expiry?: string;
  };
}

// ============ COUPON SITE CONFIGURATIONS ============

const COUPON_SITES: CouponSiteConfig[] = [
  {
    name: 'CouponDunia',
    urlTemplate: 'https://www.coupondunia.in/{brand}-coupons',
    selectors: {
      codeContainer: '.coupon-card, .offer-card',
      code: '.coupon-code, .code-text, [data-code]',
      description: '.coupon-title, .offer-desc',
      expiry: '.expiry-date, .validity',
    },
  },
  {
    name: 'GrabOn',
    urlTemplate: 'https://www.grabon.in/{brand}-coupons',
    selectors: {
      codeContainer: '.coupon-item, .deal-item',
      code: '.coupon-code, .code',
      description: '.coupon-title, .title',
      expiry: '.expiry',
    },
  },
  {
    name: 'CouponRani',
    urlTemplate: 'https://couponrani.com/{brand}',
    selectors: {
      codeContainer: '.coupon-box, .offer-box',
      code: '.code, .coupon-code',
      description: '.title, .desc',
      expiry: '.expiry',
    },
  },
  {
    name: 'CouponCode',
    urlTemplate: 'https://www.couponcode.in/{brand}',
    selectors: {
      codeContainer: '.coupon',
      code: '.code',
      description: '.description',
      expiry: '.expire',
    },
  },
  {
    name: 'DesiDime',
    urlTemplate: 'https://www.desidime.com/stores/{brand}',
    selectors: {
      codeContainer: '.deal-item',
      code: '.code',
      description: '.deal-title',
      expiry: '.expiry',
    },
  },
];

const SHOPIFY_API_VERSION = '2024-01';

// ============ SCRAPING FUNCTIONS ============

/**
 * Normalize brand name for URL construction
 */
function normalizeBrandName(brandName: string): string {
  return brandName
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-');
}

/**
 * Extract coupon codes from raw HTML using regex patterns
 * This is a fallback when proper parsing isn't available
 */
function extractCodesFromHtml(html: string, sourceSite: string, sourceUrl: string): ScrapedCoupon[] {
  const codes: ScrapedCoupon[] = [];
  const seenCodes = new Set<string>();

  // Common coupon code patterns
  // Uppercase alphanumeric, 4-20 chars, often with numbers
  const codePatterns = [
    // Explicit code labels
    /(?:code|coupon|promo)[:\s]*["']?([A-Z0-9]{4,20})["']?/gi,
    // Data attributes
    /data-code=["']([A-Z0-9]{4,20})["']/gi,
    // Clipboard copy elements
    /data-clipboard-text=["']([A-Z0-9]{4,20})["']/gi,
    // Common code-styled elements
    /class="[^"]*code[^"]*"[^>]*>([A-Z0-9]{4,20})</gi,
    // Standalone codes (less reliable)
    /\b([A-Z]{2,}[0-9]{2,}[A-Z0-9]*)\b/g,
  ];

  for (const pattern of codePatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const code = match[1].toUpperCase();
      // Filter out common false positives
      if (
        code.length >= 4 &&
        code.length <= 20 &&
        !seenCodes.has(code) &&
        !/^(HTTP|HTTPS|WWW|JSON|HTML|CSS|TRUE|FALSE|NULL)$/i.test(code)
      ) {
        seenCodes.add(code);
        codes.push({
          code,
          description: 'Extracted from page',
          sourceUrl,
          sourceSite,
          scrapedAt: new Date().toISOString(),
        });
      }
    }
  }

  return codes;
}

/**
 * Scrape a single coupon site for a brand's discount codes
 */
async function scrapeCouponSite(
  site: CouponSiteConfig,
  brandName: string,
): Promise<ScrapedCoupon[]> {
  const normalizedBrand = normalizeBrandName(brandName);
  const url = site.urlTemplate.replace('{brand}', normalizedBrand);

  try {
    logger.info({ url }, `Scraping ${site.name} for ${brandName}`);

    const response = await safeFetch(url, {
      service: `CouponScraper-${site.name}`,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CosmiskBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      logger.warn(`${site.name} returned ${response.status} for ${brandName}`);
      return [];
    }

    const html = await response.text();
    const codes = extractCodesFromHtml(html, site.name, url);

    logger.info(`Found ${codes.length} codes on ${site.name} for ${brandName}`);
    return codes;
  } catch (error) {
    logger.error({ err: error, brandName }, `Failed to scrape ${site.name}`);
    return [];
  }
}

/**
 * Scrape all configured coupon sites for a brand's discount codes
 */
export async function scrapeCouponSites(brandName: string): Promise<ScrapedCoupon[]> {
  const allCodes: ScrapedCoupon[] = [];
  const seenCodes = new Set<string>();

  // Scrape sites sequentially to be respectful (rate limiting)
  for (const site of COUPON_SITES) {
    const codes = await scrapeCouponSite(site, brandName);
    for (const code of codes) {
      if (!seenCodes.has(code.code)) {
        seenCodes.add(code.code);
        allCodes.push(code);
      } else {
        // Duplicate code from different site - add to existing entry's sources
        const existing = allCodes.find(c => c.code === code.code);
        if (existing && existing.sourceSite !== code.sourceSite) {
          // Track that this code was found on multiple sites
          existing.description += ` | Also on ${code.sourceSite}`;
        }
      }
    }

    // Rate limit: wait 1 second between sites
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return allCodes;
}

// ============ SHOPIFY DISCOUNT FUNCTIONS ============

/**
 * Fetch all active discount codes from Shopify
 */
export async function fetchShopifyDiscounts(
  shopDomain: string,
  accessToken: string,
): Promise<ShopifyDiscount[]> {
  const baseUrl = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}`;
  const headers = {
    'X-Shopify-Access-Token': accessToken,
    'Content-Type': 'application/json',
  };

  const discounts: ShopifyDiscount[] = [];

  try {
    // Step 1: Fetch all price rules
    const priceRulesUrl = `${baseUrl}/price_rules.json?limit=250`;
    const priceRulesResp = await safeFetch(priceRulesUrl, { service: 'Shopify', headers });

    if (!priceRulesResp.ok) {
      throw new Error(`Shopify API error: ${priceRulesResp.status}`);
    }

    const priceRulesData = await safeJson(priceRulesResp);
    const priceRules = priceRulesData?.price_rules || [];

    // Step 2: For each price rule, fetch its discount codes
    for (const rule of priceRules) {
      const codesUrl = `${baseUrl}/price_rules/${rule.id}/discount_codes.json?limit=250`;
      const codesResp = await safeFetch(codesUrl, { service: 'Shopify', headers });

      if (!codesResp.ok) continue;

      const codesData = await safeJson(codesResp);
      const codes = codesData?.discount_codes || [];

      for (const code of codes) {
        discounts.push({
          id: String(code.id),
          code: code.code.toUpperCase(),
          priceRuleId: String(rule.id),
          valueType: rule.value_type === 'percentage' ? 'percentage' : 'fixed_amount',
          value: Math.abs(parseFloat(rule.value || '0')),
          usageCount: code.usage_count || 0,
          createdAt: code.created_at,
          endsAt: rule.ends_at || undefined,
          targetType: rule.target_type === 'line_item' ? 'entitled_products' : 'all',
          title: rule.title,
        });
      }

      // Rate limit Shopify API calls
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    logger.info({ shopDomain }, `Fetched ${discounts.length} discount codes from Shopify`);
    return discounts;
  } catch (error) {
    logger.error({ err: error, shopDomain }, 'Failed to fetch Shopify discounts');
    return [];
  }
}

/**
 * Fetch orders that used a specific discount code
 */
export async function fetchOrdersByDiscountCode(
  shopDomain: string,
  accessToken: string,
  discountCode: string,
  days: number = 30,
): Promise<{ count: number; totalDiscount: number; totalRevenue: number }> {
  const baseUrl = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}`;
  const headers = {
    'X-Shopify-Access-Token': accessToken,
    'Content-Type': 'application/json',
  };

  const since = new Date();
  since.setDate(since.getDate() - days);

  try {
    // Note: Shopify doesn't have a direct filter by discount code
    // We need to fetch recent orders and filter client-side
    const ordersUrl = `${baseUrl}/orders.json?status=any&created_at_min=${since.toISOString()}&limit=250`;
    const ordersResp = await safeFetch(ordersUrl, { service: 'Shopify', headers });

    if (!ordersResp.ok) {
      return { count: 0, totalDiscount: 0, totalRevenue: 0 };
    }

    const ordersData = await safeJson(ordersResp);
    const orders = ordersData?.orders || [];

    let count = 0;
    let totalDiscount = 0;
    let totalRevenue = 0;

    for (const order of orders) {
      const discountCodes = order.discount_codes || [];
      const matchingCode = discountCodes.find(
        (dc: any) => dc.code.toUpperCase() === discountCode.toUpperCase()
      );

      if (matchingCode) {
        count++;
        totalDiscount += parseFloat(matchingCode.amount || '0');
        totalRevenue += parseFloat(order.total_price || '0');
      }
    }

    return { count, totalDiscount, totalRevenue };
  } catch (error) {
    logger.error({ err: error, discountCode }, 'Failed to fetch orders by discount code');
    return { count: 0, totalDiscount: 0, totalRevenue: 0 };
  }
}

// ============ CROSS-REFERENCE ANALYSIS ============

/**
 * Normalize discount code for comparison
 */
function normalizeCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

/**
 * Cross-reference scraped codes against Shopify discounts
 */
export function crossReferenceDiscounts(
  scrapedCodes: ScrapedCoupon[],
  shopifyDiscounts: ShopifyDiscount[],
): LeakedCode[] {
  const leaked: LeakedCode[] = [];
  const shopifyCodeMap = new Map<string, ShopifyDiscount>();

  // Build lookup map with normalized codes
  for (const discount of shopifyDiscounts) {
    shopifyCodeMap.set(normalizeCode(discount.code), discount);
  }

  // Check each scraped code against Shopify
  for (const scraped of scrapedCodes) {
    const normalizedScraped = normalizeCode(scraped.code);
    const shopifyDiscount = shopifyCodeMap.get(normalizedScraped);

    if (shopifyDiscount) {
      // Found a match - this code is leaked!
      const existingLeak = leaked.find(l => l.code === shopifyDiscount.code);
      if (existingLeak) {
        // Add this source to existing leak
        existingLeak.sources.push(scraped);
      } else {
        // New leaked code
        leaked.push({
          code: shopifyDiscount.code,
          shopifyDiscount,
          sources: [scraped],
          estimatedImpact: {
            ordersAffected: 0,
            revenueLeaked: 0,
            avgDiscountAmount: 0,
          },
        });
      }
    }
  }

  return leaked;
}

// ============ REVENUE IMPACT CALCULATION ============

/**
 * Calculate the revenue impact of leaked discount codes
 */
export async function calculateRevenueImpact(
  leakedCodes: LeakedCode[],
  shopDomain: string,
  accessToken: string,
): Promise<LeakedCode[]> {
  for (const leak of leakedCodes) {
    const orderStats = await fetchOrdersByDiscountCode(
      shopDomain,
      accessToken,
      leak.code,
      30, // Last 30 days
    );

    leak.estimatedImpact = {
      ordersAffected: orderStats.count,
      revenueLeaked: orderStats.totalDiscount,
      avgDiscountAmount: orderStats.count > 0
        ? orderStats.totalDiscount / orderStats.count
        : leak.shopifyDiscount.value,
    };

    // Rate limit
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return leakedCodes;
}

/**
 * Determine severity based on total leakage
 */
function calculateSeverity(totalLeakage: number): 'low' | 'medium' | 'high' | 'critical' {
  if (totalLeakage >= 100000) return 'critical'; // Rs 1L+
  if (totalLeakage >= 50000) return 'high';      // Rs 50K+
  if (totalLeakage >= 10000) return 'medium';    // Rs 10K+
  return 'low';
}

// ============ MAIN DETECTION FUNCTION ============

export interface RunDiscountLeakageCheckOptions {
  shopDomain: string;
  shopifyToken: string;
  brandName: string;
  userId?: string;
  skipRevenueImpact?: boolean;
}

export interface DiscountLeakageResult {
  success: boolean;
  report?: LeakageReport;
  error?: string;
}

/**
 * Main entry point for Watchdog integration
 * Runs a complete discount leakage detection check
 */
export async function runDiscountLeakageCheck(
  options: RunDiscountLeakageCheckOptions,
): Promise<DiscountLeakageResult> {
  const { shopDomain, shopifyToken, brandName, skipRevenueImpact = false } = options;

  try {
    logger.info({ shopDomain, brandName }, 'Starting discount leakage check');

    // Step 1: Scrape coupon sites
    const scrapedCodes = await scrapeCouponSites(brandName);
    logger.info(`Scraped ${scrapedCodes.length} codes from coupon sites`);

    // Step 2: Fetch Shopify discounts
    const shopifyDiscounts = await fetchShopifyDiscounts(shopDomain, shopifyToken);
    logger.info(`Fetched ${shopifyDiscounts.length} Shopify discount codes`);

    // Step 3: Cross-reference
    let leakedCodes = crossReferenceDiscounts(scrapedCodes, shopifyDiscounts);
    logger.info(`Found ${leakedCodes.length} leaked codes`);

    // Step 4: Calculate revenue impact (optional)
    if (!skipRevenueImpact && leakedCodes.length > 0) {
      leakedCodes = await calculateRevenueImpact(leakedCodes, shopDomain, shopifyToken);
    }

    // Step 5: Build report
    const totalRevenueLeakage = leakedCodes.reduce(
      (sum, leak) => sum + leak.estimatedImpact.revenueLeaked,
      0
    );

    const report: LeakageReport = {
      capturedAt: new Date().toISOString(),
      shopDomain,
      totalCodesScraped: scrapedCodes.length,
      totalShopifyDiscounts: shopifyDiscounts.length,
      leakedCodes,
      totalRevenueLeakage,
      severity: calculateSeverity(totalRevenueLeakage),
    };

    // Step 6: Send alert if leakage found
    if (leakedCodes.length > 0 && options.userId) {
      const alertMessage = formatLeakageAlert(report, brandName);
      await notifyAlert(options.userId, {
        type: 'discount_leakage',
        title: `Discount Leakage Detected: ${brandName}`,
        content: alertMessage,
        severity: report.severity === 'critical' ? 'critical' : report.severity === 'high' ? 'warning' : 'info',
      });
    }

    logger.info({ shopDomain, leakedCodes: leakedCodes.length, totalRevenueLeakage }, 'Discount leakage check completed');

    return { success: true, report };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ err: errorMessage, shopDomain }, 'Discount leakage check failed');
    return { success: false, error: errorMessage };
  }
}

/**
 * Format leakage alert for notifications
 */
function formatLeakageAlert(report: LeakageReport, brandName: string): string {
  const lines = [
    `Discount Leakage Alert for ${brandName}`,
    '',
    `Leaked Codes: ${report.leakedCodes.length}`,
    `Estimated Revenue Loss: Rs ${report.totalRevenueLeakage.toLocaleString()}`,
    `Severity: ${report.severity.toUpperCase()}`,
    '',
    'Leaked Codes:',
  ];

  for (const leak of report.leakedCodes.slice(0, 5)) {
    const sources = leak.sources.map(s => s.sourceSite).join(', ');
    lines.push(`- ${leak.code} (found on: ${sources})`);
    if (leak.estimatedImpact.ordersAffected > 0) {
      lines.push(`  Used ${leak.estimatedImpact.ordersAffected} times, Rs ${leak.estimatedImpact.revenueLeaked.toLocaleString()} leaked`);
    }
  }

  if (report.leakedCodes.length > 5) {
    lines.push(`... and ${report.leakedCodes.length - 5} more codes`);
  }

  lines.push('', 'Action: Review and rotate leaked discount codes');

  return lines.join('\n');
}

// ============ CLIENT-AWARE DETECTION ============

export interface ClientLeakageReport extends LeakageReport {
  clientId: string;
  clientName: string;
  revenueLevel: string;
  alertThreshold: number;
  shouldAlert: boolean;
  newLeakedCodes: string[];       // Codes not previously reported
  previouslyKnown: string[];      // Codes we already knew about
}

/**
 * Run discount leakage check with client context
 * - Uses client profile for brand name and Shopify credentials
 * - Applies revenue-level alert thresholds
 * - Tracks known leaked codes to avoid duplicate alerts
 */
export async function runDiscountLeakageForClient(
  clientId: string,
  options: { shopifyToken: string; days?: number },
): Promise<ClientLeakageReport | null> {
  const ctx = getClientContext(clientId);
  if (!ctx) {
    logger.error({ clientId }, '[Leakage Client] Client not found');
    return null;
  }

  const { client } = ctx;
  const leakageStore = getDiscountLeakageStore(clientId);

  logger.info({
    clientId,
    brandName: client.brandName,
    revenueLevel: client.revenueLevel,
  }, '[Leakage Client] Starting check');

  // Get alert threshold for this client
  const alertThreshold = getDiscountLeakageAlertThreshold(client);
  logger.info({ alertThreshold }, '[Leakage Client] Using alert threshold');

  // Parse Shopify store info
  let shopDomain: string | undefined;

  if (client.shopifyStore) {
    try {
      const shopifyData = JSON.parse(client.shopifyStore);
      if (typeof shopifyData === 'string') {
        shopDomain = shopifyData;
      } else if (shopifyData.india) {
        shopDomain = shopifyData.india;
      } else if (shopifyData.global) {
        shopDomain = shopifyData.global;
      }
    } catch {
      shopDomain = client.shopifyStore;
    }
  }

  if (!shopDomain) {
    logger.warn({ clientId }, '[Leakage Client] No Shopify store configured');
    return null;
  }

  // Run the leakage check
  const result = await runDiscountLeakageCheck({
    shopDomain,
    shopifyToken: options.shopifyToken,
    brandName: client.brandName,
  });

  if (!result.success || !result.report) {
    logger.error({ clientId, error: result.error }, '[Leakage Client] Check failed');
    return null;
  }

  const report = result.report;

  // Identify NEW leaked codes vs previously known
  const knownCodes = leakageStore?.knownLeakedCodes || [];
  const currentLeakedCodes = report.leakedCodes.map(l => l.code);
  const newLeakedCodes = currentLeakedCodes.filter(code => !knownCodes.includes(code));
  const previouslyKnown = currentLeakedCodes.filter(code => knownCodes.includes(code));

  // Determine if we should alert
  // Alert if: total leakage > threshold AND there are NEW codes
  const shouldAlert = report.totalRevenueLeakage > alertThreshold && newLeakedCodes.length > 0;

  logger.info({
    totalLeakage: report.totalRevenueLeakage,
    alertThreshold,
    newCodes: newLeakedCodes.length,
    shouldAlert,
  }, '[Leakage Client] Alert decision');

  // Update leakage store
  if (leakageStore) {
    const allKnownCodes = [...new Set([...knownCodes, ...currentLeakedCodes])];
    updateDiscountLeakageStore(clientId, {
      lastCheckAt: new Date().toISOString(),
      knownLeakedCodes: allKnownCodes,
      cumulativeLeakage: (leakageStore.cumulativeLeakage || 0) + report.totalRevenueLeakage,
      alertsSent: shouldAlert ? (leakageStore.alertsSent || 0) + 1 : leakageStore.alertsSent,
      lastAlertAt: shouldAlert ? new Date().toISOString() : leakageStore.lastAlertAt,
    });
  }

  // Create recommendation record if alerting
  if (shouldAlert) {
    createRecommendation(clientId, 'discount_leakage', 'rotate_leaked_codes', {
      totalLeakage: report.totalRevenueLeakage,
      codesCount: newLeakedCodes.length,
      topCodes: report.leakedCodes.slice(0, 5),
      severity: report.severity,
    });
  }

  return {
    ...report,
    clientId,
    clientName: client.brandName,
    revenueLevel: client.revenueLevel || 'unknown',
    alertThreshold,
    shouldAlert,
    newLeakedCodes,
    previouslyKnown,
  };
}

/**
 * Generate Smashed-branded HTML report for discount leakage
 */
export function generateLeakageHTMLReport(report: ClientLeakageReport, client: ServiceClient): string {
  const severityColors: Record<string, string> = {
    critical: '#ef4444',
    high: '#f97316',
    medium: '#eab308',
    low: '#22c55e',
  };
  const severityColor = severityColors[report.severity] || '#888';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Discount Leakage Report - ${client.brandName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e5e5e5; line-height: 1.6; }
    .container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }

    /* Header */
    .header { text-align: center; padding: 60px 20px; background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%); border-bottom: 1px solid #333; }
    .logo { font-size: 14px; color: #EC8A23; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 20px; }
    h1 { font-size: 42px; font-weight: 700; background: linear-gradient(90deg, #EC8A23, #f5a623); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 16px; }
    .subtitle { font-size: 18px; color: #888; }
    .severity-badge { display: inline-block; background: ${severityColor}; color: #fff; padding: 8px 20px; border-radius: 20px; font-weight: 700; text-transform: uppercase; margin-top: 20px; }
    .meta { margin-top: 30px; display: flex; justify-content: center; gap: 40px; flex-wrap: wrap; }
    .meta-item { text-align: center; }
    .meta-value { font-size: 32px; font-weight: 700; color: #EC8A23; }
    .meta-value.leak { color: #ef4444; }
    .meta-label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px; }

    /* Sections */
    .section { padding: 60px 0; border-bottom: 1px solid #222; }
    .section-title { font-size: 28px; font-weight: 600; margin-bottom: 40px; display: flex; align-items: center; gap: 12px; }
    .section-title::before { content: ''; width: 4px; height: 28px; background: #EC8A23; border-radius: 2px; }

    /* Codes Grid */
    .codes-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 24px; }
    .code-card { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; transition: border-color 0.2s; }
    .code-card:hover { border-color: #EC8A23; }
    .code-card.new { border-left: 4px solid #ef4444; }
    .code-value { font-size: 24px; font-weight: 700; color: #EC8A23; font-family: monospace; margin-bottom: 16px; }
    .code-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
    .stat { background: #1a1a1a; padding: 12px; border-radius: 8px; }
    .stat-value { font-size: 20px; font-weight: 700; color: #EC8A23; }
    .stat-value.leak { color: #ef4444; }
    .stat-label { font-size: 11px; color: #666; text-transform: uppercase; }
    .sources { font-size: 12px; color: #888; margin-top: 12px; }
    .new-badge { display: inline-block; background: #ef4444; color: white; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px; margin-bottom: 12px; }

    /* Summary */
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; }
    .summary-card { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; text-align: center; }
    .summary-value { font-size: 36px; font-weight: 700; color: #EC8A23; margin-bottom: 8px; }
    .summary-value.leak { color: #ef4444; }
    .summary-label { font-size: 14px; color: #888; }

    /* Footer */
    .footer { text-align: center; padding: 60px 20px; color: #666; }
    .footer-logo { font-size: 14px; color: #EC8A23; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 12px; }
    .footer a { color: #EC8A23; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">The Bridge Service · Smashed Agency</div>
    <h1>Discount Leakage Report</h1>
    <div class="subtitle">${client.brandName} — ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
    <div class="severity-badge">${report.severity} Severity</div>
    <div class="meta">
      <div class="meta-item">
        <div class="meta-value leak">₹${report.totalRevenueLeakage.toLocaleString('en-IN')}</div>
        <div class="meta-label">Revenue Leaked</div>
      </div>
      <div class="meta-item">
        <div class="meta-value">${report.leakedCodes.length}</div>
        <div class="meta-label">Leaked Codes</div>
      </div>
      <div class="meta-item">
        <div class="meta-value">${report.newLeakedCodes.length}</div>
        <div class="meta-label">New This Scan</div>
      </div>
      <div class="meta-item">
        <div class="meta-value">${report.totalCodesScraped}</div>
        <div class="meta-label">Sites Scraped</div>
      </div>
    </div>
  </div>

  <div class="container">
    <div class="section">
      <h2 class="section-title">Summary</h2>
      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-value leak">₹${report.totalRevenueLeakage.toLocaleString('en-IN')}</div>
          <div class="summary-label">Total Revenue Leaked (30 days)</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">${report.leakedCodes.length}</div>
          <div class="summary-label">Codes Found on Coupon Sites</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">${report.totalShopifyDiscounts}</div>
          <div class="summary-label">Active Shopify Codes</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">${report.newLeakedCodes.length}</div>
          <div class="summary-label">Newly Detected</div>
        </div>
      </div>
    </div>

    ${report.leakedCodes.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Leaked Discount Codes</h2>
      <div class="codes-grid">
        ${report.leakedCodes.map(leak => `
          <div class="code-card ${report.newLeakedCodes.includes(leak.code) ? 'new' : ''}">
            ${report.newLeakedCodes.includes(leak.code) ? '<div class="new-badge">New</div>' : ''}
            <div class="code-value">${leak.code}</div>
            <div class="code-stats">
              <div class="stat">
                <div class="stat-value leak">₹${leak.estimatedImpact.revenueLeaked.toLocaleString('en-IN')}</div>
                <div class="stat-label">Revenue Leaked</div>
              </div>
              <div class="stat">
                <div class="stat-value">${leak.estimatedImpact.ordersAffected}</div>
                <div class="stat-label">Orders Affected</div>
              </div>
            </div>
            <div class="code-stats">
              <div class="stat">
                <div class="stat-value">${leak.shopifyDiscount.value}${leak.shopifyDiscount.valueType === 'percentage' ? '%' : ''}</div>
                <div class="stat-label">Discount Value</div>
              </div>
              <div class="stat">
                <div class="stat-value">${leak.shopifyDiscount.usageCount}</div>
                <div class="stat-label">Total Uses</div>
              </div>
            </div>
            <div class="sources">Found on: ${leak.sources.map(s => s.sourceSite).join(', ')}</div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <div class="section">
      <h2 class="section-title">Recommendations</h2>
      <div style="background:#151515;border:1px solid #2a2a2a;border-left:4px solid #EC8A23;border-radius:12px;padding:24px;margin-bottom:16px;">
        <div style="font-size:11px;color:#EC8A23;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;font-weight:600;">Immediate Action</div>
        <div style="font-size:16px;color:#fff;margin-bottom:12px;">
          ${report.leakedCodes.length > 0
            ? `Rotate or disable ${report.leakedCodes.length} leaked discount codes to stop ₹${report.totalRevenueLeakage.toLocaleString('en-IN')} monthly leakage.`
            : 'No leaked codes detected - your discount codes are secure.'}
        </div>
        <div style="font-size:14px;color:#6ee7b7;">
          → ${report.leakedCodes.length > 0
            ? 'Create new codes with unique prefixes. Consider single-use codes for high-value discounts.'
            : 'Continue monitoring weekly to catch leaks early.'}
        </div>
      </div>
      ${report.leakedCodes.length > 0 ? `
      <div style="background:#151515;border:1px solid #2a2a2a;border-left:4px solid #f5a623;border-radius:12px;padding:24px;">
        <div style="font-size:11px;color:#f5a623;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;font-weight:600;">Prevention</div>
        <div style="font-size:16px;color:#fff;margin-bottom:12px;">
          Use unique code patterns that are harder to guess (e.g., BRAND-XXXX-RANDOM instead of generic names).
        </div>
        <div style="font-size:14px;color:#6ee7b7;">
          → Consider automatic code expiration and usage limits for all public promotions.
        </div>
      </div>
      ` : ''}
    </div>
  </div>

  <div class="footer">
    <div class="footer-logo">The Bridge Service</div>
    <p>Generated on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    <p style="margin-top:8px"><a href="https://smashed.agency/scan">smashed.agency/scan</a> · Confidential Client Report</p>
  </div>
</body>
</html>`;
}
