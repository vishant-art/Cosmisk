/**
 * Client Report Generator
 *
 * This is what CLIENTS actually see.
 * Takes output from all cognitive systems and transforms it into
 * readable, actionable reports.
 *
 * Delivery channels:
 * 1. WhatsApp/Slack alerts - immediate, high-priority findings
 * 2. HTML reports - detailed analysis, branded, emailed
 * 3. Weekly briefings - aggregated summaries
 */

import { type InvestigationResult, type ConfidenceLevel } from './recursive-investigator.js';
import { type HypothesisEvaluationResult } from './competing-hypotheses.js';
import { type CausalAnalysisResult } from './causal-intelligence.js';
import { type CuriosityScanResult, type Discovery } from './strategic-curiosity.js';

// ============================================================================
// Types
// ============================================================================

export interface ClientReport {
  clientName: string;
  reportDate: Date;
  reportType: 'daily_alert' | 'weekly_briefing' | 'deep_analysis';

  // Executive summary - what founders read first
  executiveSummary: {
    headline: string;
    keyFindings: string[];
    bottomLine: string;
    urgentActions: string[];
  };

  // Detailed sections
  sections: ReportSection[];

  // Action items
  actionItems: ActionItem[];

  // Confidence and caveats
  confidence: ConfidenceLevel;
  caveats: string[];
}

export interface ReportSection {
  title: string;
  content: string[];
  highlight: 'positive' | 'negative' | 'neutral' | 'warning';
  metric?: {
    name: string;
    value: string;
    change: string;
    direction: 'up' | 'down' | 'stable';
  };
}

export interface ActionItem {
  priority: 'immediate' | 'this_week' | 'monitor';
  action: string;
  why: string;
  expectedOutcome: string;
  owner?: string;
}

// ============================================================================
// Report Generator
// ============================================================================

export class ClientReportGenerator {
  constructor(
    private clientName: string,
    private brandingColor: string = '#FF6B35', // Smashed Agency orange
  ) {}

  /**
   * Generate a client report from cognitive system outputs
   */
  generateReport(
    type: 'daily_alert' | 'weekly_briefing' | 'deep_analysis',
    inputs: {
      investigation?: InvestigationResult;
      hypotheses?: HypothesisEvaluationResult;
      causalAnalysis?: CausalAnalysisResult;
      curiosityScan?: CuriosityScanResult;
    }
  ): ClientReport {
    const sections: ReportSection[] = [];
    const actionItems: ActionItem[] = [];
    const keyFindings: string[] = [];
    const urgentActions: string[] = [];
    let overallConfidence: ConfidenceLevel = 'moderate_evidence';

    // Process investigation results
    if (inputs.investigation?.rootCause) {
      const inv = inputs.investigation;
      keyFindings.push(inv.summary.headline);

      sections.push({
        title: 'Root Cause Analysis',
        content: inv.summary.explanation,
        highlight: 'warning',
      });

      actionItems.push({
        priority: 'this_week',
        action: inv.summary.recommendation,
        why: inv.rootCause?.strategicImplication || inv.summary.explanation[0],
        expectedOutcome: inv.summary.watchFor,
      });

      overallConfidence = inv.summary.confidence;
    }

    // Process hypothesis evaluation
    if (inputs.hypotheses) {
      const hyp = inputs.hypotheses;
      keyFindings.push(hyp.operatorSummary.headline);

      sections.push({
        title: 'What We Think Is Happening',
        content: [
          hyp.operatorSummary.primaryExplanation,
          hyp.operatorSummary.alternativeExplanation || '',
        ].filter(Boolean),
        highlight: hyp.conclusion.convergenceAchieved ? 'neutral' : 'warning',
      });

      if (!hyp.conclusion.convergenceAchieved) {
        actionItems.push({
          priority: 'this_week',
          action: hyp.conclusion.recommendedInvestigation,
          why: 'Need to narrow down between competing explanations',
          expectedOutcome: 'Clearer understanding of root cause',
        });
      }
    }

    // Process causal analysis
    if (inputs.causalAnalysis) {
      const causal = inputs.causalAnalysis;

      if (causal.summary.feedbackLoopWarning) {
        keyFindings.push(causal.summary.feedbackLoopWarning);
        urgentActions.push(causal.summary.primaryIntervention);

        sections.push({
          title: 'Feedback Loop Detected',
          content: [
            causal.summary.feedbackLoopWarning,
            `Causal chain: ${causal.summary.causalChain}`,
          ],
          highlight: 'negative',
        });

        actionItems.push({
          priority: 'immediate',
          action: causal.summary.primaryIntervention,
          why: 'Breaking this loop is urgent before it accelerates further',
          expectedOutcome: causal.summary.watchFor,
        });
      }
    }

    // Process curiosity scan discoveries
    if (inputs.curiosityScan) {
      const scan = inputs.curiosityScan;
      const actionableDiscoveries = scan.topDiscoveries.filter(d => d.actionable);

      if (actionableDiscoveries.length > 0) {
        keyFindings.push(scan.summary.headline);

        for (const discovery of actionableDiscoveries.slice(0, 3)) {
          sections.push({
            title: this.formatDiscoveryTitle(discovery),
            content: [
              discovery.finding,
              `Potential impact: ₹${(discovery.potentialImpact / 100000).toFixed(1)}L/month`,
            ],
            highlight: discovery.potentialImpact > 200000 ? 'positive' : 'neutral',
            metric: {
              name: 'Potential Monthly Impact',
              value: `₹${(discovery.potentialImpact / 100000).toFixed(1)}L`,
              change: 'opportunity',
              direction: 'up',
            },
          });

          actionItems.push({
            priority: discovery.potentialImpact > 200000 ? 'this_week' : 'monitor',
            action: discovery.recommendation,
            why: discovery.finding,
            expectedOutcome: `₹${(discovery.potentialImpact / 100000).toFixed(1)}L/month improvement`,
          });
        }
      }
    }

    // Build executive summary
    const executiveSummary = {
      headline: this.buildHeadline(keyFindings, urgentActions),
      keyFindings: keyFindings.slice(0, 4),
      bottomLine: this.buildBottomLine(actionItems, overallConfidence),
      urgentActions: urgentActions.slice(0, 2),
    };

    // Build caveats
    const caveats = this.buildCaveats(inputs, overallConfidence);

    return {
      clientName: this.clientName,
      reportDate: new Date(),
      reportType: type,
      executiveSummary,
      sections,
      actionItems,
      confidence: overallConfidence,
      caveats,
    };
  }

  /**
   * Format discovery into readable title
   */
  private formatDiscoveryTitle(discovery: Discovery): string {
    const icons: Record<string, string> = {
      'unexpected_high': '📈 Opportunity Found',
      'unexpected_low': '📉 Issue Identified',
      'contradiction': '⚠️ Contradiction Detected',
      'pattern_break': '🔔 Pattern Change',
    };

    return icons[discovery.anomalyId.split('_')[1]] || '💡 Finding';
  }

  /**
   * Build the main headline
   */
  private buildHeadline(keyFindings: string[], urgentActions: string[]): string {
    if (urgentActions.length > 0) {
      return `Action Required: ${urgentActions[0]}`;
    }
    if (keyFindings.length > 0) {
      return keyFindings[0];
    }
    return 'Your performance analysis is ready.';
  }

  /**
   * Build the bottom line summary
   */
  private buildBottomLine(actionItems: ActionItem[], confidence: ConfidenceLevel): string {
    const immediateCount = actionItems.filter(a => a.priority === 'immediate').length;
    const weekCount = actionItems.filter(a => a.priority === 'this_week').length;

    if (immediateCount > 0) {
      return `${immediateCount} urgent action${immediateCount > 1 ? 's' : ''} needed. ${weekCount} additional items for this week.`;
    }
    if (weekCount > 0) {
      return `${weekCount} action item${weekCount > 1 ? 's' : ''} to address this week. No urgent issues detected.`;
    }
    return 'No immediate action required. Continue monitoring.';
  }

  /**
   * Build confidence caveats
   */
  private buildCaveats(
    inputs: {
      investigation?: InvestigationResult;
      hypotheses?: HypothesisEvaluationResult;
      causalAnalysis?: CausalAnalysisResult;
      curiosityScan?: CuriosityScanResult;
    },
    confidence: ConfidenceLevel
  ): string[] {
    const caveats: string[] = [];

    if (confidence === 'early_signal' || confidence === 'weak_hypothesis') {
      caveats.push('This analysis is based on early signals. Conclusions may change as more data arrives.');
    }

    if (inputs.hypotheses && !inputs.hypotheses.conclusion.convergenceAchieved) {
      caveats.push('Multiple explanations remain plausible. We recommend further investigation before major changes.');
    }

    if (inputs.causalAnalysis?.model.hiddenVariables.length) {
      caveats.push('Hidden factors may be influencing outcomes in ways we cannot directly measure.');
    }

    if (inputs.curiosityScan?.summary.uncertainties.length) {
      caveats.push(inputs.curiosityScan.summary.uncertainties[0]);
    }

    return caveats;
  }

  /**
   * Generate HTML report for email delivery
   */
  toHTML(report: ClientReport): string {
    const confidenceColors: Record<ConfidenceLevel, string> = {
      'clear_evidence': '#22c55e',
      'strong_signal': '#84cc16',
      'moderate_evidence': '#eab308',
      'early_signal': '#f97316',
      'weak_hypothesis': '#ef4444',
      'insufficient_data': '#6b7280',
    };

    const highlightColors = {
      positive: '#dcfce7',
      negative: '#fee2e2',
      warning: '#fef3c7',
      neutral: '#f3f4f6',
    };

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Performance Intelligence Report - ${report.clientName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 700px; margin: 0 auto; padding: 20px; }
    .header { border-bottom: 3px solid ${this.brandingColor}; padding-bottom: 20px; margin-bottom: 30px; }
    .logo { color: ${this.brandingColor}; font-weight: bold; font-size: 14px; }
    .headline { font-size: 24px; font-weight: 600; margin: 20px 0 10px; }
    .date { color: #6b7280; font-size: 14px; }
    .summary-box { background: #f9fafb; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .key-finding { padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .key-finding:last-child { border-bottom: none; }
    .urgent { background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0; }
    .section { margin: 30px 0; padding: 20px; border-radius: 8px; }
    .section-title { font-size: 18px; font-weight: 600; margin-bottom: 12px; }
    .metric { display: inline-block; background: white; padding: 8px 16px; border-radius: 6px; margin-top: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .metric-value { font-size: 20px; font-weight: 600; color: ${this.brandingColor}; }
    .action-item { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 12px 0; }
    .action-priority { font-size: 12px; text-transform: uppercase; font-weight: 600; padding: 4px 8px; border-radius: 4px; display: inline-block; margin-bottom: 8px; }
    .priority-immediate { background: #fef2f2; color: #dc2626; }
    .priority-this_week { background: #fefce8; color: #ca8a04; }
    .priority-monitor { background: #f0fdf4; color: #16a34a; }
    .confidence { display: flex; align-items: center; gap: 8px; margin: 20px 0; padding: 12px; background: #f9fafb; border-radius: 6px; }
    .confidence-dot { width: 12px; height: 12px; border-radius: 50%; }
    .caveats { font-size: 14px; color: #6b7280; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">SMASHED AGENCY</div>
    <div class="date">${report.reportDate.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
    <h1 class="headline">${report.executiveSummary.headline}</h1>
  </div>

  <div class="summary-box">
    <strong>Key Findings:</strong>
    ${report.executiveSummary.keyFindings.map(f => `<div class="key-finding">• ${f}</div>`).join('')}
  </div>

  ${report.executiveSummary.urgentActions.length > 0 ? `
  <div class="urgent">
    <strong>⚡ Urgent Action Required:</strong><br>
    ${report.executiveSummary.urgentActions.join('<br>')}
  </div>
  ` : ''}

  ${report.sections.map(section => `
  <div class="section" style="background: ${highlightColors[section.highlight]}">
    <div class="section-title">${section.title}</div>
    ${section.content.map(c => `<p>${c}</p>`).join('')}
    ${section.metric ? `
    <div class="metric">
      <div style="font-size: 12px; color: #6b7280;">${section.metric.name}</div>
      <div class="metric-value">${section.metric.value}</div>
    </div>
    ` : ''}
  </div>
  `).join('')}

  <h2 style="margin-top: 40px;">Action Items</h2>
  ${report.actionItems.map(item => `
  <div class="action-item">
    <span class="action-priority priority-${item.priority}">${item.priority.replace('_', ' ')}</span>
    <div style="font-weight: 600; margin-bottom: 8px;">${item.action}</div>
    <div style="font-size: 14px; color: #6b7280;">
      <strong>Why:</strong> ${item.why}<br>
      <strong>Expected outcome:</strong> ${item.expectedOutcome}
    </div>
  </div>
  `).join('')}

  <div class="confidence">
    <span class="confidence-dot" style="background: ${confidenceColors[report.confidence]}"></span>
    <span><strong>Confidence:</strong> ${this.formatConfidence(report.confidence)}</span>
  </div>

  ${report.caveats.length > 0 ? `
  <div class="caveats">
    <strong>Important Notes:</strong>
    <ul>
      ${report.caveats.map(c => `<li>${c}</li>`).join('')}
    </ul>
  </div>
  ` : ''}

  <div class="footer">
    <div style="margin-bottom: 8px;">Generated by Cosmisk Intelligence Engine</div>
    <div>Questions? Reply to this email or message us on WhatsApp.</div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Generate WhatsApp/Slack message format
   */
  toWhatsApp(report: ClientReport): string {
    const lines: string[] = [];

    // Header
    lines.push(`🔔 *${report.clientName} - Performance Alert*`);
    lines.push(`📅 ${report.reportDate.toLocaleDateString('en-IN')}`);
    lines.push('');

    // Headline
    lines.push(`*${report.executiveSummary.headline}*`);
    lines.push('');

    // Urgent actions first
    if (report.executiveSummary.urgentActions.length > 0) {
      lines.push('⚡ *URGENT:*');
      report.executiveSummary.urgentActions.forEach(a => lines.push(`→ ${a}`));
      lines.push('');
    }

    // Key findings
    lines.push('📊 *Key Findings:*');
    report.executiveSummary.keyFindings.forEach(f => lines.push(`• ${f}`));
    lines.push('');

    // Top action items
    const topActions = report.actionItems.filter(a => a.priority !== 'monitor').slice(0, 3);
    if (topActions.length > 0) {
      lines.push('✅ *Action Items:*');
      topActions.forEach(a => {
        const emoji = a.priority === 'immediate' ? '🔴' : '🟡';
        lines.push(`${emoji} ${a.action}`);
      });
      lines.push('');
    }

    // Bottom line
    lines.push(`💡 *Bottom Line:* ${report.executiveSummary.bottomLine}`);
    lines.push('');
    lines.push('_Reply "details" for full report_');

    return lines.join('\n');
  }

  /**
   * Format confidence level for display
   */
  private formatConfidence(confidence: ConfidenceLevel): string {
    const labels: Record<ConfidenceLevel, string> = {
      'clear_evidence': 'High - Clear evidence supports this analysis',
      'strong_signal': 'Good - Strong signals point in this direction',
      'moderate_evidence': 'Moderate - Evidence is suggestive but not conclusive',
      'early_signal': 'Early - Based on emerging patterns, may change',
      'weak_hypothesis': 'Low - Speculative, needs more data',
      'insufficient_data': 'Unknown - Not enough data to assess',
    };
    return labels[confidence];
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

export function generateClientReport(
  clientName: string,
  inputs: {
    investigation?: InvestigationResult;
    hypotheses?: HypothesisEvaluationResult;
    causalAnalysis?: CausalAnalysisResult;
    curiosityScan?: CuriosityScanResult;
  },
  type: 'daily_alert' | 'weekly_briefing' | 'deep_analysis' = 'daily_alert'
): ClientReport {
  const generator = new ClientReportGenerator(clientName);
  return generator.generateReport(type, inputs);
}

export function reportToHTML(report: ClientReport, brandingColor?: string): string {
  const generator = new ClientReportGenerator(report.clientName, brandingColor);
  return generator.toHTML(report);
}

export function reportToWhatsApp(report: ClientReport): string {
  const generator = new ClientReportGenerator(report.clientName);
  return generator.toWhatsApp(report);
}
