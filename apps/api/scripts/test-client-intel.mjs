/**
 * Test client-aware competitor intel for Pratapsons
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/cosmisk.db');

const db = new Database(DB_PATH);

// Get Pratapsons client
const client = db.prepare(`SELECT * FROM service_clients WHERE brand_name = 'Pratapsons'`).get();

if (!client) {
  console.log('❌ Pratapsons not found. Run setup-pratapsons-client.mjs first.');
  process.exit(1);
}

console.log('📊 Pratapsons Client Profile:');
console.log('─'.repeat(50));
console.log(`ID:            ${client.id}`);
console.log(`Brand:         ${client.brand_name}`);
console.log(`Category:      ${client.category}`);
console.log(`Revenue Level: ${client.revenue_level}`);
console.log(`Price Range:   Rs ${client.price_point_min?.toLocaleString()} - ${client.price_point_max?.toLocaleString()}`);

// Check competitor intel store
const store = db.prepare(`SELECT * FROM competitor_intel_store WHERE client_id = ?`).get(client.id);

console.log('\n🤖 Competitor Intel Store:');
console.log('─'.repeat(50));
if (store) {
  const refs = JSON.parse(store.references_shown || '[]');
  console.log(`References Shown:    ${refs.length}`);
  console.log(`Search Queries Used: ${store.search_queries_used || '[]'}`);
  console.log(`Last Scrape:         ${store.last_scrape_at || 'Never'}`);
  console.log(`Last Report:         ${store.last_report_at || 'Never'}`);
} else {
  console.log('❌ No competitor intel store found');
}

console.log('\n✅ Client ready for competitor intel');
console.log(`\nTo run competitor intel, use:\n`);
console.log(`  import { runCompetitorIntelForClient } from './services/competitor-creative-intel.js';`);
console.log(`  const report = await runCompetitorIntelForClient('${client.id}');`);

db.close();
