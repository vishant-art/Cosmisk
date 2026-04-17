#!/usr/bin/env npx tsx
/**
 * Add database tables for Audit System
 */

import Database from 'better-sqlite3';

const db = new Database('./data/cosmisk.db');

// Create brands table
db.exec(`
  CREATE TABLE IF NOT EXISTS brands (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    domain TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    stage TEXT NOT NULL DEFAULT 'scaling',
    meta_ad_account_id TEXT,
    pixel_id TEXT,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Create brand_context table (stores learned patterns)
db.exec(`
  CREATE TABLE IF NOT EXISTS brand_context (
    brand_id TEXT PRIMARY KEY REFERENCES brands(id) ON DELETE CASCADE,
    price_point TEXT,
    target_audience TEXT,
    winning_patterns TEXT DEFAULT '[]',
    failed_approaches TEXT DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Create audits table (stores audit history)
db.exec(`
  CREATE TABLE IF NOT EXISTS audits (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL,
    brand_name TEXT NOT NULL,
    date_range_start TEXT NOT NULL,
    date_range_end TEXT NOT NULL,
    health_score INTEGER,
    wasted_spend REAL,
    best_cpa REAL,
    worst_cpa REAL,
    top_findings TEXT,
    top_priority TEXT,
    confidence_level TEXT,
    full_output TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Insert initial brand records for existing accounts
const insertBrand = db.prepare(`
  INSERT OR IGNORE INTO brands (id, name, domain, category, stage, meta_ad_account_id)
  VALUES (?, ?, ?, ?, ?, ?)
`);

// Add known brands
insertBrand.run('casorro', 'Casorro', 'casorro.in', 'fashion', 'scaling', 'act_1221854506209666');
insertBrand.run('pratap-sons', 'Pratap Sons', 'pratapsons.com', 'fashion', 'scaling', 'act_1738503939658460');
insertBrand.run('salt-attire', 'Salt Attire', 'saltattire.com', 'fashion', 'scaling', 'act_26408351442104125');

console.log('✅ Created tables: brands, brand_context, audits');
console.log('✅ Inserted initial brand records');

// Verify
const brands = db.prepare('SELECT id, name, meta_ad_account_id FROM brands').all();
console.log('\n📋 Brands:');
for (const b of brands as any[]) {
  console.log(`   - ${b.name} (${b.id}): ${b.meta_ad_account_id}`);
}

db.close();
