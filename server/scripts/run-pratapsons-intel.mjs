/**
 * Run competitor creative intel for Pratapsons
 * Generates client-aware report with filtered references
 */

import 'dotenv/config';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/cosmisk.db');

// Dynamic import for ES module
const { runCompetitorIntelForClient } = await import('../dist/services/competitor-creative-intel.js');

const db = new Database(DB_PATH);

// Get Pratapsons client
const client = db.prepare(`SELECT * FROM service_clients WHERE brand_name = 'Pratapsons'`).get();

if (!client) {
  console.log('❌ Pratapsons not found');
  process.exit(1);
}

console.log('🚀 Running Competitor Intel for Pratapsons');
console.log('─'.repeat(50));
console.log(`Client: ${client.brand_name}`);
console.log(`Level:  ${client.revenue_level}`);
console.log(`Category: ${client.category}`);
console.log('');

try {
  const report = await runCompetitorIntelForClient(client.id, {
    extraQueries: [
      'sherwani india',
      'kurta men india',
      'wedding wear men',
      'ethnic wear men india',
      'designer kurta',
      'indo western men',
      'mens ethnic fashion',
      'traditional indian menswear'
    ],
    limit: 500,
    analyzeTop: 40
  });

  if (!report) {
    console.log('❌ No report generated');
    process.exit(1);
  }

  console.log('\n✅ Report Generated');
  console.log('═'.repeat(50));
  console.log(`Total Ads Analyzed:   ${report.totalAdsAnalyzed}`);
  console.log(`New References:       ${report.newReferencesCount}`);
  console.log(`Filtered Out:         ${report.filteredOutCount}`);
  console.log(`Competitors Found:    ${report.competitors.length}`);
  console.log(`Search Queries Used:  ${report.searchQueriesUsed.join(', ')}`);

  console.log('\n📊 Top Competitors:');
  for (const comp of report.competitors.slice(0, 5)) {
    console.log(`  • ${comp.pageName} (${comp.totalAdsFound} ads, longest: ${comp.longestRunningAd?.daysRunning || 0} days)`);
  }

  console.log('\n🎯 Industry Patterns:');
  console.log(`  Dominant Hooks: ${report.industryPatterns.dominantHooks.map(h => h.pattern).join(', ')}`);
  console.log(`  Avg Ad Age: ${report.industryPatterns.avgAdAge} days`);

  console.log('\n💡 Top Recommendations:');
  for (const rec of report.recommendations.slice(0, 3)) {
    console.log(`  [${rec.priority.toUpperCase()}] ${rec.category}`);
    console.log(`    ${rec.insight}`);
    console.log(`    → ${rec.action}\n`);
  }

  // Save HTML report
  const reportPath = '/tmp/pratapsons-intel-report.html';
  const html = generateHTMLReport(report, client);
  fs.writeFileSync(reportPath, html);
  console.log(`\n📄 HTML Report: ${reportPath}`);

} catch (e) {
  console.error('❌ Error:', e);
}

db.close();

function generateHTMLReport(report, client) {
  // Collect ALL ads from all competitors
  const allAds = [];
  for (const comp of report.competitors) {
    if (comp.topCreatives) allAds.push(...comp.topCreatives);
  }
  allAds.sort((a, b) => b.daysRunning - a.daysRunning);

  // Generate recommendations if empty
  const recs = report.recommendations.length > 0 ? report.recommendations : [
    {
      priority: 'high',
      category: 'Proven Winners',
      insight: `${allAds.filter(a => a.daysRunning >= 90).length} ads running 90+ days indicate profitable creatives worth studying`,
      action: 'Study the top 5 longest-running ads below - these have proven ROI. Identify hooks, offers, and visual styles to test.',
    },
    {
      priority: 'high',
      category: 'Top Competitor',
      insight: `${report.competitors[0]?.pageName || 'Leading competitor'} has ${report.competitors[0]?.totalAdsFound || 0} active ads - highest activity in your space`,
      action: `Deep-dive ${report.competitors[0]?.pageName}'s ad library. Their volume suggests working creative system.`,
    },
    {
      priority: 'medium',
      category: 'Format Mix',
      insight: `Average ad age of ${report.industryPatterns.avgAdAge} days suggests this niche rewards longevity over rapid testing`,
      action: 'Focus on evergreen creative concepts rather than trendy hooks. Build 3-5 "workhorse" ads.',
    },
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Competitor Intelligence Report - ${client.brand_name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e5e5e5; line-height: 1.6; }
    .container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }

    /* Header */
    .header { text-align: center; padding: 60px 20px; background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%); border-bottom: 1px solid #333; }
    .logo { font-size: 14px; color: #EC8A23; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 20px; }
    h1 { font-size: 42px; font-weight: 700; background: linear-gradient(90deg, #EC8A23, #f5a623); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 16px; }
    .subtitle { font-size: 18px; color: #888; }
    .meta { margin-top: 30px; display: flex; justify-content: center; gap: 40px; flex-wrap: wrap; }
    .meta-item { text-align: center; }
    .meta-value { font-size: 32px; font-weight: 700; color: #EC8A23; }
    .meta-label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px; }

    /* Sections */
    .section { padding: 60px 0; border-bottom: 1px solid #222; }
    .section-title { font-size: 28px; font-weight: 600; margin-bottom: 40px; display: flex; align-items: center; gap: 12px; }
    .section-title::before { content: ''; width: 4px; height: 28px; background: #EC8A23; border-radius: 2px; }

    /* Recommendations */
    .recs-grid { display: grid; gap: 16px; }
    .rec-card { background: #151515; border: 1px solid #2a2a2a; border-left: 4px solid #EC8A23; border-radius: 12px; padding: 24px; }
    .rec-card.medium { border-left-color: #f5a623; }
    .rec-priority { font-size: 11px; color: #EC8A23; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; font-weight: 600; }
    .rec-card.medium .rec-priority { color: #f5a623; }
    .rec-insight { font-size: 16px; color: #fff; margin-bottom: 12px; }
    .rec-action { font-size: 14px; color: #6ee7b7; }

    /* Competitors Grid */
    .competitors-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 24px; }
    .competitor-card { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; transition: border-color 0.2s; }
    .competitor-card:hover { border-color: #EC8A23; }
    .competitor-rank { display: inline-block; background: #EC8A23; color: #000; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px; margin-bottom: 12px; }
    .competitor-name { font-size: 18px; font-weight: 600; margin-bottom: 16px; color: #fff; }
    .competitor-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
    .stat { background: #1a1a1a; padding: 12px; border-radius: 8px; }
    .stat-value { font-size: 24px; font-weight: 700; color: #EC8A23; }
    .stat-label { font-size: 11px; color: #666; text-transform: uppercase; }
    .competitor-hook { background: #1a1a1a; padding: 16px; border-radius: 8px; margin-bottom: 16px; }
    .hook-label { font-size: 11px; color: #EC8A23; text-transform: uppercase; margin-bottom: 8px; }
    .hook-text { font-size: 14px; color: #ccc; font-style: italic; }
    .view-ad-btn { display: inline-block; background: #EC8A23; color: #000; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 13px; transition: background 0.2s; }
    .view-ad-btn:hover { background: #f5a623; }

    /* Swipe File / Ads Grid */
    .ads-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
    .ad-card { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; overflow: hidden; transition: transform 0.2s, border-color 0.2s; }
    .ad-card:hover { border-color: #EC8A23; transform: translateY(-4px); }
    .ad-header { padding: 16px; border-bottom: 1px solid #2a2a2a; display: flex; justify-content: space-between; align-items: center; }
    .ad-page { font-weight: 600; color: #EC8A23; font-size: 14px; }
    .ad-days { background: #1a1a1a; color: #6ee7b7; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
    .ad-body { padding: 16px; }
    .ad-text { font-size: 14px; color: #ccc; line-height: 1.6; max-height: 120px; overflow: hidden; position: relative; }
    .ad-text::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 40px; background: linear-gradient(transparent, #151515); }
    .ad-footer { padding: 16px; border-top: 1px solid #2a2a2a; display: flex; justify-content: space-between; align-items: center; }
    .ad-tags { display: flex; gap: 8px; }
    .tag { background: #2a2a2a; color: #888; padding: 4px 10px; border-radius: 4px; font-size: 11px; }

    /* Footer */
    .footer { text-align: center; padding: 60px 20px; color: #666; }
    .footer-logo { font-size: 14px; color: #EC8A23; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 12px; }
    .footer a { color: #EC8A23; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">The Bridge Service · Smashed Agency</div>
    <h1>Competitor Intelligence Report</h1>
    <div class="subtitle">${client.brand_name} — ${(client.category || '').replace(/_/g, ' ')}</div>
    <div class="meta">
      <div class="meta-item">
        <div class="meta-value">${report.totalAdsAnalyzed}</div>
        <div class="meta-label">Ads Analyzed</div>
      </div>
      <div class="meta-item">
        <div class="meta-value">${report.competitors.length}</div>
        <div class="meta-label">Competitors</div>
      </div>
      <div class="meta-item">
        <div class="meta-value">${report.industryPatterns.avgAdAge}d</div>
        <div class="meta-label">Avg Ad Age</div>
      </div>
      <div class="meta-item">
        <div class="meta-value">${allAds.filter(a => a.daysRunning >= 90).length}</div>
        <div class="meta-label">90+ Day Winners</div>
      </div>
    </div>
  </div>

  <div class="container">
    <div class="section">
      <h2 class="section-title">Recommendations</h2>
      <div class="recs-grid">
        ${recs.map(rec => `
          <div class="rec-card ${rec.priority}">
            <div class="rec-priority">${rec.priority} Priority · ${rec.category}</div>
            <div class="rec-insight">${rec.insight}</div>
            <div class="rec-action">→ ${rec.action}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Top Competitors</h2>
      <div class="competitors-grid">
        ${report.competitors.slice(0, 8).map((comp, i) => `
          <div class="competitor-card">
            ${i === 0 ? '<div class="competitor-rank">Top Player</div>' : `<div class="competitor-rank" style="background:#2a2a2a;color:#888">#${i + 1}</div>`}
            <div class="competitor-name">${comp.pageName}</div>
            <div class="competitor-stats">
              <div class="stat">
                <div class="stat-value">${comp.totalAdsFound}</div>
                <div class="stat-label">Active Ads</div>
              </div>
              <div class="stat">
                <div class="stat-value">${comp.longestRunningAd?.daysRunning || 0}d</div>
                <div class="stat-label">Longest Running</div>
              </div>
            </div>
            ${comp.topCreatives?.[0]?.primaryText ? `
              <div class="competitor-hook">
                <div class="hook-label">Top Hook</div>
                <div class="hook-text">"${(comp.topCreatives[0].primaryText || '').split('\n')[0].substring(0, 100)}..."</div>
              </div>
            ` : ''}
            <a href="${comp.topCreatives?.[0]?.snapshotUrl || '#'}" target="_blank" class="view-ad-btn">View Best Ad →</a>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Swipe File — All ${allAds.length} Ads</h2>
      <div class="ads-grid">
        ${allAds.map(ad => `
          <a href="${ad.snapshotUrl}" target="_blank" class="ad-card" style="text-decoration:none">
            <div class="ad-header">
              <span class="ad-page">${ad.pageName}</span>
              <span class="ad-days">${ad.daysRunning}d</span>
            </div>
            <div class="ad-body">
              <div class="ad-text">${(ad.primaryText || ad.headline || 'No text').substring(0, 200)}</div>
            </div>
            <div class="ad-footer">
              <div class="ad-tags">
                <span class="tag">${ad.creativeFormat || 'unknown'}</span>
                <span class="tag">${ad.platforms?.[0] || 'Meta'}</span>
              </div>
              <span style="color:#EC8A23;font-size:12px;font-weight:600">View →</span>
            </div>
          </a>
        `).join('')}
      </div>
    </div>
  </div>

  <div class="footer">
    <div class="footer-logo">The Bridge Service</div>
    <p>Generated on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    <p style="margin-top:8px"><a href="https://smashed.agency/scan">smashed.agency/scan</a> · Confidential Client Report</p>
  </div>
</body>
</html>`;
}
