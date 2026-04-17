/**
 * Output Generator - Converts audit results to Markdown
 */

import type { AuditOutput, CreativePerformance } from './types.js';

/**
 * Generate markdown report from audit output
 */
export function generateMarkdown(audit: AuditOutput): string {
  const lines: string[] = [];

  // Header
  lines.push(`# ${audit.brandName} - Ad Account Audit`);
  lines.push('');
  lines.push(`> **Generated:** ${new Date(audit.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
  lines.push(`> **Period:** ${audit.dateRange.start} to ${audit.dateRange.end}`);
  lines.push(`> **Confidence:** ${audit.confidence.level.toUpperCase()} - ${audit.confidence.reason}`);
  lines.push('');

  // Health Score Visual
  lines.push('---');
  lines.push('## Health Score');
  lines.push('');
  lines.push(generateHealthScoreVisual(audit.summary.healthScore));
  lines.push('');

  // Quick Stats
  lines.push('### Quick Stats');
  lines.push('');
  lines.push('| Metric | Value | Status |');
  lines.push('|--------|-------|--------|');
  lines.push(`| Health Score | ${audit.summary.healthScore}/100 | ${getHealthEmoji(audit.summary.healthScore)} |`);
  lines.push(`| Wasted Spend | ₹${formatNumber(audit.summary.wastedSpend)} | ${audit.summary.wastedSpend > 10000 ? '🔴' : audit.summary.wastedSpend > 5000 ? '🟡' : '🟢'} |`);
  lines.push(`| Best CPA | ₹${formatNumber(audit.summary.bestCpa)} | ${audit.summary.bestCpa > 0 ? '🟢' : '⚪'} |`);
  lines.push(`| Winners | ${audit.creativeAnalysis.winners.length} creatives | ${audit.creativeAnalysis.winners.length > 2 ? '🟢' : '🟡'} |`);
  lines.push(`| Losers | ${audit.creativeAnalysis.losers.length} creatives | ${audit.creativeAnalysis.losers.length > 3 ? '🔴' : '🟢'} |`);
  lines.push('');

  // Comparison with Previous Audit (if available)
  if (audit.comparison) {
    lines.push('### Comparison vs Previous Audit');
    lines.push('');
    lines.push(`*Comparing to audit from ${new Date(audit.comparison.previousAuditDate).toLocaleDateString('en-IN')}*`);
    lines.push('');

    // Trend indicator
    const trendEmoji = audit.comparison.overallTrend === 'improving' ? '📈' :
      audit.comparison.overallTrend === 'declining' ? '📉' : '➡️';
    const trendLabel = audit.comparison.overallTrend === 'improving' ? 'IMPROVING' :
      audit.comparison.overallTrend === 'declining' ? 'NEEDS ATTENTION' : 'STABLE';
    lines.push(`**Overall Trend:** ${trendEmoji} ${trendLabel}`);
    lines.push('');

    // Delta table
    lines.push('| Metric | Previous | Current | Change |');
    lines.push('|--------|----------|---------|--------|');

    const prevHealthScore = audit.summary.healthScore - audit.comparison.deltas.healthScore;
    lines.push(`| Health Score | ${prevHealthScore}/100 | ${audit.summary.healthScore}/100 | ${formatDelta(audit.comparison.deltas.healthScore, true)} |`);

    const prevWasted = audit.summary.wastedSpend - audit.comparison.deltas.wastedSpend;
    lines.push(`| Wasted Spend | ₹${formatNumber(prevWasted)} | ₹${formatNumber(audit.summary.wastedSpend)} | ${formatDelta(-audit.comparison.deltas.wastedSpend, true, '₹')} |`);

    const prevBestCpa = audit.summary.bestCpa - audit.comparison.deltas.bestCpa;
    if (prevBestCpa > 0 || audit.summary.bestCpa > 0) {
      lines.push(`| Best CPA | ₹${formatNumber(prevBestCpa)} | ₹${formatNumber(audit.summary.bestCpa)} | ${formatDelta(-audit.comparison.deltas.bestCpa, true, '₹')} |`);
    }

    const prevWinners = audit.creativeAnalysis.winners.length - audit.comparison.deltas.winnerCount;
    lines.push(`| Winners | ${prevWinners} | ${audit.creativeAnalysis.winners.length} | ${formatDelta(audit.comparison.deltas.winnerCount, true)} |`);

    const prevLosers = audit.creativeAnalysis.losers.length - audit.comparison.deltas.loserCount;
    lines.push(`| Losers | ${prevLosers} | ${audit.creativeAnalysis.losers.length} | ${formatDelta(-audit.comparison.deltas.loserCount, true)} |`);

    lines.push('');

    // Improvements
    if (audit.comparison.improvements.length > 0) {
      lines.push('**✅ Improvements:**');
      for (const improvement of audit.comparison.improvements) {
        lines.push(`- ${improvement}`);
      }
      lines.push('');
    }

    // Regressions
    if (audit.comparison.regressions.length > 0) {
      lines.push('**⚠️ Areas Needing Attention:**');
      for (const regression of audit.comparison.regressions) {
        lines.push(`- ${regression}`);
      }
      lines.push('');
    }
  }

  // Executive Summary
  lines.push('---');
  lines.push('## Executive Summary');
  lines.push('');

  // Top Priority Alert
  if (audit.summary.topPriority) {
    lines.push('```');
    lines.push(`🎯 TOP PRIORITY: ${audit.summary.topPriority}`);
    lines.push('```');
    lines.push('');
  }

  lines.push('### Key Findings');
  lines.push('');
  for (let i = 0; i < audit.summary.topFindings.length; i++) {
    lines.push(`${i + 1}. ${audit.summary.topFindings[i]}`);
  }
  lines.push('');

  // Creative Analysis
  lines.push('---');
  lines.push('## Creative Performance');
  lines.push('');

  // Winners
  lines.push('### ✅ Winners (Converting Creatives)');
  lines.push('');
  if (audit.creativeAnalysis.winners.length > 0) {
    lines.push('| # | Creative | Spend | Conv | CPA | ROAS | Why It Works |');
    lines.push('|---|----------|-------|------|-----|------|--------------|');
    audit.creativeAnalysis.winners.forEach((w, i) => {
      lines.push(`| ${i + 1} | ${truncate(w.creative.adName, 25)} | ₹${formatNumber(w.creative.spend)} | ${w.creative.purchases} | ₹${formatNumber(w.creative.cpa)} | ${w.creative.roas.toFixed(1)}x | ${truncate(w.whyItWorks, 35)} |`);
    });
  } else {
    lines.push('*No clear winners identified. Consider testing new creative concepts.*');
  }
  lines.push('');

  // Losers
  lines.push('### ❌ Losers (Underperforming Creatives)');
  lines.push('');
  if (audit.creativeAnalysis.losers.length > 0) {
    lines.push('| # | Creative | Spend | Conv | Issue | Action |');
    lines.push('|---|----------|-------|------|-------|--------|');
    audit.creativeAnalysis.losers.forEach((l, i) => {
      lines.push(`| ${i + 1} | ${truncate(l.creative.adName, 25)} | ₹${formatNumber(l.creative.spend)} | ${l.creative.purchases} | ${truncate(l.whyItFails, 25)} | ${truncate(l.recommendation, 20)} |`);
    });
  } else {
    lines.push('*No significant losers identified.*');
  }
  lines.push('');

  // Wasted Spend Section
  lines.push('### 💸 Wasted Spend Analysis');
  lines.push('');
  const wastedPercent = audit.summary.wastedSpend > 0 && audit.creativeAnalysis.wastedSpend.total > 0
    ? ((audit.creativeAnalysis.wastedSpend.total / (audit.creativeAnalysis.wastedSpend.total + (audit.summary.bestCpa * audit.creativeAnalysis.winners.reduce((sum, w) => sum + w.creative.purchases, 0)))) * 100).toFixed(1)
    : '0';

  lines.push(`**Total Wasted:** ₹${formatNumber(audit.creativeAnalysis.wastedSpend.total)}`);
  lines.push('');

  if (audit.creativeAnalysis.wastedSpend.creatives.length > 0) {
    lines.push('**Top Offenders:**');
    lines.push('');
    for (const c of audit.creativeAnalysis.wastedSpend.creatives.slice(0, 5)) {
      const bar = '█'.repeat(Math.min(10, Math.ceil(c.amount / 1000)));
      lines.push(`- ${truncate(c.adName, 35)}: ₹${formatNumber(c.amount)} ${bar}`);
    }
  }
  lines.push('');

  // Insights
  lines.push('---');
  lines.push('## Key Insights');
  lines.push('');

  // Group by severity
  const criticalInsights = audit.creativeAnalysis.insights.filter(i => i.severity === 'critical');
  const warningInsights = audit.creativeAnalysis.insights.filter(i => i.severity === 'warning');
  const infoInsights = audit.creativeAnalysis.insights.filter(i => i.severity === 'info');

  if (criticalInsights.length > 0) {
    lines.push('### 🚨 Critical Issues');
    lines.push('');
    for (const insight of criticalInsights) {
      lines.push(`**${insight.title}**`);
      lines.push('');
      lines.push(insight.detail);
      lines.push('');
    }
  }

  if (warningInsights.length > 0) {
    lines.push('### ⚠️ Warnings');
    lines.push('');
    for (const insight of warningInsights) {
      lines.push(`**${insight.title}**`);
      lines.push('');
      lines.push(insight.detail);
      lines.push('');
    }
  }

  if (infoInsights.length > 0) {
    lines.push('### ℹ️ Observations');
    lines.push('');
    for (const insight of infoInsights) {
      lines.push(`- **${insight.title}:** ${insight.detail}`);
    }
    lines.push('');
  }

  // Recommendations
  lines.push('---');
  lines.push('## Action Plan');
  lines.push('');

  const highPriority = audit.creativeAnalysis.recommendations.filter(r => r.priority === 'high');
  const mediumPriority = audit.creativeAnalysis.recommendations.filter(r => r.priority === 'medium');
  const lowPriority = audit.creativeAnalysis.recommendations.filter(r => r.priority === 'low');

  if (highPriority.length > 0) {
    lines.push('### 🔴 Do This Week');
    lines.push('');
    for (const rec of highPriority) {
      lines.push(`#### ${rec.title}`);
      lines.push('');
      lines.push(`- **What:** ${rec.description}`);
      lines.push(`- **Impact:** ${rec.expectedImpact}`);
      lines.push(`- **Effort:** ${rec.effort.charAt(0).toUpperCase() + rec.effort.slice(1)}`);
      lines.push('');
    }
  }

  if (mediumPriority.length > 0) {
    lines.push('### 🟡 Do This Month');
    lines.push('');
    for (const rec of mediumPriority) {
      lines.push(`- **${rec.title}:** ${rec.description}`);
      lines.push(`  - *Impact:* ${rec.expectedImpact}`);
    }
    lines.push('');
  }

  if (lowPriority.length > 0) {
    lines.push('### 🟢 Nice to Have');
    lines.push('');
    for (const rec of lowPriority) {
      lines.push(`- **${rec.title}:** ${rec.description}`);
    }
    lines.push('');
  }

  // Action Checklist
  lines.push('---');
  lines.push('## Action Checklist');
  lines.push('');
  lines.push('Use this checklist to track your progress:');
  lines.push('');

  let checklistIndex = 1;

  // Add high priority items
  for (const rec of highPriority) {
    lines.push(`- [ ] ${checklistIndex}. ${rec.title}`);
    checklistIndex++;
  }

  // Add pause losers action if there are losers
  if (audit.creativeAnalysis.losers.length > 0) {
    lines.push(`- [ ] ${checklistIndex}. Pause ${audit.creativeAnalysis.losers.length} underperforming creatives`);
    checklistIndex++;
  }

  // Add scale winners action if there are winners
  if (audit.creativeAnalysis.winners.length > 0) {
    lines.push(`- [ ] ${checklistIndex}. Scale budget on top ${Math.min(3, audit.creativeAnalysis.winners.length)} winners`);
    checklistIndex++;
  }

  // Add medium priority items
  for (const rec of mediumPriority.slice(0, 3)) {
    lines.push(`- [ ] ${checklistIndex}. ${rec.title}`);
    checklistIndex++;
  }

  lines.push('');

  // Footer
  lines.push('---');
  lines.push('');
  lines.push('*Generated by Adaptive Audit System | Cosmisk.ai*');
  lines.push('');
  lines.push(`*Audit ID: ${audit.auditId}*`);

  return lines.join('\n');
}

/**
 * Generate JSON output
 */
export function generateJSON(audit: AuditOutput): string {
  return JSON.stringify(audit, null, 2);
}

// ============ HELPERS ============

function formatNumber(num: number): string {
  if (num >= 100000) {
    return (num / 100000).toFixed(2) + ' lakh';
  }
  return num.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function truncate(str: string, maxLength: number): string {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

function getHealthEmoji(score: number): string {
  if (score >= 80) return '🟢 Excellent';
  if (score >= 60) return '🟡 Good';
  if (score >= 40) return '🟠 Needs Work';
  return '🔴 Critical';
}

function formatDelta(delta: number, positiveIsGood: boolean, prefix: string = ''): string {
  if (Math.abs(delta) < 0.01) return '—';

  const isPositive = delta > 0;
  const isGood = positiveIsGood ? isPositive : !isPositive;

  const arrow = isPositive ? '↑' : '↓';
  const emoji = isGood ? '🟢' : '🔴';
  const value = Math.abs(delta);

  return `${emoji} ${arrow}${prefix}${formatNumber(value)}`;
}

function generateHealthScoreVisual(score: number): string {
  const filled = Math.round(score / 10);
  const empty = 10 - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);

  let status: string;
  if (score >= 80) status = 'Excellent';
  else if (score >= 60) status = 'Good';
  else if (score >= 40) status = 'Needs Improvement';
  else status = 'Critical';

  return `\`\`\`
${bar} ${score}/100 - ${status}
\`\`\``;
}
