/**
 * Run client-aware discount leakage detection with Smashed-branded report
 * Usage: node scripts/run-client-leakage.mjs <brand_name>
 */

import 'dotenv/config';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/cosmisk.db');

// Dynamic import for ES module
const { runDiscountLeakageForClient, generateLeakageHTMLReport } = await import('../dist/services/discount-leakage-detector.js');

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

console.log('🔍 Running Discount Leakage Detection');
console.log('─'.repeat(50));
console.log(`Client: ${client.brand_name}`);
console.log(`Level:  ${client.revenue_level}`);
console.log(`Shopify: ${client.shopify_store || 'Not configured'}`);
console.log('');

// Check for Shopify token
const shopifyToken = process.env.SHOPIFY_ACCESS_TOKEN;
if (!shopifyToken) {
  console.log('❌ SHOPIFY_ACCESS_TOKEN not set in environment');
  console.log('Set it in .env or pass via environment variable');
  process.exit(1);
}

try {
  const report = await runDiscountLeakageForClient(client.id, {
    shopifyToken,
  });

  if (!report) {
    console.log('❌ No report generated (missing credentials or no data)');
    process.exit(1);
  }

  console.log('\n✅ Leakage Report Generated');
  console.log('═'.repeat(50));
  console.log(`Total Revenue Leaked: ₹${report.totalRevenueLeakage.toLocaleString('en-IN')}`);
  console.log(`Leaked Codes Found:   ${report.leakedCodes.length}`);
  console.log(`New Leaked Codes:     ${report.newLeakedCodes.length}`);
  console.log(`Severity:             ${report.severity.toUpperCase()}`);
  console.log(`Alert Triggered:      ${report.shouldAlert ? '⚠️ YES' : 'No'}`);

  if (report.leakedCodes.length > 0) {
    console.log('\n📊 Top Leaked Codes:');
    for (const leak of report.leakedCodes.slice(0, 5)) {
      const isNew = report.newLeakedCodes.includes(leak.code);
      console.log(`  ${isNew ? '🆕' : '•'} ${leak.code}`);
      console.log(`    Leaked: ₹${leak.estimatedImpact.revenueLeaked.toLocaleString('en-IN')} | Orders: ${leak.estimatedImpact.ordersAffected}`);
      console.log(`    Found on: ${leak.sources.map(s => s.sourceSite).join(', ')}`);
    }
  }

  // Save HTML report
  const reportPath = `/tmp/${brandName.toLowerCase()}-leakage-report.html`;
  const html = generateLeakageHTMLReport(report, {
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
