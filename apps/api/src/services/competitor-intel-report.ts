/**
 * Competitor Creative Intelligence - HTML Report Generator
 * For The Bridge Service (smashed.agency)
 *
 * Generates branded HTML reports for client delivery
 */

import { CreativeIntelReport, CreativeAnalysis } from './competitor-creative-intel.js';

export function generateHTMLReport(report: CreativeIntelReport, clientName?: string): string {
  const title = clientName
    ? `Competitor Intelligence Report - ${clientName}`
    : `Competitor Intelligence Report`;

  const date = new Date(report.analyzedAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      line-height: 1.6;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 40px 20px;
    }

    /* Header */
    .header {
      text-align: center;
      padding: 60px 20px;
      background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%);
      border-bottom: 1px solid #333;
    }

    .logo {
      font-size: 14px;
      color: #EC8A23;
      text-transform: uppercase;
      letter-spacing: 3px;
      margin-bottom: 20px;
    }

    h1 {
      font-size: 42px;
      font-weight: 700;
      background: linear-gradient(90deg, #EC8A23, #f5a623);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 16px;
    }

    .subtitle {
      font-size: 18px;
      color: #888;
    }

    .meta {
      margin-top: 30px;
      display: flex;
      justify-content: center;
      gap: 40px;
      flex-wrap: wrap;
    }

    .meta-item {
      text-align: center;
    }

    .meta-value {
      font-size: 32px;
      font-weight: 700;
      color: #EC8A23;
    }

    .meta-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    /* Sections */
    .section {
      padding: 60px 0;
      border-bottom: 1px solid #222;
    }

    .section-title {
      font-size: 28px;
      font-weight: 600;
      margin-bottom: 40px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .section-title::before {
      content: '';
      width: 4px;
      height: 28px;
      background: #EC8A23;
      border-radius: 2px;
    }

    /* Competitors Grid */
    .competitors-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 24px;
    }

    .competitor-card {
      background: #151515;
      border: 1px solid #2a2a2a;
      border-radius: 12px;
      padding: 24px;
      transition: border-color 0.2s;
    }

    .competitor-card:hover {
      border-color: #EC8A23;
    }

    .competitor-name {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 16px;
      color: #fff;
    }

    .competitor-stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 20px;
    }

    .stat {
      background: #1a1a1a;
      padding: 12px;
      border-radius: 8px;
    }

    .stat-value {
      font-size: 24px;
      font-weight: 700;
      color: #EC8A23;
    }

    .stat-label {
      font-size: 11px;
      color: #666;
      text-transform: uppercase;
    }

    .competitor-hook {
      background: #1a1a1a;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 16px;
    }

    .hook-label {
      font-size: 11px;
      color: #EC8A23;
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .hook-text {
      font-size: 14px;
      color: #ccc;
      font-style: italic;
    }

    .view-ad-btn {
      display: inline-block;
      background: #EC8A23;
      color: #000;
      padding: 10px 20px;
      border-radius: 6px;
      text-decoration: none;
      font-weight: 600;
      font-size: 13px;
      transition: background 0.2s;
    }

    .view-ad-btn:hover {
      background: #f5a623;
    }

    /* Patterns */
    .patterns-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 24px;
    }

    .pattern-card {
      background: #151515;
      border: 1px solid #2a2a2a;
      border-radius: 12px;
      padding: 24px;
    }

    .pattern-title {
      font-size: 14px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 20px;
    }

    .pattern-item {
      display: flex;
      align-items: center;
      margin-bottom: 16px;
    }

    .pattern-bar {
      flex: 1;
      height: 8px;
      background: #2a2a2a;
      border-radius: 4px;
      margin: 0 12px;
      overflow: hidden;
    }

    .pattern-fill {
      height: 100%;
      background: linear-gradient(90deg, #EC8A23, #f5a623);
      border-radius: 4px;
    }

    .pattern-label {
      width: 120px;
      font-size: 13px;
      color: #ccc;
    }

    .pattern-value {
      width: 50px;
      text-align: right;
      font-weight: 600;
      color: #EC8A23;
    }

    /* Swipe File */
    .swipe-category {
      margin-bottom: 48px;
    }

    .swipe-header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 24px;
    }

    .swipe-icon {
      width: 48px;
      height: 48px;
      background: #EC8A23;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
    }

    .swipe-title {
      font-size: 20px;
      font-weight: 600;
    }

    .swipe-description {
      font-size: 14px;
      color: #888;
    }

    .swipe-count {
      background: #2a2a2a;
      color: #EC8A23;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }

    .ads-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
    }

    .ad-card {
      background: #151515;
      border: 1px solid #2a2a2a;
      border-radius: 12px;
      overflow: hidden;
      transition: transform 0.2s, border-color 0.2s;
    }

    .ad-card:hover {
      transform: translateY(-4px);
      border-color: #EC8A23;
    }

    .ad-preview {
      height: 200px;
      background: #1a1a1a;
      display: flex;
      align-items: center;
      justify-content: center;
      border-bottom: 1px solid #2a2a2a;
      position: relative;
    }

    .ad-preview iframe {
      width: 100%;
      height: 100%;
      border: none;
    }

    .ad-preview-placeholder {
      color: #444;
      font-size: 48px;
    }

    .ad-badge {
      position: absolute;
      top: 12px;
      right: 12px;
      background: #EC8A23;
      color: #000;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
    }

    .ad-content {
      padding: 20px;
    }

    .ad-brand {
      font-size: 14px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 8px;
    }

    .ad-meta {
      display: flex;
      gap: 16px;
      margin-bottom: 12px;
      font-size: 12px;
      color: #888;
    }

    .ad-text {
      font-size: 13px;
      color: #aaa;
      margin-bottom: 16px;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .ad-link {
      display: block;
      text-align: center;
      background: #2a2a2a;
      color: #EC8A23;
      padding: 12px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      font-size: 13px;
      transition: background 0.2s;
    }

    .ad-link:hover {
      background: #333;
    }

    /* Recommendations */
    .recommendations {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .recommendation {
      background: #151515;
      border: 1px solid #2a2a2a;
      border-radius: 12px;
      padding: 24px;
      display: flex;
      gap: 20px;
    }

    .recommendation.high {
      border-left: 4px solid #ef4444;
    }

    .recommendation.medium {
      border-left: 4px solid #eab308;
    }

    .recommendation.low {
      border-left: 4px solid #22c55e;
    }

    .rec-priority {
      width: 60px;
      text-align: center;
    }

    .priority-badge {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }

    .priority-badge.high { background: #ef4444; color: #fff; }
    .priority-badge.medium { background: #eab308; color: #000; }
    .priority-badge.low { background: #22c55e; color: #000; }

    .rec-content {
      flex: 1;
    }

    .rec-category {
      font-size: 12px;
      color: #EC8A23;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }

    .rec-insight {
      font-size: 16px;
      color: #fff;
      margin-bottom: 12px;
    }

    .rec-action {
      font-size: 14px;
      color: #888;
      padding-left: 16px;
      border-left: 2px solid #333;
    }

    /* Footer */
    .footer {
      text-align: center;
      padding: 60px 20px;
      border-top: 1px solid #222;
    }

    .footer-logo {
      font-size: 24px;
      font-weight: 700;
      color: #EC8A23;
      margin-bottom: 12px;
    }

    .footer-text {
      color: #666;
      font-size: 14px;
    }

    .footer-cta {
      margin-top: 30px;
    }

    .footer-cta a {
      display: inline-block;
      background: #EC8A23;
      color: #000;
      padding: 16px 40px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 700;
      font-size: 16px;
    }

    @media (max-width: 768px) {
      h1 { font-size: 28px; }
      .meta { gap: 20px; }
      .competitors-grid { grid-template-columns: 1fr; }
      .patterns-grid { grid-template-columns: 1fr; }
      .ads-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header class="header">
    <div class="logo">Smashed Agency</div>
    <h1>Competitor Creative Intelligence</h1>
    <p class="subtitle">Search: "${report.searchQuery}" • Generated ${date}</p>

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
        <div class="meta-value">${report.industryPatterns.avgAdAge}</div>
        <div class="meta-label">Avg Ad Age (Days)</div>
      </div>
    </div>
  </header>

  <div class="container">
    <!-- Competitors Section -->
    <section class="section">
      <h2 class="section-title">Top Competitors</h2>
      <div class="competitors-grid">
        ${report.competitors.slice(0, 6).map(comp => `
          <div class="competitor-card">
            <div class="competitor-name">${escapeHtml(comp.pageName)}</div>
            <div class="competitor-stats">
              <div class="stat">
                <div class="stat-value">${comp.activeAds}</div>
                <div class="stat-label">Active Ads</div>
              </div>
              <div class="stat">
                <div class="stat-value">${comp.avgAdAge}d</div>
                <div class="stat-label">Avg Age</div>
              </div>
            </div>
            ${comp.topHookTypes[0] ? `
              <div class="competitor-hook">
                <div class="hook-label">Top Hook: ${comp.topHookTypes[0].type} (${comp.topHookTypes[0].percentage}%)</div>
                ${comp.longestRunningAd?.hookText || comp.longestRunningAd?.primaryText ? `
                  <div class="hook-text">"${escapeHtml((comp.longestRunningAd.hookText || comp.longestRunningAd.primaryText || '').slice(0, 100))}..."</div>
                ` : ''}
              </div>
            ` : ''}
            ${comp.longestRunningAd ? `
              <a href="${comp.longestRunningAd.snapshotUrl}" target="_blank" class="view-ad-btn">
                👁️ View Best Ad (${comp.longestRunningAd.daysRunning} days)
              </a>
            ` : ''}
          </div>
        `).join('')}
      </div>
    </section>

    <!-- Industry Patterns Section -->
    <section class="section">
      <h2 class="section-title">Industry Patterns</h2>
      <div class="patterns-grid">
        <div class="pattern-card">
          <div class="pattern-title">Hook Types</div>
          ${report.industryPatterns.dominantHooks.slice(0, 5).map(h => `
            <div class="pattern-item">
              <span class="pattern-label">${h.type}</span>
              <div class="pattern-bar">
                <div class="pattern-fill" style="width: ${h.percentage}%"></div>
              </div>
              <span class="pattern-value">${h.percentage}%</span>
            </div>
          `).join('')}
        </div>

        <div class="pattern-card">
          <div class="pattern-title">Offer Types</div>
          ${report.industryPatterns.dominantOffers.slice(0, 5).map(o => `
            <div class="pattern-item">
              <span class="pattern-label">${o.type}</span>
              <div class="pattern-bar">
                <div class="pattern-fill" style="width: ${o.percentage}%"></div>
              </div>
              <span class="pattern-value">${o.percentage}%</span>
            </div>
          `).join('')}
        </div>

        <div class="pattern-card">
          <div class="pattern-title">CTA Types</div>
          ${report.industryPatterns.dominantCtas.slice(0, 5).map(c => `
            <div class="pattern-item">
              <span class="pattern-label">${c.type}</span>
              <div class="pattern-bar">
                <div class="pattern-fill" style="width: ${c.percentage}%"></div>
              </div>
              <span class="pattern-value">${c.percentage}%</span>
            </div>
          `).join('')}
        </div>
      </div>
    </section>

    <!-- Swipe File Section -->
    <section class="section">
      <h2 class="section-title">Creative Swipe File</h2>

      ${report.swipeFile.map(category => `
        <div class="swipe-category">
          <div class="swipe-header">
            <div class="swipe-icon">${getCategoryIcon(category.category)}</div>
            <div>
              <div class="swipe-title">${category.category}</div>
              <div class="swipe-description">${category.description || ''}</div>
            </div>
            <span class="swipe-count">${category.count} ads</span>
          </div>

          <div class="ads-grid">
            ${category.ads.slice(0, 6).map(ad => `
              <div class="ad-card">
                <div class="ad-preview">
                  <span class="ad-preview-placeholder">🖼️</span>
                  ${ad.daysRunning >= 30 ? '<span class="ad-badge">🔥 Winner</span>' : ''}
                </div>
                <div class="ad-content">
                  <div class="ad-brand">${escapeHtml(ad.pageName)}</div>
                  <div class="ad-meta">
                    <span>📅 ${ad.daysRunning} days</span>
                    <span>🎯 ${ad.hookType}</span>
                  </div>
                  ${ad.hookText || ad.primaryText ? `
                    <div class="ad-text">"${escapeHtml((ad.hookText || ad.primaryText || '').slice(0, 150))}"</div>
                  ` : ''}
                  <a href="${ad.snapshotUrl}" target="_blank" class="ad-link">
                    👁️ View Creative on Meta
                  </a>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </section>

    <!-- Recommendations Section -->
    <section class="section">
      <h2 class="section-title">Recommendations</h2>
      <div class="recommendations">
        ${report.recommendations.map(rec => `
          <div class="recommendation ${rec.priority}">
            <div class="rec-priority">
              <span class="priority-badge ${rec.priority}">${rec.priority}</span>
            </div>
            <div class="rec-content">
              <div class="rec-category">${rec.category}</div>
              <div class="rec-insight">${escapeHtml(rec.insight)}</div>
              <div class="rec-action">→ ${escapeHtml(rec.action)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </section>
  </div>

  <footer class="footer">
    <div class="footer-logo">Smashed Agency</div>
    <p class="footer-text">AI-Powered Performance Intelligence for D2C Brands</p>
    <div class="footer-cta">
      <a href="https://smashed.agency/scan/">Get Your Free Meta Ads Audit →</a>
    </div>
  </footer>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getCategoryIcon(category: string): string {
  if (category.includes('Long-Running') || category.includes('Winner')) return '🏆';
  if (category.includes('Aspiration')) return '✨';
  if (category.includes('Problem')) return '😤';
  if (category.includes('Social Proof')) return '👥';
  if (category.includes('Transformation')) return '🔄';
  if (category.includes('Question')) return '❓';
  if (category.includes('Discount')) return '💰';
  if (category.includes('High Spend')) return '💎';
  return '📁';
}
