#!/usr/bin/env npx tsx
/**
 * Add Shopify-related database tables
 */

import Database from 'better-sqlite3';

const db = new Database('./data/cosmisk.db');

// Add shopify_domain column to brands table
try {
  db.exec(`ALTER TABLE brands ADD COLUMN shopify_domain TEXT`);
  console.log('✅ Added shopify_domain to brands table');
} catch (e: any) {
  if (e.message.includes('duplicate column')) {
    console.log('ℹ️  shopify_domain column already exists');
  } else {
    throw e;
  }
}

// Create shopify_tokens table
db.exec(`
  CREATE TABLE IF NOT EXISTS shopify_tokens (
    brand_id TEXT PRIMARY KEY REFERENCES brands(id) ON DELETE CASCADE,
    shop_domain TEXT NOT NULL,
    encrypted_access_token TEXT NOT NULL,
    scope TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
console.log('✅ Created shopify_tokens table');

// Update existing brands with Shopify domains (if known)
const updateStmt = db.prepare(`
  UPDATE brands SET shopify_domain = ? WHERE id = ?
`);

// Add known Shopify domains
updateStmt.run('casorro.myshopify.com', 'casorro');
updateStmt.run('pratapsons.myshopify.com', 'pratap-sons');
updateStmt.run('salt-attire.myshopify.com', 'salt-attire');

console.log('✅ Updated brand Shopify domains');

db.close();
