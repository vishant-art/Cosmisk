/**
 * Run client-aware Ad Watchdog with Smashed-branded report
 * Usage: node scripts/run-client-watchdog.mjs <brand_name>
 */

import 'dotenv/config';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/cosmisk.db');

// Dynamic import for ES module
const { runWatchdogForClient, generateWatchdogHTMLReport } = await import('../dist/services/ad-watchdog.js');

const db = new Database(DB_PATH);

// Get brand name from args or default to Pratapsons
const brandName = process.argv[2] || 'Pratapsons';

// Get client
const client = db.prepare(`SELECT * FROM service_clients WHERE brand_name = ?`).get(brandName);

if (!client) {
  console.log(`❌ Client "${brandName}" not found`);
  console.log('\nAvailable clients:');
  const clients = db.prepare(`SELECT brand_name, revenue_level FROM service_clients`).all();
  clients.forEach(c => console.log(`  • ${c.brand_name} (${c.revenue_level})`));
  process.exit(1);
}

console.log('🔍 Running Ad Watchdog');
console.log('─'.repeat(50));
console.log(`Client: ${client.brand_name}`);
console.log(`Level:  ${client.revenue_level}`);
console.log(`Meta Account: ${client.meta_ad_account_id || 'Not configured'}`);
console.log(`Shopify: ${client.shopify_store || 'Not configured'}`);
console.log('');

// Check for required tokens
const metaToken = process.env.META_ACCESS_TOKEN;
const shopifyToken = process.env.SHOPIFY_ACCESS_TOKEN;

if (!metaToken) {
  console.log('❌ META_ACCESS_TOKEN not set in environment');
  process.exit(1);
}

try {
  const report = await runWatchdogForClient(client.id, {
    metaToken,
    shopifyToken,
  });

  if (!report) {
    console.log('❌ No report generated (missing credentials or no data)');
    process.exit(1);
  }

  console.log('\n✅ Watchdog Report Generated');
  console.log('═'.repeat(50));
  console.log(`Account:            ${report.accountName}`);
  console.log(`Issues Found:       ${report.decisions.length}`);
  console.log(`Requires Action:    ${report.filteredDecisions.length}`);
  console.log(`Alert Triggered:    ${report.shouldAlert ? '⚠️ YES' : 'No'}`);

  if (report.alertReason) {
    console.log(`Alert Reason:       ${report.alertReason}`);
  }

  if (report.oosReport) {
    console.log(`\n📦 OOS Check:`);
    console.log(`   Products: ${report.oosReport.enhanced?.topWasted?.length || 0}`);
    console.log(`   Wasted: ₹${(report.oosReport.verifiedWastedSpend || 0).toLocaleString('en-IN')}`);
  }

  if (report.leakageReport) {
    console.log(`\n💸 Leakage Check:`);
    console.log(`   Codes: ${report.leakageReport.leakedCodes?.length || 0}`);
    console.log(`   Leaked: ₹${(report.leakageReport.totalRevenueLeakage || 0).toLocaleString('en-IN')}`);
  }

  if (report.filteredDecisions.length > 0) {
    console.log('\n🚨 Action Required:');
    for (const d of report.filteredDecisions) {
      console.log(`  [${d.urgency.toUpperCase()}] ${d.type}`);
      console.log(`    ${d.targetName}`);
      console.log(`    → ${d.suggestedAction} | Impact: ${d.estimatedImpact}`);
    }
  }

  if (report.decisions.length > report.filteredDecisions.length) {
    console.log(`\n📋 ${report.decisions.length - report.filteredDecisions.length} lower priority items not shown`);
  }

  // Save HTML report
  const reportPath = `/tmp/${brandName.toLowerCase()}-watchdog-report.html`;
  const html = generateWatchdogHTMLReport(report, {
    id: client.id,
    brandName: client.brand_name,
    revenueLevel: client.revenue_level,
    category: client.category,
    shopifyStore: client.shopify_store,
    metaAdAccountId: client.meta_ad_account_id,
    alertThreshold: client.alert_threshold,
  });
  fs.writeFileSync(reportPath, html);
  console.log(`\n📄 HTML Report: ${reportPath}`);

} catch (e) {
  console.error('❌ Error:', e.message);
  console.error(e.stack);
}

db.close();
