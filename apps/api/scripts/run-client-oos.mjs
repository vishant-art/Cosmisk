/**
 * Run client-aware OOS detection with Smashed-branded report
 * Usage: node scripts/run-client-oos.mjs <brand_name>
 */

import 'dotenv/config';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/cosmisk.db');

// Dynamic import for ES module
const { runOOSCheckForClient } = await import('../dist/services/oos-detector.js');

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

console.log('🔍 Running OOS Detection');
console.log('─'.repeat(50));
console.log(`Client: ${client.brand_name}`);
console.log(`Level:  ${client.revenue_level}`);
console.log(`Meta Account: ${client.meta_ad_account_id || 'Not configured'}`);
console.log(`Shopify: ${client.shopify_store || 'Not configured'}`);
console.log('');

try {
  const report = await runOOSCheckForClient(client.id, {
    metaToken: process.env.META_ACCESS_TOKEN,
    days: 7,
  });

  if (!report) {
    console.log('❌ No report generated (missing credentials or no data)');
    process.exit(1);
  }

  const oosProducts = report.enhanced?.topWasted || [];

  console.log('\n✅ OOS Report Generated');
  console.log('═'.repeat(50));
  console.log(`Total Wasted Spend:    ₹${(report.totalWastedSpend || 0).toLocaleString('en-IN')}`);
  console.log(`Verified Wasted:       ₹${(report.verifiedWastedSpend || 0).toLocaleString('en-IN')}`);
  console.log(`OOS Products Found:    ${oosProducts.length}`);
  console.log(`New OOS Products:      ${report.newOOSProducts?.length || 0}`);
  console.log(`Alert Triggered:       ${report.shouldAlert ? '⚠️ YES' : 'No'}`);

  if (oosProducts.length > 0) {
    console.log('\n📊 Top OOS Products:');
    for (const product of oosProducts.slice(0, 5)) {
      console.log(`  • ${product.productName || product.productId}`);
      console.log(`    Wasted: ₹${product.wastedSpend?.toLocaleString('en-IN') || 0} | Shopify Orders: ${product.shopifyOrders}`);
    }
  }

  // Save HTML report if we have data
  if (oosProducts.length > 0) {
    const reportPath = `/tmp/${brandName.toLowerCase()}-oos-report.html`;
    const html = generateOOSHTMLReport(report, client, oosProducts);
    fs.writeFileSync(reportPath, html);
    console.log(`\n📄 HTML Report: ${reportPath}`);
  }

} catch (e) {
  console.error('❌ Error:', e.message);
  console.error(e.stack);
}

db.close();

function generateOOSHTMLReport(report, client, oosProducts) {
  const newProductIds = report.newOOSProducts || [];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OOS Detection Report - ${client.brand_name}</title>
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
    .meta-value.alert { color: #ef4444; }
    .meta-label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px; }

    /* Alert Banner */
    .alert-banner { background: linear-gradient(90deg, #ef4444, #dc2626); color: white; padding: 20px; text-align: center; font-weight: 600; display: none; }
    .alert-banner.active { display: block; }

    /* Sections */
    .section { padding: 60px 0; border-bottom: 1px solid #222; }
    .section-title { font-size: 28px; font-weight: 600; margin-bottom: 40px; display: flex; align-items: center; gap: 12px; }
    .section-title::before { content: ''; width: 4px; height: 28px; background: #EC8A23; border-radius: 2px; }

    /* Products Grid */
    .products-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 24px; }
    .product-card { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; transition: border-color 0.2s; }
    .product-card:hover { border-color: #EC8A23; }
    .product-card.new { border-left: 4px solid #ef4444; }
    .product-name { font-size: 18px; font-weight: 600; margin-bottom: 16px; color: #fff; }
    .product-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
    .stat { background: #1a1a1a; padding: 12px; border-radius: 8px; }
    .stat-value { font-size: 24px; font-weight: 700; color: #EC8A23; }
    .stat-value.waste { color: #ef4444; }
    .stat-label { font-size: 11px; color: #666; text-transform: uppercase; }
    .new-badge { display: inline-block; background: #ef4444; color: white; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px; margin-bottom: 12px; }

    /* Summary */
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px; }
    .summary-card { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; text-align: center; }
    .summary-value { font-size: 36px; font-weight: 700; color: #EC8A23; margin-bottom: 8px; }
    .summary-value.waste { color: #ef4444; }
    .summary-label { font-size: 14px; color: #888; }

    /* Footer */
    .footer { text-align: center; padding: 60px 20px; color: #666; }
    .footer-logo { font-size: 14px; color: #EC8A23; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 12px; }
    .footer a { color: #EC8A23; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="alert-banner ${report.shouldAlert ? 'active' : ''}">
    ⚠️ ALERT: Significant ad spend on out-of-stock products detected!
  </div>

  <div class="header">
    <div class="logo">The Bridge Service · Smashed Agency</div>
    <h1>OOS Detection Report</h1>
    <div class="subtitle">${client.brand_name} — ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
    <div class="meta">
      <div class="meta-item">
        <div class="meta-value ${report.shouldAlert ? 'alert' : ''}">₹${(report.verifiedWastedSpend || 0).toLocaleString('en-IN')}</div>
        <div class="meta-label">Verified Wasted Spend</div>
      </div>
      <div class="meta-item">
        <div class="meta-value">${oosProducts.length}</div>
        <div class="meta-label">OOS Products</div>
      </div>
      <div class="meta-item">
        <div class="meta-value">${newProductIds.length}</div>
        <div class="meta-label">New This Week</div>
      </div>
    </div>
  </div>

  <div class="container">
    <div class="section">
      <h2 class="section-title">Summary</h2>
      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-value waste">₹${(report.totalWastedSpend || 0).toLocaleString('en-IN')}</div>
          <div class="summary-label">Total Potential Waste</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">₹${(report.verifiedWastedSpend || 0).toLocaleString('en-IN')}</div>
          <div class="summary-label">Verified Waste (No Recent Sales)</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">${oosProducts.length}</div>
          <div class="summary-label">Products Running Ads While OOS</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">${newProductIds.length}</div>
          <div class="summary-label">Newly Detected This Scan</div>
        </div>
      </div>
    </div>

    ${oosProducts.length > 0 ? `
    <div class="section">
      <h2 class="section-title">OOS Products with Active Ads</h2>
      <div class="products-grid">
        ${oosProducts.map(product => `
          <div class="product-card ${newProductIds.includes(product.productId) ? 'new' : ''}">
            ${newProductIds.includes(product.productId) ? '<div class="new-badge">New</div>' : ''}
            <div class="product-name">${product.productName || product.productId}</div>
            <div class="product-stats">
              <div class="stat">
                <div class="stat-value waste">₹${(product.wastedSpend || 0).toLocaleString('en-IN')}</div>
                <div class="stat-label">Wasted Spend</div>
              </div>
              <div class="stat">
                <div class="stat-value">${product.shopifyOrders}</div>
                <div class="stat-label">Recent Orders</div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <div class="section">
      <h2 class="section-title">Recommendations</h2>
      <div style="background:#151515;border:1px solid #2a2a2a;border-left:4px solid #EC8A23;border-radius:12px;padding:24px;">
        <div style="font-size:11px;color:#EC8A23;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;font-weight:600;">Immediate Action</div>
        <div style="font-size:16px;color:#fff;margin-bottom:12px;">
          ${oosProducts.length > 0
            ? `Pause or update ${oosProducts.length} ads targeting out-of-stock products to stop wasting ₹${(report.verifiedWastedSpend || 0).toLocaleString('en-IN')}/week.`
            : 'No immediate action needed - all advertised products are in stock.'}
        </div>
        <div style="font-size:14px;color:#6ee7b7;">
          → ${oosProducts.length > 0
            ? 'Either pause ads for OOS products or add inventory. Consider excluding OOS SKUs from catalog campaigns.'
            : 'Continue monitoring weekly to catch OOS situations early.'}
        </div>
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
