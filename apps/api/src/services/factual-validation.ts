/**
 * Factual Validation Layer
 *
 * Cross-checks AI numerical claims against actual data.
 * Catches hallucinations where AI invents or exaggerates numbers.
 *
 * Usage:
 * 1. Extract monetary claims from AI output
 * 2. Calculate actual values from source data
 * 3. Compare and flag/correct if deviation > threshold
 */

import { logger } from '../utils/logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface FactualValidation {
  isValid: boolean;
  aiClaim: number | null;
  actualValue: number | null;
  deviationPercent: number | null;
  correctedValue?: number;
  flag?: string;
}

export interface ValidationContext {
  source: string;           // Which agent (watchdog, oos-detector, etc.)
  claimType: string;        // What type of claim (waste, oos_spend, margin_loss)
  aiText: string;           // The AI's reasoning/output text
  actualValue: number;      // The actual calculated value
  threshold?: number;       // Deviation threshold % (default: 200)
}

export interface CampaignData {
  name: string;
  spend: number;
  roas: number;
  conversions?: number;
}

export interface ProductData {
  productId: string;
  productName?: string;
  adSpend: number;
  isOOS: boolean;
}

// ============================================================================
// MONETARY EXTRACTION
// ============================================================================

/**
 * Extract monetary values from text (₹X, $X, X Cr, X L, X K)
 * Returns all found values in ascending order
 */
export function extractMonetaryValues(text: string): number[] {
  const values: number[] = [];

  // Match patterns like ₹1.8Cr, ₹1,80,000, $216k, Rs 50L, etc.
  const patterns: Array<{ regex: RegExp; multiplier: number }> = [
    { regex: /[₹$]?\s*([\d,]+(?:\.\d+)?)\s*(?:Cr|crore)/gi, multiplier: 10000000 },
    { regex: /[₹$]?\s*([\d,]+(?:\.\d+)?)\s*(?:L|lakh|lac)/gi, multiplier: 100000 },
    { regex: /[₹$]?\s*([\d,]+(?:\.\d+)?)\s*(?:K|k|thousand)/gi, multiplier: 1000 },
    { regex: /[₹$]\s*([\d,]+(?:\.\d+)?)/g, multiplier: 1 },
  ];

  for (const { regex, multiplier } of patterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const numStr = match[1].replace(/,/g, '');
      const num = parseFloat(numStr) * multiplier;
      if (!isNaN(num) && num > 0) values.push(num);
    }
  }

  return values.sort((a, b) => a - b);
}

/**
 * Extract count values from text (e.g., "14 campaigns", "23 products")
 */
export function extractCountValues(text: string, unit: string): number[] {
  const counts: number[] = [];
  const regex = new RegExp(`(\\d+)\\s*${unit}`, 'gi');

  let match;
  while ((match = regex.exec(text)) !== null) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && num > 0) counts.push(num);
  }

  return counts;
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate a monetary claim against actual value
 * Returns validation result with correction if needed
 */
export function validateMonetaryClaim(ctx: ValidationContext): FactualValidation {
  const claimedValues = extractMonetaryValues(ctx.aiText);

  if (claimedValues.length === 0) {
    return { isValid: true, aiClaim: null, actualValue: ctx.actualValue, deviationPercent: null };
  }

  // Use the largest claim (usually the total/aggregate)
  const largestClaim = Math.max(...claimedValues);
  const threshold = ctx.threshold || 200; // Default 200% deviation allowed

  // Calculate deviation
  const deviation = ctx.actualValue > 0
    ? Math.abs(largestClaim - ctx.actualValue) / ctx.actualValue
    : largestClaim > 0 ? 1 : 0;

  const deviationPercent = Math.round(deviation * 100);
  const isValid = deviationPercent <= threshold;

  const result: FactualValidation = {
    isValid,
    aiClaim: largestClaim,
    actualValue: ctx.actualValue,
    deviationPercent,
    correctedValue: ctx.actualValue,
  };

  if (!isValid) {
    result.flag = `AI_HALLUCINATION [${ctx.source}/${ctx.claimType}]: Claimed ₹${formatCurrency(largestClaim)}, actual is ₹${formatCurrency(ctx.actualValue)} (${deviationPercent}% off)`;

    logger.warn({
      source: ctx.source,
      claimType: ctx.claimType,
      aiClaim: largestClaim,
      actualValue: ctx.actualValue,
      deviationPercent,
    }, '[FactualValidation] AI claim significantly off from actual data');
  }

  return result;
}

/**
 * Format currency for logging (e.g., 1800000 -> "18L")
 */
function formatCurrency(value: number): string {
  if (value >= 10000000) return `${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toLocaleString();
}

// ============================================================================
// DOMAIN-SPECIFIC CALCULATORS
// ============================================================================

/**
 * Calculate actual waste from campaign data (campaigns with ROAS < 1)
 */
export function calculateWastedSpend(campaigns: CampaignData[]): {
  wasteSpend: number;
  lowRoasCampaigns: number;
  totalSpend: number;
} {
  let wasteSpend = 0;
  let lowRoasCampaigns = 0;
  let totalSpend = 0;

  for (const c of campaigns) {
    totalSpend += c.spend;
    if (c.roas < 1 && c.spend > 0) {
      wasteSpend += c.spend;
      lowRoasCampaigns++;
    }
  }

  return { wasteSpend, lowRoasCampaigns, totalSpend };
}

/**
 * Calculate actual OOS spend from product data
 */
export function calculateOOSSpend(products: ProductData[]): {
  oosSpend: number;
  oosProductCount: number;
  totalAdSpend: number;
} {
  let oosSpend = 0;
  let oosProductCount = 0;
  let totalAdSpend = 0;

  for (const p of products) {
    totalAdSpend += p.adSpend;
    if (p.isOOS && p.adSpend > 0) {
      oosSpend += p.adSpend;
      oosProductCount++;
    }
  }

  return { oosSpend, oosProductCount, totalAdSpend };
}

/**
 * Calculate actual discount leakage from code data
 */
export function calculateLeakage(codeData: Array<{
  code: string;
  ordersUsingCode: number;
  discountAmount: number;
  isLeaked: boolean;
}>): {
  leakedAmount: number;
  leakedCodeCount: number;
  totalDiscountAmount: number;
} {
  let leakedAmount = 0;
  let leakedCodeCount = 0;
  let totalDiscountAmount = 0;

  for (const c of codeData) {
    totalDiscountAmount += c.discountAmount;
    if (c.isLeaked) {
      leakedAmount += c.discountAmount;
      leakedCodeCount++;
    }
  }

  return { leakedAmount, leakedCodeCount, totalDiscountAmount };
}

// ============================================================================
// CORRECTION HELPERS
// ============================================================================

/**
 * Generate corrected reasoning text for wasted spend claims
 */
export function correctWasteReasoning(
  originalReasoning: string,
  actual: { wasteSpend: number; lowRoasCampaigns: number },
): string {
  const monthlyWaste = actual.wasteSpend * 4.3; // Weekly to monthly projection

  if (actual.wasteSpend < 50000) {
    return `${actual.lowRoasCampaigns} campaigns with <1x ROAS are consuming ₹${Math.round(actual.wasteSpend).toLocaleString()}/week (₹${Math.round(monthlyWaste).toLocaleString()}/month projected). This is relatively minor waste - monitor but not urgent.`;
  }

  return `${actual.lowRoasCampaigns} campaigns with <1x ROAS are wasting ₹${Math.round(actual.wasteSpend).toLocaleString()}/week (₹${Math.round(monthlyWaste).toLocaleString()}/month projected). Review these campaigns for pause or creative refresh.`;
}

/**
 * Generate corrected reasoning text for OOS spend claims
 */
export function correctOOSReasoning(
  originalReasoning: string,
  actual: { oosSpend: number; oosProductCount: number },
): string {
  const monthlyOOS = actual.oosSpend * 4.3;

  return `${actual.oosProductCount} out-of-stock products are receiving ad spend totaling ₹${Math.round(actual.oosSpend).toLocaleString()}/week (₹${Math.round(monthlyOOS).toLocaleString()}/month projected). Pause ads for these products or restock urgently.`;
}

/**
 * Generate corrected reasoning text for leakage claims
 */
export function correctLeakageReasoning(
  originalReasoning: string,
  actual: { leakedAmount: number; leakedCodeCount: number },
): string {
  return `${actual.leakedCodeCount} discount codes found on coupon sites, causing ₹${Math.round(actual.leakedAmount).toLocaleString()} in margin leakage. Rotate these codes immediately.`;
}

// ============================================================================
// LOGGING
// ============================================================================

logger.info('[FactualValidation] Shared utility loaded');
