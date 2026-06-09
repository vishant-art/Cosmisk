/**
 * Run client-aware Cohort LTV Analysis with Smashed-branded report
 * Usage: node scripts/run-client-cohort-ltv.mjs <brand_name>
 */

import 'dotenv/config';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/cosmisk.db');

const { analyzeCohortLTVForClient, generateCohortLTVHTMLReport } = await import('../dist/services/cohort-ltv-analyzer.js');

const db = new Database(DB_PATH);
const brandName = process.argv[2] || 'Pratapsons';
const client = db.prepare(`SELECT * FROM service_clients WHERE brand_name = ?`).get(brandName);

if (!client) {
  console.log(`❌ Client "${brandName}" not found`);
  process.exit(1);
}

console.log('📊 Running Cohort LTV Analysis');
console.log('─'.repeat(50));
console.log(`Client: ${client.brand_name}`);
console.log(`Level:  ${client.revenue_level}`);
console.log('');

try {
  const report = await analyzeCohortLTVForClient(client.id, { days: 90 });

  if (!report) {
    console.log('❌ No report generated');
    process.exit(1);
  }

  console.log('\n✅ Cohort LTV Report Generated');
  console.log('═'.repeat(50));
  console.log(`Total Customers:    ${report.totalCustomers.toLocaleString('en-IN')}`);
  console.log(`Average LTV:        ₹${Math.round(report.avgAccountLTV).toLocaleString('en-IN')}`);
  console.log(`LTV Gap:            ₹${Math.round(report.ltvGap).toLocaleString('en-IN')}`);
  console.log(`Best Channel:       ${report.bestChannel?.displayName || 'N/A'}`);
  console.log(`Worst Channel:      ${report.worstChannel?.displayName || 'N/A'}`);
  console.log(`Alert Triggered:    ${report.shouldAlert ? '⚠️ YES' : 'No'}`);

  if (report.channels.length > 0) {
    console.log('\n📈 Channel Breakdown:');
    for (const ch of report.channels.slice(0, 5)) {
      console.log(`  • ${ch.displayName}: ₹${Math.round(ch.avgLTV).toLocaleString('en-IN')} LTV | ${ch.repeatRate.toFixed(0)}% repeat`);
    }
  }

  const reportPath = `/tmp/${brandName.toLowerCase()}-cohort-ltv-report.html`;
  const html = generateCohortLTVHTMLReport(report, {
    id: client.id, brandName: client.brand_name, revenueLevel: client.revenue_level,
    category: client.category, shopifyStore: client.shopify_store,
    metaAdAccountId: client.meta_ad_account_id, alertThreshold: client.alert_threshold,
  });
  fs.writeFileSync(reportPath, html);
  console.log(`\n📄 HTML Report: ${reportPath}`);

} catch (e) {
  console.error('❌ Error:', e.message);
}

db.close();
