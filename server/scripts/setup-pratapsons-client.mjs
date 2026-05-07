/**
 * Set up Pratapsons as the first Bridge Service client
 * Run: node scripts/setup-pratapsons-client.mjs
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/cosmisk.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

console.log('🚀 Setting up Pratapsons as Bridge Service client\n');

// Check if tables exist
const tables = db.prepare(`
  SELECT name FROM sqlite_master
  WHERE type='table' AND name='service_clients'
`).get();

if (!tables) {
  console.log('❌ service_clients table not found. Run the server first to create tables.');
  process.exit(1);
}

// Check if Pratapsons already exists
const existing = db.prepare(`
  SELECT id FROM service_clients WHERE brand_name = 'Pratapsons'
`).get();

if (existing) {
  console.log('✅ Pratapsons already exists in service_clients');
  console.log(`   ID: ${existing.id}`);
} else {
  // Create Pratapsons client
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO service_clients (
      id, brand_name, category, revenue_level,
      price_point_min, price_point_max,
      meta_ad_account_id, shopify_store, slack_channel, whatsapp_number,
      alert_threshold, service_tier, status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    'Pratapsons',
    'premium_ethnic_menswear',
    '1cr_plus',
    5000,  // Min price point Rs 5K
    50000, // Max price point Rs 50K
    null,  // Will add Meta account ID when known
    null,  // Will add Shopify store when known
    '#pratapsons-alerts',
    null,  // WhatsApp to be added
    5000,  // Alert threshold Rs 5000 (higher for scaled brand)
    'done_for_you',
    'active',
    'First Bridge Service client. Scaled D2C brand doing Rs 1Cr+/month. Premium ethnic menswear - sherwanis, kurtas, wedding wear.',
    now,
    now
  );

  // Initialize agent stores
  db.prepare('INSERT OR IGNORE INTO competitor_intel_store (client_id) VALUES (?)').run(id);
  db.prepare('INSERT OR IGNORE INTO oos_agent_store (client_id) VALUES (?)').run(id);
  db.prepare('INSERT OR IGNORE INTO discount_agent_store (client_id) VALUES (?)').run(id);
  db.prepare('INSERT OR IGNORE INTO creative_agent_store (client_id) VALUES (?)').run(id);

  console.log('✅ Created Pratapsons client');
  console.log(`   ID: ${id}`);
}

// Show client details
const client = db.prepare(`SELECT * FROM service_clients WHERE brand_name = 'Pratapsons'`).get();

console.log('\n📊 Client Profile:');
console.log('─'.repeat(50));
console.log(`Brand:         ${client.brand_name}`);
console.log(`Category:      ${client.category}`);
console.log(`Revenue Level: ${client.revenue_level}`);
console.log(`Price Range:   Rs ${client.price_point_min?.toLocaleString()} - ${client.price_point_max?.toLocaleString()}`);
console.log(`Service Tier:  ${client.service_tier}`);
console.log(`Status:        ${client.status}`);
console.log(`Alert @ Rs:    ${client.alert_threshold?.toLocaleString()}`);

// Show agent stores
console.log('\n🤖 Agent Stores Initialized:');
const competitorStore = db.prepare('SELECT * FROM competitor_intel_store WHERE client_id = ?').get(client.id);
const oosStore = db.prepare('SELECT * FROM oos_agent_store WHERE client_id = ?').get(client.id);
const discountStore = db.prepare('SELECT * FROM discount_agent_store WHERE client_id = ?').get(client.id);
const creativeStore = db.prepare('SELECT * FROM creative_agent_store WHERE client_id = ?').get(client.id);

console.log(`✅ Competitor Intel Store: ${competitorStore ? 'Ready' : '❌ Missing'}`);
console.log(`✅ OOS Agent Store:        ${oosStore ? 'Ready' : '❌ Missing'}`);
console.log(`✅ Discount Agent Store:   ${discountStore ? 'Ready' : '❌ Missing'}`);
console.log(`✅ Creative Agent Store:   ${creativeStore ? 'Ready' : '❌ Missing'}`);

console.log('\n✅ Pratapsons setup complete!\n');

console.log(`
📋 NEXT STEPS:
1. Add Meta Ad Account ID when available
2. Add Shopify store URL when connected
3. Run competitor intel with client context:

   import { getClientContext } from './services/service-clients.js';
   const ctx = getClientContext('${client.id}');
   // ctx.client.revenueLevel = '1cr_plus'
   // Use this to filter for appropriate competitor references

4. Track references shown to avoid duplicates:

   import { addReferenceShown, hasReferenceBeenShown } from './services/service-clients.js';
   if (!hasReferenceBeenShown(clientId, adId)) {
     addReferenceShown(clientId, adId);
     // Include in report
   }
`);

db.close();
