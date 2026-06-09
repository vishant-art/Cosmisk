import 'dotenv/config';
import Database from 'better-sqlite3';
import crypto from 'crypto';

const AD_ACCOUNT_ID = 'act_1738503939658460';

function decryptToken(stored) {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  const keyBuffer = Buffer.alloc(32);
  Buffer.from(key).copy(keyBuffer);
  const [ivHex, authTagHex, ciphertext] = stored.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

const db = new Database('./data/cosmisk.db');
const tokenRow = db.prepare('SELECT encrypted_access_token FROM meta_tokens LIMIT 1').get();
const META_TOKEN = decryptToken(tokenRow.encrypted_access_token);

const today = new Date();
const startDate = new Date(today);
startDate.setDate(today.getDate() - 14);
const dateRange = { since: startDate.toISOString().split('T')[0], until: today.toISOString().split('T')[0] };

// Check campaign names and objectives
const campaignResp = await fetch(`https://graph.facebook.com/v21.0/${AD_ACCOUNT_ID}/insights?` + new URLSearchParams({
  fields: 'campaign_name,objective,spend,actions,action_values',
  time_range: JSON.stringify(dateRange),
  level: 'campaign',
  limit: 20,
  access_token: META_TOKEN,
}));
const campaigns = await campaignResp.json();

console.log('=== CAMPAIGN NAMES & OBJECTIVES ===');
(campaigns.data || []).slice(0, 15).forEach(c => {
  const name = (c.campaign_name || 'Unknown').substring(0, 45).padEnd(45);
  const obj = (c.objective || 'N/A').padEnd(18);
  const spend = parseFloat(c.spend || 0).toFixed(0).padStart(7);
  const purchases = (c.actions || []).find(a => a.action_type === 'purchase' || a.action_type === 'omni_purchase');
  const revenue = (c.action_values || []).find(a => a.action_type === 'purchase' || a.action_type === 'omni_purchase');
  console.log(`  ${name} | ${obj} | ₹${spend} | ${purchases?.value || 0} purch | ₹${revenue?.value || 0} rev`);
});

// Check region data
const regionResp = await fetch(`https://graph.facebook.com/v21.0/${AD_ACCOUNT_ID}/insights?` + new URLSearchParams({
  fields: 'spend,actions,action_values',
  time_range: JSON.stringify(dateRange),
  breakdowns: 'region',
  limit: 10,
  access_token: META_TOKEN,
}));
const regions = await regionResp.json();

console.log('\n=== TOP REGIONS ===');
(regions.data || []).slice(0, 8).forEach(r => {
  const name = (r.region || 'Unknown').padEnd(25);
  const spend = parseFloat(r.spend || 0).toFixed(0).padStart(7);
  const purchases = (r.actions || []).find(a => a.action_type === 'purchase' || a.action_type === 'omni_purchase');
  const revenue = (r.action_values || []).find(a => a.action_type === 'purchase' || a.action_type === 'omni_purchase');
  console.log(`  ${name} | ₹${spend} | ${purchases?.value || 0} purch | ₹${revenue?.value || 0} rev`);
});

db.close();
