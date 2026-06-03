/**
 * Cohort LTV Analyzer — formatted text & HTML output
 */

import type { CohortLTVAnalysis, ClientCohortLTVReport } from './types.js';
import type { ServiceClient } from '../service-clients.js';

// ============ FORMATTED OUTPUT ============

export function formatCohortLTVReport(analysis: CohortLTVAnalysis): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('                    COHORT LTV ANALYSIS');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(`Period: ${analysis.period}`);
  lines.push(`Total Orders: ${analysis.totalOrders.toLocaleString()}`);
  lines.push(`Total Customers: ${analysis.totalCustomers.toLocaleString()}`);
  lines.push(`Total Revenue: ₹${Math.round(analysis.totalRevenue).toLocaleString()}`);
  lines.push(`Avg LTV: ₹${Math.round(analysis.avgAccountLTV).toLocaleString()}`);
  lines.push(`Repeat Rate: ${analysis.avgRepeatRate.toFixed(1)}%`);
  lines.push(`Attribution Rate: ${analysis.attributionRate.toFixed(1)}%`);
  lines.push(`Data Quality: ${analysis.dataQuality.toUpperCase()}`);
  lines.push('');

  // Channel breakdown
  lines.push('┌────────────────────────────────────────────────────────────────┐');
  lines.push('│                    LTV BY CHANNEL                              │');
  lines.push('├────────────────────────────────────────────────────────────────┤');
  lines.push('');
  lines.push('Channel'.padEnd(20) + 'Customers'.padStart(10) + 'Avg LTV'.padStart(12) + 'Repeat %'.padStart(10) + 'vs Avg'.padStart(10));
  lines.push('-'.repeat(62));

  for (const channel of analysis.channels) {
    const vsAvg = channel.ltvVsAverage > 0 ? `+${channel.ltvVsAverage.toFixed(0)}%` : `${channel.ltvVsAverage.toFixed(0)}%`;
    lines.push(
      channel.displayName.slice(0, 19).padEnd(20) +
      channel.customers.toString().padStart(10) +
      ('₹' + Math.round(channel.avgLTV).toLocaleString()).padStart(12) +
      (channel.repeatRate.toFixed(0) + '%').padStart(10) +
      vsAvg.padStart(10)
    );
  }

  lines.push('');
  lines.push('└────────────────────────────────────────────────────────────────┘');
  lines.push('');

  // Best vs Worst
  if (analysis.bestChannel && analysis.worstChannel && analysis.bestChannel.channel !== analysis.worstChannel.channel) {
    lines.push('KEY INSIGHT:');
    const diff = analysis.bestChannel.avgLTV - analysis.worstChannel.avgLTV;
    lines.push(`  ${analysis.bestChannel.displayName} customers worth ₹${Math.round(diff).toLocaleString()} more than ${analysis.worstChannel.displayName}`);
    lines.push('');
  }

  // Monthly cohorts
  if (analysis.monthlyCohorts.length > 0) {
    lines.push('MONTHLY COHORTS:');
    lines.push('Month'.padEnd(10) + 'New'.padStart(8) + 'Revenue'.padStart(15) + 'Avg LTV'.padStart(12) + 'Repeat'.padStart(8));
    lines.push('-'.repeat(53));

    for (const cohort of analysis.monthlyCohorts.slice(-6)) { // Last 6 months
      lines.push(
        cohort.month.padEnd(10) +
        cohort.newCustomers.toString().padStart(8) +
        ('₹' + Math.round(cohort.totalRevenue).toLocaleString()).padStart(15) +
        ('₹' + Math.round(cohort.avgLTV).toLocaleString()).padStart(12) +
        (cohort.repeatRate.toFixed(0) + '%').padStart(8)
      );
    }
    lines.push('');
  }

  // LTV Gap
  if (analysis.ltvGap > 0) {
    lines.push('LTV OPPORTUNITY:');
    lines.push(`  Gap: ₹${Math.round(analysis.ltvGap).toLocaleString()}`);
    lines.push(`  ${analysis.ltvGapExplanation}`);
    lines.push('');
  }

  // Recommendations
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('                      RECOMMENDATIONS');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  for (const rec of analysis.recommendations) {
    lines.push(rec);
    lines.push('');
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`Analyzed at: ${new Date(analysis.analyzedAt).toLocaleString()}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate Smashed-branded HTML report for Cohort LTV
 */
export function generateCohortLTVHTMLReport(report: ClientCohortLTVReport, client: ServiceClient): string {
  const channels = report.channels || [];
  const cohorts = report.monthlyCohorts || [];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cohort LTV Report - ${client.brandName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e5e5e5; line-height: 1.6; }
    .container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }
    .header { text-align: center; padding: 60px 20px; background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%); border-bottom: 1px solid #333; }
    .logo { font-size: 14px; color: #EC8A23; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 20px; }
    h1 { font-size: 42px; font-weight: 700; background: linear-gradient(90deg, #EC8A23, #f5a623); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 16px; }
    .subtitle { font-size: 18px; color: #888; }
    .meta { margin-top: 30px; display: flex; justify-content: center; gap: 40px; flex-wrap: wrap; }
    .meta-item { text-align: center; }
    .meta-value { font-size: 32px; font-weight: 700; color: #EC8A23; }
    .meta-label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px; }
    .section { padding: 60px 0; border-bottom: 1px solid #222; }
    .section-title { font-size: 28px; font-weight: 600; margin-bottom: 40px; display: flex; align-items: center; gap: 12px; }
    .section-title::before { content: ''; width: 4px; height: 28px; background: #EC8A23; border-radius: 2px; }
    .channels-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 24px; }
    .channel-card { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; }
    .channel-card.best { border-left: 4px solid #22c55e; }
    .channel-card.worst { border-left: 4px solid #ef4444; }
    .channel-name { font-size: 18px; font-weight: 600; color: #fff; margin-bottom: 16px; }
    .channel-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .stat { background: #1a1a1a; padding: 12px; border-radius: 8px; }
    .stat-value { font-size: 20px; font-weight: 700; color: #EC8A23; }
    .stat-label { font-size: 11px; color: #666; text-transform: uppercase; }
    .gap-card { background: linear-gradient(135deg, #1a1a1a 0%, #151515 100%); border: 1px solid #EC8A23; border-radius: 12px; padding: 32px; text-align: center; margin: 40px 0; }
    .gap-value { font-size: 64px; font-weight: 700; color: #EC8A23; }
    .gap-label { font-size: 18px; color: #888; margin-top: 8px; }
    .recommendations { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; }
    .rec-item { padding: 12px 0; border-bottom: 1px solid #2a2a2a; color: #aaa; }
    .rec-item:last-child { border-bottom: none; }
    .footer { text-align: center; padding: 60px 20px; color: #666; }
    .footer-logo { font-size: 14px; color: #EC8A23; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 12px; }
    .footer a { color: #EC8A23; text-decoration: none; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">The Bridge Service · Smashed Agency</div>
    <h1>Cohort LTV Analysis</h1>
    <div class="subtitle">${client.brandName} — ${report.daysAnalyzed} Day Analysis</div>
    <div class="meta">
      <div class="meta-item">
        <div class="meta-value">₹${Math.round(report.avgAccountLTV).toLocaleString('en-IN')}</div>
        <div class="meta-label">Average LTV</div>
      </div>
      <div class="meta-item">
        <div class="meta-value">${report.totalCustomers.toLocaleString('en-IN')}</div>
        <div class="meta-label">Total Customers</div>
      </div>
      <div class="meta-item">
        <div class="meta-value">${Math.round(report.avgRepeatRate)}%</div>
        <div class="meta-label">Repeat Rate</div>
      </div>
      <div class="meta-item">
        <div class="meta-value">${Math.round(report.attributionRate)}%</div>
        <div class="meta-label">Attribution Rate</div>
      </div>
    </div>
  </div>

  <div class="container">
    <div class="gap-card">
      <div class="gap-value">₹${Math.round(report.ltvGap).toLocaleString('en-IN')}</div>
      <div class="gap-label">${report.ltvGapExplanation}</div>
    </div>

    <div class="section">
      <h2 class="section-title">Channel Performance</h2>
      <div class="channels-grid">
        ${channels.map(ch => `
          <div class="channel-card ${ch === report.bestChannel ? 'best' : ch === report.worstChannel ? 'worst' : ''}">
            <div class="channel-name">${ch.displayName}</div>
            <div class="channel-stats">
              <div class="stat">
                <div class="stat-value">₹${Math.round(ch.avgLTV).toLocaleString('en-IN')}</div>
                <div class="stat-label">Avg LTV</div>
              </div>
              <div class="stat">
                <div class="stat-value">${ch.customers.toLocaleString('en-IN')}</div>
                <div class="stat-label">Customers</div>
              </div>
              <div class="stat">
                <div class="stat-value">${Math.round(ch.repeatRate)}%</div>
                <div class="stat-label">Repeat Rate</div>
              </div>
              <div class="stat">
                <div class="stat-value">${ch.avgOrdersPerCustomer.toFixed(1)}</div>
                <div class="stat-label">Orders/Customer</div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    ${report.recommendations.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Recommendations</h2>
      <div class="recommendations">
        ${report.recommendations.map(r => `<div class="rec-item">→ ${r}</div>`).join('')}
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
