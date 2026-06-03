/* ------------------------------------------------------------------ */
/*  Smashed-branded HTML report for Creative Scorer                    */
/* ------------------------------------------------------------------ */

import type { ServiceClient } from '../service-clients.js';
import type { ClientCreativeScoreReport } from './types.js';

/**
 * Generate Smashed-branded HTML report for Creative Scorer
 */
export function generateCreativeScorerHTMLReport(report: ClientCreativeScoreReport, client: ServiceClient): string {
  const getScoreColor = (score: number) => {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#eab308';
    if (score >= 40) return '#f97316';
    return '#ef4444';
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Creative Scorer Report - ${client.brandName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e5e5e5; line-height: 1.6; }
    .container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }

    /* Header */
    .header { text-align: center; padding: 60px 20px; background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%); border-bottom: 1px solid #333; }
    .logo { font-size: 14px; color: #EC8A23; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 20px; }
    h1 { font-size: 42px; font-weight: 700; background: linear-gradient(90deg, #EC8A23, #f5a623); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 16px; }
    .subtitle { font-size: 18px; color: #888; }
    .avg-score { font-size: 72px; font-weight: 700; margin: 30px 0; }
    .threshold-info { font-size: 14px; color: #888; }
    .meta { margin-top: 30px; display: flex; justify-content: center; gap: 40px; flex-wrap: wrap; }
    .meta-item { text-align: center; }
    .meta-value { font-size: 32px; font-weight: 700; color: #EC8A23; }
    .meta-value.good { color: #22c55e; }
    .meta-value.bad { color: #ef4444; }
    .meta-label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px; }

    /* Sections */
    .section { padding: 60px 0; border-bottom: 1px solid #222; }
    .section-title { font-size: 28px; font-weight: 600; margin-bottom: 40px; display: flex; align-items: center; gap: 12px; }
    .section-title::before { content: ''; width: 4px; height: 28px; background: #EC8A23; border-radius: 2px; }

    /* Scores Grid */
    .scores-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 24px; }
    .score-card { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; }
    .score-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .score-format { font-size: 14px; color: #EC8A23; font-weight: 600; text-transform: uppercase; }
    .score-badge { width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700; color: #000; }
    .score-dimensions { margin-top: 16px; }
    .dimension { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #2a2a2a; }
    .dimension:last-child { border-bottom: none; }
    .dimension-label { font-size: 13px; color: #888; }
    .dimension-score { font-size: 14px; font-weight: 600; color: #EC8A23; }
    .score-insight { margin-top: 16px; padding: 12px; background: #1a1a1a; border-radius: 8px; font-size: 13px; color: #aaa; }
    .threshold-badge { font-size: 11px; padding: 4px 10px; border-radius: 20px; font-weight: 600; }
    .threshold-badge.pass { background: #22c55e; color: #000; }
    .threshold-badge.fail { background: #ef4444; color: #fff; }

    /* Patterns */
    .patterns-list { display: flex; flex-wrap: wrap; gap: 10px; }
    .pattern-tag { background: #2a2a2a; color: #EC8A23; padding: 8px 16px; border-radius: 20px; font-size: 13px; }

    /* Summary */
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; }
    .summary-card { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; text-align: center; }
    .summary-value { font-size: 36px; font-weight: 700; color: #EC8A23; margin-bottom: 8px; }
    .summary-label { font-size: 14px; color: #888; }

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
    <h1>Creative Scorer Report</h1>
    <div class="subtitle">${client.brandName} — ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
    <div class="avg-score" style="color: ${getScoreColor(report.summary.avgScore)}">${report.summary.avgScore}</div>
    <div class="threshold-info">Average Score (Threshold: ${report.scoreThreshold}+)</div>
    <div class="meta">
      <div class="meta-item">
        <div class="meta-value">${report.summary.totalScored}</div>
        <div class="meta-label">Creatives Scored</div>
      </div>
      <div class="meta-item">
        <div class="meta-value good">${report.summary.aboveThreshold}</div>
        <div class="meta-label">Above Threshold</div>
      </div>
      <div class="meta-item">
        <div class="meta-value bad">${report.summary.belowThreshold}</div>
        <div class="meta-label">Below Threshold</div>
      </div>
      <div class="meta-item">
        <div class="meta-value">${report.summary.topFormat}</div>
        <div class="meta-label">Top Format</div>
      </div>
    </div>
  </div>

  <div class="container">
    ${report.summary.winningPatterns.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Winning Patterns</h2>
      <div class="patterns-list">
        ${report.summary.winningPatterns.map(p => `<span class="pattern-tag">${p}</span>`).join('')}
      </div>
    </div>
    ` : ''}

    <div class="section">
      <h2 class="section-title">Creative Scores</h2>
      <div class="scores-grid">
        ${report.scores.map((s, i) => `
          <div class="score-card">
            <div class="score-header">
              <div>
                <span class="score-format">${s.input.format}</span>
                <span class="threshold-badge ${s.meetsThreshold ? 'pass' : 'fail'}" style="margin-left:8px;">
                  ${s.meetsThreshold ? 'PASS' : 'NEEDS WORK'}
                </span>
              </div>
              <div class="score-badge" style="background: ${getScoreColor(s.score.total)}">${s.score.total}</div>
            </div>
            <div class="score-dimensions">
              <div class="dimension">
                <span class="dimension-label">Pattern Match</span>
                <span class="dimension-score">${s.score.dimensions.patternMatch.score}/20</span>
              </div>
              <div class="dimension">
                <span class="dimension-label">Hook Quality</span>
                <span class="dimension-score">${s.score.dimensions.hookQuality.score}/20</span>
              </div>
              <div class="dimension">
                <span class="dimension-label">Format Signal</span>
                <span class="dimension-score">${s.score.dimensions.formatSignal.score}/20</span>
              </div>
              <div class="dimension">
                <span class="dimension-label">Data Confidence</span>
                <span class="dimension-score">${s.score.dimensions.dataConfidence.score}/20</span>
              </div>
              <div class="dimension">
                <span class="dimension-label">Novelty</span>
                <span class="dimension-score">${s.score.dimensions.novelty.score}/20</span>
              </div>
            </div>
            <div class="score-insight">${s.score.topInsight}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Summary</h2>
      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-value">${report.summary.avgScore}</div>
          <div class="summary-label">Average Score</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">${report.scoreThreshold}+</div>
          <div class="summary-label">Quality Threshold</div>
        </div>
        <div class="summary-card">
          <div class="summary-value" style="color: #22c55e">${Math.round((report.summary.aboveThreshold / report.summary.totalScored) * 100)}%</div>
          <div class="summary-label">Pass Rate</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">${report.summary.topFormat}</div>
          <div class="summary-label">Best Format</div>
        </div>
      </div>
    </div>

    ${report.shouldAlert ? `
    <div class="section">
      <h2 class="section-title">Recommendation</h2>
      <div style="background:#151515;border:1px solid #2a2a2a;border-left:4px solid #ef4444;border-radius:12px;padding:24px;">
        <div style="font-size:11px;color:#ef4444;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;font-weight:600;">Action Required</div>
        <div style="font-size:16px;color:#fff;margin-bottom:12px;">
          ${report.summary.belowThreshold} of ${report.summary.totalScored} creatives scored below the ${report.scoreThreshold} quality threshold for ${client.brandName}'s revenue level.
        </div>
        <div style="font-size:14px;color:#6ee7b7;">
          → Focus on ${report.summary.topFormat} format. Use winning patterns: ${report.summary.winningPatterns.slice(0, 3).join(', ')}.
        </div>
      </div>
    </div>
    ` : ''}
  </div>

  <div class="footer">
    <div class="footer-logo">The Bridge Service</div>
    <p>Generated on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    <p style="margin-top:8px"><a href="https://smashed.agency/scan">smashed.agency/scan</a> · Confidential Client Report</p>
  </div>
</body>
</html>`;
}
