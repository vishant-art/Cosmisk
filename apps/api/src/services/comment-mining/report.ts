/**
 * Comment Mining Agent — report retrieval & HTML rendering.
 */

import { getDbAdapter } from '../../db/adapter.js';
import type { CommentMiningReport } from './types.js';

/**
 * Get latest mining report for client
 */
export async function getLatestReport(clientId: string): Promise<CommentMiningReport | null> {
  const db = getDbAdapter();
  const row = await db.get(`
    SELECT report FROM comment_mining_reports
    WHERE client_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `, [clientId]) as { report: string } | undefined;

  if (!row) return null;
  return JSON.parse(row.report);
}

/**
 * Generate HTML report for client delivery
 */
export function generateHTMLReport(report: CommentMiningReport, brandName: string): string {
  const topPraise = report.topPatterns.filter(p => p.category === 'praise').slice(0, 5);
  const topObjections = report.topPatterns.filter(p => p.category === 'objection').slice(0, 5);
  const topQuestions = report.topPatterns.filter(p => p.category === 'question').slice(0, 5);
  const topFrustrations = report.topPatterns.filter(p => p.category === 'frustration').slice(0, 5);

  // Get top emotions from heatmap
  const topEmotions = Object.entries(report.emotionalHeatmap || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Comment Intelligence Report — ${brandName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      line-height: 1.6;
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }

    /* Header */
    .header { text-align: center; padding: 60px 20px; background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%); border-bottom: 1px solid #333; }
    .logo { font-size: 14px; color: #EC8A23; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 20px; }
    h1 { font-size: 42px; font-weight: 700; background: linear-gradient(90deg, #EC8A23, #f5a623); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 16px; }
    .subtitle { font-size: 18px; color: #888; }

    /* Sections */
    .section { padding: 40px 0; border-bottom: 1px solid #222; }
    .section-title { font-size: 24px; font-weight: 600; margin-bottom: 24px; display: flex; align-items: center; gap: 12px; color: #fff; }
    .section-title::before { content: ''; width: 4px; height: 24px; background: #EC8A23; border-radius: 2px; }

    .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 24px 0; }
    @media (max-width: 768px) { .stat-grid { grid-template-columns: repeat(2, 1fr); } }
    .stat { background: #151515; border: 1px solid #2a2a2a; padding: 24px; border-radius: 12px; text-align: center; }
    .stat-value { font-size: 36px; font-weight: 700; color: #EC8A23; }
    .stat-label { color: #888; font-size: 13px; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px; }

    /* What To Create Next */
    .create-next { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; overflow: hidden; margin: 24px 0; }
    .create-next-header { background: linear-gradient(90deg, #EC8A23, #f5a623); color: #000; padding: 16px 24px; font-weight: 700; font-size: 18px; }
    .create-item { display: flex; gap: 16px; padding: 20px 24px; border-bottom: 1px solid #2a2a2a; align-items: flex-start; }
    .create-item:last-child { border-bottom: none; }
    .create-priority { background: #EC8A23; color: #000; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; }
    .create-content { flex: 1; }
    .create-type { font-weight: 600; color: #fff; margin-bottom: 4px; text-transform: uppercase; font-size: 12px; letter-spacing: 1px; }
    .create-reason { color: #ccc; font-size: 14px; }
    .create-meta { display: flex; gap: 16px; margin-top: 8px; font-size: 12px; }
    .create-meta span { background: #2a2a2a; padding: 4px 10px; border-radius: 20px; color: #888; }
    .create-meta .high { color: #10b981; }
    .create-meta .asap { color: #ef4444; }

    /* Pattern Cards */
    .pattern-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    @media (max-width: 768px) { .pattern-grid { grid-template-columns: 1fr; } }
    .pattern-card { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 20px; }
    .pattern-card h3 { margin: 0 0 16px 0; font-size: 16px; display: flex; align-items: center; gap: 8px; }
    .pattern-card.danger { border-left: 4px solid #ef4444; }
    .pattern-card.danger h3 { color: #ef4444; }
    .pattern-card.warning { border-left: 4px solid #f59e0b; }
    .pattern-card.warning h3 { color: #f59e0b; }
    .pattern-card.success { border-left: 4px solid #10b981; }
    .pattern-card.success h3 { color: #10b981; }
    .pattern { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #2a2a2a; }
    .pattern:last-child { border-bottom: none; }
    .pattern-phrase { font-weight: 500; color: #ccc; }
    .pattern-count { background: #2a2a2a; color: #EC8A23; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; }

    /* Concepts */
    .concept { background: #151515; border: 1px solid #2a2a2a; border-left: 4px solid #EC8A23; padding: 24px; margin: 16px 0; border-radius: 12px; }
    .concept-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
    .concept-type { font-size: 12px; color: #EC8A23; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
    .concept-priority { background: #EC8A23; color: #000; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; }
    .concept-hook { font-size: 22px; font-weight: 700; margin: 8px 0; color: #fff; }
    .concept-copy { color: #aaa; font-size: 15px; margin: 12px 0; padding: 12px; background: #1a1a1a; border-radius: 8px; }
    .concept-formats { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
    .concept-formats span { background: #2a2a2a; color: #888; padding: 4px 10px; border-radius: 20px; font-size: 11px; }
    .concept-script { margin-top: 16px; padding: 16px; background: #1a1a1a; border-radius: 8px; font-family: 'Monaco', monospace; font-size: 12px; color: #aaa; white-space: pre-wrap; max-height: 200px; overflow-y: auto; }
    .concept-script-toggle { color: #EC8A23; font-size: 13px; cursor: pointer; margin-top: 12px; }

    /* Emotional Heatmap */
    .emotion-grid { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; }
    .emotion-tag { background: #2a2a2a; padding: 8px 16px; border-radius: 20px; font-size: 14px; }
    .emotion-tag .count { color: #EC8A23; margin-left: 8px; font-weight: 600; }

    /* Urgent */
    .alert-box { background: #151515; border: 1px solid #2a2a2a; border-left: 4px solid #ef4444; padding: 24px; border-radius: 12px; margin: 24px 0; }
    .alert-box h3 { margin: 0 0 12px 0; font-size: 18px; color: #ef4444; }
    .alert-box ul { margin: 0; padding-left: 20px; color: #ccc; }
    .alert-box li { margin: 8px 0; }

    .footer { margin-top: 60px; padding: 40px 20px; border-top: 1px solid #222; text-align: center; color: #666; font-size: 13px; }
    .footer-logo { font-size: 14px; color: #EC8A23; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 12px; }
    .footer a { color: #EC8A23; text-decoration: none; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">The Bridge Service · Smashed Agency</div>
    <h1>Comment Intelligence Report</h1>
    <p class="subtitle">${brandName} — ${new Date(report.minedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
  </div>

  <div class="container">

  <div class="stat-grid">
    <div class="stat">
      <div class="stat-value">${report.totalComments}</div>
      <div class="stat-label">Comments Analyzed</div>
    </div>
    <div class="stat">
      <div class="stat-value">${report.categories.praise}</div>
      <div class="stat-label">Praise Comments</div>
    </div>
    <div class="stat">
      <div class="stat-value">${report.categories.objection + report.categories.question}</div>
      <div class="stat-label">Questions/Objections</div>
    </div>
    <div class="stat">
      <div class="stat-value">${report.creativeConcepts.length}</div>
      <div class="stat-label">Ad Concepts Ready</div>
    </div>
  </div>

  ${report.urgentInsights.length > 0 ? `
  <div class="alert-box">
    <h3>🚨 Urgent Actions Required</h3>
    <ul>
      ${report.urgentInsights.map(i => `<li>${i}</li>`).join('')}
    </ul>
  </div>
  ` : ''}

  ${(report.whatToCreateNext || []).length > 0 ? `
  <h2 class="section-title">What To Create Next</h2>
  <div class="create-next">
    <div class="create-next-header">Prioritized Creative Recommendations</div>
    ${(report.whatToCreateNext || []).slice(0, 5).map(w => `
      <div class="create-item">
        <div class="create-priority">${w.priority}</div>
        <div class="create-content">
          <div class="create-type">${w.conceptType.replace(/_/g, ' ')}</div>
          <div class="create-reason">${w.reason}</div>
          <div class="create-meta">
            <span>${w.dataPoints} data points</span>
            <span class="${w.estimatedROI}">ROI: ${w.estimatedROI}</span>
            ${w.deadline ? `<span class="${w.deadline === 'ASAP' ? 'asap' : ''}">${w.deadline}</span>` : ''}
          </div>
        </div>
      </div>
    `).join('')}
  </div>
  ` : ''}

  <h2 class="section-title">Comment Patterns</h2>
  <div class="pattern-grid">
    ${topFrustrations.length > 0 ? `
    <div class="pattern-card danger">
      <h3>⚠️ Frustrations to Address</h3>
      ${topFrustrations.map(p => `
        <div class="pattern">
          <span class="pattern-phrase">"${p.pattern}"</span>
          <span class="pattern-count">${p.frequency}x</span>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${topQuestions.length > 0 ? `
    <div class="pattern-card warning">
      <h3>❓ Unanswered Questions</h3>
      ${topQuestions.map(p => `
        <div class="pattern">
          <span class="pattern-phrase">"${p.pattern}"</span>
          <span class="pattern-count">${p.frequency}x</span>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${topObjections.length > 0 ? `
    <div class="pattern-card warning">
      <h3>🤔 Objections to Handle</h3>
      ${topObjections.map(p => `
        <div class="pattern">
          <span class="pattern-phrase">"${p.pattern}"</span>
          <span class="pattern-count">${p.frequency}x</span>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${topPraise.length > 0 ? `
    <div class="pattern-card success">
      <h3>✨ Social Proof Gold</h3>
      ${topPraise.map(p => `
        <div class="pattern">
          <span class="pattern-phrase">"${p.pattern}"</span>
          <span class="pattern-count">${p.frequency}x</span>
        </div>
      `).join('')}
    </div>
    ` : ''}
  </div>

  ${topEmotions.length > 0 ? `
  <h2 class="section-title">Emotional Triggers Detected</h2>
  <div class="emotion-grid">
    ${topEmotions.map(([emotion, count]) => `
      <div class="emotion-tag">${emotion}<span class="count">${count}</span></div>
    `).join('')}
  </div>
  ` : ''}

  <h2 class="section-title">Ready-to-Use Ad Concepts</h2>
  ${report.creativeConcepts.slice(0, 8).map((c, i) => `
    <div class="concept">
      <div class="concept-header">
        <div class="concept-type">${c.type.replace(/_/g, ' ')}</div>
        <div class="concept-priority">Priority #${c.priority || (i + 1)}</div>
      </div>
      <div class="concept-hook">${c.hook}</div>
      ${c.primaryCopy ? `<div class="concept-copy">${c.primaryCopy}${c.secondaryCopy ? '<br><br>' + c.secondaryCopy : ''}</div>` : ''}
      <div class="concept-formats">
        ${(c.adFormats || ['static_image']).map(f => `<span>${f.replace(/_/g, ' ')}</span>`).join('')}
        <span>CTA: ${c.cta || 'Shop Now'}</span>
      </div>
      ${(typeof c.ugcScript === 'string' && c.ugcScript.length > 0) ? `
      <details>
        <summary class="concept-script-toggle">📹 View UGC Script</summary>
        <div class="concept-script">${c.ugcScript
          .replace(/\[HOOK/g, '\n[HOOK')
          .replace(/\[ADDRESS/g, '\n\n[ADDRESS')
          .replace(/\[STORY/g, '\n\n[STORY')
          .replace(/\[PROOF/g, '\n\n[PROOF')
          .replace(/\[CTA/g, '\n\n[CTA')
          .replace(/\[BUILD/g, '\n\n[BUILD')
          .replace(/\[REVEAL/g, '\n\n[REVEAL')
          .replace(/\[RELATE/g, '\n\n[RELATE')
          .replace(/\[RESOLVE/g, '\n\n[RESOLVE')
          .replace(/\[PAYOFF/g, '\n\n[PAYOFF')
          .trim()}</div>
      </details>
      ` : ''}
    </div>
  `).join('')}

  </div>

  <div class="footer">
    <div class="footer-logo">The Bridge Service</div>
    <p>Generated on ${new Date(report.minedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    <p style="margin-top:8px"><a href="https://smashed.agency/scan">smashed.agency/scan</a> · Confidential Client Report</p>
  </div>
</body>
</html>
  `.trim();
}
