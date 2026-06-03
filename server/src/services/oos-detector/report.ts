/**
 * OOS Detector - HTML report generation
 *
 * Smashed-branded HTML report for OOS detection.
 */

import { type ServiceClient } from '../service-clients.js';
import type { ClientOOSReport } from './types.js';

/**
 * Generate Smashed-branded HTML report for OOS detection
 */
export function generateOOSReport(report: ClientOOSReport, client: ServiceClient): string {
  const topProducts = report.enhanced?.topWasted || [];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OOS Detection Report - ${client.brandName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e5e5e5; line-height: 1.6; }
    .container { max-width: 1000px; margin: 0 auto; padding: 40px 20px; }
    .header { text-align: center; padding: 60px 20px; background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%); border-bottom: 1px solid #333; }
    .logo { font-size: 14px; color: #EC8A23; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 20px; }
    h1 { font-size: 36px; font-weight: 700; background: linear-gradient(90deg, #EC8A23, #f5a623); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 16px; }
    .subtitle { font-size: 18px; color: #888; }
    .alert-box { background: ${report.shouldAlert ? '#7f1d1d' : '#065f46'}; border: 1px solid ${report.shouldAlert ? '#dc2626' : '#10b981'}; border-radius: 12px; padding: 24px; margin: 40px 0; text-align: center; }
    .alert-value { font-size: 48px; font-weight: 700; color: ${report.shouldAlert ? '#fca5a5' : '#6ee7b7'}; }
    .alert-label { font-size: 14px; color: #888; text-transform: uppercase; margin-top: 8px; }
    .section { padding: 40px 0; border-bottom: 1px solid #222; }
    .section-title { font-size: 24px; font-weight: 600; margin-bottom: 24px; display: flex; align-items: center; gap: 12px; }
    .section-title::before { content: ''; width: 4px; height: 24px; background: #EC8A23; border-radius: 2px; }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
    .stat-card { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 20px; text-align: center; }
    .stat-value { font-size: 28px; font-weight: 700; color: #EC8A23; }
    .stat-label { font-size: 12px; color: #666; text-transform: uppercase; margin-top: 4px; }
    .product-card { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 20px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
    .product-card.new { border-left: 4px solid #dc2626; }
    .product-name { font-weight: 600; color: #fff; margin-bottom: 4px; }
    .product-meta { font-size: 13px; color: #888; }
    .product-waste { font-size: 24px; font-weight: 700; color: #fca5a5; }
    .badge { display: inline-block; background: #dc2626; color: #fff; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px; margin-left: 8px; }
    .footer { text-align: center; padding: 60px 20px; color: #666; }
    .footer a { color: #EC8A23; text-decoration: none; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">The Bridge Service · Smashed Agency</div>
    <h1>OOS Detection Report</h1>
    <div class="subtitle">${client.brandName} — ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
  </div>

  <div class="container">
    <div class="alert-box">
      <div class="alert-value">₹${report.verifiedWastedSpend.toLocaleString('en-IN')}</div>
      <div class="alert-label">${report.shouldAlert ? 'Verified Wasted Spend — Action Required' : 'Below Alert Threshold (₹' + report.alertThreshold.toLocaleString('en-IN') + ')'}</div>
    </div>

    <div class="section">
      <h2 class="section-title">Summary</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${report.enhanced?.totalOOSProducts || 0}</div>
          <div class="stat-label">OOS Products</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${report.newOOSProducts.length}</div>
          <div class="stat-label">New This Check</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${report.enhanced?.productsNoSales || 0}</div>
          <div class="stat-label">Verified No Sales</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">₹${report.alertThreshold.toLocaleString('en-IN')}</div>
          <div class="stat-label">Alert Threshold</div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Top Wasted Products</h2>
      ${topProducts.length === 0 ? '<p style="color:#888">No products with verified wasted spend.</p>' : topProducts.map(p => `
        <div class="product-card ${report.newOOSProducts.includes(p.productId) ? 'new' : ''}">
          <div>
            <div class="product-name">
              ${p.productName}
              ${report.newOOSProducts.includes(p.productId) ? '<span class="badge">NEW</span>' : ''}
            </div>
            <div class="product-meta">ID: ${p.productId} · Shopify Orders: ${p.shopifyOrders}</div>
          </div>
          <div class="product-waste">₹${p.wastedSpend.toLocaleString('en-IN')}</div>
        </div>
      `).join('')}
    </div>

    <div class="section">
      <h2 class="section-title">Recommendation</h2>
      <div style="background:#151515;border:1px solid #2a2a2a;border-left:4px solid #EC8A23;border-radius:12px;padding:24px">
        ${report.shouldAlert ? `
          <p style="color:#fff;font-size:16px;margin-bottom:12px"><strong>Action Required:</strong> Pause ads for ${report.newOOSProducts.length} OOS products</p>
          <p style="color:#6ee7b7">→ Estimated daily savings: ₹${Math.round(report.verifiedWastedSpend / 7).toLocaleString('en-IN')}/day</p>
        ` : `
          <p style="color:#888">No immediate action required. Waste is below your ₹${report.alertThreshold.toLocaleString('en-IN')} alert threshold for ${report.revenueLevel || 'starter'} brands.</p>
        `}
      </div>
    </div>
  </div>

  <div class="footer">
    <p>Generated by <a href="https://smashed.agency/scan">The Bridge Service</a></p>
    <p style="margin-top:8px;font-size:12px">© ${new Date().getFullYear()} Smashed Agency · Confidential</p>
  </div>
</body>
</html>`;
}
