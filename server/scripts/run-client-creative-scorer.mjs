/**
 * Run client-aware Creative Scorer with Smashed-branded report
 * Usage: node scripts/run-client-creative-scorer.mjs <brand_name>
 */

import 'dotenv/config';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/cosmisk.db');

// Dynamic import for ES module
const { scoreCreativesForClient, generateCreativeScorerHTMLReport } = await import('../dist/services/creative-scorer.js');

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

console.log('🎨 Running Creative Scorer');
console.log('─'.repeat(50));
console.log(`Client: ${client.brand_name}`);
console.log(`Level:  ${client.revenue_level}`);
console.log('');

// Sample creatives to score (in real usage, these would come from the creative pipeline)
const sampleCreatives = [
  {
    format: 'video',
    hookType: 'Pattern Interrupt',
    dnaTags: {
      hook: ['question', 'urgency'],
      visual: ['product_hero', 'lifestyle'],
      audio: ['voiceover', 'music_upbeat'],
    },
    platform: 'meta',
    metaAccountId: client.meta_ad_account_id,
  },
  {
    format: 'static',
    hookType: 'Social Proof',
    dnaTags: {
      hook: ['testimonial', 'numbers'],
      visual: ['product_flat', 'text_heavy'],
      cta: ['shop_now'],
    },
    platform: 'meta',
    metaAccountId: client.meta_ad_account_id,
  },
  {
    format: 'carousel',
    hookType: 'Curiosity Gap',
    dnaTags: {
      hook: ['curiosity', 'benefit_led'],
      visual: ['product_sequence', 'lifestyle'],
      cta: ['learn_more'],
    },
    platform: 'meta',
    metaAccountId: client.meta_ad_account_id,
  },
  {
    format: 'video',
    hookType: 'Problem-Solution',
    dnaTags: {
      hook: ['pain_point', 'transformation'],
      visual: ['before_after', 'ugc'],
      audio: ['voiceover', 'music_emotional'],
    },
    platform: 'meta',
    metaAccountId: client.meta_ad_account_id,
  },
  {
    format: 'static',
    hookType: 'Offer/Discount',
    dnaTags: {
      hook: ['discount', 'urgency', 'scarcity'],
      visual: ['product_hero', 'price_callout'],
      cta: ['buy_now'],
    },
    platform: 'meta',
    metaAccountId: client.meta_ad_account_id,
  },
];

try {
  const report = await scoreCreativesForClient(client.id, sampleCreatives);

  if (!report) {
    console.log('❌ No report generated');
    process.exit(1);
  }

  console.log('\n✅ Creative Scorer Report Generated');
  console.log('═'.repeat(50));
  console.log(`Creatives Scored:   ${report.summary.totalScored}`);
  console.log(`Average Score:      ${report.summary.avgScore}/100`);
  console.log(`Quality Threshold:  ${report.scoreThreshold}+`);
  console.log(`Above Threshold:    ${report.summary.aboveThreshold}`);
  console.log(`Below Threshold:    ${report.summary.belowThreshold}`);
  console.log(`Top Format:         ${report.summary.topFormat}`);
  console.log(`Alert Triggered:    ${report.shouldAlert ? '⚠️ YES' : 'No'}`);

  console.log('\n📊 Individual Scores:');
  for (const s of report.scores) {
    const status = s.meetsThreshold ? '✅' : '⚠️';
    console.log(`  ${status} ${s.input.format.padEnd(10)} | Score: ${s.score.total}/100 | ${s.score.topInsight.substring(0, 50)}...`);
  }

  if (report.summary.winningPatterns.length > 0) {
    console.log('\n🏆 Winning Patterns:');
    console.log(`  ${report.summary.winningPatterns.join(', ')}`);
  }

  // Save HTML report
  const reportPath = `/tmp/${brandName.toLowerCase()}-creative-scorer-report.html`;
  const html = generateCreativeScorerHTMLReport(report, {
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
