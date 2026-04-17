/**
 * Adaptive Audit System - Main Entry Point
 */

import Database from 'better-sqlite3';
import { createDecipheriv } from 'crypto';
import { fetchMetaSnapshot } from './meta-ingestion.js';
import { fetchGoogleAdsSnapshot } from './google-ads-ingestion.js';
import { fetchShopifySnapshot } from './shopify-ingestion.js';
import { analyzeWebsite } from './website-analysis.js';
import { runCreativeAudit } from './audit-agent.js';
import { validateAuditQuality, formatQAResult } from './qa-validator.js';
import { generateMarkdown, generateJSON, generateSummary } from './output.js';
import type { Brand, BrandContext, AuditInput, AuditOutput, AuditConfig, ShopifySnapshot, WebsiteSnapshot, GoogleAdsSnapshot, AuditComparison } from './types.js';

const ALGORITHM = 'aes-256-gcm';

interface AuditOptions {
  brandId: string;
  datePreset?: AuditConfig['datePreset'];
  outputFormat?: 'markdown' | 'json' | 'both';
  saveToDisk?: boolean;
  outputPath?: string;
}

interface AuditResult {
  audit: AuditOutput;
  markdown?: string;
  json?: string;
  summary?: string;
}

/**
 * Main audit runner
 */
export async function runAudit(options: AuditOptions): Promise<AuditResult> {
  const {
    brandId,
    datePreset = 'last_30d',
    outputFormat = 'markdown',
    saveToDisk = true,
    outputPath = './data/audits',
  } = options;

  console.log(`\n🔍 Starting audit for brand: ${brandId}`);
  console.log(`   Date range: ${datePreset}`);

  // 1. Load brand from database
  console.log('\n📦 Loading brand data...');
  const brand = getBrand(brandId);
  if (!brand) {
    throw new Error(`Brand not found: ${brandId}`);
  }
  console.log(`   Brand: ${brand.name} (${brand.category})`);

  // 2. Load brand context
  const context = getBrandContext(brandId);
  if (context) {
    console.log(`   Context loaded: ${context.winningCreativePatterns.length} winning patterns`);
  }

  // 3. Get Meta access token
  console.log('\n🔑 Getting Meta access token...');
  const accessToken = getMetaAccessToken();
  if (!accessToken) {
    throw new Error('No Meta access token found');
  }

  // 4. Fetch Meta data
  console.log('\n📊 Fetching Meta Ads data...');
  const metaData = await fetchMetaSnapshot({
    adAccountId: brand.metaAdAccountId!,
    accessToken,
    datePreset,
  });
  console.log(`   Total spend: ₹${metaData.totalSpend.toFixed(0)}`);
  console.log(`   Creatives analyzed: ${metaData.creatives.length}`);

  // 5. Fetch Google Ads data (if available)
  let googleAdsData: GoogleAdsSnapshot | null = null;
  if (brand.googleAdsCustomerId) {
    console.log('\n📈 Fetching Google Ads data...');
    try {
      // Get user ID from brand's associated user (for token lookup)
      const userId = getBrandUserId(brandId);
      if (userId) {
        googleAdsData = await fetchGoogleAdsSnapshot({
          customerId: brand.googleAdsCustomerId,
          userId,
          datePreset,
        });
        console.log(`   Total spend: ₹${googleAdsData.totalSpend.toFixed(0)}`);
        console.log(`   Campaigns: ${googleAdsData.campaigns.length}`);
        console.log(`   ROAS: ${googleAdsData.overallRoas.toFixed(2)}x`);
      } else {
        console.log('   ⚠️ No user associated with brand for Google Ads token');
      }
    } catch (error) {
      console.log(`   ⚠️ Google Ads fetch failed: ${error}`);
    }
  }

  // 7. Fetch Shopify data (if available)
  let shopifyData: ShopifySnapshot | null = null;
  if (brand.shopifyDomain) {
    const shopifyToken = getShopifyAccessToken(brandId);
    if (shopifyToken) {
      console.log('\n🛒 Fetching Shopify data...');
      try {
        shopifyData = await fetchShopifySnapshot({
          shopDomain: brand.shopifyDomain,
          accessToken: shopifyToken,
          datePreset,
        });
        console.log(`   Total revenue: ₹${shopifyData.totalRevenue.toFixed(0)}`);
        console.log(`   Orders: ${shopifyData.totalOrders}`);
        console.log(`   AOV: ₹${shopifyData.averageOrderValue.toFixed(0)}`);
      } catch (error) {
        console.log(`   ⚠️ Shopify fetch failed: ${error}`);
      }
    } else {
      console.log('\n🛒 Shopify: No token configured (skipping)');
    }
  }

  // 8. Analyze website
  let websiteData: WebsiteSnapshot | null = null;
  if (brand.domain && brand.domain !== 'unknown') {
    console.log('\n🌐 Analyzing website...');
    try {
      websiteData = await analyzeWebsite({ domain: brand.domain });
      console.log(`   Price point: ${websiteData.pricePoint}`);
      console.log(`   Products: ${websiteData.productCount}`);
      console.log(`   Trust signals: ${websiteData.trustSignals.length}`);
    } catch (error) {
      console.log(`   ⚠️ Website analysis failed: ${error}`);
    }
  }

  // 9. Build audit input
  const auditInput: AuditInput = {
    brandId,
    brand,
    context,
    metaData,
    googleAdsData,
    shopifyData,
    websiteData,
    dateRange: metaData.dateRange,
  };

  // 10. Run audit
  console.log('\n🤖 Running AI analysis...');
  const audit = await runCreativeAudit(auditInput);
  console.log(`   Health score: ${audit.summary.healthScore}/100`);
  console.log(`   Wasted spend: ₹${audit.summary.wastedSpend.toFixed(0)}`);

  // 10b. Compare with previous audit (if exists)
  console.log('\n📊 Checking for previous audits...');
  const previousAudit = getPreviousAudit(brandId);
  if (previousAudit) {
    console.log(`   Found previous audit: ${previousAudit.auditId}`);
    const comparison = calculateAuditComparison(audit, previousAudit);
    audit.comparison = comparison;
    console.log(`   Trend: ${comparison.overallTrend.toUpperCase()}`);
    if (comparison.improvements.length > 0) {
      console.log(`   ✅ ${comparison.improvements.length} improvements`);
    }
    if (comparison.regressions.length > 0) {
      console.log(`   ⚠️ ${comparison.regressions.length} regressions`);
    }
  } else {
    console.log('   No previous audit found (first audit for this brand)');
  }

  // 11. QA validation
  console.log('\n🔍 Running QA validation...');
  const qaResult = validateAuditQuality(audit);
  console.log(formatQAResult(qaResult));
  if (!qaResult.passed) {
    console.log('   ⚠️ QA failed but proceeding with output');
  }

  // 12. Generate outputs
  const result: AuditResult = { audit };

  if (outputFormat === 'markdown' || outputFormat === 'both') {
    result.markdown = generateMarkdown(audit);
  }

  if (outputFormat === 'json' || outputFormat === 'both') {
    result.json = generateJSON(audit);
  }

  // Always generate summary
  result.summary = generateSummary(audit);

  // 13. Save to disk if requested
  if (saveToDisk) {
    const fs = await import('fs');
    const path = await import('path');

    // Ensure output directory exists
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const baseName = `${brand.name.toLowerCase().replace(/\s+/g, '-')}-audit-${timestamp}`;

    if (result.markdown) {
      const mdPath = path.join(outputPath, `${baseName}.md`);
      fs.writeFileSync(mdPath, result.markdown);
      console.log(`\n📄 Saved: ${mdPath}`);
    }

    if (result.json) {
      const jsonPath = path.join(outputPath, `${baseName}.json`);
      fs.writeFileSync(jsonPath, result.json);
      console.log(`📄 Saved: ${jsonPath}`);
    }

    // Save summary
    const summaryPath = path.join(outputPath, `${baseName}-summary.md`);
    fs.writeFileSync(summaryPath, result.summary);
    console.log(`📋 Saved: ${summaryPath}`);
  }

  // 14. Save audit to database
  console.log('\n💾 Saving audit to database...');
  saveAudit(audit);

  // 15. Extract and save learnings (optional - may fail for ad-hoc audits)
  console.log('🧠 Extracting learnings...');
  try {
    await extractAndSaveLearnings(audit, brand.id);
  } catch (error) {
    console.log('   ⚠️ Could not save learnings (brand may not be in database)');
  }

  console.log('\n✅ Audit complete!');

  return result;
}

// ============ DATABASE HELPERS ============

function getDb(): Database.Database {
  return new Database('./data/cosmisk.db');
}

function getBrand(brandId: string): Brand | null {
  const db = getDb();

  // First check if brand exists in brands table
  let row = db.prepare('SELECT * FROM brands WHERE id = ?').get(brandId) as any;

  if (row) {
    return {
      id: row.id,
      name: row.name,
      domain: row.domain,
      category: row.category,
      stage: row.stage,
      metaAdAccountId: row.meta_ad_account_id,
      googleAdsCustomerId: row.google_ads_customer_id || null,
      pixelId: row.pixel_id,
      shopifyDomain: row.shopify_domain || null,
      createdAt: row.created_at,
    };
  }

  // Fallback: check if brandId is actually an ad account ID (for backwards compatibility)
  // This allows running audits with just an ad account ID before full brand setup
  if (brandId.startsWith('act_')) {
    return {
      id: brandId,
      name: brandId,
      domain: 'unknown',
      category: 'other',
      stage: 'scaling',
      googleAdsCustomerId: null,
      metaAdAccountId: brandId,
      pixelId: null,
      shopifyDomain: null,
      createdAt: new Date().toISOString(),
    };
  }

  return null;
}

function getBrandUserId(brandId: string): string | null {
  const db = getDb();

  // Get user_id associated with brand
  const row = db.prepare('SELECT user_id FROM brands WHERE id = ?').get(brandId) as any;
  if (row?.user_id) return row.user_id;

  // Fallback: get first user with google token
  const fallback = db.prepare('SELECT user_id FROM google_tokens LIMIT 1').get() as any;
  return fallback?.user_id || null;
}

function getBrandContext(brandId: string): BrandContext | null {
  const db = getDb();

  const row = db.prepare('SELECT * FROM brand_context WHERE brand_id = ?').get(brandId) as any;

  if (!row) return null;

  return {
    brandId: row.brand_id,
    pricePoint: row.price_point,
    targetAudience: row.target_audience,
    winningCreativePatterns: JSON.parse(row.winning_patterns || '[]'),
    failedApproaches: JSON.parse(row.failed_approaches || '[]'),
    updatedAt: row.updated_at,
  };
}

function getMetaAccessToken(): string | null {
  const db = getDb();

  // Get token for default user (first user with meta token)
  const row = db.prepare(`
    SELECT encrypted_access_token FROM meta_tokens
    WHERE user_id = (SELECT id FROM users WHERE email = 'vishant@gmail.com')
  `).get() as any;

  if (!row) return null;

  return decryptToken(row.encrypted_access_token);
}

function getShopifyAccessToken(brandId: string): string | null {
  const db = getDb();

  const row = db.prepare(`
    SELECT encrypted_access_token FROM shopify_tokens
    WHERE brand_id = ?
  `).get(brandId) as any;

  if (!row) return null;

  return decryptToken(row.encrypted_access_token);
}

function getEncryptionKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY || 'change-me-to-a-random-32-byte-hex-string';
  const buf = Buffer.alloc(32);
  Buffer.from(key).copy(buf);
  return buf;
}

function decryptToken(stored: string): string {
  const [ivHex, authTagHex, ciphertext] = stored.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ============ AUDIT PERSISTENCE ============

function saveAudit(audit: AuditOutput): void {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO audits (
      id, brand_id, brand_name, date_range_start, date_range_end,
      health_score, wasted_spend, best_cpa, worst_cpa,
      top_findings, top_priority, confidence_level, full_output, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    audit.auditId,
    audit.brandId,
    audit.brandName,
    audit.dateRange.start,
    audit.dateRange.end,
    audit.summary.healthScore,
    audit.summary.wastedSpend,
    audit.summary.bestCpa,
    audit.summary.worstCpa,
    JSON.stringify(audit.summary.topFindings),
    audit.summary.topPriority,
    audit.confidence.level,
    JSON.stringify(audit),
    audit.createdAt
  );

  console.log(`   Saved audit: ${audit.auditId}`);
}

async function extractAndSaveLearnings(audit: AuditOutput, brandId: string): Promise<void> {
  const db = getDb();

  // Extract winning patterns from winners
  const winningPatterns: string[] = [];
  for (const winner of audit.creativeAnalysis.winners.slice(0, 3)) {
    if (winner.whyItWorks && winner.whyItWorks !== 'High conversion rate with efficient spend') {
      winningPatterns.push(winner.whyItWorks);
    }
  }

  // Extract failed approaches from losers
  const failedApproaches: string[] = [];
  for (const loser of audit.creativeAnalysis.losers.slice(0, 3)) {
    if (loser.whyItFails && loser.whyItFails !== 'Low conversion despite significant spend') {
      failedApproaches.push(loser.whyItFails);
    }
  }

  // Get existing context or create new
  const existing = getBrandContext(brandId);

  if (existing) {
    // Merge with existing patterns (dedupe and limit to 10 each)
    const allWinning = [...new Set([...winningPatterns, ...existing.winningCreativePatterns])].slice(0, 10);
    const allFailed = [...new Set([...failedApproaches, ...existing.failedApproaches])].slice(0, 10);

    db.prepare(`
      UPDATE brand_context
      SET winning_patterns = ?, failed_approaches = ?, updated_at = datetime('now')
      WHERE brand_id = ?
    `).run(JSON.stringify(allWinning), JSON.stringify(allFailed), brandId);

    console.log(`   Updated context: ${allWinning.length} winning, ${allFailed.length} failed patterns`);
  } else if (winningPatterns.length > 0 || failedApproaches.length > 0) {
    // Create new context
    db.prepare(`
      INSERT INTO brand_context (brand_id, winning_patterns, failed_approaches, updated_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(brandId, JSON.stringify(winningPatterns), JSON.stringify(failedApproaches));

    console.log(`   Created context: ${winningPatterns.length} winning, ${failedApproaches.length} failed patterns`);
  } else {
    console.log(`   No learnings extracted (using default analysis)`);
  }
}

/**
 * Get audit history for a brand
 */
export function getAuditHistory(brandId: string, limit: number = 10): any[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT id, brand_name, date_range_start, date_range_end,
           health_score, wasted_spend, best_cpa, top_priority, created_at
    FROM audits
    WHERE brand_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(brandId, limit);

  return rows;
}

/**
 * Get the previous audit for a brand (for comparison)
 */
export function getPreviousAudit(brandId: string): AuditOutput | null {
  const db = getDb();

  const row = db.prepare(`
    SELECT full_output FROM audits
    WHERE brand_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(brandId) as any;

  if (!row) return null;

  try {
    return JSON.parse(row.full_output) as AuditOutput;
  } catch {
    return null;
  }
}

/**
 * Calculate comparison between current and previous audit
 */
export function calculateAuditComparison(
  current: AuditOutput,
  previous: AuditOutput
): AuditComparison {
  const deltas = {
    healthScore: current.summary.healthScore - previous.summary.healthScore,
    wastedSpend: current.summary.wastedSpend - previous.summary.wastedSpend,
    bestCpa: current.summary.bestCpa - previous.summary.bestCpa,
    worstCpa: current.summary.worstCpa - previous.summary.worstCpa,
    winnerCount: current.creativeAnalysis.winners.length - previous.creativeAnalysis.winners.length,
    loserCount: current.creativeAnalysis.losers.length - previous.creativeAnalysis.losers.length,
  };

  const improvements: string[] = [];
  const regressions: string[] = [];

  // Health score analysis
  if (deltas.healthScore >= 10) {
    improvements.push(`Health score improved by ${deltas.healthScore} points`);
  } else if (deltas.healthScore <= -10) {
    regressions.push(`Health score dropped by ${Math.abs(deltas.healthScore)} points`);
  }

  // Wasted spend analysis (lower is better)
  if (deltas.wastedSpend <= -1000) {
    const saved = Math.abs(deltas.wastedSpend);
    improvements.push(`Reduced wasted spend by ₹${saved.toLocaleString('en-IN')}`);
  } else if (deltas.wastedSpend >= 1000) {
    regressions.push(`Wasted spend increased by ₹${deltas.wastedSpend.toLocaleString('en-IN')}`);
  }

  // CPA analysis (lower is better)
  if (deltas.bestCpa <= -50 && previous.summary.bestCpa > 0) {
    const pctImprovement = ((Math.abs(deltas.bestCpa) / previous.summary.bestCpa) * 100).toFixed(0);
    improvements.push(`Best CPA improved by ${pctImprovement}% (₹${Math.abs(deltas.bestCpa).toFixed(0)} lower)`);
  } else if (deltas.bestCpa >= 50 && current.summary.bestCpa > 0) {
    regressions.push(`Best CPA worsened by ₹${deltas.bestCpa.toFixed(0)}`);
  }

  // Winner/loser count analysis
  if (deltas.winnerCount >= 2) {
    improvements.push(`${deltas.winnerCount} more winning creatives identified`);
  } else if (deltas.winnerCount <= -2) {
    regressions.push(`${Math.abs(deltas.winnerCount)} fewer winning creatives`);
  }

  if (deltas.loserCount <= -2) {
    improvements.push(`${Math.abs(deltas.loserCount)} fewer underperforming creatives`);
  } else if (deltas.loserCount >= 2) {
    regressions.push(`${deltas.loserCount} more underperforming creatives identified`);
  }

  // Determine overall trend
  let overallTrend: 'improving' | 'stable' | 'declining';
  const positiveSignals = (deltas.healthScore > 5 ? 1 : 0) +
    (deltas.wastedSpend < -500 ? 1 : 0) +
    (deltas.bestCpa < -30 ? 1 : 0);
  const negativeSignals = (deltas.healthScore < -5 ? 1 : 0) +
    (deltas.wastedSpend > 500 ? 1 : 0) +
    (deltas.bestCpa > 30 ? 1 : 0);

  if (positiveSignals >= 2 && positiveSignals > negativeSignals) {
    overallTrend = 'improving';
  } else if (negativeSignals >= 2 && negativeSignals > positiveSignals) {
    overallTrend = 'declining';
  } else {
    overallTrend = 'stable';
  }

  return {
    previousAuditId: previous.auditId,
    previousAuditDate: previous.createdAt,
    previousDateRange: previous.dateRange,
    deltas,
    improvements,
    regressions,
    overallTrend,
  };
}

// ============ EXPORTS ============

export * from './types.js';
export { fetchMetaSnapshot } from './meta-ingestion.js';
export { fetchGoogleAdsSnapshot } from './google-ads-ingestion.js';
export { fetchShopifySnapshot } from './shopify-ingestion.js';
export { analyzeWebsite } from './website-analysis.js';
export { runCreativeAudit } from './audit-agent.js';
export { validateAuditQuality, formatQAResult } from './qa-validator.js';
export { generateMarkdown, generateJSON } from './output.js';
