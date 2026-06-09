/**
 * Elite Decision Compression - Live Pratapsons Test
 *
 * NOT a report generator. A strategic leverage discovery system.
 *
 * Success criteria:
 * - Would this genuinely change operator behavior?
 * - Would a senior media buyer already know this?
 * - Does this expose hidden leverage?
 * - Does this compress strategic thinking?
 */

import 'dotenv/config';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import the new elite engine
const { createEliteDecisionEngine } = await import('../dist/services/strategic-cognition/elite-decision-compression.js');

// ============================================================================
// CONFIG
// ============================================================================

const AD_ACCOUNT_ID = 'act_1738503939658460';
const CLIENT_ID = 'pratapsons';
const DAYS = parseInt(process.argv[2]) || 14;

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

console.log('\n' + '═'.repeat(70));
console.log('ELITE DECISION COMPRESSION');
console.log('Pratapsons | Last ' + DAYS + ' Days | Founder-Grade Intelligence');
console.log('═'.repeat(70) + '\n');

// Get token
const db = new Database('./data/cosmisk.db');
const tokenRow = db.prepare('SELECT encrypted_access_token FROM meta_tokens LIMIT 1').get();
const META_TOKEN = decryptToken(tokenRow.encrypted_access_token);

// ============================================================================
// PULL LIVE DATA
// ============================================================================

console.log('[DATA] Pulling live Meta Ads data...');

const today = new Date();
const startDate = new Date(today);
startDate.setDate(today.getDate() - DAYS);
const prevStartDate = new Date(startDate);
prevStartDate.setDate(prevStartDate.getDate() - DAYS);

const dateRange = { since: startDate.toISOString().split('T')[0], until: today.toISOString().split('T')[0] };
const prevDateRange = { since: prevStartDate.toISOString().split('T')[0], until: startDate.toISOString().split('T')[0] };

// Fetch current period
const currentResp = await fetch(`https://graph.facebook.com/v21.0/${AD_ACCOUNT_ID}/insights?` + new URLSearchParams({
  fields: 'spend,impressions,clicks,actions,action_values,ctr,cpc,cpm,frequency,reach',
  time_range: JSON.stringify(dateRange),
  access_token: META_TOKEN,
}));
const currentData = await currentResp.json();

// Fetch previous period
const prevResp = await fetch(`https://graph.facebook.com/v21.0/${AD_ACCOUNT_ID}/insights?` + new URLSearchParams({
  fields: 'spend,impressions,clicks,actions,action_values,ctr,cpc,cpm,frequency,reach',
  time_range: JSON.stringify(prevDateRange),
  access_token: META_TOKEN,
}));
const prevData = await prevResp.json();

// Fetch campaigns
const campaignResp = await fetch(`https://graph.facebook.com/v21.0/${AD_ACCOUNT_ID}/insights?` + new URLSearchParams({
  fields: 'campaign_name,spend,impressions,clicks,actions,action_values,ctr,frequency,reach',
  time_range: JSON.stringify(dateRange),
  level: 'campaign',
  limit: 100,
  access_token: META_TOKEN,
}));
const campaignData = await campaignResp.json();

// Fetch ads
const adResp = await fetch(`https://graph.facebook.com/v21.0/${AD_ACCOUNT_ID}/insights?` + new URLSearchParams({
  fields: 'ad_name,spend,impressions,clicks,actions,action_values,ctr,frequency',
  time_range: JSON.stringify(dateRange),
  level: 'ad',
  limit: 200,
  access_token: META_TOKEN,
}));
const adData = await adResp.json();

// Fetch regions
const regionResp = await fetch(`https://graph.facebook.com/v21.0/${AD_ACCOUNT_ID}/insights?` + new URLSearchParams({
  fields: 'spend,impressions,clicks,actions,action_values',
  time_range: JSON.stringify(dateRange),
  breakdowns: 'region',
  limit: 100,
  access_token: META_TOKEN,
}));
const regionData = await regionResp.json();

// Parse helpers
function parseActions(actions, type = 'purchase') {
  if (!actions) return 0;
  const action = actions.find(a => a.action_type === type || a.action_type === 'omni_purchase');
  return action ? parseFloat(action.value) : 0;
}

function parseActionValues(actionValues) {
  if (!actionValues) return 0;
  const pv = actionValues.find(a => a.action_type === 'purchase' || a.action_type === 'omni_purchase');
  return pv ? parseFloat(pv.value) : 0;
}

const current = currentData.data?.[0] || {};
const prev = prevData.data?.[0] || {};

// Build Meta data structure for the engine
const metaData = {
  current: {
    spend: parseFloat(current.spend || 0),
    impressions: parseInt(current.impressions || 0),
    clicks: parseInt(current.clicks || 0),
    conversions: parseActions(current.actions),
    revenue: parseActionValues(current.action_values),
    roas: 0,
    cpa: 0,
    ctr: parseFloat(current.ctr || 0),
    frequency: parseFloat(current.frequency || 0),
    reach: parseInt(current.reach || 0),
  },
  changes: {
    roasChange: 0,
    cpaChange: 0,
    spendChange: 0,
    frequencyChange: 0,
  },
  campaigns: (campaignData.data || []).map(c => ({
    name: c.campaign_name,
    spend: parseFloat(c.spend || 0),
    conversions: parseActions(c.actions),
    revenue: parseActionValues(c.action_values),
    ctr: parseFloat(c.ctr || 0),
    frequency: parseFloat(c.frequency || 0),
    reach: parseInt(c.reach || 0),
  })).filter(c => c.spend > 1000),
  ads: (adData.data || []).map(a => ({
    name: a.ad_name,
    spend: parseFloat(a.spend || 0),
    conversions: parseActions(a.actions),
    revenue: parseActionValues(a.action_values),
    ctr: parseFloat(a.ctr || 0),
    frequency: parseFloat(a.frequency || 0),
  })).filter(a => a.spend > 500),
  regions: (regionData.data || []).map(r => ({
    name: r.region,
    spend: parseFloat(r.spend || 0),
    conversions: parseActions(r.actions),
    revenue: parseActionValues(r.action_values),
    impressions: parseInt(r.impressions || 0),
  })).filter(r => r.spend > 1000).sort((a, b) => b.spend - a.spend),
};

// Calculate derived metrics
metaData.current.roas = metaData.current.revenue / metaData.current.spend || 0;
metaData.current.cpa = metaData.current.spend / metaData.current.conversions || 0;

const prevSpend = parseFloat(prev.spend || 0);
const prevConversions = parseActions(prev.actions);
const prevRevenue = parseActionValues(prev.action_values);
const prevROAS = prevRevenue / prevSpend || 0;
const prevCPA = prevSpend / prevConversions || 0;
const prevFreq = parseFloat(prev.frequency || 0);

metaData.changes.roasChange = prevROAS > 0 ? ((metaData.current.roas - prevROAS) / prevROAS * 100) : 0;
metaData.changes.cpaChange = prevCPA > 0 ? ((metaData.current.cpa - prevCPA) / prevCPA * 100) : 0;
metaData.changes.spendChange = prevSpend > 0 ? ((metaData.current.spend - prevSpend) / prevSpend * 100) : 0;
metaData.changes.frequencyChange = prevFreq > 0 ? ((metaData.current.frequency - prevFreq) / prevFreq * 100) : 0;

console.log(`  Spend: ₹${(metaData.current.spend / 100000).toFixed(2)}L`);
console.log(`  ROAS: ${metaData.current.roas.toFixed(2)}x (${metaData.changes.roasChange > 0 ? '+' : ''}${metaData.changes.roasChange.toFixed(1)}%)`);
console.log(`  CPA: ₹${metaData.current.cpa.toFixed(0)} (${metaData.changes.cpaChange > 0 ? '+' : ''}${metaData.changes.cpaChange.toFixed(1)}%)`);
console.log(`  Frequency: ${metaData.current.frequency.toFixed(2)}x`);
console.log(`  Campaigns: ${metaData.campaigns.length} | Ads: ${metaData.ads.length} | Regions: ${metaData.regions.length}`);

// ============================================================================
// RUN ELITE DECISION COMPRESSION
// ============================================================================

console.log('\n[COMPRESS] Running Elite Decision Compression...');

const engine = createEliteDecisionEngine(CLIENT_ID, metaData.current.spend * 2);
const result = await engine.compress({ meta: metaData });

// ============================================================================
// OUTPUT FOUNDER-GRADE INTELLIGENCE
// ============================================================================

console.log('\n' + '═'.repeat(70));
console.log('FOUNDER-GRADE INTELLIGENCE');
console.log('═'.repeat(70));

// Quality Gate
console.log(`\n[QUALITY GATE] Score: ${result.founderWowScore}/100 | Pass: ${result.qualityGatePass ? '✅ YES' : '❌ NO'}`);
if (result.rejectionReasons.length > 0) {
  console.log('  Gaps:');
  result.rejectionReasons.forEach(r => console.log(`    - ${r}`));
}

// The One Thing - Risk
if (result.biggestRisk) {
  console.log('\n' + '─'.repeat(70));
  console.log('🚨 BIGGEST HIDDEN RISK');
  console.log('─'.repeat(70));
  console.log(`\n  ${result.biggestRisk.headline}`);
  console.log(`\n  Context: ${result.biggestRisk.context}`);
  console.log(`\n  Economic Impact: ₹${(result.biggestRisk.economicMagnitude / 100000).toFixed(1)}L/month at risk`);
  console.log(`  Why Invisible: ${result.biggestRisk.invisibilityReason}`);
  console.log(`  Confidence: ${result.biggestRisk.confidenceLevel}`);
  if (result.biggestRisk.actionSystem) {
    console.log(`\n  ACTION: ${result.biggestRisk.actionSystem.type}`);
    console.log(`  Expected: ${result.biggestRisk.actionSystem.expectedOutcome}`);
    console.log(`  Measure: ${result.biggestRisk.actionSystem.measurementPlan}`);
  }
}

// The One Thing - Leverage
if (result.biggestLeverage) {
  console.log('\n' + '─'.repeat(70));
  console.log('💰 BIGGEST LEVERAGE OPPORTUNITY');
  console.log('─'.repeat(70));
  console.log(`\n  ${result.biggestLeverage.headline}`);
  console.log(`\n  Context: ${result.biggestLeverage.context}`);
  console.log(`\n  Economic Impact: +₹${(result.biggestLeverage.economicMagnitude / 100000).toFixed(1)}L/month potential`);
  console.log(`  Why Not Obvious: ${result.biggestLeverage.invisibilityReason}`);
  if (result.biggestLeverage.actionSystem) {
    console.log(`\n  ACTION: ${result.biggestLeverage.actionSystem.type}`);
    console.log(`  Expected: ${result.biggestLeverage.actionSystem.expectedOutcome}`);
  }
}

// The One Thing - Blocker
if (result.biggestBlocker) {
  console.log('\n' + '─'.repeat(70));
  console.log('🚫 BIGGEST SCALING BLOCKER');
  console.log('─'.repeat(70));
  console.log(`\n  ${result.biggestBlocker.headline}`);
  console.log(`\n  Context: ${result.biggestBlocker.context}`);
  console.log(`\n  Growth Blocked: ₹${(result.biggestBlocker.economicMagnitude / 100000).toFixed(1)}L/month ceiling`);
  if (result.biggestBlocker.actionSystem) {
    console.log(`\n  FIX: ${result.biggestBlocker.actionSystem.type}`);
    console.log(`  Expected: ${result.biggestBlocker.actionSystem.expectedOutcome}`);
  }
}

// Hidden Contradictions
if (result.contradictions.length > 0) {
  console.log('\n' + '─'.repeat(70));
  console.log('⚡ HIDDEN CONTRADICTIONS');
  console.log('─'.repeat(70));
  result.contradictions.forEach((c, i) => {
    console.log(`\n  ${i + 1}. ${c.contradiction}`);
    console.log(`     ${c.signal1.metric} (${c.signal1.direction}) vs ${c.signal2.metric} (${c.signal2.direction})`);
    console.log(`     Impact: ₹${(c.economicImpact / 100000).toFixed(1)}L | Urgency: ${c.urgency.toUpperCase()}`);
    console.log(`     → ${c.implications}`);
  });
}

// Account Decomposition (warm vs cold reality)
console.log('\n' + '─'.repeat(70));
console.log('📊 ACCOUNT DECOMPOSITION (Reality Behind Dashboard)');
console.log('─'.repeat(70));
const d = result.accountDecomposition;
console.log(`\n  Blended ROAS (what dashboard shows): ${d.blendedROAS.toFixed(2)}x`);
console.log(`  True Acquisition ROAS (cold only): ${d.trueAcquisitionROAS.toFixed(2)}x`);
console.log(`  ROAS Mirage Score: ${d.roasMirageScore.toFixed(0)}% (warm recycling inflation)`);
console.log(`  Warm Audience Share: ${d.warmAudienceShare.toFixed(0)}% of conversions`);
console.log(`  Warm Audience Runway: ~${d.warmAudienceRunway} days`);
console.log(`  Acquisition Health: ${d.acquisitionHealthScore}/100`);

// Geographic Asymmetries (only show if we have meaningful data)
const meaningfulGeo = result.geographicAsymmetries.filter(g => g.roasMultiple > 0.1);
if (meaningfulGeo.length > 0) {
  console.log('\n' + '─'.repeat(70));
  console.log('🗺️  GEOGRAPHIC ASYMMETRIES');
  console.log('─'.repeat(70));
  console.log('\n  Region | Spend Share | Efficiency | Untapped Potential');
  console.log('  ' + '-'.repeat(60));
  meaningfulGeo.slice(0, 5).forEach(g => {
    console.log(`  ${g.region.padEnd(15)} | ${g.spendShare.toFixed(1).padStart(6)}% | ${g.roasMultiple.toFixed(2).padStart(6)}x | ₹${(g.untappedPotential / 100000).toFixed(1)}L`);
  });
} else if (result.geographicAsymmetries.length > 0) {
  console.log('\n' + '─'.repeat(70));
  console.log('🗺️  GEOGRAPHIC DATA');
  console.log('─'.repeat(70));
  console.log('\n  ⚠️  Regional conversion data unavailable from Meta API');
  console.log('  Top spend regions: ' + result.geographicAsymmetries.slice(0, 3).map(g => g.region).join(', '));
}

// Creative System Health
console.log('\n' + '─'.repeat(70));
console.log('🎨 CREATIVE SYSTEM HEALTH');
console.log('─'.repeat(70));
const c = result.creativeSystemHealth;
console.log(`\n  Winner Concentration: ${c.winnerConcentration.toFixed(0)}% (>50% = vulnerability)`);
console.log(`  Winner Fatigue Runway: ${c.winnerFatigueDays} days`);
console.log(`  Pipeline Depth: ${c.pipelineDepth} proven backups`);
console.log(`  Persuasion Strength: ${c.persuasionSystemStrength}/100`);

// Audience Quality
console.log('\n' + '─'.repeat(70));
console.log('👥 AUDIENCE QUALITY');
console.log('─'.repeat(70));
const a = result.audienceQualityDecay;
console.log(`\n  Exhaustion Score: ${a.audienceExhaustionScore}/100`);
console.log(`  Days Until Critical: ${a.daysUntilCritical}`);
console.log(`  Required Expansion: ${a.requiredAudienceExpansion}%`);

// Summary
console.log('\n' + '═'.repeat(70));
console.log('SYNTHESIS');
console.log('═'.repeat(70));
console.log(`\n  Analysis Depth: ${result.analysisDepth.toUpperCase()}`);
console.log(`  Cross-Platform Sources: ${result.crossPlatformSynthesis.join(', ')}`);
console.log(`  Why Automation Needed: ${result.impossibleManuallyBecause}`);
console.log(`\n  Founder Wow Score: ${result.founderWowScore}/100`);

// Generate HTML if quality gate passes
if (result.founderWowScore >= 40) {
  const html = generateEliteHTML(result, metaData);
  const outputPath = path.join(__dirname, '..', `elite-intel-${CLIENT_ID}-${Date.now()}.html`);
  fs.writeFileSync(outputPath, html);
  console.log(`\n✅ REPORT: ${outputPath}`);

  // Open it
  import('child_process').then(cp => cp.exec(`open "${outputPath}"`));
} else {
  console.log('\n❌ Quality gate failed - report not generated');
}

db.close();

// ============================================================================
// HTML Generator
// ============================================================================

function generateEliteHTML(result, metaData) {
  const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Elite Intelligence - Pratapsons</title>
  <style>
    :root { --bg: #0a0a0f; --card: #12121a; --accent: #e94560; --success: #00d26a; --warning: #ffc107; --text: #f1f1f1; --muted: #666; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
    .container { max-width: 1000px; margin: 0 auto; padding: 40px 20px; }

    header { text-align: center; margin-bottom: 50px; }
    .logo { font-size: 12px; color: var(--accent); letter-spacing: 4px; margin-bottom: 15px; }
    h1 { font-size: 2.2rem; margin-bottom: 10px; }
    .subtitle { color: var(--muted); }

    .quality-badge { display: inline-block; margin-top: 20px; padding: 8px 20px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; }
    .quality-badge.pass { background: rgba(0,210,106,0.2); color: var(--success); border: 1px solid var(--success); }
    .quality-badge.fail { background: rgba(233,69,96,0.2); color: var(--accent); border: 1px solid var(--accent); }

    .the-one-thing { background: linear-gradient(135deg, rgba(233,69,96,0.15), rgba(10,10,15,0.9)); border: 2px solid var(--accent); border-radius: 20px; padding: 35px; margin-bottom: 30px; }
    .the-one-thing.leverage { border-color: var(--success); background: linear-gradient(135deg, rgba(0,210,106,0.15), rgba(10,10,15,0.9)); }
    .the-one-thing.blocker { border-color: var(--warning); background: linear-gradient(135deg, rgba(255,193,7,0.15), rgba(10,10,15,0.9)); }

    .tag { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; letter-spacing: 1px; margin-bottom: 15px; }
    .tag.risk { background: var(--accent); color: #fff; }
    .tag.leverage { background: var(--success); color: #000; }
    .tag.blocker { background: var(--warning); color: #000; }

    .headline { font-size: 1.5rem; font-weight: 700; margin-bottom: 20px; line-height: 1.3; }
    .context { color: #ccc; margin-bottom: 25px; font-size: 1rem; line-height: 1.7; }

    .impact-row { display: flex; gap: 30px; flex-wrap: wrap; margin-bottom: 20px; }
    .impact-item { }
    .impact-value { font-size: 1.8rem; font-weight: 700; color: var(--accent); }
    .the-one-thing.leverage .impact-value { color: var(--success); }
    .impact-label { font-size: 0.8rem; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; }

    .action-box { background: rgba(0,0,0,0.3); padding: 20px; border-radius: 12px; border-left: 4px solid var(--accent); }
    .the-one-thing.leverage .action-box { border-left-color: var(--success); }
    .action-box h4 { font-size: 0.85rem; color: var(--accent); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
    .the-one-thing.leverage .action-box h4 { color: var(--success); }

    .contradiction-card { background: var(--card); border-radius: 15px; padding: 25px; margin-bottom: 20px; border-left: 4px solid var(--warning); }
    .contradiction-signals { display: flex; gap: 20px; margin-bottom: 15px; font-size: 0.9rem; }
    .signal { background: rgba(255,255,255,0.05); padding: 10px 15px; border-radius: 8px; }
    .signal-metric { font-weight: 600; }
    .signal-direction { color: var(--muted); }
    .contradiction-text { font-weight: 600; font-size: 1.1rem; margin-bottom: 10px; }
    .contradiction-implication { color: #aaa; font-size: 0.95rem; }

    .decomposition { background: var(--card); border-radius: 15px; padding: 30px; margin-bottom: 30px; }
    .decomposition h3 { margin-bottom: 25px; display: flex; align-items: center; gap: 10px; }
    .decomposition h3::before { content: ''; width: 4px; height: 20px; background: var(--accent); border-radius: 2px; }

    .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }
    .metric-item { background: rgba(0,0,0,0.3); padding: 20px; border-radius: 10px; }
    .metric-item .value { font-size: 1.8rem; font-weight: 700; color: var(--text); margin-bottom: 5px; }
    .metric-item .label { font-size: 0.8rem; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; }
    .metric-item .subtext { font-size: 0.85rem; color: var(--warning); margin-top: 8px; }

    .section { margin-bottom: 30px; }
    .section h3 { font-size: 1.2rem; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; }

    footer { text-align: center; padding: 50px 20px; color: var(--muted); }
    .footer-brand { color: var(--accent); font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">SMASHED AGENCY</div>
      <h1>Elite Strategic Intelligence</h1>
      <div class="subtitle">Pratapsons • ${DAYS} Days • ${timestamp}</div>
      <div class="quality-badge ${result.qualityGatePass ? 'pass' : 'fail'}">
        Founder Wow Score: ${result.founderWowScore}/100
      </div>
    </header>

    ${result.biggestRisk ? `
    <div class="the-one-thing">
      <span class="tag risk">🚨 BIGGEST HIDDEN RISK</span>
      <div class="headline">${result.biggestRisk.headline}</div>
      <div class="context">${result.biggestRisk.context}</div>
      <div class="impact-row">
        <div class="impact-item">
          <div class="impact-value">₹${(result.biggestRisk.economicMagnitude / 100000).toFixed(1)}L</div>
          <div class="impact-label">Monthly at Risk</div>
        </div>
        <div class="impact-item">
          <div class="impact-value">${result.biggestRisk.confidenceLevel.toUpperCase()}</div>
          <div class="impact-label">Confidence</div>
        </div>
      </div>
      <div class="action-box">
        <h4>Why You Don't See This</h4>
        <p>${result.biggestRisk.invisibilityReason}</p>
      </div>
    </div>
    ` : ''}

    ${result.biggestLeverage ? `
    <div class="the-one-thing leverage">
      <span class="tag leverage">💰 BIGGEST LEVERAGE OPPORTUNITY</span>
      <div class="headline">${result.biggestLeverage.headline}</div>
      <div class="context">${result.biggestLeverage.context}</div>
      <div class="impact-row">
        <div class="impact-item">
          <div class="impact-value">+₹${(result.biggestLeverage.economicMagnitude / 100000).toFixed(1)}L</div>
          <div class="impact-label">Monthly Upside</div>
        </div>
      </div>
      ${result.biggestLeverage.actionSystem ? `
      <div class="action-box">
        <h4>Specific Action</h4>
        <p><strong>${result.biggestLeverage.actionSystem.type.replace(/_/g, ' ').toUpperCase()}</strong></p>
        <p style="margin-top: 8px; color: #888;">${result.biggestLeverage.actionSystem.expectedOutcome}</p>
      </div>
      ` : ''}
    </div>
    ` : ''}

    ${result.biggestBlocker ? `
    <div class="the-one-thing blocker">
      <span class="tag blocker">🚫 SCALING BLOCKER</span>
      <div class="headline">${result.biggestBlocker.headline}</div>
      <div class="context">${result.biggestBlocker.context}</div>
      <div class="impact-row">
        <div class="impact-item">
          <div class="impact-value">₹${(result.biggestBlocker.economicMagnitude / 100000).toFixed(1)}L</div>
          <div class="impact-label">Growth Ceiling</div>
        </div>
      </div>
    </div>
    ` : ''}

    ${result.contradictions.length > 0 ? `
    <div class="section">
      <h3>⚡ Hidden Contradictions</h3>
      ${result.contradictions.map(c => `
        <div class="contradiction-card">
          <div class="contradiction-signals">
            <div class="signal">
              <div class="signal-metric">${c.signal1.metric}</div>
              <div class="signal-direction">${c.signal1.direction} ${c.signal1.value}</div>
            </div>
            <div style="color: var(--warning); font-weight: bold;">vs</div>
            <div class="signal">
              <div class="signal-metric">${c.signal2.metric}</div>
              <div class="signal-direction">${c.signal2.direction} ${c.signal2.value}</div>
            </div>
          </div>
          <div class="contradiction-text">${c.contradiction}</div>
          <div class="contradiction-implication">→ ${c.implications}</div>
          <div style="margin-top: 15px; font-size: 0.85rem;">
            <span style="color: var(--warning);">Impact: ₹${(c.economicImpact / 100000).toFixed(1)}L</span> •
            <span style="color: ${c.urgency === 'critical' ? 'var(--accent)' : 'var(--warning)'};">${c.urgency.toUpperCase()}</span>
          </div>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <div class="decomposition">
      <h3>Reality Behind the Dashboard</h3>
      <div class="metric-grid">
        <div class="metric-item">
          <div class="value">${result.accountDecomposition.blendedROAS.toFixed(2)}x</div>
          <div class="label">Blended ROAS</div>
          <div class="subtext">What dashboard shows</div>
        </div>
        <div class="metric-item">
          <div class="value">${result.accountDecomposition.trueAcquisitionROAS.toFixed(2)}x</div>
          <div class="label">True Acquisition ROAS</div>
          <div class="subtext">Cold audience only</div>
        </div>
        <div class="metric-item">
          <div class="value">${result.accountDecomposition.roasMirageScore.toFixed(0)}%</div>
          <div class="label">ROAS Mirage</div>
          <div class="subtext">Warm recycling inflation</div>
        </div>
        <div class="metric-item">
          <div class="value">${result.accountDecomposition.warmAudienceShare.toFixed(0)}%</div>
          <div class="label">Warm Audience Share</div>
          <div class="subtext">Of conversions</div>
        </div>
        <div class="metric-item">
          <div class="value">${result.accountDecomposition.acquisitionHealthScore}</div>
          <div class="label">Acquisition Health</div>
          <div class="subtext">Out of 100</div>
        </div>
        <div class="metric-item">
          <div class="value">~${result.accountDecomposition.warmAudienceRunway}d</div>
          <div class="label">Warm Runway</div>
          <div class="subtext">Until exhaustion</div>
        </div>
      </div>
    </div>

    <div class="decomposition">
      <h3>Creative System</h3>
      <div class="metric-grid">
        <div class="metric-item">
          <div class="value">${result.creativeSystemHealth.winnerConcentration.toFixed(0)}%</div>
          <div class="label">Winner Concentration</div>
          <div class="subtext">${result.creativeSystemHealth.winnerConcentration > 50 ? '⚠️ Vulnerability' : '✓ Healthy'}</div>
        </div>
        <div class="metric-item">
          <div class="value">${result.creativeSystemHealth.winnerFatigueDays}d</div>
          <div class="label">Fatigue Runway</div>
        </div>
        <div class="metric-item">
          <div class="value">${result.creativeSystemHealth.pipelineDepth}</div>
          <div class="label">Backup Creatives</div>
        </div>
      </div>
    </div>

    <footer>
      <p>Intelligence powered by <span class="footer-brand">Cosmisk</span></p>
      <p style="margin-top: 10px; font-size: 0.85rem;">
        ${result.impossibleManuallyBecause}
      </p>
    </footer>
  </div>
</body>
</html>`;
}
