/**
 * Run client-aware Fatigue Detection with Smashed-branded report
 * Usage: node scripts/run-client-fatigue.mjs <brand_name>
 */

import 'dotenv/config';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/cosmisk.db');

const { detectFatigueForClient, generateFatigueHTMLReport } = await import('../dist/services/fatigue-detector.js');

const db = new Database(DB_PATH);
const brandName = process.argv[2] || 'Pratapsons';
const client = db.prepare(`SELECT * FROM service_clients WHERE brand_name = ?`).get(brandName);

if (!client) {
  console.log(`❌ Client "${brandName}" not found`);
  process.exit(1);
}

console.log('🔥 Running Fatigue Detection');
console.log('─'.repeat(50));
console.log(`Client: ${client.brand_name}`);
console.log(`Level:  ${client.revenue_level}`);
console.log('');

// Sample creatives (in real usage, fetch from Meta API)
const sampleCreatives = [
  { id: '1', name: 'UGC Summer Sale', format: 'video', spend: 15000, impressions: 50000, clicks: 1200, conversions: 45, revenue: 67500, frequency: 3.2, ctr: 2.4, cpm: 300, roas: 4.5, daysActive: 12 },
  { id: '2', name: 'Static Product Hero', format: 'image', spend: 8000, impressions: 35000, clicks: 420, conversions: 12, revenue: 14400, frequency: 4.8, ctr: 1.2, cpm: 228, roas: 1.8, daysActive: 21 },
  { id: '3', name: 'Carousel Bestsellers', format: 'carousel', spend: 12000, impressions: 42000, clicks: 890, conversions: 28, revenue: 39200, frequency: 2.8, ctr: 2.1, cpm: 285, roas: 3.3, daysActive: 8 },
  { id: '4', name: 'Old Banner Ad', format: 'image', spend: 5000, impressions: 20000, clicks: 180, conversions: 0, revenue: 0, frequency: 5.2, ctr: 0.9, cpm: 250, roas: 0, daysActive: 45 },
  { id: '5', name: 'New Launch Video', format: 'video', spend: 3000, impressions: 12000, clicks: 450, conversions: 18, revenue: 27000, frequency: 1.5, ctr: 3.75, cpm: 250, roas: 9.0, daysActive: 3 },
];

try {
  const report = detectFatigueForClient(client.id, sampleCreatives);

  if (!report) {
    console.log('❌ No report generated');
    process.exit(1);
  }

  console.log('\n✅ Fatigue Report Generated');
  console.log('═'.repeat(50));
  console.log(`Total Creatives:    ${report.summary.total}`);
  console.log(`Scaling:            ${report.summary.scaling}`);
  console.log(`Healthy:            ${report.summary.healthy}`);
  console.log(`Watch:              ${report.summary.watch}`);
  console.log(`Fatiguing:          ${report.summary.fatiguing}`);
  console.log(`Dead:               ${report.summary.dead}`);
  console.log(`Frequency Threshold: ${report.frequencyThreshold}+`);
  console.log(`Alert Triggered:    ${report.shouldAlert ? '⚠️ YES' : 'No'}`);

  if (report.newFatiguedCreatives.length > 0) {
    console.log(`\n🆕 New Fatigued: ${report.newFatiguedCreatives.length}`);
  }

  const reportPath = `/tmp/${brandName.toLowerCase()}-fatigue-report.html`;
  const html = generateFatigueHTMLReport(report, {
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
